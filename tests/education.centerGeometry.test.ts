import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, type Building, type Entity } from '../src/game/gameTypes';
import { findNearestStaffedSchool, isChildAtSchool } from '../src/game/education';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';

const school = (id: number, x: number, y: number): Building => ({
  id, type: BuildingType.School, x, y, width: 60, height: 40,
  completed: true, occupants: [101],
} as Building);

const child = (x: number, y: number): Entity => ({
  id: 1, type: EntityType.Human, alive: true, x, y, age: 10, isJuvenile: true,
} as Entity);

describe('school yard geometry', () => {
  it('recognizes a pupil standing at their own yard slot as attending class', () => {
    const building = school(5, 100, 100);
    const pupil = child(100, 100);
    const target = humanBuildingTarget(building, pupil.id, false);
    pupil.x = target.x;
    pupil.y = target.y;
    expect(isChildAtSchool(pupil, building)).toBe(true);
    expect(isChildAtSchool(child(400, 400), building)).toBe(false);
  });

  it('selects nearest staffed school by center rather than its lower-right corner', () => {
    const small = school(1, 105, 100);
    small.width = 20;
    small.height = 20;
    const large = school(2, 80, 100);
    large.width = 100;
    large.height = 40;
    expect(findNearestStaffedSchool(child(100, 100), [large, small])?.id).toBe(1);
  });
});
