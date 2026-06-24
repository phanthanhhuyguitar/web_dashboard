const fs = require('fs');
const path = require('path');

const { LOANS_OUTPUT_DIR } = require('../utils/outputPaths.cjs');
const {
  LOAN_MASTER_FILE,
  appendJsonLine,
  ensureDir,
  readJsonLines,
  valueToText,
} = require('../utils/loanFileStore.cjs');

const DEFAULT_API_BASE_URL = 'https://api-gw-ds.tnex.com.vn';
const DEFAULT_LOAN_DETAIL_ENDPOINT = '/digital-sale-admin/api/v1/admin/loans/detail';
const LOAN_DETAIL_MASTER_FILE = path.join(LOANS_OUTPUT_DIR, 'list_loan_detail_all.txt');
const LOAN_DETAIL_STATUS_FILE = path.join(LOANS_OUTPUT_DIR, 'sync_loan_detail_job_status.json');
const LOAN_DETAIL_CONFIG = {
  concurrency: 1,
  delayBetweenRequestsMs: Number(process.env.LOAN_DETAIL_DELAY_MS || 500),
  timeoutMs: Number(process.env.LOAN_DETAIL_TIMEOUT_MS || 15000),
  maxRetries: Number(process.env.LOAN_DETAIL_MAX_RETRIES || 0),
  retryDelayMs: Number(process.env.LOAN_DETAIL_RETRY_DELAY_MS || 1000),
  logEvery: Number(process.env.LOAN_DETAIL_LOG_EVERY || 50),
};

