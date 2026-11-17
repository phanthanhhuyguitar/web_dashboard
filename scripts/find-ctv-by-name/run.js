// Quet TOAN BO user qua API search-users THAT, luu cache ra all-users-cache.json (cung thu muc)
// de cac lan sau (vd doi tieu chi so khop ten) khong can goi lai API. Chi doc du lieu, khong thay
// doi gi tren he thong. Sau khi quet xong, chay "node scripts/find-ctv-by-name/analyze.js" de so
// khop ten tuong tu (khong can token, doc tu cache).
//
// Luu y: filter "name" gui len API co ve KHONG duoc server ho tro (tra ve toan bo user, khong loc
// - da xac nhan qua 2 lan quet thuc te: ket qua khop nam rai rac o nhieu trang, khong tap trung o
// trang dau). Vi vay script nay luon quet HET moi trang, khong dua vao filter server-side.
//
// Cach dung:
//   1. Dan Bearer token (lay tu DevTools tren partner-admin.tnex.com.vn, F12 -> Network -> copy
//      header Authorization, bo chu "Bearer ") vao bien TOKEN ben duoi.
//   2. Chay: node scripts/find-ctv-by-name/run.js
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// ===== CAU HINH =====
const TOKEN = ''; // <-- token nguoi dung gui
const DELAY_MS = 300; // nghi giua 2 request, tranh spam API
const PAGE_SIZE = 200;
const MAX_PAGES = 200;
// ====================

const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const SEARCH_USERS_PATH = '/digital-sale-admin/api/v1/admin/search-users';
const CACHE_FILE = fileURLToPath(new URL('./all-users-cache.json', import.meta.url));

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
  const totalPages = payload?.data?.pagination?.totalPages ?? payload?.pagination?.totalPages ?? null;
  const totalElements = payload?.data?.pagination?.totalElements ?? payload?.pagination?.totalElements ?? null;

  return { users: Array.isArray(users) ? users : [], totalPages, totalElements };
}

function getUserName(user) {
  return user?.name ?? user?.fullName ?? user?.full_name ?? '';
}

function toCacheRow(user) {
  return {
    name: getUserName(user),
    saleId: user?.saleId ?? '',
    phone: user?.phoneNumber ?? user?.phone ?? '',
    userId: user?.id ?? user?.userId ?? user?.dsUserId ?? user?.digitalSaleUserId ?? '',
    status: user?.contractStatus ?? user?.status ?? '',
  };
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  const allRows = [];
  let page = 0;

  console.log('Dang quet toan bo danh sach user...\n');

  for (; page < MAX_PAGES; page += 1) {
    const payload = await callApi(SEARCH_USERS_PATH, {
      filter: {},
      page,
      size: PAGE_SIZE,
    });
    const { users, totalPages } = extractUsers(payload);

    allRows.push(...users.map(toCacheRow));

    console.log(
      `Trang ${page + 1}${totalPages ? `/${totalPages}` : ''} - quet ${users.length} user, tong da quet ${allRows.length}.`
    );

    const reachedLastPage =
      users.length === 0 || users.length < PAGE_SIZE || (totalPages !== null && page + 1 >= totalPages);

    if (reachedLastPage) break;

    await sleep(DELAY_MS);
  }

  await writeFile(CACHE_FILE, JSON.stringify(allRows, null, 2), 'utf8');

  console.log(`\nDa luu ${allRows.length} user vao cache: ${CACHE_FILE}`);
  console.log('Chay tiep: node scripts/find-ctv-by-name/analyze.js "<tên cần tìm>"');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
