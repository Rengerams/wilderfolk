import { describe, expect, it } from 'vitest';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { TRAIT_EFFECTS } from '../src/game/personality/traitEffectCatalog';
import { TRAIT_POOL } from '../src/game/settlerTraits';
import type { SettlerTrait } from '../src/game/gameTypes';
import { snapshotSimRng } from '../src/game/simRng';
import { applyWarCommunityReaction } from '../src/game/warPrisoners';
import { finalizeHumanDeath } from '../src/game/humanLifecycleCleanup';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { initGame } from '../src/game/worldGen';

const courtship = { kind: 'social', activity: 'courtship', exact: true } as const;
const conception = { kind: 'family', activity: 'conception', exact: true } as const;
const banter = { kind: 'social', activity: 'workplaceBanter', exact: true } as const;
const grief = { kind: 'family', activity: 'bereavement', exact: true } as const;
const mercy = { kind: 'civic', activity: 'mercy', exact: true } as const;
const subject = (...traits: SettlerTrait[]) => ({ traits });
const clash = (a: readonly SettlerTrait[], b: readonly SettlerTrait[]) =>
  evaluateTraitInfluence({ traits: a }, { kind: 'social', activity: 'conflict', exact: true, other: { traits: b } }).clashCount;

function human(id: number, traits: SettlerTrait[] = [], extra: Partial<Entity> = {}): Entity {
  return {
    id, type: EntityType.Human, name: 'Resident' + id,
    alive: true, age: 30, energy: 100, maxEnergy: 100, traits, ...extra,
  } as Entity;
}

