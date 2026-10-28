import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SettlerTrait } from '../src/game/gameTypes';
import {
  evaluateTraitInfluence,
  evaluateTraitParityValue,
  evaluateTraitParityVote,
} from '../src/game/personality/traitEvaluation';
import type { TraitContext } from '../src/game/personality/traitEffectCatalog';

type Traits = readonly SettlerTrait[];

const BEREAVEMENT = { kind: 'family', activity: 'bereavement' } as const satisfies TraitContext;
const BANTER = { kind: 'social', activity: 'banter' } as const satisfies TraitContext;
const MERCY = { kind: 'civic', activity: 'mercy' } as const satisfies TraitContext;

const SPOUSAL_GRIEF_DAYS = 7;
const BANTER_BASE_CHANCE = 0.08;

// AS-IS references: the retired direct trait checks on each owner path.
const legacyGriefDays = (traits: Traits | null | undefined): number => (traits?.includes('stoic') ? 5 : SPOUSAL_GRIEF_DAYS);
const griefDays = (traits: Traits | null | undefined): number =>
  evaluateTraitParityValue({ traits }, BEREAVEMENT) ?? SPOUSAL_GRIEF_DAYS;

const legacyBanterChance = (traits: Traits | null | undefined): number =>
  (traits?.includes('intuitive') ? 0.11 : BANTER_BASE_CHANCE);
const banterChance = (traits: Traits | null | undefined): number =>
  evaluateTraitParityValue({ traits }, BANTER) ?? BANTER_BASE_CHANCE;

const legacyRestraint = (people: ReadonlyArray<Traits | null | undefined>): number =>
  people.filter((traits) => traits?.some((trait) => trait === 'nurturing' || trait === 'chivalrous')).length;
const legacySeverity = (people: ReadonlyArray<Traits | null | undefined>): number =>
  people.filter((traits) => traits?.includes('fierce')).length;
const restraintVotes = (people: ReadonlyArray<Traits | null | undefined>): number =>
  people.filter((traits) => evaluateTraitParityVote({ traits }, MERCY, 'restraint')).length;
const severityVotes = (people: ReadonlyArray<Traits | null | undefined>): number =>
  people.filter((traits) => evaluateTraitParityVote({ traits }, MERCY, 'severity')).length;

const traitSets: Array<Traits | null | undefined> = [
  undefined,
  null,
  [],
  ['stoic'],
  ['brave'],
  ['stoic', 'brave'],
  ['intuitive'],
  ['intuitive', 'stoic'],
  ['nurturing'],
  ['chivalrous'],
  ['fierce'],
  ['chivalrous', 'fierce'],
];

describe('spousal grief parity', () => {
  it('keeps Stoic at 5 days and everyone else at 7', () => {
    expect(evaluateTraitParityValue({ traits: ['stoic'] }, BEREAVEMENT)).toBe(5);
    expect(evaluateTraitParityValue({ traits: ['nurturing'] }, BEREAVEMENT)).toBeUndefined();
    for (const traits of traitSets) {
      expect(griefDays(traits)).toBe(legacyGriefDays(traits));
    }
  });

  it('leaves affair grief untouched', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/humanLifecycleCleanup.ts'), 'utf8');
    const loverLine = source.split('\n').find((line) => line.includes('lover.griefUntilTick'));
    expect(loverLine).toBeDefined();
    expect(loverLine).toContain('TICKS_PER_DAY * 3');
    expect(loverLine).not.toContain('evaluateTraitParityValue');
  });

  it('keeps the bounded bereavement projection separate from the mourning window', () => {
    const stoic = evaluateTraitInfluence({ traits: ['stoic'] }, BEREAVEMENT);
    expect(stoic.factor).toBeGreaterThan(1);
    expect(stoic.factor).toBeLessThanOrEqual(1.15);
    expect(evaluateTraitParityValue({ traits: ['stoic'] }, BEREAVEMENT)).toBe(5);
  });
});

describe('work banter parity', () => {
  it('keeps Intuitive at 0.11 against the ordinary 0.08', () => {
    expect(evaluateTraitParityValue({ traits: ['intuitive'] }, BANTER)).toBe(0.11);
    expect(evaluateTraitParityValue({ traits: ['brave'] }, BANTER)).toBeUndefined();
    for (const traits of traitSets) {
      expect(banterChance(traits)).toBe(legacyBanterChance(traits));
    }
  });
});

describe('civic voice parity', () => {
  it('counts one restraint vote for Nurturing or Chivalrous and a separate severity vote for Fierce', () => {
    expect(evaluateTraitParityVote({ traits: ['nurturing'] }, MERCY, 'restraint')).toBe(true);
    expect(evaluateTraitParityVote({ traits: ['chivalrous'] }, MERCY, 'restraint')).toBe(true);
    expect(evaluateTraitParityVote({ traits: ['fierce'] }, MERCY, 'severity')).toBe(true);
    expect(evaluateTraitParityVote({ traits: ['fierce'] }, MERCY, 'restraint')).toBe(false);
    expect(evaluateTraitParityVote({ traits: ['brave'] }, MERCY, 'severity')).toBe(false);
    expect(evaluateTraitParityVote({}, MERCY, 'restraint')).toBe(false);
    expect(evaluateTraitParityVote({ traits: null }, MERCY, 'restraint')).toBe(false);
  });

  it('lets a Chivalrous Fierce villager vote in both categories, as before', () => {
    const both = ['chivalrous', 'fierce'] as const;
    expect(evaluateTraitParityVote({ traits: both }, MERCY, 'restraint')).toBe(true);
    expect(evaluateTraitParityVote({ traits: both }, MERCY, 'severity')).toBe(true);
  });

  it('reproduces the old community counts exactly', () => {
    expect(restraintVotes(traitSets)).toBe(legacyRestraint(traitSets));
    expect(severityVotes(traitSets)).toBe(legacySeverity(traitSets));
  });
});
