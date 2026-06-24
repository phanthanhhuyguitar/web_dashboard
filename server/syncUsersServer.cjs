const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  PROJECT_ROOT,
  USERS_OUTPUT_DIR,
  LOANS_OUTPUT_DIR,
  USER_DETAIL_MASTER_FILE,
  USER_SYNC_JOB_STATUS_FILE,
} = require('./utils/outputPaths.cjs');
const { searchSegmentUsers } = require('./modules/segmentUserSearch.cjs');
const { calculateSegmentConversion } = require('./modules/segmentConversionAnalytics.cjs');
const {
  createSegment,
  deleteSegment,
  getSegmentById,
  readSegments,
  saveSegmentUsers: saveSegmentUsersToFile,
  updateSegment,
} = require('./modules/segmentStore.cjs');
const { createLoanJobPaths, runSyncLoansJob, timestamp: loanTimestamp } = require('./modules/syncLoans.cjs');
const {
  createLoanDetailJobPaths,
  runSyncLoanDetailsJob,
  timestamp: loanDetailTimestamp,
} = require('./modules/syncLoanDetails.cjs');

function getUsersOutputDir() {
  return USERS_OUTPUT_DIR;
}

function getListUserOutputPath(timestampText) {
  return path.join(getUsersOutputDir(), `listUser_${timestampText}.txt`);
}

function getLatestListUserOutputPath() {
  return path.join(getUsersOutputDir(), 'listUser_latest.txt');
}

function getSyncUserLogPath(timestampText) {
  return path.join(getUsersOutputDir(), `sync_user_log_${timestampText}.txt`);
}

function getSyncUserDetailLogPath(timestampText) {
  return path.join(getUsersOutputDir(), `sync_user_detail_log_${timestampText}.txt`);
}

function getStatusFilePath() {
  return USER_SYNC_JOB_STATUS_FILE;
}

function getUserDetailMasterOutputPath() {
  return USER_DETAIL_MASTER_FILE;
}

function getUserDetailSnapshotOutputPath(timestampText) {
  return path.join(getUsersOutputDir(), `list_user_detail_${timestampText}.txt`);
}

function getUserDetailFailedOutputPath(timestampText) {
  return path.join(getUsersOutputDir(), `list_user_detail_failed_${timestampText}.txt`);
}

const STATUS_FILE = getStatusFilePath();
const API_BASE_URL = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'https://api-gw-ds.tnex.com.vn';
const SEARCH_USERS_ENDPOINT =
  process.env.VITE_SEARCH_USERS_ENDPOINT ||
  process.env.SEARCH_USERS_ENDPOINT ||
  '/digital-sale-admin/api/v1/admin/search-users';
const USER_DETAIL_URL =
  process.env.VITE_USER_DETAIL_URL ||
  process.env.USER_DETAIL_URL ||
  `${API_BASE_URL}/digital-sale-admin/api/v1/admin/users/profile`;
const PORT = Number(process.env.SYNC_USERS_PORT || process.env.PORT || 4174);

const SYNC_USER_CONFIG = {
  pageSize: Number(process.env.SYNC_USER_PAGE_SIZE || 20),
  concurrency: 1,
  delayBetweenRequestsMs: Number(process.env.SYNC_USER_DELAY_MS || 500),
  timeoutMs: Number(process.env.SYNC_USER_TIMEOUT_MS || 15000),
  maxRetries: 0,
  logEveryPage: true,
};

const USER_DETAIL_CONFIG = {
  concurrency: getNumberEnv('USER_DETAIL_CONCURRENCY', 1, 1),
  delayBetweenRequestsMs: getNumberEnv('USER_DETAIL_DELAY_MS', 500, 0),
  timeoutMs: getNumberEnv('USER_DETAIL_TIMEOUT_MS', 15000, 1000),
  maxRetries: getNumberEnv('USER_DETAIL_MAX_RETRIES', 0, 0),
  retryDelayMs: getNumberEnv('USER_DETAIL_RETRY_DELAY_MS', 1000, 0),
  logEvery: getNumberEnv('USER_DETAIL_LOG_EVERY', 50, 1),
};

let currentJob = null;
const jobs = new Map();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getNumberEnv(name, fallback, minValue = 0) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isFinite(value)) return fallback;

  return Math.max(minValue, value);
}

