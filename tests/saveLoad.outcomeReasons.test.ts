/**
 * A load attempt always says why it failed: `loadGameOutcome` owns the attempt and
 * `describeSaveLoadOutcome` is the one place its message lives; both App load paths read it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadGameOutcome,
  loadGameFromParsed,
  loadGameFromParsedOutcome,
  hasSave,
  hasSaveSlot,
  describeSaveLoadOutcome,
} from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';

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

  it('routes both App load paths through the owner, with no second copy of the message', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    // One slot loader, two entry points: `loadFromSlot` reads the owner and names the cause exactly
    // once, and the menu and the map-setup screen both go through it.
    expect(app, 'the shared slot loader is gone').toContain('const loadFromSlot = useCallback(');
    expect(
      app.match(/loadGameOutcome\(\)/g)?.length ?? 0,
      'the owner is read from more than one place',
    ).toBe(1);
    expect(
      app.match(/loadFromSlot\(\{/g)?.length ?? 0,
      'both entry points must load through the shared path',
    ).toBe(2);
    expect(app, 'a load path still calls the reason-discarding loader').not.toMatch(/loadGame\(\)/);
    expect(app, 'the unrestorable message is duplicated in the view').not.toContain('could not be restored');
  });
});
