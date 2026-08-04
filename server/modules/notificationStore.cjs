// Luu tru + doi chieu thong bao noi bo (chuong o Topbar) trong bang notifications (SQLite) -
// KHONG goi API nao. 2 loai nguon:
// - TEAM_RISK/DATA_QUALITY: client tu tinh (dua tren du lieu da fetch san o trinh duyet) roi
//   POST len day de luu/doi chieu - tranh phai fetch lai API that o server.
// - SYNC_FAILED: server tu ghi truc tiep khi 1 job dong bo chuyen sang FAILED.
const { getDb } = require('../utils/db.cjs');

const VALID_SEVERITIES = new Set(['info', 'warning', 'error']);

function normalizeSeverity(value) {
  return VALID_SEVERITIES.has(value) ? value : 'warning';
}

// items: [{ sourceKey, title, message, severity }] - toan bo van de dang ACTIVE cua `type` nay
// tinh den thoi diem goi. Doi chieu: cap nhat/tao moi cac item con, dong (resolvedAt) cac item
// cu khong con xuat hien nua - khong bao gio xoa khoi bang (giu lich su hop thu).
function reportNotifications(type, items) {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = Array.isArray(items) ? items : [];

  const findOpen = db.prepare('SELECT id FROM notifications WHERE type = ? AND sourceKey = ? AND resolvedAt IS NULL');
  const updateExisting = db.prepare(
    'UPDATE notifications SET title = ?, message = ?, severity = ?, updatedAt = ? WHERE id = ?'
  );
  const insertNew = db.prepare(`
    INSERT INTO notifications (type, sourceKey, title, message, severity, isRead, createdAt, updatedAt, resolvedAt)
    VALUES (@type, @sourceKey, @title, @message, @severity, 0, @createdAt, @updatedAt, NULL)
  `);
  const getOpenRows = db.prepare('SELECT id, sourceKey FROM notifications WHERE type = ? AND resolvedAt IS NULL');
  const resolveById = db.prepare('UPDATE notifications SET resolvedAt = ?, updatedAt = ? WHERE id = ?');

  const runReconcile = db.transaction(() => {
    const seenKeys = new Set();

    rows.forEach((item) => {
      const sourceKey = String(item?.sourceKey || '').trim();
      const title = String(item?.title || '').trim();

      if (!sourceKey || !title) return;

      seenKeys.add(sourceKey);

      const message = String(item?.message || '');
      const severity = normalizeSeverity(item?.severity);
      const existing = findOpen.get(type, sourceKey);

      if (existing) {
        updateExisting.run(title, message, severity, now, existing.id);
      } else {
        insertNew.run({ type, sourceKey, title, message, severity, createdAt: now, updatedAt: now });
      }
    });

    getOpenRows.all(type).forEach((row) => {
      if (!seenKeys.has(row.sourceKey)) {
        resolveById.run(now, now, row.id);
      }
    });
  });

  runReconcile();
}

