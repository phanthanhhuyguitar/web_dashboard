// Goi endpoint local (Vite dev middleware, server/modules/commissionOrgInfo.cjs) - KHONG phai
// API that. Du lieu lay tu file user detail da dong bo san, khong phat sinh request moi toi
// backend that.
export async function fetchOrgJoinInfo() {
  const response = await fetch('/api/commission/org-join-info');
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Không lấy được ngày join tổ chức.');

    error.response = { status: response.status, data };
    throw error;
  }

  return data?.orgJoinInfoBySaleId || {};
}
