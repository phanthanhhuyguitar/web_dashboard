const { LOAN_MASTER_RELATIVE_PATH, normalizeKey, parseAmount, readJsonLines, valueToText } = require('../utils/loanFileStore.cjs');
const { LOANS_OUTPUT_DIR } = require('../utils/outputPaths.cjs');
const path = require('path');

const LOAN_DETAIL_MASTER_FILE = path.join(LOANS_OUTPUT_DIR, 'list_loan_detail_all.txt');
const LOAN_DETAIL_MASTER_RELATIVE_PATH = 'output/loans/list_loan_detail_all.txt';

function getFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && valueToText(value) !== '') return value;
  }

  return undefined;
}

function normalizeSaleId(value) {
  return normalizeKey(value);
}

function getMonthText(value) {
  const text = valueToText(value);

  if (!text) return '';

  const match = text.match(/(\d{4})[-/](\d{2})/);

  return match ? `${match[1]}-${match[2]}` : '';
}

function isClosedStatus(status) {
  return normalizeKey(status) === 'CLOSED';
}

function extractSaleId(record) {
  return valueToText(
    getFirstValue(record, ['ownerSaleId', 'saleId', 'saleCode', 'owner_sale_id']) ||
      getLeadInfoValue(record, ['sale_id', 'saleId', 'saleCode'])
  );
}

function getLeadInfoValue(record, keys) {
  const rawLeadInfo = record?.leadInfo;

  if (!rawLeadInfo) return '';

  if (typeof rawLeadInfo === 'object') {
    return getFirstValue(rawLeadInfo, keys);
  }

  try {
    const parsed = JSON.parse(rawLeadInfo);
    return getFirstValue(parsed, keys);
  } catch {
    return '';
  }
}

function extractLoanId(record) {
  return valueToText(getFirstValue(record, ['loanId', 'id', 'applicationId', 'paymentId']));
}

function extractPhoneNumber(record) {
  return valueToText(getFirstValue(record, ['customerPhoneNumber', 'phoneNumber', 'phone', 'mobile']));
}

function extractStatus(record) {
  return valueToText(getFirstValue(record, ['eventStatus', 'status', 'loanStatus', 'applicationStatus']));
}

function extractEventTime(record) {
  return valueToText(getFirstValue(record, ['eventTime', 'updatedAt', 'updateAt', 'createdAt']));
}

function extractApprovedAmount(record) {
  return parseAmount(getFirstValue(record, ['approvedAmount', 'loanApprovedAmount', 'amount', 'loanAmount', 'disbursementAmount'])) || 0;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];

  return [];
}

function mergeWrapperFields(wrapper, item) {
  return {
    ...item,
    loanId: item.loanId ?? wrapper.loanId,
    customerPhoneNumber: item.customerPhoneNumber ?? wrapper.customerPhoneNumber,
    phoneNumber: item.phoneNumber ?? wrapper.customerPhoneNumber,
  };
}

function flattenLoanDetailWrapper(wrapper) {
  const records = [];

  asArray(wrapper.detail).forEach((item) => {
    records.push(mergeWrapperFields(wrapper, item));
  });

  const rawData = wrapper.rawResponse?.data;

  asArray(rawData).forEach((item) => {
    records.push(mergeWrapperFields(wrapper, item));
  });

  if (records.length === 0 && wrapper && typeof wrapper === 'object') {
    records.push(wrapper);
  }

  return records;
}

function getUniqueRecordKey(record) {
  return [extractLoanId(record), extractStatus(record), extractEventTime(record)].map((item) => normalizeKey(item)).join('|');
}

function buildSegmentSaleIdMap(segmentUsers = []) {
  const map = new Map();

  segmentUsers.forEach((user) => {
    const saleId = normalizeSaleId(user?.saleId);

    if (!saleId) return;

    if (!map.has(saleId)) {
      map.set(saleId, {
        saleId: valueToText(user.saleId),
        userId: valueToText(user.userId),
      });
    }
  });

  return map;
}

