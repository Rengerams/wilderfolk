/**
 * Friendship growth, feud drift, reconciliation and workplace banter all read the one aptitude
 * evaluator; friction is a signed, continuous activity factor.
 */
import { personDayRoll } from '../src/game/simRng';
import { describe, expect, it } from 'vitest';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { tryWorkplaceBanter } from '../src/game/socialLife';
import {
  advanceSocialRelationships,
  feudScore,
  friendshipScore,
} from '../src/game/relationships';
import { combinePairFactors, evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { genomeFrom } from './helpers/genome';

const SOCIAL_GENOME = genomeFrom({ sociability: 95, sensitivity: 90, cooperation: 90, composure: 10 });
const UNSOCIAL_GENOME = genomeFrom({ sociability: 5, sensitivity: 5, cooperation: 5, composure: 95 });
const CONFLICT_GENOME = genomeFrom({ riskTaking: 95 });
const COOPERATIVE_GENOME = genomeFrom({ cooperation: 95, flexibility: 90, patience: 90 });
const COMPANY_GENOME = genomeFrom({ sociability: 95, flexibility: 90, sensitivity: 80, perception: 10, composure: 10 });

const FRIENDSHIP_GROUP_BUMP = 0.6;
const BANTER_BASE_CHANCE = 0.08;

/** A world for the real owner's event log and feud writers. */
function socialWorld(): WorldState {
  return {
    entities: [],
    buildings: [],
    tick: TICKS_PER_DAY,
    year: 1,
    dayInYear: 1,
    eventLog: [],
    notifications: [],
    bigNews: [],
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
    floatingTexts: [],
    nextFloatingTextId: 1,
    villageReputation: 0,
  } as unknown as WorldState;
}

/** Two housemates in one residence group: too small to spend a group-sampling draw. */
function housemate(id: number, genomeV2: GenomeV2): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    alive: true,
    energy: 100,
    maxEnergy: 100,
    residenceBuildingId: 10,
    genomeV2,
  } as Entity;
}

function pairFactor(genomeA: GenomeV2, genomeB: GenomeV2, activity: 'friendship' | 'reconciliation' | 'conflict'): number {
  return combinePairFactors(
    evaluateAptitudeInfluence({ genomeV2: genomeA }, activity).factor,
    evaluateAptitudeInfluence({ genomeV2: genomeB }, activity).factor,
  );
}

describe('friendship growth follows the friendship activity', () => {
  it('grows a social pair faster and an unsocial pair slower than neutral', () => {
    const neutral = pairFactor(genomeFrom(), genomeFrom(), 'friendship');
    const social = pairFactor(SOCIAL_GENOME, SOCIAL_GENOME, 'friendship');
    const unsocial = pairFactor(UNSOCIAL_GENOME, UNSOCIAL_GENOME, 'friendship');
    expect(neutral).toBe(1);
    expect(social).toBeGreaterThan(1);
    expect(unsocial).toBeLessThan(1);

    const grow = (genomeV2: GenomeV2): number => {
      const a = housemate(1, genomeV2);
      const b = housemate(2, genomeV2);
      advanceSocialRelationships(socialWorld(), [a, b], undefined, () => 0.99);
      return friendshipScore(a, b.id);
    };
    // Housemates share a context, so the same-day decay leaves their new bond in place.
    expect(grow(genomeFrom())).toBeCloseTo(FRIENDSHIP_GROUP_BUMP * neutral, 10);
    expect(grow(SOCIAL_GENOME)).toBeCloseTo(FRIENDSHIP_GROUP_BUMP * social, 10);
    expect(grow(UNSOCIAL_GENOME)).toBeCloseTo(FRIENDSHIP_GROUP_BUMP * unsocial, 10);
  });
});

