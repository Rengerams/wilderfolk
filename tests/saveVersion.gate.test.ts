/** Save compatibility policy: v0.6.5.0 upgrades through load migrations. */
import { describe, it, expect } from 'vitest';
import { GAME_VERSION } from '../src/game/version';
import { parseSaveJson } from '../src/game/saveLoad';

describe('save version gate', () => {
  it('accepts current version and v0.6.5.0 for migration', () => {
    for (const version of [GAME_VERSION, '0.6.5.0']) {
      expect(parseSaveJson(JSON.stringify({ _version: version, width: 160, height: 100 })).valid).toBe(true);
    }
  });

  it('refuses unsupported, future and malformed versions', () => {
    for (const version of ['0.6.4.0', '0.5.4', '9.9.9']) {
      expect(parseSaveJson(JSON.stringify({ _version: version })).valid).toBe(false);
    }
    expect(parseSaveJson('').valid).toBe(false);
  });
});
