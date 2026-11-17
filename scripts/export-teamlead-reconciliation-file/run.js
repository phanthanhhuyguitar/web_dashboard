// Xuat 1 file doi soat (.xlsx) cho TEAM LEAD/BM - gom ca doanh so CA NHAN (muc 1) va doanh so TEAM
// (muc 2), dung dung logic/cong thuc da xay va verify trong src/api/teamReconciliationApi.js +
// src/utils/commissionFormula.js (import thang, khong copy lai). Chi doc du lieu + goi
// users/profile de lay STK/ngay gia nhap - khong ghi gi len he thong.
//
// Cach dung:
//   1. Dan Bearer token vao bien TOKEN ben duoi.
//   2. Sua LEAD_SALE_ID / YEAR / MONTH neu can xuat cho nguoi/ky khac.
//   3. Chay: node scripts/export-teamlead-reconciliation-file/run.js
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  getLeadPersonalRate,
  calculateLeadPersonalCommission,
  allocateTeamCommission,
  calculatePersonalIncomeTax,
  calculateNetIncome,
} from '../../src/utils/commissionFormula.js';
import { LOAN_STATUSES } from '../../src/config/statusMap.js';
import { isDateInRange, parseDateValue } from '../../src/utils/date.js';

// ===== CAU HINH =====
const TOKEN = ''; // <-- dan Bearer token vao day
const LEAD_SALE_ID = ''; // <-- dien ma sale cua lead/BM can xuat file
const YEAR = 2026;
const MONTH = 10;
const DELAY_MS = 200;
const PAGE_SIZE_LOANS = 200;
const MAX_PAGES_LOANS = 100;
const PAGE_SIZE_MEMBERS = 50;
const MAX_PAGES_MEMBERS = 30;
// ====================

const BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const ORG_UNITS_PATH = '/digital-sale-admin/api/v1/admin/org-units';
const ORG_UNIT_USERS_PATH = '/digital-sale-admin/api/v1/admin/org-units/users';
const SEARCH_DISBURSED_PATH = '/digital-sale-admin/api/v1/admin/search-disbursed';
const LOANS_PATH = '/digital-sale-admin/api/v1/admin/loans';
const USER_DETAIL_PATH = '/digital-sale-admin/api/v1/admin/users/profile';
const ORG_MANAGE_TYPE = 'ORG_MANAGE';
const LEAD_ROLE_NAMES = ['lead', 'bm'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSaleId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^DR/i, '');
}

async function callApi(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE_URL + path);

  if (params) Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

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
    [];
  const pagination = payload?.data?.pagination ?? payload?.pagination ?? {};

  return { users: Array.isArray(users) ? users : [], totalPages: Number(pagination.totalPages) || 0 };
}

async function fetchAllMembers(orgUnitId) {
  const members = [];

  for (let page = 0; page < MAX_PAGES_MEMBERS; page += 1) {
    const payload = await callApi(ORG_UNIT_USERS_PATH, {
      method: 'POST',
      body: {
        filter: { orgUnitId, userId: '', saleId: '', name: '', phone: '', roleName: '' },
        page,
        size: PAGE_SIZE_MEMBERS,
      },
    });
    const { users, totalPages } = extractUsersPage(payload);

    members.push(...users);

    if (users.length === 0 || (totalPages && page + 1 >= totalPages) || users.length < PAGE_SIZE_MEMBERS) break;

    await sleep(DELAY_MS);
  }

  return members;
}

async function findManagedTeam(leadSaleId) {
  const target = normalizeSaleId(leadSaleId);
  const orgUnits = extractOrgUnits(await callApi(ORG_UNITS_PATH));
  const manageOrgs = orgUnits.filter((org) => org?.type === ORG_MANAGE_TYPE);

  for (const org of manageOrgs) {
    const members = await fetchAllMembers(org.id);
    const roleUser = members.find(
      (member) =>
        LEAD_ROLE_NAMES.includes(
          String(member?.roleName ?? '')
            .trim()
            .toLowerCase()
        ) && normalizeSaleId(member.saleId) === target
    );

    if (roleUser) return { org, roleUser, members };

    await sleep(DELAY_MS);
  }

  return null;
}

const NOTE_HIGHLIGHT_PHRASES = ['Hoa hồng chưa được tính', 'Hoa hồng không được tính', 'Hoa hồng đã được tính'];

function splitNote(rawNote) {
  const note = String(rawNote ?? '').trim();

  for (const phrase of NOTE_HIGHLIGHT_PHRASES) {
    const index = note.indexOf(phrase);

    if (index !== -1)
      return note
        .slice(0, index)
        .replace(/\|\s*$/, '')
        .trim();
  }

  return note;
}

