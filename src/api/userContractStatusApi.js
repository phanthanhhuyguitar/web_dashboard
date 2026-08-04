// Goi endpoint local (Vite dev middleware, server/modules/userContractStatus.cjs) - KHONG phai
// API that. Du lieu lay tu file/SQLite user detail da dong bo san, khong phat sinh request moi
// toi backend that.
export async function fetchContractStatusBySaleId() {
  const response = await fetch('/api/users/contract-status-by-sale-id');
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Không lấy được trạng thái ký hợp đồng.');

    error.response = { status: response.status, data };
    throw error;
  }

  return data?.contractStatusBySaleId || {};
}