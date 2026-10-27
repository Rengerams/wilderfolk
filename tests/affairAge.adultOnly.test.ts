/**
 * Affairs are adult-only on both sides (owner decision, 2026-09-13).
 *
 * The affair floor used to be `HUMAN_ADULT_MIN_AGE` (16 at the time, the then-courtship
 * age) for the *paramour* only, while the daily owner already required the cheater to be
 * married (18+) — so a married adult could take a 16–17-year-old paramour and reach the
 * affair-conception branch, which is outside the youth-love gate that
 * `docs/archive/SIMULATION_AUTHORITY.md` §5 makes the only conception route for
 * ages 12–17. `Relationship.AFFAIR_MIN_AGE` = 18 now gates both participants, and
 * `HUMAN_ADULT_MIN_AGE` itself is 18 since 2026-09-16.
 *
 * These are pure gate tests against the affair owner's own validator: they pin the
 * age floor for the cheater and the paramour, and that 18 is still accepted.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { isValidAffairTarget } from '../src/game/simulation/humanRelationships';
import { Relationship } from '../src/game/gameConstants';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const CHEATER_ID = 1;
const PARAMOUR_ID = 2;

function human(id: number, age: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: id === CHEATER_ID ? 'female' : 'male',
    name: id === CHEATER_ID ? 'Maren' : 'Erik',
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    ...overrides,
  } as Entity;
}

/** A married adult looking for a paramour; the paramour is the entity under test. */
function marriedCheater(age = 30): Entity {
  return human(CHEATER_ID, age, { relationshipStatus: 'married', partnerId: 99 });
}

const TICK = TICKS_PER_DAY;

describe('an affair requires two adults', () => {
  it('sets the floor at 18, above the 16-year courtship age', () => {
    expect(Relationship.AFFAIR_MIN_AGE).toBe(18);
  });

  it('rejects a 16 or 17 year old paramour and accepts an 18 year old', () => {
    expect(isValidAffairTarget(marriedCheater(), human(PARAMOUR_ID, 16), TICK)).toBe(false);
    expect(isValidAffairTarget(marriedCheater(), human(PARAMOUR_ID, 17), TICK)).toBe(false);
    expect(isValidAffairTarget(marriedCheater(), human(PARAMOUR_ID, 18), TICK)).toBe(true);
  });

  it('rejects a cheater below 18 even when the paramour is an adult', () => {
    expect(isValidAffairTarget(marriedCheater(17), human(PARAMOUR_ID, 30), TICK)).toBe(false);
    expect(isValidAffairTarget(marriedCheater(18), human(PARAMOUR_ID, 30), TICK)).toBe(true);
  });

  it('keeps the adult lifespan ceiling independent of the new floor', () => {
    expect(isValidAffairTarget(marriedCheater(), human(PARAMOUR_ID, 90), TICK)).toBe(false);
  });
});
