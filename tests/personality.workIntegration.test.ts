/**
 * PR B — the work consumers read the one trait evaluator (`personality/traitEvaluation.ts`).
 *
 * Three things are pinned here, all against real owners rather than re-derived formulas:
 * 1. The shared crew multiplier (`skills.getWorkerSkillMultiplier`, read by daily production, the
 *    workshop estimate and the building panel) prices the trade's DNA exactly once.
 * 2. A construction crew is priced from the catalog's `work`/builder/construction context — the
 *    retired +10%-per-Resourceful-worker (cap +30%) branch is gone, not stacked beside it.
 * 3. A worked shift still teaches its trade with a trait-carrying crew, store full or not.
 * 4. The apprenticeship `work`/training context reaches the real teaching path.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { getScheduleTargetHours } from '../src/game/scheduleFatigue';
import { MAX_SKILL, readSkill, WORK_SKILL_PER_SHIFT, getWorkerSkillMultiplier } from '../src/game/skills';
import { advanceApprenticeships } from '../src/game/apprenticeships';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { building, human } from '../src/test/factories';

const FIXTURE_SEED = 20_261_028;
const SITE_ID = 30_000;
const FARMER = { kind: 'work', job: JobType.Farmer, action: 'production' } as const;

/** A one-worker crew map, so the multiplier reads the id map and not a world scan. */
function crew(worker: Entity): Map<number, Entity> {
  return new Map([[worker.id, worker]]);
}

function skillingWorker(id: number, traits: SettlerTrait[]): Entity {
  return human(id, {
    job: JobType.Farmer,
    traits,
    skills: {},
    alive: true,
    isJuvenile: false,
  });
}

const bare = { entities: [] } as unknown as WorldState;

describe('the crew multiplier prices the trade DNA once', () => {
  it('applies the catalog factor of a farmer carrying a farming trait', () => {
    const farm = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const plain = skillingWorker(1, []);
    const greenthumb = skillingWorker(1, ['greenthumb']);

    const withoutTrait = getWorkerSkillMultiplier(bare, farm, crew(plain));
    const withTrait = getWorkerSkillMultiplier(bare, farm, crew(greenthumb));
    const factor = evaluateTraitInfluence(greenthumb, FARMER).factor;

    expect(factor, 'the fixture premise: the catalog rewards a farmer for this trait').toBeGreaterThan(1);
    expect(withTrait).toBeCloseTo(withoutTrait * factor, 10);
    // Exactly one application: the product of two factors would be far above the single one.
    expect(withTrait / withoutTrait).toBeLessThan(1 + 2 * (factor - 1));
  });

  it('leaves a crew whose traits are irrelevant to the trade at the plain value', () => {
    const farm = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const plain = skillingWorker(1, []);
    const stoic = skillingWorker(1, ['stoic']);

    expect(evaluateTraitInfluence(stoic, FARMER), 'fixture premise').toEqual({ factor: 1, tendency: 0 });
    expect(getWorkerSkillMultiplier(bare, farm, crew(stoic)))
      .toBe(getWorkerSkillMultiplier(bare, farm, crew(plain)));
  });

  it('treats an unresolved occupant id as neutral instead of diluting the crew factor', () => {
    const solo = building(SITE_ID, BuildingType.Farm, { occupants: [1] });
    const withStale = building(SITE_ID, BuildingType.Farm, { occupants: [1, 99] });
    const plain = skillingWorker(1, []);
    const greenthumb = skillingWorker(1, ['greenthumb']);

    // Neutral DNA must stay neutral even when a crew slot points at nobody.
    expect(getWorkerSkillMultiplier(bare, withStale, crew(plain)))
      .toBeCloseTo(getWorkerSkillMultiplier(bare, solo, crew(plain)), 10);
    // The known settler's DNA counts once; the missing slot contributes a neutral 1.
    const trait = evaluateTraitInfluence(greenthumb, FARMER).factor;
    expect(getWorkerSkillMultiplier(bare, withStale, crew(greenthumb))).toBeCloseTo((1 + trait) / 2, 10);
  });

  it('prices a construction crew from the catalog\'s builder construction context', () => {
    const site = building(SITE_ID, BuildingType.Farm, { occupants: [1], completed: false });
    const construction = { kind: 'work', job: JobType.Builder, action: 'construction' } as const;
    const plain = skillingWorker(1, []);
    const greenthumb = skillingWorker(1, ['greenthumb']);
    const resourceful = skillingWorker(1, ['resourceful']);

    const factor = evaluateTraitInfluence(resourceful, construction).factor;
    expect(factor, 'the fixture premise: the catalog rewards a builder raising a site').toBeGreaterThan(1);
    expect(getWorkerSkillMultiplier(bare, site, crew(plain), 'construction')).toBe(1);
    expect(getWorkerSkillMultiplier(bare, site, crew(resourceful), 'construction')).toBeCloseTo(factor, 10);
    // A farmer's DNA says nothing about raising walls, and no old +10% branch survives beside it.
    expect(getWorkerSkillMultiplier(bare, site, crew(greenthumb), 'construction'))
      .toBe(getWorkerSkillMultiplier(bare, site, crew(plain), 'construction'));
  });
});

