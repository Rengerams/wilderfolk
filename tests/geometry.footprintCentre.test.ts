/**
 * Geometry-drift regressions (W-118, W-119, W-122): `building.x/y` is the footprint centre, so the
 * camp anchor, the civic gates and camp sites all read the one building/placement owner.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BuildingType, EntityType, JobType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { getPlayerCampCenterFromBuildings } from '../src/game/villageAnchor';
import { resolveCivicPetition } from '../src/game/townHall';
import { spawnVisitorGroup } from '../src/game/groupEvents';
import {
  REPAIR_COST,
  repairBuilding,
  upgradeBuilding,
} from '../src/game/buildingMaintenanceActions';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/simRng';
import { resetPathGridCaches } from '../src/game/pathfinding';
import { isFootprintOnBuildableTerrain, overlapsAnyBuilding } from '../src/game/placementUtils';
import { tileAt } from '../src/game/terrain/terrainGrid';
import { testWorldMap } from '../src/test/worldMapFixtures';

const OFFICIAL_ID = 1;
const PETITIONER_ID = 2;
const FIXTURE_SEED = 20_261_111;
const HALL_X = 400;
const HALL_Y = 300;
/** A mapped fixture's world size: 128 × 96 tiles at the L0 path-cell edge. */
const FIXTURE_WORLD_WIDTH = 128 * PATH_CELL;
const FIXTURE_WORLD_HEIGHT = 96 * PATH_CELL;

beforeEach(() => {
  // Every gate falls back to the current path grid; a leaked grid from another file would change it.
  resetPathGridCaches();
});

function building(
  id: number,
  type: BuildingType,
  at: { x: number; y: number; width: number; height: number },
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    x: at.x,
    y: at.y,
    width: at.width,
    height: at.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
    ...overrides,
  } as Building;
}

/** A real Town Hall footprint — the audit's 63 × 53 case, not a toy rectangle. */
function townHall(x: number, y: number, overrides: Partial<Building> = {}): Building {
  const config = BUILDING_CONFIGS[BuildingType.TownHall];
  return building(500, BuildingType.TownHall, { x, y, width: config.width, height: config.height }, overrides);
}

function human(id: number, x: number, y: number, job: JobType): Entity {
  return {
    id,
    type: EntityType.Human,
    x,
    y,
    energy: 120,
    maxEnergy: 200,
    age: 30,
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
    gender: 'female',
    name: `Settler ${id}`,
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
  } as Entity;
}

/** A day whose gate and "heard" rolls both pass, at an hour the hall is open. */
function servableTick(): number {
  for (let day = 1; day <= 5000; day++) {
    const tick = day * TICKS_PER_DAY + 8 * TICKS_PER_HOUR;
    if (personDayRoll(PETITIONER_ID, tick, 821 + day) <= 0.4
      && personDayRoll(PETITIONER_ID, tick, 823) < 0.55) return tick;
  }
  throw new Error('no day produces a passing civic-petition roll');
}

function civicWorld(): { state: WorldState; hall: Building; petitioner: Entity } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const hall = townHall(HALL_X, HALL_Y, { occupants: [OFFICIAL_ID] });
  const official = human(OFFICIAL_ID, HALL_X, HALL_Y, JobType.Official);
  const petitioner = human(PETITIONER_ID, HALL_X, HALL_Y, JobType.Settler);
  const tick = servableTick();
  petitioner.scandalCooldownUntilTick = tick + 100;
  state.entities = [official, petitioner];
  state.buildings = [hall];
  state.tick = tick;
  state.villageLeaderId = null;
  state.humanPopulation = 20;
  state.resources.food = 500;
  state.resources.gold = 0;
  return { state, hall, petitioner };
}

describe('the camp anchor reads the canonical building centre (W-118)', () => {
  it('anchors on a real Town Hall centre, not half a footprint south-east of it', () => {
    const hall = townHall(HALL_X, HALL_Y);
    expect(getPlayerCampCenterFromBuildings([hall])).toEqual({ x: HALL_X, y: HALL_Y });
    // The old convention would have answered HALL_X + 31.5, HALL_Y + 26.5.
    expect(getPlayerCampCenterFromBuildings([hall])).not.toEqual({ x: HALL_X + 31.5, y: HALL_Y + 26.5 });
  });
});

