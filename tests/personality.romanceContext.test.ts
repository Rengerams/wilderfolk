import { personDayRoll } from '../src/game/simRng';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { APTITUDE_IDS } from '../src/game/settlerTraits';
import { EntityType, JobType, Season } from '../src/game/gameTypes';
import { combinePairFactors, evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import { tickPregnancyAndBirth } from '../src/game/simulation/humanLifecycle';
import { courtshipRatePerHour, tryDailyConception } from '../src/game/simulation/humanRelationships';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { PER_TICK_RATE_SCALE } from '../src/game/dayCycleClock';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { genomeFrom } from './helpers/genome';

import {
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  getYouthConceptionMultiplier,
} from '../src/game/dayCycle';

const COURTSHIP_GENOME = genomeFrom({ initiative: 95, sociability: 90, perception: 85, patience: 80, sensitivity: 75 });
const COURTSHIP_RESISTANT_GENOME = genomeFrom({ initiative: 5, sociability: 5, perception: 5, patience: 5, sensitivity: 5 });

const FIXTURE_SEED = 20_261_028;
const MOTHER_ID = 1;
const PARTNER_ID = 2;
const LOVER_ID = 3;

function settler(
  id: number,
  gender: 'female' | 'male',
  genomeV2: GenomeV2,
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
    genomeV2,
    ...overrides,
  } as Entity;
}

interface CourtFrame {
  readonly progressA: number;
  readonly progressB: number;
  readonly speedA: number;
  readonly speedB: number;
}

/** One settled midday frame of the real owner; the pair stands together unless moved apart. */
function courtFrame(
  genomeV2: GenomeV2,
  options: {
    festival?: boolean;
    performers?: boolean;
    distance?: number;
    spouse?: boolean;
    partnerGender?: 'female' | 'male';
    energy?: number;
  } = {},
): CourtFrame {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const a = settler(1, 'female', genomeV2, {
    energy: options.energy ?? 200,
    ...(options.spouse ? { partnerId: PARTNER_ID, relationshipStatus: 'married' as const } : {}),
  });
  const b = settler(PARTNER_ID, options.partnerGender ?? 'male', genomeFrom(), { x: 300 + (options.distance ?? 0) });
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
    speedB: Math.hypot(b.vx, b.vy),
  };
}

describe('courtship progress at the real owner boundary', () => {
  it('advances the pair once by the symmetric average of both courtship factors', () => {
    const neutral = courtFrame(genomeFrom());
    expect(neutral.progressA).toBeCloseTo(courtshipRatePerHour(true) * PER_TICK_RATE_SCALE, 12);
    expect(neutral.progressB, 'one shared advance per pair, not one per settler')
      .toBe(neutral.progressA);

    const pairFactor = combinePairFactors(
      evaluateAptitudeInfluence({ genomeV2: COURTSHIP_GENOME }, 'courtship').factor,
      1,
    );
    expect(pairFactor).toBeGreaterThan(1);
    const apt = courtFrame(COURTSHIP_GENOME);
    expect(apt.progressA / neutral.progressA).toBeCloseTo(pairFactor, 10);
    expect(apt.progressB).toBe(apt.progressA);

    const resistantFactor = combinePairFactors(
      evaluateAptitudeInfluence({ genomeV2: COURTSHIP_RESISTANT_GENOME }, 'courtship').factor,
      1,
    );
    expect(resistantFactor).toBeLessThan(1);
    expect(courtFrame(COURTSHIP_RESISTANT_GENOME).progressA / neutral.progressA).toBeCloseTo(resistantFactor, 10);
  });

  it('keeps the feast and performer multipliers around the same aptitude product', () => {
    const neutral = courtFrame(genomeFrom());
    expect(courtFrame(genomeFrom(), { festival: true }).progressA / neutral.progressA).toBeCloseTo(2, 10);
    expect(courtFrame(genomeFrom(), { performers: true }).progressA / neutral.progressA).toBeCloseTo(1.35, 10);
    expect(
      courtFrame(COURTSHIP_GENOME, { festival: true }).progressA / courtFrame(COURTSHIP_GENOME).progressA,
    ).toBeCloseTo(2, 10);
  });

  it('keeps the courtship gates: ineligible, absent or distant partners make no progress', () => {
    expect(courtFrame(genomeFrom(), { spouse: true }).progressA, 'a married settler does not court').toBe(0);
    expect(courtFrame(genomeFrom(), { energy: 1 }).progressA, 'the energy gate still holds').toBe(0);
    expect(courtFrame(genomeFrom(), { partnerGender: 'female' }).progressA, 'no same-gender pair').toBe(0);

    const distant = courtFrame(genomeFrom(), { distance: 50 });
    expect(distant.progressA, 'out of talking range: no shared progress').toBe(0);
    expect(Math.max(distant.speedA, distant.speedB), 'one awake partner closes the distance instead').toBeGreaterThan(0);
  });
});

