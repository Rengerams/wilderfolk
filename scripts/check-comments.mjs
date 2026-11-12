#!/usr/bin/env node
/**
 * Ratchet: only NEWLY ADDED code comments are checked for history (dates, audit IDs, file:line,
 * "used to be"). The diff base is the CI base ref when one is exported, else the working tree vs HEAD.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

/**
 * The comparison ref CI exports: PR base (workflow or runner payload) or the pre-push commit.
 * A clean checkout has no working-tree diff, so without one the ratchet inspects nothing.
 */
function configuredBaseRef() {
  const explicit = process.env.COMMENTS_BASE_REF?.trim() || process.env.PR_BASE_SHA?.trim();
  if (explicit) return explicit;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
    const sha = payload.pull_request?.base?.sha ?? payload.before;
    return typeof sha === 'string' && !/^0+$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** History that does not belong in a comment about the current code. */
const HISTORY_LIKE = [
  [/\b20\d\d-\d\d-\d\d\b/, 'a date'],
  [/\baudit(?:\s*[,)]|\s+[A-Z]-?\d)/i, 'a citation of an audit finding'],
  [/\b[\w.-]+\.(?:ts|tsx|mjs|mts|md|json):\d+/, 'a file:line reference'],
  [/\b(?:used to be|previously|formerly)\b/i, 'a "how it used to be" clause'],
];

const isComment = (text) => {
  const t = text.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

const isSource = (file) => /\.(ts|tsx|mts)$/.test(file) && !file.endsWith('.d.ts');

function inspect(where, text, found) {
  if (!isComment(text)) return;
  for (const [pattern, label] of HISTORY_LIKE) {
    const match = text.match(pattern);
    if (match) found.push(`${where}  has ${label}: "${match[0]}"`);
  }
}

const problems = [];

/* --- choose the diff range ------------------------------------------------- */
let diffBase = 'HEAD';
const requestedBase = configuredBaseRef();
if (requestedBase) {
  let commit;
  try {
    commit = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${requestedBase}^{commit}`], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.error(`comments check: the comparison base "${requestedBase}" does not resolve to a commit.`);
    console.error('Pass a fetched COMMENTS_BASE_REF=<ref> or a full SHA, or omit it to diff the working tree.');
    process.exit(1);
  }
  // A PR base is the target tip; its merge-base is the fork point, so only this branch's work counts.
  try {
    diffBase = execFileSync('git', ['merge-base', commit, 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim() || commit;
  } catch {
    diffBase = commit;
  }
}
// CI checking a clean checkout has nothing in the working-tree diff; passing here would be vacuous.
if (diffBase === 'HEAD' && process.env.GITHUB_ACTIONS === 'true') {
  console.error('comments check: CI exported no comparison base, so there is no diff to inspect.');
  console.error('Export COMMENTS_BASE_REF/PR_BASE_SHA or fetch the base commit in the checkout.');
  process.exit(1);
}

/* --- added or modified lines, tracked files ------------------------------- */
try {
  const diff = execFileSync('git', ['diff', diffBase, '-U0', '--no-color'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  let file = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (file && isSource(file)) inspect(`${file}:${lineNo}`, raw.slice(1), problems);
      lineNo += 1;
    }
  }
} catch (error) {
  // No HEAD yet (a fresh repository) or no git: nothing to ratchet against.
  if (!/not a git repository|unknown revision|ambiguous argument/i.test(String(error.message))) {
    console.error(`comments check could not read the diff: ${error.message}`);
    process.exit(1);
  }
}

/* --- entirely new files --------------------------------------------------- */
try {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' });
  for (const row of status.split('\n')) {
    if (!row.startsWith('?? ')) continue;
    const rel = row.slice(3).trim().replace(/^"|"$/g, '');
    if (!isSource(rel)) continue;
    const full = path.join(REPO, rel);
    if (!existsSync(full)) continue;
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((text, index) => inspect(`${rel}:${index + 1}`, text, problems));
  }
} catch {
  // A status failure is not worth failing the gate over; the diff above is the
  // part that matters.
}

if (problems.length === 0) {
  const range = diffBase === 'HEAD' ? 'the working tree' : `changes since ${diffBase}`;
  console.log(`Comments check passed: no newly added comment carries history in ${range}.`);
  process.exit(0);
}

console.error(`Comments check failed (${problems.length} newly added):\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error(
  '\nA comment describes the current code. State the reason, drop the story: dates, audit IDs, file:line and "used to be" belong in CHANGELOG.md or a handover, and a citation nobody can look up biases the next reader.',
);
process.exit(1);
