const fs = require('fs');
const path = require('path');

const { OUTPUT_ROOT } = require('../utils/outputPaths.cjs');
const segmentUserSearch = require('./segmentUserSearch.cjs');

const SEGMENTS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'segments');
const SEGMENTS_MASTER_FILE = path.join(SEGMENTS_OUTPUT_DIR, 'segments_all.json');

function timestamp() {
  const d = new Date();
  const p = (value) => String(value).padStart(2, '0');

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds()
  )}`;
}

function ensureSegmentStore() {
  if (!fs.existsSync(SEGMENTS_OUTPUT_DIR)) {
    fs.mkdirSync(SEGMENTS_OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(SEGMENTS_MASTER_FILE)) {
    fs.writeFileSync(SEGMENTS_MASTER_FILE, '[]\n', 'utf8');
  }
}

function readSegments() {
  ensureSegmentStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(SEGMENTS_MASTER_FILE, 'utf8'));

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const backupFile = path.join(SEGMENTS_OUTPUT_DIR, `segments_all_corrupted_${timestamp()}.json`);

    try {
      fs.copyFileSync(SEGMENTS_MASTER_FILE, backupFile);
      fs.writeFileSync(SEGMENTS_MASTER_FILE, '[]\n', 'utf8');
    } catch {
      // Ignore backup failure and surface a clear store reset below.
    }

    return [];
  }
}

function writeSegments(segments) {
  ensureSegmentStore();

  const tempFile = `${SEGMENTS_MASTER_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(segments, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, SEGMENTS_MASTER_FILE);
}

function normalizeSavedUsers(users = []) {
  return Array.from(
    new Map(
      users
        .map((user) => ({
          saleId: String(user?.saleId || '').trim(),
          userId: String(user?.userId || '').trim(),
        }))
        .filter((user) => user.saleId && user.userId)
        .map((user) => [`${user.saleId.toUpperCase()}__${user.userId}`, user])
    ).values()
  );
}

function getMatchedUsersForSegment(filters = {}) {
  if (typeof segmentUserSearch.getMatchedSegmentUsers === 'function') {
    return segmentUserSearch.getMatchedSegmentUsers(filters);
  }

  if (typeof segmentUserSearch.searchSegmentUsers === 'function') {
    const result = segmentUserSearch.searchSegmentUsers({
      filters,
      page: 0,
      size: Number.MAX_SAFE_INTEGER,
    });

    return Array.isArray(result?.items) ? result.items : [];
  }

  const error = new Error('Khong the lay danh sach user phu hop de luu segment.');
  error.statusCode = 500;
  throw error;
}

function createSegmentId() {
  return `seg_${Date.now().toString(36)}`;
}

function createSegment(payload = {}) {
  const name = String(payload.name || '').trim();

  if (!name) {
    const error = new Error('Vui lòng nhập tên segment.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const segment = {
    id: createSegmentId(),
    name,
    description: String(payload.description || '').trim(),
    createdBy: payload.createdBy || 'nguyettn',
    createdAt: now,
    updatedAt: now,
    filters: payload.filters || {},
    savedUsers: [],
    recipients: [],
    userIds: [],
    userCount: 0,
    totalUsers: 0,
  };
  const segments = [segment, ...readSegments()];

  writeSegments(segments);

  return segment;
}

function updateSegment(segmentId, patch = {}) {
  let updatedSegment = null;
  const segments = readSegments().map((segment) => {
    if (String(segment.id) !== String(segmentId)) return segment;

    updatedSegment = {
      ...segment,
      ...patch,
      id: segment.id,
      updatedAt: new Date().toISOString(),
    };

    return updatedSegment;
  });

  if (!updatedSegment) {
    const error = new Error('Không tìm thấy segment.');
    error.statusCode = 404;
    throw error;
  }

  writeSegments(segments);

  return updatedSegment;
}

function getSegmentById(segmentId) {
  return readSegments().find((segment) => String(segment.id) === String(segmentId)) || null;
}

function deleteSegment(segmentId) {
  const segments = readSegments();
  const nextSegments = segments.filter((segment) => String(segment.id) !== String(segmentId));

  if (nextSegments.length === segments.length) return false;

  writeSegments(nextSegments);

  return true;
}

function saveSegmentUsers(segmentId, filters = {}) {
  const segment = getSegmentById(segmentId);

  if (!segment) {
    const error = new Error('Không tìm thấy segment.');
    error.statusCode = 404;
    throw error;
  }

  const savedUsers = normalizeSavedUsers(getMatchedUsersForSegment(filters));
  const nextSegment = updateSegment(segmentId, {
    filters,
    savedUsers,
    recipients: savedUsers,
    userIds: savedUsers.map((user) => user.userId),
    userCount: savedUsers.length,
    totalUsers: savedUsers.length,
  });

  return {
    segment: nextSegment,
    totalSaved: savedUsers.length,
  };
}

module.exports = {
  SEGMENTS_MASTER_FILE,
  SEGMENTS_OUTPUT_DIR,
  createSegment,
  deleteSegment,
  ensureSegmentStore,
  getSegmentById,
  readSegments,
  saveSegmentUsers,
  updateSegment,
  writeSegments,
};
