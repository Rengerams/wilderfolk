import { describe, expect, it } from 'vitest';
import { human } from '../src/test/factories';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { packEntityRenderMeta } from '../src/game/simBuffers/entityRenderMeta';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, hasFatalStarvation, initialHumanNeeds, normalizeHumanNeeds } from '../src/game/simulation/humanPhysiology';

type Scenario = 'normal' | 'night' | 'idle' | 'starving';

function runNeedsScenario(days: number, scenario: Scenario) {
  const e = { id: 1, type: EntityType.Human, alive: true, isJuvenile: false,
    energy: 400, maxEnergy: 500, needs: initialHumanNeeds(400, 500) } as Entity;
  const initialFood = scenario === 'starving' ? 0 : Math.max(1000, days * 4);
  const state = { tick: 0, resources: { food: initialFood } } as WorldState;
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
  return { needs: e.needs!, foodEaten: initialFood - state.resources.food,
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

  it('maintains physiology and demand over a full 360-day simulation year', () => {
    for (const scenario of ['normal', 'night', 'idle'] as const) {
      const after = runNeedsScenario(360, scenario);
      expect(after.foodEaten).toBeGreaterThan(900);
      expect(after.foodEaten).toBeLessThan(1200);
      expect(after.needs.nutrition).toBeGreaterThan(40);
      expect(after.needs.rest).toBeGreaterThan(25);
      expect(after.needs.stamina).toBeGreaterThan(15);
      expect(after.firstFatalHour).toBeNull();
    }
  });

  it('plans daytime sleep after an overnight shift and restores rest only while actually sleeping', () => {
    const worker = { id: 2, type: EntityType.Human, alive: true, isJuvenile: false,
      energy: 400, maxEnergy: 500, needs: { nutrition: 75, rest: 40, stamina: 55 } } as Entity;
    advanceHumanNeeds(worker, { tick: 100, sleeping: false, working: true,
      nightDuty: true, moving: false });
    expect(worker.needs!.nightDutyRecoveryPending).toBe(true);
    const restored = structuredClone(worker);
    normalizeHumanNeeds(restored);
    expect(restored.needs!.nightDutyRecoveryPending).toBe(true);
    advanceHumanNeeds(restored, { tick: 101, sleeping: false, working: false,
      nightDuty: false, moving: true });
    expect(restored.needs!.nightDutyRecoveryPending).toBeUndefined();
    expect(restored.needs!.sleepRecoveryUntilTick).toBeGreaterThan(101);
    const awakeRest = restored.needs!.rest;
    advanceHumanNeeds(restored, { tick: 102, sleeping: false, working: false, moving: true });
    expect(restored.needs!.rest).toBeLessThan(awakeRest);
    for (let tick = 103; tick < 103 + 8 * TICKS_PER_HOUR; tick++) {
      advanceHumanNeeds(restored, { tick, sleeping: true, working: false, moving: false });
    }
    expect(restored.needs!.rest).toBeGreaterThanOrEqual(85);
    expect(restored.needs!.sleepRecoveryUntilTick).toBeUndefined();
  });

  it('exports detached physiology values through the worker render sidecar', () => {
    const e = { id: 1, type: EntityType.Human, energy: 400, maxEnergy: 500,
      needs: initialHumanNeeds(400, 500) } as Entity;
    const meta = packEntityRenderMeta(e);
    expect(meta.needs).toEqual(e.needs);
    e.needs!.nutrition = 0;
    expect(meta.needs?.nutrition).toBe(80);
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
  it('round-trips exact fractional nutrition, recovery intents and meal ticks through the real save loader', () => {
    const world = initGame({ seed: 12345 });
    const settler = human(world.nextEntityId++, {
      needs: {
        nutrition: 58.75, rest: 34.25, stamina: 21.5,
        lastMealTick: 115, lastAdvancedTick: 119,
        severeHungerTicks: 0, nightDutyRecoveryPending: true,
        sleepRecoveryUntilTick: 160,
      },
    });
    world.tick = 120;
    world.entities.push(settler);
    const expected = structuredClone(settler.needs);
    const payload = JSON.parse(JSON.stringify(
      buildSaveData(world, createInitialView(world.width, world.height)),
    )) as Record<string, unknown>;
    const outcome = loadGameFromParsedOutcome(payload);
    if (!outcome.ok) throw new Error(`Save load failed: ${outcome.reason}`);
    const restored = outcome.world.entities.find((entity) => entity.id === settler.id);
    expect(restored?.needs).toEqual(expected);
    const nutritionBefore = restored!.needs!.nutrition;
    advanceHumanNeeds(restored!, {
      tick: 120, sleeping: false, working: false, moving: false,
    });
    expect(restored!.needs!.nutrition).toBeLessThan(nutritionBefore);
    expect(restored!.needs!.lastMealTick).toBe(115);
  });

});
