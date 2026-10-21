import { describe, expect, it } from 'vitest';
import {
  getIncomingRaidResponseDays,
  getOutgoingRaidFoodCost,
} from '../src/game/frontierCombat';
import { PATH_CELL } from '../src/game/gameTypes';

describe('outgoing raid marching and provisions', () => {
  it('requires a minimum two-day outward march, including nearby camps', () => {
    expect(getIncomingRaidResponseDays(0)).toBeGreaterThanOrEqual(2);
    expect(getIncomingRaidResponseDays(1)).toBeGreaterThanOrEqual(2);
  });

  it('packs army rations for the outward and return journey', () => {
    const distance = PATH_CELL * 12;
    const days = getIncomingRaidResponseDays(12);
    const baseCost = getOutgoingRaidFoodCost(distance, 0);
    expect(baseCost).toBeGreaterThanOrEqual(40);
    expect(getOutgoingRaidFoodCost(distance, 20)).toBe(baseCost + 20 * days * 2);
    expect(getOutgoingRaidFoodCost(distance, 100)).toBeGreaterThan(getOutgoingRaidFoodCost(distance, 20));
  });

  it('makes longer expeditions cost more without reducing minimum rations', () => {
    expect(getOutgoingRaidFoodCost(PATH_CELL * 108, 20))
      .toBeGreaterThan(getOutgoingRaidFoodCost(PATH_CELL * 12, 20));
  });
});