async function fetchPersonalLoans(saleId) {
  const allItems = [];

  for (let page = 0; page < MAX_PAGES_LOANS; page += 1) {
    const response = await callApi(SEARCH_DISBURSED_PATH, {
      method: 'POST',
      body: { filter: { month: MONTH, year: YEAR, saleId }, page, size: 50 },
    });
    const data = response?.data ?? response;
    const rows = Array.isArray(data?.data) ? data.data : [];
    const totalPages = Number(data?.pagination?.totalPages) || 0;

    allItems.push(...rows);

    if (rows.length === 0 || page + 1 >= totalPages) break;

    await sleep(DELAY_MS);
  }

  return allItems;
}

async function fetchAllCompanyLoans() {
  const allLoans = [];

  for (let page = 0; page < MAX_PAGES_LOANS; page += 1) {
    const response = await callApi(LOANS_PATH, { method: 'POST', body: { filter: {}, page, size: PAGE_SIZE_LOANS } });
    const data = response?.data ?? response;
    const rows = data?.loans ?? data?.content ?? data?.items ?? data?.records ?? [];
    const totalPages = Number(data?.totalPages ?? data?.pagination?.totalPages) || 0;

    allLoans.push(...rows);
    console.log(`  Đã tải ${allLoans.length} đơn vay (trang ${page + 1}${totalPages ? `/${totalPages}` : ''})...`);

    if (rows.length === 0 || (totalPages && page + 1 >= totalPages) || rows.length < PAGE_SIZE_LOANS) break;

    await sleep(DELAY_MS);
  }

  return allLoans;
}

async function fetchUserOrgJoinDate(userId, orgId) {
  if (!userId) return null;

  try {
    const response = await callApi(USER_DETAIL_PATH, { params: { id: userId } });
    const detail = response?.data?.user ?? response?.data?.profile ?? response?.data ?? response;
    const orgInfos = Array.isArray(detail?.orgInfos) ? detail.orgInfos : [];
    const match = orgInfos.find((info) => String(info?.orgId ?? '') === String(orgId));

    return match?.createdAt ?? null;
  } catch {
    return undefined; // loi tra cuu - khac null (khong co du lieu)
  }
}

async function fetchBankAccountNumber(userId) {
  if (!userId) return '';

  try {
    const response = await callApi(USER_DETAIL_PATH, { params: { id: userId } });
    const detail = response?.data?.user ?? response?.data?.profile ?? response?.data ?? response;

    return detail?.bankInfo?.accountNumber || '';
  } catch {
    return '';
  }
}

function mergedRow(sheet, cols, text, { bold = false, size = 11, align = 'left' } = {}) {
  const row = sheet.addRow([text]);

  sheet.mergeCells(row.number, 1, row.number, cols);
  row.getCell(1).font = { bold, size };
  row.getCell(1).alignment = { horizontal: align };

  return row;
}

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

