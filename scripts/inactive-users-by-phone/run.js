// Vo hieu hoa (isActive: false) hang loat tai khoan TNEX Partner theo so dien thoai, goi thang
// API admin that (api-gw-ds.tnex.com.vn) - KHONG qua dashboard/SQLite dong bo. Chi dung noi bo,
// can Bearer token admin con hieu luc.
//
// Cach dung:
//   1. Mo DevTools tren partner-admin.tnex.com.vn (dang nhap san voi quyen admin), lay Bearer
//      token tu header Authorization cua 1 request bat ky, dan vao bien TOKEN ben duoi.
//   2. Kiem tra/cap nhat danh sach so trong phones.js (cung thu muc).
//   3. Chay thu voi DRY_RUN = true (mac dinh) de xem danh sach se xu ly - CHUA goi API that.
//   4. Doi DRY_RUN = false roi chay that:
//        node scripts/inactive-users-by-phone/run.js

import { PHONES } from './phones.js';

// ===== CAU HINH - CHINH O DAY TRUOC KHI CHAY =====
const TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJtZFZXUWZkTmdIYTI3YmVuRWFZb242NXhKbVlYTHBTM3A3Sk1YRm93R1VnIn0.eyJleHAiOjE3OTA5Mjg3MTgsImlhdCI6MTc5MDgyMDcxOCwianRpIjoib2ZydHJvOjBlYzNmODdiLTI0M2YtNDIzMi1iMzVhLTllMjRkN2I3MTJjZSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsudG5leC52bi9yZWFsbXMvdG5leC1zYWxlLWFwcCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJiMzk2MzYwZS0xNmM0LTQ3NTktODUyYi05YzFhMmZhZDFhZmUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0bmV4LXNhbGUtYXBwIiwic2lkIjoiOGM4MzdjODEtMWUxZi00YTM5LWI4NjItM2E1ZjQ1OTZlODA2IiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiQ1RWIiwibWFuYWdlciIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXRuZXgtc2FsZS1hcHAiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIG9mZmxpbmVfYWNjZXNzIHByb2ZpbGUgZW1haWwgZHNfdXNlcl9pZCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJkc191c2VyX2lkIjpbIjVmODY5YTljLWU1MGEtNGE4Mi1iMjEyLTI2MDJiNjkzNmEyNCJdLCJuYW1lIjoiMDk0NjY3NzM1NyAwOTQ2Njc3MzU3IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMDk0NjY3NzM1NyIsImdpdmVuX25hbWUiOiIwOTQ2Njc3MzU3IiwiZmFtaWx5X25hbWUiOiIwOTQ2Njc3MzU3IiwiZW1haWwiOiIwOTQ2Njc3MzU3QHRuZXhmaW5hbmNlLmNvbS52biJ9.TX1BlnkEpZpn6DzozqjDAKcxKmOAVpSt2NjZH_mE7hVK7VRFAhYyAhHYTRHbCZWNknY8OysLLLL1L_LCphf2NbWZWaFR71zJv7ENVRAKV81jE5TiPYtCBp15TzIrBneVSkX9LqYgEG7ajHXvEB9czxINeBXek7bijlASzOfjMOKYbIfhmQggOOu2QnsO2PmHbuoaoI2heYvQE6VFZuaqeKqBScMz9vD9kr_QV6CizuRkFHP7GyzxOVCXPNa3BFGaxwOLjGSkNfCZ82ev5F0splQG0YLeRRKRmr5zkR3CQH3Ve4IXvLVcS7II681cDiKaSaIq-vfIGlM6fxXCVjmkFA'; // <-- dan Bearer token vao day (chi phan sau chu "Bearer ")
const DELAY_MS = 500; // nghi giua 2 lan goi API ke tiep, tranh spam/vuot rate limit
const DRY_RUN = false; // true = chi in danh sach se xu ly, KHONG goi API that. Doi false khi da san sang.
// ===================================================

const API_URL = 'https://api-gw-ds.tnex.com.vn/digital-sale-admin/api/v1/admin/user/active';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setUserActive(phone, isActive) {
  const response = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ phone, isActive }),
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Response co the rong hoac khong phai JSON - bo qua, chi can status code.
  }

  return { ok: response.ok, status: response.status, data };
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  const total = PHONES.length;

  console.log(
    `Chuan bi inactive ${total} tai khoan theo so dien thoai.${DRY_RUN ? ' (DRY RUN - chua goi API that)' : ''}`
  );
  console.log(`Delay giua cac request: ${DELAY_MS}ms\n`);

  const failedPhones = [];
  let successCount = 0;

  for (let i = 0; i < total; i += 1) {
    const phone = PHONES[i];
    const prefix = `[${i + 1}/${total}] ${phone}`;

    if (DRY_RUN) {
      console.log(`${prefix} -> (dry run, se goi isActive=false)`);
      continue;
    }

    try {
      const result = await setUserActive(phone, false);

      if (result.ok) {
        successCount += 1;
        console.log(`${prefix} -> OK (HTTP ${result.status})`);
      } else {
        failedPhones.push(phone);
        const message = result.data?.message || result.data?.error || '';
        console.log(`${prefix} -> FAILED (HTTP ${result.status}) ${message}`);

        if (result.status === 401 || result.status === 403) {
          console.error('\nToken het han hoac khong du quyen - dung lai de tranh fail hang loat con lai.');
          break;
        }
      }
    } catch (error) {
      failedPhones.push(phone);
      console.log(`${prefix} -> FAILED (loi mang) ${error.message}`);
    }

    if (i < total - 1) {
      await sleep(DELAY_MS);
    }
  }

  if (!DRY_RUN) {
    console.log(`\nHoan tat: ${successCount}/${total} thanh cong, ${failedPhones.length} that bai.`);

    if (failedPhones.length > 0) {
      console.log('Cac so that bai:', failedPhones.join(', '));
    }
  }
}

main();
