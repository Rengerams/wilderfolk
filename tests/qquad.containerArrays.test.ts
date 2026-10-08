/** Scratch: which corrupted container arrays reach the UI as raw engine text. */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

afterEach(() => {
  resetSimRng();
});

describe('scratch', () => {
  it('lists every array-valued key in a real payload', () => {
    const payload = realPayload();
    const keys: string[] = [];
    for (const key of WORLD_STATE_SAVE_KEYS) {
      if (Array.isArray(payload[key])) keys.push(key);
    }
    console.log('ARRAY KEYS:', keys.join(', '));
    const objKeys: string[] = [];
    for (const key of WORLD_STATE_SAVE_KEYS) {
      const v = payload[key];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) objKeys.push(key);
    }
    console.log('OBJECT KEYS:', objKeys.join(', '));
    expect(keys.length).toBeGreaterThan(0);
  });

  it('reports what each corrupted array key does', () => {
    const lines: string[] = [];
    for (const key of WORLD_STATE_SAVE_KEYS) {
      const base = realPayload();
      if (!Array.isArray(base[key])) continue;
      for (const bad of ['not-an-array'] as const) {
        const payload = realPayload();
        payload[key] = bad;
        let text: string;
        const outcome = loadGameFromParsedOutcome(payload);
        if (outcome.ok) text = 'LOADED-OK';
        else text = `${outcome.reason}: ${outcome.detail}`;
        lines.push(`${key} <- "not-an-array" => ${text}`);
      }
    }
    console.log('CORRUPTIONS:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('reports what each nulled array key does', () => {
    const lines: string[] = [];
    for (const key of WORLD_STATE_SAVE_KEYS) {
      const base = realPayload();
      if (!Array.isArray(base[key])) continue;
      const payload = realPayload();
      payload[key] = null;
      const outcome = loadGameFromParsedOutcome(payload);
      lines.push(`${key} <- null => ${outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`}`);
    }
    console.log('NULLS:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('reports non-object elements in each array key', () => {
    const lines: string[] = [];
    for (const key of WORLD_STATE_SAVE_KEYS) {
      const base = realPayload();
      if (!Array.isArray(base[key])) continue;
      const list = base[key] as unknown[];
      if (list.length === 0) {
        lines.push(`${key} => (empty in fixture)`);
        continue;
      }
      const payload = realPayload();
      const plist = payload[key] as unknown[];
      plist[0] = null;
      const outcome = loadGameFromParsedOutcome(payload);
      lines.push(`${key}[0]=null => ${outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`}`);
    }
    console.log('ELEMENTS:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });
});
