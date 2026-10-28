import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { EntityType, JobType, Season } from '../src/game/gameTypes';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import { courtshipRatePerHour, tryDailyConception } from '../src/game/simulation/humanRelationships';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { PER_TICK_RATE_SCALE } from '../src/game/dayCycleClock';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { personDayRoll } from '../src/game/humanSchedule';
import {
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  getYouthConceptionMultiplier,
} from '../src/game/dayCycle';

const COURTSHIP_PROGRESS = { kind: 'social', activity: 'courtshipProgress' } as const;
const CONCEPTION = { kind: 'family', activity: 'conception' } as const;

type Traits = readonly SettlerTrait[];

/** AS-IS reference: the retired settlerTraits.traitMultiplier helper. */
const legacyTraitMultiplier = (traits: Traits | null | undefined, trait: SettlerTrait, whenPresent: number): number =>
  traits?.includes(trait) ? whenPresent : 1.0;

/** AS-IS reference: the historical courtship progress expression. */
const legacyCourtshipRate = (base: number, traits: Traits): number =>
  base *
  legacyTraitMultiplier(traits, 'gregarious', 1.4) *
  legacyTraitMultiplier(traits, 'timid', 0.7) *
  legacyTraitMultiplier(traits, 'graceful', 1.2);

/** The migrated courtship progress expression, same multiplication positions and order. */
const catalogCourtshipRate = (base: number, traits: Traits): number => {
  const orderedFactors = evaluateTraitInfluence({ traits }, COURTSHIP_PROGRESS).exact.orderedFactors;
  return base * orderedFactors[0] * orderedFactors[1] * orderedFactors[2];
};

const courtshipCombinations: Traits[] = [
  [],
  ['gregarious'],
  ['timid'],
  ['graceful'],
  ['graceful', 'timid'],
  ['timid', 'gregarious'],
  ['graceful', 'gregarious'],
  ['graceful', 'gregarious', 'timid'],
  ['timid', 'graceful', 'gregarious'],
  ['brave', 'gregarious', 'timid'],
];

