// Doi chieu danh sach ma CTV (sale-code-lookup/codes.js) voi thanh vien cua cac don vi ORG_MANAGE
// (gom don vi con), xuat ra ctv-in-org.xlsx cung thu muc: CTV nao dang nam trong to chuc nao.
// Chi doc du lieu, khong thay doi gi tren he thong.
//
// Cach dung:
//   1. Dan Bearer token vao bien TOKEN ben duoi.
//   2. Chay: node scripts/ctv-in-org/run.js
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

import { SALE_CODES } from '../sale-code-lookup/codes.js';

// ===== CAU HINH =====
const TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJtZFZXUWZkTmdIYTI3YmVuRWFZb242NXhKbVlYTHBTM3A3Sk1YRm93R1VnIn0.eyJleHAiOjE3OTEyOTg2NDgsImlhdCI6MTc5MTE5MDY0OCwianRpIjoib2ZydHJvOmJkZTBmNjU5LWMxYTQtNGJhNC1hNzlhLWJkNTc3YTM4ZGUxOSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsudG5leC52bi9yZWFsbXMvdG5leC1zYWxlLWFwcCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJiMzk2MzYwZS0xNmM0LTQ3NTktODUyYi05YzFhMmZhZDFhZmUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0bmV4LXNhbGUtYXBwIiwic2lkIjoiMzRiMWNjYTEtODIwZC00ZDE2LThmYjctOWQ1NmY2MDJhZjIwIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiQ1RWIiwibWFuYWdlciIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXRuZXgtc2FsZS1hcHAiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIG9mZmxpbmVfYWNjZXNzIHByb2ZpbGUgZW1haWwgZHNfdXNlcl9pZCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJkc191c2VyX2lkIjpbIjVmODY5YTljLWU1MGEtNGE4Mi1iMjEyLTI2MDJiNjkzNmEyNCJdLCJuYW1lIjoiMDk0NjY3NzM1NyAwOTQ2Njc3MzU3IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMDk0NjY3NzM1NyIsImdpdmVuX25hbWUiOiIwOTQ2Njc3MzU3IiwiZmFtaWx5X25hbWUiOiIwOTQ2Njc3MzU3IiwiZW1haWwiOiIwOTQ2Njc3MzU3QHRuZXhmaW5hbmNlLmNvbS52biJ9.Vvf8TGeQvKw7IFMN-sW8Via9z20ojOPfFI9-BVQDunkH4nC-4amQl4t44jEKypAxtBL88obkhMzci4AsZNWg3uiZ9GJTBdOpbBzPxctBgbB2JajBogyCCXYAnjvsyYRFywhMWW_GZMZZcVP8IBKPw2O5TRxXW55lvEbs09LNeGUW9uwvQazMOPQ3u5aO7JzjdYKJd2BEu_2-DwHYzdbpCjc_7UMC8yeQX1Vov34i9Y9EfsYA6Ew1QVu9Fx4kzQPAPAr2DLGrrFOOggGrOPC_TGDmJ15KV1Gj5w_VB3NV3l2WQURHbuCPzDw2f6yKigUni3ddMNl7-oemYJ4jOMpwbg';
const ORG_TYPE = 'ORG_MANAGE';
const DELAY_MS = 500; // nghi giua 2 request, tranh spam API
const PAGE_SIZE = 50;
const MAX_PAGES = 50;
// ====================

const OUTPUT_FILE = fileURLToPath(new URL('./ctv-in-org.xlsx', import.meta.url));
const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const ORG_UNITS_PATH = '/digital-sale-admin/api/v1/admin/org-units';
const ORG_UNIT_USERS_PATH = '/digital-sale-admin/api/v1/admin/org-units/users';

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
    throw new Error(`HTTP ${response.status} khi goi ${path}: ${data?.message || data?.error || 'khong ro loi'}`);
  }

  return data;
}

function extractOrgUnits(payload) {
  const list = payload?.data ?? payload;

  return Array.isArray(list) ? list : [];
}

function extractUsersPage(payload) {
  const users =
    payload?.data?.users ??
    payload?.data?.content ??
    payload?.data?.items ??
    payload?.data?.records ??
    payload?.users ??
    payload?.content ??
    [];
  const pagination = payload?.data?.pagination ?? payload?.pagination ?? {};

  return {
    users: Array.isArray(users) ? users : [],
    totalPages: Number(pagination.totalPages) || 0,
  };
}

async function fetchAllMembers(orgUnitId) {
  const members = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await callApi(ORG_UNIT_USERS_PATH, {
      method: 'POST',
      body: {
        filter: { orgUnitId, userId: '', saleId: '', name: '', phone: '', roleName: '' },
        page,
        size: PAGE_SIZE,
      },
    });
    const { users, totalPages } = extractUsersPage(payload);

    members.push(...users);

    if (users.length === 0) break;
    if (totalPages && page + 1 >= totalPages) break;
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
  const sheet = workbook.addWorksheet('CTV trong ORG_MANAGE');

  sheet.columns = [
    { header: 'Mã CTV', key: 'code', width: 14 },
    { header: 'Họ tên', key: 'name', width: 32 },
    { header: 'Số điện thoại', key: 'phone', width: 16 },
    { header: 'Tổ chức ORG_MANAGE', key: 'orgName', width: 36 },
    { header: 'Mã tổ chức', key: 'orgCode', width: 16 },
    { header: 'Role', key: 'roleName', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  await workbook.xlsx.writeFile(OUTPUT_FILE);
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  const orgUnits = extractOrgUnits(await callApi(ORG_UNITS_PATH));
  const rootIds = new Set(orgUnits.filter((org) => org?.type === ORG_TYPE).map((org) => String(org.id)));
  const targetOrgs = orgUnits.filter(
    (org) => rootIds.has(String(org?.id ?? '')) || getPathIds(org?.path).some((id) => rootIds.has(id))
  );

  console.log(`Quét ${targetOrgs.length} đơn vị ${ORG_TYPE} (gồm đơn vị con).\n`);

  // Ma CTV (da chuan hoa) -> danh sach to chuc ma CTV do dang nam trong.
  const targetCodes = new Set(
    SALE_CODES.map((item) => normalizeSaleId(item.code)).filter((code) => code.startsWith('CTV'))
  );
  const hits = new Map();

  for (let i = 0; i < targetOrgs.length; i += 1) {
    const org = targetOrgs[i];
    const orgName = org.name || org.code || String(org.id);
    const members = await fetchAllMembers(org.id);
    let matched = 0;

    members.forEach((member) => {
      const code = normalizeSaleId(member?.saleId);

      if (!targetCodes.has(code)) return;

      matched += 1;
      if (!hits.has(code)) hits.set(code, []);
      hits.get(code).push({
        code: String(member.saleId).trim(),
        name: member?.name ?? member?.fullName ?? '',
        phone: member?.phoneNumber ?? member?.phone ?? '',
        orgName,
        orgCode: org.code ?? '',
        roleName: member?.roleName ?? '',
      });
    });

    console.log(`[${i + 1}/${targetOrgs.length}] ${orgName} -> ${members.length} thành viên, khớp ${matched} CTV`);

    if (i < targetOrgs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const rows = [...hits.values()]
    .flat()
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'vi') || a.code.localeCompare(b.code));

  await writeExcel(rows);

  console.log(`\nTìm thấy ${hits.size}/${targetCodes.size} mã CTV trong các đơn vị ${ORG_TYPE} (${rows.length} dòng).`);
  console.log(`Đã xuất file: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
