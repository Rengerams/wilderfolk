/** Automatic staffing fills a workplace's open posts from a clear surplus instead of one worker per site. */
import { describe, expect, it } from 'vitest';
import { BuildingType, BUILDING_CONFIGS } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { countWorkersAtBuilding, rebalanceJobWorkers } from '../src/game/workforce';

const WORKSHOP_CAP = BUILDING_CONFIGS[BuildingType.Workshop].maxOccupants;
const MARKET_CAP = BUILDING_CONFIGS[BuildingType.Market].maxOccupants;
const MILL_CAP = BUILDING_CONFIGS[BuildingType.LumberMill].maxOccupants;

function staffedWorkers(buildingId: number, ids: number[]) {
  return ids.map((id) => human(id, { workerBuildingId: buildingId }));
}

describe('automatic staffing — capacity fill', () => {
  it('fills an open post from a workplace that keeps a clear surplus', () => {
    const market = building(10, BuildingType.Market, { occupants: [1, 2, 3] });
    const workshop = building(11, BuildingType.Workshop, { occupants: [4] });
    const workers = [
      ...staffedWorkers(10, [1, 2, 3]),
      ...staffedWorkers(11, [4]),
    ];

    rebalanceJobWorkers(workers, [market, workshop]);

    expect(countWorkersAtBuilding(workers, 11)).toBe(WORKSHOP_CAP);
    expect(countWorkersAtBuilding(workers, 10)).toBe(2);
  });

  it('does not take a hand from a workplace that is only one ahead', () => {
    const market = building(10, BuildingType.Market, { occupants: [1, 2] });
    const workshop = building(11, BuildingType.Workshop, { occupants: [3] });
    const workers = [...staffedWorkers(10, [1, 2]), ...staffedWorkers(11, [3])];

    rebalanceJobWorkers(workers, [market, workshop]);

    // One hand ahead is not a surplus: taking it would only recreate the same imbalance reversed.
    expect(countWorkersAtBuilding(workers, 11)).toBe(1);
    expect(countWorkersAtBuilding(workers, 10)).toBe(2);
  });

  it('settles without moving anyone on the next pulse', () => {
    const market = building(10, BuildingType.Market, { occupants: [1, 2, 3] });
    const workshop = building(11, BuildingType.Workshop, { occupants: [4] });
    const workers = [...staffedWorkers(10, [1, 2, 3]), ...staffedWorkers(11, [4])];

    rebalanceJobWorkers(workers, [market, workshop]);
    const first = [countWorkersAtBuilding(workers, 10), countWorkersAtBuilding(workers, 11)];
    rebalanceJobWorkers(workers, [market, workshop], undefined, 100);

    expect([countWorkersAtBuilding(workers, 10), countWorkersAtBuilding(workers, 11)]).toEqual(first);
  });

  it('balances two identical workplaces holding unequal crews', () => {
    const firstMill = building(10, BuildingType.LumberMill, { occupants: [1, 2, 3] });
    const secondMill = building(11, BuildingType.LumberMill, { occupants: [4] });
    const workers = [...staffedWorkers(10, [1, 2, 3]), ...staffedWorkers(11, [4])];

    rebalanceJobWorkers(workers, [firstMill, secondMill]);

    expect(countWorkersAtBuilding(workers, 10)).toBe(2);
    expect(countWorkersAtBuilding(workers, 11)).toBe(2);
    expect(countWorkersAtBuilding(workers, 11)).toBeLessThanOrEqual(MILL_CAP);
  });

  it('restores protected coverage before topping up capacity', () => {
    const farm = building(10, BuildingType.Farm, { occupants: [1] });
    const quarry = building(11, BuildingType.Quarry, { occupants: [2, 3, 4] });
    const workers = [...staffedWorkers(10, [1]), ...staffedWorkers(11, [2, 3, 4])];

    rebalanceJobWorkers(workers, [farm, quarry]);

    expect(countWorkersAtBuilding(workers, 10)).toBe(
      Math.min(BUILDING_CONFIGS[BuildingType.Farm].maxOccupants, 3),
    );
    expect(countWorkersAtBuilding(workers, 11)).toBe(2);
  });
});
