const TOKEN_KEY = 'tnex_partner_access_token';
const REMEMBER_LOGIN_KEY = 'tnex_partner_remember_login';
const REMEMBERED_LOGIN_ID_KEY = 'tnex_partner_remembered_login_id';

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  return atob(padded);
}

function isJwtExpired(token) {
  const [, payload] = String(token || '').split('.');

  if (!payload) return false;

  try {
    const data = JSON.parse(decodeBase64Url(payload));
    const exp = Number(data?.exp);

    if (!Number.isFinite(exp)) return false;

    return exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

// Only the access token, remember flag, and login id hint are stored here; never persist password, OTP, customer, user, loan, or raw API data.
export function isRememberLogin() {
  return localStorage.getItem(REMEMBER_LOGIN_KEY) === 'true';
}

export function getRememberedLoginId() {
  return localStorage.getItem(REMEMBERED_LOGIN_ID_KEY) || '';
}

export function setRememberedLoginId(loginId) {
  const value = String(loginId || '').trim();

  if (value) {
    localStorage.setItem(REMEMBERED_LOGIN_ID_KEY, value);
    return;
  }

  localStorage.removeItem(REMEMBERED_LOGIN_ID_KEY);
}

export function clearRememberedLoginId() {
  localStorage.removeItem(REMEMBERED_LOGIN_ID_KEY);
}

export function getAuthToken() {
  const token = isRememberLogin() ? localStorage.getItem(TOKEN_KEY) : sessionStorage.getItem(TOKEN_KEY);

  if (!token) return null;

  if (isJwtExpired(token)) {
    clearAuth();
    return null;
  }

  return token;
}

export function setAuthToken(token, remember = false) {
  clearAuth();

  if (!token) return;

  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REMEMBER_LOGIN_KEY, 'true');
    sessionStorage.removeItem(TOKEN_KEY);
    return;
  }

  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

export function hasAccessToken() {
  return Boolean(getAuthToken());
}

export const getAccessToken = getAuthToken;
export const setAccessToken = setAuthToken;
export const clearAccessToken = clearAuth;

export { REMEMBERED_LOGIN_ID_KEY, REMEMBER_LOGIN_KEY, TOKEN_KEY };
