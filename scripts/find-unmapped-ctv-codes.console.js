// Cach dung: Dang nhap dashboard o 1 tab, mo DevTools (F12) -> tab Console tren CHINH tab do,
// dan toan bo script nay vao roi Enter.
// Neu tu dong khong tim thay token trong localStorage/sessionStorage, dan token vao MANUAL_TOKEN
// ben duoi (lay tu tab Network > 1 request bat ky toi api-gw-ds.tnex.com.vn > header
// "authorization: Bearer ...", copy phan sau chu "Bearer ").
//
// Muc dich: Doc toan bo danh sach ma CTV tu referral/search, xac dinh khoang [min, max] so hieu
// CTV dang ton tai trong he thong, roi tim NHUNG SO BI THIEU (gap) trong khoang do - tuc la
// nhung ma CTV KHONG XUAT HIEN trong bat ky response nao (chua tung duoc cap/gan cho SDT nao) -
// xuat CSV. (Khong tinh case ma CTV co xuat hien nhung field phoneNumber rong - chi lay dung gap.)
//
// Da xac nhan thuc te qua DevTools (2026-08): response la { data: { data: [...], pagination },
// ... } - moi record co san field phoneNumber, KHONG can doi chieu cheo voi search-users nua.
// API nay co ve luon co dinh 20 ban ghi/trang bat ke gia tri "size" gui len - vi vay KHONG dung
// "items.length < size da gui" de doan trang cuoi (se dung sai ngay trang 1), ma dua vao
// pagination.totalElements tra ve tu chinh response.
(async function () {
  const MANUAL_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJtZFZXUWZkTmdIYTI3YmVuRWFZb242NXhKbVlYTHBTM3A3Sk1YRm93R1VnIn0.eyJleHAiOjE3ODc3NTQyOTAsImlhdCI6MTc4NzY0NjI5MCwianRpIjoib2ZydHJvOmI4MWYzNzJlLTE4MWUtNGVhMC05NzY2LTA3NWZlYzA0NWJiNSIsImlzcyI6Imh0dHBzOi8va2V5Y2xvYWsudG5leC52bi9yZWFsbXMvdG5leC1zYWxlLWFwcCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJiMzk2MzYwZS0xNmM0LTQ3NTktODUyYi05YzFhMmZhZDFhZmUiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0bmV4LXNhbGUtYXBwIiwic2lkIjoiYzA3NzhjYjYtMzBhYS00NTM0LThkZWYtM2VmNWRhODE2MDBhIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIvKiJdLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiQ1RWIiwibWFuYWdlciIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iLCJkZWZhdWx0LXJvbGVzLXRuZXgtc2FsZS1hcHAiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIG9mZmxpbmVfYWNjZXNzIHByb2ZpbGUgZW1haWwgZHNfdXNlcl9pZCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJkc191c2VyX2lkIjpbIjVmODY5YTljLWU1MGEtNGE4Mi1iMjEyLTI2MDJiNjkzNmEyNCJdLCJuYW1lIjoiMDk0NjY3NzM1NyAwOTQ2Njc3MzU3IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMDk0NjY3NzM1NyIsImdpdmVuX25hbWUiOiIwOTQ2Njc3MzU3IiwiZmFtaWx5X25hbWUiOiIwOTQ2Njc3MzU3IiwiZW1haWwiOiIwOTQ2Njc3MzU3QHRuZXhmaW5hbmNlLmNvbS52biJ9.eBLOs_CVo6SYzNZcvdCS79hEQFWxSGBJrExdUs-GIYkSlz1jGWOj7bj_4Ds_6nVdVVs8YkaOdHuiGk5HcIiet_pJinYoqKPuYha3TIOmKg0YaALWMzgocRMjP_9pcmc2JyeHgZvzHygoI_4vqZLKrXk8bzwJbJhu9r_o3FNn8MQp75ux05f4Qpf8fCfko38m0at1kkv9U3pmpCot-snWsYBvqfRu63-aUe53Axyh3NO6IqjVC1fzQQkMhTJAwzMu2nx0uHNgnkPlYN0nEnqqi8PmLPdz5xsi0jvkzoiH9dDpAPM4hYNq-cylV_RMUkIrxpqSrheQIwgvUkfbLLhUlA'; // <-- dan token vao giua 2 dau nhay don o day neu tu dong khong tim thay

  const remember = localStorage.getItem('tnex_partner_remember_login') === 'true';
  const token =
    MANUAL_TOKEN ||
    (remember ? localStorage.getItem('tnex_partner_access_token') : sessionStorage.getItem('tnex_partner_access_token'));

  if (!token) {
    console.error('Không tìm thấy token tự động.');
    console.log('Mở tab Network, bấm 1 request bất kỳ tới api-gw-ds.tnex.com.vn, xem header "authorization", copy phần sau "Bearer ", dán vào biến MANUAL_TOKEN ở đầu script rồi chạy lại.');
    return;
  }

  const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
  const REFERRAL_ENDPOINT = '/digital-sale-admin/api/v1/admin/referral/search';
  const REQUESTED_SIZE = 20; // server co ve luon clamp ve 20, gui dung 20 cho ro rang
  const MAX_PAGES = 2000; // du cho ~939 trang (18761 ban ghi / 20)
  const DELAY_MS = 120; // delay nhe giua cac trang, khong ban don dap

  async function fetchPage(page) {
    const res = await fetch(BASE_URL + REFERRAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ filter: {}, page, size: REQUESTED_SIZE }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi ${REFERRAL_ENDPOINT}`);

    return res.json();
  }

  async function fetchAllReferrals() {
    let all = [];
    let page = 0;

    while (page < MAX_PAGES) {
      const json = await fetchPage(page);
      // Response thuc te: { data: { data: [...], pagination: { totalElements, ... } } }
      const outer = json?.data ?? json;
      const items = Array.isArray(outer?.data) ? outer.data : Array.isArray(outer) ? outer : [];
      const totalElements = outer?.pagination?.totalElements ?? outer?.totalElements ?? outer?.total ?? null;

      if (page === 0) {
        console.log('Cấu trúc "data" cấp 1:', outer && typeof outer === 'object' ? Object.keys(outer) : typeof outer);
        if (items[0]) console.log('Field của 1 record mẫu:', Object.keys(items[0]));
      }

      all = all.concat(items);
      console.log(`Trang ${page + 1}: +${items.length} (tổng ${all.length}${totalElements ? ' / ' + totalElements : ''})`);

      if (items.length === 0) break; // het du lieu that su
      if (totalElements != null && all.length >= Number(totalElements)) break;

      page += 1;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    return all;
  }

  console.log('Đang tải toàn bộ danh sách mã sale (referral/search)... (~939 trang, có thể mất vài phút)');
  const referrals = await fetchAllReferrals();
  console.log(`Tổng cộng ${referrals.length} mã sale.`);

  // Hau to so sau "CTV" (bo qua tien to "DR" neu co, vd "DRCTV1234" -> 1234).
  function extractCtvNumber(record) {
    const raw = String(record?.saleId || record?.referralCode || '').trim();
    const match = raw.match(/^(?:DR)?CTV(\d+)$/i);

    return match ? Number(match[1]) : null;
  }

  const usedNumbers = new Set();
  referrals.forEach((r) => {
    const number = extractCtvNumber(r);

    if (number !== null) usedNumbers.add(number);
  });

  if (usedNumbers.size === 0) {
    console.error('Không parse được số hiệu CTV nào từ saleId/referralCode - kiểm tra lại format mã.');
    return;
  }

  const min = Math.min(...usedNumbers);
  const max = Math.max(...usedNumbers);

  console.log(`Khoảng số hiệu CTV đang tồn tại trong hệ thống: CTV${min} - CTV${max} (${usedNumbers.size} mã đã xuất hiện trong response).`);

  const missing = [];
  for (let n = min; n <= max; n += 1) {
    if (!usedNumbers.has(n)) missing.push(n);
  }

  console.log(`Kết quả: ${missing.length} mã CTV bị THIẾU (không xuất hiện trong response nào) trong khoảng CTV${min}-CTV${max}.`);

  if (missing.length === 0) {
    console.log('Không có số nào bị thiếu trong khoảng min-max. Không tạo file.');
    return;
  }

  const rows = [['STT', 'Số', 'Mã CTV gợi ý']];
  missing.forEach((n, i) => rows.push([i + 1, n, `CTV${n}`]));

  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ma-ctv-thieu-trong-khoang.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('Đã tải file CSV.');
})();
