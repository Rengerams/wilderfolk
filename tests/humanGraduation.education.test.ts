/**
 * A child graduates into adulthood exactly once, and keeps the education payoff.
 *
 * The daily age sync (`syncHumanAgeFromCalendar`) used to write `isJuvenile` itself.
 * `humanTick` calls that sync and then, later in the *same* tick, `tryGraduateHumanChild`,
 * whose guard is `isJuvenile && age >= HUMAN_CHILDHOOD_DAYS`. The sync therefore cleared
 * the flag on precisely the tick when the age crossed 12, so graduation was unsatisfiable:
 * `entity.size`/`speed` were never promoted to adult values and `applyEducationGraduation`
 * — the only writer of `entity.educated`, and the source of the graduation skill and
 * max-energy bonus — never ran for any settler.
 *
 * SCOPE — writer-level tests in the same call order `humanTick` uses (age sync first, then
 * the graduation transition with the callback humanTick passes), which is exactly the
 * ordering the defect lived in.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  HUMAN_CHILDHOOD_DAYS,
  getColonyDay,
  setHumanBirthFromAge,
  syncHumanAgeFromCalendar,
  tryGraduateHumanChild,
} from '../src/game/dayCycle';
import { SCHOOL_GRADUATION_DAYS, applyEducationGraduation, getEducationTier } from '../src/game/education';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

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
    energy: 120,
    maxEnergy: 120,
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

describe('a child graduates once, with the education payoff', () => {
  it('keeps the transition reachable on the age-sync tick', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_DAYS, state);
    state.entities = [child];

    // The sync updates the calendar age and must leave the flag for the transition.
    syncHumanAgeFromCalendar(child, state);
    expect(child.age).toBeGreaterThanOrEqual(HUMAN_CHILDHOOD_DAYS);
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
    const state = initGame({ seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_DAYS, state);
    state.entities = [child];

    expect(syncThenGraduate(state, child)).toBe(true);
    const energyAfterGraduation = child.maxEnergy;

    // Later ticks re-run both calls; the transition must be a no-op now.
    expect(syncThenGraduate(state, child)).toBe(false);
    expect(child.maxEnergy).toBe(energyAfterGraduation);
  });

  it('does not graduate a child who is still below the childhood threshold', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.tick = TICKS_PER_DAY * 10;
    const child = makeChild(HUMAN_CHILDHOOD_DAYS - 1, state);
    state.entities = [child];

    expect(syncThenGraduate(state, child)).toBe(false);
    expect(child.isJuvenile).toBe(true);
    expect(child.size).toBe(7);
    expect(child.educated).toBeUndefined();
  });
});