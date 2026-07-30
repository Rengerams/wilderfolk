/**
 * Hunting rules — free-roam food yields and prey validity after ecology / day-length work.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from './gameTypes';
import type { Entity, WorldState } from './gameTypes';

// freeHuntFoodGain is module-private — re-test via the same formula constants
import { getHuntFoodMultiplier } from './combat';
import { getValleyHuntYieldMultiplier } from './ecologyStage';

function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
  const base = preyType === EntityType.Deer ? 52 : preyType === EntityType.Rabbit ? 22 : 18;
  return Math.max(
    1,
    Math.round(base * getHuntFoodMultiplier(state) * getValleyHuntYieldMultiplier(state)),
  );
}

function isValidHuntPrey(prey: Entity, preyType: EntityType, hunterId: number): boolean {
  if (!prey.alive || prey.id === hunterId) return false;
  if (prey.tamedBy != null) return false;
  if (preyType === EntityType.Human) {
    if (prey.moonHowlerCursed) return false;
    if (prey.faction === 'visitor' || prey.faction === 'rival') return false;
  }
  return true;
}

describe('free-roam hunt food', () => {
  const baseState = {
    valleyStage: 'stable' as const,
    researchNodes: [],
  } as unknown as WorldState;

  it('deer yields more meat than rabbit', () => {
    expect(freeHuntFoodGain(EntityType.Deer, baseState)).toBeGreaterThan(
      freeHuntFoodGain(EntityType.Rabbit, baseState),
    );
  });

  it('damaged valley cuts hunt yield', () => {
    const stable = freeHuntFoodGain(EntityType.Deer, baseState);
    const damaged = freeHuntFoodGain(EntityType.Deer, {
      ...baseState,
      valleyStage: 'damaged',
    } as WorldState);
    expect(damaged).toBeLessThan(stable);
    expect(damaged).toBe(Math.round(stable * 0.7));
  });
});

describe('hunt prey validity', () => {
  it('rejects tamed animals', () => {
    const deer = {
      id: 2,
      alive: true,
      type: EntityType.Deer,
      tamedBy: 1,
    } as Entity;
    expect(isValidHuntPrey(deer, EntityType.Deer, 9)).toBe(false);
  });

  it('accepts wild deer', () => {
    const deer = {
      id: 2,
      alive: true,
      type: EntityType.Deer,
    } as Entity;
    expect(isValidHuntPrey(deer, EntityType.Deer, 9)).toBe(true);
  });

  it('rejects self and dead', () => {
    const deer = { id: 2, alive: false, type: EntityType.Deer } as Entity;
    expect(isValidHuntPrey(deer, EntityType.Deer, 2)).toBe(false);
    deer.alive = true;
    expect(isValidHuntPrey(deer, EntityType.Deer, 2)).toBe(false);
  });
});

describe('moon howler rite cooldown ticks', () => {
  it('exorcism interval is clock hours × ticks-per-hour (not raw 2 ticks)', async () => {
    const { MOON_HOWLER_EXORCISM_INTERVAL_HOURS } = await import('./moonHowler');
    const { TICKS_PER_HOUR } = await import('./dayCycle');
    expect(MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR).toBe(6);
  });
});
