/**
 * The physiology `labor` activity reaches a player settler's own stamina: a worked shift divides the
 * drain, while merely walking keeps the base drain.
 */
import { describe, expect, it } from 'vitest';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { APTITUDE_DEFS, type GenomeV2 } from '../src/game/settlerTraits';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { genomeFrom } from './helpers/genome';

const START_ENERGY = 400;
const MAX_ENERGY = 500;

/** Endurance profile: high persistence, discipline and composure, low sensitivity. */
const ENDURANCE_GENOME = genomeFrom({ persistence: 95, discipline: 90, composure: 85, sensitivity: 10 });
/** A sensitive profile carries the labor activity's one negative weight. */
const SENSITIVE_GENOME = genomeFrom({ sensitivity: 95, persistence: 15, discipline: 15 });

function worker(genomeV2: GenomeV2): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    alive: true,
    isJuvenile: false,
    genomeV2,
    energy: START_ENERGY,
    maxEnergy: MAX_ENERGY,
    needs: initialHumanNeeds(START_ENERGY, MAX_ENERGY),
  } as Entity;
}

/** Stamina left after `hours` of uninterrupted work, driven through the real mutator. */
function staminaAfterWork(genomeV2: GenomeV2, hours: number): number {
  const entity = worker(genomeV2);
  for (let hour = 0; hour < hours; hour++) {
    advanceHumanNeeds(entity, {
      tick: hour, elapsedTicks: TICKS_PER_HOUR, sleeping: false, working: true, moving: false,
    });
  }
  return entity.needs!.stamina;
}

/** Stamina left after `hours` of walking with no shift. */
function staminaAfterWalk(genomeV2: GenomeV2, hours: number): number {
  const entity = worker(genomeV2);
  for (let hour = 0; hour < hours; hour++) {
    advanceHumanNeeds(entity, {
      tick: hour, elapsedTicks: TICKS_PER_HOUR, sleeping: false, working: false, moving: true,
    });
  }
  return entity.needs!.stamina;
}

describe('a player settler\'s work drain follows its own aptitudes', () => {
  it('prices the labor activity on a shift only, not while walking', () => {
    expect(staminaAfterWalk(ENDURANCE_GENOME, 2)).toBe(staminaAfterWalk(genomeFrom(), 2));
    expect(staminaAfterWalk(SENSITIVE_GENOME, 2)).toBe(staminaAfterWalk(genomeFrom(), 2));
    // The same settler still differs once hours are worked.
    expect(staminaAfterWork(ENDURANCE_GENOME, 2)).toBeGreaterThan(staminaAfterWork(genomeFrom(), 2));
  });

  it('makes an enduring and a sensitive settler differ from a neutral one on the same shift', () => {
    const plain = staminaAfterWork(genomeFrom(), 2);
    const enduring = staminaAfterWork(ENDURANCE_GENOME, 2);
    const sensitive = staminaAfterWork(SENSITIVE_GENOME, 2);

    expect(evaluateAptitudeInfluence({ genomeV2: ENDURANCE_GENOME }, 'labor').factor,
      'fixture premise: the registry rewards endurance at hard labor').toBeGreaterThan(1);
    expect(evaluateAptitudeInfluence({ genomeV2: SENSITIVE_GENOME }, 'labor').factor,
      'fixture premise: the registry prices sensitivity during labor').toBeLessThan(1);

    expect(enduring).toBeGreaterThan(plain);
    expect(sensitive).toBeLessThan(plain);
  });

  it('leaves a neutral settler on the documented base drain', () => {
    const drained = worker(genomeFrom()).needs!.stamina - staminaAfterWork(genomeFrom(), 2);
    expect(drained).toBeGreaterThan(0);
    expect(staminaAfterWork(genomeFrom(), 2)).toBeCloseTo(80 - 18, 6);
  });
});

describe('aptitude wording names no effect the game does not perform', () => {
  it('claims no maturation or captive-only energy effect', () => {
    for (const def of Object.values(APTITUDE_DEFS)) {
      const copy = `${def.high} ${def.low}`.toLowerCase();
      expect(copy).not.toContain('mature');
      expect(copy).not.toContain('energy');
      expect(copy).not.toContain('winter');
    }
  });
});
