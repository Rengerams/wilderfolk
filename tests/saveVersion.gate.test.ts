/**
 * Regression: the v0.5.3 version bump never added '0.5.3' to
 * COMPATIBLE_SAVE_VERSIONS — the game wrote saves tagged `_version: '0.5.3'`
 * that parseSaveJson then rejected, so a save made in the current build could
 * never be loaded (colony lost on refresh).
 *
 * These tests pin the gate: the current GAME_VERSION must always be loadable,
 * and the parser must keep accepting older saves.
 */
import { describe, it, expect } from 'vitest';
import { GAME_VERSION } from '../src/game/version';
import { parseSaveJson } from '../src/game/saveLoad';

describe('save version gate', () => {
  it('the current GAME_VERSION save loads — no lost colonies on refresh', () => {
    const save = JSON.stringify({ _version: GAME_VERSION, width: 160, height: 100 });
    expect(parseSaveJson(save).valid).toBe(true);
  });

  it('recent older saves still load', () => {
    for (const v of ['0.5.2', '0.5.1', '0.5.0', '0.4.2']) {
      expect(parseSaveJson(JSON.stringify({ _version: v })).valid, v).toBe(true);
    }
  });

  it('unknown versions are still rejected', () => {
    expect(parseSaveJson(JSON.stringify({ _version: '9.9.9' })).valid).toBe(false);
    expect(parseSaveJson('').valid).toBe(false);
  });
});
