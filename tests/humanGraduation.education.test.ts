import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { HUMAN_ADULT_MIN_AGE as HUMAN_CHILDHOOD_YEARS } from '../src/game/daycycleconstants';
/**
 * A child graduates into adulthood exactly once and keeps the education payoff: the daily age sync
 * leaves `isJuvenile` for `tryGraduateHumanChild`, which runs later in the same tick.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { getColonyDay, setHumanBirthFromAge, syncHumanAgeFromCalendar, tryGraduateHumanChild } from '../src/game/dayCycle';
import { SCHOOL_GRADUATION_DAYS, SCHOOL_EDUCATED_DAYS, SCHOOL_FULL_EDUCATION_DAYS, applyEducationGraduation, getEducationTier } from '../src/game/education';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { grantRareBirthTalent } from '../src/game/simulation/humanLifecycle';
import { createEntity, finalizeSettlerAge } from '../src/game/entityFactory';

const CHILD_ID = 7;
const ADULT_SIZE = 14;
const ADULT_SPEED = 3.2;
const FIXTURE_SEED = 20240913;

function makeChild(ageYears: number, state: WorldState): Entity {
  const child = {
    id: CHILD_ID,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 0,
    maxEnergy: 0,
    needs: { nutrition: 80, rest: 85, stamina: 100 },
    age: ageYears,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 7,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: 'female',
    name: 'Pip',
    surname: 'Vale',
    generation: 1,
    isJuvenile: true,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    schoolDays: SCHOOL_GRADUATION_DAYS,
    relationshipStatus: 'single',
  } as Entity;
  // Birth data drives the calendar age, so the sync computes exactly `ageYears` here.
  setHumanBirthFromAge(child, ageYears, getColonyDay(state));
  child.isJuvenile = true;
  return child;
}

/** The order `humanTick` uses: daily age sync, then the graduation transition. */
function syncThenGraduate(state: WorldState, child: Entity): boolean {
  syncHumanAgeFromCalendar(child, state);
  return tryGraduateHumanChild(child, ADULT_SIZE, ADULT_SPEED, (entity) => {
    applyEducationGraduation(state, entity);
  });
}

describe('education tiers', () => {
  it('makes all three qualification tiers attainable', () => {
    expect(getEducationTier(SCHOOL_GRADUATION_DAYS - 1)).toBe(0);
    expect(getEducationTier(SCHOOL_GRADUATION_DAYS)).toBe(1);
    expect(getEducationTier(SCHOOL_EDUCATED_DAYS - 1)).toBe(1);
    expect(getEducationTier(SCHOOL_EDUCATED_DAYS)).toBe(2);
    expect(getEducationTier(SCHOOL_FULL_EDUCATION_DAYS - 1)).toBe(2);
    expect(getEducationTier(SCHOOL_FULL_EDUCATION_DAYS)).toBe(3);
  });
});

