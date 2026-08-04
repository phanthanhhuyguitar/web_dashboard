// Script backfill 1 LAN cho nguon SQLite MOI (users_full/loans_full/loan_events) tu cac file
// .txt hien co tren dia - KHONG goi API nao. Chay thu cong: node server/scripts/migrateToSqliteV2.cjs
// An toan de chay lai nhieu lan (upsert, khong trung/loi). Khong dung/anh huong toi bang
// users/loans cu hay file .txt goc (chi doc, khong ghi/xoa file nguon).
const path = require('path');

const { USERS_OUTPUT_DIR, USER_DETAIL_MASTER_FILE } = require('../utils/outputPaths.cjs');
const { LOAN_MASTER_FILE, readJsonLines } = require('../utils/loanFileStore.cjs');
const { LOAN_DETAIL_MASTER_FILE } = require('../modules/syncLoanDetails.cjs');
const { upsertUsersFullFromList, upsertUsersFullFromDetail } = require('../utils/userStoreV2.cjs');
const { upsertLoansFullFromList, upsertLoanEventsFromDetail } = require('../utils/loanStoreV2.cjs');
const { closeDb } = require('../utils/db.cjs');

const LIST_USER_LATEST_FILE = path.join(USERS_OUTPUT_DIR, 'listUser_latest.txt');
const BATCH_SIZE = 500;

function migrateUsersFromList() {
  console.log(`Dang doc file DS user: ${LIST_USER_LATEST_FILE}`);
  const { rows, invalidLines } = readJsonLines(LIST_USER_LATEST_FILE);

  console.log(`Tim thay ${rows.length} user (${invalidLines} dong loi, bo qua).`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    migrated += upsertUsersFullFromList(batch);
    console.log(`  ... da migrate ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} user (LIST)`);
  }

  console.log(`Hoan tat migrate user tu DS: ${migrated} record.`);
}

function migrateUsersFromDetail() {
  console.log(`Dang doc file chi tiet DS user: ${USER_DETAIL_MASTER_FILE}`);
  const { rows, invalidLines } = readJsonLines(USER_DETAIL_MASTER_FILE);

  console.log(`Tim thay ${rows.length} user detail (${invalidLines} dong loi, bo qua).`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    migrated += upsertUsersFullFromDetail(batch);
    console.log(`  ... da migrate ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} user (DETAIL)`);
  }

  console.log(`Hoan tat migrate user tu chi tiet: ${migrated} record.`);
}

function migrateLoansFromList() {
  console.log(`Dang doc file loan: ${LOAN_MASTER_FILE}`);
  const { rows, invalidLines } = readJsonLines(LOAN_MASTER_FILE);

  console.log(`Tim thay ${rows.length} loan (${invalidLines} dong loi, bo qua).`);

  let migrated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    migrated += upsertLoansFullFromList(batch);
    console.log(`  ... da migrate ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} loan`);
  }

  console.log(`Hoan tat migrate loan: ${migrated} record.`);
}

function migrateLoanEvents() {
  console.log(`Dang doc file chi tiet loan: ${LOAN_DETAIL_MASTER_FILE}`);
  const { rows, invalidLines } = readJsonLines(LOAN_DETAIL_MASTER_FILE);

  console.log(`Tim thay ${rows.length} loan detail (${invalidLines} dong loi, bo qua).`);

  let totalEvents = 0;

  rows.forEach((row, index) => {
    totalEvents += upsertLoanEventsFromDetail(row?.loanId, row?.detail);

    if ((index + 1) % BATCH_SIZE === 0) {
      console.log(`  ... da migrate ${index + 1}/${rows.length} loan detail (${totalEvents} events)`);
    }
  });

  console.log(`Hoan tat migrate loan events: ${totalEvents} event tu ${rows.length} loan.`);
}

function main() {
  console.log('=== Bat dau backfill nguon SQLite MOI (users_full/loans_full/loan_events) ===');
  migrateUsersFromList();
  migrateUsersFromDetail();
  migrateLoansFromList();
  migrateLoanEvents();
  closeDb();
  console.log('=== Xong. File .txt cu va bang users/loans cu VAN CON NGUYEN, khong bi dong. ===');
}

main();
