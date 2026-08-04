// Goi endpoint local (Vite dev middleware, server/modules/notificationStore.cjs) - KHONG phai
// API that. Day la chuong thong bao noi bo cua admin (khac hoan toan voi
// notificationTemplatesApi.js - tinh nang gui thong bao cho CTV).
export async function fetchNotifications(limit = 50) {
  const response = await fetch(`/api/notifications?limit=${encodeURIComponent(limit)}`);
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Không lấy được danh sách thông báo.');
  }

  return { items: data.items || [], unreadCount: data.unreadCount || 0 };
}

// items: [{ sourceKey, title, message, severity }] - toan bo van de dang active cua `type` nay.
export async function reportNotifications(type, items) {
  await fetch('/api/notifications/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, items }),
  }).catch(() => {
    // Fail-open: bao cao thong bao that bai khong lam gian doan trang dang xem.
  });
}

// Su kien 1 lan (bat dau/hoan tat/that bai gui push notification tu SegmentDetailPage) - chay
// hoan toan phia client nen phai tu bao ve day de server ghi vao SQLite (khac reportNotifications
// vi khong dedup theo sourceKey, moi lan goi la 1 dong moi).
export async function reportPushNotiEvent({ type, jobId, segmentId, title, message }) {
  await fetch('/api/notifications/push-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, jobId, segmentId, title, message }),
  }).catch(() => {
    // Fail-open: bao cao thong bao that bai khong lam gian doan luong gui push that.
  });
}

// Su kien 1 lan (bat dau/hoan tat/that bai chuyen thanh vien giua 2 don vi to chuc tu
// OrganizationPage) - chay hoan toan phia client, tuong tu reportPushNotiEvent o tren.
export async function reportOrgMoveEvent({ type, jobId, orgUnitId, title, message }) {
  await fetch('/api/notifications/push-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, jobId, orgUnitId, title, message }),
  }).catch(() => {
    // Fail-open: bao cao thong bao that bai khong lam gian doan luong chuyen thanh vien that.
  });
}

export async function markNotificationRead(id) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Không đánh dấu được thông báo đã đọc.');
  }
}

export async function markAllNotificationsRead() {
  const response = await fetch('/api/notifications/read-all', { method: 'POST' });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Không đánh dấu được tất cả thông báo đã đọc.');
  }
}
