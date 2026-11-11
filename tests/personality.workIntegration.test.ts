/**
 * Work consumers read the one aptitude evaluator (`personality/traitEvaluation.ts`):
 * crew multipliers, construction pricing, shift teaching and apprenticeship training.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BUILDING_JOB_TYPES, BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { isPlayerHuman } from '../src/game/playerHuman';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';
import { MAX_SKILL, readSkill, WORK_SKILL_PER_SHIFT, getWorkerSkillMultiplier } from '../src/game/skills';
import { advanceApprenticeships } from '../src/game/apprenticeships';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { building, human } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_261_028;
const SITE_ID = 30_000;

/** High discipline and persistence: the positive routine-production weights. */
const ROUTINE_GENOME = genomeFrom({ discipline: 95, persistence: 95, flexibility: 10, curiosity: 10 });
/** High creativity and reasoning: the positive construction weights. */
const CONSTRUCTION_GENOME = genomeFrom({ creativity: 95, reasoning: 95, persistence: 85, initiative: 80, discipline: 10 });
/** High flexibility and low curiosity/consistency: the negative apprenticeship-training profile. */
const TRAINING_RESISTANT_GENOME = genomeFrom({ flexibility: 95, curiosity: 10, discipline: 10, persistence: 10 });

/** A one-worker crew map, so the multiplier reads the id map and not a world scan. */
function crew(worker: Entity): Map<number, Entity> {
  return new Map([[worker.id, worker]]);
}

function skillingWorker(id: number, genomeV2: GenomeV2): Entity {
  return human(id, {
    job: JobType.Farmer,
    genomeV2,
    skills: {},
    alive: true,
    isJuvenile: false,
  });
}

const bare = { entities: [] } as unknown as WorldState;

describe('the crew multiplier prices the trade activity once', () => {
  it('applies the routine-work factor of a disciplined farmer', () => {
    const farm = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const plain = skillingWorker(1, genomeFrom());
    const apt = skillingWorker(1, ROUTINE_GENOME);

    const withoutAptitude = getWorkerSkillMultiplier(bare, farm, crew(plain));
    const withAptitude = getWorkerSkillMultiplier(bare, farm, crew(apt));
    const factor = evaluateAptitudeInfluence(apt, 'routineWork').factor;

    expect(factor, 'the fixture premise: the registry rewards routine production').toBeGreaterThan(1);
    expect(withAptitude).toBeCloseTo(withoutAptitude * factor, 10);
    // Exactly one application: the product of two factors would be far above the single one.
    expect(withAptitude / withoutAptitude).toBeLessThan(1 + 2 * (factor - 1));
  });

  it('keeps a neutral crew at the plain value', () => {
    const farm = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const plain = skillingWorker(1, genomeFrom());
    const neutral = skillingWorker(1, genomeFrom());

    expect(evaluateAptitudeInfluence(neutral, 'routineWork')).toEqual({ factor: 1, score: 0 });
    expect(getWorkerSkillMultiplier(bare, farm, crew(neutral)))
      .toBe(getWorkerSkillMultiplier(bare, farm, crew(plain)));
  });

  it('treats an unresolved occupant id as neutral instead of diluting the crew factor', () => {
    const solo = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const withStale = building(SITE_ID, BuildingType.Farm, { occupants: [1, 99] });
    const plain = skillingWorker(1, genomeFrom());
    const apt = skillingWorker(1, ROUTINE_GENOME);

    expect(getWorkerSkillMultiplier(bare, withStale, crew(plain)))
      .toBeCloseTo(getWorkerSkillMultiplier(bare, solo, crew(plain)), 10);
    // The known settler's factor counts once; the missing slot contributes a neutral 1.
    const factor = evaluateAptitudeInfluence(apt, 'routineWork').factor;
    expect(getWorkerSkillMultiplier(bare, withStale, crew(apt))).toBeCloseTo((1 + factor) / 2, 10);
  });

  it('prices a construction crew from the construction activity', () => {
    const site = building(SITE_ID, BuildingType.Farm, { occupants: [1], completed: false });
    const plain = skillingWorker(1, genomeFrom());
    const apt = skillingWorker(1, CONSTRUCTION_GENOME);

    const factor = evaluateAptitudeInfluence(apt, 'construction').factor;
    expect(factor, 'the fixture premise: the registry rewards raising a site').toBeGreaterThan(1);
    expect(getWorkerSkillMultiplier(bare, site, crew(plain), 'construction')).toBe(1);
    expect(getWorkerSkillMultiplier(bare, site, crew(apt), 'construction')).toBeCloseTo(factor, 10);
  });

  it('prices a builder raising a site that has no trade of its own', () => {
    // A house or wall has no production job, so the build crew is the Builder trade by default.
    const site = building(SITE_ID, BuildingType.House, { occupants: [1], completed: false });
    const plain = skillingWorker(1, genomeFrom());
    const apt = skillingWorker(1, CONSTRUCTION_GENOME);
    const trained = skillingWorker(1, CONSTRUCTION_GENOME);
    trained.skills = { [JobType.Builder]: MAX_SKILL };

    expect(BUILDING_JOB_TYPES[BuildingType.House], 'fixture premise: a house has no production job')
      .toBeUndefined();
    const factor = evaluateAptitudeInfluence(apt, 'construction').factor;
    expect(getWorkerSkillMultiplier(bare, site, crew(plain), 'construction')).toBe(1);
    expect(getWorkerSkillMultiplier(bare, site, crew(apt), 'construction')).toBeCloseTo(factor, 10);
    // The Builder trade still pays on that site: skill 100 is the documented 3x ceiling, then the factor.
    expect(getWorkerSkillMultiplier(bare, site, crew(trained), 'construction')).toBeCloseTo(3 * factor, 8);
  });

  it('trusts a supplied index over a world scan for a stale crew slot', () => {
    const site = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const dead = skillingWorker(1, ROUTINE_GENOME);
    dead.alive = false;
    const world = { entities: [dead] } as unknown as WorldState;

    // The daily crew map indexes living settlers only; the missing id must stay neutral either way.
    expect(getWorkerSkillMultiplier(world, site, new Map<number, Entity>())).toBe(1);
    expect(getWorkerSkillMultiplier(world, site)).toBe(1);
  });
});

