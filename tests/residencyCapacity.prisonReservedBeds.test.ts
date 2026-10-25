import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { rebalanceOvercrowdedResidences } from '../src/game/residencyReconciliation';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/residencyOccupancy';

describe('capacity rebalance honors imprisoned residents', () => {
  it('counts a prisoner bed before retaining unrelated movable adults', () => {
    const home = building(100, BuildingType.House);
    const prison = building(101, BuildingType.Prison);
    const cap = getResidenceCapacity(home);
    const prisoner = human(1, { residenceBuildingId: home.id });
    prisoner.prisonBuildingId = prison.id;
    const adults = Array.from({ length: cap }, (_, i) =>
      human(i + 2, { residenceBuildingId: home.id, age: 30 }));
    const residents = [prisoner, ...adults];

    expect(buildResidenceOccupancy(residents).get(home.id)).toBe(cap + 1);
    expect(rebalanceOvercrowdedResidences(residents, [home])).toBe(true);
    expect(prisoner.residenceBuildingId).toBe(home.id);
    expect(buildResidenceOccupancy(residents).get(home.id)).toBe(cap);
    expect(adults.filter((adult) => adult.residenceBuildingId !== home.id)).toHaveLength(1);
  });
});
