import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import { createBuilding, createEntity } from '../src/game/worldGen';
import { assignMissingWorkers } from '../src/game/workforce';

describe('zero-capacity construction sites', () => {
  it('never transfers a builder into an unfinished Wildlife Preserve', () => {
    const preserve = createBuilding(BuildingType.WildlifePreserve, 50, 50, 1128);
    const house = createBuilding(BuildingType.House, 100, 100, 1);
    house.occupants = [14611, 14612];
    const humans = [14611, 14612].map((id) => createEntity(
      EntityType.Human, 100, 100, id, 400, false,
      { gender: 'male', name: 'Builder', surname: 'Test', ageYears: 30, colonyDay: 0 },
    ));
    assignMissingWorkers(humans, [preserve, house]);
    expect(preserve.occupants).toEqual([]);
    expect(house.occupants).toEqual([14611, 14612]);
  });

  it('cleans a legacy stray occupant on a completed non-staffed Preserve', () => {
    const preserve = createBuilding(BuildingType.WildlifePreserve, 50, 50, 1128);
    preserve.completed = true;
    preserve.occupants = [14611];
    const settler = createEntity(EntityType.Human, 100, 100, 14611, 400, false,
      { gender: 'male', name: 'Builder', surname: 'Test', ageYears: 30, colonyDay: 0 });
    assignMissingWorkers([settler], [preserve]);
    expect(preserve.occupants).toEqual([]);
  });
});
