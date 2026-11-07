/**
 * An unheated winter day has a real cost: the same work burns 1.5x nutrition, so the daily wood
 * spend is not decorative.
 */
import { describe, expect, it } from 'vitest';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';

function settler(): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    alive: true,
    isJuvenile: false,
    energy: 400,
    maxEnergy: 500,
    needs: { ...initialHumanNeeds(400, 500), lastAdvancedTick: 0 },
  } as Entity;
}

const oneHour = (unheatedWinter: boolean) => {
  const entity = settler();
  advanceHumanNeeds(entity, {
    tick: TICKS_PER_HOUR,
    elapsedTicks: TICKS_PER_HOUR,
    sleeping: false,
    working: true,
    moving: false,
    unheatedWinter,
  });
  return entity.needs!.nutrition;
};

describe('unheated winter', () => {
  it('burns more nutrition than a heated one', () => {
    const heated = oneHour(false);
    const cold = oneHour(true);
    expect(cold).toBeLessThan(heated);
    // Base 1.2 + work 0.16 per hour; cold multiplies the whole loss by 1.5.
    expect(heated - cold).toBeCloseTo((1.2 + 0.16) * 0.5, 5);
  });
});
