// Nguon MOI (song song voi userStore.cjs cu, KHONG thay the) - ghi vao bang users_full,
// tach rieng cot LIST/DETAIL. Moi job chi UPDATE dung cot cua no (ON CONFLICT DO UPDATE SET
// chi liet ke cot cua job do) nen job nao chay sau cung KHONG con xoa mat field cua job truoc -
// day chinh la bug cua bang `users` cu (1 cot rawJson bi ghi de toan bo moi lan upsert).
const { getDb } = require('./db.cjs');
const { extractSaleId } = require('./userStore.cjs');

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function extractUserId(rawUser) {
  return valueToText(rawUser?.id || rawUser?.userId || rawUser?.dsUserId || rawUser?.digitalSaleUserId);
}

const UPSERT_LIST_SQL = `
  INSERT INTO users_full (
    userId, saleId, fullName, phoneNumber, email, partnerCode, isVerified,
    list_role, list_status, list_department, list_accountNumber, list_contractStatus,
    list_createdAt, list_updatedAt, list_syncedAt, list_rawJson, updatedAt
  ) VALUES (
    @userId, @saleId, @fullName, @phoneNumber, @email, @partnerCode, @isVerified,
    @list_role, @list_status, @list_department, @list_accountNumber, @list_contractStatus,
    @list_createdAt, @list_updatedAt, @list_syncedAt, @list_rawJson, @updatedAt
  )
  ON CONFLICT(userId) DO UPDATE SET
    saleId = excluded.saleId,
    fullName = excluded.fullName,
    phoneNumber = excluded.phoneNumber,
    email = excluded.email,
    partnerCode = excluded.partnerCode,
    isVerified = excluded.isVerified,
    list_role = excluded.list_role,
    list_status = excluded.list_status,
    list_department = excluded.list_department,
    list_accountNumber = excluded.list_accountNumber,
    list_contractStatus = excluded.list_contractStatus,
    list_createdAt = excluded.list_createdAt,
    list_updatedAt = excluded.list_updatedAt,
    list_syncedAt = excluded.list_syncedAt,
    list_rawJson = excluded.list_rawJson,
    updatedAt = excluded.updatedAt
`;

const UPSERT_DETAIL_SQL = `
  INSERT INTO users_full (
    userId, saleId, fullName, phoneNumber, email, partnerCode, isVerified,
    detail_roleCode, detail_roleName, detail_accountStatus, detail_address,
    detail_hasSignedContract, detail_contractStatus, detail_contractSignedAt,
    detail_bankAccountHolderName, detail_bankAccountNumber, detail_bankName,
    detail_identityNumber, detail_identityDateOfBirth, detail_identityPermanentAddress,
    detail_occupationCode, detail_occupationName, detail_orgInfosJson,
    detail_syncedAt, detail_rawJson, updatedAt
  ) VALUES (
    @userId, @saleId, @fullName, @phoneNumber, @email, @partnerCode, @isVerified,
    @detail_roleCode, @detail_roleName, @detail_accountStatus, @detail_address,
    @detail_hasSignedContract, @detail_contractStatus, @detail_contractSignedAt,
    @detail_bankAccountHolderName, @detail_bankAccountNumber, @detail_bankName,
    @detail_identityNumber, @detail_identityDateOfBirth, @detail_identityPermanentAddress,
    @detail_occupationCode, @detail_occupationName, @detail_orgInfosJson,
    @detail_syncedAt, @detail_rawJson, @updatedAt
  )
  ON CONFLICT(userId) DO UPDATE SET
    detail_roleCode = excluded.detail_roleCode,
    detail_roleName = excluded.detail_roleName,
    detail_accountStatus = excluded.detail_accountStatus,
    detail_address = excluded.detail_address,
    detail_hasSignedContract = excluded.detail_hasSignedContract,
    detail_contractStatus = excluded.detail_contractStatus,
    detail_contractSignedAt = excluded.detail_contractSignedAt,
    detail_bankAccountHolderName = excluded.detail_bankAccountHolderName,
    detail_bankAccountNumber = excluded.detail_bankAccountNumber,
    detail_bankName = excluded.detail_bankName,
    detail_identityNumber = excluded.detail_identityNumber,
    detail_identityDateOfBirth = excluded.detail_identityDateOfBirth,
    detail_identityPermanentAddress = excluded.detail_identityPermanentAddress,
    detail_occupationCode = excluded.detail_occupationCode,
    detail_occupationName = excluded.detail_occupationName,
    detail_orgInfosJson = excluded.detail_orgInfosJson,
    detail_syncedAt = excluded.detail_syncedAt,
    detail_rawJson = excluded.detail_rawJson,
    updatedAt = excluded.updatedAt
`;

function toListRow(rawUser) {
  const userId = extractUserId(rawUser);

  if (!userId) return null;

  const now = new Date().toISOString();

  return {
    userId,
    saleId: extractSaleId(rawUser),
    fullName: valueToText(rawUser?.fullName),
    phoneNumber: valueToText(rawUser?.phoneNumber),
    email: valueToText(rawUser?.email),
    partnerCode: valueToText(rawUser?.partnerCode),
    isVerified: rawUser?.isVerified ? 1 : 0,
    list_role: valueToText(rawUser?.role),
    list_status: valueToText(rawUser?.status),
    list_department: valueToText(rawUser?.department),
    list_accountNumber: valueToText(rawUser?.accountNumber),
    list_contractStatus: valueToText(rawUser?.contractStatus),
    list_createdAt: valueToText(rawUser?.createdAt),
    list_updatedAt: valueToText(rawUser?.updatedAt),
    list_syncedAt: now,
    list_rawJson: JSON.stringify(rawUser),
    updatedAt: now,
  };
}