/** The default colony's whole settler roster — enough workers for the harvest to clear its integer. */
const FARM_WORKERS = 2;
const START_FOOD = 100;

/**
 * One staffed Farm whose crew worked a real, completed shift, on the production day boundary.
 *
 * `skill` is the crew's Farmer trade skill: high for an output comparison (so the harvest clears the
 * integer the store records), zero when the point is the shift credit an unpractised crew earns.
 */
function farmWorld(traits: SettlerTrait[], skill = MAX_SKILL): { state: WorldState; workers: Entity[] } {
  const state = initGame({ seed: FIXTURE_SEED });
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
    worker.traits = traits;
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

describe('the real production day pays the trade DNA', () => {
  it('a greenthumb crew out-produces an otherwise identical plain crew', () => {
    const plain = farmWorld([]);
    gameTick(plain.state);
    const gifted = farmWorld(['greenthumb']);
    gameTick(gifted.state);

    expect(harvestedFood(plain.state), 'fixture premise: the farm harvested').toBeGreaterThan(0);
    expect(harvestedFood(gifted.state)).toBeGreaterThan(harvestedFood(plain.state));
  });

  it('still teaches the shift when the store refuses the harvest', () => {
    const full = farmWorld(['greenthumb'], 0);
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

describe('the apprenticeship training context reaches the real teaching path', () => {
  /** A blacksmith with a master at the forge and one bonded apprentice beside him. */
  function forge(traits: SettlerTrait[]): { state: WorldState; apprentice: Entity; master: Entity } {
    const state = initGame({ seed: FIXTURE_SEED });
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
      traits: [],
      skills: { [JobType.Blacksmith]: 80 },
    });
    const apprentice = human(102, {
      x: blacksmith.x,
      y: blacksmith.y,
      age: 20,
      job: JobType.Settler,
      traits,
      skills: { [JobType.Blacksmith]: 0 },
    });
    master.apprenticeId = apprentice.id;
    apprentice.apprenticeOfId = master.id;
    blacksmith.occupants = [master.id];
    state.entities.push(master, apprentice);
    return { state, apprentice, master };
  }

  it('an apprentice whose DNA resists the trade learns less per day, for the same master', () => {
    const plain = forge([]);
    advanceApprenticeships(plain.state, [plain.master, plain.apprentice]);
    const gifted = forge(['greenthumb']);
    advanceApprenticeships(gifted.state, [gifted.master, gifted.apprentice]);

    const plainGain = readSkill(plain.apprentice, JobType.Blacksmith);
    const giftedGain = readSkill(gifted.apprentice, JobType.Blacksmith);
    expect(plainGain, 'fixture premise: the master taught').toBeGreaterThan(0);
    const factor = evaluateTraitInfluence(gifted.apprentice, {
      kind: 'work',
      job: JobType.Blacksmith,
      action: 'training',
    }).factor;
    expect(factor, 'the fixture premise: the catalog prices this trait indoors').toBeLessThan(1);
    expect(giftedGain).toBeCloseTo(plainGain * factor, 10);
    // The teacher keeps their own hand in either way.
    expect(readSkill(gifted.master, JobType.Blacksmith)).toBeCloseTo(80.05, 10);
  });
});
