// API cho trang "Danh sach doi soat" (danh sach don vay theo ky doi soat).
//
// Da ghep API that (chi doc):
//   - fetchReconciliationLoans / fetchAllReconciliationLoans -> POST search-disbursed
//   - fetchReconciliationRunSchedule -> GET jobs?jobName=GEN_RECONCILIATION_MONTHLY
//
// CHUA CO API that cho 3 thao tac ghi du lieu (Them don / Xac nhan doi soat / Chinh sua lich
// chay) - cac ham nay van la MOCK, chi cap nhat tren client, KHONG goi API va KHONG luu tren
// server. Khi co API that, thay phan than cac ham nay (giu nguyen chu ky/kieu du lieu tra ve)
// la xong, khong can sua lai page.
import axiosClient from './axiosClient.js';
import { ENV } from '../config/env.js';
import { MAX_PAGES } from '../config/constants.js';

const EXPORT_PAGE_SIZE = 50;
const RECONCILIATION_JOB_NAME = 'GEN_RECONCILIATION_MONTHLY';

// Cum tu dac biet trong truong "note" tra ve tu API - dung de tach phan can to mau (giong anh
// giao dien mau) khoi phan noi dung con lai. Khop cang dai dung truoc.
const NOTE_HIGHLIGHT_PHRASES = [
  { phrase: 'Hoa hồng chưa được tính', variant: 'warning' },
  { phrase: 'Hoa hồng không được tính', variant: 'danger' },
  { phrase: 'Hoa hồng đã được tính', variant: 'success' },
];

const CONFIRM_STATUS_MAP = {
  Approve: 'APPROVE',
  Reject: 'REJECT',
};

function splitNote(rawNote) {
  const note = String(rawNote ?? '').trim();

  if (!note) return { note: '', noteHighlight: '', noteVariant: 'neutral' };

  for (const { phrase, variant } of NOTE_HIGHLIGHT_PHRASES) {
    const index = note.indexOf(phrase);

    if (index === -1) continue;

    const prefix = note
      .slice(0, index)
      .replace(/\|\s*$/, '')
      .trim();

    return { note: prefix, noteHighlight: phrase, noteVariant: variant };
  }

  return { note, noteHighlight: '', noteVariant: 'neutral' };
}

function normalizeLoan(raw) {
  const { note, noteHighlight, noteVariant } = splitNote(raw?.note);

  return {
    id: raw?.id,
    saleId: raw?.saleId || '',
    saleName: raw?.saleName || '',
    loanId: raw?.loanId || '',
    productCode: raw?.productId || '',
    productName: raw?.productName || '',
    customerName: raw?.customerName || '',
    phone: raw?.phoneNumber || '',
    amount: Number(raw?.approvedAmount) || 0,
    loanStatus: raw?.loanStatus || '',
    commission: Number(raw?.commissionAmount) || 0,
    reviewStatus: CONFIRM_STATUS_MAP[raw?.confirmStatus] || 'PENDING',
    note,
    noteHighlight,
    noteVariant,
  };
}

function parseReportDate(reportDate) {
  const match = String(reportDate || '').match(/^(\d{4})-(\d{2})$/);

  if (!match) return { year: undefined, month: undefined };

  return { year: Number(match[1]), month: Number(match[2]) };
}

export async function fetchReconciliationLoans({ reportDate = '', phone = '', saleId = '', page = 0, size = 10 } = {}) {
  const { year, month } = parseReportDate(reportDate);

  const response = await axiosClient.post(ENV.SEARCH_DISBURSED_ENDPOINT, {
    filter: { month, year, phoneNumber: phone, saleId },
    page,
    size,
  });

  const data = response.data?.data ?? response.data;
  const rows = Array.isArray(data?.data) ? data.data : [];
  const pagination = data?.pagination ?? {};
  const totalElements = Number(pagination.totalElements) || 0;
  // Server co the bo qua "size" minh gui len va luon tra ve mot pageSize co dinh - doc lai tu
  // chinh response de phan trang cho dung, khong dua vao "size" da gui.
  const pageSize = Number(pagination.pageSize) || size;

  return {
    items: rows.map(normalizeLoan),
    page: Number(pagination.currentPage) || page,
    size: pageSize,
    totalElements,
    totalPages: Number(pagination.totalPages) || Math.max(Math.ceil(totalElements / (pageSize || 1)), 1),
  };
}

// Lay toan bo ban ghi khop bo loc (khong phan trang) - dung cho chuc nang "Xuat danh sach".
export async function fetchAllReconciliationLoans({ reportDate = '', phone = '', saleId = '' } = {}) {
  const allItems = [];
  let page = 0;
  let totalElements = 0;

  while (page < MAX_PAGES) {
    const result = await fetchReconciliationLoans({ reportDate, phone, saleId, page, size: EXPORT_PAGE_SIZE });

    allItems.push(...result.items);
    totalElements = result.totalElements;

    const reachedLastPage =
      result.items.length === 0 || allItems.length >= totalElements || page + 1 >= result.totalPages;

    if (reachedLastPage) break;

    page += 1;
  }

  return allItems;
}

export async function fetchReconciliationRunSchedule() {
  const response = await axiosClient.get(ENV.RECONCILIATION_JOB_ENDPOINT, {
    params: { jobName: RECONCILIATION_JOB_NAME },
  });
  const data = response.data?.data ?? response.data;

  return {
    lastRunAt: data?.lastRunDate && data?.lastRunTime ? `${data.lastRunDate}T${data.lastRunTime}:00` : null,
    nextRunAt: data?.nextRunDate && data?.nextRunTime ? `${data.nextRunDate}T${data.nextRunTime}:00` : null,
  };
}

let localLoanCounter = 0;

// MOCK - chua co API that. Tra ve ban ghi da chuan hoa de page tu them vao danh sach dang xem,
// khong goi API va khong luu tren server.
export async function createReconciliationLoan(payload) {
  localLoanCounter += 1;

  return {
    id: `local-${Date.now()}-${localLoanCounter}`,
    saleId: (payload.saleId || '').trim(),
    saleName: (payload.saleName || '').trim(),
    loanId: (payload.loanId || '').trim(),
    productCode: (payload.productCode || '').trim(),
    productName: (payload.productName || '').trim() || 'Vay tiêu dùng',
    customerName: (payload.customerName || '').trim(),
    phone: (payload.phone || '').trim(),
    amount: Number(payload.amount) || 0,
    loanStatus: 'CLOSED',
    commission: 0,
    reviewStatus: 'PENDING',
    note: 'Đơn vừa được thêm thủ công, chưa đối soát.',
    noteHighlight: '',
    noteVariant: 'neutral',
  };
}

// MOCK - chua co API that. Tra ve cac truong da cap nhat de page tu patch vao dong tuong ung,
// khong goi API va khong luu tren server.
export async function updateReconciliationLoanReview({ id, reviewStatus, commission, note }) {
  return {
    id,
    reviewStatus,
    commission: Number(commission) || 0,
    note: (note || '').trim(),
    noteHighlight: '',
    noteVariant: 'neutral',
  };
}

// MOCK - chua co API that. Chi tra lai nextRunAt da sua, khong goi API va khong luu tren server
// (lan tai lai trang sau se lay lai lich that tu API jobs).
export async function updateReconciliationRunSchedule({ nextRunAt }) {
  return { nextRunAt };
}
