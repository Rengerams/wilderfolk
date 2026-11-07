/**
 * Save refusals carry a typed cause (`reason` + `detail`) so the UI reports what actually failed;
 * these cases pin the five causes, their messages, and that a valid payload still parses.
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
    expect(describeSaveReadFailure(mismatch)).toContain('not supported');

    // A `_version` that is not a version at all is not a save of another build either.
    const odd = refusal(parseSaveJson(JSON.stringify({ _version: { build: 3 } })));
    expect(odd.reason).toBe('not-a-save');
    expect(odd.detail).toContain('object');
    expect(describeSaveReadFailure(odd)).not.toContain('[object Object]');
  });

  it('accepts saves from v0.6.5.0 and the current build', () => {
    expect(parseSaveJson(JSON.stringify({ _version: '0.6.5.0', entities: [], tick: 5 })).valid).toBe(true);
    const accepted = parseSaveJson(JSON.stringify({ _version: GAME_VERSION, entities: [], tick: 5 }));
    expect(accepted.valid).toBe(true);
    if (accepted.valid) expect(accepted.parsed.tick).toBe(5);
  });

  it('refuses a payload that is not a save object instead of throwing on _version (P-1)', () => {
    // `JSON.parse` accepts all of these, so a non-object payload is refused as `not-a-save`
    // rather than throwing on `_version` and escaping the file-load handler uncaught.
    for (const raw of ['null', '[]', '"x"', '123', 'true']) {
      const refused = refusal(parseSaveJson(raw));
      expect(refused.reason, raw).toBe('not-a-save');
      expect(refused.detail, raw).toBeTruthy();
    }

    // The detail says what the payload actually was, so the player can repeat it back.
    expect(refusal(parseSaveJson('null')).detail).toContain('null');
    expect(refusal(parseSaveJson('[]')).detail).toContain('array');
    // Valid JSON, so the refusal names it a non-save rather than claiming the JSON is damaged.
    expect(describeSaveReadFailure(refusal(parseSaveJson('123')))).toContain('not a Wilderfolk save');
  });
});
