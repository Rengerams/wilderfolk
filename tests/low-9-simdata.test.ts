/**
 * Low-severity simulation/data audit fixes (2026-09-13).
 *
 * See BUG_REPORTS/2026-09-13-simulation-logic-audit.md:
 *   L9/L10 — Town Hall pulse counted settlers who died earlier in the same tick
 *   L29    — Hunting Spot read the undefined research key `hunt_yield`
 *   L45    — autumn herd deer bypassed the canonical entity-id index
 *   L46    — every herd loss was reported and remembered as a hunt
 *   L50    — the path-grid cache key omitted the map preset
 *   L64    — the Moon Howler invariant scan carried dead accounting
 *
 * L30 (getGrazerDailyDemand never wired into the live grazing-demand report) is not
 * covered here: its owner `ecosystemPressure.getGrazingPressureReport` is outside the
 * files this task may touch, so no behaviour changed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  MapPreset,
  MapSize,
  Season,
  TerrainType,
  WeatherType,
  createInitialResearchNodes,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldMap, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { ensureEntityByIdMap } from '../src/game/entityIndex';
import { gameTick } from '../src/game/gameTick';
import {
  HERD_BASE_SIZE,
  MIGRATION_WINDOW_DAYS,
  migrationArrivalDay,
  tickMigration,
} from '../src/game/migration';
import { getPathGrid } from '../src/game/pathfinding';
import { setTileOverride } from '../src/game/terrain/terrainGrid';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { enableSeededGlobalRandom, resetSimRng, setSimSeed } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';

afterEach(() => {
  resetSimRng();
});

/** Deterministic RNG for every world driven below. */
function seedRun(): void {
  resetSimRng();
  setSimSeed(1);
  enableSeededGlobalRandom();
}

// ==================== hand-built worlds (mirrors tests/huntingSpot.cleanup.test.ts) ====================

/**
 * `maxAge` and `reproductionCooldown` are load-bearing: these fixtures are ticked by the real
 * `gameTick`, where `tickWildlife` reads `entity.age >= entity.maxAge` for old-age death and
 * `Math.max(0, entity.reproductionCooldown - step)`. An absent cooldown is `NaN`, so every
 * downstream comparison (`<= 0`) would be false. Values match `SPECIES_CONFIG`.
 */
function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function deer(id: number): Entity {
  return {
    id,
    type: EntityType.Deer,
    // Beside the hunter at (100,100): the spot's reach is now bodies touching (`huntingSpot.huntingKillReach`
    // — the owner's *"120 px is way to far, its 1800's they dont have guns"*), and the walking that closes
    // the distance in game belongs to `humanTick`, which this fixture does not run.
    x: 112,
    y: 100,
    energy: 500,
    maxEnergy: 500,
    age: 10,
    maxAge: 4380,
    reproductionCooldown: 576,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 12,
    speed: 1,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
  } as Entity;
}

function building(
  id: number,
  type: BuildingType,
  overrides: Partial<Building> = {},
): Building {
  return {
    id,
    type,
    x: 80,
    y: 80,
    width: 40,
    height: 40,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  };
}

