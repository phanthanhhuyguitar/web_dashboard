const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/outputPaths.cjs');
const {
  LOAN_MASTER_FILE,
  LOAN_MASTER_RELATIVE_PATH,
  extractLoanApprovedAmount,
  extractLoanOwnerSaleId,
  isClosedLoan,
  isLoanInMonthByUpdatedAt,
  normalizeKey,
  parseAmount,
  readJsonLines,
} = require('../utils/loanFileStore.cjs');

const USER_DETAIL_RELATIVE_PATH = 'output/users/list_user_detail_all.txt';
const USER_DETAIL_FILE_PATH = path.join(PROJECT_ROOT, 'output', 'users', 'list_user_detail_all.txt');

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
  'tnexLinked',
  'isTnexLinked',
  'linkedTnex',
  'tnexAccountLinked',
  'hasTnexAccount',
  'tnexAccountStatus',
  'accountStatus',
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

function getUserDetailFilePath() {
  return USER_DETAIL_FILE_PATH;
}

function parseJsonLines(content) {
  const rows = [];
  let invalidLines = 0;
  const lines = String(content || '').split(/\r?\n/);

  lines.forEach((line) => {
    const value = line.trim();

    if (!value) return;

    try {
      rows.push(JSON.parse(value));
    } catch {
      invalidLines += 1;
    }
  });

  return {
    rows,
    invalidLines,
    totalRawRows: rows.length + invalidLines,
  };
}

function readUserDetailRows() {
  const filePath = getUserDetailFilePath();

  if (!fs.existsSync(filePath)) {
    const error = new Error('Chua co file du lieu user detail. Vui long dong bo chi tiet DS user truoc.');
    error.code = 'USER_DETAIL_FILE_NOT_FOUND';
    throw error;
  }

  return parseJsonLines(fs.readFileSync(filePath, 'utf8'));
}

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

function extractSaleId(row) {
  return valueToText(getNestedFirstValue(row, SALE_ID_KEYS));
}

function extractUserId(row) {
  return valueToText(getNestedFirstValue(row, USER_ID_KEYS));
}

function extractCreatedAt(row) {
  return getNestedFirstValue(row, CREATED_AT_KEYS);
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
    new Set(['TRUE', 'SIGNED', 'YES', 'Y', 'DA_KY', 'DA KY', 'DÃ KY', 'ĐÃ KÝ']),
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
  const { rows, invalidLines, totalRawRows } = readUserDetailRows();
  const matchedResult = getMatchedSegmentUsersFromRows(rows, filters);
  const { matchedItems, loanMeta } = matchedResult;
  const result = paginate(matchedItems, page, size);

  return {
    ...result,
    meta: {
      userFilePath: USER_DETAIL_RELATIVE_PATH,
      totalRawRows,
      invalidLines,
      totalMatched: matchedItems.length,
      ...loanMeta,
    },
  };
}

function getMatchedSegmentUsersFromRows(rows, filters = {}) {
  let matchedItems = filterUserRows(rows, filters);
  const loanFilterApplied = hasDisbursementFilter(filters);
  let loanMeta = {
    loanFilePath: null,
    loanFilterApplied,
    totalLoanRows: 0,
    totalClosedLoanRows: 0,
    invalidLoanLines: 0,
    invalidAmountRows: 0,
  };

  if (loanFilterApplied) {
    const loanRows = readJsonLines(LOAN_MASTER_FILE);

    if (!loanRows.exists) {
      const error = new Error('Chua co du lieu don vay. Vui long dong bo don vay truoc.');
      error.code = 'LOAN_FILE_NOT_FOUND';
      throw error;
    }

    const loanAmountResult = buildApprovedAmountBySaleId(loanRows.rows, filters);

    matchedItems = applyDisbursementFilter(matchedItems, loanAmountResult.amountBySaleId, filters);
    loanMeta = {
      loanFilePath: LOAN_MASTER_RELATIVE_PATH,
      loanFilterApplied,
      totalLoanRows: loanRows.rows.length,
      totalClosedLoanRows: loanAmountResult.totalClosedLoanRows,
      invalidLoanLines: loanRows.invalidLines,
      invalidAmountRows: loanAmountResult.invalidAmountRows,
    };
  }

  return {
    matchedItems,
    loanMeta,
  };
}

function getMatchedSegmentUsers(filters = {}) {
  const { rows } = readUserDetailRows();

  return getMatchedSegmentUsersFromRows(rows, filters).matchedItems;
}

module.exports = {
  USER_DETAIL_RELATIVE_PATH,
  filterUserRows,
  paginate,
  parseJsonLines,
  readUserDetailRows,
  getMatchedSegmentUsers,
  searchSegmentUsers,
  extractSaleId,
  extractUserId,
  extractCreatedAt,
  extractContractStatus,
  extractTnexLinkedStatus,
  extractOrganizationValues,
};
