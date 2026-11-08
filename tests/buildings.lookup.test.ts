import { describe, expect, it } from 'vitest';
import { BuildingType, findCompletedBuilding, type Building } from '../src/game/buildings';

const base: Building = {
  id: 0,
  type: BuildingType.House,
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  occupants: [],
  level: 1,
  constructionProgress: 100,
  completed: true,
  health: 100,
  maxHealth: 100,
  spriteScale: 1,
  buildAnimTimer: 0,
};

describe('findCompletedBuilding', () => {
  it('finds the first completed building of the requested type', () => {
    const unfinished: Building = { ...base, id: 1, type: BuildingType.TownHall, completed: false };
    const legacyRival: Building = { ...base, id: 2, type: BuildingType.TownHall, faction: 'rival' };
    const firstHall: Building = { ...base, id: 3, type: BuildingType.TownHall };
    const secondHall: Building = { ...base, id: 4, type: BuildingType.TownHall };
    const church: Building = { ...base, id: 5, type: BuildingType.Church };
    const buildings = [unfinished, legacyRival, church, firstHall, secondHall];

    expect(findCompletedBuilding(buildings, BuildingType.TownHall)).toBe(firstHall);
    expect(findCompletedBuilding(buildings, BuildingType.Church)).toBe(church);
    expect(findCompletedBuilding(buildings, BuildingType.Hospital)).toBeUndefined();
  });

  it('does not select unfinished or legacy rival structures', () => {
    const buildings: Building[] = [
      { ...base, id: 1, type: BuildingType.TownHall, completed: false },
      { ...base, id: 2, type: BuildingType.TownHall, faction: 'rival' },
    ];

    expect(findCompletedBuilding(buildings, BuildingType.TownHall)).toBeUndefined();
  });
});
