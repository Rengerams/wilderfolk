/**
 * Save-refusal diagnostics (2026-09-16).
 *
 * Reported from play: “the savegame failed loading”, with no way to tell why. Every
 * cause used to collapse into the same `{ valid: false }`, and the UI then *guessed* —
 * “file may be corrupted” on one path, “Save from a different build” on the other — so a
 * player (and a developer) could not tell an empty slot from a truncated file from a
 * save written by another build, and the real cause was only visible in the console.
 *
 * These cases pin the four real causes, their player-facing messages, and the fact that
 * a valid payload still parses.
 */
import { describe, it, expect } from 'vitest';
import {
  describeSaveReadFailure,
  parseSaveJson,
  type SaveReadFailure,
  type SaveReadResult,
} from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';

/**
 * The refusal arm of `SaveReadResult`, annotated so the reason literals below are checked
 * against the owner's union instead of widening to `string`.
 */
function refusal(result: SaveReadResult): { reason: SaveReadFailure; detail?: string } {
  if (result.valid) throw new Error('expected a refused save');
  return { reason: result.reason, detail: result.detail };
}

describe('save refusal reasons', () => {
  it('names an empty payload and unreadable input instead of "corrupted"', () => {
    expect(refusal(parseSaveJson(null)).reason).toBe('empty');
    expect(refusal(parseSaveJson('')).reason).toBe('empty');
    expect(refusal(parseSaveJson('   ')).reason).toBe('empty');
    expect(describeSaveReadFailure({ reason: 'empty' })).toContain('No save data found');
    expect(describeSaveReadFailure({ reason: 'unreadable' })).toContain('Could not read');
  });

  it('names a damaged file and keeps the parser message as detail', () => {
    const truncated = refusal(parseSaveJson('{"_version":"0.6.4","entities":['));
    expect(truncated.reason).toBe('malformed');
    expect(truncated.detail).toBeTruthy();
    expect(describeSaveReadFailure(truncated)).toContain('not valid JSON');
  });

  it('names a version mismatch and reports both versions', () => {
    const mismatch = refusal(parseSaveJson(JSON.stringify({ _version: '0.5.0', entities: [] })));
    expect(mismatch.reason).toBe('version-mismatch');
    expect(mismatch.detail).toContain('0.5.0');
    expect(mismatch.detail).toContain(GAME_VERSION);
    expect(describeSaveReadFailure(mismatch)).toContain('different build');

    // A non-string version must not stringify as "[object Object]".
    const odd = refusal(parseSaveJson(JSON.stringify({ _version: { build: 3 } })));
    expect(odd.detail).toContain('unknown');
    expect(describeSaveReadFailure(odd)).not.toContain('[object Object]');
  });

  it('still accepts a payload written by this build', () => {
    const accepted = parseSaveJson(JSON.stringify({ _version: GAME_VERSION, entities: [], tick: 5 }));
    expect(accepted.valid).toBe(true);
    if (accepted.valid) expect(accepted.parsed.tick).toBe(5);
  });

  it('refuses a payload that is not a save object instead of throwing on _version (P-1)', () => {
    // `JSON.parse` returns these happily, and the old code read `_version` straight off the result:
    // `null` threw `TypeError: Cannot read properties of null`, which escaped the file-load event
    // handler (`App.handleLoadFromFile` has no try/catch) with no toast and no visible cause.
    for (const raw of ['null', '[]', '"x"', '123', 'true']) {
      const refused = refusal(parseSaveJson(raw));
      expect(refused.reason, raw).toBe('malformed');
      expect(refused.detail, raw).toBeTruthy();
    }

    // The detail says what the payload actually was, so the player can repeat it back.
    expect(refusal(parseSaveJson('null')).detail).toContain('null');
    expect(refusal(parseSaveJson('[]')).detail).toContain('array');
    expect(describeSaveReadFailure(refusal(parseSaveJson('123')))).toContain('damaged or truncated');
  });
});
