/**
 * A food producer only satisfies the ladder once it has a crew; an unstaffed farm produces nothing.
 * A site still going up counts, so the auto-player does not queue a duplicate.
 */
import { describe, expect, it } from 'vitest';
import { hasProductiveFoodProducer } from '../src/game/virtualPlayer';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';

const withBuildings = (buildings: Building[]): WorldState =>
  ({ buildings } as unknown as WorldState);

describe('auto-player food producer predicate', () => {
  it('ignores a completed farm nobody works', () => {
    expect(hasProductiveFoodProducer(withBuildings([building(1, BuildingType.Farm)]))).toBe(false);
  });

  it('accepts a staffed farm', () => {
    const staffed = building(1, BuildingType.Farm, { occupants: [7] });
    expect(hasProductiveFoodProducer(withBuildings([staffed]))).toBe(true);
  });

  it('accepts a producer still under construction', () => {
    const site = building(1, BuildingType.Farm, { completed: false });
    expect(hasProductiveFoodProducer(withBuildings([site]))).toBe(true);
  });

  it('ignores a rival producer', () => {
    const rival = building(1, BuildingType.Farm, { faction: 'rival', occupants: [7] });
    expect(hasProductiveFoodProducer(withBuildings([rival]))).toBe(false);
  });
});
