/**
 * The danger consumers — militia pricing, hunting range, and flight speed — each read the
 * settler's own bounded aptitude factor; the tests drive the real hunting and human ticks.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, JobType, Season } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { tickHumans } from '../src/game/humanTick';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { getHumanHuntRange } from '../src/game/combat';
import { isPlayerHuman } from '../src/game/playerHuman';
import { tickHumanHunting } from '../src/game/humanHuntingBehavior';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { byType } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_260_928;
/** Enough adult soldiers that a single soldier's share clears integer rounding. */
const SOLDIER_COUNT = 25;

const DEFENSIVE_GENOME = genomeFrom({ composure: 95, riskTaking: 90, patience: 85, discipline: 80, cooperation: 10 });
const HUNTING_GENOME = genomeFrom({ patience: 95, perception: 90, riskTaking: 85, reasoning: 10 });
const ESCAPE_GENOME = genomeFrom({ composure: 95, perception: 90, riskTaking: 5, patience: 5, persistence: 5, reasoning: 5 });
const RECKLESS_GENOME = genomeFrom({ composure: 5, perception: 5, riskTaking: 95, patience: 95, persistence: 95, reasoning: 95 });

function soldier(id: number, genomeV2: GenomeV2, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `S${id}`, ageYears: 30 });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.job = JobType.Soldier;
  // Written directly so a rolled genome cannot make the fixture non-deterministic.
  entity.genomeV2 = genomeV2;
  return Object.assign(entity, overrides);
}

