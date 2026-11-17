// Xuat 1 file doi soat (.xlsx) dang "file doi soat" giong mau cong ty gui (letterhead + bang +
// thong tin nhan tien) cho 1 CTV cu the trong 1 thang, goi API search-disbursed THAT. Tai dung
// dung cong thuc hoa hong/thue TNCN da co san o src/utils/commissionFormula.js (import thang,
// khong copy lai logic) de dam bao khop voi logic da verify tren web. Chi doc du lieu + goi
// users/profile de lay STK hien thi - khong ghi gi len he thong.
//
// Cach dung:
//   1. Dan Bearer token vao bien TOKEN ben duoi.
//   2. Sua SALE_ID / SALE_NAME / USER_ID / YEAR / MONTH neu can xuat cho CTV/ky khac.
//   3. Chay: node scripts/export-reconciliation-file/run.js
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getMemberPersonalRate,
  calculateMemberPersonalCommission,
  calculatePersonalIncomeTax,
  calculateNetIncome,
} from '../../src/utils/commissionFormula.js';

// ===== CAU HINH =====
const TOKEN = ''; // <-- dan Bearer token vao day
const SALE_ID = '046553';
const SALE_NAME = 'Nguyễn Hữu Tình';
const USER_ID = 'e5f0828b-766a-44f0-a38f-8770f264af05'; // de tra cuu STK ngan hang hien thi
const YEAR = 2026;
const MONTH = 10;
const PAGE_SIZE = 50;
const MAX_PAGES = 100;
// ====================

const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const SEARCH_DISBURSED_PATH = '/digital-sale-admin/api/v1/admin/search-disbursed';
const USER_DETAIL_PATH = '/digital-sale-admin/api/v1/admin/users/profile';
const OUTPUT_FILE = fileURLToPath(
  new URL(`./doi-soat_${SALE_ID}_${YEAR}-${String(MONTH).padStart(2, '0')}.xlsx`, import.meta.url)
);

const NOTE_HIGHLIGHT_PHRASES = ['Hoa hồng chưa được tính', 'Hoa hồng không được tính', 'Hoa hồng đã được tính'];

function splitNote(rawNote) {
  const note = String(rawNote ?? '').trim();

  for (const phrase of NOTE_HIGHLIGHT_PHRASES) {
    const index = note.indexOf(phrase);

    if (index === -1) continue;

    return note
      .slice(0, index)
      .replace(/\|\s*$/, '')
      .trim();
  }

  return note;
}

async function callApi(method, path, body, params) {
  const url = new URL(BASE_URL + path);

  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url, {
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
    throw new Error(`HTTP ${response.status}: ${data?.message || data?.error || 'khong ro loi'}`);
  }

  return data;
}

async function fetchAllLoans() {
  const allItems = [];
  let page = 0;

  for (; page < MAX_PAGES; page += 1) {
    const response = await callApi('POST', SEARCH_DISBURSED_PATH, {
      filter: { month: MONTH, year: YEAR, saleId: SALE_ID },
      page,
      size: PAGE_SIZE,
    });
    const data = response?.data ?? response;
    const rows = Array.isArray(data?.data) ? data.data : [];
    const pagination = data?.pagination ?? {};
    const totalPages = Number(pagination.totalPages) || 0;

    allItems.push(...rows);

    if (rows.length === 0 || page + 1 >= totalPages) break;
  }

  return allItems;
}

