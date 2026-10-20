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
});
