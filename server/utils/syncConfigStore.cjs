// Cau hinh tuy chinh cho cac job dong bo - luu trong SQLite (bang sync_config, 1 dong JSON blob)
// de ca vite.config.js (LOAN/LOAN_DETAIL) lan syncUsersServer.cjs (USER_LIST/USER_DETAIL, chay
// process rieng) doc chung duoc, va client (SettingsPage.jsx) chinh duoc qua API ma khong can
// restart process nao - moi lan job chay se doc lai gia tri moi nhat truoc khi bat dau.
const { getDb } = require('./db.cjs');

const CONFIG_KEY = 'tuning';

const DEFAULTS = {
  userListDelayMs: 150,
  userDetailDelayMs: 150,
  userDetailConcurrency: 5,
  loanListDelayMs: 150,
  loanDetailDelayMs: 150,
  // Job nay MOI duoc chuyen tu chay tuan tu sang chay song song that (truoc gio concurrency
  // luon = 1, chi la field hien thi). De mac dinh thap hon USER_DETAIL vi la lan dau bat tinh
  // nang nay cho job nay - tang dan qua trang Cai dat neu on dinh.
  loanDetailConcurrency: 3,
  staleRefreshBatchLimit: 1000,
  staleRefreshDays: 7,
};

const LIMITS = {
  userListDelayMs: { min: 0, max: 10000 },
  userDetailDelayMs: { min: 0, max: 10000 },
  userDetailConcurrency: { min: 1, max: 20 },
  loanListDelayMs: { min: 0, max: 10000 },
  loanDetailDelayMs: { min: 0, max: 10000 },
  loanDetailConcurrency: { min: 1, max: 20 },
  staleRefreshBatchLimit: { min: 1, max: 20000 },
  staleRefreshDays: { min: 1, max: 90 },
};

function clamp(key, rawValue) {
  const limit = LIMITS[key];
  const value = Number(rawValue);

  if (!Number.isFinite(value)) return DEFAULTS[key];
  if (!limit) return value;

  return Math.min(limit.max, Math.max(limit.min, value));
}

function getSyncConfig() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_config WHERE key = ?').get(CONFIG_KEY);

  if (!row) return { ...DEFAULTS };

  try {
    const parsed = JSON.parse(row.value);

    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

// partial: object chi chua cac key can doi - cac key khac giu nguyen gia tri dang co.
function updateSyncConfig(partial) {
  const db = getDb();
  const current = getSyncConfig();
  const merged = { ...current };

  Object.keys(DEFAULTS).forEach((key) => {
    if (partial[key] !== undefined) {
      merged[key] = clamp(key, partial[key]);
    }
  });

  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sync_config (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).run(CONFIG_KEY, JSON.stringify(merged), now);

  return merged;
}

module.exports = { getSyncConfig, updateSyncConfig, DEFAULTS, LIMITS };