describe('courtship trait parity', () => {
  it('keeps the historical 1.4 / 0.7 / 1.2 multipliers in the fixed slot order', () => {
    expect(evaluateTraitInfluence({ traits: ['gregarious'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1.4, 1, 1]);
    expect(evaluateTraitInfluence({ traits: ['timid'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 0.7, 1]);
    expect(evaluateTraitInfluence({ traits: ['graceful'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 1, 1.2]);
    expect(evaluateTraitInfluence({ traits: ['brave'] }, COURTSHIP_PROGRESS).exact.orderedFactors)
      .toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence({}, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual([1, 1, 1]);
    expect(evaluateTraitInfluence({ traits: null }, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual([1, 1, 1]);
  });

  it('keeps the slots DNA-order independent for combined traits', () => {
    const expected = [1.4, 0.7, 1.2];
    for (const traits of [
      ['gregarious', 'timid', 'graceful'],
      ['timid', 'graceful', 'gregarious'],
      ['graceful', 'gregarious', 'timid'],
    ] as Traits[]) {
      expect(evaluateTraitInfluence({ traits }, COURTSHIP_PROGRESS).exact.orderedFactors).toEqual(expected);
    }
  });

  it('reproduces the old progress rate bit for bit across trait orders and bases', () => {
    for (const traits of courtshipCombinations) {
      for (const base of [0.0001, 0.0023, 0.0175, 0.25, 1]) {
        expect(catalogCourtshipRate(base, traits)).toBe(legacyCourtshipRate(base, traits));
      }
    }
  });

  it('leaves the bounded projection free of the parity multipliers', () => {
    const courtship = { kind: 'social', activity: 'courtship' } as const;
    const timid = evaluateTraitInfluence({ traits: ['timid'] }, courtship);
    const graceful = evaluateTraitInfluence({ traits: ['graceful'] }, courtship);
    expect(timid.factor).toBeGreaterThan(0.85);
    expect(timid.factor).toBeLessThan(1);
    expect(graceful.factor).toBeGreaterThan(1);
    expect(graceful.factor).toBeLessThanOrEqual(1.15);
    expect(evaluateTraitInfluence({ traits: ['gregarious'] }, COURTSHIP_PROGRESS).factor).toBe(1);
  });
});

describe('conception trait parity', () => {
  const married = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const marriedNow = (chance: number, fertility: number, traits: Traits): number =>
    chance * fertility * evaluateTraitInfluence({ traits }, CONCEPTION).exact.multiplier;
  const youth = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * legacyTraitMultiplier(traits, 'lucky', 1.15);
  const youthNow = (youthMultiplier: number, fertility: number, traits: Traits): number =>
    0.0012 * youthMultiplier * fertility * evaluateTraitInfluence({ traits }, CONCEPTION).exact.multiplier;

  it('keeps the married and youth Lucky factor at exactly 1.15', () => {
    expect(evaluateTraitInfluence({ traits: ['lucky'] }, CONCEPTION).exact.multiplier).toBe(1.15);
    for (const chance of [0.0004, 0.0011, 0.02]) {
      for (const fertility of [0.25, 0.6, 1]) {
        expect(marriedNow(chance, fertility, ['lucky'])).toBe(married(chance, fertility, ['lucky']));
        expect(marriedNow(chance, fertility, ['brave', 'lucky'])).toBe(married(chance, fertility, ['brave', 'lucky']));
      }
    }
    for (const youthMultiplier of [0.5, 0.75, 1]) {
      for (const fertility of [0.3, 1]) {
        expect(youthNow(youthMultiplier, fertility, ['lucky']))
          .toBe(youth(youthMultiplier, fertility, ['lucky']));
      }
    }
  });

  it('leaves an eligible non-Lucky mother on her original chance, never zero', () => {
    expect(evaluateTraitInfluence({ traits: ['nurturing'] }, CONCEPTION).exact.multiplier).toBe(1);
    expect(evaluateTraitInfluence({ traits: [] }, CONCEPTION).exact.multiplier).toBe(1);
    expect(evaluateTraitInfluence({}, CONCEPTION).exact.multiplier).toBe(1);
    for (const chance of [0.0004, 0.0011]) {
      for (const fertility of [0.4, 0.9]) {
        expect(marriedNow(chance, fertility, ['nurturing'])).toBe(chance * fertility);
      }
    }
  });

  it('evaluates only at the two original conception sites and keeps the affair branch clean', () => {
    // Owner-boundary coverage of the same claim lives in the seeded block below.
    const source = readFileSync(join(process.cwd(), 'src/game/simulation/humanRelationships.ts'), 'utf8');
    const conceptionSites = source.split('\n').filter((line) => line.includes('evaluateTraitInfluence(entity, CONCEPTION_CONTEXT)'));
    expect(conceptionSites).toHaveLength(2);
    const affairLine = source.split('\n').find((line) => line.includes('HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE *'));
    expect(affairLine).toBeDefined();
    expect(affairLine).not.toContain('evaluateTraitInfluence');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 603)');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 604)');
  });
});

const FIXTURE_SEED = 20_261_028;
const MOTHER_ID = 1;
const PARTNER_ID = 2;
const LOVER_ID = 3;

function settler(
  id: number,
  gender: 'female' | 'male',
  traits: Traits,
  overrides: Partial<Entity> = {},
): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 300,
    y: 300,
    energy: 200,
    maxEnergy: 200,
    age: 25,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender,
    name: `S${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
    traits: [...traits],
    ...overrides,
  } as Entity;
}

interface CourtFrame {
  readonly progressA: number;
  readonly progressB: number;
  readonly speedA: number;
}

/** One settled midday frame of the real owner; the pair stands together unless moved apart. */
function courtFrame(
  traits: Traits,
  options: {
    festival?: boolean;
    performers?: boolean;
    distance?: number;
    spouse?: boolean;
    partnerGender?: 'female' | 'male';
    energy?: number;
  } = {},
): CourtFrame {
  const state = initGame({ seed: FIXTURE_SEED });
  const a = settler(1, 'female', traits, {
    energy: options.energy ?? 200,
    ...(options.spouse ? { partnerId: PARTNER_ID, relationshipStatus: 'married' as const } : {}),
  });
  const b = settler(PARTNER_ID, options.partnerGender ?? 'male', [], { x: 300 + (options.distance ?? 0) });
  state.entities = [a, b];
  state.tick = 12;
  if (options.festival) state.festival = { active: true, name: 'Harvest feast', daysLeft: 1 };
  if (options.performers) {
    state.visitorGroups = [
      {
        id: 'troupe-1',
        name: 'Troupe',
        kind: 'performers',
        campX: 300,
        campY: 300,
        daysLeft: 2,
        entityIds: [],
        giftsGiven: 0,
        tradesCompleted: 0,
        refugeeResolved: false,
        leaderTalked: false,
      },
    ];
  }
  const humans = [a, b];
  tickHumans(state, {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType: { [EntityType.Human]: humans } as unknown as TickContext['byType'],
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans,
    entityById: new Map<number, Entity>([[a.id, a], [b.id, b]]),
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  } as TickContext);
  return {
    progressA: a.courtshipProgress ?? 0,
    progressB: b.courtshipProgress ?? 0,
    speedA: Math.hypot(a.vx, a.vy),
  };
}

describe('courtship progress at the real owner boundary', () => {
  it('advances the pair once, from the catalog slot that owns each trait', () => {
    const neutral = courtFrame([]);
    expect(neutral.progressA).toBeCloseTo(courtshipRatePerHour(true) * PER_TICK_RATE_SCALE, 12);
    expect(neutral.progressB, 'one shared advance per pair, not one per settler')
      .toBe(neutral.progressA);

    const cases: Array<[Traits, number]> = [
      [['gregarious'], 1.4],
      [['timid'], 0.7],
      [['graceful'], 1.2],
      [['gregarious', 'timid', 'graceful'], 1.4 * 0.7 * 1.2],
      [['graceful', 'timid', 'gregarious'], 1.4 * 0.7 * 1.2],
      [['brave'], 1],
    ];
    for (const [traits, ratio] of cases) {
      const frame = courtFrame(traits);
      expect(frame.progressA / neutral.progressA, JSON.stringify(traits)).toBeCloseTo(ratio, 10);
      expect(frame.progressB, JSON.stringify(traits)).toBe(frame.progressA);
    }
  });

  it('keeps the feast and performer multipliers around the same trait product', () => {
    const neutral = courtFrame([]);
    expect(courtFrame([], { festival: true }).progressA / neutral.progressA).toBeCloseTo(2, 10);
    expect(courtFrame([], { performers: true }).progressA / neutral.progressA).toBeCloseTo(1.35, 10);
    expect(
      courtFrame(['gregarious'], { festival: true }).progressA / courtFrame(['gregarious']).progressA,
    ).toBeCloseTo(2, 10);
  });

  it('keeps the courtship gates: ineligible, absent or distant partners make no progress', () => {
    expect(courtFrame([], { spouse: true }).progressA, 'a married settler does not court').toBe(0);
    expect(courtFrame([], { energy: 1 }).progressA, 'the energy gate still holds').toBe(0);
    expect(courtFrame([], { partnerGender: 'female' }).progressA, 'no same-gender pair').toBe(0);

    const distant = courtFrame([], { distance: 50 });
    expect(distant.progressA, 'out of talking range: no shared progress').toBe(0);
    expect(distant.speedA, 'the settler closes the distance instead').toBeGreaterThan(0);
  });
});

function byTypeBuckets(entities: Entity[]): Record<EntityType, Entity[]> {
  const buckets = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) buckets[type] = [];
  for (const entity of entities) buckets[entity.type].push(entity);
  return buckets;
}

function conceptionFrame(entities: Entity[], day: number): { conceived: boolean; mother: Entity } {
  const state: WorldState = initGame({ seed: FIXTURE_SEED });
  state.entities = entities;
  state.villageLeaderId = null;
  state.tick = day * TICKS_PER_DAY;
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const ctx: TickContext = {
    width: state.width,
    height: state.height,
    hourOfDay: 8,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: byTypeBuckets(entities),
    aliveEntities: entities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: entities,
    entityById,
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };
  const mother = entities[0];
  return { conceived: tryDailyConception(state, ctx, mother), mother };
}

/** The first colony day whose `personDayRoll` for the mother and this salt lands in the band. */
function dayInBand(salt: number, low: number, high: number): number {
  for (let day = 1; day <= 200_000; day += 1) {
    const roll = personDayRoll(MOTHER_ID, day * TICKS_PER_DAY, salt);
    if (roll > low && roll < high) return day;
  }
  throw new Error(`no day with a salt-${salt} roll inside the band`);
}

function dayBelow(salt: number, bound: number): number {
  for (let day = 1; day <= 200_000; day += 1) {
    if (personDayRoll(MOTHER_ID, day * TICKS_PER_DAY, salt) < bound) return day;
  }
  throw new Error(`no day with a salt-${salt} roll below the bound`);
}

const marriedPair = (traits: Traits): Entity[] => [
  settler(MOTHER_ID, 'female', traits, { relationshipStatus: 'married', partnerId: PARTNER_ID }),
  settler(PARTNER_ID, 'male', [], { relationshipStatus: 'married', partnerId: MOTHER_ID, x: 310 }),
];

const youthPair = (traits: Traits): Entity[] => [
  settler(MOTHER_ID, 'female', traits, { age: 14, isJuvenile: true, youthLovePartnerId: PARTNER_ID }),
  settler(PARTNER_ID, 'male', [], { age: 14, isJuvenile: true, youthLovePartnerId: MOTHER_ID, x: 310 }),
];

const affairPair = (traits: Traits): Entity[] => [
  settler(MOTHER_ID, 'female', traits, { affairPartnerId: LOVER_ID }),
  settler(LOVER_ID, 'male', [], { affairPartnerId: MOTHER_ID, x: 310 }),
];

describe('conception rolls at the real owner boundary', () => {
  it('moves the married 603 roll by exactly the Lucky 1.15, and not the affair 605 roll', () => {
    const marriedDay = dayInBand(603, HUMAN_DAILY_PREGNANCY_CHANCE_NEAR, HUMAN_DAILY_PREGNANCY_CHANCE_NEAR * 1.15);
    expect(conceptionFrame(marriedPair([]), marriedDay).conceived, 'the plain mother misses the band').toBe(false);
    const lucky = conceptionFrame(marriedPair(['lucky']), marriedDay);
    expect(lucky.conceived, 'the Lucky mother clears it').toBe(true);
    expect(lucky.mother.pregnant).toBe(true);

    const affairChance = HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE;
    const luckyAffairDay = dayInBand(605, affairChance, affairChance * 1.15);
    expect(conceptionFrame(affairPair([]), luckyAffairDay).conceived).toBe(false);
    expect(
      conceptionFrame(affairPair(['lucky']), luckyAffairDay).conceived,
      'Lucky must not widen the affair branch',
    ).toBe(false);
    expect(conceptionFrame(affairPair(['lucky']), dayBelow(605, affairChance)).conceived).toBe(true);
  });

  it('moves the youth 604 roll by exactly the Lucky 1.15 and leaves a non-Lucky mother her chance', () => {
    const chance = HUMAN_DAILY_PREGNANCY_CHANCE_NEAR * getYouthConceptionMultiplier(14);
    const youthDay = dayInBand(604, chance, chance * 1.15);
    expect(conceptionFrame(youthPair([]), youthDay).conceived).toBe(false);
    const lucky = conceptionFrame(youthPair(['lucky']), youthDay);
    expect(lucky.conceived).toBe(true);
    expect(lucky.mother.pregnant).toBe(true);

    const plainDay = dayBelow(604, chance);
    const plain = conceptionFrame(youthPair(['nurturing']), plainDay);
    expect(plain.conceived, 'an ordinary trait never zeroes an eligible mother').toBe(true);
  });
});
