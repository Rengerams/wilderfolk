import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

/** Directories that must never contain .js twins of .ts/.tsx sources. */
const scanRoots = ['src', 'tests', 'scripts', 'config'].map((dir) => path.resolve(dir));

/** Root-level config twins (same basename as a .ts file in cwd). */
const rootConfigTwins = ['vite.config.js', 'vitest.config.js', 'knip.js'];

function collectShadowPairs(directory) {
  if (!existsSync(directory)) return [];
  const pairs = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      pairs.push(...collectShadowPairs(filePath));
      continue;
    }
    if (!entry.endsWith('.js')) continue;

    const basePath = filePath.slice(0, -3);
    const typeScriptPath = existsSync(basePath + '.ts')
      ? basePath + '.ts'
      : existsSync(basePath + '.tsx')
        ? basePath + '.tsx'
        : existsSync(basePath + '.mts')
          ? basePath + '.mts'
          : null;
    if (typeScriptPath) {
      pairs.push({
        javascript: path.relative(process.cwd(), filePath).replaceAll('\\', '/'),
        typescript: path.relative(process.cwd(), typeScriptPath).replaceAll('\\', '/'),
      });
    }
  }
  return pairs;
}

const shadowPairs = scanRoots.flatMap((root) => collectShadowPairs(root));

for (const name of rootConfigTwins) {
  const jsPath = path.resolve(name);
  if (!existsSync(jsPath)) continue;
  const base = jsPath.slice(0, -3);
  const tsPath = existsSync(base + '.ts')
    ? base + '.ts'
    : existsSync(base + '.mts')
      ? base + '.mts'
      : null;
  if (tsPath) {
    shadowPairs.push({
      javascript: path.relative(process.cwd(), jsPath).replaceAll('\\', '/'),
      typescript: path.relative(process.cwd(), tsPath).replaceAll('\\', '/'),
    });
  }
}

// --- artifact hygiene -------------------------------------------------------------------------
// The `.js`-shadowing rule above cannot see the other class of stray file the 2026-09-16 audits
// found inside `src/`: ZIP archives of live sources behind `.zip`/`.txt` names, and files left
// empty by a mistyped shell redirect. Two cheap rules catch both
// (`BUG_REPORTS/2026-09-16-stale-source-archives-hidden-in-src.md`,
// `…-stray-duplicate-artifacts.md`).
const ARCHIVE_SIGNATURES = [
  { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'gzip', bytes: [0x1f, 0x8b] },
];

function startsWithSignature(filePath, signature) {
  const handle = openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(signature.length);
    const read = readSync(handle, head, 0, signature.length, 0);
    if (read < signature.length) return false;
    return signature.every((byte, index) => head[index] === byte);
  } finally {
    closeSync(handle);
  }
}

function collectArtifacts(directory, archives, emptyFiles) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      collectArtifacts(filePath, archives, emptyFiles);
      continue;
    }
    if (stat.size === 0) emptyFiles.push(filePath);
    for (const signature of ARCHIVE_SIGNATURES) {
      if (startsWithSignature(filePath, signature.bytes)) {
        archives.push({ file: filePath, kind: signature.name });
        break;
      }
    }
  }
}

const archives = [];
const emptyFiles = [];
for (const root of scanRoots) collectArtifacts(root, archives, emptyFiles);

const relative = (file) => path.relative(process.cwd(), file).replaceAll('\\', '/');
let failed = false;

if (shadowPairs.length > 0) {
  failed = true;
  console.error('Source integrity failure: generated JavaScript shadows authoritative TypeScript modules:');
  for (const pair of shadowPairs) {
    console.error(`- ${pair.javascript} shadows ${pair.typescript}`);
  }
  console.error(
    `Remove the ${shadowPairs.length} generated artifact(s); do not commit or ignore them. TypeScript is the only source authority.`,
  );
}

if (archives.length > 0) {
  failed = true;
  console.error('Source integrity failure: archives of live sources under src/, tests/, scripts/ or config/:');
  for (const archive of archives) console.error(`- ${relative(archive.file)} (${archive.kind} archive)`);
  console.error('A snapshot of live sources must not live inside the source tree.');
}

if (emptyFiles.length > 0) {
  failed = true;
  console.error('Source integrity failure: zero-byte files under src/, tests/, scripts/ or config/:');
  for (const file of emptyFiles) console.error(`- ${relative(file)}`);
  console.error('An empty file is almost always a mistyped command or an interrupted write.');
}

if (failed) process.exit(1);

console.log(
  'Source integrity OK: no JavaScript files shadow TypeScript modules, no source archives and no zero-byte files under src/, tests/, scripts/, or config/.',
);
process.exit(0);
