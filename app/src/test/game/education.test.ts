import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { BuildingType, BUILDING_CONFIGS, EntityType } from '@/game/gameTypes';
import {
  applyEducationGraduation,
  creditChildSchoolDay,
  findSchoolForChild,
  getEducationTier,
  getSchoolAgeMultiplier,
  SCHOOL_GRADUATION_DAYS,
  SCHOOL_MIN_DAYS_FOR_BOOST,
} from '@/game/education';
import { WORK_HOURS_PER_DAY } from '@/game/dayCycle';
function staffedSchool(state: ReturnType<typeof initGame>, id = 50, x = 300): void {
  const cfg = BUILDING_CONFIGS[BuildingType.School];
  state.buildings.push({
    id,
    type: BuildingType.School,
    x,
    y: 200,
    width: cfg.width,
    height: cfg.height,
    completed: true,
    constructionProgress: 100,
    occupants: [999],
    health: 100,
    maxHealth: 100,
    level: 1,
    buildAnimTimer: 0,
    spriteScale: 1,
  });
}

describe('education', () => {
  it('finds nearest staffed school for a child', () => {
    const state = initGame();
    staffedSchool(state, 1, 400);
    staffedSchool(state, 2, 100);
    const child = createEntity(EntityType.Human, 110, 220, 12, 80, true, { gender: 'female' });
    const school = findSchoolForChild(child, state.buildings);
    expect(school?.id).toBe(2);
  });

  it('credits a school day after enough work-hour ticks', () => {
    const child = createEntity(EntityType.Human, 0, 0, 1, 80, true);
    child.schoolTicksToday = WORK_HOURS_PER_DAY;
    creditChildSchoolDay(child);
    expect(child.schoolDays).toBe(1);
    expect(child.schoolTicksToday).toBe(0);
  });

  it('ramps age multiplier only after minimum attendance', () => {
    const state = initGame();
    staffedSchool(state);
    const child = createEntity(EntityType.Human, 320, 220, 3, 80, true);
    expect(getSchoolAgeMultiplier(child, state.buildings)).toBe(1);
    child.schoolDays = SCHOOL_MIN_DAYS_FOR_BOOST;
    expect(getSchoolAgeMultiplier(child, state.buildings)).toBeGreaterThan(1);
  });

  it('grants graduation perks at adulthood', () => {
    const state = initGame();
    const adult = createEntity(EntityType.Human, 0, 0, 4, 200, false, { gender: 'male' });
    adult.schoolDays = SCHOOL_GRADUATION_DAYS;
    adult.isJuvenile = false;
    applyEducationGraduation(state, adult);
    expect(adult.educated).toBe(true);
    expect(getEducationTier(adult.schoolDays ?? 0)).toBeGreaterThan(0);
    expect(Object.values(adult.skills).some((v) => (v ?? 0) > 0)).toBe(true);
  });
});