import axiosClient from './axiosClient.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGES } from '../config/constants.js';
import { ENV } from '../config/env.js';

// Endpoint paths are sourced from env config so request setup stays centralized.
const SEARCH_USERS_ENDPOINT = ENV.SEARCH_USERS_ENDPOINT;
const USER_DETAIL_ENDPOINT = ENV.USER_DETAIL_ENDPOINT;
const usersInFlight = new Map();

function getByPath(source, path) {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function getFirstValue(source, paths) {
  for (const path of paths) {
    const value = getByPath(source, path);

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function normalizeUsersResponse(responseData) {
  const users =
    getFirstValue(responseData, [
      'data.users',
      'data.content',
      'data.items',
      'data.records',
      'users',
      'content',
      'items',
      'records',
    ]) || [];
  const totalElements = getFirstValue(responseData, [
    'data.pagination.totalElements',
    'data.totalElements',
    'data.total',
    'totalElements',
    'total',
  ]);
  const totalPages = getFirstValue(responseData, [
    'data.pagination.totalPages',
    'data.totalPages',
    'totalPages',
  ]);

  return {
    users: Array.isArray(users) ? users : [users],
    totalElements: Number.isFinite(Number(totalElements)) ? Number(totalElements) : null,
    totalPages: Number.isFinite(Number(totalPages)) ? Number(totalPages) : null,
  };
}

function makeUsersCacheKey({ filter, size }) {
  return JSON.stringify({ filter, size });
}

function shouldStopPaging({ usersLength, totalElements, totalPages, totalFetched, page, pageSize }) {
  if (usersLength === 0) return true;
  if (totalElements !== null && totalFetched >= totalElements) return true;
  if (totalPages !== null && page + 1 >= totalPages) return true;

  return usersLength < pageSize;
}

export async function fetchUsersPage({ page = 0, size = DEFAULT_PAGE_SIZE, filter = {} } = {}) {
  const response = await axiosClient.post(SEARCH_USERS_ENDPOINT, {
    filter: {
      saleId: null,
      contractStatus: null,
      ...filter,
    },
    page,
    size,
  });

  return normalizeUsersResponse(response.data);
}

export async function fetchAllUsers({ filter = {}, size = DEFAULT_PAGE_SIZE } = {}) {
  const cacheKey = makeUsersCacheKey({ filter, size });

  if (usersInFlight.has(cacheKey)) {
    return usersInFlight.get(cacheKey);
  }

  const request = fetchAllUsersUncached({ filter, size })
    .finally(() => {
      usersInFlight.delete(cacheKey);
    });

  usersInFlight.set(cacheKey, request);
  return request;
}

export function clearUsersCache() {
  // Response TTL is managed by requestCache; this API layer only dedupes in-flight calls.
}

async function fetchAllUsersUncached({ filter, size }) {
  const allUsers = [];
  let page = 0;
  let totalFetched = 0;

  while (page < MAX_PAGES) {
    const { users, totalElements, totalPages } = await fetchUsersPage({
      page,
      size,
      filter,
    });

    allUsers.push(...users);
    totalFetched += users.length;

    if (
      shouldStopPaging({
        usersLength: users.length,
        totalElements,
        totalPages,
        totalFetched,
        page,
        pageSize: size,
      })
    ) {
      break;
    }

    page += 1;
  }

  return allUsers;
}

// ---- Tra cuu 1 user THAT theo saleId/userId - dung cho enrich file xuat Excel doi soat, KHONG
// dung du lieu dong bo local nao (tranh rui ro saleId da doi sang nguoi khac ma local chua kip
// cap nhat, dan den lay nham so tai khoan ngan hang). Xem ReconciliationHistoryPage.jsx. ----

function valueToText(value) {
  if (value === undefined || value === null) return '';

  return String(value).trim();
}

function normalizeSaleIdValue(value) {
  return valueToText(value).replace(/^DR/i, '');
}

function getOwnFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && valueToText(source[key]) !== '') {
      return source[key];
    }
  }

  return undefined;
}

function extractUserIdFromRaw(user) {
  return valueToText(getOwnFirstValue(user, ['id', 'userId', 'dsUserId', 'digitalSaleUserId', 'user_id']));
}

function extractSaleIdFromRaw(user) {
  const direct = getOwnFirstValue(user, [
    'saleId',
    'saleID',
    'sale_id',
    'saleCode',
    'sale_code',
    'ctvCode',
    'ctv_code',
    'code',
  ]);

  if (direct !== undefined) return normalizeSaleIdValue(direct);

  return normalizeSaleIdValue(getOwnFirstValue(user, ['referralCode']));
}

const SALE_ID_LOOKUP_PAGE_SIZE = 50;
const SALE_ID_LOOKUP_MAX_PAGES = 5;

// Goi API search-users (LIST) THAT, filter theo saleId - tra ve userId + contractStatus (field
// nay CHI co o API list, khong co dang phang o API chi tiet - xem server/modules/
// userContractStatus.cjs).
//
// QUAN TRONG (xac nhan thuc te qua DevTools): filter.saleId cua API nay la khop KIEU TIEN TO
// (vd loc "CTV1183" tra ve ca "CTV11833", "CTV11837", "CTV11838"...), KHONG PHAI khop chinh
// xac. Vi vay phai tu so sanh bang tuyet doi (extractSaleIdFromRaw === targetSaleId) tren ket
// qua tra ve, VA phai doc qua nhieu trang neu dung nguoi khong nam o trang dau (gioi han so
// trang de tranh vong lap vo tan khi ma sale khong ton tai that).
export async function fetchUserIdBySaleId(saleId) {
  const targetSaleId = normalizeSaleIdValue(saleId);

  if (!targetSaleId) return null;

  let page = 0;

  while (page < SALE_ID_LOOKUP_MAX_PAGES) {
    const { users, totalPages } = await fetchUsersPage({
      page,
      size: SALE_ID_LOOKUP_PAGE_SIZE,
      filter: { saleId: targetSaleId },
    });
    const match = users.find((user) => extractSaleIdFromRaw(user) === targetSaleId);

    if (match) {
      const userId = extractUserIdFromRaw(match);

      return userId
        ? { userId, contractStatus: valueToText(match?.contractStatus).toUpperCase() || null }
        : null;
    }

    if (users.length === 0 || (totalPages !== null && page + 1 >= totalPages)) break;

    page += 1;
  }

  return null;
}

function getByPathValue(source, path) {
  return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), source);
}

function normalizeProfileResponse(responseData) {
  const paths = ['data.user', 'data.profile', 'data'];

  for (const path of paths) {
    const value = getByPathValue(responseData, path);

    if (value && typeof value === 'object') return value;
  }

  if (responseData?.user && typeof responseData.user === 'object') return responseData.user;

  return responseData && typeof responseData === 'object' ? responseData : {};
}

// Goi API chi tiet 1 user THAT (khong dung du lieu dong bo local) - chi lay dung 2 field can cho
// export doi soat: so tai khoan TNEX va so CCCD. Cung 1 endpoint dang dung o job dong bo
// USER_DETAIL (server/syncUsersServer.cjs), gio goi thang tu client cho tinh nang nay.
export async function fetchUserProfileById(userId) {
  const response = await axiosClient.get(USER_DETAIL_ENDPOINT, { params: { id: userId } });
  const detail = normalizeProfileResponse(response?.data);

  return {
    bankAccountNumber: valueToText(detail?.bankInfo?.accountNumber),
    identityNumber: valueToText(detail?.identity?.identityNumber),
  };
}
