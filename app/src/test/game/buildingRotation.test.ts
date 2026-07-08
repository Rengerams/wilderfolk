import { describe, expect, it } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { isEntityOnBuilding } from '@/game/buildingRotation';
import { createBuilding } from '@/game/worldGen';

describe('isEntityOnBuilding', () => {
  it('treats building x/y as the top-left corner of the footprint', () => {
    const house = createBuilding(BuildingType.House, 100, 80, 1, 0);
    expect(isEntityOnBuilding(100, 80, house)).toBe(true);
    expect(isEntityOnBuilding(100 + house.width / 2, 80 + house.height / 2, house)).toBe(true);
    expect(isEntityOnBuilding(100 - 20, 80 + house.height / 2, house)).toBe(false);
    expect(isEntityOnBuilding(100 + house.width + 20, 80, house)).toBe(false);
  });
});