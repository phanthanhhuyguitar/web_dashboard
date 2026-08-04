// Kiem tra "do moi" cua du lieu dong bo local (dung cho check chat luong du lieu #F) - doc
// timestamp dong bo gan nhat (syncedAt) trong SQLite, KHONG goi API nao.
const { getDb } = require('../utils/db.cjs');

function getTableFreshness(db, table, syncedAtColumn) {
  const row = db.prepare(`SELECT MAX(${syncedAtColumn}) AS lastSyncedAt, COUNT(*) AS total FROM ${table}`).get();

  return {
    exists: row.total > 0 && Boolean(row.lastSyncedAt),
    lastModifiedAt: row.lastSyncedAt || null,
  };
}

function getSyncFreshness() {
  const db = getDb();

  return {
    userDetail: getTableFreshness(db, 'users_full', 'detail_syncedAt'),
    loan: getTableFreshness(db, 'loans_full', 'syncedAt'),
  };
}

module.exports = { getSyncFreshness };
