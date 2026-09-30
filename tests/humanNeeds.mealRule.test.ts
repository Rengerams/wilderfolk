/**
 * Colony larder meal rule — one owner, one set of gates.
 *
 * This rule used to exist twice in humanTick.ts (the idle path and the active
 * path) with slightly different guards, which is how a visitor could in
 * principle drink from the colony larder. It now lives in
 * simulation/humanNeeds.ts as `tryEatColonyMeal`, and these tests pin every
 * gate plus the energy/food arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { Human } from '../src/game/gameConstants';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';

/** A tick that starts a clock hour, so the "start of hour" gate passes. */
const MEAL_TICK = TICKS_PER_DAY; // 72 / 3 = hour 24, divisible by TICKS_PER_HOUR
const NON_CLOCK_HOUR_TICK = MEAL_TICK + 1;

function settler(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 100, // max 500 → 20% → hungry
    maxEnergy: 500,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    name: 'Asha',
    ...overrides,
  } as Entity;
}

function stateWithFood(food: number): WorldState {
  return {
    tick: MEAL_TICK,
    year: 0,
    dayInYear: 1,
    resources: { wood: 0, stone: 0, food },
  } as unknown as WorldState;
}

describe('tryEatColonyMeal', () => {
  it('feeds a hungry player settler at a meal hour: 1 food for MEAL_ENERGY_RESTORE', () => {
    const state = stateWithFood(10);
    const eater = settler({ energy: 100 });

    expect(tryEatColonyMeal(eater, state, 8)).toBe(true);
    expect(state.resources.food).toBe(9);
    expect(eater.energy).toBe(100 + Human.MEAL_ENERGY_RESTORE);
  });

  it('never lets a visitor drain the colony larder', () => {
    const state = stateWithFood(10);
    const visitor = settler({ faction: 'visitor', energy: 100 });

    expect(tryEatColonyMeal(visitor, state, 8)).toBe(false);
    expect(state.resources.food).toBe(10);
    expect(visitor.energy).toBe(100);
  });

  it('refuses outside a meal-check hour', () => {
    const state = stateWithFood(10);
    const eater = settler({ energy: 100 });

    expect(tryEatColonyMeal(eater, state, 9)).toBe(false);
    expect(state.resources.food).toBe(10);
  });

  it('refuses mid-hour, so a settler eats once per clock hour at most', () => {
    const state = stateWithFood(10);
    state.tick = NON_CLOCK_HOUR_TICK;
    const eater = settler({ energy: 100 });

    expect(tryEatColonyMeal(eater, state, 8)).toBe(false);
    expect(state.resources.food).toBe(10);
  });

  it('refuses on an empty larder', () => {
    const state = stateWithFood(0);
    const eater = settler({ energy: 100 });

    expect(tryEatColonyMeal(eater, state, 8)).toBe(false);
    expect(eater.energy).toBe(100);
  });

  it('refuses a settler who is not hungry yet', () => {
    const state = stateWithFood(10);
    const notHungry = settler({ energy: 500 * Human.HUNGER_MEAL_THRESHOLD });

    expect(tryEatColonyMeal(notHungry, state, 8)).toBe(false);
    expect(state.resources.food).toBe(10);
  });

  it('never overfills the energy bar', () => {
    const state = stateWithFood(10);
    // 440 is just under the HUNGER_MEAL_THRESHOLD line (450), so the settler is
    // hungry enough to eat, but 440 + MEAL_ENERGY_RESTORE (65) would overshoot 500.
    const almostFull = settler({ energy: 440 });

    expect(tryEatColonyMeal(almostFull, state, 8)).toBe(true);
    expect(almostFull.energy).toBe(500);
    expect(state.resources.food).toBe(9);
  });

  it('records the meal in the economy ledger under "meals"', () => {
    const state = stateWithFood(10);
    const eater = settler({ energy: 100 });

    tryEatColonyMeal(eater, state, 8);

    expect(state.economyLedger?.consumed.meals).toBe(1);
  });

  it('uses the meal-check cadence for gate hours', () => {
    const state = stateWithFood(10);
    const eater = settler({ energy: 100 });

    // Every MEAL_CHECK_INTERVAL_HOURS is a gate; the hour between is not.
    expect(tryEatColonyMeal(eater, state, Human.MEAL_CHECK_INTERVAL_HOURS)).toBe(true);
    expect(tryEatColonyMeal(eater, state, Human.MEAL_CHECK_INTERVAL_HOURS + 1)).toBe(false);
    expect(TICKS_PER_HOUR).toBeGreaterThan(0);
  });
});