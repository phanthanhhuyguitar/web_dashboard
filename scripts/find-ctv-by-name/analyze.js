// So khop ten TUONG TU (khong chi khop chinh xac) tren cache da quet boi run.js - khong goi API,
// chay ngay lap tuc, co the doi tu khoa/nguong nhieu lan tuy y.
//
// Cach dung: node scripts/find-ctv-by-name/analyze.js "Nguyễn Chí Toàn" [max-distance]
// (max-distance mac dinh = 3 - cang nho cang chat, cang lon cang long)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CACHE_FILE = fileURLToPath(new URL('./all-users-cache.json', import.meta.url));
const queryArg = process.argv[2] || 'Nguyễn Chí Toàn';
const maxDistance = Number(process.argv[3]) || 3;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Levenshtein distance chuan (khong toi uu, nhung ten nguoi rat ngan nen khong thanh van de hieu
// nang du co hang chuc nghin dong).
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);

  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

async function main() {
  let raw;

  try {
    raw = await readFile(CACHE_FILE, 'utf8');
  } catch {
    console.error(`Chua co cache (${CACHE_FILE}). Chay "node scripts/find-ctv-by-name/run.js" truoc.`);
    process.exitCode = 1;
    return;
  }

  const rows = JSON.parse(raw);
  const targetNorm = normalizeText(queryArg);
  const targetTokens = new Set(targetNorm.split(' ').filter(Boolean));

  const results = rows
    .map((row) => {
      const nameNorm = normalizeText(row.name);

      if (!nameNorm) return null;

      const nameTokens = new Set(nameNorm.split(' ').filter(Boolean));
      const sharedTokens = [...targetTokens].filter((token) => nameTokens.has(token));
      const isExact = nameNorm === targetNorm;
      const isSubstring = !isExact && (nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm));
      const distance = levenshtein(nameNorm, targetNorm);
      const isCloseTypo = !isExact && !isSubstring && distance <= maxDistance;
      // "Tuong tu dang ten nguoi" - chia se it nhat 2 tu (vd ho + 1 ten dem/ten chinh), tranh
      // khop qua long chi vi trung 1 ho rat pho bien nhu "Nguyen".
      const isTokenSimilar = !isExact && !isSubstring && !isCloseTypo && sharedTokens.length >= 2;

      if (!isExact && !isSubstring && !isCloseTypo && !isTokenSimilar) return null;

      let reason = 'khop chinh xac';

      if (!isExact && isSubstring) reason = 'chua tron ten/bi chua trong ten';
      else if (!isExact && isCloseTypo) reason = `gan giong (sai khac ${distance} ky tu)`;
      else if (!isExact && isTokenSimilar) reason = `trung ${sharedTokens.length} tu (${sharedTokens.join(', ')})`;

      return { ...row, distance, reason, isExact };
    })
    .filter(Boolean)
    .sort((a, b) => (a.isExact === b.isExact ? a.distance - b.distance : a.isExact ? -1 : 1));

  console.log(`Tim "${queryArg}" (chuan hoa: "${targetNorm}") trong ${rows.length} user đã cache...\n`);
  console.log(`===== KET QUA (${results.length} khop, gom ca gan dung) =====`);

  if (results.length === 0) {
    console.log('Khong tim thay ten nao tuong tu.');
    return;
  }

  results.forEach((row, index) => {
    console.log(
      `${index + 1}. ${row.name} | Mã sale: ${row.saleId || '--'} | SĐT: ${row.phone || '--'} | userId: ${row.userId || '--'} | Trạng thái: ${row.status || '--'} | (${row.reason})`
    );
  });
}

main();