function timestamp() {
  const d = new Date();
  const p = (value) => String(value).padStart(2, '0');

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds()
  )}`;
}

function toRelative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function getOutputWriteErrorMessage() {
  return 'Äá»“ng bá»™ DS user tháº¥t báº¡i. KhÃ´ng thá»ƒ ghi file output.';
}

function createOutputWriteError(error) {
  return new Error(error?.message ? `${getOutputWriteErrorMessage()} ${error.message}` : getOutputWriteErrorMessage());
}

function createUserDetailOutputWriteError(error) {
  const message = 'Äá»“ng bá»™ DS user tháº¥t báº¡i. KhÃ´ng thá»ƒ ghi file output.';

  return new Error(error?.message ? `${message} ${error.message}` : message);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error('Request body qua lon.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body khong phai JSON hop le.'));
      }
    });

    req.on('error', reject);
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : '';
}

function getByPath(source, pathText) {
  return pathText.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function getFirstValue(source, paths) {
  for (const item of paths) {
    const value = getByPath(source, item);

    if (value !== undefined && value !== null) return value;
  }

  return undefined;
}

function normalizeUsers(responseData) {
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

  return Array.isArray(users) ? users : [users];
}

function getTotalUsers(responseData) {
  const total = getFirstValue(responseData, [
    'data.pagination.total',
    'data.pagination.totalElements',
    'data.pagination.totalItems',
    'data.total',
    'total',
    'totalElements',
    'totalItems',
  ]);
  const totalNumber = Number(total);

  return Number.isFinite(totalNumber) && totalNumber > 0 ? totalNumber : null;
}

function getProgress(totalWritten, totalUsers, page) {
  if (totalUsers) {
    return Math.min(99, Math.floor((totalWritten / totalUsers) * 100));
  }

  return Math.min(95, Math.max(1, page * 3));
}

function getUserKey(user) {
  return String(user?.userId || user?.id || user?.user_id || user?.dsUserId || '').trim();
}

function parseUserIdFromLine(line) {
  const value = String(line || '').trim();

  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    const userId = getUserKey(parsed);

    if (userId) return userId;
  } catch {
    // Not JSON, continue with UUID extraction.
  }

  const matched = value.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);

  return matched ? matched[0] : null;
}

function readUserIds(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const userIds = content
    .split(/\r?\n/)
    .map(parseUserIdFromLine)
    .filter(Boolean);

  return [...new Set(userIds)];
}

function readExistingProcessedUserIds(filePath) {
  const processed = new Set();

  if (!fs.existsSync(filePath)) return processed;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const userId = getUserKey(parsed);

      if (userId) processed.add(userId);
    } catch {
      // Ignore invalid master lines so one bad line does not stop the sync flow.
    }
  }

  return processed;
}

function parseListUserTimestamp(fileName) {
  const matched = String(fileName || '').match(/^listUser_(\d{8}_\d{6})\.txt$/);

  return matched ? matched[1] : '';
}

function findLatestListUserFile() {
  ensureDir(USERS_OUTPUT_DIR);

  const files = fs
    .readdirSync(USERS_OUTPUT_DIR, { withFileTypes: true })
    .filter((item) => item.isFile() && /^listUser_.*\.txt$/.test(item.name))
    .map((item) => {
      const filePath = path.join(USERS_OUTPUT_DIR, item.name);
      const stat = fs.statSync(filePath);

      return {
        name: item.name,
        path: filePath,
        timestampText: parseListUserTimestamp(item.name),
        mtimeMs: stat.mtimeMs,
      };
    });

  if (files.length === 0) return null;

  const timestampFiles = files.filter((item) => item.timestampText);

  if (timestampFiles.length > 0) {
    return timestampFiles.sort((a, b) => b.timestampText.localeCompare(a.timestampText))[0].path;
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].path;
}

function normalizeUserDetailResponse(responseData, userId) {
  const data =
    getFirstValue(responseData, ['data.user', 'data.profile', 'data']) ||
    responseData?.user ||
    responseData;

  if (!data || typeof data !== 'object') {
    return {
      userId,
      raw: responseData,
      syncedAt: new Date().toISOString(),
    };
  }

  return {
    ...data,
    userId: data.userId || data.id || userId,
    syncedAt: new Date().toISOString(),
  };
}

function writeJsonLine(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function writeStatus(job) {
  ensureDir(USERS_OUTPUT_DIR);
  fs.writeFileSync(STATUS_FILE, JSON.stringify(publicJob(job), null, 2), 'utf8');
}

function logLine(job, line) {
  fs.appendFileSync(job.logFileAbs, `${line}\n`, 'utf8');
}

function publicJob(job) {
  const payload = {
    success: true,
    jobId: job.jobId,
    type: job.type || 'USER_LIST',
    status: job.status,
    progress: job.progress,
    currentPage: job.currentPage,
    totalWritten: job.totalWritten,
    currentMessage: repairMojibakeText(job.currentMessage),
    errorMessage: repairMojibakeText(job.errorMessage) || null,
    outputFile: job.outputFileAbs ? toRelative(job.outputFileAbs) : null,
    latestFile: job.latestFileAbs && job.status === 'COMPLETED' ? toRelative(job.latestFileAbs) : null,
    logFile: job.logFileAbs ? toRelative(job.logFileAbs) : null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };

  if (job.type === 'USER_DETAIL') {
    payload.totalInput = job.totalInput || 0;
    payload.alreadyProcessed = job.alreadyProcessed || 0;
    payload.totalNeedSync = job.totalNeedSync || 0;
    payload.done = job.done || 0;
    payload.successCount = job.successCount || 0;
    payload.failedCount = job.failedCount || 0;
    payload.speed = job.speed || 0;
    payload.currentUserId = job.currentUserId || null;
    payload.inputFile = job.inputFileAbs ? toRelative(job.inputFileAbs) : null;
    payload.masterFile = job.masterFileAbs ? toRelative(job.masterFileAbs) : null;
    payload.snapshotFile = job.snapshotFileAbs ? toRelative(job.snapshotFileAbs) : null;
    payload.latestFile = job.latestFileAbs ? toRelative(job.latestFileAbs) : null;
    payload.failedFile = job.failedFileAbs ? toRelative(job.failedFileAbs) : null;
  }

  if (job.type === 'LOAN') {
    payload.totalFromApi = job.totalFromApi ?? 0;
    payload.totalPages = job.totalPages || null;
    payload.processed = job.processed || 0;
    payload.inserted = job.inserted || 0;
    payload.updated = job.updated || 0;
    payload.failedCount = job.failedCount || 0;
    payload.speed = job.speed || 0;
    payload.totalInMaster = job.totalInMaster || 0;
    payload.masterFile = job.masterFileAbs ? toRelative(job.masterFileAbs) : null;
    payload.snapshotFile = job.snapshotFileAbs ? toRelative(job.snapshotFileAbs) : null;
    payload.failedFile = job.failedFileAbs ? toRelative(job.failedFileAbs) : null;
  }

  if (job.type === 'LOAN_DETAIL') {
    payload.totalInput = job.totalInput || 0;
    payload.alreadyProcessed = job.alreadyProcessed || 0;
    payload.totalNeedSync = job.totalNeedSync || 0;
    payload.done = job.done || 0;
    payload.successCount = job.successCount || 0;
    payload.failedCount = job.failedCount || 0;
    payload.skippedMissingCount = job.skippedMissingCount || 0;
    payload.speed = job.speed || 0;
    payload.currentLoanId = job.currentLoanId || null;
    payload.inserted = job.inserted || 0;
    payload.updated = job.updated || 0;
    payload.totalInMaster = job.totalInMaster || 0;
    payload.inputFile = job.inputFileAbs ? toRelative(job.inputFileAbs) : null;
    payload.masterFile = job.masterFileAbs ? toRelative(job.masterFileAbs) : null;
    payload.snapshotFile = job.snapshotFileAbs ? toRelative(job.snapshotFileAbs) : null;
    payload.failedFile = job.failedFileAbs ? toRelative(job.failedFileAbs) : null;
    payload.statusFile = job.statusFileAbs ? toRelative(job.statusFileAbs) : null;
  }

  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function repairMojibakeText(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÄÂÆâ€ºœžŸ]/.test(value)) return value;

  const cp1252 = new Map([
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f],
  ]);

  try {
    const bytes = [];

    for (const char of value) {
      const code = char.charCodeAt(0);

      if (code <= 0xff) {
        bytes.push(code);
      } else if (cp1252.has(code)) {
        bytes.push(cp1252.get(code));
      } else {
        return value;
      }
    }

    return Buffer.from(bytes).toString('utf8');
  } catch {
    return value;
  }
}

function isActiveJob(job) {
  return job?.status === 'RUNNING' || job?.status === 'PAUSED' || (job?.cancelRequested && !job?.finishedAt);
}

async function waitIfPaused(job) {
  while (job.status === 'PAUSED' && !job.cancelRequested) {
    await sleep(300);
  }
}

function assertJobCanContinue(job) {
  if (job.cancelRequested || job.status === 'CANCELLED') {
    throw new Error('SYNC_CANCELLED');
  }
}

function markJobCancelled(job) {
  job.status = 'CANCELLED';
  job.progress = Math.min(Math.max(Number(job.progress) || 0, 0), 100);
  job.finishedAt = new Date().toISOString();
  job.currentUserId = null;
  job.currentMessage = 'ÄÃ£ há»§y Ä‘á»“ng bá»™. Dá»¯ liá»‡u Ä‘Ã£ xá»­ lÃ½ trÆ°á»›c Ä‘Ã³ váº«n Ä‘Æ°á»£c giá»¯ láº¡i.';
  logLine(job, '');
  logLine(job, '=== DA HUY DONG BO ===');
  logLine(job, `Finished time: ${job.finishedAt}`);
}

async function requestSearchUsers({ token, page }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_USER_CONFIG.timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${SEARCH_USERS_ENDPOINT}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filter: {
          saleId: null,
          contractStatuses: [],
        },
        page,
        size: SYNC_USER_CONFIG.pageSize,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      success: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : text,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      data: null,
      error: error?.name === 'AbortError' ? `Request timeout sau ${SYNC_USER_CONFIG.timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSyncJob(job, token) {
  let writer = null;
  const startMs = Date.now();
  let page = 0;

  try {
    writer = fs.createWriteStream(job.outputFileAbs, { encoding: 'utf8' });
    writer.on('error', (error) => {
      job.writeError = createOutputWriteError(error);
    });

    logLine(job, '=== BAT DAU DONG BO DS USER ===');
    logLine(job, `JobId: ${job.jobId}`);
    logLine(job, `Output file: ${toRelative(job.outputFileAbs)}`);
    logLine(job, `Latest file: ${toRelative(job.latestFileAbs)}`);
    logLine(job, `Start time: ${job.startedAt}`);
    logLine(job, '');

    while (true) {
      await waitIfPaused(job);
      assertJobCanContinue(job);

      job.currentPage = page + 1;
      job.currentMessage = `Äang xá»­ lÃ½ page ${page + 1}...`;
      writeStatus(job);

      const result = await requestSearchUsers({ token, page });
      assertJobCanContinue(job);

      if (!result.success) {
        throw new Error(`Page ${page + 1} | ERROR | HTTP ${result.status} | ${result.error || 'Unknown error'}`);
      }

      const users = normalizeUsers(result.data);
      const totalUsers = getTotalUsers(result.data);

      if (users.length === 0) {
        logLine(job, `Page ${page + 1} | HTTP ${result.status} | users: 0 | STOP`);
        break;
      }

      for (const user of users) {
        if (job.writeError) throw job.writeError;

        writer.write(`${JSON.stringify(user)}\n`);
      }

      if (job.writeError) throw job.writeError;

      job.totalWritten += users.length;
      job.progress = getProgress(job.totalWritten, totalUsers, page + 1);
      job.currentMessage = `Äang xá»­ lÃ½ page ${page + 1} â€¢ ÄÃ£ ghi ${job.totalWritten} users`;

      if (SYNC_USER_CONFIG.logEveryPage) {
        const durationSec = Math.max((Date.now() - startMs) / 1000, 0.001);
        const speed = Math.round((job.totalWritten / durationSec) * 100) / 100;

        logLine(
          job,
          `Page ${page + 1} | HTTP ${result.status} | users: ${users.length} | totalWritten: ${
            job.totalWritten
          } | progress: ${job.progress}% | speed: ${speed} users/s`
        );
      }

      writeStatus(job);
      page += 1;
      await waitIfPaused(job);
      assertJobCanContinue(job);
      await sleep(SYNC_USER_CONFIG.delayBetweenRequestsMs);
    }

    await new Promise((resolve, reject) => {
      writer.end(() => {
        if (job.writeError) {
          reject(job.writeError);
          return;
        }

        resolve();
      });
    });
    fs.copyFileSync(job.outputFileAbs, job.latestFileAbs);

    job.status = 'COMPLETED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.currentMessage = `ÄÃ£ Ä‘á»“ng bá»™ DS user thÃ nh cÃ´ng. File Ä‘Æ°á»£c lÆ°u táº¡i: ${toRelative(job.outputFileAbs)}`;

    logLine(job, '');
    logLine(job, '=== HOAN TAT ===');
    logLine(job, `Total user: ${job.totalWritten}`);
    logLine(job, `Finished time: ${job.finishedAt}`);
    logLine(job, `Duration: ${Math.round((Date.now() - startMs) / 1000)}s`);
  } catch (error) {
    if (writer) {
      await new Promise((resolve) => writer.end(resolve));
    }

    if (error.message === 'SYNC_CANCELLED') {
      markJobCancelled(job);
      return;
    }

    job.status = 'FAILED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.errorMessage = error.message;
    job.currentMessage = error.message.includes(getOutputWriteErrorMessage())
      ? getOutputWriteErrorMessage()
      : `Äá»“ng bá»™ tháº¥t báº¡i táº¡i page ${job.currentPage}.`;
    job.latestFileAbs = null;

    logLine(job, '');
    logLine(job, error.message);
    logLine(job, `Finished time: ${job.finishedAt}`);
  } finally {
    if (currentJob?.jobId === job.jobId) {
      currentJob = null;
    }
    writeStatus(job);
  }
}

function createJob(token) {
  ensureDir(USERS_OUTPUT_DIR);

  const ts = timestamp();
  const jobId = `sync_users_${ts}`;
  const job = {
    jobId,
    type: 'USER_LIST',
    status: 'RUNNING',
    progress: 0,
    currentPage: 0,
    totalWritten: 0,
    currentMessage: 'Äang báº¯t Ä‘áº§u Ä‘á»“ng bá»™ danh sÃ¡ch user...',
    errorMessage: null,
    outputFileAbs: getListUserOutputPath(ts),
    latestFileAbs: getLatestListUserOutputPath(),
    logFileAbs: getSyncUserLogPath(ts),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentJob = job;
  jobs.set(jobId, job);
  writeStatus(job);
  setImmediate(() => runSyncJob(job, token));

  return job;
}

function getUserDetailProgress(done, totalNeedSync) {
  if (!totalNeedSync) return 100;

  return Math.min(99, Math.floor((done / totalNeedSync) * 100));
}

async function requestUserDetail({ token, userId }) {
  if (!USER_DETAIL_URL) {
    throw new Error('Thiáº¿u USER_DETAIL_URL.');
  }

  const url = new URL(USER_DETAIL_URL);
  url.searchParams.set('id', userId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USER_DETAIL_CONFIG.timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token}`,
        connection: 'close',
      },
      signal: controller.signal,
    });
    const rawText = await response.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(`HTTP ${response.status} | Response khÃ´ng pháº£i JSON`);
    }

    if (!response.ok) {
      const message = data?.message || data?.error || rawText.slice(0, 300) || `HTTP ${response.status}`;

      throw new Error(`HTTP ${response.status} | ${message}`);
    }

    return normalizeUserDetailResponse(data, userId);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timeout sau ${USER_DETAIL_CONFIG.timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestUserDetailWithRetry({ token, userId }) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= USER_DETAIL_CONFIG.maxRetries) {
    try {
      return await requestUserDetail({ token, userId });
    } catch (error) {
      lastError = error;

      if (attempt === USER_DETAIL_CONFIG.maxRetries) break;

      attempt += 1;
      await sleep(USER_DETAIL_CONFIG.retryDelayMs);
    }
  }

  throw lastError;
}

async function endStream(stream) {
  if (!stream) return;

  await new Promise((resolve) => stream.end(resolve));
}

async function runSyncUserDetailsJob(job, token) {
  let masterStream = null;
  let snapshotStream = null;
  let failedStream = null;
  const startMs = Date.now();

  try {
    job.currentMessage = 'Äang tÃ¬m file danh sÃ¡ch user má»›i nháº¥t...';
    writeStatus(job);

    const inputFile = findLatestListUserFile();

    if (!inputFile) {
      throw new Error('KhÃ´ng tÃ¬m tháº¥y file danh sÃ¡ch user. Vui lÃ²ng cháº¡y Äá»“ng bá»™ DS user trÆ°á»›c.');
    }

    job.inputFileAbs = inputFile;
    job.currentMessage = `Äang Ä‘á»c file ${toRelative(inputFile)}...`;
    writeStatus(job);

    const userIds = readUserIds(inputFile);

    if (userIds.length === 0) {
      throw new Error('File danh sÃ¡ch user khÃ´ng cÃ³ userId há»£p lá»‡.');
    }

    const processedUserIds = readExistingProcessedUserIds(job.masterFileAbs);
    const remainingUserIds = userIds.filter((id) => !processedUserIds.has(id));

    job.totalInput = userIds.length;
    job.alreadyProcessed = userIds.length - remainingUserIds.length;
    job.totalNeedSync = remainingUserIds.length;
    job.done = 0;
    job.successCount = 0;
    job.failedCount = 0;
    job.progress = remainingUserIds.length === 0 ? 100 : 0;

    logLine(job, '=== BAT DAU DONG BO CHI TIET DS USER ===');
    logLine(job, `JobId: ${job.jobId}`);
    logLine(job, `Input file: ${toRelative(job.inputFileAbs)}`);
    logLine(job, `Master file: ${toRelative(job.masterFileAbs)}`);
    logLine(job, `Total input: ${job.totalInput}`);
    logLine(job, `Already processed: ${job.alreadyProcessed}`);
    logLine(job, `Need sync: ${job.totalNeedSync}`);
    logLine(job, `Concurrency: ${USER_DETAIL_CONFIG.concurrency}`);
    logLine(job, `Delay: ${USER_DETAIL_CONFIG.delayBetweenRequestsMs}ms`);
    logLine(job, `Timeout: ${USER_DETAIL_CONFIG.timeoutMs}ms`);
    logLine(job, `Max retries: ${USER_DETAIL_CONFIG.maxRetries}`);

    if (remainingUserIds.length === 0) {
      job.snapshotFileAbs = null;
      job.failedFileAbs = null;
      job.status = 'COMPLETED';
      job.finishedAt = new Date().toISOString();
      job.currentMessage = 'Táº¥t cáº£ user trong file má»›i nháº¥t Ä‘Ã£ cÃ³ trong file tá»•ng. KhÃ´ng cáº§n Ä‘á»“ng bá»™ láº¡i.';
      logLine(job, job.currentMessage);
      writeStatus(job);
      return;
    }

    masterStream = fs.createWriteStream(job.masterFileAbs, { flags: 'a', encoding: 'utf8' });
    snapshotStream = fs.createWriteStream(job.snapshotFileAbs, { flags: 'w', encoding: 'utf8' });
    failedStream = fs.createWriteStream(job.failedFileAbs, { flags: 'w', encoding: 'utf8' });

    for (const stream of [masterStream, snapshotStream, failedStream]) {
      stream.on('error', (error) => {
        job.writeError = createUserDetailOutputWriteError(error);
      });
    }

    const queue = [...remainingUserIds];

    const runWorker = async (workerId) => {
      while (queue.length > 0) {
        await waitIfPaused(job);
        assertJobCanContinue(job);

        if (job.writeError) throw job.writeError;

        const userId = queue.shift();

        if (!userId) return;

        job.currentUserId = userId;
        job.currentMessage = `Äang láº¥y chi tiáº¿t user ${job.done + 1}/${job.totalNeedSync}...`;
        writeStatus(job);

        try {
          const detail = await requestUserDetailWithRetry({ token, userId });
          assertJobCanContinue(job);

          if (job.writeError) throw job.writeError;
          writeJsonLine(masterStream, detail);
          writeJsonLine(snapshotStream, detail);
          job.successCount += 1;
        } catch (error) {
          if (job.writeError || error?.message?.includes('KhÃ´ng thá»ƒ ghi file output')) {
            throw job.writeError || error;
          }

          writeJsonLine(failedStream, {
            userId,
            error: error.message,
            failedAt: new Date().toISOString(),
          });
          job.failedCount += 1;
          logLine(job, `[${job.done + 1}/${job.totalNeedSync}] Worker ${workerId} | ERROR ${userId} | ${error.message}`);
        }

        job.done += 1;
        const elapsed = Math.max((Date.now() - startMs) / 1000, 0.001);
        job.speed = Math.round((job.done / elapsed) * 100) / 100;
        job.progress = getUserDetailProgress(job.done, job.totalNeedSync);
        job.currentMessage = `ÄÃ£ xá»­ lÃ½ ${job.done}/${job.totalNeedSync} user chi tiáº¿t. ThÃ nh cÃ´ng: ${job.successCount}, lá»—i: ${job.failedCount}.`;

        if (job.done <= 10 || job.done % USER_DETAIL_CONFIG.logEvery === 0 || job.done === job.totalNeedSync) {
          logLine(
            job,
            `[${job.done}/${job.totalNeedSync}] Worker ${workerId} | success: ${job.successCount} | failed: ${job.failedCount} | speed: ${job.speed} req/s`
          );
        }

        writeStatus(job);

        if (USER_DETAIL_CONFIG.delayBetweenRequestsMs > 0 && queue.length > 0) {
          await waitIfPaused(job);
          assertJobCanContinue(job);
          await sleep(USER_DETAIL_CONFIG.delayBetweenRequestsMs);
        }
      }
    };

    const workerCount = Math.min(USER_DETAIL_CONFIG.concurrency, remainingUserIds.length);
    const workers = Array.from({ length: workerCount }, (_, index) => runWorker(index + 1));

    await Promise.all(workers);

    if (job.writeError) throw job.writeError;

    await endStream(masterStream);
    await endStream(snapshotStream);
    await endStream(failedStream);
    masterStream = null;
    snapshotStream = null;
    failedStream = null;

    job.status = 'COMPLETED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.currentUserId = null;
    job.currentMessage =
      job.failedCount > 0
        ? `Äá»“ng bá»™ chi tiáº¿t DS user hoÃ n táº¥t, cÃ³ ${job.failedCount} user lá»—i. Vui lÃ²ng kiá»ƒm tra file ${toRelative(
            job.failedFileAbs
          )}.`
        : `ÄÃ£ Ä‘á»“ng bá»™ chi tiáº¿t DS user thÃ nh cÃ´ng. File Ä‘Æ°á»£c lÆ°u táº¡i: ${toRelative(job.snapshotFileAbs)}`;

    logLine(job, '');
    logLine(job, '=== HOAN TAT DONG BO CHI TIET ===');
    logLine(job, `Success: ${job.successCount}`);
    logLine(job, `Failed: ${job.failedCount}`);
    logLine(job, `Finished time: ${job.finishedAt}`);
    logLine(job, `Duration: ${Math.round((Date.now() - startMs) / 1000)}s`);
  } catch (error) {
    await endStream(masterStream);
    await endStream(snapshotStream);
    await endStream(failedStream);

    if (error.message === 'SYNC_CANCELLED') {
      markJobCancelled(job);
      return;
    }

    job.status = 'FAILED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.errorMessage = error.message;
    job.currentMessage = error.message.includes('KhÃ´ng thá»ƒ ghi file output')
      ? 'Äá»“ng bá»™ DS user tháº¥t báº¡i. KhÃ´ng thá»ƒ ghi file output.'
      : error.message;

    try {
      logLine(job, '');
      logLine(job, error.message);
      logLine(job, `Finished time: ${job.finishedAt}`);
    } catch {
      // Ignore secondary log failures after the primary failure has already been captured.
    }
  } finally {
    if (currentJob?.jobId === job.jobId) {
      currentJob = null;
    }
    writeStatus(job);
  }
}

function createUserDetailsJob(token) {
  ensureDir(USERS_OUTPUT_DIR);

  const ts = timestamp();
  const jobId = `sync_user_details_${ts}`;
  const job = {
    jobId,
    type: 'USER_DETAIL',
    status: 'RUNNING',
    progress: 0,
    currentPage: null,
    totalWritten: null,
    currentMessage: 'Äang báº¯t Ä‘áº§u Ä‘á»“ng bá»™ chi tiáº¿t DS user...',
    errorMessage: null,
    outputFileAbs: null,
    latestFileAbs: null,
    logFileAbs: getSyncUserDetailLogPath(ts),
    inputFileAbs: null,
    masterFileAbs: getUserDetailMasterOutputPath(),
    snapshotFileAbs: getUserDetailSnapshotOutputPath(ts),
    failedFileAbs: getUserDetailFailedOutputPath(ts),
    totalInput: 0,
    alreadyProcessed: 0,
    totalNeedSync: 0,
    done: 0,
    successCount: 0,
    failedCount: 0,
    speed: 0,
    currentUserId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentJob = job;
  jobs.set(jobId, job);
  writeStatus(job);
  setImmediate(() => runSyncUserDetailsJob(job, token));

  return job;
}

function createLoanSyncJob(token) {
  ensureDir(LOANS_OUTPUT_DIR);

  const ts = loanTimestamp();
  const jobId = `sync_loans_${ts}`;
  const paths = createLoanJobPaths(ts);
  const job = {
    jobId,
    type: 'LOAN',
    status: 'RUNNING',
    progress: 0,
    currentPage: 0,
    totalWritten: null,
    totalFromApi: null,
    totalPages: null,
    processed: 0,
    inserted: 0,
    updated: 0,
    failedCount: 0,
    speed: 0,
    totalInMaster: 0,
    currentMessage: 'Dang bat dau dong bo don vay...',
    errorMessage: null,
    outputFileAbs: null,
    latestFileAbs: null,
    masterFileAbs: paths.masterFileAbs,
    latestFileAbs: paths.latestFileAbs,
    snapshotFileAbs: paths.snapshotFileAbs,
    failedFileAbs: paths.failedFileAbs,
    logFileAbs: paths.logFileAbs,
    masterFileRel: toRelative(paths.masterFileAbs),
    latestFileRel: toRelative(paths.latestFileAbs),
    snapshotFileRel: toRelative(paths.snapshotFileAbs),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentJob = job;
  jobs.set(jobId, job);
  writeStatus(job);
  setImmediate(async () => {
    try {
      await runSyncLoansJob(job, token, { writeStatus });
    } finally {
      if (currentJob?.jobId === job.jobId) {
        currentJob = null;
      }
    }
  });

  return job;
}

function createLoanDetailSyncJob(token) {
  ensureDir(LOANS_OUTPUT_DIR);

  const ts = loanDetailTimestamp();
  const jobId = `sync_loan_details_${ts}`;
  const paths = createLoanDetailJobPaths(ts);
  const job = {
    jobId,
    type: 'LOAN_DETAIL',
    status: 'RUNNING',
    progress: 0,
    currentPage: null,
    totalWritten: null,
    totalInput: 0,
    alreadyProcessed: 0,
    totalNeedSync: 0,
    done: 0,
    successCount: 0,
    failedCount: 0,
    skippedMissingCount: 0,
    inserted: 0,
    updated: 0,
    totalInMaster: 0,
    speed: 0,
    currentLoanId: null,
    currentMessage: 'Dang bat dau dong bo chi tiet DS don vay...',
    errorMessage: null,
    outputFileAbs: null,
    latestFileAbs: null,
    inputFileAbs: paths.inputFileAbs,
    masterFileAbs: paths.masterFileAbs,
    snapshotFileAbs: paths.snapshotFileAbs,
    failedFileAbs: paths.failedFileAbs,
    logFileAbs: paths.logFileAbs,
    statusFileAbs: paths.statusFileAbs,
    inputFileRel: toRelative(paths.inputFileAbs),
    masterFileRel: toRelative(paths.masterFileAbs),
    snapshotFileRel: toRelative(paths.snapshotFileAbs),
    failedFileRel: toRelative(paths.failedFileAbs),
    logFileRel: toRelative(paths.logFileAbs),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentJob = job;
  jobs.set(jobId, job);
  writeStatus(job);
  setImmediate(async () => {
    try {
      await runSyncLoanDetailsJob(job, token, { writeStatus });
    } finally {
      if (currentJob?.jobId === job.jobId) {
        currentJob = null;
      }
    }
  });

  return job;
}

function handleStart(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'Token khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i.',
    });
    return;
  }

  if (isActiveJob(currentJob)) {
    sendJson(res, 409, {
      success: false,
      message: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      jobId: currentJob.jobId,
    });
    return;
  }

  const job = createJob(token);

  sendJson(res, 202, {
    success: true,
    jobId: job.jobId,
    message: 'ÄÃ£ báº¯t Ä‘áº§u Ä‘á»“ng bá»™ danh sÃ¡ch user.',
  });
}

function handleStartUserDetails(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'KhÃ´ng tÃ¬m tháº¥y token Ä‘Äƒng nháº­p. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i.',
    });
    return;
  }

  if (isActiveJob(currentJob)) {
    sendJson(res, 409, {
      success: false,
      message: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      jobId: currentJob.jobId,
    });
    return;
  }

  const job = createUserDetailsJob(token);

  sendJson(res, 202, {
    success: true,
    jobId: job.jobId,
    type: job.type,
    message: 'ÄÃ£ báº¯t Ä‘áº§u Ä‘á»“ng bá»™ chi tiáº¿t DS user.',
  });
}

function handleStartLoans(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'Khong tim thay token dang nhap. Vui long dang nhap lai.',
    });
    return;
  }

  if (isActiveJob(currentJob)) {
    sendJson(res, 409, {
      success: false,
      message: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      jobId: currentJob.jobId,
    });
    return;
  }

  const job = createLoanSyncJob(token);

  sendJson(res, 202, {
    success: true,
    jobId: job.jobId,
    type: job.type,
    message: 'Da bat dau dong bo don vay.',
  });
}

function handleStartLoanDetails(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    sendJson(res, 401, {
      success: false,
      message: 'Khong tim thay token dang nhap. Vui long dang nhap lai.',
    });
    return;
  }

  if (isActiveJob(currentJob)) {
    sendJson(res, 409, {
      success: false,
      message: 'Đang có tiến trình đồng bộ chạy. Vui lòng hoàn tất hoặc hủy trước khi chạy tiến trình mới.',
      jobId: currentJob.jobId,
    });
    return;
  }

  const job = createLoanDetailSyncJob(token);

  sendJson(res, 202, {
    success: true,
    jobId: job.jobId,
    type: job.type,
    message: 'Da bat dau dong bo chi tiet DS don vay.',
  });
}

function handleStatus(req, res, jobId) {
  const job = jobs.get(jobId);

  if (!job) {
    sendJson(res, 404, {
      success: false,
      message: 'KhÃ´ng tÃ¬m tháº¥y tiáº¿n trÃ¬nh Ä‘á»“ng bá»™.',
    });
    return;
  }

  sendJson(res, 200, publicJob(job));
}

function handleControl(req, res, jobId, action) {
  const job = jobs.get(jobId);

  if (!job) {
    sendJson(res, 404, {
      success: false,
      message: 'Không tìm thấy tiến trình đồng bộ.',
    });
    return;
  }

  if (action === 'pause') {
    if (job.status !== 'RUNNING') {
      sendJson(res, 409, {
        success: false,
        message: 'Chỉ có thể tạm dừng tiến trình đang chạy.',
        job: publicJob(job),
      });
      return;
    }

    job.status = 'PAUSED';
    job.currentMessage = 'Đã tạm dừng đồng bộ.';
    logLine(job, '=== TAM DUNG DONG BO ===');
    writeStatus(job);
    sendJson(res, 200, publicJob(job));
    return;
  }

  if (action === 'resume') {
    if (job.status !== 'PAUSED') {
      sendJson(res, 409, {
        success: false,
        message: 'Chỉ có thể tiếp tục tiến trình đang tạm dừng.',
        job: publicJob(job),
      });
      return;
    }

    job.status = 'RUNNING';
    job.currentMessage = 'Tiếp tục đồng bộ dữ liệu.';
    logLine(job, '=== TIEP TUC DONG BO ===');
    writeStatus(job);
    sendJson(res, 200, publicJob(job));
    return;
  }

  if (action === 'cancel') {
    if (!isActiveJob(job)) {
      sendJson(res, 409, {
        success: false,
        message: 'Tiến trình đồng bộ không còn chạy.',
        job: publicJob(job),
      });
      return;
    }

    job.cancelRequested = true;
    job.status = 'CANCELLED';
    job.finishedAt = job.finishedAt || new Date().toISOString();
    job.currentUserId = null;
    job.currentMessage = 'Đã hủy đồng bộ. Dữ liệu đã xử lý trước đó vẫn được giữ lại.';
    logLine(job, '=== YEU CAU HUY DONG BO ===');
    writeStatus(job);
    sendJson(res, 200, publicJob(job));
    return;
  }

  sendJson(res, 404, {
    success: false,
    message: 'Control action không hợp lệ.',
  });
}

async function handleSearchSegmentUsers(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = searchSegmentUsers({
      filters: body.filters || {},
      page: body.page,
      size: body.size,
    });

    sendJson(res, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    if (error?.code === 'USER_DETAIL_FILE_NOT_FOUND') {
      sendJson(res, 404, {
        success: false,
        code: error.code,
        message: 'Chua co du lieu user detail. Vui long dong bo chi tiet DS user truoc.',
      });
      return;
    }

    if (error?.code === 'LOAN_FILE_NOT_FOUND') {
      sendJson(res, 404, {
        success: false,
        code: error.code,
        message: 'Chưa có dữ liệu đơn vay. Vui lòng đồng bộ đơn vay trước.',
      });
      return;
    }

    sendJson(res, 500, {
      success: false,
      message: error?.message || 'Khong the tim kiem danh sach user segment.',
    });
  }
}

async function handleSegmentConversion(req, res) {
  try {
    const body = await readJsonBody(req);
    const result = calculateSegmentConversion({
      segmentUsers: body.segmentUsers || [],
      evaluationMonth: body.evaluationMonth,
    });

    sendJson(res, 200, {
      success: true,
      ...result,
    });
  } catch (error) {
    if (error?.code === 'LOAN_DETAIL_FILE_NOT_FOUND') {
      sendJson(res, 404, {
        success: false,
        code: error.code,
        message: 'Chưa có dữ liệu chi tiết đơn vay. Vui lòng đồng bộ chi tiết DS đơn vay trước.',
      });
      return;
    }

    sendJson(res, 500, {
      success: false,
      message: error?.message || 'Khong the tinh hieu qua chuyen doi segment.',
    });
  }
}

function handleListSegments(req, res) {
  sendJson(res, 200, {
    success: true,
    items: readSegments(),
  });
}

async function handleCreateSegment(req, res) {
  try {
    const body = await readJsonBody(req);
    const segment = createSegment(body);

    sendJson(res, 201, {
      success: true,
      segment,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.message || 'Tạo segment thất bại. Vui lòng thử lại.',
    });
  }
}

function handleGetSegment(req, res, segmentId) {
  const segment = getSegmentById(segmentId);

  if (!segment) {
    sendJson(res, 404, {
      success: false,
      message: 'Không tìm thấy segment.',
    });
    return;
  }

  sendJson(res, 200, {
    success: true,
    segment,
  });
}

async function handleUpdateSegment(req, res, segmentId) {
  try {
    const body = await readJsonBody(req);
    const segment = updateSegment(segmentId, body);

    sendJson(res, 200, {
      success: true,
      segment,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.message || 'Cập nhật segment thất bại. Vui lòng thử lại.',
    });
  }
}

function handleDeleteSegment(req, res, segmentId) {
  const deleted = deleteSegment(segmentId);

  if (!deleted) {
    sendJson(res, 404, {
      success: false,
      message: 'Không tìm thấy segment.',
    });
    return;
  }

  sendJson(res, 200, {
    success: true,
  });
}

async function handleSaveSegmentUsers(req, res, segmentId) {
  try {
    const body = await readJsonBody(req);
    const result = saveSegmentUsersToFile(segmentId, body.filters || {});

    sendJson(res, 200, {
      success: true,
      totalSaved: result.totalSaved,
      segment: result.segment,
      message:
        result.totalSaved > 0
          ? `Lưu danh sách user vào segment thành công. Đã lưu ${result.totalSaved} user.`
          : 'Lưu danh sách user thành công. Segment hiện chưa có user phù hợp.',
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.message || 'Lưu danh sách user thất bại. Vui lòng thử lại.',
    });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/segments/users/search') {
    handleSearchSegmentUsers(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/segments') {
    handleListSegments(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/segments') {
    handleCreateSegment(req, res);
    return;
  }

  const segmentMatch = url.pathname.match(/^\/api\/segments\/([^/]+)$/);

  if (segmentMatch && req.method === 'GET') {
    handleGetSegment(req, res, decodeURIComponent(segmentMatch[1]));
    return;
  }

  if (segmentMatch && req.method === 'PUT') {
    handleUpdateSegment(req, res, decodeURIComponent(segmentMatch[1]));
    return;
  }

  if (segmentMatch && req.method === 'DELETE') {
    handleDeleteSegment(req, res, decodeURIComponent(segmentMatch[1]));
    return;
  }

  const segmentUsersSaveMatch = url.pathname.match(/^\/api\/segments\/([^/]+)\/users\/save$/);

  if (segmentUsersSaveMatch && req.method === 'POST') {
    handleSaveSegmentUsers(req, res, decodeURIComponent(segmentUsersSaveMatch[1]));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/segments/conversion') {
    handleSegmentConversion(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/segments/sync-users/start') {
    handleStart(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/users/sync-user-details-from-latest-file') {
    handleStartUserDetails(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sync/loans') {
    handleStartLoans(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sync/loan-details') {
    handleStartLoanDetails(req, res);
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/admin\/segments\/sync-users\/status\/([^/]+)$/);

  if (req.method === 'GET' && statusMatch) {
    handleStatus(req, res, decodeURIComponent(statusMatch[1]));
    return;
  }

  const controlMatch = url.pathname.match(/^\/api\/admin\/segments\/sync-users\/([^/]+)\/(pause|resume|cancel)$/);

  if (req.method === 'POST' && controlMatch) {
    handleControl(req, res, decodeURIComponent(controlMatch[1]), controlMatch[2]);
    return;
  }

  const detailStatusMatch = url.pathname.match(/^\/api\/users\/sync-user-details-from-latest-file\/status\/([^/]+)$/);

  if (req.method === 'GET' && detailStatusMatch) {
    handleStatus(req, res, decodeURIComponent(detailStatusMatch[1]));
    return;
  }

  const detailControlMatch = url.pathname.match(
    /^\/api\/users\/sync-user-details-from-latest-file\/([^/]+)\/(pause|resume|cancel)$/
  );

  if (req.method === 'POST' && detailControlMatch) {
    handleControl(req, res, decodeURIComponent(detailControlMatch[1]), detailControlMatch[2]);
    return;
  }

  const loanStatusMatch = url.pathname.match(/^\/api\/sync\/loans\/status\/([^/]+)$/);

  if (req.method === 'GET' && loanStatusMatch) {
    handleStatus(req, res, decodeURIComponent(loanStatusMatch[1]));
    return;
  }

  const loanControlMatch = url.pathname.match(/^\/api\/sync\/loans\/([^/]+)\/(pause|resume|cancel)$/);

  if (req.method === 'POST' && loanControlMatch) {
    handleControl(req, res, decodeURIComponent(loanControlMatch[1]), loanControlMatch[2]);
    return;
  }

  const loanDetailStatusMatch = url.pathname.match(/^\/api\/sync\/loan-details\/status\/([^/]+)$/);

  if (req.method === 'GET' && loanDetailStatusMatch) {
    handleStatus(req, res, decodeURIComponent(loanDetailStatusMatch[1]));
    return;
  }

  const loanDetailControlMatch = url.pathname.match(/^\/api\/sync\/loan-details\/([^/]+)\/(pause|resume|cancel)$/);

  if (req.method === 'POST' && loanDetailControlMatch) {
    handleControl(req, res, decodeURIComponent(loanDetailControlMatch[1]), loanDetailControlMatch[2]);
    return;
  }

  sendJson(res, 404, {
    success: false,
    message: 'Not found',
  });
});

server.listen(PORT, () => {
  ensureDir(USERS_OUTPUT_DIR);
  console.log(`Sync users server listening on http://localhost:${PORT}`);
});


