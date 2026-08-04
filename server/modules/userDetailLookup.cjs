// Lay so tai khoan TNEX va so CCCD tu bang users_full (cot detail_bankAccountNumber,
// detail_identityNumber - do sync USER_DETAIL ghi vao) - KHONG goi them API nao. 2 field nay
// chi co o API detail tung user, khong co o API danh sach (search-users) - cung ly do/cach lam
// nhu buildOrgJoinInfoBySaleId ben commissionOrgInfo.cjs.
const { getDb } = require('../utils/db.cjs');

// Tra ve { [saleId]: { bankAccountNumber, identityNumber } }.
function buildUserDetailFieldsBySaleId() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT saleId, detail_bankAccountNumber, detail_identityNumber FROM users_full WHERE saleId IS NOT NULL AND saleId != ''"
    )
    .all();

  const result = {};

  rows.forEach(({ saleId, detail_bankAccountNumber, detail_identityNumber }) => {
    result[saleId] = {
      bankAccountNumber: detail_bankAccountNumber || '',
      identityNumber: detail_identityNumber || '',
    };
  });

  return result;
}

module.exports = { buildUserDetailFieldsBySaleId };
