import axiosClient from './axiosClient.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGES } from '../config/constants.js';
import { ENV } from '../config/env.js';

// Endpoint paths are sourced from env config so request setup stays centralized.
const SEARCH_USERS_ENDPOINT = ENV.SEARCH_USERS_ENDPOINT;
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
