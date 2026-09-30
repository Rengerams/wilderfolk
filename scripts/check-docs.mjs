#!/usr/bin/env node
/**
 * Documentation guards. Deliberately cheap: this runs inside the existing
 * `check` step, so `npm test` covers it and there is no new command to learn or
 * forget. Two rules, both of which were broken today and were found by hand:
 *
 *   1. A markdown LINK in a tracked document must resolve. Only links, not
 *      backticked prose: prose legitimately names absent things ("the old
 *      `BUG_TRACKER.md` became ..."), and checking prose produced nothing but
 *      false positives. A link is a promise the reader can click.
 *
 *   2. The NEWEST changelog section's entries stay short. The owner's rule is
 *      that the changelog is an index of what changed, and an essay belongs in
 *      its own document. Only the newest section is checked, so the ~290 long
 *      entries already in the file stay untouched — they are history, and
 *      rewriting them is not this script's business.
 *
 * Nothing here reads the network or the git index, and nothing is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

/** Documents a reader is expected to follow links in. History is excluded, and
 *  that includes `CHANGELOG.md`: it is a dated record, and its 290 historical
 *  entries link to files that were legitimately deleted afterwards
 *  (`ROADMAP.md`, `docs/private/BUGS_TRACKER.md`, `tmp/` probes). Checking those
 *  would be permanent noise, and `BUG_REPORTS/**` / `docs/archive/**` are
 *  snapshots of their day for the same reason. The newest changelog section is
 *  still guarded — by its length, below. */
const LINK_DOCS = [
  'README.md',
  'AGENTS.md',
  'command.md',
  'OWNERSHIP_OVERVIEW.md',
  'ASSET_REGISTER.md',
  'THIRD_PARTY_NOTICES.md',
  'BUG_REPORTS/Readme.md',
];

/** The cap for one changelog entry. The newest section's entries today run
 *  255-332 characters; the file's historical average is 1 698. */
const MAX_ENTRY_CHARS = 400;

const problems = [];

/* --- 1. markdown links resolve ------------------------------------------- */

for (const doc of LINK_DOCS) {
  if (!existsSync(doc)) continue;
  const text = readFileSync(doc, 'utf8');
  const docDir = path.dirname(doc);

  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    if (!clean) continue;
    // Resolve the way a reader would: relative to the document that links.
    const resolved = path.resolve(REPO, docDir, clean);
    if (existsSync(resolved)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    problems.push(`${doc}:${line}  link does not resolve: ${target}`);
  }
}

/* --- 2. the newest changelog section stays concise ------------------------ */

const CHANGELOG = 'CHANGELOG.md';
if (existsSync(CHANGELOG)) {
  const lines = readFileSync(CHANGELOG, 'utf8').split('\n');
  const start = lines.findIndex((line) => /^##\s/.test(line));
  if (start === -1) {
    problems.push(`${CHANGELOG}  no version heading found`);
  } else {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^##\s/.test(line));
    const section = end === -1 ? rest : rest.slice(0, end);
    for (const line of section) {
      if (!line.startsWith('- **')) continue;
      if (line.length <= MAX_ENTRY_CHARS) continue;
      const title = line.slice(0, 60);
      problems.push(
        `${CHANGELOG}  entry is ${line.length} chars (max ${MAX_ENTRY_CHARS}): ${title}...`,
      );
    }
  }
}

if (problems.length === 0) {
  console.log(`Docs check passed: ${LINK_DOCS.length} documents linked clean, newest changelog section concise.`);
  process.exit(0);
}

console.error(`Docs check failed (${problems.length}):\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error(
  '\nA link must resolve, and a changelog entry is an index line — an essay belongs in docs/HANDOVER-*.md or docs/plans/*.md.',
);
process.exit(1);
