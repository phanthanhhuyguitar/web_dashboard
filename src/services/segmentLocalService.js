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

export function getSegments() {
  return readSegments();
}

export function createSegment(segment) {
  const now = new Date().toISOString();
  const nextSegment = {
    id: createSegmentId(),
    name: segment.name,
    description: segment.description || '',
    filters: segment.filters || {},
    recipients: [],
    userIds: [],
    totalUsers: 0,
    createdBy: segment.createdBy || 'nguyettn',
    createdAt: now,
    updatedAt: now,
  };
  const segments = [nextSegment, ...readSegments()];

  writeSegments(segments);

  return nextSegment;
}

export function updateSegment(id, payload) {
  let updatedSegment = null;
  const segments = readSegments().map((segment) => {
    if (String(segment.id) !== String(id)) return segment;

    updatedSegment = {
      ...segment,
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    return updatedSegment;
  });

  writeSegments(segments);

  return updatedSegment;
}

export function deleteSegment(id) {
  const segments = readSegments();
  const nextSegments = segments.filter((segment) => String(segment.id) !== String(id));

  writeSegments(nextSegments);

  return nextSegments.length !== segments.length;
}

export function searchSegments({ keyword = '', page = 1, size = 10 } = {}) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(size) || 10, 1);
  const allSegments = readSegments();
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
}