function styleBorderedRow(row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

async function main() {
  if (!TOKEN) {
    console.error('Chua dien TOKEN trong run.js. Dan Bearer token vao bien TOKEN roi chay lai.');
    process.exitCode = 1;
    return;
  }

  if (!LEAD_SALE_ID) {
    console.error('Chua dien LEAD_SALE_ID trong run.js.');
    process.exitCode = 1;
    return;
  }

  console.log(`Dang tim team cua lead/BM ${LEAD_SALE_ID}...`);

  const managed = await findManagedTeam(LEAD_SALE_ID);

  if (!managed) {
    console.error(`Khong tim thay team nao ma ${LEAD_SALE_ID} la Lead/BM.`);
    process.exitCode = 1;
    return;
  }

  const { org, roleUser, members } = managed;

  console.log(`Tim thay team: ${org.name || org.id} (orgUnitId: ${org.id}), lead: ${roleUser.name}\n`);

  console.log('Dang lay doanh so ca nhan cua lead...');
  const personalItems = await fetchPersonalLoans(normalizeSaleId(LEAD_SALE_ID));
  const personalRevenue = personalItems.reduce((sum, item) => sum + (Number(item.approvedAmount) || 0), 0);
  const personalRate = getLeadPersonalRate(personalRevenue);
  const personalRows = personalItems.map((item) => ({
    customerName: item.customerName || '',
    phone: item.phoneNumber || '',
    amount: Number(item.approvedAmount) || 0,
    commission: Math.round((Number(item.approvedAmount) || 0) * personalRate),
    productName: item.productName || '',
    loanStatus: item.loanStatus || '',
    note: splitNote(item.note) || '--',
  }));
  const personalCommission = calculateLeadPersonalCommission(personalRevenue);

  console.log(`  -> ${personalRows.length} đơn, doanh số ${personalRevenue.toLocaleString('vi-VN')}đ\n`);

  console.log('Dang tai toan bo du lieu don vay cong ty (de cong doanh so team)...');
  const allLoans = await fetchAllCompanyLoans();
  const range = {
    fromDate: `${YEAR}-${String(MONTH).padStart(2, '0')}-01`,
    toDate: `${YEAR}-${String(MONTH).padStart(2, '0')}-${new Date(YEAR, MONTH, 0).getDate()}`,
  };
  const closedLoansInRange = allLoans.filter(
    (loan) => loan?.status === LOAN_STATUSES.CLOSED && isDateInRange(loan?.updatedAt, range)
  );

  console.log(`  -> ${closedLoansInRange.length} đơn CLOSED trong kỳ (toàn công ty).\n`);

  const teamMembers = members.filter(
    (member) =>
      normalizeSaleId(member.saleId) !== normalizeSaleId(LEAD_SALE_ID) && normalizeSaleId(member.saleId) !== ''
  );
  const loansByMemberSaleId = new Map();

  closedLoansInRange.forEach((loan) => {
    const saleId = normalizeSaleId(loan.ownerSaleId);

    if (!saleId) return;
    if (!loansByMemberSaleId.has(saleId)) loansByMemberSaleId.set(saleId, []);
    loansByMemberSaleId.get(saleId).push(loan);
  });

  console.log('Dang tra cuu ngay gia nhap team cho tung thanh vien co don...');
  const warnings = [
    'Dữ liệu chỉ tổng hợp theo danh sách thành viên ĐANG có trong nhóm tại thời điểm xuất file. Nếu có CTV đã rời nhóm trong kỳ đối soát này, doanh số của họ sẽ không được tính vào đây.',
  ];
  const memberRows = [];

  for (const member of teamMembers) {
    const memberSaleId = normalizeSaleId(member.saleId);
    const loans = loansByMemberSaleId.get(memberSaleId) || [];

    if (loans.length === 0) continue;

    const joinDateRaw = await fetchUserOrgJoinDate(member.userId, org.id);
    const joinDate = joinDateRaw ? parseDateValue(joinDateRaw) : null;

    if (joinDateRaw === undefined) {
      warnings.push(`Không tra cứu được ngày tham gia nhóm của ${member.name} (${memberSaleId}).`);
    } else if (!joinDate) {
      warnings.push(
        `Không xác định được ngày tham gia nhóm của ${member.name} (${memberSaleId}) - tạm tính toàn bộ đơn.`
      );
    }

    const excluded = [];
    const counted = loans.filter((loan) => {
      if (!joinDate) return true;

      const disbursedAt = parseDateValue(loan.updatedAt);
      const isBefore = disbursedAt && disbursedAt < joinDate;

      if (isBefore) excluded.push(loan);

      return !isBefore;
    });

    if (excluded.length > 0) {
      const excludedAmount = excluded.reduce((sum, loan) => sum + (Number(loan.approvedAmount) || 0), 0);

      warnings.push(
        `Đã loại ${excluded.length} đơn (tổng ${excludedAmount.toLocaleString('vi-VN')}đ) của ${member.name} (${memberSaleId}) vì giải ngân trước ngày tham gia nhóm.`
      );
    }

    memberRows.push({
      saleId: memberSaleId,
      name: member.name,
      revenue: counted.reduce((sum, loan) => sum + (Number(loan.approvedAmount) || 0), 0),
    });

    await sleep(DELAY_MS);
  }

  const commissionByMember = allocateTeamCommission(memberRows.map((m) => ({ key: m.saleId, revenue: m.revenue })));
  const teamRows = memberRows.map((m) => ({ ...m, commission: commissionByMember.get(m.saleId) || 0 }));
  const teamTotalRevenue = teamRows.reduce((sum, m) => sum + m.revenue, 0);
  const teamTotalCommission = teamRows.reduce((sum, m) => sum + m.commission, 0);

  console.log(`  -> ${teamRows.length} thành viên có doanh số, tổng ${teamTotalRevenue.toLocaleString('vi-VN')}đ\n`);

  const bankAccountNumber = await fetchBankAccountNumber(roleUser.userId || roleUser.id);
  const totalIncome = personalCommission + teamTotalCommission;
  const tax = calculatePersonalIncomeTax(totalIncome);
  const netIncome = calculateNetIncome(totalIncome);

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

  mergedRow(sheet, COLS, 'CÔNG TY TÀI CHÍNH TNHH MỘT THÀNH VIÊN TNEX', { bold: true, size: 13 });
  mergedRow(sheet, COLS, 'Trụ sở chính: Tầng 20, Tòa nhà số 54A Nguyễn Chí Thanh, Phường Láng, TP. Hà Nội, Việt Nam');
  mergedRow(sheet, COLS, 'Tel: 1900 6954 | Website: www.tnexfinance.com.vn');
  sheet.addRow([]);
  mergedRow(sheet, COLS, 'KẾT QUẢ BÁN HÀNG', { bold: true, size: 15, align: 'center' });
  mergedRow(sheet, COLS, `Tháng ${MONTH}/${YEAR}`, { align: 'center' });
  sheet.addRow([]);

  if (warnings.length > 0) {
    warnings.forEach((warning) => mergedRow(sheet, COLS, `⚠ ${warning}`, { size: 9 }));
    sheet.addRow([]);
  }

  mergedRow(sheet, COLS, '1. Kết quả bán hàng cá nhân', { bold: true });

  const personalHeaderRow = sheet.addRow([
    'STT',
    'Họ và tên',
    'SĐT',
    'Tổng DSGN thực tế (tính hoa hồng)',
    'Thu nhập',
    'Loại sản phẩm',
    'Trạng thái',
    'Ghi chú',
  ]);

  styleHeaderRow(personalHeaderRow);
  personalRows.forEach((item, index) => {
    styleBorderedRow(
      sheet.addRow([
        index + 1,
        item.customerName,
        item.phone,
        item.amount,
        item.commission,
        item.productName,
        item.loanStatus,
        item.note,
      ])
    );
  });

  const personalTotalRow = sheet.addRow(['', 'Tổng', '', personalRevenue, personalCommission, '', '', '']);

  sheet.mergeCells(personalTotalRow.number, 1, personalTotalRow.number, 2);
  personalTotalRow.font = { bold: true };
  styleBorderedRow(personalTotalRow);
  sheet.addRow([]);

  mergedRow(sheet, COLS, '2. Kết quả bán hàng của Team', { bold: true });

  const teamHeaderRow = sheet.addRow(['STT', 'Họ và tên', 'Mã CTV', '', 'Doanh số', 'Thu nhập', 'Ghi chú', '']);

  sheet.mergeCells(teamHeaderRow.number, 4, teamHeaderRow.number, 4);
  styleHeaderRow(teamHeaderRow);
  teamRows.forEach((member, index) => {
    const row = sheet.addRow([index + 1, member.name, member.saleId, '', member.revenue, member.commission, '', '']);

    sheet.mergeCells(row.number, 4, row.number, 4);
    styleBorderedRow(row);
  });

  const teamTotalRow = sheet.addRow(['', 'Tổng', '', '', teamTotalRevenue, teamTotalCommission, '', '']);

  sheet.mergeCells(teamTotalRow.number, 1, teamTotalRow.number, 4);
  teamTotalRow.font = { bold: true };
  styleBorderedRow(teamTotalRow);
  sheet.addRow([]);

  mergedRow(sheet, COLS, '3. Thu nhập tại mục 3 = (1) + (2)', { bold: true });
  mergedRow(
    sheet,
    COLS,
    `Thu nhập tháng ${MONTH}/${YEAR} = ${personalCommission.toLocaleString('vi-VN')} + ${teamTotalCommission.toLocaleString('vi-VN')} = ${totalIncome.toLocaleString('vi-VN')}`
  );
  sheet.addRow([]);

  mergedRow(sheet, COLS, '4. Thông tin nhận thu nhập', { bold: true });

  const infoLines = [
    ['Mã đối tác:', LEAD_SALE_ID],
    ['Mã ID:', LEAD_SALE_ID],
    ['Họ và tên:', roleUser.name],
    [
      'Chức danh:',
      LEAD_ROLE_NAMES.includes(String(roleUser.roleName ?? '').toLowerCase()) ? roleUser.roleName : 'Team Lead',
    ],
    ['STK TNEX nhận tiền:', bankAccountNumber || '--'],
    ['Mã số thuế:', ''],
    ['Thuế TNCN:', tax],
    ['Thu nhập thực nhận:', netIncome],
  ];

  infoLines.forEach(([label, value]) => {
    const row = sheet.addRow(['', label, value]);

    row.getCell(2).font = { bold: true };
  });

  const outputFile = fileURLToPath(
    new URL(
      `./doi-soat-teamlead_${normalizeSaleId(LEAD_SALE_ID)}_${YEAR}-${String(MONTH).padStart(2, '0')}.xlsx`,
      import.meta.url
    )
  );

  await workbook.xlsx.writeFile(outputFile);

  console.log(`\nĐã xuất file: ${outputFile}`);
  console.log(
    `Doanh số cá nhân: ${personalRevenue.toLocaleString('vi-VN')}đ | Doanh số team: ${teamTotalRevenue.toLocaleString('vi-VN')}đ | Tổng thu nhập: ${totalIncome.toLocaleString('vi-VN')}đ | Thuế TNCN: ${tax.toLocaleString('vi-VN')}đ | Thực nhận: ${netIncome.toLocaleString('vi-VN')}đ`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