function timestamp() {
  const d = new Date();
  const p = (value) => String(value).padStart(2, '0');

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds()
  )}`;
}

function createLoanDetailJobPaths(timestampText) {
  return {
    inputFileAbs: LOAN_MASTER_FILE,
    masterFileAbs: LOAN_DETAIL_MASTER_FILE,
    snapshotFileAbs: path.join(LOANS_OUTPUT_DIR, `list_loan_detail_${timestampText}.txt`),
    failedFileAbs: path.join(LOANS_OUTPUT_DIR, `list_loan_detail_failed_${timestampText}.txt`),
    logFileAbs: path.join(LOANS_OUTPUT_DIR, `sync_loan_detail_log_${timestampText}.txt`),
    statusFileAbs: LOAN_DETAIL_STATUS_FILE,
  };
}

function extractInputLoanId(row) {
  return valueToText(row?.loanId || row?.loanID || row?.loan_id);
}

function extractCustomerPhoneNumber(row) {
  return valueToText(row?.customerPhoneNumber || row?.phoneNumber);
}

function buildLoanDetailKey(loanId, customerPhoneNumber) {
  const normalizedLoanId = valueToText(loanId);
  const normalizedPhoneNumber = valueToText(customerPhoneNumber);

  return normalizedLoanId && normalizedPhoneNumber ? `${normalizedLoanId}__${normalizedPhoneNumber}` : '';
}

function getLoanDetailKeyFromRow(row) {
  const directKey = buildLoanDetailKey(row?.loanId, row?.customerPhoneNumber || row?.phoneNumber);

  if (directKey) return directKey;

  const candidates = [];

  if (Array.isArray(row?.detail)) candidates.push(...row.detail);
  else if (row?.detail && typeof row.detail === 'object') candidates.push(row.detail);

  const rawData = row?.rawResponse?.data;

  if (Array.isArray(rawData)) candidates.push(...rawData);
  else if (rawData && typeof rawData === 'object') candidates.push(rawData);

  for (const candidate of candidates) {
    const key = buildLoanDetailKey(
      candidate?.loanId || row?.loanId,
      candidate?.customerPhoneNumber || candidate?.phoneNumber || candidate?.phone || row?.customerPhoneNumber
    );

    if (key) return key;
  }

  return '';
}

function mergeLoanDetails(oldRows, newRows) {
  const detailMap = new Map();
  let inserted = 0;
  let updated = 0;

  oldRows.forEach((row) => {
    const key = getLoanDetailKeyFromRow(row);

    if (key) detailMap.set(key, row);
  });

  newRows.forEach((row) => {
    const key = getLoanDetailKeyFromRow(row);

    if (!key) return;

    if (detailMap.has(key)) {
      updated += 1;
    } else {
      inserted += 1;
    }

    detailMap.set(key, row);
  });

  return {
    rows: Array.from(detailMap.values()),
    inserted,
    updated,
  };
}

function getLoanDetailApiUrl(loanId, customerPhoneNumber) {
  const explicitUrl = process.env.LOAN_DETAIL_URL || process.env.VITE_LOAN_DETAIL_URL;
  const apiBaseUrl = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
  const endpoint = process.env.VITE_LOAN_DETAIL_ENDPOINT || process.env.LOAN_DETAIL_ENDPOINT || DEFAULT_LOAN_DETAIL_ENDPOINT;
  const baseUrl = explicitUrl || (endpoint.startsWith('http') ? endpoint : `${apiBaseUrl}${endpoint}`);
  const url = new URL(baseUrl);

  url.searchParams.set('loanId', loanId);
  url.searchParams.set('phoneNumber', customerPhoneNumber);

  return url.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logLine(job, line) {
  fs.appendFileSync(job.logFileAbs, `${line}\n`, 'utf8');
}

function appendJsonLineToFile(filePath, row) {
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function writeLoanDetailStatus(job) {
  if (!job.statusFileAbs) return;

  try {
    ensureDir(path.dirname(job.statusFileAbs));
    fs.writeFileSync(
      job.statusFileAbs,
      JSON.stringify(
        {
          jobId: job.jobId,
          type: job.type,
          status: job.status,
          progress: job.progress,
          totalInput: job.totalInput,
          alreadyProcessed: job.alreadyProcessed,
          totalNeedSync: job.totalNeedSync,
          done: job.done,
          successCount: job.successCount,
          failedCount: job.failedCount,
          skippedMissingCount: job.skippedMissingCount,
          speed: job.speed,
          currentLoanId: job.currentLoanId,
          currentMessage: job.currentMessage,
          errorMessage: job.errorMessage,
          inputFile: job.inputFileRel,
          masterFile: job.masterFileRel,
          snapshotFile: job.snapshotFileRel,
          failedFile: job.failedFileRel,
          logFile: job.logFileRel,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // Status file is diagnostic only. Main output files are still authoritative.
  }
}

function updateStatus(job, writeStatus) {
  writeLoanDetailStatus(job);
  if (typeof writeStatus === 'function') writeStatus(job);
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

async function endStream(stream) {
  if (!stream) return;

  await new Promise((resolve) => stream.end(resolve));
}

function readLoanDetailInput(inputFileAbs, failedStream, job) {
  if (!fs.existsSync(inputFileAbs)) {
    const error = new Error('Khong tim thay file output/loans/list_loan_all.txt. Vui long dong bo don vay truoc.');
    error.code = 'LOAN_MASTER_FILE_NOT_FOUND';
    throw error;
  }

  const rows = [];
  const content = fs.readFileSync(inputFileAbs, 'utf8');

  content.split(/\r?\n/).forEach((line, index) => {
    const text = line.trim();

    if (!text) return;

    try {
      const loan = JSON.parse(text);
      const loanId = extractInputLoanId(loan);
      const customerPhoneNumber = extractCustomerPhoneNumber(loan);
      const detailKey = buildLoanDetailKey(loanId, customerPhoneNumber);

      if (!detailKey) {
        job.skippedMissingCount += 1;
        appendJsonLine(failedStream, {
          loanId,
          customerPhoneNumber,
          lineNumber: index + 1,
          reason: 'MISSING_LOAN_ID_OR_CUSTOMER_PHONE_NUMBER',
          message: 'Missing loanId or customerPhoneNumber in input loan record.',
        });
        return;
      }

      rows.push({
        loanId,
        customerPhoneNumber,
        detailKey,
      });
    } catch (error) {
      job.skippedMissingCount += 1;
      appendJsonLine(failedStream, {
        lineNumber: index + 1,
        reason: 'INVALID_JSON_LINE',
        message: error.message,
      });
    }
  });

  return rows;
}

function readExistingLoanDetailKeys(masterFileAbs) {
  const existing = readJsonLines(masterFileAbs);
  const keys = new Set();

  existing.rows.forEach((row) => {
    const key = getLoanDetailKeyFromRow(row);

    if (key) keys.add(key);
  });

  return {
    rows: existing.rows,
    keys,
    invalidLines: existing.invalidLines,
  };
}

function normalizeLoanDetailResponse({ loanId, customerPhoneNumber, responseJson }) {
  const detail =
    responseJson && typeof responseJson === 'object' && Object.prototype.hasOwnProperty.call(responseJson, 'data')
      ? responseJson.data
      : responseJson;

  return {
    loanId,
    customerPhoneNumber,
    detail,
    rawResponse: responseJson,
    syncedAt: new Date().toISOString(),
  };
}

async function requestLoanDetailOnce({ token, loanId, customerPhoneNumber }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOAN_DETAIL_CONFIG.timeoutMs);

  try {
    const response = await fetch(getLoanDetailApiUrl(loanId, customerPhoneNumber), {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: `Bearer ${token}`,
        origin: 'https://partner-admin.tnex.com.vn',
        referer: 'https://partner-admin.tnex.com.vn/',
      },
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

    return normalizeLoanDetailResponse({
      loanId,
      customerPhoneNumber,
      responseJson: data,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestLoanDetail({ token, loanId, customerPhoneNumber }) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= LOAN_DETAIL_CONFIG.maxRetries) {
    try {
      return await requestLoanDetailOnce({ token, loanId, customerPhoneNumber });
    } catch (error) {
      if (error?.name === 'AbortError') {
        lastError = new Error(`Request timeout sau ${LOAN_DETAIL_CONFIG.timeoutMs}ms`);
      } else {
        lastError = error;
      }

      if (lastError?.status === 401 || lastError?.status === 403 || attempt === LOAN_DETAIL_CONFIG.maxRetries) {
        break;
      }

      attempt += 1;
      await sleep(LOAN_DETAIL_CONFIG.retryDelayMs);
    }
  }

  throw lastError;
}

function getProgress(done, totalNeedSync) {
  if (!totalNeedSync) return 100;

  return Math.min(99, Math.floor((done / totalNeedSync) * 100));
}

async function runSyncLoanDetailsJob(job, token, { writeStatus } = {}) {
  let snapshotStream = null;
  let failedStream = null;
  const startMs = Date.now();

  try {
    ensureDir(LOANS_OUTPUT_DIR);
    ensureDir(path.dirname(job.masterFileAbs));
    if (!fs.existsSync(job.masterFileAbs)) {
      fs.closeSync(fs.openSync(job.masterFileAbs, 'a'));
    }
    snapshotStream = fs.createWriteStream(job.snapshotFileAbs, { flags: 'w', encoding: 'utf8' });
    failedStream = fs.createWriteStream(job.failedFileAbs, { flags: 'w', encoding: 'utf8' });

    job.currentMessage = 'Dang doc file tong don vay...';
    updateStatus(job, writeStatus);

    const inputLoans = readLoanDetailInput(job.inputFileAbs, failedStream, job);
    const existing = readExistingLoanDetailKeys(job.masterFileAbs);
    const seenKeys = new Set(existing.keys);
    const uniqueInput = [];
    const inputKeys = new Set();

    inputLoans.forEach((loan) => {
      if (inputKeys.has(loan.detailKey)) return;

      inputKeys.add(loan.detailKey);
      uniqueInput.push(loan);
    });

    const remainingLoans = uniqueInput.filter((loan) => !seenKeys.has(loan.detailKey));

    job.totalInput = uniqueInput.length;
    job.alreadyProcessed = uniqueInput.length - remainingLoans.length;
    job.totalNeedSync = remainingLoans.length;
    job.done = 0;
    job.successCount = 0;
    job.failedCount = 0;
    job.progress = remainingLoans.length === 0 ? 100 : 0;
    job.totalInMaster = seenKeys.size;

    logLine(job, '=== BAT DAU DONG BO CHI TIET DS DON VAY ===');
    logLine(job, `JobId: ${job.jobId}`);
    logLine(job, `Input file: ${job.inputFileRel}`);
    logLine(job, `Master file: ${job.masterFileRel}`);
    logLine(job, `Existing detail count before run: ${existing.keys.size}`);
    logLine(job, `Invalid master lines: ${existing.invalidLines || 0}`);
    logLine(job, `Total input: ${job.totalInput}`);
    logLine(job, `Already processed: ${job.alreadyProcessed}`);
    logLine(job, `Need sync: ${job.totalNeedSync}`);
    logLine(job, `Skipped missing/invalid: ${job.skippedMissingCount}`);
    logLine(job, `API method: GET`);
    logLine(job, `API endpoint: /digital-sale-admin/api/v1/admin/loans/detail`);
    logLine(job, `Concurrency: ${LOAN_DETAIL_CONFIG.concurrency}`);
    logLine(job, `Delay: ${LOAN_DETAIL_CONFIG.delayBetweenRequestsMs}ms`);
    logLine(job, `Timeout: ${LOAN_DETAIL_CONFIG.timeoutMs}ms`);
    logLine(job, `Max retries: ${LOAN_DETAIL_CONFIG.maxRetries}`);

    updateStatus(job, writeStatus);

    if (remainingLoans.length === 0) {
      await endStream(snapshotStream);
      await endStream(failedStream);
      snapshotStream = null;
      failedStream = null;

      job.status = 'COMPLETED';
      job.finishedAt = new Date().toISOString();
      job.currentMessage = 'Tat ca don vay trong file input da co chi tiet. Khong can dong bo lai.';
      logLine(job, job.currentMessage);
      updateStatus(job, writeStatus);
      return;
    }

    for (const loan of remainingLoans) {
      await waitIfPaused(job);
      assertJobCanContinue(job);

      job.currentLoanId = loan.loanId;
      job.currentMessage = `Dang lay chi tiet don vay ${job.done + 1}/${job.totalNeedSync}...`;
      updateStatus(job, writeStatus);

      try {
        const detail = await requestLoanDetail({
          token,
          loanId: loan.loanId,
          customerPhoneNumber: loan.customerPhoneNumber,
        });

        assertJobCanContinue(job);
        appendJsonLineToFile(job.masterFileAbs, detail);
        appendJsonLine(snapshotStream, detail);
        seenKeys.add(loan.detailKey);
        job.successCount += 1;
        job.totalInMaster = seenKeys.size;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          appendJsonLine(failedStream, {
            loanId: loan.loanId,
            customerPhoneNumber: loan.customerPhoneNumber,
            reason: 'AUTH_ERROR',
            message: error.message,
            failedAt: new Date().toISOString(),
          });
          job.failedCount += 1;
          throw error;
        }

        appendJsonLine(failedStream, {
          loanId: loan.loanId,
          customerPhoneNumber: loan.customerPhoneNumber,
          reason: 'API_ERROR',
          message: error.message,
          failedAt: new Date().toISOString(),
        });
        job.failedCount += 1;
        logLine(job, `[${job.done + 1}/${job.totalNeedSync}] ERROR ${loan.loanId} | ${error.message}`);
      }

      job.done += 1;
      const elapsed = Math.max((Date.now() - startMs) / 1000, 0.001);
      job.speed = Math.round((job.done / elapsed) * 100) / 100;
      job.progress = getProgress(job.done, job.totalNeedSync);
      job.currentMessage = `Da xu ly ${job.done}/${job.totalNeedSync} don vay chi tiet. Thanh cong: ${job.successCount}, loi: ${job.failedCount}.`;

      if (job.done <= 10 || job.done % LOAN_DETAIL_CONFIG.logEvery === 0 || job.done === job.totalNeedSync) {
        logLine(
          job,
          `[${job.done}/${job.totalNeedSync}] success: ${job.successCount} | failed: ${job.failedCount} | skipped: ${job.skippedMissingCount} | speed: ${job.speed} req/s`
        );
      }

      updateStatus(job, writeStatus);

      if (LOAN_DETAIL_CONFIG.delayBetweenRequestsMs > 0 && job.done < job.totalNeedSync) {
        await waitIfPaused(job);
        assertJobCanContinue(job);
        await sleep(LOAN_DETAIL_CONFIG.delayBetweenRequestsMs);
      }
    }

    await endStream(snapshotStream);
    await endStream(failedStream);
    snapshotStream = null;
    failedStream = null;

    job.inserted = job.successCount;
    job.updated = job.alreadyProcessed;
    job.totalInMaster = seenKeys.size;
    job.status = 'COMPLETED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.currentLoanId = null;
    job.currentMessage =
      job.failedCount > 0
        ? `Dong bo chi tiet DS don vay hoan tat, co ${job.failedCount} don loi. Vui long kiem tra failed file.`
        : 'Dong bo chi tiet DS don vay hoan tat.';

    logLine(job, '');
    logLine(job, '=== HOAN TAT DONG BO CHI TIET DS DON VAY ===');
    logLine(job, `Success: ${job.successCount}`);
    logLine(job, `Failed: ${job.failedCount}`);
    logLine(job, `Skipped missing/invalid: ${job.skippedMissingCount}`);
    logLine(job, `Inserted: ${job.inserted}`);
    logLine(job, `Skipped existing: ${job.updated}`);
    logLine(job, `Master total: ${job.totalInMaster}`);
    logLine(job, 'Khong ghi de file tong. Chi append cac detail moi.');
    logLine(job, `Finished time: ${job.finishedAt}`);
    logLine(job, `Duration: ${Math.round((Date.now() - startMs) / 1000)}s`);
  } catch (error) {
    await endStream(snapshotStream);
    await endStream(failedStream);

    if (error.message === 'SYNC_CANCELLED') {
      job.status = 'CANCELLED';
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.currentLoanId = null;
      job.currentMessage = 'Da huy dong bo chi tiet DS don vay.';
      logLine(job, '=== DA HUY DONG BO CHI TIET DS DON VAY ===');
      updateStatus(job, writeStatus);
      return;
    }

    job.status = 'FAILED';
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    job.errorMessage = error.message;
    job.currentMessage = 'Dong bo chi tiet DS don vay that bai. Vui long kiem tra log.';

    try {
      logLine(job, '');
      logLine(job, error.message);
      logLine(job, `Finished time: ${job.finishedAt}`);
    } catch {
      // Ignore secondary log failure.
    }
  } finally {
    updateStatus(job, writeStatus);
  }
}

module.exports = {
  LOAN_DETAIL_CONFIG,
  LOAN_DETAIL_MASTER_FILE,
  createLoanDetailJobPaths,
  runSyncLoanDetailsJob,
  timestamp,
};
