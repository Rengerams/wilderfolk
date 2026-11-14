/**
 * One village anchor per tick: `tickHumans` hoists the building half (`getPlayerCampCenterFromBuildings`)
 * because `updatedBuildings` cannot change during the loop, but re-reads the settler half each time.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, MapSize, Season, emptyEntityByType } from '../src/game/gameTypes';
import type { Building, Entity, RivalSettlement, VisitorGroup, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { tickHumans } from '../src/game/humanTick';
import {
  getPlayerCampCenter,
  getPlayerCampCenterFromBuildings,
  getPlayerSettlerCenter,
} from '../src/game/frontierCombat';
import { clearAllFactionWanderStates } from '../src/game/factionWander';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { getCalendarDay, getColonyDay, setHumanBirthFromAge, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';
import type { TickContext } from '../src/game/simulation/simulationTypes';

const FIXTURE_SEED = 20_260_922;
/** 09:00 on a weekday — inside the default 07:00–16:00 shift, and not a day boundary. */
const WORK_TICK = 9 * TICKS_PER_HOUR;
const HALL_ID = 101;
const BARRACKS_ID = 102;
const FARM_ID = 103;
const HALL = { x: 400, y: 300, width: 40, height: 40 };
const BARRACKS = { x: 200, y: 200, width: 30, height: 30 };
/** Neither a Town Hall nor a House, so it never becomes the anchor — it only gives the settlers a commute. */
const FARM = { x: 1080, y: 820, width: 40, height: 40 };
const HALL_ANCHOR = { x: HALL.x, y: HALL.y };

/**
 * The branch rule as an oracle: `building.x/y` is the canonical footprint centre, so the anchor is
 * the building point itself. The split must stay a pure extraction of this rule.
 */
