import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDecisionRows, renderDecisionTable, replaceGeneratedBlock, validateRegistry, validateEntrypointSymbols, validateDecisionKeys, parseOwnershipMode, findVerifiedClaim } from './ownership-registry.mjs';

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
  assert.ok(validateRegistry([sample], '/', () => false).some(message => message.includes('owner module')));
  assert.ok(validateRegistry([sample], '/', () => false).some(message => message.includes('test reference')));
  assert.ok(validateRegistry([sample, sample], '/', () => true).some(message => message.includes('Duplicate decision key')));
  assert.ok(validateRegistry([sample, { ...sample, key: 'other' }], '/', () => true).some(message => message.includes('primary entrypoint claimed')));
});

test('compiler verifies callable declarations in their owning module and scope', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wilderfolk-ownership-'));
  try {
    mkdirSync(path.join(root, 'src/game'), { recursive: true });
    writeFileSync(path.join(root, 'tsconfig.app.json'), JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler' },
      include: ['src/**/*.ts'],
    }));
    writeFileSync(path.join(root, 'src/game/sample.ts'), [
      'function advance() {}',
      'export const generated = () => advance();',
      'const notCallable = 42;',
      'function enclosing() { function nested() {} return nested; }',
      'export default function render() {}',
      'export class Owner { static work() {} rest() {} }',
      "export { elsewhere as alias } from './other';",
    ].join('\n'));
    writeFileSync(path.join(root, 'src/game/other.ts'), 'export function elsewhere() {}');
    const rows = ['advance', 'generated', 'default', 'Owner.work', 'Owner#rest', 'notCallable', 'nested', 'alias', 'elsewhere', 'Owner.rest'].map(symbol => ({
      ...sample, key: symbol, entrypoints: [{ ...sample.entrypoints[0], symbol }],
    }));
    const failures = validateEntrypointSymbols(rows, root);
    assert.deepEqual(failures.map(message => message.split(':')[0]), ['notCallable', 'nested', 'alias', 'elsewhere', 'Owner.rest']);
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
  const fn = { file: claim.file, name: claim.name, line: claim.line };
  assert.equal(findVerifiedClaim(fn, [claim], [fn]), claim);
  assert.equal(findVerifiedClaim({ ...fn, line: 13 }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim({ ...fn, file: 'src/other/sample.ts' }, [claim], [fn]), undefined);
  assert.equal(findVerifiedClaim(fn, [claim], [fn, { ...fn }]), undefined);
});
