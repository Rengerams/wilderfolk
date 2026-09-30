#!/usr/bin/env node
/**
 * Ratchet: a NEWLY ADDED code comment must not carry history.
 *
 * The harm is not dead text, it is false authority. A comment reading
 * "(2026-09-20 audit, A8)" tells the next reader - human or agent - that a fact
 * holds, and the audit it cites lives in `docs/private/audits/`, which is
 * gitignored and has zero tracked files. Nobody but the machine it was written
 * on can look it up. A comment is the most-read document in a repository and the
 * least verified, so a stale one actively biases the next change.
 *
 * A comment describes the PRESENT code: why this constraint, what breaks
 * otherwise, what the contract is. If the reason matters, state the reason. The
 * story - dates, audit IDs, "this used to be", measurements of a past incident -
 * belongs in CHANGELOG.md or a handover.
 *
 * This is a RATCHET, deliberately: it inspects only lines added in the working
 * tree, so the 173 audit citations and 123 history lines already committed stay
 * untouched and this guard never fires on existing code. No noise, no mass
 * rewrite, and nothing for a reader to remember.
 *
 * Honest limitation: it sees uncommitted work plus untracked files. Commit first
 * and the guard has nothing to look at - so run the gate before committing, which
 * is the order every other step here assumes anyway.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

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

const isSource = (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts');

function inspect(where, text, found) {
  if (!isComment(text)) return;
  for (const [pattern, label] of HISTORY_LIKE) {
    const match = text.match(pattern);
    if (match) found.push(`${where}  has ${label}: "${match[0]}"`);
  }
}

const problems = [];

/* --- added or modified lines, tracked files ------------------------------- */
try {
  const diff = execFileSync('git', ['diff', 'HEAD', '-U0', '--no-color'], {
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
  console.log('Comments check passed: no newly added comment carries history.');
  process.exit(0);
}

console.error(`Comments check failed (${problems.length} newly added):\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error(
  '\nA comment describes the current code. State the reason, drop the story: dates, audit IDs, file:line and "used to be" belong in CHANGELOG.md or a handover, and a citation nobody can look up biases the next reader.',
);
process.exit(1);
