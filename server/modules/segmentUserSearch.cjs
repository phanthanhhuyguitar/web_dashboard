const {
  extractLoanApprovedAmount,
  extractLoanOwnerSaleId,
  isClosedLoan,
  isLoanInMonthByUpdatedAt,
  normalizeKey,
  parseAmount,
} = require('../utils/loanFileStore.cjs');
const { readUsersFullMerged } = require('../utils/userStoreV2.cjs');
const { readLoansFullMerged } = require('../utils/loanStoreV2.cjs');

const SALE_ID_KEYS = ['saleId', 'saleID', 'sale_id', 'saleCode', 'sale_code', 'ctvCode', 'ctv_code', 'code', 'referralCode'];
const USER_ID_KEYS = ['userId', 'id', 'dsUserId', 'digitalSaleUserId', 'user_id'];
const CREATED_AT_KEYS = ['createdAt', 'createAt', 'createdDate', 'createdTime', 'created_at', 'registerDate', 'registeredAt'];
const CONTRACT_STATUS_KEYS = [
  'contractStatus',
  'signContractStatus',
  'contractSignedStatus',
  'isContractSigned',
  'signedContract',
  'hasSignedContract',
];
const TNEX_LINKED_KEYS = [
  'isVerified',
  'tnexLinked',
  'isTnexLinked',
  'linkedTnex',
  'tnexAccountLinked',
  'hasTnexAccount',
  'tnexAccountStatus',
];
const ORGANIZATION_KEYS = [
  'organizationId',
  'orgId',
  'orgUnitId',
  'organizationCode',
  'orgCode',
  'posId',
  'posCode',
  'teamId',
  'partnerCode',
];
const LOAN_CREATED_AT_KEYS = ['created_at', 'createdAt'];
const LOAN_UPDATED_AT_KEYS = ['updated_at', 'updatedAt'];
const ROLE_CODE_KEYS = ['roleCode'];

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function getOwnFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && valueToText(source[key]) !== '') {
      return source[key];
    }
  }

  return undefined;
}

function getNestedFirstValue(source, keys) {
  const directValue = getOwnFirstValue(source, keys);

  if (directValue !== undefined) return directValue;

  if (source?.contract && typeof source.contract === 'object') {
    const contractValue = getOwnFirstValue(source.contract, keys);

    if (contractValue !== undefined) return contractValue;
  }

  if (Array.isArray(source?.orgInfos)) {
    for (const orgInfo of source.orgInfos) {
      const orgValue = getOwnFirstValue(orgInfo, keys);

      if (orgValue !== undefined) return orgValue;
    }
  }

  return undefined;
}

// saleId thuc luon khong co tien to "DR" - mot so user chi co referralCode dang
// "DR028605" (thieu field saleId rieng), nen phai bo tien to nay de khop dung voi
// ownerSaleId cua don vay (khong bao gio co "DR").
function extractSaleId(row) {
  return valueToText(getNestedFirstValue(row, SALE_ID_KEYS)).replace(/^DR/i, '');
}

function extractUserId(row) {
  return valueToText(getNestedFirstValue(row, USER_ID_KEYS));
}

function extractCreatedAt(row) {
  return getNestedFirstValue(row, CREATED_AT_KEYS);
}

function extractLoanCreatedAt(loan) {
  return getOwnFirstValue(loan, LOAN_CREATED_AT_KEYS);
}

function extractLoanUpdatedAt(loan) {
  return getOwnFirstValue(loan, LOAN_UPDATED_AT_KEYS);
}

function extractContractStatus(row) {
  return getNestedFirstValue(row, CONTRACT_STATUS_KEYS);
}

function extractTnexLinkedStatus(row) {
  const explicitValue = getNestedFirstValue(row, TNEX_LINKED_KEYS);

  if (explicitValue !== undefined) return explicitValue;

  if (row?.bankInfo && typeof row.bankInfo === 'object') return true;

  return undefined;
}

function extractRoleCode(row) {
  return valueToText(getOwnFirstValue(row?.roleInfo, ROLE_CODE_KEYS));
}

function extractOrganizationValues(row) {
  const values = [];
  const addValue = (value) => {
    const text = valueToText(value);

    if (text) values.push(text);
  };

  ORGANIZATION_KEYS.forEach((key) => addValue(row?.[key]));

  if (Array.isArray(row?.orgInfos)) {
    row.orgInfos.forEach((orgInfo) => {
      ORGANIZATION_KEYS.forEach((key) => addValue(orgInfo?.[key]));
    });
  }

  return values;
}

