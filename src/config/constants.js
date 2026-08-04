function formatDateValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function getCurrentMonthValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    fromDate: formatDateValue(startDate),
    toDate: formatDateValue(endDate),
  };
}

export const DEFAULT_MONTH = getCurrentMonthValue();

export const DEFAULT_DASHBOARD_RANGE = getCurrentMonthRange();

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGES = 100;

export const DASHBOARD_REFRESH_COOLDOWN_MS = 1500;
export const DASHBOARD_REQUEST_CACHE_TTL_MS = 30000;
