// Lop upsert/doc loan qua SQLite - CHI dung khi USE_SQLITE_STORE=true.
// Tai su dung nguyen logic hien co (segmentConversionAnalytics.cjs, loanFileStore.cjs) -
// module nay chi thay the NGUON doc/ghi, khong doi rule tinh toan nao ca.
const { getDb } = require('./db.cjs');
const { extractLoanApprovedAmount, extractLoanId, extractLoanOwnerSaleId, extractLoanStatus, extractLoanUpdatedAt, parseAmount, valueToText } = require('./loanFileStore.cjs');

const UPSERT_LOAN_SQL = `
  INSERT INTO loans (loanId, ownerSaleId, status, productId, approvedAmount, createdAt, updatedAt, syncedAt, rawJson)
  VALUES (@loanId, @ownerSaleId, @status, @productId, @approvedAmount, @createdAt, @updatedAt, @syncedAt, @rawJson)
  ON CONFLICT(loanId) DO UPDATE SET
    ownerSaleId = excluded.ownerSaleId,
    status = excluded.status,
    productId = excluded.productId,
    approvedAmount = excluded.approvedAmount,
    createdAt = COALESCE(NULLIF(excluded.createdAt, ''), loans.createdAt),
    updatedAt = excluded.updatedAt,
    syncedAt = excluded.syncedAt,
    rawJson = excluded.rawJson
`;

function toRow(rawLoan) {
  const loanId = extractLoanId(rawLoan);

  if (!loanId) return null;

  return {
    loanId,
    ownerSaleId: extractLoanOwnerSaleId(rawLoan),
    status: extractLoanStatus(rawLoan),
    productId: valueToText(rawLoan?.productId),
    approvedAmount: parseAmount(extractLoanApprovedAmount(rawLoan)),
    createdAt: valueToText(rawLoan?.createdAt || rawLoan?.created_at),
    updatedAt: valueToText(extractLoanUpdatedAt(rawLoan)),
    syncedAt: new Date().toISOString(),
    rawJson: JSON.stringify(rawLoan),
  };
}

// Upsert 1 batch loan (dung cho ca job LOAN va LOAN_DETAIL). Loan da co (theo loanId)
// se duoc GHI DE cac field moi nhat, khong con tinh trang "chi them moi, khong cap nhat".
function upsertLoans(rawLoans) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_LOAN_SQL);
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = rawLoans.map(toRow).filter(Boolean);

  if (rows.length > 0) runBatch(rows);

  return rows.length;
}

function getLoanSyncInfoMap() {
  const db = getDb();
  const rows = db.prepare('SELECT loanId, syncedAt FROM loans').all();
  const map = new Map();

  rows.forEach((row) => map.set(row.loanId, row.syncedAt));

  return map;
}

// Doc toan bo loan (dang rawJson da luu) - dung de thay the readJsonLines(LOAN_MASTER_FILE)
// o segmentUserSearch.cjs / segmentConversionAnalytics.cjs. Giu nguyen pipeline tinh toan hien co.
function readAllLoanRawRows() {
  const db = getDb();
  const rows = db.prepare('SELECT rawJson FROM loans').all();
  let invalidLines = 0;
  const parsed = [];

  rows.forEach(({ rawJson }) => {
    try {
      parsed.push(JSON.parse(rawJson));
    } catch {
      invalidLines += 1;
    }
  });

  return { rows: parsed, invalidLines, exists: true };
}

module.exports = {
  getLoanSyncInfoMap,
  readAllLoanRawRows,
  upsertLoans,
};