async function fetchBankAccountNumber() {
  if (!USER_ID) return '';

  try {
    const response = await callApi('GET', USER_DETAIL_PATH, null, { id: USER_ID });
    const detail = response?.data?.user ?? response?.data?.profile ?? response?.data ?? response;

    return detail?.bankInfo?.accountNumber || '';
  } catch (error) {
    console.warn(`Khong lay duoc STK ngan hang: ${error.message}`);
    return '';
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  console.log(`Dang lay don vay thang ${MONTH}/${YEAR} cua ${SALE_NAME} (${SALE_ID})...`);

  const rawLoans = await fetchAllLoans();

  console.log(`Tim thay ${rawLoans.length} don vay.`);

  const bankAccountNumber = await fetchBankAccountNumber();
  const totalAmount = rawLoans.reduce((sum, loan) => sum + (Number(loan.approvedAmount) || 0), 0);
  const rate = getMemberPersonalRate(totalAmount);
  const rows = rawLoans.map((loan) => ({
    customerName: loan.customerName || '',
    phone: loan.phoneNumber || '',
    amount: Number(loan.approvedAmount) || 0,
    commission: Math.round((Number(loan.approvedAmount) || 0) * rate),
    productName: loan.productName || '',
    loanStatus: loan.loanStatus || '',
    note: splitNote(loan.note) || '--',
  }));
  const totalCommission = calculateMemberPersonalCommission(totalAmount);
  const tax = calculatePersonalIncomeTax(totalCommission);
  const netIncome = calculateNetIncome(totalCommission);

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kết quả bán hàng');
  const COLS = 8;

  sheet.columns = [
    { width: 6 },
    { width: 24 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
    { width: 14 },
    { width: 34 },
  ];

  function mergedRow(text, { bold = false, size = 11, align = 'left' } = {}) {
    const row = sheet.addRow([text]);

    sheet.mergeCells(row.number, 1, row.number, COLS);
    row.getCell(1).font = { bold, size };
    row.getCell(1).alignment = { horizontal: align };

    return row;
  }

  mergedRow('CÔNG TY TÀI CHÍNH TNHH MỘT THÀNH VIÊN TNEX', { bold: true, size: 13 });
  mergedRow('Trụ sở chính: Tầng 20, Tòa nhà số 54A Nguyễn Chí Thanh, Phường Láng, TP. Hà Nội, Việt Nam');
  mergedRow('Tel: 1900 6954 | Website: www.tnexfinance.com.vn');
  sheet.addRow([]);
  mergedRow('KẾT QUẢ BÁN HÀNG', { bold: true, size: 15, align: 'center' });
  mergedRow(`Tháng ${MONTH}/${YEAR}`, { align: 'center' });
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'STT',
    'Họ và tên',
    'SĐT',
    'Tổng DSGN thực tế (tính hoa hồng)',
    'Thu nhập',
    'Loại sản phẩm',
    'Trạng thái',
    'Ghi chú',
  ]);

  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1,
      item.customerName,
      item.phone,
      item.amount,
      item.commission,
      item.productName,
      item.loanStatus,
      item.note,
    ]);

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  const totalRow = sheet.addRow(['', 'Tổng', '', totalAmount, totalCommission, '', '', '']);

  sheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  sheet.addRow([]);

  const infoLines = [
    ['Mã ID:', SALE_ID],
    ['Họ và tên:', SALE_NAME],
    ['Chức danh:', 'Cộng tác viên'],
    ['STK TNEX nhận tiền:', bankAccountNumber || '--'],
    ['Mã số thuế:', ''],
    ['Số lượng hợp đồng giải ngân:', rows.length],
    ['Tổng doanh số giải ngân:', totalAmount],
    ['Thu nhập (hoa hồng):', totalCommission],
    ['Thuế TNCN:', tax],
    ['Thu nhập thực nhận:', netIncome],
  ];

  infoLines.forEach(([label, value]) => {
    const row = sheet.addRow(['', label, value]);

    row.getCell(2).font = { bold: true };
  });

  await workbook.xlsx.writeFile(OUTPUT_FILE);

  console.log(`\nDa xuat file: ${OUTPUT_FILE}`);
  console.log(
    `Tong doanh so: ${totalAmount.toLocaleString('vi-VN')}đ | Hoa hồng: ${totalCommission.toLocaleString('vi-VN')}đ | Thuế TNCN: ${tax.toLocaleString('vi-VN')}đ | Thực nhận: ${netIncome.toLocaleString('vi-VN')}đ`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