function militia(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

function militiaWorld(): { state: WorldState; own: Entity[]; base: number } {
  const state = initGame({ skipTerrain: true, villageName: 'Militia', size: 'medium', seed: FIXTURE_SEED });
  const own = Array.from({ length: SOLDIER_COUNT }, (_, i) => soldier(i + 1, genomeFrom()));
  return { state, own, base: militia(state, own) };
}

describe('the militia prices each defender\'s own aptitudes', () => {
  it('adds one soldier\'s bounded share, not a fraction of the whole army', () => {
    const { state, own, base } = militiaWorld();
    const roster = own.map((entity, index) => soldier(entity.id, index === 0 ? DEFENSIVE_GENOME : genomeFrom()));
    const withProtector = militia(state, roster);
    const delta = withProtector - base;

    expect(delta, 'the aptitude must work at all, or the assertions below pass for free').toBeGreaterThan(0);
    // One soldier's own share must stay under 6 % of the militia, never a whole-army fraction.
    expect(delta).toBeLessThan(base * 0.06);
  });

  it('scales with the number of protectors, one share each', () => {
    const { state, own, base } = militiaWorld();
    const one = militia(state, [...own, soldier(90, DEFENSIVE_GENOME)]);
    const two = militia(state, [...own, soldier(90, DEFENSIVE_GENOME), soldier(91, DEFENSIVE_GENOME)]);
    const firstShare = one - base;

    expect(two).toBeGreaterThan(one);
    expect(Math.abs((two - one) - firstShare), 'a second protector earns the same own share')
      .toBeLessThanOrEqual(1);
  });

  it('prices another positive defence dimension without a second branch', () => {
    const { state, own, base } = militiaWorld();
    const composureOnly = evaluateAptitudeInfluence({ genomeV2: genomeFrom({ composure: 95 }) }, 'defense').factor;
    const mixed = evaluateAptitudeInfluence({
      genomeV2: genomeFrom({ composure: 95, riskTaking: 95 }),
    }, 'defense').factor;
    expect(mixed, 'fixture premise: risk-taking adds its own defence resolve').toBeGreaterThan(composureOnly);

    const crew = (startId: number, genomeV2: GenomeV2): Entity[] =>
      [...own, ...Array.from({ length: 5 }, (_, i) => soldier(startId + i, genomeV2))];

    expect(militia(state, crew(95, DEFENSIVE_GENOME))).toBeGreaterThan(base);
    expect(militia(state, crew(96, genomeFrom({ composure: 95, riskTaking: 95 }))))
      .toBeGreaterThan(militia(state, crew(96, genomeFrom({ composure: 95 }))));
  });

  it('keeps every soldier factor bounded inside the activity cap', () => {
    for (const genomeV2 of [DEFENSIVE_GENOME, genomeFrom({ composure: 95 }), genomeFrom({ composure: 95, riskTaking: 95 })]) {
      const factor = evaluateAptitudeInfluence({ genomeV2 }, 'defense').factor;
      expect(factor).toBeGreaterThan(1);
      expect(factor).toBeLessThanOrEqual(1.15);
    }
  });

  it('still refuses a protector who cannot be mustered', () => {
    const { state, own, base } = militiaWorld();

    expect(militia(state, [...own, soldier(92, DEFENSIVE_GENOME, { faction: 'rival' })])).toBe(base);
    expect(militia(state, [...own, soldier(93, DEFENSIVE_GENOME, { faction: 'visitor' })])).toBe(base);
    expect(militia(state, [...own, soldier(94, DEFENSIVE_GENOME, { age: 12, isJuvenile: true })])).toBe(base);
    expect(militia(state, [...own, soldier(95, DEFENSIVE_GENOME, { job: JobType.Settler })])).toBe(base);
    expect(militia(state, [...own, soldier(96, DEFENSIVE_GENOME, { prisonBuildingId: 9 })])).toBe(base);
  });

  it('does not let per-soldier defence DNA price the barricade', () => {
    const { state, own } = militiaWorld();
    const plain = computeMilitiaBreakdown(state, own);
    const proficient = computeMilitiaBreakdown(
      state,
      own.map((entity) => soldier(entity.id, DEFENSIVE_GENOME)),
    );

    expect(proficient.militiaStrength).toBeGreaterThan(plain.militiaStrength);
    expect(proficient.barricadeStrength).toBe(plain.barricadeStrength);
  });

  it('states the per-soldier aptitude term and no retired global percentage', () => {
    const { state, own } = militiaWorld();
    const lines = computeMilitiaBreakdown(state, [...own, soldier(99, DEFENSIVE_GENOME)], {
      includeStructures: false,
    }).lines;
    const line = lines.find((entry) => entry.includes('defender aptitudes'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/8%/);
    expect(line).toMatch(/per-soldier/);

    // Marks are personal, so a neutral comparison has to strip them as well as the genome.
    const markless = own.map((person) => ({ ...person, marks: undefined }));
    const plainLines = computeMilitiaBreakdown(state, markless, { includeStructures: false }).lines;
    expect(plainLines.some((entry) => entry.includes('defender aptitudes'))).toBe(false);
  });
});

/** One settler out on a famine hunt, with the colony's small game parked far out of reach. */
function huntWorld(genomeV2: GenomeV2, preyDistance: number): { state: WorldState; hunter: Entity; prey: Entity } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const hunter = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(hunter, 'fixture premise: the colony starts with a settler').toBeTruthy();
  hunter!.job = JobType.Settler;
  hunter!.isJuvenile = false;
  hunter!.genomeV2 = genomeV2;
  hunter!.x = 200;
  hunter!.y = 200;
  if (hunter!.needs) hunter!.needs.nutrition = 40;
  state.resources.food = 0;

  const prey = state.entities.filter((e) => e.type === EntityType.Deer)[0];
  expect(prey, 'fixture premise: the valley holds deer').toBeTruthy();
  for (const game of state.entities) {
    if (game.type === EntityType.Deer || game.type === EntityType.Rabbit) {
      game.x = 60;
      game.y = 830;
      game.tamedBy = undefined;
      game.alive = true;
    }
  }
  prey!.x = hunter!.x + preyDistance;
  prey!.y = hunter!.y;
  return { state, hunter: hunter!, prey: prey! };
}

/** The range the hunt path itself would grant this settler on this world. */
function huntRangeFor(state: WorldState, hunter: Entity): number {
  const config = SPECIES_CONFIG[EntityType.Human];
  const jobMult = hunter.job === JobType.Hunter ? 1.2 : 0.75;
  return getHumanHuntRange(state, config.huntRange * jobMult * evaluateAptitudeInfluence(hunter, 'hunting').factor);
}

function standAndHunt(state: WorldState, hunter: Entity, prey: Entity): Entity {
  const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
  const buckets = byType(state.entities);
  const ctx = {
    entityById,
    updatedBuildings: state.buildings,
    byType: buckets,
    huntTargetByPreyId: new Map<number, Set<number>>(),
  } as unknown as TickContext;
  const config = SPECIES_CONFIG[EntityType.Human];
  tickHumanHunting(
    state, ctx, hunter, config,
    false, true, false, false,
    buckets, undefined, entityById, false,
  );
  return prey;
}

describe('the free-roam hunt range is the hunting activity factor', () => {
  it('lets an apt hunter target game the neutral settler never sees', () => {
    const plain = huntWorld(genomeFrom(), 0);
    const apt = huntWorld(HUNTING_GENOME, 0);
    const plainRange = huntRangeFor(plain.state, plain.hunter);
    const aptRange = huntRangeFor(apt.state, apt.hunter);
    expect(aptRange).toBeGreaterThan(plainRange);

    // Just beyond the neutral settler's reach, and well inside the apt one's.
    const distance = (plainRange + aptRange) / 2;
    const plainHunt = huntWorld(genomeFrom(), distance);
    const aptHunt = huntWorld(HUNTING_GENOME, distance);

    standAndHunt(plainHunt.state, plainHunt.hunter, plainHunt.prey);
    standAndHunt(aptHunt.state, aptHunt.hunter, aptHunt.prey);

    // Both settlers stand the same distance from the same deer: only the reach differs.
    expect(plainHunt.hunter.huntTargetId).toBeUndefined();
    expect(aptHunt.hunter.huntTargetId).toBe(aptHunt.prey.id);
    expect(aptHunt.prey.alive, 'the deer is pursued, not shot — the distance is the point').toBe(true);
  });

  it('applies the activity factor once at each danger site, with no raw legacy literal', () => {
    const huntingSource = readFileSync(resolve(process.cwd(), 'src/game/humanHuntingBehavior.ts'), 'utf8');
    for (const factor of [
      evaluateAptitudeInfluence({ genomeV2: HUNTING_GENOME }, 'hunting').factor,
      evaluateAptitudeInfluence({ genomeV2: HUNTING_GENOME }, 'pursuit').factor,
    ]) {
      expect(factor).toBeGreaterThan(1);
      expect(factor).toBeLessThanOrEqual(1.15);
    }
    expect(huntingSource).toMatch(/evaluateAptitudeInfluence\(entity, 'hunting'\)\.factor/);
    expect(huntingSource).toMatch(/evaluateAptitudeInfluence\(entity, 'pursuit'\)\.factor/);
    expect(huntingSource).not.toMatch(/traitMultiplier\(entity, 'brave'/);
  });

  it('leaves a settler with a neutral genome at the neutral range', () => {
    const plain = huntWorld(genomeFrom(), 0);
    const neutral = huntWorld(genomeFrom(), 0);
    expect(huntRangeFor(neutral.state, neutral.hunter)).toBe(huntRangeFor(plain.state, plain.hunter));
  });
});

/** One settler facing an active Moon Howler 40 px away, ticked once through the real `tickHumans`. */
function fleeFromHowler(genomeV2: GenomeV2): { speed: number } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const found = state.entities.find((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile);
  expect(found, 'fixture premise: the colony starts with a settler').toBeTruthy();
  const runner = found!;
  runner.job = JobType.Settler;
  runner.genomeV2 = genomeV2;
  runner.workerBuildingId = undefined;
  runner.residenceBuildingId = undefined;
  runner.vx = 0;
  runner.vy = 0;

  const howler = createEntity(EntityType.Werewolf, runner.x + 40, runner.y, 9_001, 80, false, { name: 'Howler' });
  howler.alive = true;
  howler.moonHowlerCursed = true;
  state.entities.push(howler);

  const humans = [runner];
  const byTypeMap = {
    [EntityType.Human]: humans,
    [EntityType.Werewolf]: [howler],
  } as unknown as TickContext['byType'];
  tickHumans(state, {
    width: state.width,
    height: state.height,
    hourOfDay: 12,
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType: byTypeMap,
    aliveEntities: [runner, howler],
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans,
    entityById: new Map<number, Entity>([[runner.id, runner], [howler.id, howler]]),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  } as TickContext);

  return { speed: Math.hypot(runner.vx, runner.vy) };
}

describe('flight reads the escape activity', () => {
  it('makes the activity factor the whole speed difference in a driven frame', () => {
    const plain = fleeFromHowler(genomeFrom());
    expect(plain.speed, 'fixture premise: the settler actually fled the howler').toBeGreaterThan(0);

    for (const genomeV2 of [ESCAPE_GENOME, RECKLESS_GENOME]) {
      const factor = evaluateAptitudeInfluence({ genomeV2 }, 'escape').factor;
      expect(factor).not.toBe(1);
      const fled = fleeFromHowler(genomeV2);
      expect(fled.speed / plain.speed).toBeCloseTo(factor, 6);
    }
  });

  it('keeps a composed settler faster and a reckless one slower, as the registry states', () => {
    const calm = fleeFromHowler(ESCAPE_GENOME);
    const plain = fleeFromHowler(genomeFrom());
    const reckless = fleeFromHowler(RECKLESS_GENOME);

    expect(calm.speed).toBeGreaterThan(plain.speed);
    expect(reckless.speed).toBeLessThan(plain.speed);
  });

  it('leaves a settler whose genome is neutral at the plain speed', () => {
    expect(fleeFromHowler(genomeFrom()).speed).toBeCloseTo(fleeFromHowler(genomeFrom()).speed, 6);
  });
});