function canonicalCampCenter(state: WorldState, buildings: Building[]): { x: number; y: number } {
  const playerBuildings = buildings.filter((b) => b.completed && b.faction !== 'rival');
  const townHall = playerBuildings.find((b) => b.type === BuildingType.TownHall);
  if (townHall) {
    return { x: townHall.x, y: townHall.y };
  }
  const house = playerBuildings.find((b) => b.type === BuildingType.House);
  if (house) {
    return { x: house.x, y: house.y };
  }
  const players = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  if (players.length > 0) {
    return {
      x: players.reduce((s, e) => s + e.x, 0) / players.length,
      y: players.reduce((s, e) => s + e.y, 0) / players.length,
    };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

function building(id: number, type: BuildingType, at: { x: number; y: number; width: number; height: number }, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: at.x,
    y: at.y,
    width: at.width,
    height: at.height,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  };
}

/** A settler cloned from a real `initGame` start so every unrelated field is a real value. */
function settler(world: WorldState, id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  const template = world.entities.find((e) => e.type === EntityType.Human && isPlayerHuman(e));
  if (!template) throw new Error('initGame produced no settler to use as the fixture template');
  const entity: Entity = {
    ...template,
    id,
    x,
    y,
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
    ...overrides,
  };
  setHumanBirthFromAge(entity, entity.age ?? 30, getColonyDay(world));
  return entity;
}

function rivalSettlement(): RivalSettlement {
  return {
    id: 'R1',
    name: 'Ridge',
    campX: 520,
    campY: 300,
    population: 6,
    relationship: 'tense',
    foundedYear: 0,
    daysUntilAction: 5,
    raidCooldownDays: 5,
    peaceTreatyDays: 0,
  };
}

function visitorGroup(): VisitorGroup {
  return {
    id: 'V1',
    name: 'Traders',
    kind: 'traders',
    entityIds: [],
    campX: 700,
    campY: 500,
    daysLeft: 3,
    giftsGiven: 0,
    tradesCompleted: 0,
    refugeeResolved: false,
    leaderTalked: false,
  };
}

interface Fixture {
  world: WorldState;
  guard: Entity;
  raider: Entity;
  visitor: Entity;
  hall: Building | null;
  barracks: Building;
}

/**
 * A village with a barracks, a marching war-band, a visitor group, a barracks guard on shift and
 * roaming settlers; `withHall` decides which half of the anchor answers.
 */
function anchorFixture(withHall: boolean): Fixture {
  const world = initGame({
    villageName: 'Anchor', size: MapSize.Medium, seed: FIXTURE_SEED, skipTerrain: true,
  });
  // The anchor test needs flat walkable ground, not a particular random biome.
  world.worldMap = testWorldMap({ tilesX: 128, tilesY: 96, seed: FIXTURE_SEED });
  world.tick = WORK_TICK;
  world.dayInYear = getCalendarDay(WORK_TICK);

  const hall = withHall ? building(HALL_ID, BuildingType.TownHall, HALL) : null;
  const barracks = building(BARRACKS_ID, BuildingType.Barracks, BARRACKS, { occupants: [4] });
  const farm = building(FARM_ID, BuildingType.Farm, FARM, { occupants: [5, 6, 7] });
  world.buildings = hall ? [hall, barracks, farm] : [barracks, farm];

  const guard = settler(world, 4, 215, 215, {
    job: JobType.Soldier,
    workerBuildingId: BARRACKS_ID,
    energy: 90,
  });
  const raider = settler(world, 3, 640, 320, {
    faction: 'rival',
    groupId: 'R1',
    energy: 90,
  });
  const visitor = settler(world, 2, 700, 500, {
    faction: 'visitor',
    groupId: 'V1',
    energy: 90,
  });
  // Free-roaming settlers, far from the village and on a long commute to the farm: their walk is
  // what shifts the settler average during the tick.
  const roamers = [
    settler(world, 5, 100, 700, { workerBuildingId: FARM_ID }),
    settler(world, 6, 150, 750, { workerBuildingId: FARM_ID }),
    settler(world, 7, 200, 800, { workerBuildingId: FARM_ID }),
  ];

  // Order matters: the raider takes an anchor sample first, the guard last.
  world.entities = [raider, ...roamers, guard, visitor];
  world.rivalSettlements = [rivalSettlement()];
  world.visitorGroups = [visitorGroup()];
  world.pendingRaidEvents = [
    {
      id: 'raid_R1',
      rivalId: 'R1',
      rivalName: 'Ridge',
      title: 'War-band',
      description: 'A war-band is marching.',
      emoji: '⚔️',
      choices: [],
      createdAtTick: 0,
      expiresAtTick: WORK_TICK + 200,
      marchDistanceTiles: 20,
      attackerStrength: 60,
      lootFood: 0,
      lootGold: 0,
      lootWood: 0,
      lootStone: 0,
    },
  ];
  return { world, guard, raider, visitor, hall, barracks };
}

/** Minimal real TickContext for `tickHumans`, over the fixture's own cast. */
function simContext(state: WorldState, humans: Entity[]): TickContext {
  const byType = emptyEntityByType();
  byType[EntityType.Human] = humans;
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 9,
    season: Season.Summer,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
    hasWell: false,
    hasHospital: false,
  };
}

// `factionWander` keeps its visitor wander state in a module-level Map, so two runs in one process
// would otherwise inherit each other's targets.
beforeEach(() => {
  clearAllFactionWanderStates();
});

function runTick(fixture: Fixture): void {
  clearAllFactionWanderStates();
  tickHumans(fixture.world, simContext(fixture.world, fixture.world.entities));
}