/**
 * One incomplete House raised for a single real colony day by one builder: a house has
 * no production job, so this proves the construction activity reaches daily progress.
 */
function houseProgressAfterOneDay(genomeV2: GenomeV2): number {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  // A short day keeps the site unfinished, so its progress is still measurable after one tick.
  state.workSchedule = { startHour: 9, endHour: 12 };
  const cfg = BUILDING_CONFIGS[BuildingType.House];
  const site = building(SITE_ID, BuildingType.House, {
    width: cfg.width,
    height: cfg.height,
    completed: false,
    constructionProgress: 0,
  });
  state.buildings.push(site);

  const adults = state.entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile);
  expect(adults.length, 'fixture premise: the colony starts with adult settlers').toBeGreaterThan(0);
  for (const settler of adults) {
    // Every settler the assignment layer may add to the crew, so the crew count cannot dilute the factor.
    settler.genomeV2 = genomeV2;
    settler.skills = { [JobType.Builder]: 0 };
  }
  const builder = adults[0];
  builder.job = JobType.Builder;
  builder.workerBuildingId = SITE_ID;
  site.occupants = [builder.id];
  state.tick = tickAtDailyPhase(1, 'production') - 1;

  gameTick(state);
  return state.buildings.find((b) => b.id === SITE_ID)!.constructionProgress;
}

describe('the real construction day prices the builder activity on a jobless site', () => {
  it('an improvising builder raises more of a house than an otherwise identical neutral one', () => {
    const plain = houseProgressAfterOneDay(genomeFrom());
    const apt = houseProgressAfterOneDay(CONSTRUCTION_GENOME);

    expect(plain, 'fixture premise: the house site advanced').toBeGreaterThan(0);
    expect(plain, 'fixture premise: the site is still under construction').toBeLessThan(100);
    const factor = evaluateAptitudeInfluence({ genomeV2: CONSTRUCTION_GENOME }, 'construction').factor;
    expect(apt / plain).toBeCloseTo(factor, 6);
  });
});

/** The default colony's whole settler roster — enough workers for the harvest to clear its integer. */
const FARM_WORKERS = 2;
const START_FOOD = 100;

/**
 * One staffed Farm whose crew worked a completed shift on the production day boundary;
 * `skill` is the crew's Farmer trade skill.
 */
