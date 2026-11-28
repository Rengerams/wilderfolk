import test from 'node:test';
import assert from 'node:assert/strict';
import { getDecisionRows, renderDecisionTable, replaceGeneratedBlock, validateRegistry, validateEntrypointSymbols } from './ownership-registry.mjs';

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

test('a same-named function in another module cannot satisfy an ownership claim', () => {
  assert.equal(validateEntrypointSymbols([sample], [{ file: 'src/game/other.ts', name: 'advance' }]).length, 1);
  assert.deepEqual(validateEntrypointSymbols([sample], [{ file: 'src/game/sample.ts', name: 'advance' }]), []);
});

test('all live registry decisions carry explicit primary references', () => {
  const rows = getDecisionRows();
  assert.ok(rows.length > 50);
  assert.ok(rows.every(row => row.entrypoints.length > 0));
});