function summarizeUsersWithLoan(records, saleIdMap) {
  const bySaleId = new Map();

  records.forEach((record) => {
    const saleIdKey = normalizeSaleId(record.saleId);
    const current = bySaleId.get(saleIdKey) || {
      saleId: record.saleId,
      userId: saleIdMap.get(saleIdKey)?.userId || '',
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

function summarizeUsersWithClosedLoan(records, saleIdMap) {
  const bySaleId = new Map();

  records.forEach((record) => {
    const saleIdKey = normalizeSaleId(record.saleId);
    const current = bySaleId.get(saleIdKey) || {
      saleId: record.saleId,
      userId: saleIdMap.get(saleIdKey)?.userId || '',
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

function calculateSegmentConversion({ segmentUsers = [], evaluationMonth }) {
  const saleIdMap = buildSegmentSaleIdMap(segmentUsers);
  const loanDetailRows = readJsonLines(LOAN_DETAIL_MASTER_FILE);

  if (!loanDetailRows.exists) {
    const error = new Error('Chua co du lieu chi tiet don vay. Vui long dong bo chi tiet DS don vay truoc.');
    error.code = 'LOAN_DETAIL_FILE_NOT_FOUND';
    throw error;
  }

  const recordMap = new Map();

  loanDetailRows.rows.forEach((wrapper) => {
    flattenLoanDetailWrapper(wrapper).forEach((record) => {
      const saleId = extractSaleId(record);
      const saleIdKey = normalizeSaleId(saleId);

      if (!saleIdKey || !saleIdMap.has(saleIdKey)) return;

      const eventTime = extractEventTime(record);

      if (getMonthText(eventTime) !== evaluationMonth) return;

      const normalized = {
        saleId: saleIdMap.get(saleIdKey)?.saleId || saleId,
        userId: saleIdMap.get(saleIdKey)?.userId || '',
        loanId: extractLoanId(record),
        phoneNumber: extractPhoneNumber(record),
        status: extractStatus(record),
        eventTime,
        approvedAmount: extractApprovedAmount(record),
      };
      const uniqueKey = getUniqueRecordKey(normalized);

      if (uniqueKey.replace(/\|/g, '')) {
        recordMap.set(uniqueKey, normalized);
      }
    });
  });

  const loanRecordsInMonth = Array.from(recordMap.values());
  const closedLoanRecordsInMonth = loanRecordsInMonth.filter((record) => isClosedStatus(record.status));
  const usersWithLoan = summarizeUsersWithLoan(loanRecordsInMonth, saleIdMap);
  const usersWithClosedLoan = summarizeUsersWithClosedLoan(closedLoanRecordsInMonth, saleIdMap);
  const totalSegmentUsers = saleIdMap.size;
  const totalApprovedAmountClosed = closedLoanRecordsInMonth.reduce((sum, record) => sum + (record.approvedAmount || 0), 0);

  return {
    totalSegmentUsers,
    usersWithLoanCount: usersWithLoan.length,
    usersWithLoanRate: calculateRates(usersWithLoan.length, totalSegmentUsers),
    usersWithClosedLoanCount: usersWithClosedLoan.length,
    usersWithClosedLoanRate: calculateRates(usersWithClosedLoan.length, totalSegmentUsers),
    totalLoanRecordsInMonth: loanRecordsInMonth.length,
    totalClosedLoanRecordsInMonth: closedLoanRecordsInMonth.length,
    totalApprovedAmountClosed,
    usersWithLoan,
    usersWithClosedLoan,
    loanRecordsInMonth,
    closedLoanRecordsInMonth,
    meta: {
      loanDetailFilePath: LOAN_DETAIL_MASTER_RELATIVE_PATH,
      loanListFilePath: LOAN_MASTER_RELATIVE_PATH,
      invalidLines: loanDetailRows.invalidLines,
      totalParsedLoanDetailRows: loanDetailRows.rows.length,
      evaluationMonth,
    },
  };
}

module.exports = {
  calculateSegmentConversion,
};