describe('feud decisions at the real owner boundary', () => {
  it('spends exactly one draw on a high-friction pair and none on a cooperative one', () => {
    const run = (genomeA: GenomeV2, genomeB: GenomeV2, roll: () => number) => {
      const a = housemate(1, genomeA);
      const b = housemate(2, genomeB);
      let draws = 0;
      const counted = () => { draws += 1; return roll(); };
      advanceSocialRelationships(socialWorld(), [a, b], undefined, counted);
      return { draws, a, b };
    };

    const clash = run(CONFLICT_GENOME, genomeFrom(), () => 0);
    expect(clash.draws).toBe(1);
    expect(feudScore(clash.a, clash.b.id)).toBeGreaterThan(0);
    expect(feudScore(clash.b, clash.a.id)).toBe(feudScore(clash.a, clash.b.id));

    const calm = run(COOPERATIVE_GENOME, COOPERATIVE_GENOME, () => 0);
    expect(calm.draws).toBe(0);
    expect(feudScore(calm.a, calm.b.id)).toBe(0);
    expect(feudScore(calm.b, calm.a.id)).toBe(0);
  });

  it('scales the one threshold compare by the pair conflict factor', () => {
    const factor = pairFactor(CONFLICT_GENOME, genomeFrom(), 'conflict');
    expect(factor).toBeGreaterThan(1);
    const base = 0.000005;
    const justBelow = factor * base * 0.98;
    const above = factor * base * 1.02;

    const run = (roll: number) => {
      const a = housemate(1, CONFLICT_GENOME);
      const b = housemate(2, genomeFrom());
      advanceSocialRelationships(socialWorld(), [a, b], undefined, () => roll);
      return feudScore(a, b.id);
    };
    expect(run(justBelow)).toBeGreaterThan(0);
    expect(run(above)).toBe(0);
  });
});

describe('workplace banter follows the company activity', () => {
  it('raises the chance for a sociable pair and leaves the baseline for neutral', () => {
    const neutral = evaluateAptitudeInfluence({ genomeV2: genomeFrom() }, 'company').factor;
    const sociable = evaluateAptitudeInfluence({ genomeV2: COMPANY_GENOME }, 'company').factor;
    expect(neutral).toBe(1);
    expect(sociable).toBeGreaterThan(1);
    expect(BANTER_BASE_CHANCE * sociable).toBeGreaterThan(BANTER_BASE_CHANCE);
    expect(BANTER_BASE_CHANCE * sociable).toBeLessThan(1);
  });

  it('keeps the owner decision on the same day roll', () => {
    const chance = BANTER_BASE_CHANCE * evaluateAptitudeInfluence({ genomeV2: COMPANY_GENOME }, 'company').factor;
    const tick = findTickBetween(ENTITY_ID, 720, BANTER_BASE_CHANCE, chance);

    const speaker = (genomeV2: GenomeV2) => {
      const entity = createEntity(EntityType.Human, 300, 300, ENTITY_ID, 80, false, { name: 'Bram' });
      entity.alive = true;
      entity.genomeV2 = genomeV2;
      return entity;
    };
    const plain = speaker(genomeFrom());
    tryWorkplaceBanter(plain, [], tick, 12, true);
    expect(plain.chatTicks ?? 0).toBe(0);

    const sociable = speaker(COMPANY_GENOME);
    tryWorkplaceBanter(sociable, [], tick, 12, true);
    expect(sociable.chatPhrase, 'a sociable settler speaks inside the elevated band').toBeDefined();
    expect(sociable.chatTicks ?? 0).toBeGreaterThan(0);

    for (const [alive, hour, onDayShift] of [[false, 12, true], [true, 10, true], [true, 12, false]] as const) {
      const gated = speaker(COMPANY_GENOME);
      gated.alive = alive;
      tryWorkplaceBanter(gated, [], tick, hour, onDayShift);
      expect(gated.chatTicks ?? 0).toBe(0);
    }
  });
});

const ENTITY_ID = 77;

/** The first midday tick whose day roll for `id`/`salt` lands inside the open band. */
function findTickBetween(id: number, salt: number, low: number, high: number): number {
  for (let day = 0; day < 5000; day += 1) {
    const tick = day * TICKS_PER_DAY + 720;
    const roll = personDayRoll(id, tick, salt);
    if (roll > low && roll <= high) return tick;
  }
  throw new Error('no tick inside the banter band');
}