function normalizeComparable(value) {
  return valueToText(value).toUpperCase();
}

function extractOrgCodes(row) {
  if (!Array.isArray(row?.orgInfos)) return [];

  return row.orgInfos.map((orgInfo) => normalizeComparable(orgInfo?.orgCode)).filter(Boolean);
}

function parseDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = valueToText(value);
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const dmyMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyMatch) {
    return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
  }

  const mdyMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mdyMatch) {
    return new Date(Number(mdyMatch[3]), Number(mdyMatch[1]) - 1, Number(mdyMatch[2]));
  }

  const parsed = new Date(text);

  if (!Number.isFinite(parsed.getTime())) return null;

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function normalizeBooleanStatus(value, trueValues, falseValues) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const text = normalizeComparable(value);

  if (!text) return null;
  if (trueValues.has(text)) return true;
  if (falseValues.has(text)) return false;

  return null;
}

function normalizeContractStatus(value) {
  return normalizeBooleanStatus(
    value,
    new Set(['TRUE', 'SIGNED', 'YES', 'Y', 'DA_KY', 'DA KY', 'ĐÃ KÝ']),
    new Set(['FALSE', 'NOT_SIGNED', 'NO', 'N', 'CHUA_KY', 'CHUA KY', 'CHƯA KÝ'])
  );
}

function normalizeTnexLinkedStatus(value) {
  return normalizeBooleanStatus(
    value,
    new Set(['TRUE', 'LINKED', 'YES', 'Y', 'ACTIVE']),
    new Set(['FALSE', 'NOT_LINKED', 'NO', 'N', 'INACTIVE'])
  );
}

function matchesDateFilter(row, filters) {
  const fromDate = parseDateOnly(filters.createdFrom);
  const toDate = parseDateOnly(filters.createdTo);

  if (!fromDate && !toDate) return true;

  const createdDate = parseDateOnly(extractCreatedAt(row));

  if (!createdDate) return false;
  if (fromDate && createdDate < fromDate) return false;
  if (toDate && createdDate > toDate) return false;

  return true;
}

function matchesContractFilter(row, filters) {
  const expected = normalizeComparable(filters.contractStatus || 'ALL');

  if (!expected || expected === 'ALL') return true;

  const status = normalizeContractStatus(extractContractStatus(row));

  if (status === null) return false;

  return expected === 'SIGNED' ? status : !status;
}

function matchesTnexLinkedFilter(row, filters) {
  const expected = normalizeComparable(filters.tnexLinkedStatus || 'ALL');

  if (!expected || expected === 'ALL') return true;

  const status = normalizeTnexLinkedStatus(extractTnexLinkedStatus(row));

  if (status === null) return false;

  return expected === 'LINKED' ? status : !status;
}

function matchesSaleIdFilter(row, filters) {
  const keyword = normalizeComparable(filters.saleId);

  if (!keyword) return true;

  return normalizeComparable(extractSaleId(row)).includes(keyword);
}

function matchesRoleFilter(row, filters) {
  const expected = normalizeComparable(filters.role || 'ALL');

  if (!expected || expected === 'ALL') return true;

  return normalizeComparable(extractRoleCode(row)) === expected;
}

function matchesOrganizationFilter(row, filters) {
  const expected = valueToText(filters.organizationCode || filters.organizationId);
  const normalizedExpected = normalizeComparable(expected);

  if (!expected || normalizedExpected === 'ALL') return true;

  const orgCodes = extractOrgCodes(row);

  if (orgCodes.length > 0) {
    return orgCodes.some((orgCode) => orgCode === normalizedExpected);
  }

  return extractOrganizationValues(row).some((value) => normalizeComparable(value) === normalizedExpected);
}

function normalizeResultRow(row) {
  const saleId = extractSaleId(row);
  const userId = extractUserId(row);

  if (!saleId || !userId) return null;

  return {
    saleId,
    userId,
  };
}

function filterUserRows(rows, filters = {}) {
  return rows
    .filter((row) => matchesDateFilter(row, filters))
    .filter((row) => matchesContractFilter(row, filters))
    .filter((row) => matchesTnexLinkedFilter(row, filters))
    .filter((row) => matchesOrganizationFilter(row, filters))
    .filter((row) => matchesSaleIdFilter(row, filters))
    .filter((row) => matchesRoleFilter(row, filters))
    .map(normalizeResultRow)
    .filter(Boolean);
}

function hasDisbursementFilter(filters = {}) {
  return Boolean(
    valueToText(filters.disbursementMonth) ||
      valueToText(filters.disbursementAmountFrom) ||
      valueToText(filters.disbursementAmountTo)
  );
}

