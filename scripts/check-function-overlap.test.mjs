import test from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, lex, overlap, checkOverlaps } from './check-function-overlap.mjs';

function fact(file, source, digest = source) {
  const tokens = lex(source);
  return {
    fn: { file, name: 'evaluate', className: null, line: 1 },
    tokens,
    pairs: tokens.slice(1).map((token, i) => tokens[i] + '\u0000' + token),
    members: [...source.matchAll(/\.([\w$]+)/g)].map(x => x[1]),
    writes: [...source.matchAll(/\.([\w$]+)\s*=/g)].map(x => x[1]),
    called: [...source.matchAll(/\b([\w$]+)\s*\(/g)].map(x => x[1]),
    digest,
  };
}

test('diff additions and deletion-only changes both map to affected functions', () => {
  const ranges = changedLines('diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -2,1 +2,2 @@\n@@ -10,2 +11,0 @@\n');
  assert.deepEqual(ranges.get('src/a.ts'), [[2, 3], [11, 11]]);
});

test('renamed functions with identical behavior are flagged', () => {
  const left = fact('src/old.ts', 'function foo() { return state.people.filter(p => p.alive).length; }');
  const right = fact('src/new.ts', 'function bar() { return state.people.filter(p => p.alive).length; }');
  assert.ok(overlap(left, right) >= 0.82);
  assert.equal(checkOverlaps([left, right], [right], []).length, 1);
});

test('different reads and calculations are not automatically considered duplicates', () => {
  const left = fact('src/a.ts', 'return state.people.filter(p => p.alive).length;');
  const right = fact('src/b.ts', 'return state.animals.reduce((sum, a) => sum + a.hunger, 0);');
  assert.ok(overlap(left, right) < 0.82);
});

test('approvals require a concrete reason and tests and expire on either change', () => {
  const left = fact('src/a.ts', 'return player.energy + 1;');
  const right = fact('src/b.ts', 'return player.energy + 1;');
  const first = checkOverlaps([left, right], [right], []);
  assert.equal(first.length, 1);
  const approval = { key: first[0].key, reason: 'Separate boundary, intentionally identical behavior for a documented reason.', tests: ['tests/thing.test.ts'] };
  assert.equal(checkOverlaps([left, right], [right], [approval]).length, 0);
  assert.equal(checkOverlaps([left, right], [right], [{...approval, reason: 'ok'}]).length, 1);
  assert.equal(checkOverlaps([left, right], [right], [{...approval, tests: []}]).length, 1);
  right.digest = 'changed';
  assert.equal(checkOverlaps([left, right], [right], [approval]).length, 1);
});

test('unchanged legacy functions do not fail the incremental PR gate', () => {
  const left = fact('src/old.ts', 'return state.energy * 2;');
  assert.deepEqual(checkOverlaps([left], [], []), []);
});
