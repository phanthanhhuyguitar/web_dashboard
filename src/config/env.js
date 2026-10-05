const getEnv = (key, fallback = '') => {
  const value = import.meta.env[key];

  if (!value && import.meta.env.DEV) {
    console.warn(`[ENV] Missing ${key}, using fallback value.`);
  }

  return value || fallback;
};

const toNumber = (value, fallback) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

export const ENV = {
  API_BASE_URL: getEnv('VITE_API_BASE_URL', 'https://api-gw-ds.tnex.com.vn'),
  LOGIN_ENDPOINT: getEnv('VITE_LOGIN_ENDPOINT', '/digital-sale/api/v1/users/admin-login'),
  LOANS_ENDPOINT: getEnv('VITE_LOANS_ENDPOINT', '/digital-sale-admin/api/v1/admin/loans'),
  SEARCH_USERS_ENDPOINT: getEnv('VITE_SEARCH_USERS_ENDPOINT', '/digital-sale-admin/api/v1/admin/search-users'),
  ROLES_ENDPOINT: getEnv('VITE_ROLES_ENDPOINT', '/digital-sale-admin/api/v1/admin/roles'),
  ORG_UNITS_ENDPOINT: getEnv('VITE_ORG_UNITS_ENDPOINT', '/digital-sale-admin/api/v1/admin/org-units'),
  ORG_UNIT_USERS_ENDPOINT: getEnv(
    'VITE_ORG_UNIT_USERS_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/org-units/users'
  ),
  REMOVE_ORG_UNIT_USER_ENDPOINT: getEnv(
    'VITE_REMOVE_ORG_UNIT_USER_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/org-units/users/remove'
  ),
  ASSIGN_USER_ROLE_ENDPOINT: getEnv(
    'VITE_ASSIGN_USER_ROLE_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/roles/user-roles/assign'
  ),
  NOTIFICATION_TEMPLATES_ENDPOINT: getEnv(
    'VITE_NOTIFICATION_TEMPLATES_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/notifications/templates'
  ),
  SEND_NOTIFICATION_ENDPOINT: getEnv(
    'VITE_SEND_NOTIFICATION_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/notifications/send'
  ),
  RECONCILIATION_HISTORY_ENDPOINT: getEnv(
    'VITE_RECONCILIATION_HISTORY_ENDPOINT',
    '/digital-sale-admin/api/v1/admin/reconciliations/search-history'
  ),
  USER_DETAIL_ENDPOINT: getEnv('VITE_USER_DETAIL_ENDPOINT', '/digital-sale-admin/api/v1/admin/users/profile'),
  API_TIMEOUT: toNumber(getEnv('VITE_API_TIMEOUT', '30000'), 30000),
};