/** Minimal WorldState shaped like the proven hunting-spot fixture. */
function baseState(): WorldState {
  return {
    tick: 0,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
    entities: [],
    buildings: [],
    resources: { wood: 500, stone: 500, food: 0, gold: 0, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Fall,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 1,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 1,
    humanPopulation: 2,
    maxHumanPopulation: 10,
    workingSettlers: 1,
    idleSettlers: 1,
    villageName: 'Low 9',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    disasters: [],
    tradeRoutes: [],
    eventsThisYear: [],
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    festival: null,
  } as unknown as WorldState;
}

function floatingTexts(state: WorldState): string[] {
  return state.floatingTexts.map((t) => t.text);
}

function taxesText(state: WorldState): string | undefined {
  return floatingTexts(state).find((t) => /^\+\d+ gold \(taxes\)$/.test(t));
}

const MEAT_TEXT = /^\+(\d+) meat$/;

function meatText(state: WorldState): string | undefined {
  return floatingTexts(state).find((t) => MEAT_TEXT.test(t));
}

function meatAmount(text: string): number {
  return Number(MEAT_TEXT.exec(text)![1]);
}

// ==================== L9 / L10 ====================

describe('Town Hall daily pulse tax base (L9/L10)', () => {
  /**
   * gameTick replaces `state.entities` only at the end of the tick, so a settler who died
   * earlier in the same tick is still in `state.entities` during the daily layer but not in
   * `allAlive`. Two living adults deliberately straddle the Math.floor boundary of the tax
   * formula (0.8 + 2 = 2 vs 1.2 + 2 = 3), so counting the corpse changes the paid tax.
   */
  function townHallWorld(includeDeadSettler: boolean): WorldState {
    const official = human(1, { homeBuildingId: 10, x: 100, y: 100 });
    const neighbour = human(2, { x: 140, y: 100 });
    const dead = human(3, { alive: false, x: 100, y: 140 });
    const state = baseState();
    // gameTick increments first: 215 -> 216 is day 3, the every-3-days Town Hall pulse.
    state.tick = 3 * TICKS_PER_DAY - 1;
    state.entities = includeDeadSettler ? [official, neighbour, dead] : [official, neighbour];
    state.buildings = [building(10, BuildingType.TownHall, { occupants: [official.id] })];
    return state;
  }

  it('L9/L10 — does not tax a settler who is already dead in the same tick', () => {
    seedRun();
    const withDead = taxesText(gameTick(townHallWorld(true)));
    seedRun();
    const withoutDead = taxesText(gameTick(townHallWorld(false)));

    expect(withDead, 'Town Hall pulse did not run').toMatch(/^\+\d+ gold \(taxes\)$/);
    expect(withoutDead, 'Town Hall pulse did not run').toMatch(/^\+\d+ gold \(taxes\)$/);
    // The corpse in state.entities must not add tax gold to the pulse.
    expect(withDead).toBe(withoutDead);
  });
});

// ==================== L29 ====================

describe('Hunting Spot research multiplier (L29)', () => {
  function huntWorld(day: number, withStoneSpears: boolean): WorldState {
    const hunter = human(1, { homeBuildingId: 10, energy: 100, maxEnergy: 100 });
    const prey = deer(2);
    const state = baseState();
    state.tick = day * TICKS_PER_DAY - 1;
    state.entities = [hunter, prey];
    state.buildings = [
      building(10, BuildingType.HuntingSpot, { occupants: [hunter.id], huntingSpotPrey: 'deer' }),
    ];
    state.humanPopulation = 1;
    state.researchNodes = createInitialResearchNodes();
    if (withStoneSpears) {
      const node = state.researchNodes.find((n) => n.id === 'defense_2');
      if (!node) throw new Error('defense_2 research node missing');
      node.researched = true;
    }
    return state;
  }

  /** Workdays only: the Hunting Spot interval is one day, so weekends never fire. */
  const CANDIDATE_DAYS = [1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22];

  it('L29 — scales its meat output with the hunt_food effect declared by the spear research', () => {
    // The shot lands on a stateless seeded roll, so find a day where the deterministic hunt
    // succeeds and then compare the same day with and without the research.
    let huntDay = 0;
    for (const day of CANDIDATE_DAYS) {
      seedRun();
      if (meatText(gameTick(huntWorld(day, false)))) {
        huntDay = day;
        break;
      }
    }
    expect(huntDay, 'no candidate day produced a successful Hunting Spot shot').toBeGreaterThan(0);

    seedRun();
    const plain = meatText(gameTick(huntWorld(huntDay, false)));
    seedRun();
    const withSpears = meatText(gameTick(huntWorld(huntDay, true)));

    expect(plain).toBeDefined();
    expect(withSpears).toBeDefined();
    // defense_2 (Stone Spears) declares hunt_food x1.25; the Hunting Spot used to read the
    // undefined key `hunt_yield` and therefore never received it.
    expect(meatAmount(withSpears!)).toBeGreaterThan(meatAmount(plain!));
  });
});

// ==================== L45 / L46 ====================

describe('autumn herd bookkeeping (L45, L46)', () => {
  function herdGame() {
    resetSimRng();
    const state = initGame({ villageName: 'Herd', size: 'medium', seed: 4242 });
    const arrival = migrationArrivalDay(state.worldMap!.seed);
    state.tick = arrival * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    const herd = state.entities.filter(
      (e) => e.type === EntityType.Deer && e.migrationTag === 0,
    );
    return { state, arrival, herd };
  }

  it('L45 — registers every spawned herd deer in the canonical entity-id index', () => {
    const { state, arrival, herd } = herdGame();
    expect(herd.length).toBe(HERD_BASE_SIZE);

    const byId = ensureEntityByIdMap(state);
    for (const herdDeer of herd) {
      expect(byId.get(herdDeer.id), `herd deer ${herdDeer.id} missing from entityById`).toBe(herdDeer);
    }

    // Departure keeps the index living-only — no dead herd deer may linger in it.
    const herdIds = herd.map((d) => d.id);
    state.tick = (arrival + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    for (const id of herdIds) {
      expect(byId.get(id), `departed herd deer ${id} still indexed`).toBeUndefined();
    }
  });

  it('L46 — reports and remembers herd losses as losses, not as a hunt', () => {
    const { state, arrival, herd } = herdGame();
    // Wolves thin the herd; the player never hunts. The yearly memory is still keyed on the
    // number of losses (the locked contract in tests/migration.herds.test.ts), but the
    // player-facing text must not claim a hunt that never happened.
    for (let i = 0; i < 3; i++) herd[i].alive = false;

    state.tick = (arrival + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);

    expect(state.migrationNextHerdSize).toBe(HERD_BASE_SIZE - 3);
    const news = state.bigNews.map((n) => n.message).join(' | ');
    const log = state.eventLog.map((e) => e.message).join(' | ');
    expect(news).toContain('lost from the passing herd');
    expect(news).not.toContain('taken');
    expect(log).not.toContain('hunted');
  });
});

// ==================== L50 ====================

describe('path grid cache identity (L50)', () => {
  function makeMap(
    preset: MapPreset,
    seed: number,
    typeAt: (x: number, y: number) => TerrainType,
  ): WorldMap {
    const width = 8;
    const height = 8;
    const map: WorldMap = { width, height, seed, rivers: [], preset, size: MapSize.Medium };
    // Teraforge keeps no per-tile grid, so the fixture's tiles are written as the sparse override
    // layer the canonical reader serves first.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setTileOverride(map, x, y, {
          type: typeAt(x, y),
          elevation: 0.5,
          moisture: 0.5,
          variation: 0.5,
        });
      }
    }
    return map;
  }

  it('L50 — rebuilds when two maps share seed and size but differ in tiles/preset', () => {
    const open = makeMap(MapPreset.Continental, 987654, () => TerrainType.Grassland);
    const river = makeMap(
      MapPreset.Rivers,
      987654,
      (x) => (x === 4 ? TerrainType.River : TerrainType.Grassland),
    );

    expect(Array.from(getPathGrid(open).blocked).some((v) => v === 1)).toBe(false);
    // Same seed, same dimensions — only the preset (and therefore the tiles) differ. The cached
    // open-field grid must not be served for the river map.
    expect(Array.from(getPathGrid(river).blocked).some((v) => v === 1)).toBe(true);
  });
});

