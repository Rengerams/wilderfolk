/**
 * Regression: schools are manually staffed (the player picks the teacher, whose
 * personality shapes the kids) and each school caps attendance at
 * SCHOOL_MAX_CHILDREN — the 11th child finds no seat, so class sizes stay sane
 * and a second school becomes a real decision.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import {
  SCHOOL_MAX_CHILDREN,
  findSchoolForChild,
  findStaffedSchools,
} from '../src/game/education';
import { assignMissingWorkers, isManualStaffBuilding } from '../src/game/workforce';

function schoolFixture(): { child: Entity; school: Building } {
  const state = initGame();
  const child: Entity = {
    ...state.entities.find((e) => e.type === EntityType.Human && e.alive)!,
    id: 9000,
    name: 'Little',
    surname: 'One',
    isJuvenile: true,
    x: 100,
    y: 100,
  };
  const school: Building = {
    ...state.buildings[0]!,
    id: 8000,
    type: BuildingType.School,
    completed: true,
    occupants: [9001], // one teacher assigned manually
    faction: undefined,
    x: 90,
    y: 90,
    width: 53,
    height: 46,
  };
  return { child, school };
}

describe('school manual staffing & capacity', () => {
  it('the School is a manual-staff building — auto-assign never fills it', () => {
    expect(isManualStaffBuilding(BuildingType.School)).toBe(true);
  });

  it('auto-staff leaves an unstaffed school empty even with idle settlers', () => {
    const state = initGame();
    // Idle adult settler, empty completed school.
    const school: Building = {
      ...state.buildings[0]!,
      id: 8002,
      type: BuildingType.School,
      completed: true,
      occupants: [],
      faction: undefined,
      x: 90,
      y: 90,
      width: 53,
      height: 46,
    };
    state.buildings.push(school);
    assignMissingWorkers(
      state.entities.filter((e) => e.alive && e.type === EntityType.Human && !e.faction),
      state.buildings,
    );
    expect(school.occupants).toHaveLength(0);
  });

  it('a child finds the school while seats remain', () => {
    const { child, school } = schoolFixture();
    const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN - 1]]);
    expect(findSchoolForChild(child, [school], reserved)?.id).toBe(school.id);
  });

  it('the 11th child finds no seat — school capacity is 10', () => {
    const { child, school } = schoolFixture();
    const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN]]);
    expect(findSchoolForChild(child, [school], reserved)).toBeUndefined();
  });

  it('a second school still takes overflow children', () => {
    const { child, school } = schoolFixture();
    const school2: Building = { ...school, id: 8001, x: 400, y: 100 };
    const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN]]);
    expect(findSchoolForChild(child, [school, school2], reserved)?.id).toBe(8001);
  });

  it('staffed schools are the only ones children consider', () => {
    const { child, school } = schoolFixture();
    const unstaffed: Building = { ...school, id: 8003, occupants: [] };
    expect(findStaffedSchools([school, unstaffed])).toHaveLength(1);
    expect(findSchoolForChild(child, [school, unstaffed])?.id).toBe(school.id);
  });
});
