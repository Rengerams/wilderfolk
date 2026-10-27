/** Barracks staffing regression: eligible idle settlers must fill every auto slot. */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, BUILDING_CONFIGS } from '../src/game/gameTypes';
import { createBuilding, createEntity } from '../src/game/worldGen';
import { assignMissingWorkers, countWorkersAtBuilding } from '../src/game/workforce';

describe('automatic Barracks staffing', () => {
  it('fills all guard posts from eligible idle adults', () => {
    const barracks = createBuilding(BuildingType.Barracks, 100, 100, 7);
    barracks.completed = true;
    barracks.staffingMode = 'auto';
    const capacity = BUILDING_CONFIGS[BuildingType.Barracks].maxOccupants;
    expect(capacity).toBeGreaterThan(1);
    const settlers = Array.from({ length: capacity + 2 }, (_, i) => createEntity(
      EntityType.Human, 100 + i, 100, 1000 + i, 400, false,
      { gender: 'male', name: `Soldier${i}`, surname: 'Test', ageYears: 30, colonyDay: 0 },
    ));
    assignMissingWorkers(settlers, [barracks]);
    expect(countWorkersAtBuilding(settlers, barracks.id)).toBe(capacity);
    expect(barracks.occupants).toHaveLength(capacity);
  });

  it('fills a partially staffed Barracks from a surplus automatic donor when no settler is idle', () => {
    const barracks = createBuilding(BuildingType.Barracks, 100, 100, 7);
    barracks.completed = true;
    barracks.staffingMode = 'auto';
    const donor = createBuilding(BuildingType.Farm, 140, 100, 8);
    donor.completed = true;
    donor.staffingMode = 'auto';
    const needed = BUILDING_CONFIGS[BuildingType.Barracks].maxOccupants;
    const settlers = Array.from({ length: needed + 2 }, (_, i) => createEntity(
      EntityType.Human, 100 + i, 100, 1000 + i, 400, false,
      { gender: 'male', name: `Soldier${i}`, surname: 'Test', ageYears: 30, colonyDay: 0 },
    ));
    settlers[0].workerBuildingId = barracks.id;
    for (const worker of settlers.slice(1)) worker.workerBuildingId = donor.id;
    // A guard transfer must not drain the last worker from the source.
    assignMissingWorkers(settlers, [donor, barracks], { tick: 100 });
    expect(countWorkersAtBuilding(settlers, barracks.id)).toBeGreaterThan(1);
    expect(countWorkersAtBuilding(settlers, donor.id)).toBeGreaterThanOrEqual(1);
    expect(settlers.filter((h) => h.workerBuildingId === barracks.id && h.lastAutoJobTransferTick === 100).length).toBeGreaterThan(0);
  });
});
