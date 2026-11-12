#!/usr/bin/env node
/**
 * Documentation guards: required documents exist, their markdown links resolve, and the newest
 * changelog section's entries stay short. Read-only, no network, no git index.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

/** Documents whose markdown links must resolve. History is excluded (`CHANGELOG.md`, `BUG_REPORTS/**`,
 *  `docs/archive/**`): old links may point at files legitimately deleted afterwards. */
const LINK_DOCS = [
  'README.md',
  'AGENTS.md',
  'docs/command.md',
  'OWNERSHIP_OVERVIEW.md',
  'ASSET_REGISTER.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/bug_report/readme.md',
];

/** Cap for one newest-section changelog entry: 300 characters. */
const MAX_ENTRY_CHARS = 300;

/** File references require a known source/document extension. Bare slash-separated
 *  prose such as "Skip/restore" is not a path and must not fail documentation checks. */
const PATH_LIKE = /(?:[\w.-]+\/)*[\w.-]+\.(?:md|ts|tsx|mjs|mts|cjs|js|json|py|gd|yml|yaml|toml|html|css)\b/;

const problems = [];

/* --- 1. markdown links resolve ------------------------------------------- */

for (const doc of LINK_DOCS) {
  if (!existsSync(doc)) {
    problems.push(`${doc}  required document is missing`);
    continue;
  }
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
if (!existsSync(CHANGELOG)) {
  problems.push(`${CHANGELOG}  required document is missing`);
} else {
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
      const title = line.slice(0, 60);
      if (line.length > MAX_ENTRY_CHARS) {
        problems.push(
          `${CHANGELOG}  entry is ${line.length} chars (max ${MAX_ENTRY_CHARS}): ${title}...`,
        );
      }
      // A URL is a link home, not a file in this repository.
      if (!line.includes('://') && PATH_LIKE.test(line)) {
        const offending = line.match(PATH_LIKE)[0];
        problems.push(`${CHANGELOG}  entry names a file ("${offending}"): ${title}...`);
      }
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
  '\nA link must resolve, a required document must exist, and a changelog entry is an index line — an essay belongs in docs/HANDOVER-*.md or docs/plans/*.md.',
);
process.exit(1);