function byTypeBuckets(entities: Entity[]): Record<EntityType, Entity[]> {
  const buckets = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) buckets[type] = [];
  for (const entity of entities) buckets[entity.type].push(entity);
  return buckets;
}

function conceptionFrame(entities: Entity[], day: number): { conceived: boolean; mother: Entity } {
  const state: WorldState = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
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

const marriedPair = (genomeV2: GenomeV2): Entity[] => [
  settler(MOTHER_ID, 'female', genomeV2, { relationshipStatus: 'married', partnerId: PARTNER_ID }),
  settler(PARTNER_ID, 'male', genomeFrom(), { relationshipStatus: 'married', partnerId: MOTHER_ID, x: 310 }),
];

const youthPair = (genomeV2: GenomeV2): Entity[] => [
  settler(MOTHER_ID, 'female', genomeV2, { age: 14, isJuvenile: true, youthLovePartnerId: PARTNER_ID }),
  settler(PARTNER_ID, 'male', genomeFrom(), { age: 14, isJuvenile: true, youthLovePartnerId: MOTHER_ID, x: 310 }),
];

const affairPair = (genomeV2: GenomeV2): Entity[] => [
  settler(MOTHER_ID, 'female', genomeV2, { affairPartnerId: LOVER_ID }),
  settler(LOVER_ID, 'male', genomeFrom(), { affairPartnerId: MOTHER_ID, x: 310 }),
];

/** Real deliveries at the birth owner; returns the inherited genomes, never the parents' labels. */
function newbornGenomes(motherGenome: GenomeV2, fatherGenome: GenomeV2, births: number): GenomeV2[] {
  const state: WorldState = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  state.villageLeaderId = null;
  const mother = settler(MOTHER_ID, 'female', motherGenome, {
    relationshipStatus: 'expecting', partnerId: PARTNER_ID,
  });
  const father = settler(PARTNER_ID, 'male', fatherGenome, {
    relationshipStatus: 'expecting', partnerId: MOTHER_ID, x: 310,
  });
  state.entities = [mother, father];
  const entityById = new Map<number, Entity>([[mother.id, mother], [father.id, father]]);
  const ctx: TickContext = {
    width: state.width,
    height: state.height,
    hourOfDay: 8,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: byTypeBuckets([mother, father]),
    aliveEntities: [mother, father],
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: [mother, father],
    entityById,
    buildingById: new Map(state.buildings.map((building) => [building.id, building])),
    predators: [],
  };

  const children: GenomeV2[] = [];
  for (let delivery = 0; delivery < births; delivery += 1) {
    state.tick += 1;
    ctx.newEntities.length = 0;
    mother.pregnant = true;
    mother.pregnantById = father.id;
    mother.pregnancyFromYouthLove = undefined;
    mother.pregnancyProgress = 0;
    mother.pregnancyDueProgress = 1;
    mother.relationshipStatus = 'expecting';
    tickPregnancyAndBirth(state, ctx, mother, {
      livingHumanAt: (id) => (id == null ? undefined : entityById.get(id)),
    });
    const child = ctx.newEntities.find((entity) => entity.type === EntityType.Human);
    if (child?.genomeV2) children.push(child.genomeV2);
  }
  return children;
}

describe('newborn genetics at the real birth owner', () => {
  it('inherits one allele from each parent per dimension, with no special lucky locus', () => {
    const mother = genomeFrom({ sociability: 10, composure: 90 });
    const father = genomeFrom({ sociability: 90, composure: 10 });
    const children = newbornGenomes(mother, father, 12);
    expect(children.length).toBeGreaterThan(8);
    for (const child of children) {
      expect(child.aptitudeAlleles).toHaveLength(APTITUDE_IDS.length);
      for (let axis = 0; axis < APTITUDE_IDS.length; axis++) {
        const maternal = mother.aptitudeAlleles[axis];
        const paternal = father.aptitudeAlleles[axis];
        for (const allele of child.aptitudeAlleles[axis]) {
          // Mutation is bounded to ±4 and the birth-time spread correction can move an allele further.
          const distance = Math.min(
            Math.abs(allele - maternal[0]), Math.abs(allele - maternal[1]),
            Math.abs(allele - paternal[0]), Math.abs(allele - paternal[1]),
          );
          expect(distance, `axis ${axis} allele ${allele}`).toBeLessThanOrEqual(14);
        }
      }
    }
  });
});

describe('conception is deliberately non-genetic', () => {
  it('has no genetic conception context in the owner source', () => {
    const source = readFileSync(join(process.cwd(), 'src/game/simulation/humanRelationships.ts'), 'utf8');
    expect(source).not.toContain('CONCEPTION_CONTEXT');
    expect(source).not.toContain('evaluateTraitInfluence');
    // The only evaluator read is the mark-only conception activity; no allele is consulted.
    expect(source).toContain("evaluateAptitudeInfluence(entity, 'conception')");
    expect(source).not.toContain('genomeV2');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 603)');
    expect(source).toContain('personDayRoll(entity.id, state.tick, 604)');
  });

  it('leaves the married 603 roll at the owner baseline, with the retired Lucky 1.15 gone', () => {
    const chance = HUMAN_DAILY_PREGNANCY_CHANCE_NEAR;
    const formerLuckyBand = dayInBand(603, chance, chance * 1.15);
    expect(conceptionFrame(marriedPair(genomeFrom()), formerLuckyBand).conceived,
      'no genome widens the married roll').toBe(false);
    expect(conceptionFrame(marriedPair(genomeFrom({ initiative: 95 })), formerLuckyBand).conceived).toBe(false);

    const plainDay = dayBelow(603, chance);
    const plain = conceptionFrame(marriedPair(genomeFrom()), plainDay);
    expect(plain.conceived, 'an eligible mother still conceives below the baseline').toBe(true);
    expect(plain.mother.pregnant).toBe(true);
  });

  it('leaves the youth 604 roll at the owner baseline', () => {
    const chance = HUMAN_DAILY_PREGNANCY_CHANCE_NEAR * getYouthConceptionMultiplier(14);
    const formerLuckyBand = dayInBand(604, chance, chance * 1.15);
    expect(conceptionFrame(youthPair(genomeFrom()), formerLuckyBand).conceived).toBe(false);

    const plainDay = dayBelow(604, chance);
    const plain = conceptionFrame(youthPair(genomeFrom({ sensitivity: 95 })), plainDay);
    expect(plain.conceived, 'an ordinary profile never zeroes an eligible mother').toBe(true);
  });

  it('leaves the affair 605 branch untouched by genetics', () => {
    const chance = HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE;
    const formerLuckyBand = dayInBand(605, chance, chance * 1.15);
    expect(conceptionFrame(affairPair(genomeFrom({ initiative: 95 })), formerLuckyBand).conceived).toBe(false);
    expect(conceptionFrame(affairPair(genomeFrom()), dayBelow(605, chance)).conceived).toBe(true);
  });
});
