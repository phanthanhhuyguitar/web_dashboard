// Script chuyen du lieu tu cac file .txt (JSON-lines) hien co sang SQLite.
// Chay 1 LAN duy nhat, thu cong: node server/scripts/migrateToSqlite.cjs
// Khong xoa file .txt cu - chi doc va copy sang, an toan de chay lai nhieu lan
// (upsert nen chay lai khong bi trung/loi).
const { USER_DETAIL_MASTER_FILE } = require('../utils/outputPaths.cjs');
const { LOAN_MASTER_FILE, readJsonLines } = require('../utils/loanFileStore.cjs');
const { upsertUsers } = require('../utils/userStore.cjs');
const { upsertLoans } = require('../utils/loanStore.cjs');
const { closeDb } = require('../utils/db.cjs');

const BATCH_SIZE = 500;

function migrateUsers() {
  console.log(`Dang doc file user: ${USER_DETAIL_MASTER_FILE}`);
  const { rows, invalidLines } = readJsonLines(USER_DETAIL_MASTER_FILE);

  console.log(`Tim thay ${rows.length} user (${invalidLines} dong loi, bo qua).`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    migrated += upsertUsers(batch);
    console.log(`  ... da migrate ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} user`);
  }

  console.log(`Hoan tat migrate user: ${migrated} record.`);
}

function migrateLoans() {
  console.log(`Dang doc file loan: ${LOAN_MASTER_FILE}`);
  const { rows, invalidLines } = readJsonLines(LOAN_MASTER_FILE);

  console.log(`Tim thay ${rows.length} loan (${invalidLines} dong loi, bo qua).`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    migrated += upsertLoans(batch);
    console.log(`  ... da migrate ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} loan`);
  }

  console.log(`Hoan tat migrate loan: ${migrated} record.`);
}

function main() {
  console.log('=== Bat dau migrate du lieu sang SQLite (output/db/tnex-sync.db) ===');
  migrateUsers();
  migrateLoans();
  closeDb();
  console.log('=== Xong. File .txt cu VAN CON NGUYEN, chua bi xoa. ===');
  console.log('De bat SQLite, chay server voi bien moi truong USE_SQLITE_STORE=true');
}

main();