// Su kien 1 lan (job dong bo bat dau/hoan tat/that bai) - khong dedup, moi lan goi la 1 thong
// bao moi. `meta` (vd {jobId, jobType}) dung de client biet job nao con dang chay va URL nao de
// hoi tien do live (xem NotificationBell.jsx).
function insertSyncEventNotification({ type, severity, jobId, title, message, meta }) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO notifications (type, sourceKey, title, message, severity, isRead, createdAt, updatedAt, resolvedAt, meta)
     VALUES (@type, @sourceKey, @title, @message, @severity, 0, @createdAt, @updatedAt, NULL, @meta)`
  ).run({
    type,
    sourceKey: String(jobId || now),
    title: title || '',
    message: message || '',
    severity,
    createdAt: now,
    updatedAt: now,
    meta: meta ? JSON.stringify(meta) : null,
  });
}

function createSyncStartedNotification({ jobId, jobType, title, message }) {
  insertSyncEventNotification({
    type: 'SYNC_STARTED',
    severity: 'info',
    jobId,
    title: title || 'Bắt đầu đồng bộ',
    message,
    meta: { jobId, jobType },
  });
}

function createSyncCompletedNotification({ jobId, jobType, title, message }) {
  insertSyncEventNotification({
    type: 'SYNC_COMPLETED',
    severity: 'info',
    jobId,
    title: title || 'Đồng bộ hoàn tất',
    message,
    meta: { jobId, jobType },
  });
}

function createSyncFailedNotification({ jobId, jobType, title, message }) {
  insertSyncEventNotification({
    type: 'SYNC_FAILED',
    severity: 'error',
    jobId,
    title: title || 'Đồng bộ thất bại',
    message,
    meta: { jobId, jobType },
  });
}

// Gui push notification tu SegmentDetailPage - chay hoan toan phia client (goi thang API TNEX
// that, khong qua job server nhu sync) nen khong co tien do live de client khac hoi - chi ghi lai
// 3 moc: bat dau / hoan tat / that bai. `meta.segmentId` de bam vao thong bao dieu huong dung
// ve trang chi tiet segment do (xem NotificationBell.jsx).
function createPushNotiStartedNotification({ jobId, segmentId, title, message }) {
  insertSyncEventNotification({
    type: 'PUSH_NOTI_STARTED',
    severity: 'info',
    jobId,
    title: title || 'Bắt đầu gửi thông báo',
    message,
    meta: { jobId, segmentId },
  });
}

function createPushNotiCompletedNotification({ jobId, segmentId, title, message }) {
  insertSyncEventNotification({
    type: 'PUSH_NOTI_COMPLETED',
    severity: 'info',
    jobId,
    title: title || 'Gửi thông báo hoàn tất',
    message,
    meta: { jobId, segmentId },
  });
}

function createPushNotiFailedNotification({ jobId, segmentId, title, message }) {
  insertSyncEventNotification({
    type: 'PUSH_NOTI_FAILED',
    severity: 'error',
    jobId,
    title: title || 'Gửi thông báo thất bại',
    message,
    meta: { jobId, segmentId },
  });
}

// Them toan bo thanh vien cua 1 don vi to chuc vao 1 don vi khac (menu "Chuyen thanh vien" tren
// cay to chuc, OrganizationPage) - CHI them, khong tu xoa khoi don vi cu (admin tu xoa tay bang
// thao tac "Xoa nguoi dung" da co san). Chay hoan toan phia client (goi thang API TNEX that qua
// nhieu luot assign) nen khong co tien do live, chi ghi lai 3 moc bat dau/hoan tat/that bai.
// `meta.orgUnitId` la don vi DICH, dung de bam vao thong bao dieu huong ve trang To chuc (xem
// NotificationBell.jsx).
function createOrgMoveStartedNotification({ jobId, orgUnitId, title, message }) {
  insertSyncEventNotification({
    type: 'ORG_MOVE_STARTED',
    severity: 'info',
    jobId,
    title: title || 'Bắt đầu thêm thành viên vào tổ chức mới',
    message,
    meta: { jobId, orgUnitId },
  });
}

function createOrgMoveCompletedNotification({ jobId, orgUnitId, title, message }) {
  insertSyncEventNotification({
    type: 'ORG_MOVE_COMPLETED',
    severity: 'info',
    jobId,
    title: title || 'Thêm thành viên hoàn tất',
    message,
    meta: { jobId, orgUnitId },
  });
}

function createOrgMoveFailedNotification({ jobId, orgUnitId, title, message }) {
  insertSyncEventNotification({
    type: 'ORG_MOVE_FAILED',
    severity: 'error',
    jobId,
    title: title || 'Thêm thành viên thất bại',
    message,
    meta: { jobId, orgUnitId },
  });
}

function listNotifications({ limit = 50 } = {}) {
  const db = getDb();
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;

  const items = db
    .prepare(
      'SELECT id, type, sourceKey, title, message, severity, isRead, createdAt, updatedAt, resolvedAt, meta FROM notifications ORDER BY createdAt DESC LIMIT ?'
    )
    .all(safeLimit)
    .map((row) => {
      let meta = null;

      try {
        meta = row.meta ? JSON.parse(row.meta) : null;
      } catch {
        meta = null;
      }

      return { ...row, isRead: Boolean(row.isRead), meta };
    });
  const unreadCount = db.prepare('SELECT COUNT(*) c FROM notifications WHERE isRead = 0').get().c;

  return { items, unreadCount };
}

function markNotificationRead(id) {
  const db = getDb();

  db.prepare('UPDATE notifications SET isRead = 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
}

function markAllNotificationsRead() {
  const db = getDb();

  db.prepare('UPDATE notifications SET isRead = 1, updatedAt = ? WHERE isRead = 0').run(new Date().toISOString());
}

module.exports = {
  reportNotifications,
  createSyncStartedNotification,
  createSyncCompletedNotification,
  createSyncFailedNotification,
  createPushNotiStartedNotification,
  createPushNotiCompletedNotification,
  createPushNotiFailedNotification,
  createOrgMoveStartedNotification,
  createOrgMoveCompletedNotification,
  createOrgMoveFailedNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
