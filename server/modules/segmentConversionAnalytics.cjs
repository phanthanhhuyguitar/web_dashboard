const {
  extractLoanApprovedAmount,
  extractLoanId,
  extractLoanStatus,
  extractLoanUpdatedAt,
  normalizeKey,
  parseAmount,
  valueToText,
} = require('../utils/loanFileStore.cjs');
const { readLoansFullMerged } = require('../utils/loanStoreV2.cjs');

const SEGMENTS_MASTER_RELATIVE_PATH = 'output/segments/segments_all.json';

function getFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && valueToText(value) !== '') return value;
  }

  return undefined;
}

function stripDrPrefix(value) {
  const text = normalizeKey(value);

  return text.startsWith('DR') ? text.slice(2) : text;
}

function normalizeSaleIdForMatch(value) {
  const text = stripDrPrefix(value);

  if (!text) return '';

  if (/^0*\d+$/.test(text)) {
    return String(Number(text));
  }

  return text;
}

function getSaleIdMatchKeys(value) {
  const raw = stripDrPrefix(value);
  const normalized = normalizeSaleIdForMatch(value);

  return Array.from(new Set([raw, normalized].filter(Boolean)));
}

function isClosedStatus(value) {
  return normalizeKey(value) === 'CLOSED';
}

function parseDateTime(value) {
  const text = valueToText(value);

  if (!text) return null;

  const parsed = new Date(text);

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function extractLoanCreatedAt(loan) {
  return getFirstValue(loan, ['createdAt', 'created_at', 'createdDate', 'created_time']);
}

function extractLoanOwnerSaleIdOnly(loan) {
  return valueToText(getFirstValue(loan, ['ownerSaleId', 'owner_sale_id']));
}

function extractPhoneNumber(loan) {
  return valueToText(getFirstValue(loan, ['customerPhoneNumber', 'phoneNumber', 'phone', 'mobile']));
}

function extractLoanTime(loan) {
  return valueToText(
    getFirstValue(loan, ['closedAt', 'closed_at', 'closedTime', 'statusUpdatedAt']) ||
      extractLoanUpdatedAt(loan) ||
      getFirstValue(loan, ['updated_at', 'createdAt', 'created_at'])
  );
}

function buildSegmentUserIndex(segmentUsers = []) {
  const bySaleId = new Map();
  const users = segmentUsers.map((user) => ({
    saleId: valueToText(user?.saleId),
    userId: valueToText(user?.userId),
  }));

  users.forEach((user) => {
    getSaleIdMatchKeys(user.saleId).forEach((saleIdKey) => {
      if (!bySaleId.has(saleIdKey)) {
        bySaleId.set(saleIdKey, user);
      }
    });
  });

  return {
    bySaleId,
    users,
    totalUsers: users.length,
  };
}

function getSegmentUserForLoan(loan, segmentUserIndex) {
  const ownerSaleId = extractLoanOwnerSaleIdOnly(loan);

  for (const saleIdKey of getSaleIdMatchKeys(ownerSaleId)) {
    if (segmentUserIndex.bySaleId.has(saleIdKey)) {
      return segmentUserIndex.bySaleId.get(saleIdKey);
    }
  }

  return null;
}

function normalizeLoanForSegment(loan, segmentUser) {
  return {
    saleId: segmentUser.saleId,
    userId: segmentUser.userId,
    ownerSaleId: extractLoanOwnerSaleIdOnly(loan),
    loanId: extractLoanId(loan),
    phoneNumber: extractPhoneNumber(loan),
    status: extractLoanStatus(loan),
    createdAt: valueToText(extractLoanCreatedAt(loan)),
    eventTime: extractLoanTime(loan),
    approvedAmount: parseAmount(extractLoanApprovedAmount(loan)) || 0,
  };
}

function summarizeUsersWithLoan(records) {
  const bySaleId = new Map();

  records.forEach((record) => {
    const saleIdKey = normalizeSaleIdForMatch(record.saleId);
    const current = bySaleId.get(saleIdKey) || {
      saleId: record.saleId,
      userId: record.userId,
      loanCount: 0,
      latestStatus: '',
      latestEventTime: '',
    };

    current.loanCount += 1;

    if (!current.latestEventTime || String(record.eventTime || '') > String(current.latestEventTime || '')) {
      current.latestStatus = record.status;
      current.latestEventTime = record.eventTime;
    }

    bySaleId.set(saleIdKey, current);
  });

  return Array.from(bySaleId.values());
}

function summarizeUsersWithClosedLoan(records) {
  const bySaleId = new Map();

  records.forEach((record) => {
    const saleIdKey = normalizeSaleIdForMatch(record.saleId);
    const current = bySaleId.get(saleIdKey) || {
      saleId: record.saleId,
      userId: record.userId,
      closedLoanCount: 0,
      totalApprovedAmount: 0,
      latestClosedTime: '',
    };

    current.closedLoanCount += 1;
    current.totalApprovedAmount += record.approvedAmount || 0;

    if (!current.latestClosedTime || String(record.eventTime || '') > String(current.latestClosedTime || '')) {
      current.latestClosedTime = record.eventTime;
    }

    bySaleId.set(saleIdKey, current);
  });

  return Array.from(bySaleId.values());
}

function calculateRates(count, total) {
  if (!total) return 0;

  return Math.round((count / total) * 10000) / 100;
}

function getSegmentCreatedAt(segment) {
  return getFirstValue(segment, ['createdAt', 'created_at', 'createdDate']);
}

function isLoanCreatedAfterSegment(loan, segmentCreatedAt) {
  const loanCreatedAt = parseDateTime(extractLoanCreatedAt(loan));

  if (!segmentCreatedAt || !loanCreatedAt) return false;

  return loanCreatedAt >= segmentCreatedAt;
}

function calculateSegmentConversion({ segment = null, segmentUsers = [], loanList = null } = {}) {
  const segmentUserIndex = buildSegmentUserIndex(segmentUsers);
  const explicitLoanList = Array.isArray(loanList);
  const loanRows = explicitLoanList
    ? {
        rows: loanList,
        invalidLines: 0,
      }
    : readLoansFullMerged();

  if (!explicitLoanList && loanRows.rows.length === 0) {
    const error = new Error('Chua co du lieu don vay. Vui long dong bo DS don vay truoc.');
    error.code = 'LOAN_FILE_NOT_FOUND';
    throw error;
  }

  const segmentCreatedAtRaw = getSegmentCreatedAt(segment);
  const segmentCreatedAt = parseDateTime(segmentCreatedAtRaw);
  const loanRecords = loanRows.rows
    .filter((loan) => isLoanCreatedAfterSegment(loan, segmentCreatedAt))
    .map((loan) => {
      const segmentUser = getSegmentUserForLoan(loan, segmentUserIndex);

      return segmentUser ? normalizeLoanForSegment(loan, segmentUser) : null;
    })
    .filter(Boolean);
  const closedLoanRecords = loanRecords.filter((record) => isClosedStatus(record.status));
  const usersWithLoan = summarizeUsersWithLoan(loanRecords);
  const usersWithClosedLoan = summarizeUsersWithClosedLoan(closedLoanRecords);
  const totalSegmentUsers = segmentUserIndex.totalUsers;
  const totalApprovedAmountClosed = closedLoanRecords.reduce((sum, record) => sum + (record.approvedAmount || 0), 0);
  const debugSummary = {
    totalSegmentUsers,
    usersWithLoanCount: usersWithLoan.length,
    usersWithLoanSaleIdsCount: usersWithLoan.length,
    closedLoanRecordsCount: closedLoanRecords.length,
    closedLoanSaleIdsCount: usersWithClosedLoan.length,
    segmentCreatedAt: valueToText(segmentCreatedAtRaw),
  };

  return {
    totalSegmentUsers,
    usersWithLoanCount: usersWithLoan.length,
    conversionRate: calculateRates(usersWithLoan.length, totalSegmentUsers),
    usersWithLoanRate: calculateRates(usersWithLoan.length, totalSegmentUsers),
    usersWithClosedLoanCount: usersWithClosedLoan.length,
    usersWithClosedLoanRate: calculateRates(usersWithClosedLoan.length, totalSegmentUsers),
    totalLoanRecordsInMonth: loanRecords.length,
    closedLoanCount: closedLoanRecords.length,
    totalClosedLoanRecordsInMonth: closedLoanRecords.length,
    totalLoanRecords: loanRecords.length,
    totalClosedLoanRecords: closedLoanRecords.length,
    approvedAmountClosed: totalApprovedAmountClosed,
    totalApprovedAmountClosed,
    userRowsWithLoan: usersWithLoan,
    closedLoanRows: closedLoanRecords,
    usersWithLoan,
    usersWithClosedLoan,
    loanRecordsInMonth: loanRecords,
    closedLoanRecordsInMonth: closedLoanRecords,
    loanRecords,
    closedLoanRecords,
    meta: {
      segmentSavedUsersSource: SEGMENTS_MASTER_RELATIVE_PATH,
      loanListFilePath: 'sqlite:loans_full',
      totalParsedLoanRows: loanRows.rows.length,
      invalidLoanListLines: loanRows.invalidLines,
      mappingRule: 'segmentUser.saleId === loan.ownerSaleId',
      segmentCreatedAtField: 'segment.createdAt',
      segmentCreatedAt: valueToText(segmentCreatedAtRaw),
      debugSummary,
    },
  };
}

module.exports = {
  calculateSegmentConversion,
};
