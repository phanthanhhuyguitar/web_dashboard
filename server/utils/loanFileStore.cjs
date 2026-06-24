const fs = require('fs');
const path = require('path');

const { LOANS_OUTPUT_DIR } = require('./outputPaths.cjs');

const LOAN_MASTER_FILE_NAME = 'list_loan_all.txt';
const LOAN_MASTER_FILE = path.join(LOANS_OUTPUT_DIR, LOAN_MASTER_FILE_NAME);
const LOAN_MASTER_RELATIVE_PATH = `output/loans/${LOAN_MASTER_FILE_NAME}`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      rows: [],
      invalidLines: 0,
      exists: false,
    };
  }

  const rows = [];
  let invalidLines = 0;
  const content = fs.readFileSync(filePath, 'utf8');

  content.split(/\r?\n/).forEach((line) => {
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
    exists: true,
  };
}

function writeJsonLines(filePath, rows) {
  ensureDir(path.dirname(filePath));
  const content = rows.map((row) => JSON.stringify(row)).join('\n');

  fs.writeFileSync(filePath, content ? `${content}\n` : '', 'utf8');
}

function appendJsonLine(stream, row) {
  stream.write(`${JSON.stringify(row)}\n`);
}

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function normalizeKey(value) {
  return valueToText(value).toUpperCase();
}

function getFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    const value = source[key];

    if (value !== undefined && value !== null && valueToText(value) !== '') {
      return value;
    }
  }

  return undefined;
}

function extractLoanId(loan) {
  return valueToText(getFirstValue(loan, ['loanId', 'paymentId', 'applicationId', 'id']));
}

function extractLoanOwnerSaleId(loan) {
  return valueToText(getFirstValue(loan, ['ownerSaleId', 'saleId', 'saleCode', 'owner_sale_id']));
}

function extractLoanStatus(loan) {
  return valueToText(getFirstValue(loan, ['status', 'loanStatus', 'applicationStatus']));
}

function extractLoanApprovedAmount(loan) {
  return getFirstValue(loan, ['approvedAmount', 'amount', 'loanAmount', 'disbursementAmount']);
}

function extractLoanUpdatedAt(loan) {
  return getFirstValue(loan, ['updatedAt', 'updateAt', 'updatedDate', 'updated_time']);
}

function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = valueToText(value);

  if (!text) return null;

  const normalized = text.replace(/\s/g, '').replace(/[,.]/g, '');
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value) {
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

  const parsed = new Date(text);

  if (!Number.isFinite(parsed.getTime())) return null;

  return parsed;
}

function getLoanUniqueKey(loan) {
  const id = extractLoanId(loan);

  if (id) return `ID:${normalizeKey(id)}`;

  const fallback = [
    extractLoanOwnerSaleId(loan),
    getFirstValue(loan, ['createdAt', 'createdDate', 'created_time']),
    extractLoanUpdatedAt(loan),
    extractLoanApprovedAmount(loan),
    extractLoanStatus(loan),
  ]
    .map(normalizeKey)
    .join('|');

  return fallback.replace(/\|/g, '') ? `FALLBACK:${fallback}` : '';
}

function mergeLoans(oldLoans, newLoans) {
  const loanMap = new Map();
  let inserted = 0;
  let updated = 0;

  oldLoans.forEach((loan) => {
    const key = getLoanUniqueKey(loan);

    if (key) {
      loanMap.set(key, loan);
    }
  });

  newLoans.forEach((loan) => {
    const key = getLoanUniqueKey(loan);

    if (!key) return;

    if (loanMap.has(key)) {
      updated += 1;
    } else {
      inserted += 1;
    }

    loanMap.set(key, loan);
  });

  return {
    rows: Array.from(loanMap.values()),
    inserted,
    updated,
  };
}

function isClosedLoan(loan) {
  return normalizeKey(extractLoanStatus(loan)) === 'CLOSED';
}

function isLoanInMonthByUpdatedAt(loan, yyyyMM) {
  const month = valueToText(yyyyMM);

  if (!month) return true;

  const updatedDate = parseDate(extractLoanUpdatedAt(loan));

  if (!updatedDate) return false;

  const loanMonth = `${updatedDate.getFullYear()}-${String(updatedDate.getMonth() + 1).padStart(2, '0')}`;

  return loanMonth === month;
}

module.exports = {
  LOAN_MASTER_FILE,
  LOAN_MASTER_RELATIVE_PATH,
  appendJsonLine,
  ensureDir,
  extractLoanApprovedAmount,
  extractLoanId,
  extractLoanOwnerSaleId,
  extractLoanStatus,
  extractLoanUpdatedAt,
  getLoanUniqueKey,
  isClosedLoan,
  isLoanInMonthByUpdatedAt,
  mergeLoans,
  normalizeKey,
  parseAmount,
  readJsonLines,
  valueToText,
  writeJsonLines,
};
