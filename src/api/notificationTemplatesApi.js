import axiosClient from './axiosClient.js';
import { ENV } from '../config/env.js';

const DEFAULT_NOTIFICATION_PAGE_SIZE = 40;

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

function normalizeNotificationTemplatesResponse(responseData, fallbackPage, fallbackSize) {
  const data = responseData?.data ?? responseData;
  const items = getFirstValue(data, ['data.content', 'data.templates', 'data', 'content', 'templates']) || [];
  const paginationSource = getFirstValue(data, ['data', 'pagination']) || {};
  const totalElements = getFirstValue(paginationSource, ['totalElements', 'total']) ?? 0;
  const totalPages = getFirstValue(paginationSource, ['totalPages']) ?? 0;
  const size = getFirstValue(paginationSource, ['size']) ?? fallbackSize;
  const page = getFirstValue(paginationSource, ['number', 'page']) ?? fallbackPage;

  return {
    items: Array.isArray(items) ? items : [],
    page: Number.isFinite(Number(page)) ? Number(page) : fallbackPage,
    size: Number.isFinite(Number(size)) ? Number(size) : fallbackSize,
    totalElements: Number.isFinite(Number(totalElements)) ? Number(totalElements) : 0,
    totalPages: Number.isFinite(Number(totalPages)) ? Number(totalPages) : 0,
  };
}

export async function fetchNotificationTemplates({ page = 0, size = DEFAULT_NOTIFICATION_PAGE_SIZE } = {}) {
  const response = await axiosClient.get(ENV.NOTIFICATION_TEMPLATES_ENDPOINT, {
    params: {
      page,
      size,
    },
  });

  return normalizeNotificationTemplatesResponse(response.data, page, size);
}

export async function createNotificationTemplate(payload) {
  const response = await axiosClient.post(ENV.NOTIFICATION_TEMPLATES_ENDPOINT, {
    code: payload.code,
    titleTemplate: payload.titleTemplate,
    bodyTemplate: payload.bodyTemplate,
  });

  return response?.data;
}

export async function updateNotificationTemplate(payload) {
  const response = await axiosClient.patch(ENV.NOTIFICATION_TEMPLATES_ENDPOINT, {
    id: payload.id,
    code: payload.code,
    titleTemplate: payload.titleTemplate,
    bodyTemplate: payload.bodyTemplate,
  });

  return response?.data;
}