describe('PR C exact catalog decisions preserve pre-migration gameplay', () => {
  it('retains all fourteen ordinary profiles alongside extra context rules', () => {
    expect(Object.keys(TRAIT_EFFECTS).sort()).toEqual([...TRAIT_POOL].sort());
    for (const trait of TRAIT_POOL) {
      expect(TRAIT_EFFECTS[trait].benefit).toBeDefined();
      expect(TRAIT_EFFECTS[trait].drawback).toBeDefined();
    }
  });

  it('keeps courtship factor order and exact legacy values outside the normal cap', () => {
    expect(evaluateTraitInfluence(subject(), courtship).courtshipFactors).toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence(subject('gregarious'), courtship).courtshipFactors).toEqual([1.4, 1, 1]);
    expect(evaluateTraitInfluence(subject('timid'), courtship).courtshipFactors).toEqual([1, 0.7, 1]);
    expect(evaluateTraitInfluence(subject('graceful'), courtship).courtshipFactors).toEqual([1, 1, 1.2]);
    expect(evaluateTraitInfluence(subject('gregarious', 'graceful'), courtship).courtshipFactors)
      .toEqual([1.4, 1, 1.2]);
    expect(evaluateTraitInfluence(subject('timid', 'graceful'), courtship).courtshipFactors)
      .toEqual([1, 0.7, 1.2]);
    expect(evaluateTraitInfluence(subject('lucky'), courtship).courtshipFactors).toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence(subject('timid'), { kind: 'social', activity: 'courtship' }).factor)
      .toBeGreaterThanOrEqual(0.85);
  });

  it('preserves Lucky conception ×1.15 without gating non-Lucky mothers', () => {
    expect(evaluateTraitInfluence(subject(), conception).factor).toBe(1);
    expect(evaluateTraitInfluence(subject('brave'), conception).factor).toBe(1);
    expect(evaluateTraitInfluence(subject('lucky'), conception).factor).toBe(1.15);
    expect(evaluateTraitInfluence(subject('lucky', 'nurturing'), conception).factor).toBe(1.15);
    const baseChance = 0.05;
    expect(baseChance * evaluateTraitInfluence(subject(), conception).factor).toBe(baseChance);
    expect(baseChance * evaluateTraitInfluence(subject('lucky'), conception).factor)
      .toBe(baseChance * 1.15);
  });

  it('keeps workplace banter at 8% baseline and 11% for Intuitive', () => {
    expect(evaluateTraitInfluence(subject('intuitive'), banter).banterChance).toBe(0.11);
    expect(evaluateTraitInfluence(subject(), banter).banterChance ?? 0.08).toBe(0.08);
    expect(evaluateTraitInfluence(subject('lucky'), banter).banterChance ?? 0.08).toBe(0.08);
  });

  it('preserves Stoic five-day widowhood and ordinary seven-day mourning', () => {
    expect(evaluateTraitInfluence(subject('stoic'), grief).griefDays ?? 7).toBe(5);
    expect(evaluateTraitInfluence(subject(), grief).griefDays ?? 7).toBe(7);
    expect(evaluateTraitInfluence(subject('nurturing'), grief).griefDays ?? 7).toBe(7);
    expect(evaluateTraitInfluence(subject('stoic', 'nurturing'), grief).griefDays ?? 7).toBe(5);
  });

  it('counts exactly one restraint and one independent severity vote', () => {
    expect(evaluateTraitInfluence(subject(), mercy)).toMatchObject({ restraintVoice: 0, severityVoice: 0 });
    expect(evaluateTraitInfluence(subject('nurturing'), mercy)).toMatchObject({ restraintVoice: 1, severityVoice: 0 });
    expect(evaluateTraitInfluence(subject('chivalrous'), mercy)).toMatchObject({ restraintVoice: 1, severityVoice: 0 });
    expect(evaluateTraitInfluence(subject('nurturing', 'chivalrous'), mercy))
      .toMatchObject({ restraintVoice: 1, severityVoice: 0 });
    expect(evaluateTraitInfluence(subject('fierce', 'nurturing'), mercy))
      .toMatchObject({ restraintVoice: 1, severityVoice: 1 });
  });

  it('preserves each of the five symmetric cross-person feud clashes', () => {
    const pairs: ReadonlyArray<readonly [SettlerTrait, SettlerTrait]> = [
      ['brave', 'timid'], ['gregarious', 'timid'], ['gregarious', 'stoic'],
      ['fierce', 'stoic'], ['chivalrous', 'fierce'],
    ];
    for (const [a, b] of pairs) {
      expect(clash([a], [b]), a + '/' + b).toBe(1);
      expect(clash([b], [a]), b + '/' + a).toBe(1);
    }
    expect(clash(['hardy'], ['lucky'])).toBe(0);
    expect(clash(['brave', 'gregarious'], ['timid', 'stoic'])).toBe(3);
    expect(clash(['chivalrous', 'fierce'], ['chivalrous', 'fierce'])).toBe(1);
    expect(clash([], ['timid'])).toBe(0);
  });

  it('keeps exact evaluation read-only without consuming the simulation RNG', () => {
    const before = snapshotSimRng();
    const traits = Object.freeze(['lucky', 'gregarious', 'stoic'] as const);
    evaluateTraitInfluence({ traits }, conception);
    evaluateTraitInfluence({ traits }, courtship);
    evaluateTraitInfluence({ traits }, grief);
    evaluateTraitInfluence({ traits }, { kind: 'social', activity: 'conflict', exact: true, other: { traits: ['timid'] } });
    expect(traits).toEqual(['lucky', 'gregarious', 'stoic']);
    expect(snapshotSimRng()).toEqual(before);
  });
});

describe('PR C existing state owners still apply decisions', () => {
  it('lets widow and affair partner retain their distinct original grief windows', () => {
    for (const [traits, days] of [[['stoic'], 5], [[], 7], [['nurturing'], 7]] as const) {
      const dying = human(1, [], { partnerId: 2, affairPartnerId: 3, relationshipStatus: 'married' });
      const spouse = human(2, [...traits], { partnerId: 1, relationshipStatus: 'married' });
      const lover = human(3, [], { affairPartnerId: 1 });
      const now = 10 * TICKS_PER_DAY;
      finalizeHumanDeath(dying, [], new Map([[1, dying], [2, spouse], [3, lover]]), now);
      expect(spouse.griefUntilTick).toBe(now + days * TICKS_PER_DAY);
      expect(lover.griefUntilTick).toBe(now + 3 * TICKS_PER_DAY);
    }
  });

  it('preserves independent restraint/severity voices in the actual war outcome writer', () => {
    const world: WorldState = initGame({ seed: 20261028 });
    world.entities = [
      human(1, ['nurturing', 'chivalrous']), human(2, ['fierce', 'nurturing']),
      human(3, ['fierce']), human(4, ['nurturing'], { faction: 'rival' }),
    ];
    world.villageLeaderId = 1;
    world.rivalSettlements = [];
    applyWarCommunityReaction(world, 'release', 'unknown');
    const last = world.eventLog.at(-1)?.message ?? '';
    expect(last).toContain('2 favor restraint, 2 favor severity');
  });
});
