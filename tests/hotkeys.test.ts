/**
 * Build number keys must map to real BuildingType strings (not 0..8 indices).
 * Regression for House key `1` being falsy and crashing placement.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { BUILDING_HOTKEYS, HOTKEY_BUILDINGS } from '../src/game/hotkeys';

describe('HOTKEY_BUILDINGS', () => {
  it('key 1 is House string type (not numeric 0)', () => {
    expect(HOTKEY_BUILDINGS['1']).toBe(BuildingType.House);
    expect(HOTKEY_BUILDINGS['1']).toBe('house');
    // Falsy check that broke keyboard: number 0 is falsy; string 'house' is not
    expect(Boolean(HOTKEY_BUILDINGS['1'])).toBe(true);
  });

  it('maps 1–9 to configs that exist as BuildingType values', () => {
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const t = HOTKEY_BUILDINGS[key];
      expect(typeof t).toBe('string');
      expect(BUILDING_HOTKEYS[t]).toBe(key);
    }
  });
});
