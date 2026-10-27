/**
 * The assign pulse must not re-house a jailed settler.
 *
 * Arrest clears `residenceBuildingId` on purpose. `assignMissingResidences` used to treat every
 * living player human as a housing candidate, so the next assignment pulse put the prisoner back
 * in a bed (and folded a jailed spouse into the free partner's unit).
 */
import { describe, expect, it } from 'vitest';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { BuildingType } from '../src/game/gameTypes';
import { human, finishedBuilding } from '../src/test/factories';

describe('assign pulse leaves prisoners unhoused', () => {
  it('does not give a jailed settler a residence', () => {
    const house = finishedBuilding(1, BuildingType.House);
    const prison = finishedBuilding(2, BuildingType.Prison);
    const free = human(1, { residenceBuildingId: house.id });
    const jailed = human(2, {
      residenceBuildingId: undefined,
      prisonBuildingId: prison.id,
    });
    house.occupants = [free.id];
    prison.occupants = [jailed.id];

    assignMissingResidences([free, jailed], [house, prison]);

    expect(jailed.residenceBuildingId).toBeUndefined();
    expect(jailed.prisonBuildingId).toBe(prison.id);
    expect(free.residenceBuildingId).toBe(house.id);
  });
});
