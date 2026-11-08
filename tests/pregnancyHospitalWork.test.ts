/**
 * The pregnancy hospital rule outranks the shift: expected duty hours still accrue, verified
 * presence at the post does not, and the job assignment survives the hospital stay.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, MapSize, Season, emptyEntityByType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import { clearAllFactionWanderStates } from '../src/game/factionWander';
import { getColonyDay, setHumanBirthFromAge, PREGNANCY_TICKS, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
import type { TickContext } from '../src/game/simulation/simulationTypes';

const FIXTURE_SEED = 20_261_108;
/** Monday 10:00 — inside the default 07:00–16:00 work window. */
const WORK_TICK = 10 * TICKS_PER_HOUR;
const FARM_ID = 10;
const HOSPITAL_ID = 20;
const HOUSE_ID = 30;

function building(
  id: number,
  type: BuildingType,
  at: { x: number; y: number },
  occupants: number[],
): Building {
  return {
    id,
    type,
    x: at.x,
    y: at.y,
    width: 40,
    height: 40,
    occupants,
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

function settler(world: WorldState, id: number, overrides: Partial<Entity> = {}): Entity {
  const template = world.entities.find((e) => e.type === EntityType.Human && isPlayerHuman(e));
  if (!template) throw new Error('initGame produced no settler to use as the fixture template');
  const entity: Entity = {
    ...template,
    id,
    vx: 0,
    vy: 0,
    alive: true,
    isJuvenile: false,
    job: JobType.Settler,
    workerBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    partnerId: undefined,
    affairPartnerId: undefined,
    childrenIds: [],
    needs: { ...template.needs!, stamina: 90 },
    ...overrides,
  };
  setHumanBirthFromAge(entity, entity.age ?? 30, getColonyDay(world));
  return entity;
}

interface Fixture {
  world: WorldState;
  farmer: Entity;
  farm: Building;
}

/** One pregnant farmer posted at her farm, one doctor staffing the hospital. */
function farmWorld(pregnancyProgress: number): Fixture {
  const world = initGame({
    villageName: 'Attendance', size: MapSize.Medium, seed: FIXTURE_SEED, skipTerrain: true,
  });
  world.worldMap = null;
  world.tick = WORK_TICK;

  const farm = building(FARM_ID, BuildingType.Farm, { x: 60, y: 60 }, [1]);
  const hospital = building(HOSPITAL_ID, BuildingType.Hospital, { x: 420, y: 300 }, [2]);
  const house = building(HOUSE_ID, BuildingType.House, { x: 300, y: 60 }, [1, 2]);
  world.buildings = [farm, hospital, house];

  const post = humanBuildingTarget(farm, 1, false);
  const farmer = settler(world, 1, {
    x: post.x,
    y: post.y,
    job: JobType.Farmer,
    workerBuildingId: farm.id,
    residenceBuildingId: house.id,
    gender: 'female',
    pregnant: true,
    pregnancyProgress,
    pregnancyDueProgress: PREGNANCY_TICKS,
  });
  const doctor = settler(world, 2, {
    x: hospital.x,
    y: hospital.y,
    job: JobType.Doctor,
    workerBuildingId: hospital.id,
    residenceBuildingId: house.id,
  });
  world.entities = [farmer, doctor];
  return { world, farmer, farm };
}

function runTicks(world: WorldState, ticks: number): void {
  const humans = world.entities;
  const byType = emptyEntityByType();
  byType[EntityType.Human] = humans;
  const context: TickContext = {
    width: world.width,
    height: world.height,
    hourOfDay: world.tick / TICKS_PER_HOUR,
    season: Season.Summer,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: world.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(world.buildings.map((b) => [b.id, b])),
    predators: [],
    hasWell: false,
    hasHospital: true,
  } as TickContext;
  for (let i = 0; i < ticks; i++) {
    clearAllFactionWanderStates();
    tickHumans(world, context);
  }
}

describe('pregnancy at work and at the hospital', () => {
  it('stops crediting work presence from the 85% threshold while the duty hours still accrue', () => {
    const { world, farmer, farm } = farmWorld(PREGNANCY_TICKS * 0.9);
    runTicks(world, 3);

    expect(farmer.schedulePresentTicksToday ?? 0).toBe(0);
    expect(farmer.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
    // The hospital stay is not a resignation.
    expect(farmer.workerBuildingId).toBe(farm.id);
  });

  it('credits real work below the threshold with the same staffed hospital standing by', () => {
    const { world, farmer } = farmWorld(PREGNANCY_TICKS * 0.84);
    runTicks(world, 3);

    expect(farmer.schedulePresentTicksToday ?? 0).toBeGreaterThan(0);
    expect(farmer.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
  });
});
