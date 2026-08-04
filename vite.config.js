import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runAssistantChat } = require('./server/modules/assistantChat.cjs');
const { buildOrgJoinInfoBySaleId } = require('./server/modules/commissionOrgInfo.cjs');
const { buildContractStatusBySaleId } = require('./server/modules/userContractStatus.cjs');
const { buildUserDetailFieldsBySaleId } = require('./server/modules/userDetailLookup.cjs');
const { getSyncFreshness } = require('./server/modules/dataQualityStatus.cjs');
const {
  reportNotifications,
  createSyncStartedNotification,
  createSyncFailedNotification,
  createPushNotiStartedNotification,
  createPushNotiCompletedNotification,
  createPushNotiFailedNotification,
  createOrgMoveStartedNotification,
  createOrgMoveCompletedNotification,
  createOrgMoveFailedNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('./server/modules/notificationStore.cjs');

// Cac su kien client tu bao ve server ghi (push noti tu SegmentDetailPage, chuyen thanh vien tu
// OrganizationPage) - deu chay hoan toan phia trinh duyet, khong qua job server nhu sync, nen can
// 1 duong rieng de ghi vao chuong thong bao (xem route /api/notifications/push-event ben duoi).
const CLIENT_REPORTED_EVENT_HANDLERS = {
  PUSH_NOTI_STARTED: createPushNotiStartedNotification,
  PUSH_NOTI_COMPLETED: createPushNotiCompletedNotification,
  PUSH_NOTI_FAILED: createPushNotiFailedNotification,
  ORG_MOVE_STARTED: createOrgMoveStartedNotification,
  ORG_MOVE_COMPLETED: createOrgMoveCompletedNotification,
  ORG_MOVE_FAILED: createOrgMoveFailedNotification,
};
const { calculateSegmentConversion } = require('./server/modules/segmentConversionAnalytics.cjs');
const {
  createSegment,
  deleteSegment,
  getSegmentById,
  readSegments,
  saveSegmentUsers: saveSegmentUsersToFile,
  updateSegment,
} = require('./server/modules/segmentStore.cjs');
const { createLoanJobPaths, runSyncLoansJob, timestamp: loanTimestamp } = require('./server/modules/syncLoans.cjs');
const {
  createLoanDetailJobPaths,
  runSyncLoanDetailsJob,
  timestamp: loanDetailTimestamp,
} = require('./server/modules/syncLoanDetails.cjs');
const { LOANS_OUTPUT_DIR, PROJECT_ROOT } = require('./server/utils/outputPaths.cjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const loanJobs = new Map();
let currentLoanJob = null;
const SEGMENT_STORE_MODULE = './server/modules/segmentStore.cjs';
const SEGMENT_USER_SEARCH_MODULE = './server/modules/segmentUserSearch.cjs';
const SYNC_USERS_API_TARGET = process.env.SYNC_USERS_API_TARGET || 'http://localhost:4174';
const SYNC_USERS_PORT = Number(new URL(SYNC_USERS_API_TARGET).port || 4174);
let syncUsersServerProcess = null;

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function ensureSyncUsersServer() {
  if (await isPortOpen(SYNC_USERS_PORT)) return;

  syncUsersServerProcess = spawn(process.execPath, ['server/syncUsersServer.cjs'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SYNC_USERS_PORT: String(SYNC_USERS_PORT),
      PORT: String(SYNC_USERS_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  syncUsersServerProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[sync-users] ${chunk}`);
  });
  syncUsersServerProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[sync-users] ${chunk}`);
  });
  syncUsersServerProcess.once('exit', () => {
    syncUsersServerProcess = null;
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortOpen(SYNC_USERS_PORT)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function stopSyncUsersServer() {
  if (!syncUsersServerProcess || syncUsersServerProcess.killed) return;

  syncUsersServerProcess.kill();
  syncUsersServerProcess = null;
}

function shouldUseSyncUsersServer(pathname) {
  return (
    pathname.startsWith('/api/admin/segments/sync-users') ||
    pathname.startsWith('/api/users/sync-user-details-from-latest-file')
  );
}

function loadSegmentUserSearchModule() {
  const resolvedModulePath = require.resolve(SEGMENT_USER_SEARCH_MODULE);

  delete require.cache[resolvedModulePath];

  return require(SEGMENT_USER_SEARCH_MODULE);
}

function loadSegmentStoreModule() {
  [SEGMENT_STORE_MODULE, SEGMENT_USER_SEARCH_MODULE].forEach((modulePath) => {
    const resolvedModulePath = require.resolve(modulePath);

    delete require.cache[resolvedModulePath];
  });

  return require(SEGMENT_STORE_MODULE);
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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : '';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function toRelative(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function isActiveJob(job) {
  return job?.status === 'RUNNING' || job?.status === 'PAUSED' || (job?.cancelRequested && !job?.finishedAt);
}

function publicLoanJob(job) {
  const payload = {
    success: true,
    jobId: job.jobId,
    type: job.type || 'LOAN',
    status: job.status,
    progress: job.progress,
    progressIndeterminate: Boolean(job.progressIndeterminate),
    currentPage: job.currentPage,
    totalPages: job.totalPages || null,
    currentMessage: job.currentMessage,
    errorMessage: job.errorMessage || null,
    totalFromApi: job.totalFromApi ?? 0,
    processed: job.processed || 0,
    inserted: job.inserted || 0,
    updated: job.updated || 0,
    failedCount: job.failedCount || 0,
    speed: job.speed || 0,
    totalInMaster: job.totalInMaster || 0,
    masterFile: job.masterFileAbs ? toRelative(job.masterFileAbs) : null,
    snapshotFile: job.snapshotFileAbs ? toRelative(job.snapshotFileAbs) : null,
    latestFile: job.latestFileAbs ? toRelative(job.latestFileAbs) : null,
    failedFile: job.failedFileAbs ? toRelative(job.failedFileAbs) : null,
    logFile: job.logFileAbs ? toRelative(job.logFileAbs) : null,
    statusFile: job.statusFileAbs ? toRelative(job.statusFileAbs) : null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };

  if (job.type === 'LOAN_DETAIL') {
    payload.totalInput = job.totalInput || 0;
    payload.alreadyProcessed = job.alreadyProcessed || 0;
    payload.totalNeedSync = job.totalNeedSync || 0;
    payload.done = job.done || 0;
    payload.successCount = job.successCount || 0;
    payload.skippedMissingCount = job.skippedMissingCount || 0;
    payload.currentLoanId = job.currentLoanId || null;
    payload.inserted = job.inserted || 0;
    payload.updated = job.updated || 0;
    payload.inputFile = job.inputFileAbs ? toRelative(job.inputFileAbs) : null;
    payload.statusFile = job.statusFileAbs ? toRelative(job.statusFileAbs) : null;
  }

  return payload;
}

function getSegmentUsersForConversion(segment) {
  if (Array.isArray(segment?.savedUsers) && segment.savedUsers.length > 0) {
    return segment.savedUsers.map((user) => ({
      saleId: user.saleId || '',
      userId: user.userId || '',
    }));
  }

  if (Array.isArray(segment?.recipients) && segment.recipients.length > 0) {
    return segment.recipients.map((user) => ({
      saleId: user.saleId || '',
      userId: user.userId || '',
    }));
  }

  if (Array.isArray(segment?.userIds)) {
    return segment.userIds.map((userId) => ({
      saleId: '',
      userId,
    }));
  }

  return [];
}

function createLoanSyncJob(token) {
  ensureDir(LOANS_OUTPUT_DIR);

  const ts = loanTimestamp();
  const paths = createLoanJobPaths(ts);
  const job = {
    jobId: `sync_loans_${ts}`,
    type: 'LOAN',
    status: 'RUNNING',
    progress: 0,
    progressIndeterminate: false,
    currentPage: 0,
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
    masterFileAbs: paths.masterFileAbs,
    latestFileAbs: paths.latestFileAbs,
    snapshotFileAbs: paths.snapshotFileAbs,
    failedFileAbs: paths.failedFileAbs,
    statusFileAbs: paths.statusFileAbs,
    logFileAbs: paths.logFileAbs,
    masterFileRel: toRelative(paths.masterFileAbs),
    latestFileRel: toRelative(paths.latestFileAbs),
    snapshotFileRel: toRelative(paths.snapshotFileAbs),
    failedFileRel: toRelative(paths.failedFileAbs),
    logFileRel: toRelative(paths.logFileAbs),
    statusFileRel: toRelative(paths.statusFileAbs),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentLoanJob = job;
  loanJobs.set(job.jobId, job);

  try {
    createSyncStartedNotification({
      jobId: job.jobId,
      jobType: job.type,
      title: 'Bắt đầu đồng bộ đơn vay',
    });
  } catch {
    // Khong de loi ghi thong bao lam gian doan flow bat dau job chinh.
  }

  setImmediate(async () => {
    try {
      await runSyncLoansJob(job, token, { writeStatus: () => {} });
    } finally {
      if (currentLoanJob?.jobId === job.jobId) {
        currentLoanJob = null;
      }
    }
  });

  return job;
}

function createLoanDetailSyncJob(token) {
  ensureDir(LOANS_OUTPUT_DIR);

  const ts = loanDetailTimestamp();
  const paths = createLoanDetailJobPaths(ts);
  const job = {
    jobId: `sync_loan_details_${ts}`,
    type: 'LOAN_DETAIL',
    status: 'RUNNING',
    progress: 0,
    currentPage: null,
    totalFromApi: null,
    totalPages: null,
    processed: 0,
    totalInput: 0,
    alreadyProcessed: 0,
    totalNeedSync: 0,
    done: 0,
    successCount: 0,
    failedCount: 0,
    skippedMissingCount: 0,
    inserted: 0,
    updated: 0,
    speed: 0,
    totalInMaster: 0,
    currentLoanId: null,
    currentMessage: 'Dang bat dau dong bo chi tiet DS don vay...',
    errorMessage: null,
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

  currentLoanJob = job;
  loanJobs.set(job.jobId, job);

  try {
    createSyncStartedNotification({
      jobId: job.jobId,
      jobType: job.type,
      title: 'Bắt đầu đồng bộ chi tiết DS đơn vay',
    });
  } catch {
    // Khong de loi ghi thong bao lam gian doan flow bat dau job chinh.
  }

  setImmediate(async () => {
    try {
      await runSyncLoanDetailsJob(job, token, { writeStatus: () => {} });
    } finally {
      if (currentLoanJob?.jobId === job.jobId) {
        currentLoanJob = null;
      }
    }
  });

  return job;
}

function handleLoanControl(job, action) {
  if (action === 'pause') {
    if (job.status !== 'RUNNING') {
      return {
        status: 409,
        payload: {
          success: false,
          message: 'Chi co the tam dung tien trinh dang chay.',
          job: publicLoanJob(job),
        },
      };
    }

    job.status = 'PAUSED';
    job.currentMessage = 'Da tam dung dong bo don vay.';
    return { status: 200, payload: publicLoanJob(job) };
  }

  if (action === 'resume') {
    if (job.status !== 'PAUSED') {
      return {
        status: 409,
        payload: {
          success: false,
          message: 'Chi co the tiep tuc tien trinh dang tam dung.',
          job: publicLoanJob(job),
        },
      };
    }

    job.status = 'RUNNING';
    job.currentMessage = 'Tiep tuc dong bo don vay.';
    return { status: 200, payload: publicLoanJob(job) };
  }

  if (action === 'cancel') {
    if (!isActiveJob(job)) {
      return {
        status: 409,
        payload: {
          success: false,
          message: 'Tien trinh dong bo khong con chay.',
          job: publicLoanJob(job),
        },
      };
    }

    job.cancelRequested = true;
    job.status = 'CANCELLED';
    job.finishedAt = job.finishedAt || new Date().toISOString();
    job.currentMessage = 'Da huy dong bo don vay.';
    return { status: 200, payload: publicLoanJob(job) };
  }

  return {
    status: 404,
    payload: {
      success: false,
      message: 'Control action khong hop le.',
    },
  };
}

function localSegmentUserSearchPlugin() {
  return {
    name: 'local-segment-user-search',
    async configureServer(server) {
      await ensureSyncUsersServer();
      server.httpServer?.once('close', stopSyncUsersServer);

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');

        if (shouldUseSyncUsersServer(url.pathname)) {
          try {
            await ensureSyncUsersServer();
          } catch (error) {
            sendJson(res, 502, {
              success: false,
              message: error?.message || 'Khong the khoi dong server dong bo DS user.',
            });
            return;
          }

          next();
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/segments') {
          sendJson(res, 200, {
            success: true,
            items: readSegments(),
          });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/data-quality/sync-freshness') {
          try {
            sendJson(res, 200, {
              success: true,
              freshness: getSyncFreshness(),
            });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the kiem tra do moi du lieu dong bo.',
            });
          }
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/notifications') {
          try {
            const url2 = new URL(req.url || '/', 'http://localhost');
            const limit = Number(url2.searchParams.get('limit')) || 50;

            sendJson(res, 200, {
              success: true,
              ...listNotifications({ limit }),
            });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the lay danh sach thong bao.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/notifications/report') {
          try {
            const body = await readJsonBody(req);

            reportNotifications(body.type, body.items);

            sendJson(res, 200, { success: true });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the ghi nhan thong bao.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/notifications/read-all') {
          try {
            markAllNotificationsRead();
            sendJson(res, 200, { success: true });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the danh dau da doc.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/notifications/push-event') {
          try {
            const body = await readJsonBody(req);
            const handler = CLIENT_REPORTED_EVENT_HANDLERS[body?.type];

            if (!handler) {
              sendJson(res, 400, { success: false, message: 'Loai su kien khong hop le.' });
              return;
            }

            handler({
              jobId: body.jobId,
              segmentId: body.segmentId,
              orgUnitId: body.orgUnitId,
              title: body.title,
              message: body.message,
            });

            sendJson(res, 200, { success: true });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the ghi nhan su kien gui thong bao.',
            });
          }
          return;
        }

        const notificationReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);

        if (req.method === 'POST' && notificationReadMatch) {
          try {
            markNotificationRead(Number(decodeURIComponent(notificationReadMatch[1])));
            sendJson(res, 200, { success: true });
          } catch (error) {
            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the danh dau da doc.',
            });
          }
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/commission/org-join-info') {
          try {
            sendJson(res, 200, {
              success: true,
              orgJoinInfoBySaleId: buildOrgJoinInfoBySaleId(),
            });
          } catch (error) {
            if (error?.code === 'USER_DETAIL_FILE_NOT_FOUND') {
              sendJson(res, 404, {
                success: false,
                code: error.code,
                message: error.message,
              });
              return;
            }

            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the lay ngay join to chuc.',
            });
          }
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/users/contract-status-by-sale-id') {
          try {
            sendJson(res, 200, {
              success: true,
              contractStatusBySaleId: buildContractStatusBySaleId(),
            });
          } catch (error) {
            if (error?.code === 'USER_LIST_FILE_NOT_FOUND') {
              sendJson(res, 404, {
                success: false,
                code: error.code,
                message: error.message,
              });
              return;
            }

            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the lay trang thai ky hop dong.',
            });
          }
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/users/detail-fields-by-sale-id') {
          try {
            sendJson(res, 200, {
              success: true,
              userDetailFieldsBySaleId: buildUserDetailFieldsBySaleId(),
            });
          } catch (error) {
            if (error?.code === 'USER_DETAIL_FILE_NOT_FOUND') {
              sendJson(res, 404, {
                success: false,
                code: error.code,
                message: error.message,
              });
              return;
            }

            sendJson(res, 500, {
              success: false,
              message: error?.message || 'Khong the lay thong tin chi tiet user.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/assistant/chat') {
          try {
            const body = await readJsonBody(req);
            const result = await runAssistantChat({ messages: body.messages });

            sendJson(res, 200, {
              success: true,
              reply: result.reply,
            });
          } catch (error) {
            const status = error?.code === 'INVALID_INPUT' ? 400 : error?.status || 500;

            sendJson(res, status, {
              success: false,
              code: error?.code || null,
              message: error?.message || 'Tro ly AI dang gap loi. Vui long thu lai.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/segments') {
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
              message: error.message || 'Tao segment that bai. Vui long thu lai.',
            });
          }
          return;
        }

        const segmentMatch = url.pathname.match(/^\/api\/segments\/([^/]+)$/);

        if (segmentMatch && req.method === 'GET') {
          const segment = getSegmentById(decodeURIComponent(segmentMatch[1]));

          if (!segment) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay segment.',
            });
            return;
          }

          sendJson(res, 200, {
            success: true,
            segment,
          });
          return;
        }

        if (segmentMatch && req.method === 'PUT') {
          try {
            const body = await readJsonBody(req);
            const segment = updateSegment(decodeURIComponent(segmentMatch[1]), body);

            sendJson(res, 200, {
              success: true,
              segment,
            });
          } catch (error) {
            sendJson(res, error.statusCode || 500, {
              success: false,
              message: error.message || 'Cap nhat segment that bai. Vui long thu lai.',
            });
          }
          return;
        }

        if (segmentMatch && req.method === 'DELETE') {
          const deleted = deleteSegment(decodeURIComponent(segmentMatch[1]));

          if (!deleted) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay segment.',
            });
            return;
          }

          sendJson(res, 200, {
            success: true,
          });
          return;
        }

        const segmentUsersSaveMatch = url.pathname.match(/^\/api\/segments\/([^/]+)\/users\/save$/);

        if (segmentUsersSaveMatch && req.method === 'POST') {
          try {
            const body = await readJsonBody(req);
            const { saveSegmentUsers: saveSegmentUsersToFile } = loadSegmentStoreModule();
            const result = saveSegmentUsersToFile(decodeURIComponent(segmentUsersSaveMatch[1]), body.filters || {});

            sendJson(res, 200, {
              success: true,
              totalSaved: result.totalSaved,
              segment: result.segment,
              message:
                result.totalSaved > 0
                  ? `Luu danh sach user vao segment thanh cong. Da luu ${result.totalSaved} user.`
                  : 'Luu danh sach user thanh cong. Segment hien chua co user phu hop.',
            });
          } catch (error) {
            sendJson(res, error.statusCode || 500, {
              success: false,
              message: error.message || 'Luu danh sach user that bai. Vui long thu lai.',
            });
          }
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/sync/loans') {
          const token = getBearerToken(req);

          if (!token) {
            sendJson(res, 401, {
              success: false,
              message: 'Khong tim thay token dang nhap. Vui long dang nhap lai.',
            });
            return;
          }

          if (isActiveJob(currentLoanJob)) {
            sendJson(res, 409, {
              success: false,
              message: 'Dang co tien trinh dong bo don vay chay. Vui long hoan tat hoac huy truoc khi chay tien trinh moi.',
              jobId: currentLoanJob.jobId,
              job: publicLoanJob(currentLoanJob),
            });
            return;
          }

          const job = createLoanSyncJob(token);

          sendJson(res, 202, {
            success: true,
            ...publicLoanJob(job),
            message: 'Da bat dau dong bo don vay.',
          });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/sync/loan-details') {
          const token = getBearerToken(req);

          if (!token) {
            sendJson(res, 401, {
              success: false,
              message: 'Khong tim thay token dang nhap. Vui long dang nhap lai.',
            });
            return;
          }

          if (isActiveJob(currentLoanJob)) {
            sendJson(res, 409, {
              success: false,
              message: 'Dang co tien trinh dong bo chay. Vui long hoan tat hoac huy truoc khi chay tien trinh moi.',
              jobId: currentLoanJob.jobId,
              job: publicLoanJob(currentLoanJob),
            });
            return;
          }

          const job = createLoanDetailSyncJob(token);

          sendJson(res, 202, {
            success: true,
            ...publicLoanJob(job),
            message: 'Da bat dau dong bo chi tiet DS don vay.',
          });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/sync/current-job') {
          sendJson(res, 200, {
            success: true,
            job: isActiveJob(currentLoanJob) ? publicLoanJob(currentLoanJob) : null,
          });
          return;
        }

        const loanStatusMatch = url.pathname.match(/^\/api\/sync\/loans\/status\/([^/]+)$/);

        if (req.method === 'GET' && loanStatusMatch) {
          const job = loanJobs.get(decodeURIComponent(loanStatusMatch[1]));

          if (!job) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay tien trinh dong bo don vay.',
            });
            return;
          }

          sendJson(res, 200, publicLoanJob(job));
          return;
        }

        const loanControlMatch = url.pathname.match(/^\/api\/sync\/loans\/([^/]+)\/(pause|resume|cancel)$/);

        if (req.method === 'POST' && loanControlMatch) {
          const job = loanJobs.get(decodeURIComponent(loanControlMatch[1]));

          if (!job) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay tien trinh dong bo don vay.',
            });
            return;
          }

          const result = handleLoanControl(job, loanControlMatch[2]);
          sendJson(res, result.status, result.payload);
          return;
        }

        const loanDetailStatusMatch = url.pathname.match(/^\/api\/sync\/loan-details\/status\/([^/]+)$/);

        if (req.method === 'GET' && loanDetailStatusMatch) {
          const job = loanJobs.get(decodeURIComponent(loanDetailStatusMatch[1]));

          if (!job) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay tien trinh dong bo chi tiet DS don vay.',
            });
            return;
          }

          sendJson(res, 200, publicLoanJob(job));
          return;
        }

        const loanDetailControlMatch = url.pathname.match(/^\/api\/sync\/loan-details\/([^/]+)\/(pause|resume|cancel)$/);

        if (req.method === 'POST' && loanDetailControlMatch) {
          const job = loanJobs.get(decodeURIComponent(loanDetailControlMatch[1]));

          if (!job) {
            sendJson(res, 404, {
              success: false,
              message: 'Khong tim thay tien trinh dong bo chi tiet DS don vay.',
            });
            return;
          }

          const result = handleLoanControl(job, loanDetailControlMatch[2]);
          sendJson(res, result.status, result.payload);
          return;
        }

        if (req.method !== 'POST' || url.pathname !== '/api/segments/users/search') {
          if (req.method === 'POST' && url.pathname === '/api/segments/conversion') {
            try {
              const body = await readJsonBody(req);
              const segment = body.segmentId ? getSegmentById(body.segmentId) : null;
              const segmentUsers =
                segment
                  ? getSegmentUsersForConversion(segment)
                  : Array.isArray(body.segmentUsers) && body.segmentUsers.length > 0
                    ? body.segmentUsers
                    : [];
              const result = calculateSegmentConversion({
                segment,
                segmentUsers,
              });

              sendJson(res, 200, {
                success: true,
                ...result,
              });
            } catch (error) {
              if (error?.code === 'LOAN_FILE_NOT_FOUND') {
                sendJson(res, 404, {
                  success: false,
                  code: error.code,
                  message: 'Chưa có dữ liệu đơn vay. Vui lòng đồng bộ DS đơn vay trước.',
                });
                return;
              }

              sendJson(res, 500, {
                success: false,
                message: error?.message || 'Khong the tinh hieu qua chuyen doi segment.',
              });
            }
            return;
          }

          next();
          return;
        }

        try {
          const body = await readJsonBody(req);
          const { searchSegmentUsers } = loadSegmentUserSearchModule();
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
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [localSegmentUserSearchPlugin(), react()],
  base: command === 'serve' ? '/' : '/web_dashboard/',
  server: {
    watch: {
      ignored: ['**/output/**'],
    },
    proxy: {
      '/api': {
        target: SYNC_USERS_API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
}));
