// Lay ngay CTV join tung to chuc (orgInfos[].createdAt) tu bang users_full (cot
// detail_orgInfosJson, do sync USER_DETAIL ghi vao) - KHONG goi them API nao. Field nay chi co
// o API detail tung user, khong co o API danh sach (search-users) ma Dashboard dang goi truc
// tiep - nen phai lay qua day (SQLite da dong bo san cho Segment) thay vi goi detail rieng
// tung nguoi (se spam API - dieu tuyet doi tranh voi day la server product).
const { getDb } = require('../utils/db.cjs');

function normalizeOrgId(value) {
  return String(value ?? '').trim();
}

// Tra ve { [saleId]: [{ orgId, createdAt }, ...] }. Fail open: neu bang chua co du lieu thi
// tra object rong (khong throw), de rule bo sung nay khong lam gian doan ca tinh nang commission.
function buildOrgJoinInfoBySaleId() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT saleId, detail_orgInfosJson FROM users_full WHERE saleId IS NOT NULL AND saleId != '' AND detail_orgInfosJson IS NOT NULL"
    )
    .all();

  const result = {};

  rows.forEach(({ saleId, detail_orgInfosJson }) => {
    let orgInfos;

    try {
      orgInfos = JSON.parse(detail_orgInfosJson);
    } catch {
      return;
    }

    if (!Array.isArray(orgInfos) || orgInfos.length === 0) return;

    const mapped = orgInfos
      .map((org) => ({ orgId: normalizeOrgId(org?.orgId), createdAt: org?.createdAt || '' }))
      .filter((org) => org.orgId && org.createdAt);

    if (mapped.length > 0) result[saleId] = mapped;
  });

  return result;
}

module.exports = { buildOrgJoinInfoBySaleId };
