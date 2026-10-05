// Liet ke ho ten, so dien thoai, ma sale cua user co role team lead thuoc cac don vi ORG_MANAGE
// va cac don vi con cua chung. Chi doc du lieu (GET/POST de lay), khong thay doi gi tren he thong.
//
// Cach dung:
//   1. Dan Bearer token (lay tu DevTools tren partner-admin.tnex.com.vn) vao bien TOKEN ben duoi.
//   2. Chay: node scripts/teamlead-by-org/run.js
//   Ket qua ghi ra file team-leads.xlsx cung thu muc.
'use strict';

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

// ===== CAU HINH =====
const TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJtZFZXUWZkTmdIYTI3YmVuRWFZb242NXhKbVlYTHBTM3A3Sk1YRm93R1VnIn0.eyJleHAiOjE3OTEyOTg2NDgsImlhdCI6MTc5MTE5MDY0OCwianRpIjoib2ZydHJvOmJkZTBmNjU5LWMxYTQtNGJhNC1hNzlhLWJkNTc3YTM4ZGUxOSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsudG5leC52bi9yZWFsbXMvdG5leC1zYWxlLWFwcCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJiMzk2MzYwZS0xNmM0LTQ3NTktODUyYi05YzFhMmZhZDFhZmUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0bmV4LXNhbGUtYXBwIiwic2lkIjoiMzRiMWNjYTEtODIwZC00ZDE2LThmYjctOWQ1NmY2MDJhZjIwIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiQ1RWIiwibWFuYWdlciIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXRuZXgtc2FsZS1hcHAiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIG9mZmxpbmVfYWNjZXNzIHByb2ZpbGUgZW1haWwgZHNfdXNlcl9pZCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJkc191c2VyX2lkIjpbIjVmODY5YTljLWU1MGEtNGE4Mi1iMjEyLTI2MDJiNjkzNmEyNCJdLCJuYW1lIjoiMDk0NjY3NzM1NyAwOTQ2Njc3MzU3IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMDk0NjY3NzM1NyIsImdpdmVuX25hbWUiOiIwOTQ2Njc3MzU3IiwiZmFtaWx5X25hbWUiOiIwOTQ2Njc3MzU3IiwiZW1haWwiOiIwOTQ2Njc3MzU3QHRuZXhmaW5hbmNlLmNvbS52biJ9.Vvf8TGeQvKw7IFMN-sW8Via9z20ojOPfFI9-BVQDunkH4nC-4amQl4t44jEKypAxtBL88obkhMzci4AsZNWg3uiZ9GJTBdOpbBzPxctBgbB2JajBogyCCXYAnjvsyYRFywhMWW_GZMZZcVP8IBKPw2O5TRxXW55lvEbs09LNeGUW9uwvQazMOPQ3u5aO7JzjdYKJd2BEu_2-DwHYzdbpCjc_7UMC8yeQX1Vov34i9Y9EfsYA6Ew1QVu9Fx4kzQPAPAr2DLGrrFOOggGrOPC_TGDmJ15KV1Gj5w_VB3NV3l2WQURHbuCPzDw2f6yKigUni3ddMNl7-oemYJ4jOMpwbg'; // <-- dan Bearer token vao day (chi phan sau chu "Bearer ")
const ORG_TYPE = 'ORG_MANAGE';
// Ten role team lead trong he thong la "Lead" (xem LEAD_ROLE_NAME trong src/api/orgUnitsApi.js),
// them "teamlead" phong truong hop ten khac. So sanh khong phan biet hoa thuong.
const TEAMLEAD_ROLE_NAMES = ['lead', 'teamlead', 'bm'];
const DELAY_MS = 500; // nghi giua 2 request, tranh spam API
const PAGE_SIZE = 50;
const MAX_PAGES = 50;
// ====================

const OUTPUT_FILE = fileURLToPath(new URL('./team-leads.xlsx', import.meta.url));
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

function getParentChainIds(path) {
  return String(path ?? '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function pad(text, width) {
  const value = String(text ?? '');

  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

async function writeExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Team lead');

  sheet.columns = [
    { header: 'Họ tên', key: 'name', width: 32 },
    { header: 'Số điện thoại', key: 'phone', width: 18 },
    { header: 'Mã sale', key: 'saleId', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => {
    sheet.addRow({ name: String(row.name), phone: String(row.phone), saleId: String(row.saleId) });
  });

  await workbook.xlsx.writeFile(OUTPUT_FILE);
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  const orgUnits = extractOrgUnits(await callApi(ORG_UNITS_PATH));
  const rootOrgs = orgUnits.filter((org) => org?.type === ORG_TYPE);
  const rootIds = new Set(rootOrgs.map((org) => String(org.id)));

  if (rootOrgs.length === 0) {
    console.log(`Khong tim thay don vi nao co type "${ORG_TYPE}".`);
    return;
  }

  // Don vi goc ORG_MANAGE + moi don vi co mot ton (path) la 1 trong cac don vi goc do.
  const targetOrgs = orgUnits.filter((org) => {
    const id = String(org?.id ?? '');

    return rootIds.has(id) || getParentChainIds(org?.path).some((ancestorId) => rootIds.has(ancestorId));
  });

  console.log(
    `Tim thay ${rootOrgs.length} don vi ${ORG_TYPE} va tong cong ${targetOrgs.length} don vi (gom don vi con).\n`
  );

  const teamleadsById = new Map();
  const seenRoleNames = new Set();

  for (let i = 0; i < targetOrgs.length; i += 1) {
    const org = targetOrgs[i];
    const label = `[${i + 1}/${targetOrgs.length}] ${org.name || org.code || org.id}`;
    const members = await fetchAllMembers(org.id);

    console.log(`${label} -> ${members.length} thanh vien`);

    members.forEach((member) => {
      const roleName = String(member?.roleName ?? '').trim();
      const roleKey = roleName.toLowerCase();

      if (roleName) seenRoleNames.add(roleName);

      if (!TEAMLEAD_ROLE_NAMES.includes(roleKey)) return;

      const userId = String(member?.userId ?? member?.id ?? '').trim();

      if (userId && !teamleadsById.has(userId)) {
        teamleadsById.set(userId, {
          name: member?.name ?? member?.fullName ?? '',
          phone: member?.phoneNumber ?? member?.phone ?? '',
          saleId: member?.saleId ?? '',
        });
      }
    });

    if (i < targetOrgs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const rows = [...teamleadsById.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  console.log(`\nDanh sach team lead (${rows.length} nguoi):\n`);
  console.log(`${pad('Họ tên', 32)}${pad('Số điện thoại', 16)}Mã sale`);
  console.log('-'.repeat(70));
  rows.forEach((row) => {
    console.log(`${pad(row.name, 32)}${pad(row.phone, 16)}${row.saleId}`);
  });

  await writeExcel(rows);
  console.log(`\nĐã xuất file Excel: ${OUTPUT_FILE}`);
  console.log(`Các role đã gặp trong các đơn vị này: ${[...seenRoleNames].sort().join(', ') || '(không có)'}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