function hasRevenueActivityFilter(filters = {}) {
  const status = normalizeComparable(filters.revenueActivityStatus || 'ALL');

  return Boolean(status !== 'ALL' || valueToText(filters.revenueActivityFrom) || valueToText(filters.revenueActivityTo));
}

function shouldApplyRevenueActivityStatus(filters = {}) {
  const status = normalizeComparable(filters.revenueActivityStatus || 'ALL');

  return status === 'HAS_REVENUE' || status === 'NO_REVENUE';
}

function isDateInRange(value, fromDate, toDate) {
  const date = parseDateOnly(value);

  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;

  return true;
}

function isLoanInRevenueActivityRange(loan, filters = {}) {
  const fromDate = parseDateOnly(filters.revenueActivityFrom);
  const toDate = parseDateOnly(filters.revenueActivityTo);

  if (!fromDate && !toDate) return true;

  return isDateInRange(extractLoanCreatedAt(loan), fromDate, toDate) || isDateInRange(extractLoanUpdatedAt(loan), fromDate, toDate);
}

function buildSaleIdsWithRevenue(loans, filters = {}) {
  const saleIdsWithRevenue = new Set();
  let matchedRevenueLoanRows = 0;

  loans.forEach((loan) => {
    if (!isLoanInRevenueActivityRange(loan, filters)) return;

    const ownerSaleId = normalizeKey(extractLoanOwnerSaleId(loan));

    if (!ownerSaleId) return;

    matchedRevenueLoanRows += 1;
    saleIdsWithRevenue.add(ownerSaleId);
  });

  return {
    saleIdsWithRevenue,
    matchedRevenueLoanRows,
  };
}

function applyRevenueActivityFilter(users, saleIdsWithRevenue, filters = {}) {
  const status = normalizeComparable(filters.revenueActivityStatus || 'ALL');

  if (status === 'HAS_REVENUE') {
    return users.filter((user) => saleIdsWithRevenue.has(normalizeKey(user.saleId)));
  }

  if (status === 'NO_REVENUE') {
    return users.filter((user) => !saleIdsWithRevenue.has(normalizeKey(user.saleId)));
  }

  return users;
}

function buildApprovedAmountBySaleId(loans, filters = {}) {
  const amountBySaleId = new Map();
  let totalClosedLoanRows = 0;
  let invalidAmountRows = 0;

  loans.forEach((loan) => {
    if (!isClosedLoan(loan)) return;

    totalClosedLoanRows += 1;

    if (!isLoanInMonthByUpdatedAt(loan, filters.disbursementMonth)) return;

    const ownerSaleId = normalizeKey(extractLoanOwnerSaleId(loan));

    if (!ownerSaleId) return;

    const amount = parseAmount(extractLoanApprovedAmount(loan));

    if (amount === null) {
      invalidAmountRows += 1;
      return;
    }

    amountBySaleId.set(ownerSaleId, (amountBySaleId.get(ownerSaleId) || 0) + amount);
  });

  return {
    amountBySaleId,
    totalClosedLoanRows,
    invalidAmountRows,
  };
}

function applyDisbursementFilter(users, amountBySaleId, filters = {}) {
  const minAmount = valueToText(filters.disbursementAmountFrom) ? Number(filters.disbursementAmountFrom) : null;
  const maxAmount = valueToText(filters.disbursementAmountTo) ? Number(filters.disbursementAmountTo) : null;

  return users
    .map((user) => ({
      ...user,
      totalApprovedAmount: amountBySaleId.get(normalizeKey(user.saleId)) || 0,
    }))
    .filter((user) => {
      if (minAmount !== null && user.totalApprovedAmount < minAmount) return false;
      if (maxAmount !== null && user.totalApprovedAmount > maxAmount) return false;

      return true;
    });
}

function throwInvalidFilter(message) {
  const error = new Error(message);

  error.code = 'INVALID_SEGMENT_FILTER';
  throw error;
}

function validateSearchFilters(filters = {}) {
  if (filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo) {
    throwInvalidFilter('Từ ngày tạo tài khoản không được lớn hơn Đến ngày tạo tài khoản.');
  }

  if (filters.revenueActivityFrom && filters.revenueActivityTo && filters.revenueActivityFrom > filters.revenueActivityTo) {
    throwInvalidFilter('Từ ngày phát sinh doanh số không được lớn hơn Đến ngày phát sinh doanh số.');
  }

  const minAmount = valueToText(filters.disbursementAmountFrom) ? Number(filters.disbursementAmountFrom) : null;
  const maxAmount = valueToText(filters.disbursementAmountTo) ? Number(filters.disbursementAmountTo) : null;

  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throwInvalidFilter('Doanh số tối thiểu không được lớn hơn doanh số tối đa.');
  }
}

