/** Build-time ownership metadata: the registry is loaded as TypeScript, never parsed as prose. */
import { statSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { SyntaxKind } from 'typescript/unstable/ast';
import { API, SignatureKind, TypeFlags } from 'typescript/unstable/sync';

const { SIMULATION_DECISIONS, DECISION_CADENCES, REQUIRED_DECISION_KEYS } = await tsImport('../src/game/simulation/decisionRegistry.ts', import.meta.url);

export function getDecisionRows() {
  return Object.entries(SIMULATION_DECISIONS).map(([key, row]) => ({ source: 'decisionRegistry.ts', key, ...row }));
}

/** Read-only projection of explicit infrastructure contracts for the call graph. */
export function getInfrastructureRows() {
  return TOOLING_CONTRACTS.map(contract => ({
    source: 'infrastructureManifest',
    key: contract.key,
    owner: contract.module + ' — ' + contract.label,
    entryFunctionsCell: contract.symbols.join(', '),
    writes: [],
  }));
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('|', '&#124;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('[', '&#91;').replaceAll(']', '&#93;').replace(/\r?\n/g, ' ');
}

export function renderDecisionTable(rows, contracts = TOOLING_CONTRACTS) {
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
  lines.push('', ...["## Ownership infrastructure (generated)","","Explicit infrastructure claims share the compiler declaration ledger with gameplay decisions. Named nested helpers are qualified; anonymous callbacks are excluded. Embedded browser viewer code is owned by `renderHtml` and is not part of the outer JavaScript AST.","","| Responsibility | Sole owner | Named declarations |","|---|---|---|"]);
  for (const contract of contracts) {
    lines.push('| ' + [contract.label, contract.module, contract.symbols.join('; ') || 'None — anonymous test callbacks only'].map(escapeCell).join(' | ') + ' |');
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

/** Reject redundant segments and non-portable spellings before compiler lookup. */
function isCanonicalModulePath(file) {
  return typeof file === 'string' && !file.includes('\\') &&
    path.posix.normalize(file) === file && !file.split('/').some(part => part === '.' || part === '..' || !part);
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
      if (!/^(src|scripts)\/[\w/.-]+\.tsx?$/.test(ref.module) || !isCanonicalModulePath(ref.module) || !exists(path.join(root, ref.module))) {
        failures.push(`${row.key}: missing or invalid owner module ${ref.module}`);
      }
      if (!/^[A-Za-z_$][\w$]*(?:(?:::|[.#])(?:get:|set:)?#?[A-Za-z_$][\w$]*)*$/.test(ref.symbol)) failures.push(`${row.key}: invalid entrypoint symbol ${ref.symbol}`);
      if (claimed.has(qualified)) failures.push(`${qualified}: primary entrypoint claimed by ${claimed.get(qualified)} and ${row.key}`);
      claimed.set(qualified, row.key);
    }
    const tests = row.testFile.split(',').map(file => file.trim());
    if (!tests.length || tests.some(file => !/^(tests|scripts)\/[\w/.-]+\.(ts|mjs)$/.test(file) || !isCanonicalModulePath(file) || !exists(path.join(root, file)))) {
      failures.push(`${row.key}: missing or invalid test reference(s): ${row.testFile}`);
    }
  }
  return failures;
}

function hasModifier(node, kind) {
  let present = false;
  node.forEachChild(child => { if (child.kind === kind) present = true; });
  return present;
}

/** Only an actual function body is a local implementation; wrappers around a reference are not. */
function directFunctionImplementation(node) {
  while (node?.kind === SyntaxKind.ParenthesizedExpression) node = node.expression;
  return node?.kind === SyntaxKind.ArrowFunction || node?.kind === SyntaxKind.FunctionExpression ? node : undefined;
}

/** Resolve named declarations from the shared inventory, including a local default-export alias. */
function directCallableCandidates(source, symbol, inventory) {
  if (symbol !== 'default') return inventory.get(symbol) ?? [];
  const candidates = new Set(inventory.get('default') ?? []);
  source.forEachChild(node => {
    if (node.kind === SyntaxKind.FunctionDeclaration && node.body && node.name && hasModifier(node, SyntaxKind.DefaultKeyword)) {
      for (const candidate of inventory.get(node.name.getText()) ?? []) candidates.add(candidate);
    }
    if (node.kind === SyntaxKind.ExportAssignment && !node.isExportEquals && node.expression.kind === SyntaxKind.Identifier) {
      for (const candidate of inventory.get(node.expression.getText()) ?? []) candidates.add(candidate);
    }
  });
  return [...candidates];
}

/** Record the exact compiler declaration once, across gameplay and infrastructure contracts. */
function declarationLocation(source, node, root) {
  const offset = node.getStart(source);
  const line = source.getLineAndCharacterOfPosition(offset).line + 1;
  const canonicalFile = realpathSync.native(source.fileName);
  const module = path.relative(realpathSync.native(root), canonicalFile).replaceAll('\\', '/');
  return { identity: `${canonicalFile}:${offset}`, module, line };
}

function recordResolvedClaim(resolved, failures, ref, source, node, root) {
  const { identity, module, line } = declarationLocation(source, node, root);
  const name = node.kind === SyntaxKind.Identifier ? node.getText() : ref.symbol;
  if (module !== ref.module) {
    failures.push(`${ref.key}: noncanonical owner module ${ref.module}; use ${module}`);
    return;
  }
  if (resolved.has(identity)) {
    failures.push(`${ref.key}: declaration ${ref.module}:${line} already claimed by ${resolved.get(identity).key}`);
    return;
  }
  resolved.set(identity, { key: ref.key, file: module, symbol: ref.symbol, name, line, role: ref.role ?? 'primary' });
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
      if (!isCanonicalModulePath(ref.module)) {
        failures.push(`${row.key}: noncanonical owner module ${ref.module}`);
        continue;
      }
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
        const inventories = new Map();
        for (const ref of refs) {
          const source = project.program.getSourceFile(path.resolve(root, ref.module));
          if (source && !inventories.has(ref.module)) {
            inventories.set(ref.module, collectNamedDeclarations(source, project.checker, false));
          }
          const candidates = source ? directCallableCandidates(source, ref.symbol, inventories.get(ref.module)) : [];
          const callable = candidates.filter(node => {
            const type = project.checker.getTypeAtLocation(node);
            return type && !(type.flags & TypeFlags.Any) && project.checker.getSignaturesOfType(type, SignatureKind.Call).length > 0;
          });
          if (callable.length !== 1) {
            failures.push(`${ref.key}: expected one callable primary implementation ${ref.module}::${ref.symbol}, found ${callable.length}`);
            continue;
          }
          recordResolvedClaim(resolved, failures, ref, source, callable[0], root);
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

/** Explicit infrastructure claims; the generated overview is their projection, not authority. */
const TOOLING_CONTRACTS = [
  {
    "key": "infrastructure:ownership-registry",
    "label": "Ownership registry tooling",
    "module": "scripts/ownership-registry.mjs",
    "symbols": [
      "getDecisionRows",
      "getInfrastructureRows",
      "escapeCell",
      "renderDecisionTable",
      "replaceGeneratedBlock",
      "isFile",
      "isCanonicalModulePath",
      "validateDecisionKeys",
      "validateRegistry",
      "hasModifier",
      "directFunctionImplementation",
      "directCallableCandidates",
      "declarationLocation",
      "recordResolvedClaim",
      "validateEntrypointSymbols",
      "findVerifiedClaim",
      "collectNamedDeclarations",
      "collectNamedDeclarations::visit",
      "validateToolingInventory",
      "verifyOwnershipRegistry",
      "parseOwnershipMode",
      "main"
    ]
  },
  {
    "key": "infrastructure:call-graph",
    "label": "Call graph ownership projection",
    "module": "scripts/build-call-graph.mjs",
    "symbols": [
      "collectSources",
      "stripLiteralsAndComments",
      "stripLiteralsAndComments::blank",
      "lineOf",
      "matchBrace",
      "resolveModuleFile",
      "extractImports",
      "extractImports::resolve",
      "extractReExports",
      "findBodyBrace",
      "bodyAfterSignatureBrace",
      "extractClasses",
      "parseParams",
      "extractInstances",
      "extractDefinitions",
      "extractCalls",
      "parseOwnershipOverview",
      "modulesIn",
      "main",
      "main::resolveImportTarget",
      "main::resolveThroughModule",
      "main::resolveMethod",
      "main::ownerOfLine",
      "main::moduleOwnsFile",
      "renderHtml"
    ]
  },
  {
    "key": "infrastructure:ownership-tests",
    "label": "Ownership registry tests",
    "module": "scripts/ownership-registry.test.mjs",
    "symbols": []
  },
  {
    "key": "infrastructure:test-runner",
    "label": "Ownership test runner",
    "module": "scripts/test.mjs",
    "symbols": [
      "run"
    ]
  },
  {
    "key": "infrastructure:decision-registry",
    "label": "Decision registry verification utilities",
    "module": "src/game/simulation/decisionRegistry.ts",
    "symbols": [
      "getDecisionsByCadence",
      "isPropertyWritePermitted"
    ]
  }
];

/** One compiler inventory for named implementations, including lexical and member scope.
 * Anonymous inline callbacks are not independent ownership declarations.
 */
function collectNamedDeclarations(source, checker, includeClosureBindings = true) {
  const actual = new Map();
  const visit = (node, scope = '', ownerKind = '') => {
    if ((node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) && node.name) {
      const className = node.name.getText();
      const qualifiedClass = scope ? `${scope}::${className}` : className;
      node.forEachChild(child => visit(child, qualifiedClass, 'class'));
      return;
    }
    let name;
    let nameNode = node.name;
    let member = false;
    let implementation;
    const method = [SyntaxKind.MethodDeclaration, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor].includes(node.kind) && node.body && node.name;
    if (method) {
      const prefix = node.kind === SyntaxKind.GetAccessor ? 'get:' : node.kind === SyntaxKind.SetAccessor ? 'set:' : '';
      name = prefix + node.name.getText();
      member = ownerKind !== '';
    }
    if (ownerKind === 'class' && node.kind === SyntaxKind.Constructor && node.body) {
      name = 'constructor';
      nameNode = node;
      member = true;
    }
    if ((node.kind === SyntaxKind.FunctionDeclaration || node.kind === SyntaxKind.FunctionExpression) && node.body) {
      name = node.name?.getText() ?? (hasModifier(node, SyntaxKind.DefaultKeyword) ? 'default' : undefined);
      nameNode = node.name ?? node;
    }
    if (node.kind === SyntaxKind.ExportAssignment && !node.isExportEquals) {
      implementation = directFunctionImplementation(node.expression);
      if (implementation) {
        name = 'default';
        nameNode = implementation;
      }
    }
    if ((node.kind === SyntaxKind.VariableDeclaration || node.kind === SyntaxKind.PropertyDeclaration ||
         node.kind === SyntaxKind.PropertyAssignment) && node.initializer && node.name) {
      let initializer = node.initializer;
      while (initializer.kind === SyntaxKind.ParenthesizedExpression) initializer = initializer.expression;
      implementation = directFunctionImplementation(initializer);
      if (implementation) {
        name = node.name.getText();
        member = node.kind !== SyntaxKind.VariableDeclaration && ownerKind !== '';
      } else if (initializer.kind === SyntaxKind.ObjectLiteralExpression || initializer.kind === SyntaxKind.ClassExpression) {
        const separator = node.kind !== SyntaxKind.VariableDeclaration && ownerKind
          ? (ownerKind === 'class' && !hasModifier(node, SyntaxKind.StaticKeyword) ? '#' : '.')
          : '::';
        const qualifiedObject = scope ? `${scope}${separator}${node.name.getText()}` : node.name.getText();
        initializer.forEachChild(child => visit(child, qualifiedObject, initializer.kind === SyntaxKind.ClassExpression ? 'class' : 'object'));
        return;
      } else if (includeClosureBindings && node.kind === SyntaxKind.VariableDeclaration && initializer.kind === SyntaxKind.CallExpression) {
        // Only a locally returned function literal establishes an IIFE implementation. Returning
        // an existing callable binding is an alias, not a second owner.
        const factory = directFunctionImplementation(initializer.expression);
        if (factory) {
          let returnedImplementation = Boolean(directFunctionImplementation(factory.body));
          if (factory.body.kind === SyntaxKind.Block) {
            factory.body.forEachChild(child => {
              if (child.kind === SyntaxKind.ReturnStatement && directFunctionImplementation(child.expression)) returnedImplementation = true;
            });
          }
          if (returnedImplementation) {
            const type = checker.getTypeAtLocation(node.name);
            if (type && !(type.flags & TypeFlags.Any) && checker.getSignaturesOfType(type, SignatureKind.Call).length) name = node.name.getText();
          }
        }
      }
    }
    if (node.kind === SyntaxKind.BinaryExpression && node.operatorToken.kind === SyntaxKind.EqualsToken &&
        (node.left.kind === SyntaxKind.Identifier || node.left.kind === SyntaxKind.PropertyAccessExpression)) {
      implementation = directFunctionImplementation(node.right);
      if (implementation) {
        name = node.left.getText();
        nameNode = node.left.kind === SyntaxKind.PropertyAccessExpression ? node.left.name : node.left;
      }
    }
    const qualified = name
      ? (member ? `${scope}${ownerKind === 'class' && !hasModifier(node, SyntaxKind.StaticKeyword) ? '#' : '.'}${name}`
        : scope ? `${scope}::${name}` : name)
      : scope;
    if (name) {
      if (!actual.has(qualified)) actual.set(qualified, []);
      actual.get(qualified).push(nameNode);
    }
    // A named function expression assigned to a binding has one canonical binding identity.
    // Traverse its children, not the expression root again.
    if (implementation) implementation.forEachChild(child => visit(child, qualified));
    else node.forEachChild(child => visit(child, qualified));
  };
  visit(source);
  return actual;
}

/** Verify every named declaration in each registered infrastructure module using the shared ledger. */
export function validateToolingInventory(root, contracts = TOOLING_CONTRACTS, resolved = new Map(), inventory = null) {
  const api = new API({ cwd: root });
  try {
    const snapshot = api.updateSnapshot({ openProject: 'tsconfig.ownership.json' });
    try {
      const project = snapshot.getProjects()[0];
      const failures = [];
      const grouped = new Map();
      const keys = new Set();
      for (const contract of contracts) {
        if (keys.has(contract.key)) failures.push(`Duplicate infrastructure contract: ${contract.key}`);
        keys.add(contract.key);
        const file = contract.module;
        if (!/^(src|scripts|tests)\/[\w/.-]+\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(file) ||
            !isCanonicalModulePath(file) || !isFile(path.join(root, file))) {
          failures.push(`${contract.key}: missing or invalid infrastructure module ${file}`);
          continue;
        }
        if (!grouped.has(file)) grouped.set(file, []);
        grouped.get(file).push(contract);
      }
      for (const [file, owners] of grouped) {
        const source = project?.program.getSourceFile(path.resolve(root, file));
        if (!source) {
          failures.push(`Missing tooling AST: ${file}`);
          continue;
        }
        const actual = collectNamedDeclarations(source, project.checker);
        for (const contract of owners) {
          for (const symbol of contract.symbols) {
            const nodes = actual.get(symbol) ?? [];
            if (nodes.length !== 1) {
              failures.push(`${contract.key}: expected one infrastructure declaration ${file}::${symbol}, found ${nodes.length}`);
              continue;
            }
            recordResolvedClaim(resolved, failures, { key: contract.key, module: file, symbol, role: 'infrastructure' }, source, nodes[0], root);
          }
        }
        for (const [symbol, nodes] of actual) {
          if (nodes.some(node => !resolved.has(declarationLocation(source, node, root).identity))) {
            failures.push(`${file}::${symbol}: missing infrastructure claim`);
          }
        }
      }
      if (inventory) {
        for (const filename of project.program.getRootFileNames()) {
          const module = path.relative(root, filename).replaceAll('\\', '/');
          if (!/^(src|scripts|tests)\//.test(module) || /\.d\.ts$/.test(module)) continue;
          const source = project.program.getSourceFile(filename);
          if (!source) {
            failures.push(`Missing inventory AST: ${module}`);
            continue;
          }
          for (const [symbol, nodes] of collectNamedDeclarations(source, project.checker)) {
            for (const node of nodes) {
              const location = declarationLocation(source, node, root);
              if (inventory.has(location.identity)) continue;
              inventory.set(location.identity, { file: location.module, symbol, line: location.line });
            }
          }
        }
      }
      return failures;
    } finally { snapshot.dispose(); }
  } finally { api.close(); }
}

export function verifyOwnershipRegistry(rows, root, checkFreshness = true, resolved = new Map(), inventory = null) {
  const failures = [...validateDecisionKeys(rows), ...validateRegistry(rows, root)];
  if (failures.length) return failures;
  failures.push(...validateEntrypointSymbols(rows, root, resolved), ...validateToolingInventory(root, TOOLING_CONTRACTS, resolved, inventory));
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