// ==================== L64 ====================

describe('Moon Howler invariant scan (L64)', () => {
  function cursed(id: number, overrides: Partial<Entity> = {}): Entity {
    return human(id, { moonHowlerCursed: true, job: JobType.Settler, ...overrides });
  }

  function invariantWorld(entities: Entity[]): WorldState {
    return {
      entities,
      buildings: [],
      villageLeaderId: null,
      year: 5,
      dayInYear: 10,
      tick: 0,
    } as unknown as WorldState;
  }

  it('L64 — asserts the owner rule and names every offending howler', () => {
    // The scan is the collector's report of `moonHowler.countActiveMoonHowlerCurses`.
    expect(collectSimulationInvariantErrors(invariantWorld([cursed(1)]))).toEqual([]);

    const errors = collectSimulationInvariantErrors(
      invariantWorld([cursed(1), cursed(2), cursed(3)]),
    );
    expect(
      errors.filter((e) => e.includes('multiple living Moon Howlers')),
    ).toEqual(['multiple living Moon Howlers: 3 (1, 2, 3)']);

    // A dead cursed settler is not a living curse.
    expect(
      collectSimulationInvariantErrors(
        invariantWorld([cursed(4, { alive: false }), cursed(5)]),
      ),
    ).toEqual([]);
  });
});
