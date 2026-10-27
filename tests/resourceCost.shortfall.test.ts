/**
 * `missingResourceCost` — the cost owner's "what is still short", added so the build catalogue can
 * disable an unaffordable tile and name the shortfall instead of letting it be selected and then
 * refused at the map (F-IX-9).
 */
import { describe, expect, it } from 'vitest';
import { canAffordResourceCost, missingResourceCost } from '../src/game/resourceCost';

const empty = { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 };

describe('missingResourceCost', () => {
  it('is empty when the resources already cover the cost', () => {
    expect(missingResourceCost({ ...empty, wood: 100, stone: 100 }, { wood: 30, stone: 5 })).toEqual({});
    expect(canAffordResourceCost({ ...empty, wood: 30 }, { wood: 30 })).toBe(true);
  });

  it('reports only the resources that fall short, with the amount short', () => {
    expect(missingResourceCost(empty, { wood: 30, stone: 5 })).toEqual({ wood: 30, stone: 5 });
    expect(missingResourceCost({ ...empty, wood: 20 }, { wood: 30, stone: 5 })).toEqual({ wood: 10, stone: 5 });
  });

  it('ignores a cost key with no amount', () => {
    expect(missingResourceCost(empty, { wood: 30, food: 0 })).toEqual({ wood: 30 });
  });
});
