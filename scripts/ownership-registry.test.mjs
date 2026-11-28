import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDecisionRows, renderDecisionTable, replaceGeneratedBlock, validateRegistry, validateEntrypointSymbols, validateDecisionKeys, parseOwnershipMode, findVerifiedClaim, validateToolingInventory } from './ownership-registry.mjs';

const sample = {
  key: 'sample',
  entrypoints: [{ module: 'src/game/sample.ts', symbol: 'advance' }],
  cadence: 'daily',
  writes: ['human.name'],
  scheduledFrom: "the settler's | scheduler",
  testFile: 'tests/sample.test.ts',
};

test('registry rows retain literal apostrophes and Markdown delimiters', () => {
  const block = renderDecisionTable([sample]);
  assert.ok(block.includes("the settler's &#124; scheduler"));
  const doc = '# Overview\n\nHistorical notes.\n';
  const next = replaceGeneratedBlock(doc, block);
  assert.ok(next.endsWith('Historical notes.\n'));
  assert.equal(replaceGeneratedBlock(next, block), next);
  assert.notEqual(replaceGeneratedBlock(next, renderDecisionTable([{ ...sample, cadence: 'realtime' }])), next);
  assert.throws(() => replaceGeneratedBlock(next + block, block), /duplicate/);
});

test('missing paths, duplicate decisions and conflicting primary claims fail', () => {
  assert.deepEqual(validateRegistry([sample], '/', () => true), []);
  for (const module of ['src/game/./sample.ts', 'src/game//sample.ts', 'src/game/../game/sample.ts']) {
    const alternate = { ...sample, key: 'alternate', entrypoints: [{ ...sample.entrypoints[0], module }] };
    assert.ok(validateRegistry([sample, alternate], '/', () => true).some(message => message.includes('invalid owner module')));
  }
  assert.ok(validateRegistry([sample], '/', () => false).some(message => message.includes('owner module')));
  assert.ok(validateRegistry([sample], '/', () => false).some(message => message.includes('test reference')));
  assert.ok(validateRegistry([sample, sample], '/', () => true).some(message => message.includes('Duplicate decision key')));
  assert.ok(validateRegistry([sample, { ...sample, key: 'other' }], '/', () => true).some(message => message.includes('primary entrypoint claimed')));
});

