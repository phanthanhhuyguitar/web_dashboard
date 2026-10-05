// Lop luu tru SQLite - CHI duoc dung khi USE_SQLITE_STORE=true (xem outputPaths.cjs).
// Mac dinh TAT, luong file .txt cu van hoat dong binh thuong khong doi gi.
const path = require('path');
const Database = require('better-sqlite3');

const { DB_OUTPUT_DIR, SQLITE_DB_FILE } = require('./outputPaths.cjs');
const { ensureDir } = require('./loanFileStore.cjs');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;

  ensureDir(DB_OUTPUT_DIR);
  dbInstance = new Database(SQLITE_DB_FILE);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      saleId TEXT,
      fullName TEXT,
      phoneNumber TEXT,
      roleCode TEXT,
      contractStatus TEXT,
      tnexLinked INTEGER,
      createdAt TEXT,
      syncedAt TEXT NOT NULL,
      rawJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_saleId ON users(saleId);
    CREATE INDEX IF NOT EXISTS idx_users_roleCode ON users(roleCode);
    CREATE INDEX IF NOT EXISTS idx_users_syncedAt ON users(syncedAt);
    CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);

    CREATE TABLE IF NOT EXISTS loans (
      loanId TEXT PRIMARY KEY,
      ownerSaleId TEXT,
      status TEXT,
      productId TEXT,
      approvedAmount REAL,
      createdAt TEXT,
      updatedAt TEXT,
      syncedAt TEXT NOT NULL,
      rawJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_loans_ownerSaleId ON loans(ownerSaleId);
    CREATE INDEX IF NOT EXISTS idx_loans_status_updatedAt ON loans(status, updatedAt);

    -- ============================================================
    -- NGUON MOI (song song, doc lap voi bang users/loans o tren).
    -- Moi job (LIST/DETAIL) chi UPDATE dung cot cua no (xem
    -- userStoreV2.cjs/loanStoreV2.cjs) - khong con tinh trang job
    -- chay sau de mat field cua job chay truoc nhu bang users cu.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS users_full (
      userId TEXT PRIMARY KEY,
      saleId TEXT,
      fullName TEXT,
      phoneNumber TEXT,
      email TEXT,
      partnerCode TEXT,
      isVerified INTEGER,
      list_role TEXT,
      list_status TEXT,
      list_department TEXT,
      list_accountNumber TEXT,
      list_contractStatus TEXT,
      list_createdAt TEXT,
      list_updatedAt TEXT,
      list_syncedAt TEXT,
      list_rawJson TEXT,
      detail_roleCode TEXT,
      detail_roleName TEXT,
      detail_accountStatus TEXT,
      detail_address TEXT,
      detail_hasSignedContract INTEGER,
      detail_contractStatus TEXT,
      detail_contractSignedAt TEXT,
      detail_bankAccountHolderName TEXT,
      detail_bankAccountNumber TEXT,
      detail_bankName TEXT,
      detail_identityNumber TEXT,
      detail_identityDateOfBirth TEXT,
      detail_identityPermanentAddress TEXT,
      detail_occupationCode TEXT,
      detail_occupationName TEXT,
      detail_orgInfosJson TEXT,
      detail_syncedAt TEXT,
      detail_rawJson TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_full_saleId ON users_full(saleId);

    CREATE TABLE IF NOT EXISTS loans_full (
      loanId TEXT PRIMARY KEY,
      id TEXT,
      userId TEXT,
      saleId TEXT,
      ownerSaleId TEXT,
      referralCode TEXT,
      productId TEXT,
      status TEXT,
      approvedAmount REAL,
      requestedAmount REAL,
      customerId TEXT,
      customerName TEXT,
      customerPhoneNumber TEXT,
      leadInfoJson TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      syncedAt TEXT NOT NULL,
      rawJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_loans_full_ownerSaleId ON loans_full(ownerSaleId);
    CREATE INDEX IF NOT EXISTS idx_loans_full_status_updatedAt ON loans_full(status, updatedAt);

    CREATE TABLE IF NOT EXISTS loan_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loanId TEXT NOT NULL,
      eventStatus TEXT,
      eventTime TEXT,
      productId TEXT,
      loanAmount REAL,
      loanApprovedAmount REAL,
      referralCode TEXT,
      createdAt TEXT,
      syncedAt TEXT NOT NULL,
      UNIQUE(loanId, eventStatus, eventTime)
    );
    CREATE INDEX IF NOT EXISTS idx_loan_events_loanId ON loan_events(loanId);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      sourceKey TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      severity TEXT NOT NULL DEFAULT 'warning',
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      resolvedAt TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_type_sourceKey ON notifications(type, sourceKey);
    CREATE INDEX IF NOT EXISTS idx_notifications_isRead ON notifications(isRead);

    -- Cau hinh tuy chinh cho cac job dong bo (delay, concurrency, gioi han batch...) - chinh
    -- qua trang Cai dat (SettingsPage.jsx). Chi 1 dong duy nhat (key='tuning'), value la 1 JSON
    -- blob - xem syncConfigStore.cjs.
    CREATE TABLE IF NOT EXISTS sync_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  // Migration: bang notifications co the da ton tai truoc khi co cot `meta` (CREATE TABLE IF
  // NOT EXISTS khong tu them cot moi vao bang cu) - them thu cong neu chua co.
  const notificationColumns = dbInstance.prepare('PRAGMA table_info(notifications)').all().map((col) => col.name);

  if (!notificationColumns.includes('meta')) {
    dbInstance.exec('ALTER TABLE notifications ADD COLUMN meta TEXT');
  }

  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  closeDb,
};