function toDetailRow(rawUser) {
  const userId = extractUserId(rawUser);

  if (!userId) return null;

  const now = new Date().toISOString();

  return {
    userId,
    saleId: extractSaleId(rawUser),
    fullName: valueToText(rawUser?.fullName),
    phoneNumber: valueToText(rawUser?.phoneNumber),
    email: valueToText(rawUser?.email),
    partnerCode: valueToText(rawUser?.partnerCode),
    isVerified: rawUser?.isVerified ? 1 : 0,
    detail_roleCode: valueToText(rawUser?.roleInfo?.roleCode),
    detail_roleName: valueToText(rawUser?.roleInfo?.roleName),
    detail_accountStatus: valueToText(rawUser?.accountStatus),
    detail_address: valueToText(rawUser?.address),
    detail_hasSignedContract: rawUser?.hasSignedContract ? 1 : 0,
    detail_contractStatus: valueToText(rawUser?.contract?.status),
    detail_contractSignedAt: valueToText(rawUser?.contract?.signedAt),
    detail_bankAccountHolderName: valueToText(rawUser?.bankInfo?.accountHolderName),
    detail_bankAccountNumber: valueToText(rawUser?.bankInfo?.accountNumber),
    detail_bankName: valueToText(rawUser?.bankInfo?.bankName),
    detail_identityNumber: valueToText(rawUser?.identity?.identityNumber),
    detail_identityDateOfBirth: valueToText(rawUser?.identity?.dateOfBirth),
    detail_identityPermanentAddress: valueToText(rawUser?.identity?.permanentAddress),
    detail_occupationCode: valueToText(rawUser?.occupationInfo?.code),
    detail_occupationName: valueToText(rawUser?.occupationInfo?.name),
    detail_orgInfosJson: JSON.stringify(Array.isArray(rawUser?.orgInfos) ? rawUser.orgInfos : []),
    detail_syncedAt: now,
    detail_rawJson: JSON.stringify(rawUser),
    updatedAt: now,
  };
}

// rawUsers: mang object tho tu API search-users (USER_LIST job) - dung nguyen du lieu da fetch,
// KHONG goi them API nao.
function upsertUsersFullFromList(rawUsers) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_LIST_SQL);
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });
  const rows = rawUsers.map(toListRow).filter(Boolean);

  if (rows.length > 0) runBatch(rows);

  return rows.length;
}

// rawUsers: mang object tho tu API user-detail (USER_DETAIL job).
function upsertUsersFullFromDetail(rawUsers) {
  const db = getDb();
  const stmt = db.prepare(UPSERT_DETAIL_SQL);
  const runBatch = db.transaction((rows) => {
    rows.forEach((row) => stmt.run(row));
  });
  const rows = rawUsers.map(toDetailRow).filter(Boolean);

  if (rows.length > 0) runBatch(rows);

  return rows.length;
}

// Doc toan bo users_full, GHEP lai list_rawJson + detail_rawJson thanh 1 object nhu truoc day
// (LIST de len DETAIL cho field trung ten, theo dung quyet dinh da chot cho contractStatus) -
// nho vay toan bo logic filter/extract cu (segmentUserSearch.cjs) dung lai duoc nguyen ven,
// chi thay nguon nap du lieu dau vao.
function readUsersFullMerged() {
  const db = getDb();
  const rows = db.prepare('SELECT list_rawJson, detail_rawJson FROM users_full').all();
  const parsed = [];
  let invalidLines = 0;

  rows.forEach(({ list_rawJson, detail_rawJson }) => {
    let detailObj = {};
    let listObj = {};

    try {
      if (detail_rawJson) detailObj = JSON.parse(detail_rawJson);
    } catch {
      invalidLines += 1;
    }

    try {
      if (list_rawJson) listObj = JSON.parse(list_rawJson);
    } catch {
      invalidLines += 1;
    }

    const merged = { ...detailObj, ...listObj };

    if (Object.keys(merged).length > 0) parsed.push(merged);
  });

  return { rows: parsed, invalidLines, totalRawRows: rows.length };
}

// Tra ve Map<userId, detail_syncedAt ISO string> - CHI lay user da tung co detail_syncedAt
// (tung dong bo chi tiet it nhat 1 lan). Dung de tinh "user cu qua han can refresh lai" cho job
// DONG BO CHI TIET (xem syncUsersServer.cjs). Khac voi userStore.cjs (V1) - o day cot
// detail_syncedAt CHI duoc ghi boi upsertUsersFullFromDetail (job LIST khong dung toi), nen
// khong bi job LIST vo tinh "lam moi" lai han muc du - day chinh la bug da gap phai o bang V1
// (users.syncedAt bi ca 2 job LIST va DETAIL cung ghi de, khien staleness check luon thay 0
// nguoi can dong bo lai).
function getUserDetailSyncInfoMap() {
  const db = getDb();
  const rows = db.prepare('SELECT userId, detail_syncedAt FROM users_full WHERE detail_syncedAt IS NOT NULL').all();
  const map = new Map();

  rows.forEach((row) => map.set(row.userId, row.detail_syncedAt));

  return map;
}

module.exports = {
  upsertUsersFullFromList,
  upsertUsersFullFromDetail,
  readUsersFullMerged,
  getUserDetailSyncInfoMap,
};
