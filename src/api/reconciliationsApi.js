import axiosClient from './axiosClient.js';
import { ENV } from '../config/env.js';
import { MAX_PAGES } from '../config/constants.js';

const DEFAULT_RECONCILIATION_PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE = 50;

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

function normalizeReconciliationHistoryResponse(responseData, fallbackPage, fallbackSize) {
  const data = responseData?.data ?? responseData;
  const items = getFirstValue(data, ['items', 'content', 'records']) || [];
  const totalElements = getFirstValue(data, ['total', 'totalElements', 'pagination.totalElements']) ?? 0;
  const size = getFirstValue(data, ['size', 'pagination.size']) ?? fallbackSize;
  const page = getFirstValue(data, ['page', 'pagination.page', 'number']) ?? fallbackPage;
  const normalizedSize = Number.isFinite(Number(size)) ? Number(size) : fallbackSize;
  const normalizedTotal = Number.isFinite(Number(totalElements)) ? Number(totalElements) : 0;

  return {
    items: Array.isArray(items) ? items : [],
    page: Number.isFinite(Number(page)) ? Number(page) : fallbackPage,
    size: normalizedSize,
    totalElements: normalizedTotal,
    totalPages: Math.max(Math.ceil(normalizedTotal / (normalizedSize || 1)), 1),
  };
}

export async function fetchReconciliationHistory({
  saleId = '',
  reportDate = '',
  status = '',
  page = 0,
  size = DEFAULT_RECONCILIATION_PAGE_SIZE,
} = {}) {
  const response = await axiosClient.post(ENV.RECONCILIATION_HISTORY_ENDPOINT, {
    saleId,
    reportDate,
    status,
    page,
    size,
  });

  return normalizeReconciliationHistoryResponse(response.data, page, size);
}

export async function fetchAllReconciliationHistory({ saleId = '', reportDate = '', status = '' } = {}, { onProgress } = {}) {
  const allItems = [];
  let page = 0;
  let totalElements = 0;

  while (page < MAX_PAGES) {
    const result = await fetchReconciliationHistory({
      saleId,
      reportDate,
      status,
      page,
      size: EXPORT_PAGE_SIZE,
    });

    allItems.push(...result.items);
    totalElements = result.totalElements;

    if (onProgress) {
      onProgress({
        fetchedCount: allItems.length,
        totalElements,
        currentPage: page + 1,
        totalPages: result.totalPages,
      });
    }

    const reachedLastPage = result.items.length < EXPORT_PAGE_SIZE || allItems.length >= totalElements || page + 1 >= result.totalPages;

    if (reachedLastPage) break;

    page += 1;
  }

  return { items: allItems, totalElements };
}
