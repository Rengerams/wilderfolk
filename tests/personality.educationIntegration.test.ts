/**
 * PR B — the school consumers read the one trait evaluator (`personality/traitEvaluation.ts`).
 *
 * Two live school paths are pinned, against the owners rather than re-derived formulas:
 * 1. `getEducationResearchMultiplier` (read by `research.ts`) takes *who is research-apt* from the
 *    catalog's `school`/research context, while the +3%-per-settler scale and its 15% cap stay the
 *    education owner's own.
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

describe('the research multiplier takes its aptitude rule from the catalog', () => {
  it('pays only for settlers the catalog calls research-apt', () => {
    const plain = getEducationResearchMultiplier([adult(1, [])]);
    const insightful = getEducationResearchMultiplier([adult(1, ['insightful'])]);

    expect(evaluateTraitInfluence({ traits: ['insightful'] }, RESEARCH).factor).toBeGreaterThan(1);
    expect(evaluateTraitInfluence({ traits: ['hardy'] }, RESEARCH)).toEqual({ factor: 1, tendency: 0 });
    expect(plain).toBe(1);
    expect(insightful).toBeCloseTo(1.03, 10);
    expect(getEducationResearchMultiplier([adult(1, ['hardy'])])).toBe(plain);
  });

  it('keeps the education owner\'s own 3%-per-settler term and its 15% cap', () => {
    const twoApt = getEducationResearchMultiplier([adult(1, ['insightful']), adult(2, ['insightful'])]);
    expect(twoApt).toBeCloseTo(1.06, 10);
    // Six apt adults reach the cap; a seventh adds nothing.
    const many = getEducationResearchMultiplier(
      Array.from({ length: 7 }, (_, i) => adult(i + 1, ['insightful'])),
    );
    expect(many).toBeCloseTo(1.15, 10);
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