describe('the civic gate reads the hall centre and the shared reach rule (W-119)', () => {
  it('serves a settler at the hall centre and refuses one 60 px outside', () => {
    const { state, hall, petitioner } = civicWorld();

    expect(resolveCivicPetition(state, petitioner, hall).kind).not.toBe('none');

    // 60 px from the centre of a 63 px-wide hall is 28.5 px beyond the wall: outside the reach rule.
    petitioner.x = HALL_X + 60;
    petitioner.y = HALL_Y;
    expect(resolveCivicPetition(state, petitioner, hall)).toEqual({ kind: 'none' });
  });
});

describe('maintenance refusal text sits on the building centre (W-140)', () => {
  it('floats repair and upgrade costs at the centre, not half a footprint east', () => {
    const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
    const house = building(700, BuildingType.House, {
      x: HALL_X, y: 400, width: 40, height: 40,
    }, { health: 40 });
    state.buildings = [house];
    state.resources = { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 };

    const repaired = repairBuilding(state, house.id);
    const repairText = repaired.floatingTexts[repaired.floatingTexts.length - 1];
    expect(repairText).toMatchObject({
      x: HALL_X,
      y: 400,
      text: `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s`,
    });
    expect(repairText.x).not.toBe(HALL_X + house.width / 2);

    const upgraded = upgradeBuilding(state, house.id);
    const upgradeText = upgraded.floatingTexts[upgraded.floatingTexts.length - 1];
    expect(upgradeText).toMatchObject({ x: HALL_X, y: 400, text: 'Need 50w 25s 50g' });
  });
});

/** A mapped, flat fixture with no settlers, so the camp anchor is the map centre. */
function campWorld(
  tileType: (tx: number, ty: number) => TerrainType | undefined,
  buildings: Building[] = [],
): WorldState {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  state.width = FIXTURE_WORLD_WIDTH;
  state.height = FIXTURE_WORLD_HEIGHT;
  state.worldMap = testWorldMap({
    tilesX: 128,
    tilesY: 96,
    seed: FIXTURE_SEED,
    tileType,
  });
  state.tick = 7 * TICKS_PER_DAY;
  state.entities = [];
  state.visitorGroups = [];
  state.rivalSettlements = [];
  state.buildings = buildings;
  return state;
}

function spawnCamp(state: WorldState): { x: number; y: number } {
  spawnVisitorGroup(state, state.entities, state.buildings, 'traders');
  const camp = state.visitorGroups[0];
  if (!camp) throw new Error('the visitor group did not spawn');
  return { x: camp.campX, y: camp.campY };
}

describe('a visitor camp stands on legal ground (W-122)', () => {
  it('rejects water: a flooded ring moves the camp to the dry shore', () => {
    // The whole map is shallow water except the western strip; the 70–160 px camp ring is flooded.
    const state = campWorld((tx) => (tx < 40 ? undefined : TerrainType.ShallowWater));
    const camp = spawnCamp(state);
    const map = state.worldMap!;
    const tile = tileAt(map, Math.floor(camp.x / PATH_CELL), Math.floor(camp.y / PATH_CELL));
    expect(tile?.type).not.toBe(TerrainType.ShallowWater);
    expect(isFootprintOnBuildableTerrain(state, 32, 32, camp.x, camp.y)).toBe(true);
  });

  it('rejects occupied ground: a full building ring moves the camp clear of the footprint', () => {
    const barracks = building(600, BuildingType.Barracks, {
      x: FIXTURE_WORLD_WIDTH / 2,
      y: FIXTURE_WORLD_HEIGHT / 2,
      width: 400,
      height: 400,
    });
    const state = campWorld(() => undefined, [barracks]);
    const camp = spawnCamp(state);
    expect(overlapsAnyBuilding(state.buildings, 32, 32, camp.x, camp.y)).toBe(false);
    expect(isFootprintOnBuildableTerrain(state, 32, 32, camp.x, camp.y)).toBe(true);
  });
});