describe('a child graduates once, with the education payoff', () => {
  it('qualifies Tier 3 without awarding unrelated trade skills', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const child = makeChild(HUMAN_CHILDHOOD_YEARS, state);
    child.schoolDays = SCHOOL_FULL_EDUCATION_DAYS;
    child.isJuvenile = false;
    child.skills = { [JobType.Farmer]: 7 };
    applyEducationGraduation(state, child);
    expect(child.skills?.[JobType.Farmer]).toBe(7);
    expect(child.skills?.[JobType.Teacher]).toBeUndefined();
    expect(child.educated).toBe(true);
    applyEducationGraduation(state, child);
    expect(child.skills?.[JobType.Farmer]).toBe(7);
  });

  it('keeps the transition reachable on the age-sync tick', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_YEARS, state);
    state.entities = [child];

    // The sync updates the calendar age and must leave the flag for the transition.
    syncHumanAgeFromCalendar(child, state);
    expect(child.age).toBeGreaterThanOrEqual(HUMAN_CHILDHOOD_YEARS);
    expect(child.isJuvenile).toBe(true);

    const graduated = tryGraduateHumanChild(child, ADULT_SIZE, ADULT_SPEED, (entity) => {
      applyEducationGraduation(state, entity);
    });

    expect(graduated).toBe(true);
    expect(child.isJuvenile).toBe(false);
    expect(child.size).toBe(ADULT_SIZE);
    expect(child.speed).toBe(ADULT_SPEED);
    expect(child.educated).toBe(true);
    expect(getEducationTier(child.schoolDays ?? 0)).toBeGreaterThan(0);
  });

  it('graduates only once, so later ticks do not re-apply the bonus', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_YEARS, state);
    state.entities = [child];

    expect(syncThenGraduate(state, child)).toBe(true);
    const staminaAfterGraduation = child.needs!.stamina;
    const capacityAfterGraduation = child.maxEnergy;

    // Later ticks re-run both calls; the transition must be a no-op now.
    expect(syncThenGraduate(state, child)).toBe(false);
    expect(child.needs!.stamina).toBe(staminaAfterGraduation);
    expect(child.maxEnergy).toBe(capacityAfterGraduation);
  });

  it('does not graduate a child who is still below the childhood threshold', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_YEARS - 1, state);
    state.entities = [child];

    expect(syncThenGraduate(state, child)).toBe(false);
    expect(child.isJuvenile).toBe(true);
    expect(child.size).toBe(7);
    expect(child.educated).toBeUndefined();
  });
});
describe('rare natural talent at birth', () => {
  it('grants one exceptional trade to roughly one percent of newborns without stacking skills', () => {
    initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    let talented = 0;
    let extraordinarilyTalented = 0;
    for (let index = 0; index < 10000; index++) {
      const child = createEntity(EntityType.Human, 0, 0, index + 100000, 80, true);
      grantRareBirthTalent(child, `talent-fixture:${index}`);
      const values = Object.values(child.skills ?? {});
      expect(values.length).toBeLessThanOrEqual(1);
      if (values.length > 0) {
        talented++;
        const skill = values[0] ?? 0;
        expect(skill).toBeGreaterThanOrEqual(40);
        expect(skill).toBeLessThan(95);
        if (skill >= 80) extraordinarilyTalented++;
      }
    }
    expect(talented).toBeGreaterThan(50);
    expect(talented).toBeLessThan(150);
    expect(extraordinarilyTalented).toBeGreaterThan(0);
    expect(extraordinarilyTalented).toBeLessThan(30);
  });
});

describe('L21/L22 factory juvenile threshold', () => {
  it('keeps the auto-detected size in step with the childhood floor', () => {
    const humanSize = SPECIES_CONFIG[EntityType.Human].size;

    const child = createEntity(EntityType.Human, 10, 10, 899, undefined, undefined, {
      ageYears: 11,
      colonyDay: 0,
    });
    expect(child.isJuvenile).toBe(true);
    expect(child.size).toBe(humanSize * 0.5);

    // The childhood floor *is* the adult floor, so a 12–17 year old is a juvenile too and must not be
    // created at half size with `isJuvenile === false` — the flag and `size` have to agree.
    const teen = createEntity(EntityType.Human, 10, 10, 900, undefined, undefined, {
      ageYears: 13,
      colonyDay: 0,
    });
    expect(teen.isJuvenile).toBe(true);
    expect(teen.size).toBe(humanSize * 0.5);

    const youth = createEntity(EntityType.Human, 10, 10, 901, undefined, undefined, {
      ageYears: HUMAN_CHILDHOOD_YEARS - 1,
      colonyDay: 0,
    });
    expect(youth.isJuvenile).toBe(true);
    expect(youth.size).toBe(humanSize * 0.5);

    const adult = createEntity(EntityType.Human, 10, 10, 902, undefined, undefined, {
      ageYears: HUMAN_CHILDHOOD_YEARS,
      colonyDay: 0,
    });
    expect(adult.isJuvenile).toBe(false);
    expect(adult.size).toBe(humanSize);

    const mismatchedChild = createEntity(EntityType.Human, 10, 10, 903, undefined, false, { ageYears: 8 });
    expect(mismatchedChild.isJuvenile).toBe(true);
    expect(mismatchedChild.size).toBe(humanSize * 0.5);
    const mismatchedAdult = createEntity(EntityType.Human, 10, 10, 904, undefined, true, { ageYears: 30 });
    expect(mismatchedAdult.isJuvenile).toBe(false);
    expect(mismatchedAdult.size).toBe(humanSize);
    finalizeSettlerAge(mismatchedChild, { year: 1, dayInYear: 1, tick: 0 });
    expect(mismatchedChild.isJuvenile).toBe(false);
    expect(mismatchedChild.size).toBe(humanSize);
  });
});
