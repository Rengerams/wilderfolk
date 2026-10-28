/**
 * PR B — the school consumers read the one trait evaluator (`personality/traitEvaluation.ts`).
 *
 * Two live school paths are pinned, against the owners rather than re-derived formulas:
 * 1. `getEducationResearchMultiplier` (read by `research.ts`) keeps the education share as its
 *    baseline and multiplies it once by the collective `school`/research DNA factor — the retired
 *    +3%-per-apt-settler count and its 15% cap are gone, so an aptitude bonus cannot be counted twice.
 * 2. `creditChildSchoolDay` prices the class time one school day costs this pupil from the catalog's
 *    `school`/learning context, so a child whose DNA resists structure needs slightly more attendance
 *    for the same day — with the attendance threshold, the graduation rule and one-credit-per-day
 *    behaviour otherwise untouched.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, SettlerTrait } from '../src/game/gameTypes';
import {
  SCHOOL_DAY_MIN_TICKS,
  SCHOOL_HOURS_PER_DAY,
  creditChildSchoolDay,
  getEducationResearchMultiplier,
} from '../src/game/education';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { human } from '../src/test/factories';

const LEARNING = { kind: 'school', activity: 'learning' } as const;
const RESEARCH = { kind: 'school', activity: 'research' } as const;

function adult(id: number, traits: SettlerTrait[], educated = false): Entity {
  return human(id, { age: 30, isJuvenile: false, traits, educated });
}

function pupil(id: number, traits: SettlerTrait[], ticksToday: number): Entity {
  return human(id, {
    type: EntityType.Human,
    age: 10,
    isJuvenile: true,
    traits,
    schoolTicksToday: ticksToday,
    schoolDays: 0,
  });
}

describe('the research multiplier takes its DNA factor from the catalog', () => {
  it('multiplies the education baseline by the settler\'s own research factor', () => {
    const factor = evaluateTraitInfluence({ traits: ['insightful'] }, RESEARCH).factor;
    expect(factor, 'fixture premise: the catalog rewards research aptitude').toBeGreaterThan(1);

    expect(getEducationResearchMultiplier([adult(1, [])])).toBe(1);
    expect(getEducationResearchMultiplier([adult(1, ['insightful'])])).toBeCloseTo(factor, 10);
    expect(evaluateTraitInfluence({ traits: ['hardy'] }, RESEARCH)).toEqual({ factor: 1, tendency: 0 });
    expect(getEducationResearchMultiplier([adult(1, ['hardy'])])).toBe(1);
  });

  it('averages the DNA across the adults, so one apt settler cannot carry the colony', () => {
    const factor = evaluateTraitInfluence({ traits: ['insightful'] }, RESEARCH).factor;
    const oneOfFour = getEducationResearchMultiplier([
      adult(1, ['insightful']),
      adult(2, []),
      adult(3, []),
      adult(4, []),
    ]);
    expect(oneOfFour).toBeCloseTo(1 + (factor - 1) / 4, 10);
  });

  it('still scales with the share of adults who attended school', () => {
    const mixed = getEducationResearchMultiplier([
      adult(1, [], true),
      adult(2, [], false),
    ]);
    expect(mixed).toBeCloseTo(1 + 0.5 * 0.15, 10);
  });
});

describe('the school-day credit prices the class time from the catalog', () => {
  it('credits the half-day threshold for a pupil the catalog leaves neutral', () => {
    const kid = pupil(1, [], SCHOOL_DAY_MIN_TICKS);
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
  });

  it('costs a pupil whose DNA resists structure slightly more attendance', () => {
    const factor = evaluateTraitInfluence({ traits: ['resourceful'] }, LEARNING).factor;
    expect(factor, 'the fixture premise: the catalog prices this pupil below neutral').toBeLessThan(1);
    const required = SCHOOL_DAY_MIN_TICKS / factor;
    expect(required).toBeGreaterThan(SCHOOL_DAY_MIN_TICKS);

    // The bare threshold is no longer enough for this pupil...
    const short = pupil(1, ['resourceful'], SCHOOL_DAY_MIN_TICKS);
    creditChildSchoolDay(short);
    expect(short.schoolDays).toBe(0);

    // ...but a full classroom day (six hours) always is.
    const full = pupil(2, ['resourceful'], SCHOOL_HOURS_PER_DAY * TICKS_PER_HOUR);
    creditChildSchoolDay(full);
    expect(full.schoolDays).toBe(1);
  });

  it('still credits at most one school day per day and resets the counter', () => {
    const kid = pupil(1, ['resourceful'], SCHOOL_HOURS_PER_DAY * TICKS_PER_HOUR);
    creditChildSchoolDay(kid);
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
    expect(kid.schoolTicksToday).toBe(0);
  });
});
