// Tra cuu userId that cho tung ma sale (cot "Ma moi" trong file "change-result (1).pdf") qua API
// search-users, roi gom userId lai thanh file.txt cung thu muc, moi dong 1 userId dang:
//   "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
// Chi doc du lieu, khong thay doi gi tren he thong. Dung lai dung pattern da proven o
// scripts/sale-code-lookup/run.js (loc khop CHINH XAC vi API search-users khop theo tien to).
//
// Cach dung:
//   1. Dan Bearer token (lay tu DevTools tren partner-admin.tnex.com.vn, F12 -> Network -> copy
//      header Authorization cua 1 request bat ky, bo chu "Bearer " di) vao bien TOKEN ben duoi.
//   2. Chay: node scripts/change-result-userids/run.js
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { SALE_CODES } from './codes.js';

// ===== CAU HINH =====
const TOKEN = ''; // <-- dan Bearer token vao day (chi phan sau chu "Bearer ")
const DELAY_MS = 500; // nghi giua 2 request, tranh spam API
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
// ====================

const OUTPUT_FILE = fileURLToPath(new URL('./file.txt', import.meta.url));
const NOT_FOUND_LOG_FILE = fileURLToPath(new URL('./not-found.txt', import.meta.url));
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

function extractUserId(user) {
  const value = user?.id ?? user?.userId ?? user?.dsUserId ?? user?.digitalSaleUserId ?? user?.user_id;

  return value !== undefined && value !== null ? String(value).trim() : '';
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

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  const userIds = [];
  const notFound = [];
  const total = SALE_CODES.length;

  for (let i = 0; i < total; i += 1) {
    const code = SALE_CODES[i];
    const label = `[${i + 1}/${total}] ${code}`;

    try {
      const matches = await findExactUsers(code);

      if (matches.length === 0) {
        console.log(`${label} -> khong tim thay`);
        notFound.push(`${code} - khong tim thay`);
      } else {
        const userId = extractUserId(matches[0]);

        if (!userId) {
          console.log(`${label} -> co user nhung khong lay duoc userId`);
          notFound.push(`${code} - co user nhung khong co userId`);
        } else {
          const note = matches.length > 1 ? ` (co ${matches.length} user trung ma, lay user dau tien)` : '';

          console.log(`${label} -> ${userId}${note}`);
          userIds.push(userId);
        }
      }
    } catch (error) {
      console.log(`${label} -> LOI: ${error.message}`);
      notFound.push(`${code} - loi: ${error.message}`);
    }

    if (i < total - 1) {
      await sleep(DELAY_MS);
    }
  }

  const fileContent = userIds.map((id) => `"${id}",`).join('\n') + '\n';

  await writeFile(OUTPUT_FILE, fileContent, 'utf8');

  if (notFound.length > 0) {
    await writeFile(NOT_FOUND_LOG_FILE, notFound.join('\n') + '\n', 'utf8');
  }

  console.log(
    `\nHoan tat: ${userIds.length}/${total} ma lay duoc userId. Da ghi file: ${OUTPUT_FILE}` +
      (notFound.length > 0 ? `\nCon ${notFound.length} ma khong lay duoc, xem: ${NOT_FOUND_LOG_FILE}` : '')
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
