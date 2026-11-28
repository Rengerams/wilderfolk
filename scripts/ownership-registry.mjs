/** Build-time ownership metadata: the registry is loaded as TypeScript, never parsed as prose. */
import { statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { SyntaxKind } from 'typescript/unstable/ast';
import { API, SignatureKind, TypeFlags } from 'typescript/unstable/sync';

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
    '| Decision | Primary and supporting functions | Cadence | Permitted writes | Scheduling | Tests |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const primary = row.entrypoints.map(({module, symbol}) => `${module}::${symbol}`).join('; ');
    const supporting = (row.supporting ?? []).map(({module, symbol}) => `${module}::${symbol}`).join('; ');
    const refs = supporting ? `${primary}; supporting: ${supporting}` : primary;
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
    for (const ref of [...(row.entrypoints ?? []), ...(row.supporting ?? [])]) {
      const qualified = `${ref.module}::${ref.symbol}`;
      if (!/^(src|scripts)\/[\w/.-]+\.tsx?$/.test(ref.module) || ref.module.split('/').includes('..') || !exists(path.join(root, ref.module))) {
        failures.push(`${row.key}: missing or invalid owner module ${ref.module}`);
      }
      if (!/^[A-Za-z_$][\w$]*(?:[.#][A-Za-z_$][\w$]*)?$/.test(ref.symbol)) failures.push(`${row.key}: invalid entrypoint symbol ${ref.symbol}`);
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

/** Enumerate declarations in their real lexical scope. Facade re-exports never own a decision. */
function directCallableCandidates(source, symbol) {
  const candidates = [];
  const member = /^([A-Za-z_$][\w$]*)([.#])([A-Za-z_$][\w$]*)$/.exec(symbol);
  const localNames = new Set([symbol]);
  const hasModifier = (node, kind) => {
    let present = false;
    node.forEachChild(child => { if (child.kind === kind) present = true; });
    return present;
  };
  if (symbol === 'default') {
    // Support a local declaration exported as default without treating an imported alias as an owner.
    source.forEachChild(node => {
      if (node.kind === SyntaxKind.ExportAssignment && !node.isExportEquals) {
        const expression = node.expression;
        if (expression.kind === SyntaxKind.Identifier) localNames.add(expression.getText());
        else if (expression.kind === SyntaxKind.FunctionExpression || expression.kind === SyntaxKind.ArrowFunction) candidates.push(expression);
      }
    });
  }
  source.forEachChild(node => {
    if (member) {
      if (node.kind !== SyntaxKind.ClassDeclaration || node.name?.getText() !== member[1]) return;
      node.forEachChild(child => {
        if (child.kind !== SyntaxKind.MethodDeclaration || !child.body || child.name?.getText() !== member[3]) return;
        if (hasModifier(child, SyntaxKind.StaticKeyword) === (member[2] === '.')) candidates.push(child.name);
      });
      return;
    }
    if (node.kind === SyntaxKind.FunctionDeclaration && node.body) {
      if (localNames.has(node.name?.getText()) || (symbol === 'default' && hasModifier(node, SyntaxKind.DefaultKeyword))) candidates.push(node.name ?? node);
    }
    if (node.kind === SyntaxKind.VariableStatement) {
      node.declarationList.forEachChild(declaration => {
        if (declaration.kind === SyntaxKind.VariableDeclaration && declaration.initializer && localNames.has(declaration.name.getText())) candidates.push(declaration.name);
      });
    }
  });
  return candidates;
}

/** Use the installed TS7 compiler's project AST and type checker, not graph-scanner guesses.
 * The contract names implementations, including private top-level functions, not export facades.
 * Class methods must use Class.method (static) or Class#method (instance).
 */
export function validateEntrypointSymbols(rows, root, resolved = new Map()) {
  const failures = [];
  const projects = new Map();
  for (const row of rows) {
    for (const ref of [...row.entrypoints, ...(row.supporting ?? []).map(ref => ({ ...ref, role: 'supporting' }))]) {
      const config = ref.module.startsWith('scripts/') ? 'tsconfig.scripts.json' : 'tsconfig.app.json';
      if (!projects.has(config)) projects.set(config, []);
      projects.get(config).push({ key: row.key, ...ref });
    }
  }
  for (const [config, refs] of projects) {
    const api = new API({ cwd: root });
    try {
      const snapshot = api.updateSnapshot({ openProject: config });
      try {
        const project = snapshot.getProjects()[0];
        if (!project) throw new Error(`No TypeScript project for ${config}`);
        for (const ref of refs) {
          const source = project.program.getSourceFile(path.resolve(root, ref.module));
          const candidates = source ? directCallableCandidates(source, ref.symbol) : [];
          const callable = candidates.filter(node => {
            const type = project.checker.getTypeAtLocation(node);
            return type && !(type.flags & TypeFlags.Any) && project.checker.getSignaturesOfType(type, SignatureKind.Call).length > 0;
          });
          if (callable.length !== 1) {
            failures.push(`${ref.key}: expected one callable primary implementation ${ref.module}::${ref.symbol}, found ${callable.length}`);
            continue;
          }
          const node = callable[0];
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          const name = node.kind === SyntaxKind.Identifier ? node.getText() : ref.symbol;
          const identity = `${ref.module}:${node.getStart(source)}`;
          if (resolved.has(identity)) {
            failures.push(`${ref.key}: declaration ${ref.module}:${line} already claimed by ${resolved.get(identity).key}`);
            continue;
          }
          resolved.set(identity, { key: ref.key, file: ref.module, symbol: ref.symbol, name, line, role: ref.role ?? 'primary' });
        }
      } finally {
        snapshot.dispose();
      }
    } finally {
      api.close();
    }
  }
  return failures;
}

/** Exact declaration lookup; neither method names nor module suffixes confer ownership. */
export function findVerifiedClaim(fn, claims, graphFunctions) {
  const matches = claims.filter(claim => {
    if (claim.file !== fn.file || claim.line !== fn.line || claim.name !== fn.name) return false;
    const member = /^([A-Za-z_$][\w$]*)([.#])([A-Za-z_$][\w$]*)$/.exec(claim.symbol);
    return member ? fn.className === member[1] && fn.isStatic === (member[2] === '.') : !fn.className;
  });
  if (matches.length !== 1) return undefined;
  const same = graphFunctions.filter(candidate => candidate.file === fn.file && candidate.line === fn.line && candidate.name === fn.name);
  return same.length === 1 ? matches[0] : undefined;
}

/** Explicit infrastructure contracts. Names include nested helpers, not anonymous callbacks.
 * The unstable compiler API is version-pinned; upgrading TypeScript requires rerunning these checks.
 */
const TOOLING_CONTRACTS = [
  [
    "Ownership registry tooling",
    "scripts/ownership-registry.mjs"
  ],
  [
    "Call graph ownership projection",
    "scripts/build-call-graph.mjs"
  ],
  [
    "Ownership registry tests",
    "scripts/ownership-registry.test.mjs"
  ],
  [
    "Ownership test runner",
    "scripts/test.mjs"
  ]
];

/** The source AST owns the inventory; documentation must name each declaration in its scope. */
export function validateToolingInventory(root, contracts = TOOLING_CONTRACTS) {
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProject: 'tsconfig.ownership.json' });
    try {
      const project = snapshot.getProjects()[0];
      const overview = readFileSync(path.join(root, 'OWNERSHIP_OVERVIEW.md'), 'utf8');
      const failures = [];
      for (const [label, file] of contracts) {
        const source = project?.program.getSourceFile(path.resolve(root, file));
        if (!source) {
          failures.push(`Missing tooling AST: ${file}`);
          continue;
        }
        const actual = [];
        const visit = (node, scope = '') => {
          let name;
          if (node.kind === SyntaxKind.FunctionDeclaration && node.body && node.name) name = node.name.getText();
          if (node.kind === SyntaxKind.VariableDeclaration && node.initializer && node.name.kind === SyntaxKind.Identifier) {
            const initializer = node.initializer;
            if (initializer.kind === SyntaxKind.ArrowFunction || initializer.kind === SyntaxKind.FunctionExpression) name = node.name.getText();
            else if (initializer.kind === SyntaxKind.CallExpression && initializer.expression.kind === SyntaxKind.ParenthesizedExpression) {
              // A closure-producing IIFE is a callable binding; a computed scalar is not.
              const type = project.checker.getTypeAtLocation(node.name);
              if (type && !(type.flags & TypeFlags.Any) && project.checker.getSignaturesOfType(type, SignatureKind.Call).length) name = node.name.getText();
            }
          }
          const qualified = name ? (scope ? `${scope}::${name}` : name) : scope;
          if (name) actual.push(qualified);
          node.forEachChild(child => visit(child, qualified));
        };
        visit(source);
        const names = actual.sort();
        const registrations = overview.split(/\r?\n/).filter(line => line.startsWith(`| ${label} |`));
        const cells = registrations.length === 1 ? registrations[0].split('|') : [];
        const documented = cells[2]?.trim() === '`' + file + '`' ?
          [...cells[4].matchAll(/`([A-Za-z_$][\w$]*(?:::[A-Za-z_$][\w$]*)*)`/g)].map(match => match[1]).sort() : [];
        if (cells[2]?.trim() !== '`' + file + '`' || JSON.stringify(names) !== JSON.stringify(documented)) {
          failures.push(`${file}: tooling ownership documentation mismatch: declared ${documented.join(', ')}; found ${names.join(', ')}`);
        }
      }
      return failures;
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
}

export function verifyOwnershipRegistry(rows, root, checkFreshness = true, resolved = new Map()) {
  const failures = [...validateDecisionKeys(rows), ...validateRegistry(rows, root)];
  if (failures.length) return failures;
  failures.push(...validateEntrypointSymbols(rows, root, resolved), ...validateToolingInventory(root));
  if (checkFreshness) {
    const current = readFileSync(path.join(root, 'OWNERSHIP_OVERVIEW.md'), 'utf8');
    if (replaceGeneratedBlock(current, renderDecisionTable(rows)) !== current) {
      failures.push('Generated ownership overview is stale. Run npm run ownership:generate.');
    }
  }
  return failures;
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
  const failures = verifyOwnershipRegistry(rows, root, mode === '--check');
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