function farmWorld(genomeV2: GenomeV2, skill = MAX_SKILL): { state: WorldState; workers: Entity[] } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const cfg = BUILDING_CONFIGS[BuildingType.Farm];
  const farm: Building = {
    id: SITE_ID,
    type: BuildingType.Farm,
    x: 0,
    y: 0,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
  state.buildings.push(farm);

  const workers = state.entities.filter((e) => e.alive && isPlayerHuman(e)).slice(0, FARM_WORKERS);
  expect(workers.length, 'fixture premise: the colony starts with settlers').toBe(FARM_WORKERS);
  for (const worker of workers) {
    worker.faction = undefined;
    worker.workerBuildingId = SITE_ID;
    worker.job = JobType.Farmer;
    worker.genomeV2 = genomeV2;
    worker.skills = { [JobType.Farmer]: skill };
    worker.scheduleLastWorkedHours = getScheduleTargetHours(state);
  }
  farm.occupants = workers.map((worker) => worker.id);
  state.resources.food = START_FOOD;
  state.tick = tickAtDailyPhase(1, 'production') - 1;
  return { state, workers };
}

function harvestedFood(state: WorldState): number {
  return state.resources.food - START_FOOD;
}

describe('the real production day pays the trade activity', () => {
  it('a routine-production crew out-produces an otherwise identical neutral crew', () => {
    const plain = farmWorld(genomeFrom());
    gameTick(plain.state);
    const apt = farmWorld(ROUTINE_GENOME);
    gameTick(apt.state);

    expect(harvestedFood(plain.state), 'fixture premise: the farm harvested').toBeGreaterThan(0);
    expect(harvestedFood(apt.state)).toBeGreaterThan(harvestedFood(plain.state));
  });

  it('still teaches the shift when the store refuses the harvest', () => {
    const full = farmWorld(ROUTINE_GENOME, 0);
    // Above any cap the daily recompute can set, so the harvest itself is refused.
    full.state.resources.food = full.state.storageMax.food + 500;
    gameTick(full.state);

    for (const worker of full.workers) {
      expect(
        readSkill(full.state.entities.find((e) => e.id === worker.id)!, JobType.Farmer),
        'the shift itself stopped paying once the stored harvest was refused',
      ).toBeCloseTo(WORK_SKILL_PER_SHIFT, 6);
    }
  });
});

describe('the apprenticeship-training activity reaches the real teaching path', () => {
  /** A blacksmith with a master at the forge and one bonded apprentice beside him. */
  function forge(genomeV2: GenomeV2): { state: WorldState; apprentice: Entity; master: Entity } {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const cfg = BUILDING_CONFIGS[BuildingType.Blacksmith];
    const blacksmith = building(SITE_ID, BuildingType.Blacksmith, {
      x: cfg.width,
      y: cfg.height,
      occupants: [],
    });
    state.buildings.push(blacksmith);

    const master = human(101, {
      x: blacksmith.x,
      y: blacksmith.y,
      age: 40,
      job: JobType.Blacksmith,
      genomeV2: genomeFrom(),
      skills: { [JobType.Blacksmith]: 80 },
    });
    const apprentice = human(102, {
      x: blacksmith.x,
      y: blacksmith.y,
      age: 20,
      job: JobType.Settler,
      genomeV2,
      skills: { [JobType.Blacksmith]: 0 },
    });
    master.apprenticeId = apprentice.id;
    apprentice.apprenticeOfId = master.id;
    blacksmith.occupants = [master.id];
    state.entities.push(master, apprentice);
    return { state, apprentice, master };
  }

  it('an apprentice whose profile resists the trade learns less per day, for the same master', () => {
    const plain = forge(genomeFrom());
    advanceApprenticeships(plain.state, [plain.master, plain.apprentice]);
    const resistant = forge(TRAINING_RESISTANT_GENOME);
    advanceApprenticeships(resistant.state, [resistant.master, resistant.apprentice]);

    const plainGain = readSkill(plain.apprentice, JobType.Blacksmith);
    const resistantGain = readSkill(resistant.apprentice, JobType.Blacksmith);
    expect(plainGain, 'fixture premise: the master taught').toBeGreaterThan(0);
    const factor = evaluateAptitudeInfluence(resistant.apprentice, 'apprenticeshipTraining').factor;
    expect(factor, 'the fixture premise: the registry prices this profile below neutral').toBeLessThan(1);
    expect(resistantGain).toBeCloseTo(plainGain * factor, 10);
    // The teacher keeps their own hand in either way.
    expect(readSkill(resistant.master, JobType.Blacksmith)).toBeCloseTo(80.05, 10);
  });
});
