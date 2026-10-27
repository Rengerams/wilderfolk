import { describe, expect, it } from 'vitest';
import { EntityType, BuildingType, type Entity, type Building } from '../src/game/gameTypes';
import { homeStandPosition, humanBuildingTarget } from '../src/game/simulation/humanMovement';
import { computePopulationCounts } from '../src/game/entityCounts';

describe('movement geometry and transient population regressions', () => {
  it('keeps the home yard and workplace row anchored near the building centre', () => {
    const home = { id: 1, type: BuildingType.House, x: 400, y: 400, width: 100, height: 60, occupants: [12], completed: true } as Building;
    const stand = homeStandPosition(home, 12);
    expect(Math.abs(stand.x - home.x)).toBeLessThan(40);
    expect(stand.y).toBeGreaterThan(home.y);
    const worker = humanBuildingTarget(home, 12, false);
    expect(worker.x).toBe(home.x);
    expect(worker.y).toBe(home.y + home.height / 2 + 10);
  });

  it('counts traders as transient visitor humans instead of dropping them', () => {
    const trader = { id: 7, type: EntityType.Human, faction: 'trade_caravan', alive: true } as Entity;
    const counts = computePopulationCounts([trader]);
    expect(counts.visitorHumans).toBe(1);
    expect(counts.humans).toBe(0);
  });
});
