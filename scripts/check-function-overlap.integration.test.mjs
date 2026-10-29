import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCANNER = fileURLToPath(new URL('./check-function-overlap.mjs', import.meta.url));

function runCase(t, candidate) {
  const root = mkdtempSync(path.join(tmpdir(), 'wilderfolk-semantic-e2e-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'src/game'), { recursive: true });
  mkdirSync(path.join(root, 'docs/tools'), { recursive: true });
  const baseline = [
    'export function countAlive(state: { people: { alive: boolean }[] }): number {',
    '  return state.people.filter(p => p.alive).length;',
    '}',
    '',
  ].join('\n');
  const original = {
    file: 'src/game/original.ts',
    name: 'countAlive',
    line: 1,
    bodyStart: 1,
    bodyEnd: 3,
    className: null,
  };
  const peer = {
    ...original,
    file: 'src/game/newFunction.ts',
    name: 'countLiving',
    bodyEnd: candidate.trimEnd().split('\n').length,
  };
  const writeGraph = (functionsList) => writeFileSync(
    path.join(root, 'docs/tools/call-graph.json'),
    JSON.stringify({ functions: functionsList }),
  );
  writeFileSync(path.join(root, original.file), baseline);
  writeFileSync(path.join(root, 'docs/tools/semantic-overlap-reviewed.json'), JSON.stringify({ approvals: [] }));
  writeGraph([original]);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'semantic-gate@example.invalid');
  git('config', 'user.name', 'Wilderfolk E2E');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  writeFileSync(path.join(root, peer.file), candidate);
  writeGraph([original, peer]);
  return spawnSync(process.execPath, [SCANNER, '--base', 'HEAD'], { cwd: root, encoding: 'utf8' });
}

test('real git PR-gate rejects an untracked newly introduced duplicate', t => {
  const result = runCase(t, [
    'export function countLiving(state: { people: { alive: boolean }[] }): number {',
    '  return state.people.filter(p => p.alive).length;',
    '}',
    '',
  ].join('\n'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /1 modified functions \/ 2 indexed \/ 1 unresolved matches/);
  assert.match(result.stderr, /POSSIBLE OVERLAP/);
});

test('real git PR-gate permits a truly unrelated new function', t => {
  const result = runCase(t, [
    'export function countLiving(state: { animals: number }): number {',
    '  return state.animals * 7 + 13;',
    '}',
    '',
  ].join('\n'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /1 modified functions \/ 2 indexed \/ 0 unresolved matches/);
});

test('real git PR-gate is strict for different thresholds but offers review', t => {
  const result = runCase(t, [
    'export function countLiving(state: { people: { alive: boolean }[] }): number {',
    '  return state.people.filter(p => !p.alive).length;',
    '}',
    '',
  ].join('\n'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /POSSIBLE OVERLAP/);
});
