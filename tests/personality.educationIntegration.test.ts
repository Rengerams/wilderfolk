/**
 * The school and research owners read the one aptitude evaluator (`personality/traitEvaluation.ts`).
 *
 * Two live paths are pinned against the owners rather than re-derived formulas:
 * 1. `getEducationResearchMultiplier` keeps the education share as its baseline and multiplies it
 *    once by the collective research factor — no retired per-apt-settler count and no double count.
 * 2. `creditChildSchoolDay` prices the class time one school day costs this pupil from the
 *    `learning` activity, so a pupil whose profile resists structure needs slightly more attendance
 *    for the same day — with the attendance threshold, graduation rule and one-credit-per-day
 *    behaviour otherwise untouched.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import {
  SCHOOL_DAY_MIN_TICKS,
  SCHOOL_HOURS_PER_DAY,
  creditChildSchoolDay,
  getEducationResearchMultiplier,
} from '../src/game/education';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { human } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

const RESEARCH_GENOME = genomeFrom({ reasoning: 95, curiosity: 85, persistence: 80, creativity: 75 });
const SCHOOL_RESISTANT_GENOME = genomeFrom({ curiosity: 10, persistence: 10, discipline: 10, flexibility: 95 });

function adult(id: number, genomeV2: GenomeV2, educated = false): Entity {
  return human(id, { age: 30, isJuvenile: false, genomeV2, educated });
}

function pupil(id: number, genomeV2: GenomeV2, ticksToday: number): Entity {
  return human(id, {
    type: EntityType.Human,
    age: 10,
    isJuvenile: true,
    genomeV2,
    schoolTicksToday: ticksToday,
    schoolDays: 0,
  });
}

describe('the research multiplier takes its factor from the activity registry', () => {
  it('multiplies the education baseline by the settler\'s own research factor', () => {
    const factor = evaluateAptitudeInfluence({ genomeV2: RESEARCH_GENOME }, 'research').factor;
    expect(factor, 'fixture premise: the registry rewards research aptitude').toBeGreaterThan(1);

    expect(getEducationResearchMultiplier([adult(1, genomeFrom())])).toBe(1);
    expect(getEducationResearchMultiplier([adult(1, RESEARCH_GENOME)])).toBeCloseTo(factor, 10);
  });

  it('averages the factor across the adults, so one apt settler cannot carry the colony', () => {
    const factor = evaluateAptitudeInfluence({ genomeV2: RESEARCH_GENOME }, 'research').factor;
    const oneOfFour = getEducationResearchMultiplier([
      adult(1, RESEARCH_GENOME),
      adult(2, genomeFrom()),
      adult(3, genomeFrom()),
      adult(4, genomeFrom()),
    ]);
    expect(oneOfFour).toBeCloseTo(1 + (factor - 1) / 4, 10);
  });

  it('still scales with the share of adults who attended school', () => {
    const mixed = getEducationResearchMultiplier([
      adult(1, genomeFrom(), true),
      adult(2, genomeFrom(), false),
    ]);
    expect(mixed).toBeCloseTo(1 + 0.5 * 0.15, 10);
  });
});

describe('the school-day credit prices the class time from the activity registry', () => {
  it('credits the half-day threshold for a pupil the registry leaves neutral', () => {
    const kid = pupil(1, genomeFrom(), SCHOOL_DAY_MIN_TICKS);
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
  });

  it('costs a pupil whose profile resists structure slightly more attendance', () => {
    const factor = evaluateAptitudeInfluence({ genomeV2: SCHOOL_RESISTANT_GENOME }, 'learning').factor;
    expect(factor, 'the fixture premise: the registry prices this pupil below neutral').toBeLessThan(1);
    const required = SCHOOL_DAY_MIN_TICKS / factor;
    expect(required).toBeGreaterThan(SCHOOL_DAY_MIN_TICKS);

    // The bare threshold is no longer enough for this pupil...
    const short = pupil(1, SCHOOL_RESISTANT_GENOME, SCHOOL_DAY_MIN_TICKS);
    creditChildSchoolDay(short);
    expect(short.schoolDays).toBe(0);

    // ...but a full classroom day (six hours) always is.
    const full = pupil(2, SCHOOL_RESISTANT_GENOME, SCHOOL_HOURS_PER_DAY * TICKS_PER_HOUR);
    creditChildSchoolDay(full);
    expect(full.schoolDays).toBe(1);
  });

  it('still credits at most one school day per day and resets the counter', () => {
    const kid = pupil(1, SCHOOL_RESISTANT_GENOME, SCHOOL_HOURS_PER_DAY * TICKS_PER_HOUR);
    creditChildSchoolDay(kid);
    creditChildSchoolDay(kid);
    expect(kid.schoolDays).toBe(1);
    expect(kid.schoolTicksToday).toBe(0);
  });
});
