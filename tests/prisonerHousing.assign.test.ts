/**
 * A sentence is not a housing event: arrest sets `prisonBuildingId` and leaves `residenceBuildingId`
 * untouched, so the assign pulse must neither move a prisoner nor hand their reserved bed away.
 */
import { describe, expect, it } from 'vitest';
import { assignMissingResidences } from '../src/game/housingPipeline';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/housingModel';
import { BuildingType } from '../src/game/gameTypes';
import { human, finishedBuilding } from '../src/test/factories';

describe('assign pulse leaves a prisoner’s bed reserved', () => {
  it('keeps the jailed settler in the home they held and does not seat a newcomer there', () => {
    const house = finishedBuilding(1, BuildingType.House);
    const prison = finishedBuilding(2, BuildingType.Prison);
    const jailed = human(1, { residenceBuildingId: house.id, prisonBuildingId: prison.id });
    const housemates = Array.from({ length: getResidenceCapacity(house) - 1 }, (_, index) =>
      human(10 + index, { residenceBuildingId: house.id }));
    const homeless = human(99);
    const humans = [jailed, ...housemates, homeless];
    house.occupants = [jailed.id, ...housemates.map((person) => person.id)];
    prison.occupants = [jailed.id];

    assignMissingResidences(humans, [house, prison]);

    expect(jailed.residenceBuildingId, 'the sentence holds the bed').toBe(house.id);
    expect(jailed.prisonBuildingId).toBe(prison.id);
    expect(homeless.residenceBuildingId, 'the reserved bed is not free').toBeUndefined();
    expect(buildResidenceOccupancy(humans).get(house.id)).toBe(getResidenceCapacity(house));
  });

  it('never gives a prisoner without a residence one while they are jailed', () => {
    const house = finishedBuilding(1, BuildingType.House);
    const prison = finishedBuilding(2, BuildingType.Prison);
    const free = human(1, { residenceBuildingId: house.id });
    const jailed = human(2, { prisonBuildingId: prison.id });
    house.occupants = [free.id];
    prison.occupants = [jailed.id];

    assignMissingResidences([free, jailed], [house, prison]);

    expect(jailed.residenceBuildingId).toBeUndefined();
    expect(jailed.prisonBuildingId).toBe(prison.id);
    expect(free.residenceBuildingId).toBe(house.id);
  });
});
