// Xay map { [saleId]: 'SIGNED' | 'PENDING' | 'DRAFT' | null } tu bang users_full (cot
// list_contractStatus, do sync USER_LIST ghi vao - ket qua API search-users). Dung cot nay
// (khong phai detail_contractStatus) vi API detail khong tra ve contractStatus o dang field
// phang. KHONG goi API nao them.
const { getDb } = require('../utils/db.cjs');

const VALID_STATUSES = new Set(['SIGNED', 'PENDING', 'DRAFT']);

function buildContractStatusBySaleId() {
  const db = getDb();
  const rows = db
    .prepare("SELECT saleId, list_contractStatus FROM users_full WHERE saleId IS NOT NULL AND saleId != ''")
    .all();

  const result = {};

  rows.forEach(({ saleId, list_contractStatus }) => {
    const status = String(list_contractStatus || '').trim().toUpperCase();

    result[saleId] = VALID_STATUSES.has(status) ? status : null;
  });

  return result;
}

module.exports = { buildContractStatusBySaleId };