test('compiler verifies callable declarations in their owning module and scope', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wilderfolk-ownership-'));
  try {
    mkdirSync(path.join(root, 'src/game'), { recursive: true });
    writeFileSync(path.join(root, 'tsconfig.app.json'), JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler' },
      include: ['src/**/*.ts'],
    }));
    const source = [
      'function advance() {}',
      'export const generated = () => advance();',
      'const notCallable = 42;',
      'function enclosing() { function nested() {} return nested; }',
      'export default function render() {}',
      'export class Owner {',
      '  static work() {}',
      '  rest() {}',
      '}',
      "export { elsewhere as alias } from './other';",
      'const other = advance;',
      'const wrappedAlias = (advance);',
      'const memberAlias = Owner.work;',
      'const genuine = (function () {});',
      'const holder = { run() {}, inner: { go: () => 1 } };',
      'class Handler { task = () => 1; static work = () => 2; }',
      'const closureAlias = (() => advance)();',
    ].join('\n');
    writeFileSync(path.join(root, 'src/game/sample.ts'), source);
    writeFileSync(path.join(root, 'src/game/other.ts'), 'export function elsewhere() {}');
    const rows = ['advance', 'generated', 'default', 'Owner.work', 'Owner#rest', 'notCallable', 'nested', 'alias', 'elsewhere', 'Owner.rest', 'other', 'wrappedAlias', 'memberAlias', 'genuine', 'enclosing::nested', 'holder.run', 'holder.inner.go', 'Handler#task', 'Handler.work', 'closureAlias'].map(symbol => ({
      ...sample, key: symbol, entrypoints: [{ ...sample.entrypoints[0], symbol }],
    }));
    const resolved = new Map();
    const failures = validateEntrypointSymbols(rows, root, resolved);
    assert.deepEqual(failures.map(message => message.split(':')[0]), ['notCallable', 'nested', 'alias', 'elsewhere', 'Owner.rest', 'other', 'wrappedAlias', 'memberAlias', 'closureAlias']);
    const alternate = { ...sample, key: 'alternate', entrypoints: [{ module: 'src/game/./sample.ts', symbol: 'advance' }] };
    const pathClaims = new Map();
    assert.ok(validateEntrypointSymbols([sample, alternate], root, pathClaims).some(message => message.includes('noncanonical owner module')));
    assert.equal(pathClaims.size, 1);
    for (const symbol of ['genuine', 'enclosing::nested', 'holder.run', 'holder.inner.go', 'Handler#task', 'Handler.work']) {
      assert.ok([...resolved.values()].some(claim => claim.symbol === symbol), symbol);
    }
    // Exercise the real call-graph parser against the exact compiler declarations, not hand-built graph records.
    process.env.CALLGRAPH_LIB = '1';
    const { extractDefinitions, stripLiteralsAndComments } = await import('./build-call-graph.mjs');
    const definitions = extractDefinitions(stripLiteralsAndComments(source), source,
      path.resolve('src/game/sample.ts'), [{ name: 'Owner', bodyStart: 6, bodyEnd: 9 }]);
    const claims = [...resolved.values()];
    for (const symbol of ['Owner.work', 'Owner#rest']) {
      const claim = claims.find(ref => ref.symbol === symbol);
      assert.ok(claim, symbol);
      const fn = definitions.find(definition => definition.name === claim.name && definition.line === claim.line);
      assert.ok(fn, symbol);
      assert.equal(findVerifiedClaim(fn, claims, definitions), claim);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('all live registry decisions carry explicit primary references', () => {
  const rows = getDecisionRows();
  assert.ok(rows.length > 50);
  assert.ok(rows.every(row => row.entrypoints.length > 0));
});

test('CLI rejects omitted, unknown, repeated and conflicting modes', () => {
  assert.equal(parseOwnershipMode(['--write']), '--write');
  assert.equal(parseOwnershipMode(['--check']), '--check');
  for (const args of [[], ['--chek'], ['--write', '--check'], ['--check', '--check'], ['--write', 'extra']]) {
    assert.throws(() => parseOwnershipMode(args), /Usage:/);
  }
});

test('missing and renamed decision keys fail the independent key contract', () => {
  assert.deepEqual(validateDecisionKeys([sample], ['sample']), []);
  assert.deepEqual(validateDecisionKeys([], ['sample']), ['Missing required decision: sample']);
  assert.deepEqual(validateDecisionKeys([{ ...sample, key: 'renamed' }], ['sample']), [
    'Missing required decision: sample', 'Unknown decision: renamed',
  ]);
});

test('verified ownership matches an exact declaration, never an adjacent method or duplicate', () => {
  const claim = { file: 'src/game/sample.ts', symbol: 'Owner.work', name: 'work', line: 12, key: 'sample' };
  const fn = { file: claim.file, name: claim.name, line: claim.line, className: 'Owner', isStatic: true };
  assert.equal(findVerifiedClaim(fn, [claim], [fn]), claim);
  assert.equal(findVerifiedClaim({ ...fn, line: 13 }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim({ ...fn, isStatic: false }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim({ ...fn, className: 'Other' }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim({ ...fn, file: 'src/other/sample.ts' }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim(fn, [claim], [fn, { ...fn }]), undefined);
});

test('tooling inventory requires qualified nested names and ignores anonymous callbacks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wilderfolk-tooling-'));
  try {
    mkdirSync(path.join(root, 'scripts'));
    writeFileSync(path.join(root, 'tsconfig.ownership.json'), JSON.stringify({
      compilerOptions: { allowJs: true, noEmit: true }, include: ['scripts/*.mjs'],
    }));
    writeFileSync(path.join(root, 'scripts/sample.mjs'), [
      'function outer() {',
      '  const inner = () => 1;',
      '  return [1].map(value => value + inner());',
      '}',
      'function other() { function inner() {} inner(); }',
      'class Inventory { collect() {} static collect() {} }',
    ].join('\n'));
    const contract = { key: 'infrastructure:sample', label: 'Sample', module: 'scripts/sample.mjs', symbols: ['outer', 'outer::inner', 'other', 'other::inner', 'Inventory#collect', 'Inventory.collect'] };
    const resolved = new Map();
    const inventory = new Map();
    assert.deepEqual(validateToolingInventory(root, [contract], resolved, inventory), []);
    assert.equal(inventory.size, 6);
    assert.ok([...inventory.keys()].every(identity => resolved.has(identity)));
    writeFileSync(path.join(root, 'scripts/unregistered.mjs'), 'function unclaimed() {}');
    const expanded = new Map();
    const expandedClaims = new Map();
    assert.deepEqual(validateToolingInventory(root, [contract], expandedClaims, expanded), []);
    assert.deepEqual([...expanded.entries()].filter(([identity]) => !expandedClaims.has(identity)).map(([, declaration]) => declaration), [
      { file: 'scripts/unregistered.mjs', symbol: 'unclaimed', line: 1 },
    ]);
    assert.equal(resolved.size, 6);
    assert.ok(validateToolingInventory(root, [{ ...contract, symbols: contract.symbols.filter(symbol => symbol !== 'Inventory#collect') }]).some(message => message.includes('Inventory#collect: missing infrastructure claim')));
    assert.ok(validateToolingInventory(root, [{ ...contract, symbols: contract.symbols.filter(symbol => symbol !== 'Inventory.collect') }]).some(message => message.includes('Inventory.collect: missing infrastructure claim')));
    assert.ok(validateToolingInventory(root, [{ ...contract, module: 'scripts/./sample.mjs' }]).some(message => message.includes('invalid infrastructure module')));
    assert.ok([...resolved.values()].every(claim => claim.role === 'infrastructure'));
    assert.ok(validateToolingInventory(root, [{ ...contract, symbols: ['outer', 'inner', 'other'] }]).some(message => message.includes('missing infrastructure claim')));
    assert.ok(validateToolingInventory(root, [contract, { ...contract, key: 'infrastructure:duplicate' }]).some(message => message.includes('already claimed')));
    assert.ok(validateToolingInventory(root, [contract], resolved).some(message => message.includes('already claimed')));
    assert.ok(validateToolingInventory(root, [contract, { ...contract, module: 'scripts/missing.mjs' }]).some(message => message.includes('Duplicate infrastructure contract')));
    const generated = renderDecisionTable([sample], [contract]);
    assert.ok(generated.includes('outer::inner'));
    assert.notEqual(generated, renderDecisionTable([sample], [{ ...contract, symbols: ['outer'] }]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('supporting declarations cannot duplicate primary or other supporting claims', () => {
  const helper = { module: 'src/game/sample.ts', symbol: 'helper' };
  const first = { ...sample, supporting: [helper] };
  assert.deepEqual(validateRegistry([first], '/', () => true), []);
  assert.ok(validateRegistry([{ ...sample, supporting: [sample.entrypoints[0]] }], '/', () => true)
    .some(message => message.includes('claimed by')));
  const other = { ...sample, key: 'other', entrypoints: [{ ...helper, symbol: 'other' }], supporting: [helper] };
  assert.ok(validateRegistry([first, other], '/', () => true).some(message => message.includes('claimed by')));
});
