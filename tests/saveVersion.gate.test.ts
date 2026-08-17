/**
 * Save version gate — beta policy (2026-08-16):
 * no historical-save compatibility. Only the exact current build's saves load;
 * anything else (older versions, unknown versions, corrupt JSON) is rejected.
 *
 * These tests pin the gate: the current GAME_VERSION must always be loadable
 * (no lost colonies on refresh), and any other version must be rejected.
 */
import { describe, it, expect } from 'vitest';
import { GAME_VERSION } from '../src/game/version';
import { parseSaveJson } from '../src/game/saveLoad';

describe('save version gate', () => {
  it('the current GAME_VERSION save loads — no lost colonies on refresh', () => {
    const save = JSON.stringify({ _version: GAME_VERSION, width: 160, height: 100 });
    expect(parseSaveJson(save).valid).toBe(true);
  });

  it('older saves are rejected (beta: no historical compatibility)', () => {
    for (const v of ['0.5.4', '0.5.2', '0.5.1', '0.5.0', '0.4.2']) {
      expect(parseSaveJson(JSON.stringify({ _version: v })).valid, v).toBe(false);
    }
  });

  it('unknown versions and empty input are still rejected', () => {
    expect(parseSaveJson(JSON.stringify({ _version: '9.9.9' })).valid).toBe(false);
    expect(parseSaveJson('').valid).toBe(false);
  });
});
