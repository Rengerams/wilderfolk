import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, hasFatalStarvation, initialHumanNeeds, normalizeHumanNeeds } from '../src/game/simulation/humanPhysiology';

type Scenario = 'normal' | 'night' | 'idle' | 'starving';

function runNeedsScenario(days: number, scenario: Scenario) {
  const e = { id: 1, type: EntityType.Human, alive: true, isJuvenile: false,
    energy: 400, maxEnergy: 500, needs: initialHumanNeeds(400, 500) } as Entity;
  const state = { tick: 0, resources: { food: scenario === 'starving' ? 0 : 1000 } } as WorldState;
  let observedWorkHours = 0;
  let firstFatalTick: number | undefined;
  const ticksPerDay = 24 * TICKS_PER_HOUR;
  for (let tick = 0; tick < days * ticksPerDay; tick++) {
    state.tick = tick;
    const hour = Math.floor(tick % ticksPerDay / TICKS_PER_HOUR);
    const sleeping = scenario === 'night' ? hour >= 12 && hour < 19 : hour >= 23 || hour < 6;
    const working = scenario === 'normal' ? hour >= 8 && hour < 17
      : scenario === 'night' ? hour >= 22 || hour < 7 : false;
    observedWorkHours += working ? 1 / TICKS_PER_HOUR : 0;
    advanceHumanNeeds(e, { tick, sleeping, working, moving: false });
    if (!sleeping && tick % TICKS_PER_HOUR === 0) tryEatColonyMeal(e, state, hour);
    if (hasFatalStarvation(e) && firstFatalTick === undefined) firstFatalTick = tick;
  }
  return { needs: e.needs!, foodEaten: 1000 - state.resources.food,
    observedWorkHours, firstFatalHour: firstFatalTick === undefined ? null : firstFatalTick / TICKS_PER_HOUR };
}

describe('physiology only: reproducible 7/30-day calibration contracts', () => {
  it('keeps an ordinary nine-hour worker stable at roughly three food/day for 30 days', () => {
    const after = runNeedsScenario(30, 'normal');
    expect(after.observedWorkHours).toBeCloseTo(270, 4);
    expect(after.foodEaten).toBeGreaterThanOrEqual(80);
    expect(after.foodEaten).toBeLessThanOrEqual(100);
    expect(after.needs.nutrition).toBeGreaterThan(45);
    expect(after.needs.rest).toBeGreaterThan(25);
    expect(after.needs.stamina).toBeGreaterThan(20);
    expect(after.firstFatalHour).toBeNull();
  });

  it('night work with actual daytime sleep does not create sleep debt', () => {
    const after = runNeedsScenario(7, 'night');
    expect(after.observedWorkHours).toBeCloseTo(63, 4);
    expect(after.needs.rest).toBeGreaterThan(25);
    expect(after.needs.nutrition).toBeGreaterThan(45);
    expect(after.firstFatalHour).toBeNull();
  });

  it('idle adults do not graze every hour', () => {
    const after = runNeedsScenario(7, 'idle');
    expect(after.foodEaten).toBeGreaterThan(15);
    expect(after.foodEaten).toBeLessThan(23);
  });

  it('prolonged starvation is delayed; zero stamina alone is not fatal', () => {
    expect(runNeedsScenario(4, 'starving').firstFatalHour).toBeNull();
    const after = runNeedsScenario(7, 'starving');
    expect(after.firstFatalHour).not.toBeNull();
    expect(after.firstFatalHour!).toBeGreaterThan(90);
    expect(after.needs.nutrition).toBe(0);
  });

  it('preserves exact needs and tick stamps across structured save/worker snapshots', () => {
    const e = { id: 8, type: EntityType.Human, energy: 450, maxEnergy: 500,
      alive: true, isJuvenile: false, needs: initialHumanNeeds(450, 500) } as Entity;
    advanceHumanNeeds(e, { tick: 100, sleeping: false, working: true, moving: false });
    const restored = structuredClone(e);
    normalizeHumanNeeds(restored);
    expect(restored.needs).toEqual(e.needs);
    advanceHumanNeeds(e, { tick: 101, sleeping: false, working: true, moving: false });
    advanceHumanNeeds(restored, { tick: 101, sleeping: false, working: true, moving: false });
    expect(restored.needs).toEqual(e.needs);
  });
});
