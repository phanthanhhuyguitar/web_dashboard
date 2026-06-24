const fs = require('fs');
const path = require('path');

const { LOANS_OUTPUT_DIR } = require('../utils/outputPaths.cjs');
const {
  LOAN_MASTER_FILE,
  appendJsonLine,
  ensureDir,
  mergeLoans,
  readJsonLines,
  valueToText,
  writeJsonLines,
} = require('../utils/loanFileStore.cjs');

const DEFAULT_API_BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const DEFAULT_LOANS_ENDPOINT = '/digital-sale-admin/api/v1/admin/loans';
const LOAN_PAGE_SIZE = Number(process.env.LOAN_PAGE_SIZE || process.env.SYNC_LOAN_PAGE_SIZE || 100);
const LOAN_SYNC_CONFIG = {
  concurrency: 1,
  delayBetweenRequestsMs: Number(process.env.LOAN_SYNC_DELAY_MS || 500),
  timeoutMs: Number(process.env.LOAN_SYNC_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.LOAN_SYNC_MAX_RETRIES || 0),
  retryDelayMs: Number(process.env.LOAN_SYNC_RETRY_DELAY_MS || 1000),
  logEvery: Number(process.env.LOAN_SYNC_LOG_EVERY || 1),
};

function timestamp() {
  const d = new Date();
  const p = (value) => String(value).padStart(2, '0');

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds()
  )}`;
}

function createLoanJobPaths(timestampText) {
  return {
    masterFileAbs: LOAN_MASTER_FILE,
    latestFileAbs: path.join(LOANS_OUTPUT_DIR, 'listLoan_latest.txt'),
    snapshotFileAbs: path.join(LOANS_OUTPUT_DIR, `listLoan_${timestampText}.txt`),
    logFileAbs: path.join(LOANS_OUTPUT_DIR, `sync_loan_log_${timestampText}.txt`),
    failedFileAbs: path.join(LOANS_OUTPUT_DIR, `sync_loan_failed_${timestampText}.txt`),
  };
}

function getByPath(source, pathText) {
  return pathText.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function getFirstValue(source, paths) {
  return getFirstMatch(source, paths).value;
}

function getFirstMatch(source, paths) {
  for (const item of paths) {
    const value = getByPath(source, item);

    if (value !== undefined && value !== null) {
      return {
        path: item,
        value,
      };
    }
  }

  return {
    path: null,
    value: undefined,
  };
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function safeObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
}

function normalizeLoansResponse(responseData) {
  const loansMatch = getFirstMatch(responseData, [
    'data.items',
    'data.content',
    'data.records',
    'data.list',
    'data.loans',
    'items',
    'content',
    'records',
    'list',
    'loans',
  ]);
  const loans = loansMatch.value || [];
  const totalMatch = getFirstMatch(responseData, [
    'data.totalElements',
    'totalElements',
    'data.total',
    'total',
    'data.totalItems',
    'totalItems',
    'data.page.totalElements',
    'page.totalElements',
    'data.pagination.totalElements',
    'pagination.totalElements',
    'data.pagination.total',
    'pagination.total',
  ]);
  const totalPagesMatch = getFirstMatch(responseData, [
    'data.totalPages',
    'totalPages',
    'data.page.totalPages',
    'page.totalPages',
    'data.pagination.totalPages',
    'pagination.totalPages',
  ]);
  const currentPageMatch = getFirstMatch(responseData, [
    'data.page',
    'page',
    'data.currentPage',
    'currentPage',
  ]);
  const data = responseData?.data;

  return {
    loans: Array.isArray(loans) ? loans : [loans],
    total: toFiniteNumber(totalMatch.value),
    totalPath: totalMatch.path,
    totalPages: toFiniteNumber(totalPagesMatch.value),
    totalPagesPath: totalPagesMatch.path,
    currentPageFromApi: toFiniteNumber(currentPageMatch.value),
    currentPagePath: currentPageMatch.path,
    itemsPath: loansMatch.path,
    responseKeys: safeObjectKeys(responseData),
    dataKeys: safeObjectKeys(data),
  };
}

function getLoanApiUrl() {
  const loanUrl = process.env.LOAN_URL || process.env.VITE_LOAN_URL;

  if (loanUrl) return loanUrl;

  const apiBaseUrl = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
  const endpoint = process.env.VITE_LOANS_ENDPOINT || process.env.LOANS_ENDPOINT || DEFAULT_LOANS_ENDPOINT;

  return endpoint.startsWith('http') ? endpoint : `${apiBaseUrl}${endpoint}`;
}

function logLine(job, line) {
  fs.appendFileSync(job.logFileAbs, `${line}\n`, 'utf8');
}

function buildLoanRequestBody(page, size) {
  return {
    filter: {},
    page,
    size,
  };
}

function shouldStopPaging({ page, pageSize, loansLength, totalPages }) {
  if (loansLength === 0) {
    return {
      stop: true,
      reason: 'empty page',
    };
  }

  if (Number.isFinite(Number(totalPages)) && Number(totalPages) > 0 && page + 1 >= Number(totalPages)) {
    return {
      stop: true,
      reason: 'reached totalPages',
    };
  }

  if (loansLength < pageSize) {
    return {
      stop: true,
      reason: 'items.length < pageSize',
    };
  }

  return {
    stop: false,
    reason: '',
  };
}

function getEffectiveTotalPages(totalPages, totalElements, pageSize) {
  const parsedTotalPages = toFiniteNumber(totalPages);
  const parsedTotalElements = toFiniteNumber(totalElements);
  const pages = [];

  if (parsedTotalPages !== null && parsedTotalPages > 0) {
    pages.push(parsedTotalPages);
  }

  if (parsedTotalElements !== null && parsedTotalElements > 0) {
    pages.push(Math.ceil(parsedTotalElements / pageSize));
  }

  return pages.length ? Math.max(...pages) : null;
}

function isTotalElementsReliable({ page, itemsLength, pageSize, total }) {
  if (total === null) return false;
  if (total > itemsLength) return true;
  if (page > 0) return true;
  if (itemsLength < pageSize) return true;

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function requestLoanPageOnce({ token, page, size }) {
  const body = buildLoanRequestBody(page, size);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOAN_SYNC_CONFIG.timeoutMs);

  try {
    const response = await fetch(getLoanApiUrl(), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        origin: 'https://partner-admin.tnex.com.vn',
        referer: 'https://partner-admin.tnex.com.vn/',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} | ${valueToText(data?.message || data?.error || text).slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }

    return normalizeLoansResponse(data);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestLoanPage({ token, page, size }) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= LOAN_SYNC_CONFIG.maxRetries) {
    try {
      return await requestLoanPageOnce({ token, page, size });
    } catch (error) {
      if (error?.name === 'AbortError') {
        lastError = new Error(`Request timeout sau ${LOAN_SYNC_CONFIG.timeoutMs}ms`);
      } else {
        lastError = error;
      }

      if (lastError?.status === 401 || lastError?.status === 403 || attempt === LOAN_SYNC_CONFIG.maxRetries) {
        break;
      }

      attempt += 1;
      await sleep(LOAN_SYNC_CONFIG.retryDelayMs);
    }
  }

  throw lastError;
}

async function runSyncLoansJob(job, token, { writeStatus }) {
  let snapshotStream = null;
  let failedStream = null;
  const startMs = Date.now();
  const fetchedLoans = [];

  try {
    ensureDir(LOANS_OUTPUT_DIR);
    snapshotStream = fs.createWriteStream(job.snapshotFileAbs, { flags: 'w', encoding: 'utf8' });
    failedStream = fs.createWriteStream(job.failedFileAbs, { flags: 'w', encoding: 'utf8' });

    logLine(job, '=== BAT DAU DONG BO DON VAY ===');
    logLine(job, `JobId: ${job.jobId}`);
    logLine(job, `Loan API: ${getLoanApiUrl()}`);
    logLine(job, 'Loan method: POST');
    logLine(job, `Loan body template: ${JSON.stringify(buildLoanRequestBody(0, LOAN_PAGE_SIZE))}`);
    logLine(job, `Page size: ${LOAN_PAGE_SIZE}`);
    logLine(job, `Concurrency: ${LOAN_SYNC_CONFIG.concurrency}`);
    logLine(job, `Delay: ${LOAN_SYNC_CONFIG.delayBetweenRequestsMs}ms`);
    logLine(job, `Timeout: ${LOAN_SYNC_CONFIG.timeoutMs}ms`);
    logLine(job, `Max retries: ${LOAN_SYNC_CONFIG.maxRetries}`);
    logLine(job, `Master file: ${job.masterFileRel}`);
    logLine(job, `Snapshot file: ${job.snapshotFileRel}`);
    logLine(job, `Latest file: ${job.latestFileRel}`);
    logLine(job, `Start time: ${job.startedAt}`);

    let page = 0;
    let totalPages = null;
    let stopReason = '';

    while (true) {
      await waitIfPaused(job);
      assertJobCanContinue(job);

      job.currentPage = page + 1;
      job.currentMessage = `Dang dong bo don vay page ${page + 1}...`;
      writeStatus(job);

      try {
        const result = await requestLoanPage({ token, page, size: LOAN_PAGE_SIZE });
        const canTrustTotal = isTotalElementsReliable({
          page,
          itemsLength: result.loans.length,
          pageSize: LOAN_PAGE_SIZE,
          total: result.total,
        });

        if (canTrustTotal) {
          job.totalFromApi = result.total;
        }

        const totalPagesLooksTooSmall =
          result.totalPages !== null &&
          result.totalPages <= page + 1 &&
          result.loans.length === LOAN_PAGE_SIZE &&
          !canTrustTotal;
        totalPages = totalPagesLooksTooSmall
          ? null
          : getEffectiveTotalPages(result.totalPages, canTrustTotal ? result.total : null, LOAN_PAGE_SIZE);
        job.totalPages = totalPages;

        result.loans.forEach((loan) => {
          fetchedLoans.push(loan);
          appendJsonLine(snapshotStream, loan);
        });

        job.processed = fetchedLoans.length;
        const elapsed = Math.max((Date.now() - startMs) / 1000, 0.001);
        job.speed = Math.round(((page + 1) / elapsed) * 100) / 100;
        if (job.totalFromApi) {
          job.progress = Math.min(95, Math.floor((job.processed / job.totalFromApi) * 95));
        } else if (totalPages) {
          job.progress = Math.min(95, Math.floor(((page + 1) / totalPages) * 95));
        } else {
          job.progress = Math.min(95, (page + 1) * 5);
        }

        if (page === 0) {
          logLine(
            job,
            `[Loan Sync] Page 0 response keys: top=${JSON.stringify(result.responseKeys)} data=${JSON.stringify(
              result.dataKeys
            )}`
          );
          logLine(
            job,
            `[Loan Sync] Page 0 response paths: items=${result.itemsPath || 'n/a'} totalElements=${
              result.totalPath || 'n/a'
            } totalPages=${result.totalPagesPath || 'n/a'} currentPage=${result.currentPagePath || 'n/a'}`
          );
        }

        if ((page + 1) % LOAN_SYNC_CONFIG.logEvery === 0 || page === 0 || result.loans.length < LOAN_PAGE_SIZE) {
          logLine(
            job,
            `[Loan Sync] Page ${page} - size ${LOAN_PAGE_SIZE} - items ${result.loans.length} - totalElements ${
              result.total ?? 'n/a'
            } - totalPages ${result.totalPages ?? 'n/a'} - processed ${job.processed}`
          );
        }
        writeStatus(job);

        const stopCheck = shouldStopPaging({
          page,
          pageSize: LOAN_PAGE_SIZE,
          loansLength: result.loans.length,
          totalPages,
        });

        if (stopCheck.stop && stopCheck.reason === 'reached totalPages' && result.loans.length === LOAN_PAGE_SIZE) {
          logLine(
            job,
            `[Loan Sync] totalPages says stop, but page ${page} is full. Fetching next page once to avoid stopping at pageSize.`
          );
        } else if (stopCheck.stop) {
          stopReason = stopCheck.reason;
          break;
        }

        page += 1;
        if (LOAN_SYNC_CONFIG.delayBetweenRequestsMs > 0) {
          logLine(job, `[Loan Sync] Delay ${LOAN_SYNC_CONFIG.delayBetweenRequestsMs}ms before next page...`);
          await sleep(LOAN_SYNC_CONFIG.delayBetweenRequestsMs);
        }
      } catch (error) {
        job.failedCount += 1;
        appendJsonLine(failedStream, {
          page,
          error: error.message,
          failedAt: new Date().toISOString(),
        });
        stopReason = 'API error';
        logLine(job, `[Loan Sync] Stop reason: ${stopReason}`);
        throw error;
      }
    }

    await new Promise((resolve) => snapshotStream.end(resolve));
    await new Promise((resolve) => failedStream.end(resolve));
    snapshotStream = null;
    failedStream = null;

    job.currentMessage = 'Dang merge vao file tong don vay...';
    writeStatus(job);

    const existing = readJsonLines(job.masterFileAbs);
    const merged = mergeLoans(existing.rows, fetchedLoans);

    writeJsonLines(job.masterFileAbs, merged.rows);
    fs.copyFileSync(job.snapshotFileAbs, job.latestFileAbs);

    job.totalFromApi = job.totalFromApi || fetchedLoans.length;
    job.inserted = merged.inserted;
    job.updated = merged.updated;
    job.totalInMaster = merged.rows.length;
    job.status = 'COMPLETED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.currentMessage = 'Dong bo don vay hoan tat.';

    logLine(job, '');
    logLine(job, '=== HOAN TAT DONG BO DON VAY ===');
    logLine(job, `Total from API: ${job.totalFromApi ?? fetchedLoans.length}`);
    logLine(job, `Processed: ${job.processed}`);
    logLine(job, `Inserted: ${job.inserted}`);
    logLine(job, `Updated/Duplicate: ${job.updated}`);
    logLine(job, `Master total: ${job.totalInMaster}`);
    logLine(job, `Latest file: ${job.latestFileRel}`);
    logLine(job, `Stop reason: ${stopReason || 'completed'}`);
    logLine(job, `Finished time: ${job.finishedAt}`);
  } catch (error) {
    if (snapshotStream) await new Promise((resolve) => snapshotStream.end(resolve));
    if (failedStream) await new Promise((resolve) => failedStream.end(resolve));

    if (error.message === 'SYNC_CANCELLED') {
      job.status = 'CANCELLED';
      job.finishedAt = new Date().toISOString();
      job.currentMessage = 'Da huy dong bo don vay.';
      logLine(job, '=== DA HUY DONG BO DON VAY ===');
      return;
    }

    job.status = 'FAILED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.errorMessage = error.message;
    job.currentMessage = 'Dong bo don vay that bai. Vui long kiem tra log.';

    try {
      logLine(job, '');
      logLine(job, error.message);
      logLine(job, `Finished time: ${job.finishedAt}`);
    } catch {
      // Ignore secondary log failure.
    }
  } finally {
    writeStatus(job);
  }
}

module.exports = {
  createLoanJobPaths,
  runSyncLoansJob,
  timestamp,
};
