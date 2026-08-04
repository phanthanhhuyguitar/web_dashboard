// Nguon MOI (song song voi loanStore.cjs cu, KHONG thay the) - ghi vao bang loans_full (tu
// LOAN list sync) va loan_events (tu LOAN_DETAIL sync - day la log lich su trang thai, KHONG
// phai 1 record phang gop duoc vao loans_full).
const { getDb } = require('./db.cjs');
const {
  extractLoanApprovedAmount,
  extractLoanId,
  extractLoanOwnerSaleId,
  extractLoanStatus,
  extractLoanUpdatedAt,
  parseAmount,
  valueToText,
} = require('./loanFileStore.cjs');

const UPSERT_LOAN_SQL = `
  INSERT INTO loans_full (
    loanId, id, userId, saleId, ownerSaleId, referralCode, productId, status,
    approvedAmount, requestedAmount, customerId, customerName, customerPhoneNumber,
    leadInfoJson, createdAt, updatedAt, syncedAt, rawJson
  ) VALUES (
    @loanId, @id, @userId, @saleId, @ownerSaleId, @referralCode, @productId, @status,
    @approvedAmount, @requestedAmount, @customerId, @customerName, @customerPhoneNumber,
    @leadInfoJson, @createdAt, @updatedAt, @syncedAt, @rawJson
  )
  ON CONFLICT(loanId) DO UPDATE SET
    id = excluded.id,
    userId = excluded.userId,
    saleId = excluded.saleId,
    ownerSaleId = excluded.ownerSaleId,
    referralCode = excluded.referralCode,
    productId = excluded.productId,
    status = excluded.status,
    approvedAmount = excluded.approvedAmount,
    requestedAmount = excluded.requestedAmount,
    customerId = excluded.customerId,
    customerName = excluded.customerName,
    customerPhoneNumber = excluded.customerPhoneNumber,
    leadInfoJson = excluded.leadInfoJson,
    updatedAt = excluded.updatedAt,
    syncedAt = excluded.syncedAt,
    rawJson = excluded.rawJson
`;

const INSERT_LOAN_EVENT_SQL = `
  INSERT INTO loan_events (
    loanId, eventStatus, eventTime, productId, loanAmount, loanApprovedAmount,
    referralCode, createdAt, syncedAt
  ) VALUES (
    @loanId, @eventStatus, @eventTime, @productId, @loanAmount, @loanApprovedAmount,
    @referralCode, @createdAt, @syncedAt
  )
  ON CONFLICT(loanId, eventStatus, eventTime) DO NOTHING
`;

function toLoanRow(rawLoan) {
  const loanId = extractLoanId(rawLoan);

  if (!loanId) return null;

  const now = new Date().toISOString();

  return {
    loanId,
    id: valueToText(rawLoan?.id),
    userId: valueToText(rawLoan?.userId),
    saleId: valueToText(rawLoan?.saleId),
    ownerSaleId: extractLoanOwnerSaleId(rawLoan),
    referralCode: valueToText(rawLoan?.referralCode),
    productId: valueToText(rawLoan?.productId),
    status: extractLoanStatus(rawLoan),
    approvedAmount: parseAmount(extractLoanApprovedAmount(rawLoan)),
    requestedAmount: parseAmount(rawLoan?.requestedAmount),
    customerId: valueToText(rawLoan?.customerId),
    customerName: valueToText(rawLoan?.customerName),
    customerPhoneNumber: valueToText(rawLoan?.customerPhoneNumber),
    leadInfoJson: valueToText(rawLoan?.leadInfo),
    createdAt: valueToText(rawLoan?.createdAt),
    updatedAt: valueToText(extractLoanUpdatedAt(rawLoan)),
    syncedAt: now,
    rawJson: JSON.stringify(rawLoan),
  };
}

// rawLoans: mang object tho tu API loans list (LOAN job) - dung nguyen du lieu da fetch.
function upsertLoansFullFromList(rawLoans) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_LOAN_SQL);
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });
  const rows = rawLoans.map(toLoanRow).filter(Boolean);

  if (rows.length > 0) runBatch(rows);

  return rows.length;
}

// events: mang "detail" tra ve tu API loan-detail cho 1 loanId (LOAN_DETAIL job) - moi phan tu
// la 1 su kien trang thai (eventStatus/eventTime...). Ghi cho day du, chua co noi nao doc.
function upsertLoanEventsFromDetail(loanId, events) {
  if (!loanId || !Array.isArray(events) || events.length === 0) return 0;

  const db = getDb();
  const stmt = db.prepare(INSERT_LOAN_EVENT_SQL);
  const now = new Date().toISOString();
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = events.map((event) => ({
    loanId: valueToText(loanId),
    eventStatus: valueToText(event?.eventStatus),
    eventTime: valueToText(event?.eventTime),
    productId: valueToText(event?.productId),
    loanAmount: parseAmount(event?.loanAmount),
    loanApprovedAmount: parseAmount(event?.loanApprovedAmount),
    referralCode: valueToText(event?.referralCode),
    createdAt: valueToText(event?.createdAt),
    syncedAt: now,
  }));

  runBatch(rows);

  return rows.length;
}

// Doc toan bo loans_full, tra ve rawJson da parse - cung shape nhu readAllLoanRawRows() cu,
// de tai su dung nguyen logic loc/tinh toan hien co (segmentUserSearch.cjs,
// segmentConversionAnalytics.cjs), chi thay nguon nap du lieu dau vao.
function readLoansFullMerged() {
  const db = getDb();
  const rows = db.prepare('SELECT rawJson FROM loans_full').all();
  const parsed = [];
  let invalidLines = 0;

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
  upsertLoansFullFromList,
  upsertLoanEventsFromDetail,
  readLoansFullMerged,
};
