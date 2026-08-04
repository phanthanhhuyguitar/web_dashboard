// Cac "tool" du lieu cho AI chat assistant. CHI doc du lieu da dong bo local (SQLite qua
// userStoreV2.cjs/loanStoreV2.cjs - bang users_full/loans_full), KHONG goi API that - giu
// dung nguyen tac chung cua du an (tranh spam API). Neu chua co du lieu dong bo, tra loi loi
// ro rang de AI truyen dat lai cho nguoi dung thay vi bia so lieu.
const { getSyncFreshness } = require('./dataQualityStatus.cjs');
const { readUsersFullMerged } = require('../utils/userStoreV2.cjs');
const { readLoansFullMerged } = require('../utils/loanStoreV2.cjs');
const {
  extractLoanApprovedAmount,
  extractLoanUpdatedAt,
  isClosedLoan,
  parseAmount,
} = require('../utils/loanFileStore.cjs');

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

// Loi long hon parseDateValue phia client (khong can xu ly timezone ISO chi tiet) - chi can
// du de so sanh ngay/thang cho cac tool thong ke.
function parseLooseDate(value) {
  const text = valueToText(value);

  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmyMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);

  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinRange(dateValue, fromDate, toDate) {
  const date = parseLooseDate(dateValue);
  const start = parseLooseDate(fromDate);
  const end = parseLooseDate(toDate);

  if (!date || !start || !end) return false;

  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);

  return date >= start && date <= endOfDay;
}

function extractUserCreatedAt(user) {
  return (
    user?.createdAt ||
    user?.createAt ||
    user?.createdDate ||
    user?.createdTime ||
    user?.registerDate ||
    user?.registeredAt ||
    ''
  );
}

function extractUserRole(user) {
  return valueToText(user?.role || user?.roleInfo?.roleCode).toUpperCase();
}

// Dem so user (CTV/RM) co ngay tao (createdAt) roi vao khoang [fromDate, toDate]. Mac dinh
// khong loc theo role de khop dung logic KPI "CTV/TeamLead active" tren Dashboard hien tai
// (chi loc theo ngay tao, khong phan biet role).
function countCtv({ fromDate, toDate, roleFilter = 'ALL' }) {
  const { rows, totalRawRows } = readUsersFullMerged();

  if (totalRawRows === 0) {
    const error = new Error('Chua co du lieu user nao duoc dong bo local. Vui long chay dong bo DS user truoc.');

    error.code = 'NO_SYNCED_DATA';
    throw error;
  }

  const normalizedRoleFilter = valueToText(roleFilter).toUpperCase() || 'ALL';

  const matched = rows.filter((user) => {
    if (!isWithinRange(extractUserCreatedAt(user), fromDate, toDate)) return false;

    if (normalizedRoleFilter !== 'ALL' && extractUserRole(user) !== normalizedRoleFilter) return false;

    return true;
  });

  return {
    count: matched.length,
    totalSyncedUsers: totalRawRows,
    fromDate,
    toDate,
    roleFilter: normalizedRoleFilter,
    note: 'Du lieu tinh tu ban dong bo local gan nhat, co the tre vai ngay so voi he thong that.',
  };
}

// Thong ke don vay cap nhat (updatedAt) trong khoang thoi gian: tong so don, so don da dong
// (CLOSED), tong so tien duyet.
function getLoanStats({ fromDate, toDate }) {
  const { rows } = readLoansFullMerged();

  if (rows.length === 0) {
    const error = new Error('Chua co du lieu don vay nao duoc dong bo local. Vui long chay dong bo DS don vay truoc.');

    error.code = 'NO_SYNCED_DATA';
    throw error;
  }

  let totalApprovedAmount = 0;
  let closedLoans = 0;
  let totalLoans = 0;

  rows.forEach((loan) => {
    if (!isWithinRange(extractLoanUpdatedAt(loan), fromDate, toDate)) return;

    totalLoans += 1;

    // Doanh so/giai ngan CHI tinh tren don da CLOSED (khop dung logic Dashboard -
    // calculateLoanDashboardMetrics). Truoc day cong nham tien cua MOI don trong khoang
    // (ke ca REJECTED/EXPIRED/CANCEL...), khien tong tien bi thoi len sai gap nhieu lan.
    if (!isClosedLoan(loan)) return;

    closedLoans += 1;

    const amount = parseAmount(extractLoanApprovedAmount(loan));

    if (amount) totalApprovedAmount += amount;
  });

  return {
    totalLoans,
    closedLoans,
    totalApprovedAmount,
    fromDate,
    toDate,
    note: 'Du lieu tinh tu ban dong bo local gan nhat, co the tre vai ngay so voi he thong that.',
  };
}

function getDataFreshness() {
  return getSyncFreshness();
}

module.exports = {
  countCtv,
  getLoanStats,
  getDataFreshness,
};
