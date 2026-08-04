import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT_DIR = process.cwd();
const SCAN_DIRS = ['src'];
const EXTRA_FILES = ['index.html', '.env.example'];
const ALLOWED_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.json', '.ts', '.tsx']);
const MOJIBAKE_MARKERS = ['Ã', 'Ä', 'Æ', 'áº', 'á»', 'â€', 'â†', 'â€¢', 'âŒ', '�'];

function collectFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (ALLOWED_EXTENSIONS.has(extname(fullPath))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findMarkerLine(content, marker) {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(marker));

  return index >= 0 ? index + 1 : 1;
}

const filesToScan = [
  ...SCAN_DIRS.flatMap((dir) => collectFiles(join(ROOT_DIR, dir))),
  ...EXTRA_FILES.map((file) => join(ROOT_DIR, file)),
];

const issues = [];

for (const file of filesToScan) {
  const content = readFileSync(file, 'utf8');
  const marker = MOJIBAKE_MARKERS.find((item) => content.includes(item));

  if (marker) {
    issues.push({
      file: relative(ROOT_DIR, file),
      line: findMarkerLine(content, marker),
      marker,
    });
  }
}

if (issues.length > 0) {
  console.error('Phat hien chuoi text co dau hieu sai encoding UTF-8:');
  issues.forEach((issue) => {
    console.error(`- ${issue.file}:${issue.line} marker "${issue.marker}"`);
  });
  console.error('Hay luu file bang UTF-8 va sua lai chuoi bi mojibake truoc khi build.');
  process.exit(1);
}

console.log('Encoding check passed.');

