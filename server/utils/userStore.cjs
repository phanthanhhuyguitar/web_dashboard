// Lop upsert/doc user qua SQLite - CHI dung khi USE_SQLITE_STORE=true.
// Tai su dung nguyen logic loc/hien thi hien co (segmentUserSearch.cjs) - module nay
// chi thay the NGUON doc/ghi, khong thay doi rule loc nao ca.
const { getDb } = require('./db.cjs');

const LEAD_ROLE_KEY = 'roleCode';

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function normalizeSaleId(value) {
  return valueToText(value).replace(/^DR/i, '');
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

function extractUserId(user) {
  return valueToText(getOwnFirstValue(user, ['userId', 'id', 'dsUserId', 'digitalSaleUserId', 'user_id']));
}

// referralCode co the co tien to "DR" - saleId that khong co, xem teamMetrics.js phia FE.
function extractSaleId(user) {
  const direct = getOwnFirstValue(user, ['saleId', 'saleID', 'sale_id', 'saleCode', 'sale_code', 'ctvCode', 'ctv_code', 'code']);

  if (direct !== undefined) return normalizeSaleId(direct);

  return normalizeSaleId(getOwnFirstValue(user, ['referralCode']));
}

function extractRoleCode(user) {
  return valueToText(getOwnFirstValue(user?.roleInfo, [LEAD_ROLE_KEY]));
}

function extractContractStatus(user) {
  const value = getOwnFirstValue(user, [
    'contractStatus',
    'signContractStatus',
    'contractSignedStatus',
    'isContractSigned',
    'signedContract',
    'hasSignedContract',
  ]);

  if (value !== undefined) return valueToText(value);

  return valueToText(user?.contract?.status);
}

function extractTnexLinked(user) {
  const value = getOwnFirstValue(user, [
    'isVerified',
    'tnexLinked',
    'isTnexLinked',
    'linkedTnex',
    'tnexAccountLinked',
    'hasTnexAccount',
    'tnexAccountStatus',
  ]);

  if (value !== undefined) return value ? 1 : 0;

  return user?.bankInfo ? 1 : 0;
}

function extractCreatedAt(user) {
  return valueToText(getOwnFirstValue(user, ['createdAt', 'createAt', 'createdDate', 'createdTime', 'created_at', 'registerDate', 'registeredAt']));
}

const UPSERT_USER_SQL = `
  INSERT INTO users (userId, saleId, fullName, phoneNumber, roleCode, contractStatus, tnexLinked, createdAt, syncedAt, rawJson)
  VALUES (@userId, @saleId, @fullName, @phoneNumber, @roleCode, @contractStatus, @tnexLinked, @createdAt, @syncedAt, @rawJson)
  ON CONFLICT(userId) DO UPDATE SET
    saleId = excluded.saleId,
    fullName = excluded.fullName,
    phoneNumber = excluded.phoneNumber,
    roleCode = excluded.roleCode,
    contractStatus = excluded.contractStatus,
    tnexLinked = excluded.tnexLinked,
    createdAt = COALESCE(NULLIF(excluded.createdAt, ''), users.createdAt),
    syncedAt = excluded.syncedAt,
    rawJson = excluded.rawJson
`;

function toRow(rawUser) {
  const userId = extractUserId(rawUser);

  if (!userId) return null;

  return {
    userId,
    saleId: extractSaleId(rawUser),
    fullName: valueToText(rawUser?.fullName || rawUser?.name),
    phoneNumber: valueToText(rawUser?.phoneNumber || rawUser?.phone),
    roleCode: extractRoleCode(rawUser),
    contractStatus: extractContractStatus(rawUser),
    tnexLinked: extractTnexLinked(rawUser),
    createdAt: extractCreatedAt(rawUser),
    syncedAt: new Date().toISOString(),
    rawJson: JSON.stringify(rawUser),
  };
}

// Upsert 1 batch user (dung cho ca USER va USER_DETAIL job). Bocj trong 1 transaction
// de an toan va nhanh hon nhieu so voi ghi tung dong nhu file .txt truoc day.
function upsertUsers(rawUsers) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_USER_SQL);
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });

  const rows = rawUsers.map(toRow).filter(Boolean);

  if (rows.length > 0) runBatch(rows);

  return rows.length;
}

// Tra ve Map<userId, syncedAt ISO string> - dung de tinh "remaining" (user moi HOAC
// user da cu qua nguong can refresh lai).
function getUserSyncInfoMap() {
  const db = getDb();
  const rows = db.prepare('SELECT userId, syncedAt FROM users').all();
  const map = new Map();

  rows.forEach((row) => map.set(row.userId, row.syncedAt));

  return map;
}

// Doc toan bo user (dang rawJson da luu) - dung de thay the readUserDetailRows() ben
// segmentUserSearch.cjs. Giu nguyen toan bo pipeline loc/hien thi hien co phia sau.
function readAllUserRawRows() {
  const db = getDb();
  const rows = db.prepare('SELECT rawJson FROM users').all();
  let invalidLines = 0;
  const parsed = [];

  rows.forEach(({ rawJson }) => {
    try {
      parsed.push(JSON.parse(rawJson));
    } catch {
      invalidLines += 1;
    }
  });

  return { rows: parsed, invalidLines, totalRawRows: rows.length };
}

module.exports = {
  extractSaleId,
  extractUserId,
  getUserSyncInfoMap,
  readAllUserRawRows,
  upsertUsers,
};