function paginate(items, page, size) {
  const pageSize = Math.max(Number(size) || 10, 1);
  const zeroBasedPage = Math.max(Number(page) || 0, 0);
  const startIndex = zeroBasedPage * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: zeroBasedPage,
    size: pageSize,
    total: items.length,
  };
}

function searchSegmentUsers({ filters = {}, page = 0, size = 10 } = {}) {
  validateSearchFilters(filters);

  const { rows, invalidLines, totalRawRows } = readUsersFullMerged();

  if (rows.length === 0) {
    const error = new Error('Chua co du lieu user trong SQLite. Vui long dong bo DS user truoc.');
    error.code = 'USER_DETAIL_FILE_NOT_FOUND';
    throw error;
  }

  const matchedResult = getMatchedSegmentUsersFromRows(rows, filters);
  const { matchedItems, loanMeta } = matchedResult;
  const result = paginate(matchedItems, page, size);

  return {
    ...result,
    meta: {
      userFilePath: 'sqlite:users_full',
      totalRawRows,
      invalidLines,
      totalMatched: matchedItems.length,
      ...loanMeta,
    },
  };
}

function getMatchedSegmentUsersFromRows(rows, filters = {}) {
  let matchedItems = filterUserRows(rows, filters);
  const disbursementFilterApplied = hasDisbursementFilter(filters);
  const revenueActivityApplied = hasRevenueActivityFilter(filters);
  const loanFilterApplied = disbursementFilterApplied || revenueActivityApplied;
  let loanMeta = {
    loanFilePath: null,
    loanFilterApplied,
    disbursementFilterApplied,
    revenueActivityApplied,
    totalLoanRows: 0,
    totalClosedLoanRows: 0,
    invalidLoanLines: 0,
    invalidAmountRows: 0,
    matchedRevenueSaleIds: [],
    matchedRevenueLoanRows: 0,
  };

  if (loanFilterApplied) {
    const loanRows = readLoansFullMerged();

    if (loanRows.rows.length === 0) {
      const error = new Error('Chưa có dữ liệu đơn vay. Vui lòng đồng bộ đơn vay trước.');
      error.code = 'LOAN_FILE_NOT_FOUND';
      throw error;
    }

    let totalClosedLoanRows = 0;
    let invalidAmountRows = 0;
    let matchedRevenueSaleIds = [];
    let matchedRevenueLoanRows = 0;

    if (revenueActivityApplied) {
      const revenueResult = buildSaleIdsWithRevenue(loanRows.rows, filters);

      matchedRevenueSaleIds = Array.from(revenueResult.saleIdsWithRevenue);
      matchedRevenueLoanRows = revenueResult.matchedRevenueLoanRows;

      if (shouldApplyRevenueActivityStatus(filters)) {
        matchedItems = applyRevenueActivityFilter(matchedItems, revenueResult.saleIdsWithRevenue, filters);
      }
    }

    if (disbursementFilterApplied) {
      const loanAmountResult = buildApprovedAmountBySaleId(loanRows.rows, filters);

      totalClosedLoanRows = loanAmountResult.totalClosedLoanRows;
      invalidAmountRows = loanAmountResult.invalidAmountRows;
      matchedItems = applyDisbursementFilter(matchedItems, loanAmountResult.amountBySaleId, filters);
    }

    loanMeta = {
      loanFilePath: 'sqlite:loans_full',
      loanFilterApplied,
      disbursementFilterApplied,
      revenueActivityApplied,
      totalLoanRows: loanRows.rows.length,
      totalClosedLoanRows,
      invalidLoanLines: loanRows.invalidLines,
      invalidAmountRows,
      matchedRevenueSaleIds,
      matchedRevenueLoanRows,
    };
  }

  return {
    matchedItems,
    loanMeta,
  };
}

function getMatchedSegmentUsers(filters = {}) {
  validateSearchFilters(filters);

  const { rows } = readUsersFullMerged();

  return getMatchedSegmentUsersFromRows(rows, filters).matchedItems;
}

module.exports = {
  filterUserRows,
  paginate,
  getMatchedSegmentUsers,
  searchSegmentUsers,
  extractSaleId,
  extractUserId,
  extractCreatedAt,
  extractContractStatus,
  extractTnexLinkedStatus,
  extractOrganizationValues,
};
