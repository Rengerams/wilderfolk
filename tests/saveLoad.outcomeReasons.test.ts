/**
 * A load attempt always says why it failed: `loadGameOutcome` owns the attempt and
 * `describeSaveLoadOutcome` is the one place its message lives; both App load paths read it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadGameOutcome,
  buildSaveData,
  describeSaveReadFailure,
  loadGameFromFileTextOutcome,
  parseSaveJson,
  loadGameFromParsed,
  loadGameFromParsedOutcome,
  hasSave,
  hasSaveSlot,
  describeSaveLoadOutcome,
} from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { loadAutoSavePreference, saveAutoSavePreference } from '../src/game/preferences';
import { resetSimRng } from '../src/game/simRng';
import { SAVE_FORMAT_VERSION } from '../src/game/saveSchema';
import { MapSize } from '../src/game/gameTypes';

function stubSlot(raw: string | null): void {
  vi.stubGlobal('localStorage', {
    getItem: () => raw,
    setItem: () => {},
    removeItem: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a load attempt always says why it failed', () => {
  it('names an empty slot', () => {
    stubSlot(null);
    const outcome = loadGameOutcome();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('empty');
    expect(describeSaveLoadOutcome(outcome)).toContain('No save data found');
  });

  it('separates damaged JSON from a save of another build', () => {
    stubSlot('{ not json');
    const malformed = loadGameOutcome();
    expect(malformed.ok).toBe(false);
    if (malformed.ok) return;
    expect(malformed.reason).toBe('malformed');
    expect(describeSaveLoadOutcome(malformed)).toContain('not valid JSON');

    stubSlot(JSON.stringify({ _version: '0.0.0-ancient' }));
    const wrongBuild = loadGameOutcome();
    expect(wrongBuild.ok).toBe(false);
    if (wrongBuild.ok) return;
    expect(wrongBuild.reason).toBe('version-mismatch');
    expect(describeSaveLoadOutcome(wrongBuild)).toContain('not supported');
  });

  it('has a message for a payload that parses but will not restore', () => {
    expect(describeSaveLoadOutcome({ reason: 'unrestorable' })).toContain('could not be restored');
  });

  it('blames the payload, not storage, when the slot holds a non-save value (P-1)', () => {
    // `readSavePayload` wraps `parseSaveJson`, which rejects a `null` payload as not-a-save rather
    // than letting its `TypeError` read as unreadable storage.
    stubSlot('null');
    const outcome = loadGameOutcome();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('not-a-save');
    expect(describeSaveLoadOutcome(outcome)).toContain('not a Wilderfolk save');
  });

  it('names the field that made a version-matching save unrestorable (P-1)', () => {
    // This payload survives the version gate but carries no `resources`; the restore reads
    // `resources.iron` with no default, so the outcome names `resources` in its detail.
    const payload = { _version: GAME_VERSION, entities: [], tick: 3 };
    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('resources');
    expect(describeSaveLoadOutcome(outcome)).toContain('resources');

    // The session-or-null wrapper keeps refusing the same payload, without throwing.
    expect(loadGameFromParsed(payload)).toBeNull();
  });

  it('reports a slot holding another build’s save as present, so Load can say why (P-2)', () => {
    stubSlot(JSON.stringify({ _version: '0.0.0-ancient', entities: [] }));

    // It does not load — and that is the whole signal `hasSave()` carries ...
    expect(hasSave()).toBe(false);
    expect(loadGameOutcome().ok).toBe(false);

    // ... while the slot is plainly occupied: `hasSaveSlot()` is true, so Load stays enabled and the
    // load path names the real cause.
    expect(hasSaveSlot()).toBe(true);

    stubSlot(null);
    expect(hasSaveSlot()).toBe(false);
  });
});

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

let cachedPayload: Record<string, unknown> | null = null;

function realPayload(): Record<string, unknown> {
  cachedPayload ??= buildPayload();
  return structuredClone(cachedPayload);
}

function buildPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

describe('persisted save load contract', () => {
beforeEach(() => {
  resetSimRng();
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  resetSimRng();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('game release version is separate from persisted save layout', () => {
  it('writes the format marker alongside the originating game version', () => {
    const payload = realPayload();
    expect(payload._version).toBe(GAME_VERSION);
    expect(payload._saveFormatVersion).toBe(SAVE_FORMAT_VERSION);
  });

  it('restores pre-marker saves from v0.6.5.0, v0.6.5.1 and v0.6.5.2', () => {
    for (const release of ['0.6.5.0', '0.6.5.1', '0.6.5.2']) {
      const payload = realPayload();
      delete payload._saveFormatVersion;
      payload._version = release;

      const loaded = loadGameFromFileTextOutcome(JSON.stringify(payload));
      expect(loaded.ok, `legacy game v${release}`).toBe(true);
    }
  });

  it('restores a newer game release if it still uses this exact format', () => {
    const payload = realPayload();
    payload._version = '0.6.5.9';
    const loaded = loadGameFromFileTextOutcome(JSON.stringify(payload));

    expect(loaded.ok).toBe(true);
  });

  it('refuses a new format even if its game version is unchanged', () => {
    const payload = realPayload();
    payload._saveFormatVersion = SAVE_FORMAT_VERSION + 1;
    const outcome = loadGameFromFileTextOutcome(JSON.stringify(payload));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('version-mismatch');
    expect(outcome.detail).toContain('save format');
  });
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
    payload.entities = null; // genuinely invalid mandatory container

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
      expect(describeSaveReadFailure(otherBuild)).toContain('not supported');
    }
  });
});

describe('the entity index exists before every load-time pass that resolves an entity', () => {


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
    const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
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

    stubSlot(JSON.stringify({ _version: GAME_VERSION, _saveFormatVersion: SAVE_FORMAT_VERSION, entities: [] }));
    expect(hasSave()).toBe(true);
  });
});
});
