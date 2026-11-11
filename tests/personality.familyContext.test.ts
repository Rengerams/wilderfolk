import { describe, expect, it } from 'vitest';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { TICKS_PER_DAY, killHuman } from '../src/game/dayCycle';
import { human } from '../src/test/factories';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { genomeFrom } from './helpers/genome';

const SPOUSAL_GRIEF_DAYS = 7;
const REMOVAL_TICK = TICKS_PER_DAY;

/** High composure, flexibility and persistence, low sensitivity: the positive recovery profile. */
const CALM_GENOME = genomeFrom({ composure: 95, flexibility: 90, persistence: 85, sensitivity: 10 });
/** The bereavement activity's one negative weight, plus low positive dimensions. */
const SENSITIVE_GENOME = genomeFrom({ sensitivity: 95, composure: 15, flexibility: 15, persistence: 15 });

const griefDays = (genomeV2: GenomeV2): number =>
  SPOUSAL_GRIEF_DAYS / evaluateAptitudeInfluence({ genomeV2 }, 'bereavement').factor;

/** The owner's formula: `Math.max(prior, tick + TICKS_PER_DAY * griefDays)`. */
const griefUntilTick = (genomeV2: GenomeV2, tick: number | null, prior: number | undefined): number | undefined => {
  if (tick == null) return prior;
  return Math.max(prior ?? 0, tick + TICKS_PER_DAY * griefDays(genomeV2));
};

describe('spousal grief follows the bereavement activity', () => {
  it('keeps a neutral settler at seven days, shortens recovery for a composed one and lengthens it for a sensitive one', () => {
    expect(griefDays(genomeFrom())).toBe(SPOUSAL_GRIEF_DAYS);
    expect(griefDays(CALM_GENOME)).toBeLessThan(SPOUSAL_GRIEF_DAYS);
    expect(griefDays(SENSITIVE_GENOME)).toBeGreaterThan(SPOUSAL_GRIEF_DAYS);
    for (const genomeV2 of [genomeFrom(), CALM_GENOME, SENSITIVE_GENOME]) {
      expect(griefDays(genomeV2)).toBeGreaterThanOrEqual(SPOUSAL_GRIEF_DAYS / 1.15 - 1e-9);
      expect(griefDays(genomeV2)).toBeLessThanOrEqual(SPOUSAL_GRIEF_DAYS / 0.85 + 1e-9);
    }
  });

  it('keeps the tick-null guard and the never-shorten maximum', () => {
    expect(griefUntilTick(genomeFrom(), null, undefined)).toBeUndefined();
    const longExisting = 5000 + 30 * TICKS_PER_DAY;
    expect(griefUntilTick(CALM_GENOME, 5000, longExisting)).toBe(longExisting);
    expect(griefUntilTick(genomeFrom(), 5000, undefined)).toBe(5000 + 7 * TICKS_PER_DAY);
  });

  it('writes the same grief window at the owner boundary', () => {
    const widowGrief = (genomeV2: GenomeV2): number => {
      const dead = human(1, { gender: 'male', age: 41, partnerId: 2, relationshipStatus: 'married' });
      const widow = human(2, { gender: 'female', age: 38, partnerId: 1, relationshipStatus: 'married', genomeV2 });
      const byId = new Map<number, typeof dead>([[1, dead], [2, widow]]);
      killHuman(dead, [], byId, REMOVAL_TICK);
      return widow.griefUntilTick ?? -1;
    };
    expect(widowGrief(genomeFrom())).toBeCloseTo(REMOVAL_TICK + 7 * TICKS_PER_DAY, 6);
    expect(widowGrief(CALM_GENOME)).toBeLessThan(widowGrief(genomeFrom()));
    expect(widowGrief(SENSITIVE_GENOME)).toBeGreaterThan(widowGrief(genomeFrom()));
  });

  it('leaves the secret lover at three days across a real death, independent of the spousal window', () => {
    const deathWindows = (loverGenome: GenomeV2, widowGenome: GenomeV2): { lover: number; widow: number } => {
      const dead = human(1, {
        gender: 'male',
        age: 41,
        partnerId: 3,
        relationshipStatus: 'married',
        affairPartnerId: 2,
      });
      const lover = human(2, { gender: 'female', age: 33, affairPartnerId: 1, genomeV2: loverGenome });
      const widow = human(3, { gender: 'male', age: 44, partnerId: 1, relationshipStatus: 'married', genomeV2: widowGenome });
      const byId = new Map([[1, dead], [2, lover], [3, widow]]);
      killHuman(dead, [], byId, REMOVAL_TICK);
      return { lover: lover.griefUntilTick ?? -1, widow: widow.griefUntilTick ?? -1 };
    };

    expect(deathWindows(genomeFrom(), genomeFrom())).toEqual({
      lover: REMOVAL_TICK + 3 * TICKS_PER_DAY,
      widow: REMOVAL_TICK + 7 * TICKS_PER_DAY,
    });
    expect(deathWindows(CALM_GENOME, CALM_GENOME).lover, 'the secret-lover window is not the spousal window')
      .toBe(REMOVAL_TICK + 3 * TICKS_PER_DAY);
    expect(deathWindows(CALM_GENOME, CALM_GENOME).widow).toBeLessThan(REMOVAL_TICK + 7 * TICKS_PER_DAY);

    const calm = evaluateAptitudeInfluence({ genomeV2: CALM_GENOME }, 'bereavement');
    expect(calm.factor).toBeGreaterThan(1);
    expect(calm.factor).toBeLessThanOrEqual(1.15);
  });
});
