import axiosClient from './axiosClient.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGES } from '../config/constants.js';
import { ENV } from '../config/env.js';

// Endpoint paths are sourced from env config so request setup stays centralized.
const LOANS_ENDPOINT = ENV.LOANS_ENDPOINT;
const loansInFlight = new Map();

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

function normalizeLoansResponse(responseData) {
  const loans =
    getFirstValue(responseData, [
      'data.loans',
      'data.content',
      'data.items',
      'data.records',
      'loans',
      'content',
      'items',
      'records',
    ]) || [];

  const total = getFirstValue(responseData, [
    'data.total',
    'data.totalElements',
    'data.totalItems',
    'data.pagination.totalElements',
    'data.page.totalElements',
    'total',
    'totalElements',
    'totalItems',
    'pagination.totalElements',
    'page.totalElements',
  ]);
  const totalPages = getFirstValue(responseData, [
    'data.totalPages',
    'data.pagination.totalPages',
    'data.page.totalPages',
    'totalPages',
    'pagination.totalPages',
    'page.totalPages',
  ]);

  return {
    loans: Array.isArray(loans) ? loans : [loans],
    total: Number.isFinite(Number(total)) ? Number(total) : null,
    totalPages: Number.isFinite(Number(totalPages)) ? Number(totalPages) : null,
  };
}

function shouldStopPaging({ loansLength, total, totalPages, totalFetched, page, pageSize }) {
  if (loansLength === 0) return true;
  if (total !== null && totalFetched >= total) return true;
  if (totalPages !== null && page + 1 >= totalPages) return true;

  return loansLength < pageSize;
}

function makeLoansCacheKey({ filter, size }) {
  return JSON.stringify({ filter, size });
}

export async function fetchLoansPage({ page = 0, size = DEFAULT_PAGE_SIZE, filter = {} } = {}) {
  const response = await axiosClient.post(LOANS_ENDPOINT, {
    filter,
    page,
    size,
  });

  return normalizeLoansResponse(response.data);
}

export async function fetchAllLoans({ filter = {}, size = DEFAULT_PAGE_SIZE } = {}) {
  const cacheKey = makeLoansCacheKey({ filter, size });

  if (loansInFlight.has(cacheKey)) {
    return loansInFlight.get(cacheKey);
  }

  const request = fetchAllLoansUncached({ filter, size })
    .finally(() => {
      loansInFlight.delete(cacheKey);
    });

  loansInFlight.set(cacheKey, request);
  return request;
}

export function clearLoansCache() {
  // Response TTL is managed by requestCache; this API layer only dedupes in-flight calls.
}

async function fetchAllLoansUncached({ filter, size }) {
  const allLoans = [];
  let page = 0;
  let totalFetched = 0;

  while (page < MAX_PAGES) {
    const { loans, total, totalPages } = await fetchLoansPage({
      page,
      size,
      filter,
    });

    allLoans.push(...loans);
    totalFetched += loans.length;

    if (
      shouldStopPaging({
        loansLength: loans.length,
        total,
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

  return allLoans;
}
