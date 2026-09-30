/**
 * Hunting rules — free-roam food yields and prey validity after ecology / day-length work.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';

// Both rules are exported owners — import them instead of re-deriving them here. This file used
// to carry hand-copied versions, and its copy knew only Deer and Rabbit: every other prey type
// fell through to the 18 fallback, so Wolf (45) and Fox (28) were asserted as 18
// (`LIVE-FINDINGS-STATUS.md`, duplication G1).
import { freeHuntFoodGain } from '../src/game/simulation/humanNeeds';
import { isValidHuntPrey } from '../src/game/simulation/simulationEntities';
import { getValleyHuntYieldMultiplier } from '../src/game/ecologyStage';

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

  it('prices every tabled prey type above the fallback for untabled ones', () => {
    // A Werewolf has no entry in the owner's table, so it is priced at the fallback. The
    // hand-copied function this file used to define treated Wolf and Fox the same way (18),
    // which is what made this case fail before the import replaced it. Asserting the ordering
    // rather than the numbers keeps the test from restating the tuning table.
    const fallback = freeHuntFoodGain(EntityType.Werewolf, baseState);
    expect(freeHuntFoodGain(EntityType.Wolf, baseState)).toBeGreaterThan(fallback);
    expect(freeHuntFoodGain(EntityType.Fox, baseState)).toBeGreaterThan(fallback);
  });

  it('valley stage does not cut hunt yield while valley ecology is parked', () => {
    // Valley-ecology stage ladder is parked (ValleyEcology.ENABLED = false):
    // every stage reads as stable, so hunt yield must be unchanged.
    const stable = freeHuntFoodGain(EntityType.Deer, baseState);
    const damaged = freeHuntFoodGain(EntityType.Deer, {
      ...baseState,
      valleyStage: 'damaged',
    } as WorldState);
    expect(damaged).toBe(stable);
    expect(getValleyHuntYieldMultiplier({ valleyStage: 'damaged' } as WorldState)).toBe(1);
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
    const { MOON_HOWLER_EXORCISM_INTERVAL_HOURS } = await import('../src/game/moonHowler');
    const { TICKS_PER_HOUR } = await import('../src/game/dayCycle');
    expect(MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR).toBe(6);
  });
});