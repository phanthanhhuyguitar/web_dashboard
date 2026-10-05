// Tra cuu cac nhom ORG_MANAGE ma moi ma sale trong sale-code-lookup/codes.js dang thuoc ve,
// xuat ra code-org-groups.xlsx cung thu muc. Moi ma mot dong cho moi nhom; ma khong thuoc nhom nao ghi null.
// Thoi gian tham gia lay tu API chi tiet user (orgInfos[].createdAt, khop theo orgId = id nhom).
// Chi doc du lieu, khong thay doi gi tren he thong.
//
// Cach dung:
//   1. Dat bien moi truong: $env:TNEX_TOKEN = "<Bearer token>" (PowerShell)
//   2. Chay: node scripts/code-org-groups/run.js
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

import { SALE_CODES } from '../sale-code-lookup/codes.js';
import { DCH_MAPPING } from '../dch-mapping/mapping.js';

const TOKEN = process.env.TNEX_TOKEN;
const ORG_TYPE = 'ORG_MANAGE';
const DELAY_MS = 500;
const PAGE_SIZE = 50;
const MAX_PAGES = 50;
const NULL_TEXT = 'null';
const JOINED_AT_MISSING = 'Không có dữ liệu';
const CHANGED_CODE_BY_DCH = new Map(DCH_MAPPING.map(({ dch, newCode }) => [normalizeSaleId(dch), newCode]));

// Ma DCH duoc tra theo ma moi (CTV) sau khi doi ma; ma khac giu nguyen.
function lookupCodeOf(code) {
  return CHANGED_CODE_BY_DCH.get(normalizeSaleId(code)) ?? code;
}

const OUTPUT_FILE = fileURLToPath(new URL('./code-org-groups.xlsx', import.meta.url));
const BASE_URL = 'https://api-gw-ds.tnex.com.vn/digital-sale-admin/api/v1/admin';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callApi(path, { method = 'GET', body } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} khi gọi ${path}: ${data?.message || data?.error || 'không rõ lỗi'}`);
  }

  return data;
}

async function fetchAllMembers(orgUnitId) {
  const members = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await callApi('/org-units/users', {
      method: 'POST',
      body: {
        filter: { orgUnitId, userId: '', saleId: '', name: '', phone: '', roleName: '' },
        page,
        size: PAGE_SIZE,
      },
    });
    const users = Array.isArray(payload?.data?.users) ? payload.data.users : [];

    members.push(...users);

    if (users.length < PAGE_SIZE) break;

    await sleep(DELAY_MS);
  }

  return members;
}

function normalizeSaleId(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^DR/, '');
}

function getPathIds(path) {
  return String(path ?? '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function writeExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Nhóm ORG_MANAGE');

  sheet.columns = [
    { header: 'Mã sale', key: 'code', width: 14 },
    { header: 'Thời gian tham gia nhóm', key: 'joinedAt', width: 24 },
    { header: 'Tên nhóm ORG_MANAGE', key: 'groupName', width: 36 },
    { header: 'Mã nhóm ORG_MANAGE', key: 'groupCode', width: 20 },
    { header: 'Mã đã thay đổi', key: 'changedCode', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) =>
    sheet.addRow({ ...row, changedCode: CHANGED_CODE_BY_DCH.get(normalizeSaleId(row.code)) ?? '' })
  );

  await workbook.xlsx.writeFile(OUTPUT_FILE);
}

async function main() {
  if (!TOKEN) {
    console.error('Chưa set biến môi trường TNEX_TOKEN.');
    process.exitCode = 1;
    return;
  }

  const orgUnits = (await callApi('/org-units')).data ?? [];
  const groups = orgUnits.filter((org) => org?.type === ORG_TYPE);
  const groupIds = new Set(groups.map((group) => String(group.id)));
  const groupById = new Map(groups.map((group) => [String(group.id), group]));
  const targetCodes = new Set(SALE_CODES.map((item) => normalizeSaleId(lookupCodeOf(item.code))));

  // Ma sale (da chuan hoa) -> Map(id nhom ORG_MANAGE -> nhom).
  const hits = new Map();

  // Quet nhom ORG_MANAGE va don vi con cua chung; moi don vi gan vao nhom ORG_MANAGE gan nhat tren duong dan.
  const scanOrgs = orgUnits
    .map((org) => {
      const nearestGroupId = [...getPathIds(org.path), String(org.id)].filter((id) => groupIds.has(id)).pop();

      return { org, nearestGroupId };
    })
    .filter(({ nearestGroupId }) => nearestGroupId);

  console.log(`Quét ${scanOrgs.length} đơn vị thuộc ${groups.length} nhóm ${ORG_TYPE}.\n`);

  for (let i = 0; i < scanOrgs.length; i += 1) {
    const { org, nearestGroupId } = scanOrgs[i];
    const members = await fetchAllMembers(org.id);
    let matched = 0;

    members.forEach((member) => {
      const code = normalizeSaleId(member?.saleId);

      if (!targetCodes.has(code)) return;

      matched += 1;
      if (!hits.has(code)) hits.set(code, new Map());
      hits.get(code).set(nearestGroupId, { group: groupById.get(nearestGroupId), userId: member.userId });
    });

    console.log(`[${i + 1}/${scanOrgs.length}] ${org.name || org.code || org.id} -> khớp ${matched} mã`);

    if (i < scanOrgs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const userIds = new Set();
  hits.forEach((groupsOfCode) => groupsOfCode.forEach(({ userId }) => userIds.add(userId)));

  const orgInfosByUserId = new Map();

  const failedUserIds = [];

  for (const userId of userIds) {
    try {
      const profile = await callApi(`/users/profile?id=${encodeURIComponent(userId)}`);

      orgInfosByUserId.set(userId, Array.isArray(profile?.data?.orgInfos) ? profile.data.orgInfos : []);
    } catch (error) {
      failedUserIds.push(userId);
      console.log(`Không lấy được chi tiết userId ${userId}: ${error.message}`);
    }

    await sleep(DELAY_MS);
  }

  const rows = [];

  SALE_CODES.forEach(({ code }) => {
    const groupsOfCode = hits.get(normalizeSaleId(lookupCodeOf(code)));

    if (!groupsOfCode || groupsOfCode.size === 0) {
      rows.push({ code, joinedAt: NULL_TEXT, groupName: NULL_TEXT, groupCode: NULL_TEXT });
      return;
    }

    groupsOfCode.forEach(({ group, userId }) => {
      const orgInfo = orgInfosByUserId.get(userId)?.find((info) => String(info?.orgId) === String(group.id));

      rows.push({
        code,
        joinedAt: orgInfo?.createdAt || JOINED_AT_MISSING,
        groupName: group.name ?? '',
        groupCode: group.code ?? '',
      });
    });
  });

  await writeExcel(rows);

  const withGroup = SALE_CODES.filter(({ code }) => hits.has(normalizeSaleId(lookupCodeOf(code)))).length;

  console.log(`\nCó ${withGroup}/${SALE_CODES.length} mã thuộc ít nhất một nhóm (${rows.length} dòng).`);
  console.log(`Chi tiết lỗi: ${failedUserIds.length}/${userIds.size} userId không lấy được profile.`);
  console.log(`Đã xuất file: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
