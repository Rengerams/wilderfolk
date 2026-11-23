/** The serialized save layout, not the application release, governs compatibility. */
import { describe, it, expect } from 'vitest';
import { GAME_VERSION } from '../src/game/version';
import { LEGACY_SAVE_GAME_VERSIONS, SAVE_FORMAT_VERSION } from '../src/game/saveSchema';
import { parseSaveJson } from '../src/game/saveLoad';

const parse = (version: unknown, format?: unknown) =>
  parseSaveJson(JSON.stringify({
    _version: version,
    ...(format === undefined ? {} : { _saveFormatVersion: format }),
    width: 160,
    height: 100,
  }));

describe('save format version gate', () => {
  it('accepts every explicitly supported pre-format-marker save, even after a game version bump', () => {
    for (const version of LEGACY_SAVE_GAME_VERSIONS) {
      expect(parse(version).valid, `legacy v${version}`).toBe(true);
    }
    expect(LEGACY_SAVE_GAME_VERSIONS).toContain('0.6.5.0');
    expect(LEGACY_SAVE_GAME_VERSIONS).toContain('0.6.5.1');
    expect(LEGACY_SAVE_GAME_VERSIONS).toContain('0.6.5.2');
  });

  it('accepts saves carrying the current format regardless of originating game release', () => {
    for (const version of [GAME_VERSION, '0.6.5.2', '0.6.5.9', '0.7.0.0']) {
      expect(parse(version, SAVE_FORMAT_VERSION).valid, `game v${version}`).toBe(true);
    }
    // Without an explicit format marker a future game release cannot claim legacy compatibility.
    expect(parse('0.6.5.9').valid).toBe(false);
  });

  it('refuses future, invalid, and unsupported format markers even if the game release matches', () => {
    for (const format of [0, SAVE_FORMAT_VERSION + 1, null, '1', -1]) {
      expect(parse(GAME_VERSION, format).valid, `format ${String(format)}`).toBe(false);
    }
  });

  it('refuses unsupported legacy game versions and malformed saves', () => {
    for (const version of ['0.6.4.0', '0.5.4', '9.9.9']) {
      expect(parse(version).valid).toBe(false);
    }
    expect(parseSaveJson('').valid).toBe(false);
    expect(parseSaveJson(JSON.stringify({ _saveFormatVersion: SAVE_FORMAT_VERSION })).valid).toBe(false);
  });
});
