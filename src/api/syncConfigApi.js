// Goi endpoint local (Vite dev middleware, server/utils/syncConfigStore.cjs) - KHONG phai API
// that cua TNEX. Cau hinh delay/concurrency/gioi han batch cho cac job dong bo, chinh o trang
// Cai dat va co hieu luc ngay tu lan chay job tiep theo (khong can restart server).
export async function fetchSyncConfig() {
  const response = await fetch('/api/sync-config');
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Không lấy được cấu hình đồng bộ.');
  }

  return data.config;
}

// partial: object chi chua cac key can doi (vd { userDetailConcurrency: 8 }).
export async function updateSyncConfig(partial) {
  const response = await fetch('/api/sync-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Không lưu được cấu hình đồng bộ.');
  }

  return data.config;
}
