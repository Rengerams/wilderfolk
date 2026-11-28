/** Build-time ownership metadata: the registry is loaded as TypeScript, never parsed as prose. */
import { statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const { SIMULATION_DECISIONS, DECISION_CADENCES, REQUIRED_DECISION_KEYS } = await tsImport('../src/game/simulation/decisionRegistry.ts', import.meta.url);

export function getDecisionRows() {
  return Object.entries(SIMULATION_DECISIONS).map(([key, row]) => ({ source: 'decisionRegistry.ts', key, ...row }));
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('|', '&#124;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '&#91;').replaceAll(']', '&#93;').replace(/\r?\n/g, ' ');
}

export function renderDecisionTable(rows) {
  const lines = [
    '<!-- BEGIN GENERATED SIMULATION OWNERSHIP -->',
    '## Current simulation decisions (generated)',
    '',
    'Generated from `src/game/simulation/decisionRegistry.ts`. Run `npm run ownership:generate` after changing the registry. Do not edit this block manually.',
    '',
    '| Decision | Primary entrypoints | Cadence | Permitted writes | Scheduling | Tests |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const refs = row.entrypoints.map(({module, symbol}) => `${module}::${symbol}`).join('; ');
    lines.push('| ' + [row.key, refs, row.cadence, row.writes.join('; ') || 'None', row.scheduledFrom, row.testFile].map(escapeCell).join(' | ') + ' |');
  }
  lines.push('', '<!-- END GENERATED SIMULATION OWNERSHIP -->');
  return lines.join('\n');
}

export function replaceGeneratedBlock(source, generated) {
  const start = source.indexOf('<!-- BEGIN GENERATED SIMULATION OWNERSHIP -->');
  const end = source.indexOf('<!-- END GENERATED SIMULATION OWNERSHIP -->');
  if (start < 0 && end < 0) {
    const headingEnd = source.indexOf('\n\n');
    if (headingEnd < 0) throw new Error('Missing ownership overview heading');
    return source.slice(0, headingEnd + 2) + generated + '\n\n' + source.slice(headingEnd + 2);
  }
  if (start < 0 || end < start || source.indexOf('<!-- BEGIN GENERATED SIMULATION OWNERSHIP -->', start+1) >= 0 || source.indexOf('<!-- END GENERATED SIMULATION OWNERSHIP -->', end+1) >= 0) {
    throw new Error('Invalid or duplicate generated ownership block');
  }
  return source.slice(0, start) + generated + source.slice(end + '<!-- END GENERATED SIMULATION OWNERSHIP -->'.length);
}

function isFile(file) {
  try { return statSync(file).isFile(); } catch { return false; }
}

export function validateDecisionKeys(rows, required = REQUIRED_DECISION_KEYS) {
  const actual = new Set(rows.map(row => row.key));
  const expected = new Set(required);
  return [
    ...required.filter(key => !actual.has(key)).map(key => `Missing required decision: ${key}`),
    ...[...actual].filter(key => !expected.has(key)).map(key => `Unknown decision: ${key}`),
  ];
}

export function validateRegistry(rows, root, exists = isFile) {
  const failures = [];
  const keys = new Set();
  const claimed = new Map();
  for (const row of rows) {
    if (keys.has(row.key)) failures.push(`Duplicate decision key: ${row.key}`);
    keys.add(row.key);
    if (!DECISION_CADENCES.includes(row.cadence)) failures.push(`${row.key}: invalid cadence ${row.cadence}`);
    if (!row.entrypoints?.length) failures.push(`${row.key}: missing primary entrypoint`);
    for (const ref of row.entrypoints ?? []) {
      const qualified = `${ref.module}::${ref.symbol}`;
      if (!/^(src|scripts)\/[\w/.-]+\.tsx?$/.test(ref.module) || ref.module.split('/').includes('..') || !exists(path.join(root, ref.module))) {
        failures.push(`${row.key}: missing or invalid owner module ${ref.module}`);
      }
      if (!/^[A-Za-z_$][\w$]*$/.test(ref.symbol)) failures.push(`${row.key}: invalid entrypoint symbol ${ref.symbol}`);
      if (claimed.has(qualified)) failures.push(`${qualified}: primary entrypoint claimed by ${claimed.get(qualified)} and ${row.key}`);
      claimed.set(qualified, row.key);
    }
    const tests = row.testFile.split(',').map(file => file.trim());
    if (!tests.length || tests.some(file => !/^(tests|scripts)\/[\w/.-]+\.(ts|mjs)$/.test(file) || file.split('/').includes('..') || !exists(path.join(root, file)))) {
      failures.push(`${row.key}: missing or invalid test reference(s): ${row.testFile}`);
    }
  }
  return failures;
}

export function validateEntrypointSymbols(rows, functions) {
  const available = new Set(functions.map(fn => `${fn.file}::${fn.name}`));
  return rows.flatMap(row => row.entrypoints.filter(ref => !available.has(`${ref.module}::${ref.symbol}`))
    .map(ref => `${row.key}: missing primary symbol ${ref.module}::${ref.symbol}`));
}

export function parseOwnershipMode(args) {
  if (args.length === 1 && (args[0] === '--write' || args[0] === '--check')) return args[0];
  throw new Error('Usage: node scripts/ownership-registry.mjs (--write | --check)');
}

function main() {
  const mode = parseOwnershipMode(process.argv.slice(2));
  const root = process.cwd();
  const file = path.join(root, 'OWNERSHIP_OVERVIEW.md');
  const current = readFileSync(file, 'utf8');
  const rows = getDecisionRows();
  const failures = [...validateDecisionKeys(rows), ...validateRegistry(rows, root)];
  if (failures.length) throw new Error(failures.join('\n'));
  const next = replaceGeneratedBlock(current, renderDecisionTable(rows));
  if (mode === '--write') {
    if (next !== current) writeFileSync(file, next);
  } else if (next !== current) {
    throw new Error('Generated ownership overview is stale. Run npm run ownership:generate.');
  }
  console.log(`Ownership registry: ${rows.length} decisions; generated overview is current.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
