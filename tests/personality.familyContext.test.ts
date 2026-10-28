import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import { TICKS_PER_DAY, killHuman } from '../src/game/dayCycle';
import { human } from '../src/test/factories';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';

type Traits = readonly SettlerTrait[];

const SPOUSAL_BEREAVEMENT = { kind: 'family', activity: 'spousalBereavement' } as const;
const BEREAVEMENT = { kind: 'family', activity: 'bereavement' } as const;

const SPOUSAL_GRIEF_DAYS = 7;
const REMOVAL_TICK = TICKS_PER_DAY;

/** AS-IS reference: the retired direct Stoic check on the spousal grief path. */
const legacyGriefDays = (traits: Traits | null | undefined): number =>
  (traits?.includes('stoic') ? 5 : SPOUSAL_GRIEF_DAYS);
const griefDays = (traits: Traits | null | undefined): number =>
  evaluateTraitInfluence({ traits }, SPOUSAL_BEREAVEMENT).exact.durationDaysOverride ?? SPOUSAL_GRIEF_DAYS;

/** AS-IS reference: `Math.max(prior, tick + TICKS_PER_DAY * griefDays)`. */
const griefUntilTick = (
  traits: Traits | null | undefined,
  tick: number | null,
  prior: number | undefined,
  legacy: boolean,
): number | undefined => {
  if (tick == null) return prior;
  const days = legacy ? legacyGriefDays(traits) : griefDays(traits);
  return Math.max(prior ?? 0, tick + TICKS_PER_DAY * days);
};

const traitSets: Array<Traits | null | undefined> = [
  undefined,
  null,
  [],
  ['stoic'],
  ['brave'],
  ['stoic', 'brave'],
  ['nurturing'],
  ['stoic', 'nurturing'],
];

describe('spousal grief parity', () => {
  it('keeps Stoic at 5 days and everyone else at 7', () => {
    expect(evaluateTraitInfluence({ traits: ['stoic'] }, SPOUSAL_BEREAVEMENT).exact.durationDaysOverride).toBe(5);
    expect(evaluateTraitInfluence({ traits: ['nurturing'] }, SPOUSAL_BEREAVEMENT).exact.durationDaysOverride)
      .toBeUndefined();
    for (const traits of traitSets) {
      expect(griefDays(traits), JSON.stringify(traits)).toBe(legacyGriefDays(traits));
    }
  });

  it('does not turn Nurturing into longer grief', () => {
    expect(griefDays(['nurturing'])).toBe(SPOUSAL_GRIEF_DAYS);
    expect(griefDays(['stoic', 'nurturing'])).toBe(legacyGriefDays(['stoic', 'nurturing']));
    expect(griefDays(['stoic', 'nurturing'])).toBe(5);
  });

  it('keeps the tick-null guard and the never-shorten maximum', () => {
    for (const traits of traitSets) {
      expect(griefUntilTick(traits, 1000, undefined, false)).toBe(griefUntilTick(traits, 1000, undefined, true));
      expect(griefUntilTick(traits, null, undefined, false)).toBeUndefined();
    }
    const longExisting = 5000 + 30 * TICKS_PER_DAY;
    expect(griefUntilTick(['stoic'], 5000, longExisting, false)).toBe(longExisting);
    expect(griefUntilTick(['stoic'], 5000, longExisting, false))
      .toBe(griefUntilTick(['stoic'], 5000, longExisting, true));
    expect(griefUntilTick(['brave'], 5000, undefined, false)).toBe(5000 + 7 * TICKS_PER_DAY);
    expect(griefUntilTick(['stoic'], 5000, undefined, false)).toBe(5000 + 5 * TICKS_PER_DAY);
  });

  it('writes the same grief window at the owner boundary', () => {
    const widowGrief = (traits: Traits): number => {
      const dead = human(1, { gender: 'male', age: 41, partnerId: 2, relationshipStatus: 'married' });
      const widow = human(2, { gender: 'female', age: 38, partnerId: 1, relationshipStatus: 'married', traits: [...traits] });
      const byId = new Map<number, typeof dead>([[1, dead], [2, widow]]);
      killHuman(dead, [], byId, REMOVAL_TICK);
      return widow.griefUntilTick ?? -1;
    };
    expect(widowGrief(['stoic'])).toBe(REMOVAL_TICK + 5 * TICKS_PER_DAY);
    expect(widowGrief(['brave'])).toBe(REMOVAL_TICK + 7 * TICKS_PER_DAY);
    expect(widowGrief(['nurturing'])).toBe(REMOVAL_TICK + 7 * TICKS_PER_DAY);
    expect(widowGrief([])).toBe(REMOVAL_TICK + 7 * TICKS_PER_DAY);
  });

  it('leaves the secret lover at 3 days and the ordinary bereavement projection untouched', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/humanLifecycleCleanup.ts'), 'utf8');
    const loverLine = source.split('\n').find((line) => line.includes('lover.griefUntilTick'));
    expect(loverLine).toBeDefined();
    expect(loverLine).toContain('TICKS_PER_DAY * 3');
    expect(loverLine).not.toContain('evaluateTraitInfluence');

    const stoic = evaluateTraitInfluence({ traits: ['stoic'] }, BEREAVEMENT);
    expect(stoic.factor).toBeGreaterThan(1);
    expect(stoic.factor).toBeLessThanOrEqual(1.15);
    expect(evaluateTraitInfluence({ traits: ['stoic'] }, SPOUSAL_BEREAVEMENT).exact.durationDaysOverride).toBe(5);
  });
});
