import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { getOpenPlayerBeds } from '../src/game/populationGrowth';
import { getResidenceCapacity } from '../src/game/residencyOccupancy';
import { building, human } from '../src/test/factories';

describe('open player beds linear occupancy calculation', () => {
  it('excludes reserved Leader House beds, ignores dead and rival occupants, and floors each house at zero', () => {
    const houses = [
      building(1, BuildingType.House),
      building(2, BuildingType.Mansion),
      building(3, BuildingType.LeaderHouse),
      building(4, BuildingType.House),
    ];
    const residents = [
      human(10, { residenceBuildingId: 1 }),
      human(11, { residenceBuildingId: 1, alive: false }),
      human(12, { residenceBuildingId: 2 }),
      human(13, { residenceBuildingId: 2, faction: 'rival' }),
      human(14, { residenceBuildingId: 3 }),
      ...Array.from({ length: getResidenceCapacity(houses[3]) + 2 }, (_, i) =>
        human(100 + i, { residenceBuildingId: 4 })),
    ];
    const state = { buildings: houses, entities: residents } as WorldState;
    expect(getOpenPlayerBeds(state)).toBe(
      Math.max(0, getResidenceCapacity(houses[0]) - 1)
      + Math.max(0, getResidenceCapacity(houses[1]) - 1),
    );
  });

  it('matches the reference calculation on a large colony', () => {
    const houses = Array.from({ length: 300 }, (_, i) =>
      building(i, i === 0 ? BuildingType.LeaderHouse : BuildingType.House),
    );
    const residents = Array.from({ length: 6000 }, (_, i) =>
      human(i + 1000, { residenceBuildingId: i % 300 }),
    );
    const state = { buildings: houses, entities: residents } as WorldState;
    const expected = houses.filter((b) => b.type !== BuildingType.LeaderHouse)
      .reduce((sum, b) => sum + Math.max(0,
        getResidenceCapacity(b) - residents.filter((h) => h.alive && !h.faction && h.residenceBuildingId === b.id).length,
      ), 0);
    expect(getOpenPlayerBeds(state)).toBe(expected);
  });
});
