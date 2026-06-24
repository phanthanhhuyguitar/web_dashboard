import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { searchSegmentUsers } = require('./server/modules/segmentUserSearch.cjs');
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
const fs = require('node:fs');
const path = require('node:path');

const loanJobs = new Map();
let currentLoanJob = null;

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

function createLoanSyncJob(token) {
  ensureDir(LOANS_OUTPUT_DIR);

  const ts = loanTimestamp();
  const paths = createLoanJobPaths(ts);
  const job = {
    jobId: `sync_loans_${ts}`,
    type: 'LOAN',
    status: 'RUNNING',
    progress: 0,
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
    logFileAbs: paths.logFileAbs,
    masterFileRel: toRelative(paths.masterFileAbs),
    latestFileRel: toRelative(paths.latestFileAbs),
    snapshotFileRel: toRelative(paths.snapshotFileAbs),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelRequested: false,
  };

  currentLoanJob = job;
  loanJobs.set(job.jobId, job);
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
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');

        if (req.method === 'GET' && url.pathname === '/api/segments') {
          sendJson(res, 200, {
            success: true,
            items: readSegments(),
          });
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
            return;
          }

          next();
          return;
        }

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
        target: process.env.SYNC_USERS_API_TARGET || 'http://localhost:4174',
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
