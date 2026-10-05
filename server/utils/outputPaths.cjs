const fs = require('fs');
const path = require('path');

function getProjectRoot() {
  const cwd = path.resolve(process.cwd());
  const packageJsonPath = path.join(cwd, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (packageJson.name === 'dashboard-tnex-partner') {
        return cwd;
      }
    } catch {
      // Fall back to this server package location below.
    }
  }

  return path.resolve(__dirname, '..', '..');
}

const PROJECT_ROOT = getProjectRoot();

// Nap bien moi truong tu .env / .env.local neu co, de khong phai set lai
// USE_SQLITE_STORE (va cac bien khac) moi lan mo terminal moi.
// .env.local uu tien hon (override) va khong commit len git.
// Chi anh huong process.env cua Node (cac file .cjs o day) - khong lien quan
// co che VITE_xxx cua Vite cho client (van hoat dong doc lap nhu cu).
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env.local'), override: true });

const OUTPUT_ROOT = path.resolve(PROJECT_ROOT, 'output');
const USERS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'users');
const LOANS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'loans');
const REFERRALS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'referrals');
const DB_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'db');
const USER_DETAIL_MASTER_FILE = path.join(USERS_OUTPUT_DIR, 'list_user_detail_all.txt');
const USER_SYNC_JOB_STATUS_FILE = path.join(USERS_OUTPUT_DIR, 'sync_user_job_status.json');
const SQLITE_DB_FILE = path.join(DB_OUTPUT_DIR, 'tnex-sync.db');

// Co bat SQLite hay khong (mac dinh TAT - giu nguyen luong file .txt cu).
// Bat bang cach set bien moi truong USE_SQLITE_STORE=true khi chay
// npm run sync-users-server / npm run dev.
function isSqliteStoreEnabled() {
  return String(process.env.USE_SQLITE_STORE || '').trim().toLowerCase() === 'true';
}

// So ngay toi da truoc khi 1 record duoc coi la "cu", can goi lai API de refresh.
// Co the chinh qua bien moi truong STALE_REFRESH_DAYS.
function getStaleRefreshDays() {
  const value = Number(process.env.STALE_REFRESH_DAYS);

  return Number.isFinite(value) && value > 0 ? value : 7;
}

// Gioi han so record cu duoc refresh THEM vao moi lan sync (ngoai so record moi). Web nay chi
// 1 nguoi dung nen nang gioi han len de bat kip du lieu cu nhanh hon (truoc la 100, de tranh
// spam API khi lan dau bat tinh nang - gio khong con can thiet nua).
function getStaleRefreshBatchLimit() {
  const value = Number(process.env.STALE_REFRESH_BATCH_LIMIT);

  return Number.isFinite(value) && value > 0 ? value : 1000;
}

module.exports = {
  PROJECT_ROOT,
  OUTPUT_ROOT,
  USERS_OUTPUT_DIR,
  LOANS_OUTPUT_DIR,
  REFERRALS_OUTPUT_DIR,
  DB_OUTPUT_DIR,
  USER_DETAIL_MASTER_FILE,
  USER_SYNC_JOB_STATUS_FILE,
  SQLITE_DB_FILE,
  isSqliteStoreEnabled,
  getStaleRefreshDays,
  getStaleRefreshBatchLimit,
};
