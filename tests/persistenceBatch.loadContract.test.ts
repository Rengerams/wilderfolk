/**
 * The load path's contract: what a refusal says, what a load may write, what the presence probe costs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import {
  buildSaveData,
  describeSaveReadFailure,
  hasSave,
  loadGameFromFileTextOutcome,
  loadGameFromParsedOutcome,
  parseSaveJson,
} from '../src/game/saveLoad';
import { loadAutoSavePreference, saveAutoSavePreference } from '../src/game/preferences';
import { resetSimRng } from '../src/game/simRng';
import { GAME_VERSION } from '../src/game/version';

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function memoryStorage(): MemoryStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

function stubSlot(raw: string | null): void {
  vi.stubGlobal('localStorage', {
    getItem: () => raw,
    setItem: () => {},
    removeItem: () => {},
  });
}

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

beforeEach(() => {
  resetSimRng();
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  resetSimRng();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a load adopts the saved auto-save setting without writing the browser preference', () => {
  it('leaves the player preference alone when the payload disagrees with it', () => {
    saveAutoSavePreference(true);
    const payload = realPayload();
    payload.autoSave = false;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.autoSave).toBe(false);
    expect(loadAutoSavePreference()).toBe(true);
  });

  it('leaves the preference alone when the restore is refused', () => {
    saveAutoSavePreference(false);
    const payload = realPayload();
    payload.autoSave = true;
    delete payload.researchNodes;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    expect(loadAutoSavePreference()).toBe(false);
  });
});

describe('the file path reports the refusal detail the slot path reports', () => {
  it('names the field that made a version-matching file unrestorable', () => {
    const payload = { _version: GAME_VERSION, entities: [], tick: 3 };

    const outcome = loadGameFromFileTextOutcome(JSON.stringify(payload));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('resources');
  });

  it('reports a damaged file with the read reason, not a bare failure', () => {
    const outcome = loadGameFromFileTextOutcome('{ not json');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('malformed');
  });
});

describe('a refusal message describes the cause it actually is', () => {
  it('calls valid JSON that is not a save a non-save, not invalid JSON', () => {
    const result = parseSaveJson('null');

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('not-a-save');
    expect(describeSaveReadFailure(result)).toContain('not a Wilderfolk save');
    expect(describeSaveReadFailure(result)).not.toContain('storage');
  });

  it('calls a JSON object with no version a non-save, not another build', () => {
    const result = parseSaveJson(JSON.stringify({ settlement: 'not ours' }));

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe('not-a-save');
    expect(describeSaveReadFailure(result)).toContain('not a Wilderfolk save');
    expect(describeSaveReadFailure(result)).not.toContain('different build');
  });

  it('still separates damaged JSON from a save of another build', () => {
    const malformed = parseSaveJson('{ not json');
    expect(malformed.valid).toBe(false);
    if (!malformed.valid) {
      expect(malformed.reason).toBe('malformed');
      expect(describeSaveReadFailure(malformed)).toContain('not valid JSON');
    }

    const otherBuild = parseSaveJson(JSON.stringify({ _version: '0.0.0-ancient' }));
    expect(otherBuild.valid).toBe(false);
    if (!otherBuild.valid) {
      expect(otherBuild.reason).toBe('version-mismatch');
      expect(describeSaveReadFailure(otherBuild)).toContain('different build');
    }
  });
});

describe('the entity index exists before every load-time pass that resolves an entity', () => {
  it('is rebuilt above each pass that looks an entity up by id', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/saveLoad.ts'), 'utf8');
    const indexAt = source.indexOf('rebuildEntityByIdMap(world);');
    expect(indexAt, 'the load no longer rebuilds the entity index').toBeGreaterThan(-1);

    for (const pass of [
      'migrateTickTimeline(world',
      'syncMoonHowlerForms(',
      'reconcileDanglingReferencesOnLoad(world);',
      'assignMissingResidences(',
      'assignMissingWorkers(',
      'repairJuvenileAssignmentsOnLoad(world);',
    ]) {
      const passAt = source.indexOf(pass);
      expect(passAt, `${pass} is gone`).toBeGreaterThan(-1);
      expect(indexAt, `${pass} runs before the index exists`).toBeLessThan(passAt);
    }
  });

  it('hands back an index over the loaded colony’s own entities', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const living = outcome.world.entities.filter((entity) => entity.alive);
    expect(living.length).toBeGreaterThan(0);
    for (const entity of living) {
      expect(outcome.world.entityById?.get(entity.id)).toBe(entity);
    }
  });
});

describe('the save-loadability probe validates the saved payload', () => {
  it('parses and validates the saved payload before reporting loadability', () => {
    resetSimRng();
    const world = initGame({ seed: 4242 });
    stubSlot(JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height))));
    const parse = vi.spyOn(JSON, 'parse');

    expect(hasSave()).toBe(true);
    expect(parse).toHaveBeenCalled();
    parse.mockRestore();
  });

  it('is false for an empty slot, false for another build, and true for this one', () => {
    stubSlot(null);
    expect(hasSave()).toBe(false);

    stubSlot(JSON.stringify({ _version: '0.0.0-ancient', entities: [] }));
    expect(hasSave()).toBe(false);

    stubSlot(JSON.stringify({ _version: GAME_VERSION, entities: [] }));
    expect(hasSave()).toBe(true);
  });
});
