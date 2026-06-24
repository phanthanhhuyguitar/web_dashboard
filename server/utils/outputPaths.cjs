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
const OUTPUT_ROOT = path.resolve(PROJECT_ROOT, 'output');
const USERS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'users');
const LOANS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'loans');
const REFERRALS_OUTPUT_DIR = path.join(OUTPUT_ROOT, 'referrals');
const USER_DETAIL_MASTER_FILE = path.join(USERS_OUTPUT_DIR, 'list_user_detail_all.txt');
const USER_SYNC_JOB_STATUS_FILE = path.join(USERS_OUTPUT_DIR, 'sync_user_job_status.json');

module.exports = {
  PROJECT_ROOT,
  OUTPUT_ROOT,
  USERS_OUTPUT_DIR,
  LOANS_OUTPUT_DIR,
  REFERRALS_OUTPUT_DIR,
  USER_DETAIL_MASTER_FILE,
  USER_SYNC_JOB_STATUS_FILE,
};
