/** Auto-fill means capacity: every available employee position is filled. */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, BUILDING_CONFIGS } from '../src/game/gameTypes';
import { createBuilding, createEntity } from '../src/game/worldGen';
import { assignWorkerInPlace, countWorkersAtBuilding } from '../src/game/workforce';

for (const type of [BuildingType.Tavern, BuildingType.Hotel]) {
  describe(`automatic ${type} staffing`, () => {
    it('fills all available employee positions when adult idle settlers exist', () => {
      const cap = BUILDING_CONFIGS[type].maxOccupants;
      expect(cap).toBeGreaterThan(1);
      const building = createBuilding(type, 100, 100, 1);
      building.completed = true;
      building.staffingMode = 'auto';
      const settlers = Array.from({ length: cap + 2 }, (_, index) => createEntity(
        EntityType.Human, 100 + index, 100, 100 + index, 400, false,
        { gender: 'male', name: `Worker${index}`, surname: 'Test', ageYears: 30, colonyDay: 0 },
      ));
      let attempts = 0;
      while (assignWorkerInPlace(building, settlers, [building])) {
        if (++attempts > cap + 2) throw new Error('auto staffing did not converge');
      }
      expect(countWorkersAtBuilding(settlers, building.id)).toBe(cap);
      expect(building.occupants).toHaveLength(cap);
    });
  });
}
