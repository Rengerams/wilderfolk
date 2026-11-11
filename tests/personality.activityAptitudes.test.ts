/**
 * Every inherited aptitude dimension must have a real upward and downward effect, and every declared
 * activity must be reachable through the live owner that reads it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APTITUDE_ACTIVITIES,
  APTITUDE_ACTIVITY_IDS,
  APTITUDE_ACTIVITY_OWNERS,
} from '../src/game/personality/activityAptitudes';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import {
  APTITUDE_IDS,
  normalizeGenome,
  rollFounderGenome,
  type GeneticAptitude,
} from '../src/game/settlerTraits';
import { PERSONAL_MARK_IDS } from '../src/game/personalMarks';
import { createSeededRng } from '../src/game/simRng';
import { genomeFrom } from './helpers/genome';

function activitiesFor(aptitude: GeneticAptitude): Array<'benefit' | 'drawback'> {
  const signs: Array<'benefit' | 'drawback'> = [];
  for (const activity of APTITUDE_ACTIVITY_IDS) {
    for (const entry of APTITUDE_ACTIVITIES[activity].weights) {
      if (entry.aptitude !== aptitude) continue;
      if (entry.weight > 0) signs.push('benefit');
      if (entry.weight < 0) signs.push('drawback');
    }
  }
  return signs;
}

describe('activity aptitude registry', () => {
  it('declares every activity once with a label, a real cap and non-zero signed inputs', () => {
    expect(APTITUDE_ACTIVITY_IDS).toHaveLength(Object.keys(APTITUDE_ACTIVITIES).length);
    expect(new Set(APTITUDE_ACTIVITY_IDS).size).toBe(APTITUDE_ACTIVITY_IDS.length);
    for (const activity of APTITUDE_ACTIVITY_IDS) {
      const profile = APTITUDE_ACTIVITIES[activity];
      expect(profile.id).toBe(activity);
      expect(profile.label.length).toBeGreaterThan(0);
      expect(profile.cap).toBeGreaterThanOrEqual(0.05);
      expect(profile.cap).toBeLessThanOrEqual(0.2);
      // A mark-only activity (conception) carries no alleles but still carries signed inputs.
      const markCount = profile.marks?.length ?? 0;
      const hasSignedInputs = profile.weights.length >= 3
        || (profile.weights.length === 0 && markCount >= 1);
      expect(hasSignedInputs, activity).toBe(true);
      const seen = new Set<GeneticAptitude>();
      for (const entry of profile.weights) {
        expect(APTITUDE_IDS).toContain(entry.aptitude);
        expect(entry.weight).not.toBe(0);
        expect(seen.has(entry.aptitude), `${activity}/${entry.aptitude}`).toBe(false);
        seen.add(entry.aptitude);
      }
      const seenMarks = new Set<string>();
      for (const entry of profile.marks ?? []) {
        expect(PERSONAL_MARK_IDS).toContain(entry.mark);
        expect(entry.weight).not.toBe(0);
        expect(seenMarks.has(entry.mark), `${activity}/${entry.mark}`).toBe(false);
        seenMarks.add(entry.mark);
      }
    }
  });

  it('gives every one of the fourteen dimensions both an upward and a downward weight', () => {
    for (const aptitude of APTITUDE_IDS) {
      const signs = activitiesFor(aptitude);
      expect(signs, aptitude).toContain('benefit');
      expect(signs, aptitude).toContain('drawback');
    }
  });

  it('makes every dimension observably help one live activity and hurt another', () => {
    for (const aptitude of APTITUDE_IDS) {
      const subject = { genomeV2: genomeFrom({ [aptitude]: 90 }) };
      const helped = APTITUDE_ACTIVITY_IDS.filter((activity) => {
        const profile = APTITUDE_ACTIVITIES[activity];
        if (!profile.weights.some((weight) => weight.aptitude === aptitude)) return false;
        const factor = evaluateAptitudeInfluence(subject, activity).factor;
        // A cost activity rewards a lower factor, so the good direction is inverted.
        return profile.cost === true ? factor < 1 : factor > 1;
      });
      const hurt = APTITUDE_ACTIVITY_IDS.filter((activity) => {
        const profile = APTITUDE_ACTIVITIES[activity];
        if (!profile.weights.some((weight) => weight.aptitude === aptitude)) return false;
        const factor = evaluateAptitudeInfluence(subject, activity).factor;
        return profile.cost === true ? factor > 1 : factor < 1;
      });
      expect(helped.length, `${aptitude} has no upward activity`).toBeGreaterThan(0);
      expect(hurt.length, `${aptitude} has no downward activity`).toBeGreaterThan(0);
    }
  });

  it('wires every activity into its declared live owner call site', () => {
    for (const activity of APTITUDE_ACTIVITY_IDS) {
      const owner = APTITUDE_ACTIVITY_OWNERS[activity];
      const source = readFileSync(join(process.cwd(), owner), 'utf8');
      expect(source.includes(`'${activity}'`), `${activity} not referenced by ${owner}`).toBe(true);
    }
  });

  it('gives every generated settler at least one buff and one debuff across the live activity portfolio', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const genome = rollFounderGenome(createSeededRng(seed, 'coverageTest'));
      const factors = APTITUDE_ACTIVITY_IDS.map((activity) => {
        const profile = APTITUDE_ACTIVITIES[activity];
        const factor = evaluateAptitudeInfluence({ genomeV2: genome }, activity).factor;
        // Normalize a cost activity so "buff" always means good for this settler.
        return profile.cost === true ? 2 - factor : factor;
      });
      expect(factors.some((factor) => factor > 1), `seed ${seed} has no buff`).toBe(true);
      expect(factors.some((factor) => factor < 1), `seed ${seed} has no debuff`).toBe(true);
    }
  });

  it('gives every settler in a real generated colony a buff and a debuff', () => {
    const state = initGame({ size: 'medium' });
    const settlers = state.entities.filter((entity) => entity.type === EntityType.Human && entity.alive);
    expect(settlers.length).toBeGreaterThan(0);
    for (const settler of settlers) {
      expect(normalizeGenome(settler.genomeV2), `settler ${settler.id}`).toBeDefined();
      const factors = APTITUDE_ACTIVITY_IDS.map((activity) => {
        const factor = evaluateAptitudeInfluence(settler, activity).factor;
        return APTITUDE_ACTIVITIES[activity].cost === true ? 2 - factor : factor;
      });
      expect(factors.some((factor) => factor > 1), `settler ${settler.id} has no buff`).toBe(true);
      expect(factors.some((factor) => factor < 1), `settler ${settler.id} has no debuff`).toBe(true);
    }
  });

  it('makes each genetically priced activity non-neutral for at least one realistic genome', () => {
    for (const activity of APTITUDE_ACTIVITY_IDS) {
      if (APTITUDE_ACTIVITIES[activity].weights.length === 0) continue;
      let nonNeutral = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const genome = rollFounderGenome(createSeededRng(seed, 'reachabilityTest'));
        if (Math.abs(evaluateAptitudeInfluence({ genomeV2: genome }, activity).factor - 1) > 0.005) nonNeutral++;
      }
      expect(nonNeutral, activity).toBeGreaterThan(0);
    }
  });

  it('keeps conception genetically neutral and driven only by an acquired mark', () => {
    expect(APTITUDE_ACTIVITIES.conception.weights).toHaveLength(0);
    const genome = rollFounderGenome(createSeededRng(5, 'conceptionNeutral'));
    expect(evaluateAptitudeInfluence({ genomeV2: genome }, 'conception').factor).toBe(1);
    const lucky = evaluateAptitudeInfluence(
      { genomeV2: genome, marks: [{ id: 'lucky', day: 3, source: 'raidVictory' }] },
      'conception',
    );
    expect(lucky.factor).toBeGreaterThan(1);
  });
});
