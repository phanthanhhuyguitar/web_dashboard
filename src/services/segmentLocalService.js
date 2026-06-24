import { getAccessToken } from '../utils/storage.js';

const SEGMENT_STORAGE_KEY = 'tnex_notification_segments_v1';
const MOCK_SEGMENTS = [
  {
    id: 'seg_001',
    name: 'Danh sách ctv mở tài dưới 1 tháng',
    description: '',
    filters: {},
    recipients: [],
    userIds: [],
    totalUsers: 790,
    createdBy: 'nguyettn',
    createdAt: '2026-12-20T12:12:30',
    updatedAt: '2026-12-20T12:12:30',
  },
  {
    id: 'seg_002',
    name: 'Danh sách ctv không giới thiệu đơn vay nào',
    description: '',
    filters: {},
    recipients: [],
    userIds: [],
    totalUsers: 1890,
    createdBy: 'nguyettn',
    createdAt: '2026-12-20T12:12:30',
    updatedAt: '2026-12-20T12:12:30',
  },
  {
    id: 'seg_003',
    name: 'Danh sách ctv không giới thiệu đơn vay nào',
    description: '',
    filters: {},
    recipients: [],
    userIds: [],
    totalUsers: 12,
    createdBy: 'nguyettn',
    createdAt: '2026-12-20T12:12:30',
    updatedAt: '2026-12-20T12:12:30',
  },
  {
    id: 'seg_004',
    name: 'Danh sách ctv không giới thiệu đơn vay nào',
    description: '',
    filters: {},
    recipients: [],
    userIds: [],
    totalUsers: 12,
    createdBy: 'nguyettn',
    createdAt: '2026-12-20T12:12:30',
    updatedAt: '2026-12-20T12:12:30',
  },
  {
    id: 'seg_005',
    name: 'Danh sách ctv không giới thiệu đơn vay nào',
    description: '',
    filters: {},
    recipients: [],
    userIds: [],
    totalUsers: 23,
    createdBy: 'nguyettn',
    createdAt: '2026-12-20T12:12:30',
    updatedAt: '2026-12-20T12:12:30',
  },
];

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readSegments() {
  if (!canUseLocalStorage()) return [...MOCK_SEGMENTS];

  const rawValue = window.localStorage.getItem(SEGMENT_STORAGE_KEY);

  if (!rawValue) {
    window.localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify(MOCK_SEGMENTS));
    return [...MOCK_SEGMENTS];
  }

  const parsedValue = JSON.parse(rawValue);

  return Array.isArray(parsedValue) ? parsedValue : [];
}

function writeSegments(segments) {
  if (!canUseLocalStorage()) return;

  window.localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify(segments));
}

function createSegmentId() {
  return `seg_${Date.now().toString(36)}`;
}

async function requestJson(path, options = {}) {
  const token = getAccessToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || 'Yêu cầu không thành công.');
    error.response = {
      status: response.status,
      data,
    };
    throw error;
  }

  return data;
}

export function getSegments() {
  return requestJson('/api/segments').then((result) => result.items || []);
}

export function getSegmentById(id) {
  return requestJson(`/api/segments/${encodeURIComponent(id)}`).then((result) => result.segment || null);
}

export function createSegment(segment) {
  return requestJson('/api/segments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(segment),
  }).then((result) => result.segment);
}

export function updateSegment(id, payload) {
  return requestJson(`/api/segments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).then((result) => result.segment);
}

export function deleteSegment(id) {
  return requestJson(`/api/segments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).then((result) => Boolean(result.success));
}

export function searchSegments({ keyword = '', page = 1, size = 10 } = {}) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(size) || 10, 1);

  return getSegments().then((allSegments) => {
    const filteredSegments = normalizedKeyword
      ? allSegments.filter((segment) => String(segment.name || '').toLowerCase().includes(normalizedKeyword))
      : allSegments;
    const totalElements = filteredSegments.length;
    const totalPages = Math.max(Math.ceil(totalElements / pageSize), 1);
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const items = filteredSegments.slice(startIndex, startIndex + pageSize);

    return {
      items,
      page: safePage,
      pageSize,
      totalElements,
      totalPages,
    };
  });
}

export async function searchSegmentUsers(filters = {}, page = 1, size = 10) {
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(size) || 10, 1);
  const result = await requestJson('/api/segments/users/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters,
      page: currentPage - 1,
      size: pageSize,
    }),
  });
  const total = Number(result.total) || 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return {
    items: result.items || [],
    page: (Number(result.page) || 0) + 1,
    pageSize,
    total,
    totalPages,
    meta: result.meta || null,
  };
}

export function saveSegmentUsers(segmentId, filters = {}) {
  return requestJson(`/api/segments/${encodeURIComponent(segmentId)}/users/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters,
      mode: 'ALL_MATCHED_USERS',
    }),
  });
}

export async function getSegmentConversion({ segmentId, evaluationMonth, segmentUsers = [] }) {
  return requestJson('/api/segments/conversion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      segmentId,
      evaluationMonth,
      segmentUsers,
    }),
  });
}

export async function syncUserList() {
  return requestJson('/api/admin/segments/sync-users/start', {
    method: 'POST',
  });
}

export async function getSyncUserListStatus(jobId) {
  return requestJson(`/api/admin/segments/sync-users/status/${encodeURIComponent(jobId)}`);
}

export async function pauseSyncUserList(jobId) {
  return requestJson(`/api/admin/segments/sync-users/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
  });
}

export async function resumeSyncUserList(jobId) {
  return requestJson(`/api/admin/segments/sync-users/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
  });
}

export async function cancelSyncUserList(jobId) {
  return requestJson(`/api/admin/segments/sync-users/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

export async function syncUserDetailList() {
  return requestJson('/api/users/sync-user-details-from-latest-file', {
    method: 'POST',
  });
}

export async function getSyncUserDetailListStatus(jobId) {
  return requestJson(`/api/users/sync-user-details-from-latest-file/status/${encodeURIComponent(jobId)}`);
}

export async function pauseSyncUserDetailList(jobId) {
  return requestJson(`/api/users/sync-user-details-from-latest-file/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
  });
}

export async function resumeSyncUserDetailList(jobId) {
  return requestJson(`/api/users/sync-user-details-from-latest-file/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
  });
}

export async function cancelSyncUserDetailList(jobId) {
  return requestJson(`/api/users/sync-user-details-from-latest-file/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

export async function syncLoanList() {
  return requestJson('/api/sync/loans', {
    method: 'POST',
  });
}

export async function getSyncLoanListStatus(jobId) {
  return requestJson(`/api/sync/loans/status/${encodeURIComponent(jobId)}`);
}

export async function pauseSyncLoanList(jobId) {
  return requestJson(`/api/sync/loans/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
  });
}

export async function resumeSyncLoanList(jobId) {
  return requestJson(`/api/sync/loans/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
  });
}

export async function cancelSyncLoanList(jobId) {
  return requestJson(`/api/sync/loans/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

export async function syncLoanDetailList() {
  return requestJson('/api/sync/loan-details', {
    method: 'POST',
  });
}

export async function getSyncLoanDetailListStatus(jobId) {
  return requestJson(`/api/sync/loan-details/status/${encodeURIComponent(jobId)}`);
}

export async function pauseSyncLoanDetailList(jobId) {
  return requestJson(`/api/sync/loan-details/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
  });
}

export async function resumeSyncLoanDetailList(jobId) {
  return requestJson(`/api/sync/loan-details/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
  });
}

export async function cancelSyncLoanDetailList(jobId) {
  return requestJson(`/api/sync/loan-details/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}
