// Tra cuu thong tin user (ho ten, so dien thoai) cho tung ma sale trong codes.js, roi xuat ra
// sale-code-lookup.xlsx cung thu muc. Chi doc du lieu, khong thay doi gi tren he thong.
//
// Cach dung:
//   1. Dan Bearer token (lay tu DevTools tren partner-admin.tnex.com.vn) vao bien TOKEN ben duoi.
//   2. Chay: node scripts/sale-code-lookup/run.js
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

import { SALE_CODES } from './codes.js';

// ===== CAU HINH =====
const TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJtZFZXUWZkTmdIYTI3YmVuRWFZb242NXhKbVlYTHBTM3A3Sk1YRm93R1VnIn0.eyJleHAiOjE3OTEyOTg2NDgsImlhdCI6MTc5MTE5MDY0OCwianRpIjoib2ZydHJvOmJkZTBmNjU5LWMxYTQtNGJhNC1hNzlhLWJkNTc3YTM4ZGUxOSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsudG5leC52bi9yZWFsbXMvdG5leC1zYWxlLWFwcCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJiMzk2MzYwZS0xNmM0LTQ3NTktODUyYi05YzFhMmZhZDFhZmUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0bmV4LXNhbGUtYXBwIiwic2lkIjoiMzRiMWNjYTEtODIwZC00ZDE2LThmYjctOWQ1NmY2MDJhZjIwIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiQ1RWIiwibWFuYWdlciIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXRuZXgtc2FsZS1hcHAiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIG9mZmxpbmVfYWNjZXNzIHByb2ZpbGUgZW1haWwgZHNfdXNlcl9pZCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJkc191c2VyX2lkIjpbIjVmODY5YTljLWU1MGEtNGE4Mi1iMjEyLTI2MDJiNjkzNmEyNCJdLCJuYW1lIjoiMDk0NjY3NzM1NyAwOTQ2Njc3MzU3IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMDk0NjY3NzM1NyIsImdpdmVuX25hbWUiOiIwOTQ2Njc3MzU3IiwiZmFtaWx5X25hbWUiOiIwOTQ2Njc3MzU3IiwiZW1haWwiOiIwOTQ2Njc3MzU3QHRuZXhmaW5hbmNlLmNvbS52biJ9.Vvf8TGeQvKw7IFMN-sW8Via9z20ojOPfFI9-BVQDunkH4nC-4amQl4t44jEKypAxtBL88obkhMzci4AsZNWg3uiZ9GJTBdOpbBzPxctBgbB2JajBogyCCXYAnjvsyYRFywhMWW_GZMZZcVP8IBKPw2O5TRxXW55lvEbs09LNeGUW9uwvQazMOPQ3u5aO7JzjdYKJd2BEu_2-DwHYzdbpCjc_7UMC8yeQX1Vov34i9Y9EfsYA6Ew1QVu9Fx4kzQPAPAr2DLGrrFOOggGrOPC_TGDmJ15KV1Gj5w_VB3NV3l2WQURHbuCPzDw2f6yKigUni3ddMNl7-oemYJ4jOMpwbg'; // <-- dan Bearer token vao day (chi phan sau chu "Bearer ")
const DELAY_MS = 500; // nghi giua 2 request, tranh spam API
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
// ====================

const OUTPUT_FILE = fileURLToPath(new URL('./sale-code-lookup.xlsx', import.meta.url));
const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const SEARCH_USERS_PATH = '/digital-sale-admin/api/v1/admin/search-users';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callApi(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data?.message || data?.error || 'khong ro loi'}`);
  }

  return data;
}

function extractUsers(payload) {
  const users =
    payload?.data?.users ??
    payload?.data?.content ??
    payload?.data?.items ??
    payload?.data?.records ??
    payload?.data ??
    payload?.users ??
    [];

  return Array.isArray(users) ? users : [];
}

function normalizeSaleId(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^DR/, '');
}

// API tim theo saleId la khop tien to (CTV1183 tra ve ca CTV11833), nen phai loc lai khop chinh xac.
async function findExactUsers(code) {
  const target = normalizeSaleId(code);
  const matches = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await callApi(SEARCH_USERS_PATH, {
      filter: { saleId: code },
      page,
      size: PAGE_SIZE,
    });
    const users = extractUsers(payload);

    matches.push(...users.filter((user) => normalizeSaleId(user?.saleId) === target));

    if (users.length < PAGE_SIZE) break;

    await sleep(DELAY_MS);
  }

  return matches;
}

async function writeExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tra cứu mã sale');

  sheet.columns = [
    { header: 'Mã sale', key: 'code', width: 14 },
    { header: 'Số lượng giải ngân', key: 'count', width: 20 },
    { header: 'Họ tên', key: 'name', width: 32 },
    { header: 'Số điện thoại', key: 'phone', width: 16 },
    { header: 'Ghi chú', key: 'note', width: 36 },
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

  const rows = [];
  const total = SALE_CODES.length;

  for (let i = 0; i < total; i += 1) {
    const { code, count } = SALE_CODES[i];
    const label = `[${i + 1}/${total}] ${code}`;

    try {
      const matches = await findExactUsers(code);

      if (matches.length === 0) {
        console.log(`${label} -> không tìm thấy`);
        rows.push({ code, count, name: '', phone: '', note: 'Không tìm thấy' });
      } else {
        const first = matches[0];
        const name = first.name ?? first.fullName ?? '';
        const phone = first.phoneNumber ?? first.phone ?? '';
        const note = matches.length > 1 ? `Có ${matches.length} user trùng mã, lấy user đầu tiên` : '';

        console.log(`${label} -> ${name || '(không rõ tên)'} | ${phone}${note ? ` (${note})` : ''}`);
        rows.push({ code, count, name, phone, note });
      }
    } catch (error) {
      console.log(`${label} -> LỖI: ${error.message}`);
      rows.push({ code, count, name: '', phone: '', note: `Lỗi: ${error.message}` });
    }

    if (i < total - 1) {
      await sleep(DELAY_MS);
    }
  }

  await writeExcel(rows);

  const found = rows.filter((row) => row.name || row.phone).length;

  console.log(`\nHoàn tất: ${found}/${total} mã có thông tin. Đã xuất file: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
