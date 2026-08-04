// Goi endpoint local (Vite dev middleware, server/modules/dataQualityStatus.cjs) - KHONG phai
// API that, chi doc thoi gian sua doi file dong bo tren dia.
export async function fetchSyncFreshness() {
  const response = await fetch('/api/data-quality/sync-freshness');
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Không kiểm tra được độ mới dữ liệu đồng bộ.');

    error.response = { status: response.status, data };
    throw error;
  }

  return data?.freshness || null;
}
