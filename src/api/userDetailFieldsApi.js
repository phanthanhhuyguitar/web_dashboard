// Goi endpoint local (Vite dev middleware, server/modules/userDetailLookup.cjs) - KHONG phai
// API that. Du lieu lay tu file user detail da dong bo san, khong phat sinh request moi toi
// backend that.
export async function fetchUserDetailFieldsBySaleId() {
  const response = await fetch('/api/users/detail-fields-by-sale-id');
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Không lấy được thông tin chi tiết user.');

    error.response = { status: response.status, data };
    throw error;
  }

  return data?.userDetailFieldsBySaleId || {};
}