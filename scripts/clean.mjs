#!/usr/bin/env node
/**
 * Housekeeping: empty `tmp/` and drop browser-automation leftovers — dry run unless `--apply`. It never
 * touches `node_modules`, `.git`, `docs/`, `src/`, `tests/`, the pnpm store, the uv cache or the Recycle Bin.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const REPO = process.cwd();

/** Whole repo-relative trees that are pure build output. */
const REPO_TREES = ['dist'];

/** Scratch directory, cleared entry by entry (see collectTargets). */
const SCRATCH_DIR = 'tmp';

/**
 * Browser profiles automation leaves in the OS temp dir, matched by exact prefix and only as a direct
 * child of the temp root — never a recursive glob.
 */
const TEMP_PREFIXES = [
  'playwright_chromiumdev_profile-',
  'playwright-artifacts-',
  'HeadlessChrome',
  'wf-toast-probe-',
  'wilderfolk-autoplay-probe-',
];

const MB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function sizeOf(target) {
  let total = 0;
  const walk = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return; // vanished or unreadable; size is best-effort
    }
    if (st.isFile()) {
      total += st.size;
      return;
    }
    let entries;
    try {
      entries = readdirSync(p);
    } catch {
      return;
    }
    for (const entry of entries) walk(path.join(p, entry));
  };
  walk(target);
  return total;
}

/** Collect concrete delete targets. Nothing is inferred from user input. */
function collectTargets() {
  const targets = [];

  for (const tree of REPO_TREES) {
    const full = path.join(REPO, tree);
    if (existsSync(full)) targets.push({ path: full, why: 'build output' });
  }

  // Scratch is expanded per entry: a whole-tree `rmSync` aborts on the first locked file and leaves
  // everything behind. `tmp/` itself stays — scripts resolve paths under it.
  const scratch = path.join(REPO, SCRATCH_DIR);
  if (existsSync(scratch)) {
    for (const entry of readdirSync(scratch)) {
      targets.push({ path: path.join(scratch, entry), why: 'repo scratch' });
    }
  }

  const tempRoot = os.tmpdir();
  for (const entry of readdirSync(tempRoot)) {
    if (!TEMP_PREFIXES.some((prefix) => entry.startsWith(prefix))) continue;
    targets.push({ path: path.join(tempRoot, entry), why: 'browser profile' });
  }

  return targets;
}

/**
 * A target must live under the repo or directly under the OS temp root. This is
 * a guard against a future edit turning the allow-list into an escape hatch.
 */
function isAllowed(target) {
  const resolved = path.resolve(target);
  const tempRoot = path.resolve(os.tmpdir());
  const repoRoot = path.resolve(REPO);
  if (resolved === repoRoot || resolved === tempRoot) return false;
  const underRepo = resolved.startsWith(repoRoot + path.sep);
  const underTemp = path.dirname(resolved) === tempRoot;
  return underRepo || underTemp;
}

const targets = collectTargets().filter((t) => isAllowed(t.path));

if (targets.length === 0) {
  console.log('clean: nothing to remove.');
  process.exit(0);
}

let planned = 0;
let removed = 0;
let skipped = 0;

for (const { path: target, why } of targets.sort((a, b) => a.path.localeCompare(b.path))) {
  const size = sizeOf(target);
  planned += size;
  const label = path.relative(REPO, target) || target;

  if (!APPLY) {
    console.log(`  would remove  ${MB(size).padStart(10)}  [${why}]  ${label}`);
    continue;
  }
  try {
    rmSync(target, { recursive: true, force: true });
    removed += size;
    console.log(`  removed       ${MB(size).padStart(10)}  [${why}]  ${label}`);
  } catch (error) {
    // A locked file is normal here: a running browser still holds its profile,
    // and Windows will not delete that. Report it instead of failing the run.
    skipped += 1;
    console.log(`  SKIPPED       ${MB(size).padStart(10)}  [${why}]  ${label}  (${error.code ?? 'error'})`);
  }
}

if (APPLY) {
  console.log(`\nclean: removed ${MB(removed)} across ${targets.length - skipped} target(s).`);
  if (skipped > 0) {
    console.log(`clean: ${skipped} target(s) skipped because a process still holds them — stop the browser/automation and re-run.`);
  }
} else {
  console.log(`\nclean: dry run — would free ${MB(planned)} across ${targets.length} target(s).`);
  console.log('clean: re-run with --apply to delete, or `npm run clean:apply`.');
}
