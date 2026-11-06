import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { canSupportImmigration } from '../src/game/dailyPopulation';
import { getRecentFoodFlow } from '../src/game/economyLedger';

const stateFor = (produced: number, consumed: (day: number) => number) => ({
  tick: 8 * TICKS_PER_DAY,
  foodHistory: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    produced: { farms: produced },
    consumed: { meals: consumed(index) },
  })),
}) as Pick<WorldState, 'tick' | 'foodHistory'>;

describe('automatic immigration follows actual food capacity, not stocked reserves', () => {
  it('pauses future arrivals while measured output still exceeds current meals but projected growth is unsafe', () => {
    const world = stateFor(180, (day) => 90 + day * 10);
    expect(getRecentFoodFlow(world)?.netPerDay).toBeGreaterThan(0);
    expect(canSupportImmigration(world, 50, 10)).toBe(false);
  });

  it('permits a few founding families only when existing food covers a sixty-day shortfall and a reserve', () => {
    const founders = stateFor(80, () => 50);
    expect(getRecentFoodFlow(founders)?.netPerDay).toBeGreaterThan(0);
    const stocked = {
      ...founders,
      resources: { food: 3000, wood: 0, stone: 0, gold: 0, iron: 0 },
    };
    expect(canSupportImmigration(stocked, 20, 5)).toBe(true);
    expect(canSupportImmigration({ ...stocked, resources: { ...stocked.resources, food: 800 } },
      20, 5)).toBe(false);
    expect(canSupportImmigration({ ...stocked, resources: { ...stocked.resources, food: 3000 } },
      60, 5)).toBe(false);
  });

  it('welcomes newcomers while sustainable production covers growth and its buffer', () => {
    expect(canSupportImmigration(stateFor(300, () => 90), 50, 10)).toBe(true);
  });

  it('refuses immigration during a verified current deficit even when there are empty beds', () => {
    expect(canSupportImmigration(stateFor(100, () => 160), 50, 10)).toBe(false);
  });

  it('preserves bootstrap immigration without enough completed-day evidence, and respects a full cap', () => {
    const world = { tick: 2 * TICKS_PER_DAY, foodHistory: [] } as
      Pick<WorldState, 'tick' | 'foodHistory'>;
    expect(canSupportImmigration(world, 5, 3)).toBe(true);
    expect(canSupportImmigration(world, 5, 0)).toBe(false);
  });
});