describe('camp anchor split (N-4)', () => {
  it('matches the canonical centre in every branch', () => {
    const { world, hall, barracks } = anchorFixture(true);
    const house = building(103, BuildingType.House, { x: 60, y: 60, width: 20, height: 20 });
    const rivalHall = building(104, BuildingType.TownHall, { x: 900, y: 900, width: 40, height: 40 }, {
      faction: 'rival',
    });
    const unfinishedHall = building(105, BuildingType.TownHall, { x: 800, y: 100, width: 40, height: 40 }, {
      completed: false,
    });

    const cases: Array<{ name: string; buildings: Building[] }> = [
      { name: 'town hall wins over house', buildings: [house, hall!, house] },
      { name: 'house when there is no hall', buildings: [house, barracks] },
      { name: 'rival hall is not a player hall', buildings: [rivalHall, house] },
      { name: 'unfinished hall is not a hall', buildings: [unfinishedHall, house] },
      { name: 'no buildings at all', buildings: [] },
    ];

    for (const c of cases) {
      expect(getPlayerCampCenter(world, c.buildings), c.name).toEqual(canonicalCampCenter(world, c.buildings));
      expect(getPlayerCampCenter(world, c.buildings), c.name).toEqual(
        getPlayerCampCenterFromBuildings(c.buildings) ?? getPlayerSettlerCenter(world),
      );
    }

    // Pinned answers, so the branches themselves are under test and not just the agreement.
    expect(getPlayerCampCenterFromBuildings([hall!, house])).toEqual(HALL_ANCHOR);
    expect(getPlayerCampCenterFromBuildings([house])).toEqual({ x: 60, y: 60 });
    expect(getPlayerCampCenterFromBuildings([rivalHall, unfinishedHall])).toBeNull();
    expect(getPlayerCampCenterFromBuildings([])).toBeNull();
    expect(getPlayerCampCenter(world, [])).toEqual(getPlayerSettlerCenter(world));

    // No settlers and no buildings: the map centre, as before.
    world.entities = [];
    expect(getPlayerCampCenter(world, [])).toEqual({ x: world.width / 2, y: world.height / 2 });
  });
});

describe('camp anchor inside the human loop (N-4)', () => {
  it('sends the war-band and the barracks guard to the Town Hall, whatever else the tick does', () => {
    const fixture = anchorFixture(true);
    const { world, guard, raider, visitor } = fixture;
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(HALL_ANCHOR);

    runTick(fixture);

    // The anchor is unchanged by the tick: nothing in the loop touches a building (N-4 equivalence).
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(HALL_ANCHOR);
    expect(getPlayerCampCenterFromBuildings(world.buildings)).toEqual(HALL_ANCHOR);

    // The war-band follows the anchored camp; the guard keeps his barracks patrol post.
    expect(raider.x).toBeLessThan(640);
    expect(raider.x).toBeGreaterThan(620);
    // The canonical hall centre (400,300) is slightly north of the old corner anchor (420,320), so the
    // march also drifts north instead of holding y = 320 exactly.
    expect(raider.y).toBeLessThan(320);
    expect(raider.y).toBeGreaterThan(300);
    expect(Math.hypot(guard.x - 215, guard.y - 215)).toBeLessThan(30);

    // The visitor's anchor read only feeds `nearVillage`, which scales chat chance rather than
    // steering, so only its survival through the shared branch is asserted.
    expect(visitor.alive).toBe(true);
    expect(Number.isFinite(visitor.x) && Number.isFinite(visitor.y)).toBe(true);
  });

  it('follows the live settlers when the village has neither hall nor house', () => {
    const fixture = anchorFixture(false);
    const { world, guard, raider } = fixture;
    const before = getPlayerSettlerCenter(world);
    expect(getPlayerCampCenterFromBuildings(world.buildings)).toBeNull();
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(before);

    runTick(fixture);

    // The half that must not be cached really does move inside the tick: the three farm-hands walk
    // toward the farm while the guard patrols, so the average is not the same number twice.
    const after = getPlayerSettlerCenter(world);
    expect(after).not.toEqual(before);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.5);
    expect(getPlayerCampCenter(world, world.buildings)).toEqual(after);

    // A live settler anchor steers the war-band; the guard remains at his post.
    expect(raider.x).toBeLessThan(640);
    expect(raider.x).toBeGreaterThan(620);
    expect(raider.y).toBeGreaterThan(320);
    expect(Math.hypot(guard.x - 215, guard.y - 215)).toBeLessThan(30);
  });
});
