import axios from 'axios';
import { ENV } from '../config/env.js';
import { clearAccessToken, getAccessToken } from '../utils/storage.js';

const axiosClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

function getAppPath(path) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');

  return `${normalizedBase}${normalizedPath}`;
}

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401 || status === 403) {
      clearAccessToken();

      const loginPath = getAppPath('/login');

      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }

    // Do not log raw request or response payloads here; they may contain sensitive finance/customer data.
    if (import.meta.env.DEV) {
      console.warn('[API_ERROR]', {
        status,
        message: error?.message,
      });
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
