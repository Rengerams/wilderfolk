/**
 * Shared seeded scenarios and colony-health observation for the long-run harnesses, so they cannot
 * drift apart. Writes are only setup the game performs itself when a player builds and staffs.
 */
import { buildingAccessPoint, isAtBuildingReach } from '../src/game/buildingAccess';
import { isPlayerHuman } from '../src/game/playerHuman';
import { getHourOfDay, getTickOfDay, TICKS_PER_DAY } from '../src/game/dayCycle';
import { getWorkSchedule, isWorkScheduleHour } from '../src/game/workSchedule';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { initGame } from '../src/game/gameEngine';
import { createBuilding } from '../src/game/worldGen';
import { getBuildingFootprintForType, snapBuildingCenter } from '../src/game/buildingRotation';
import { isFootprintWithinMapBounds, overlapsAnyBuilding } from '../src/game/placementUtils';
import { beginCommuteRoutePass, isWithinAssignableCommute } from '../src/game/commuteReach';
import { getCurrentPathGrid, setCurrentPathMap } from '../src/game/pathfinding';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { assignMissingResidences } from '../src/game/housingPipeline';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES, BuildingType, EntityType, MapSize, PATH_CELL } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { updateStorageCaps } from '../src/game/economy';
import { getRecentFoodFlow } from '../src/game/economyLedger';
import {
  assignWorkerTransition,
  countWorkingAndIdleSettlers,
  syncJobBuildingOccupants,
} from '../src/game/workforce';
import { collectHousingDiagnostics, isHousingDiagnosticsHealthy, type HousingDiagnosticsSnapshot } from '../src/game/housingDiagnostics';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { countTamedAnimals, getAnimalCareStatus, tamedAnimalsFedToday, type AnimalCareStatus } from '../src/game/animalCare';
import { getGuidedCampaignProgress } from '../src/game/guidedCampaign';
import { getActiveElectionPromises, type PromiseDetail } from '../src/game/electionPromises';
import { ELECTION_INTERVAL_YEARS } from '../src/game/villageLeadership';
import { AFFAIR_ESTABLISHED_LOG_PHRASE } from '../src/game/simulation/humanRelationships';
import { formatCitizenName } from '../src/game/citizenId';
import { simTickDeltaFromWorld } from '../src/game/simBuffers/simDelta';
import {
  getLatestRelationshipDiagnostics,
  getRelationshipDiagnosticsHistory,
  type RelationshipDiagnosticsSnapshot,
} from '../src/game/relationshipDiagnostics';
import { BASE_TICKS_PER_SECOND } from '../src/game/gameLoop';
import { setSimSeed } from '../src/game/simRng';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { hydrateWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';

/** Apply the real Virtual Player command, retaining cloned worker command results. */
export function applyColonyBotAction(world: WorldState): string | null {
  const decision = decideVirtualPlayerAction(world);
  if (!decision) return null;
  const applied = applyWorkerCommand(world, decision.command);
  if (applied !== world) {
    const target = world as unknown as Record<string, unknown>;
    const source = applied as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      if (!(key in source)) delete target[key];
    }
    Object.assign(target, source);
    // The replacement entities invalidate WeakMap buckets keyed by the reused world shell.
    hydrateWorldRuntimeCaches(world);
  }
  return decision.command.op;
}

/**
 * One in-game tick's real-time budget at 1× speed, derived from the loop's own pacing constant. A tick
 * slower than this cannot hold the baseline pace and counts as stalled.
 */
export const PACING_TICK_BUDGET_MS = 1000 / BASE_TICKS_PER_SECOND;

/** Delta serialization slower than this counts as a spike (named so the report can cite a value). */
export const SERIALIZATION_SPIKE_MS = 50;

/** Worker stall watchdog window for the harness's own transport sample, mirroring `gameLoop`. */
export const WORKER_STALL_TIMEOUT_MS = 10_000;

// Scenario plans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two seeded scenarios the harness can run. `restocked` is the pre-existing gate exactly as it
 * behaved; `producers` is the one the roadmap asks for, which closes the measured coverage gap.
 */
export const SCENARIOS = {
  /** Today's gate: no producers, and the larder is refilled to `storageMax` at every checkpoint. */
  restocked: {
    restocksAtCheckpoint: true,
    producers: false,
  },
  /** Producers staffed from day 1 and **no restock after day 0**, so production/spoilage/consumption carry the colony. */
  producers: {
    restocksAtCheckpoint: false,
    producers: true,
  },
} as const;

export type ScenarioName = keyof typeof SCENARIOS;

export function isScenarioName(value: string): value is ScenarioName {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}

const STARTER_HOUSE_COUNT = 8;
/** Barn/Silo pair count that gives the restocked gate a legitimate food larder. */
const STARTER_STORAGE_COUNT = 8;
const PRODUCERS_FARM_COUNT = 4;
const PRODUCERS_LUMBER_MILL_COUNT = 1;
const PRODUCERS_BARN_COUNT = 2;
const PRODUCERS_SILO_COUNT = 1;
/** Share of the computed storage cap the producers scenario starts with, so production must carry it. */
const PRODUCERS_INITIAL_FOOD_SHARE = 1;
const PRODUCERS_INITIAL_WOOD_SHARE = 1;
/** Wood the restocked gate fills to (its historical 12 000 cap, clipped by the buildings' own cap). */
const RESTOCKED_INITIAL_WOOD = 12_000;

export interface ColonyScenarioOptions {
  size: MapSize;
  seed: number;
  scenario: ScenarioName;
}

export interface ColonyScenario {
  world: WorldState;
  startTick: number;
  startYear: number;
  /** Printed and logged verbatim: which scenario restocks and which does not. */
  restocksAtCheckpoint: boolean;
  settlement: Record<string, unknown>;
}

export function createCompletedBuilding(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
): Building {
  const building = createBuilding(type, x, y, state.nextBuildingId++);
  building.completed = true;
  building.constructionProgress = 1;
  building.spriteScale = 1;
  state.buildings.push(building);
  return building;
}

/**
 * Place a starter building in bounded rings around the preferred coordinates, using the production
 * placement and commute owners — never paint passable terrain or bypass the commute limit to pass.
 */
function placeLegalStarterBuilding(
  world: WorldState,
  type: BuildingType,
  preferred: { x: number; y: number },
  fromHomes: readonly Building[] = [],
): Building {
  const step = Math.max(70, BUILDING_CONFIGS[type].width + 20, BUILDING_CONFIGS[type].height + 20);
  const commuter = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
  if (fromHomes.length > 0 && !commuter) throw new Error('Starter colony has no human commuters');
  setCurrentPathMap(world.worldMap, world.buildings);
  beginCommuteRoutePass();
  for (let ring = 0; ring <= 24; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = snapBuildingCenter(type, preferred.x + dx * step, preferred.y + dy * step, 0);
        // Already-built fixtures bypass the placement owner (research/slope gates are not navigation
        // barriers), but must stay walkable and overlap-free.
        const footprint = getBuildingFootprintForType(type, 0);
        if (!isFootprintWithinMapBounds(footprint.width, footprint.height,
          spot.x, spot.y, world.width, world.height)
          || overlapsAnyBuilding(world.buildings, footprint.width, footprint.height,
            spot.x, spot.y)) continue;
        const grid = getCurrentPathGrid();
        if (grid) {
          const col = Math.floor(spot.x / PATH_CELL);
          const row = Math.floor(spot.y / PATH_CELL);
          if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows
            || grid.blocked[row * grid.cols + col]) continue;
        }
        if (fromHomes.length > 0) {
          beginCommuteRoutePass();
          const candidate = createBuilding(type, spot.x, spot.y, -1);
          const reachable = fromHomes.every((home) =>
            isWithinAssignableCommute(
              { ...commuter!, residenceBuildingId: home.id },
              candidate,
              world.buildings,
              SPECIES_CONFIG[EntityType.Human].speed,
            ));
          if (!reachable) continue;
        }
        return createCompletedBuilding(world, type, spot.x, spot.y);
      }
    }
  }
  throw new Error(`Seeded ${type} has no legal, commutable starter placement near ${preferred.x},${preferred.y}`);
}

function placeStarterHousing(world: WorldState, anchor: { x: number; y: number }): void {
  for (let index = 0; index < STARTER_HOUSE_COUNT; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const firstHome = world.buildings.find((site) => site.type === BuildingType.House && site.completed);
    placeLegalStarterBuilding(world, BuildingType.House, {
      x: Math.max(0, anchor.x - 160 + column * 96),
      y: Math.max(0, anchor.y - 96 + row * 128),
    }, firstHome ? [firstHome] : []);
  }
}

/**
 * Buildings own storage: `updateStorageCaps` recomputes `storageMax` and `foodSpoilageRate`, so each
 * scenario builds its storage and fills only up to the cap the owner computes.
 */
function spoilageRateForSilos(silos: number): number {
  return Math.max(0, 0.02 - silos * 0.012);
}

function placeStorage(world: WorldState, anchor: { x: number; y: number }, scenario: ScenarioName): number {
  let silos = 0;
  if (scenario === 'restocked') {
    for (let index = 0; index < STARTER_STORAGE_COUNT; index += 1) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const type = index % 2 === 0 ? BuildingType.Barn : BuildingType.Silo;
      if (type === BuildingType.Silo) silos += 1;
      placeLegalStarterBuilding(world, type, {
        x: Math.max(0, anchor.x - 160 + column * 80),
        y: Math.max(0, anchor.y + 160 + row * 80),
      });
    }
    return silos;
  }

  // Producers plan: 3 Barns + 1 Silo → 2 600 food storage, 1 700 wood storage, spoilage 0.8 %/day.
  for (let index = 0; index < PRODUCERS_SILO_COUNT; index += 1) {
    silos += 1;
    placeLegalStarterBuilding(world, BuildingType.Silo, { x: Math.max(0, anchor.x - 160), y: Math.max(0, anchor.y + 160) });
  }
  for (let index = 0; index < PRODUCERS_BARN_COUNT; index += 1) {
    placeLegalStarterBuilding(world, BuildingType.Barn, {
      x: Math.max(0, anchor.x - 80 + index * 80),
      y: Math.max(0, anchor.y + 160),
    });
  }
  return silos;
}

/**
 * Place food producers ahead of the Lumber Mill so scarce founders staff farms before wood; the
 * buildings are unchanged, only initial worker priority.
 */
function placeProducers(world: WorldState, anchor: { x: number; y: number }): Building[] {
  const producers: Building[] = [];
  for (let index = 0; index < PRODUCERS_FARM_COUNT; index += 1) {
    producers.push(
      placeLegalStarterBuilding(world, BuildingType.Farm, {
        x: Math.max(0, anchor.x - 40 + index * 90),
        y: Math.max(0, anchor.y + 240),
      }, world.buildings.filter((site) => site.type === BuildingType.House && site.completed)),
    );
  }
  for (let index = 0; index < PRODUCERS_LUMBER_MILL_COUNT; index += 1) {
    producers.push(
      placeLegalStarterBuilding(world, BuildingType.LumberMill, {
        x: Math.max(0, anchor.x + 240), y: Math.max(0, anchor.y + 240),
      }),
    );
  }
  return producers;
}

/**
 * Build one seeded colony and provision it exactly as the named scenario says: the settlement skeleton
 * is identical in both scenarios; only producers, storage mix and the initial larder differ.
 */
export function prepareColonyWorld(options: ColonyScenarioOptions): ColonyScenario {
  const { size, seed, scenario } = options;
  const plan = SCENARIOS[scenario];
  const world = initGame({ size, seed });
  setSimSeed(seed);

  const founders = livingHumans(world);
  const anchor = founders[0] ?? { x: world.width / 2, y: world.height / 2 };

  placeStarterHousing(world, anchor);
  placeLegalStarterBuilding(world, BuildingType.Tavern, { x: anchor.x + 180, y: anchor.y - 24 });
  const prison = placeLegalStarterBuilding(world, BuildingType.Prison, { x: anchor.x + 180, y: anchor.y + 88 });
  const silos = placeStorage(world, anchor, scenario);
  const producers = plan.producers ? placeProducers(world, anchor) : [];
  updateStorageCaps(world);

  if (plan.restocksAtCheckpoint) {
    // The historical gate: a full larder up to the cap the storage buildings provide; the checkpoint
    // loop refills it again every 30 days.
    world.resources.food = world.storageMax.food;
    world.resources.wood = Math.min(RESTOCKED_INITIAL_WOOD, world.storageMax.wood);
  } else {
    // No restock after day 0: never start full, or production would be capped into a no-op.
    world.resources.food = Math.floor(world.storageMax.food * PRODUCERS_INITIAL_FOOD_SHARE);
    world.resources.wood = Math.floor(world.storageMax.wood * PRODUCERS_INITIAL_WOOD_SHARE);
  }

  assignMissingResidences(founders, world.buildings, world.entities);

  // No prisoners exist in the starter settlement, so a guard would waste a scarce founder: staff
  // production first and leave prison staffing to later.
  let staffedProducers = 0;
  if (plan.producers) {
    const spareAdults = founders.filter((founder) => !founder.isJuvenile);
    for (let index = 0; index < producers.length && index < spareAdults.length; index += 1) {
      if (assignWorkerTransition(spareAdults[index], producers[index])) staffedProducers += 1;
    }
  }
  syncJobBuildingOccupants(world.entities, world.buildings);

  const housedFounders = founders.filter((founder) => founder.residenceBuildingId != null).length;
  return {
    world,
    startTick: world.tick,
    startYear: world.year,
    restocksAtCheckpoint: plan.restocksAtCheckpoint,
    settlement: {
      scenario,
      restocksAtCheckpoint: plan.restocksAtCheckpoint,
      producers: plan.producers,
      houses: STARTER_HOUSE_COUNT,
      storageBuildings: scenario === 'restocked' ? STARTER_STORAGE_COUNT : PRODUCERS_BARN_COUNT + silos,
      silos,
      foodSpoilageRatePerDay: spoilageRateForSilos(silos),
      farms: plan.producers ? PRODUCERS_FARM_COUNT : 0,
      lumberMills: plan.producers ? PRODUCERS_LUMBER_MILL_COUNT : 0,
      staffedProducers,
      tavern: true,
      prison: prison.completed,
      prisonGuardAssigned: false,
      founders: founders.length,
      housedFounders,
      initialFood: Math.round(world.resources.food),
      initialWood: Math.round(world.resources.wood),
      foodStorageMax: world.storageMax.food,
      woodStorageMax: world.storageMax.wood,
    },
  };
}

// Population / relationship summaries (shared with the performance harness)
// ─────────────────────────────────────────────────────────────────────────────

export function livingHumans(world: WorldState): Entity[] {
  return world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
}

export function countLivingEntitiesByType(world: WorldState): Record<string, number> {
  const counts = Object.fromEntries(
    Object.values(EntityType).map((entityType) => [entityType, 0]),
  ) as Record<string, number>;
  for (const entity of world.entities) {
    if (entity.alive) counts[entity.type] += 1;
  }
  return counts;
}

export function summarizeLivingPopulation(world: WorldState): Record<string, number | Record<string, number>> {
  const byEntityType = countLivingEntitiesByType(world);
  const settlers = byEntityType[EntityType.Human] ?? 0;
  const flora = (byEntityType[EntityType.Grass] ?? 0) + (byEntityType[EntityType.Tree] ?? 0);
  const wildlife = (byEntityType[EntityType.Rabbit] ?? 0)
    + (byEntityType[EntityType.Deer] ?? 0)
    + (byEntityType[EntityType.Wolf] ?? 0)
    + (byEntityType[EntityType.Fox] ?? 0);
  const specialCreatures = (byEntityType[EntityType.Werewolf] ?? 0) + (byEntityType[EntityType.Wildkin] ?? 0);
  return {
    totalLivingEntities: settlers + flora + wildlife + specialCreatures,
    settlers,
    flora,
    wildlife,
    specialCreatures,
    byEntityType,
  };
}

export function countRelationships(world: WorldState): Record<string, number> {
  const humans = livingHumans(world);
  return {
    humans: humans.length,
    marriedPairs: humans.filter((entity) => entity.relationshipStatus === 'married' && entity.partnerId != null && entity.id < entity.partnerId).length,
    courtshipPairs: humans.filter((entity) => entity.courtshipPartnerId != null && entity.id < entity.courtshipPartnerId).length,
    youthLovePairs: humans.filter((entity) => entity.youthLovePartnerId != null && entity.id < entity.youthLovePartnerId).length,
    affairPairs: humans.filter((entity) => entity.affairPartnerId != null && entity.id < entity.affairPartnerId).length,
    pregnant: humans.filter((entity) => entity.pregnant).length,
  };
}

// Exact event totals (counted from new log ids, so the log cap cannot truncate them)
// ─────────────────────────────────────────────────────────────────────────────

export interface ColonyEventTotals {
  births: number;
  conceptions: number;
  deaths: number;
  /** Deaths whose cause line is the famine/exposure one — the reachability probe for starvation. */
  exhaustionDeaths: number;
  marriages: number;
  divorces: number;
  scandalEvents: number;
  rumorScandals: number;
  caughtScandals: number;
  scandalImprisonments: number;
  feudsStarted: number;
  feudsSettled: number;
  affairsEstablished: number;
  affairsCaught: number;
  electionsStarted: number;
  electionsPostponed: number;
  leadershipVacancies: number;
  /** Event-log entries whose message names a village head — the ballot owner's own wording. The
   * founding appointment uses different wording, so it is not counted; see `elections.leaderId`. */
  electionEntries: number;
}

function emptyEventTotals(): ColonyEventTotals {
  return {
    births: 0,
    conceptions: 0,
    deaths: 0,
    exhaustionDeaths: 0,
    marriages: 0,
    divorces: 0,
    scandalEvents: 0,
    rumorScandals: 0,
    caughtScandals: 0,
    scandalImprisonments: 0,
    feudsStarted: 0,
    feudsSettled: 0,
    affairsEstablished: 0,
    affairsCaught: 0,
    electionsStarted: 0,
    electionsPostponed: 0,
    leadershipVacancies: 0,
    electionEntries: 0,
  };
}

/**
 * Counts event-log entries exactly once: `eventLog` is newest-first and bounded at
 * `EVENT_LOG_MAX_ENTRIES`, so the log is walked oldest → newest against a monotonic-id watermark.
 */
export interface EventCounter {
  observe(world: WorldState): ColonyEventTotals;
}

export function createEventCounter(): EventCounter {
  let lastSeenId = Number.NEGATIVE_INFINITY;
  const totals = emptyEventTotals();

  return {
    observe(world: WorldState): ColonyEventTotals {
      for (let index = world.eventLog.length - 1; index >= 0; index -= 1) {
        const event = world.eventLog[index];
        if (event == null || event.id <= lastSeenId) continue;
        lastSeenId = event.id;
        const message = event.message.toLowerCase();
        if (event.type === 'birth') totals.births += 1;
        if (event.type === 'conception') totals.conceptions += 1;
        if (event.type === 'death') {
          totals.deaths += 1;
          if (message.includes('exhaustion')) totals.exhaustionDeaths += 1;
        }
        if (event.type === 'marriage') totals.marriages += 1;
        // The owner types every divorce line 'divorce'; matching the word counted the variants too.
        if (event.type === 'divorce') totals.divorces += 1;
        if (event.type === 'scandal') {
          totals.scandalEvents += 1;
          if (message.includes('whispers spread about')) totals.rumorScandals += 1;
          if (message.includes('caught')) totals.caughtScandals += 1;
          if (message.includes('a feud is brewing')) totals.feudsStarted += 1;
        }
        if (message.includes('imprisoned for scandal')) totals.scandalImprisonments += 1;
        if (message.includes('village head')) totals.electionEntries += 1;
        if (message.includes(AFFAIR_ESTABLISHED_LOG_PHRASE.toLowerCase())) totals.affairsEstablished += 1;
        if (message.includes('was caught with')) totals.affairsCaught += 1;
        if (message.includes('have settled their feud')) totals.feudsSettled += 1;
        if (message.includes('election ceremony began')) totals.electionsStarted += 1;
        if (message.includes('election postponed')) totals.electionsPostponed += 1;
        if (message.includes('can no longer lead')) totals.leadershipVacancies += 1;
      }
      return { ...totals };
    },
  };
}

// Delta size (the worker port's serializer, sampled rather than per tick)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeltaSample {
  jsonBytes: number;
  /** `v8.serialize` bytes — the structured-clone serializer `postMessage` uses for the port. */
  v8Bytes: number;
  /** `v8.serialize` duration in ms; the per-tick serialization cost the worker pays. */
  serializeMs: number;
  /**
   * Short SHA-256 of the delta's JSON, for comparing a seed and checkpoint across reviews. It differs
   * between runs of one seed: the delta embeds `Date.now()` presentation data of constant width.
   */
  jsonHash: string;
}

/**
 * Size one tick's `SimTickDelta`. Serializing is expensive relative to a tick, so harnesses sample this
 * at checkpoint/day granularity, never every tick.
 */
export function sampleDelta(world: WorldState): DeltaSample {
  const delta = simTickDeltaFromWorld(world);
  const json = JSON.stringify(delta);
  const startedAt = performance.now();
  const v8Bytes = serialize(delta).byteLength;
  return {
    jsonBytes: json.length,
    v8Bytes,
    serializeMs: performance.now() - startedAt,
    jsonHash: createHash('sha256').update(json).digest('hex').slice(0, 16),
  };
}

// Console volume
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsoleVolume {
  calls: number;
  lines: number;
  characters: number;
  byLevel: Record<'log' | 'info' | 'warn' | 'error', number>;
  /** Distinct messages first seen, bounded so the report cannot grow with the run. */
  samples: string[];
}

const CONSOLE_SAMPLE_LIMIT = 12;

/**
 * Count what the simulation writes to the console without hiding it: every call still reaches the
 * original method, so a real warning stays visible. Harness output uses `process.stdout.write`.
 */
export function captureConsoleVolume(): { volume(): ConsoleVolume; restore(): void } {
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  } as const;
  const counters = { calls: 0, lines: 0, characters: 0 };
  const byLevel = { log: 0, info: 0, warn: 0, error: 0 };
  const samples: string[] = [];
  const seen = new Set<string>();

  const wrap = (level: keyof typeof originals): void => {
    console[level] = (...args: unknown[]): void => {
      counters.calls += 1;
      byLevel[level] += 1;
      const text = args.map((arg) => (typeof arg === 'string' ? arg : safeInspect(arg))).join(' ');
      counters.lines += text.split('\n').length;
      counters.characters += text.length;
      if (samples.length < CONSOLE_SAMPLE_LIMIT && !seen.has(text)) {
        seen.add(text);
        samples.push(`[${level}] ${text.slice(0, 240)}`);
      }
      originals[level](...args);
    };
  };

  (Object.keys(originals) as (keyof typeof originals)[]).forEach(wrap);

  return {
    volume(): ConsoleVolume {
      return { ...counters, byLevel: { ...byLevel }, samples: [...samples] };
    },
    restore(): void {
      console.log = originals.log;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    },
  };
}

function safeInspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// The eight health domains, projected together
// ─────────────────────────────────────────────────────────────────────────────

export interface ColonyMovementSample {
  id: number;
  workplaceId?: number;
  travelling: number;
  atWork: number;
  atHome: number;
  idle: number;
  walked: number;
  distanceToAccess: number | null;
  closestApproach: number | null;
  firstShiftArrivalTick: number | null;
}

export interface ColonyHealthReport {
  movement: { dayStart: number; secondsPerDayAt1x: number; settlers: ColonyMovementSample[] };
  day: number;
  tick: number;
  year: number;
  food: {
    stored: number;
    storageMax: number;
    spoilageRatePerDay: number;
    producedToday: number;
    consumedToday: number;
    netToday: number;
    ledgerDay: number | null;
    last30Days: { sampledDays: number; produced: number; consumed: number; net: number };
    last7Days: { sampledDays: number; produced: number; consumed: number; net: number };
  };
  /** `healthy` is the housing owner's own verdict (`isHousingDiagnosticsHealthy`): data consistency, not bed supply. */
  housing: HousingDiagnosticsSnapshot & { healthy: boolean };
  workforce: {
    working: number;
    idle: number;
    jobBuildings: number;
    staffedJobBuildings: number;
    unstaffedJobBuildings: number;
    workerSlots: number;
    filledWorkerSlots: number;
    farmBuildings: number;
    staffedFarms: number;
    assignedFarmWorkers: number;
  };
  /**
   * Four distinct lifecycle numbers: conceptions (pregnancy started, from the log), active pregnancies
   * (living settlers now), births (deliveries), deaths (removals).
   */
  lifecycle: {
    conceptionsLogged: number;
    activePregnancies: number;
    birthsLogged: number;
    deathsLogged: number;
  };
  relationships: {
    active: { marriages: number; courtships: number; youthLovePairs: number; affairs: number };
    interval: {
      pregnanciesStarted: number;
      birthsCompleted: number;
      affairChecks: number;
      affairsEstablished: number;
      gossipChecks: number;
      scandalExposures: number;
    };
    transitions: number;
  };
  assignments: {
    employed: number;
    jobChanges: number;
    residenceChanges: number;
    transitions: number;
  };
  stories: {
    pending: number;
    storyFlags: number;
    campaignCompleted: number;
    campaignTotal: number;
    currentChapter: string | null;
  };
  elections: {
    leaderId: number | null;
    leaderName: string | null;
    leaderChanges: number;
    lastElectionYear: number;
    leaderSinceYear: number;
    pendingElectionYear: number | null;
    /** Ballot log entries naming a village head; the founding appointment uses different wording (see the counter). */
    electionLogEntries: number;
    /** The term length that bounds how often a ballot can fall inside a short scenario. */
    electionIntervalYears: number;
    promises: PromiseDetail[];
  };
  animals: {
    tamed: number;
    careStatus: AnimalCareStatus;
    fedToday: boolean;
    wildlifeTotal: number;
    wildlife: Record<string, number>;
  };
  deltas: DeltaSample;
  invariants: {
    violations: number;
    sample: string[];
  };
}

interface TransitionKeys {
  assignments: Map<number, string>;
  relationships: Map<number, string>;
}

function transitionKeys(world: WorldState): TransitionKeys {
  const assignments = new Map<number, string>();
  const relationships = new Map<number, string>();
  for (const human of livingHumans(world)) {
    assignments.set(human.id, `${human.workerBuildingId ?? '-'}|${human.residenceBuildingId ?? '-'}`);
    relationships.set(
      human.id,
      `${human.partnerId ?? '-'}|${human.courtshipPartnerId ?? '-'}|${human.affairPartnerId ?? '-'}|${human.youthLovePartnerId ?? '-'}`,
    );
  }
  return { assignments, relationships };
}

/** Counts changed keys for ids present in both snapshots; arrivals and removals are not transitions. */
function countChanged(previous: Map<number, string>, next: Map<number, string>): number {
  let changed = 0;
  for (const [id, value] of next) {
    const before = previous.get(id);
    if (before != null && before !== value) changed += 1;
  }
  return changed;
}

export interface ColonyObserver {
  sampleMovement(): void;
  /** Snapshot the eight domains for `day`, plus the transitions since the previous call. */
  observe(day: number, deltas: DeltaSample, invariantErrors: readonly string[]): ColonyHealthReport;
  /** Exact cumulative event totals since the observer was created. */
  events(): ColonyEventTotals;
}

/**
 * One observer per run: holds only observations (transition keys, event counter, diagnostics
 * watermark), reads the authoritative world every call, never writes to it.
 */
export function createColonyObserver(world: WorldState): ColonyObserver {
  const counter = createEventCounter();
  let movementDayStart = world.tick - getTickOfDay(world.tick);
  const movement = new Map<number, ColonyMovementSample>();
  const previousPositions = new Map(world.entities.map((entity) => [entity.id, { x: entity.x, y: entity.y }]));
  const sampleMovement = (): void => {
    const sampledTick = Math.max(0, world.tick - 1);
    const dayStart = sampledTick - getTickOfDay(sampledTick);
    if (dayStart !== movementDayStart) {
      movement.clear();
      movementDayStart = dayStart;
    }
    const buildings = new Map(world.buildings.map((building) => [building.id, building]));
    const schedule = getWorkSchedule(world);
    const livingIds = new Set<number>();
    for (const entity of world.entities) {
      if (!entity.alive || !isPlayerHuman(entity)) continue;
      livingIds.add(entity.id);
      const previous = previousPositions.get(entity.id);
      const walked = previous ? Math.hypot(entity.x - previous.x, entity.y - previous.y) : 0;
      previousPositions.set(entity.id, { x: entity.x, y: entity.y });
      let sample = movement.get(entity.id);
      if (!sample) {
        sample = { id: entity.id, travelling: 0, atWork: 0, atHome: 0, idle: 0, walked: 0,
          distanceToAccess: null, closestApproach: null, firstShiftArrivalTick: null };
        movement.set(entity.id, sample);
      }
      if (sample.workplaceId !== entity.workerBuildingId) {
        sample.workplaceId = entity.workerBuildingId;
        sample.closestApproach = null;
        sample.firstShiftArrivalTick = null;
      }
      const workplace = buildings.get(entity.workerBuildingId ?? -1);
      const home = buildings.get(entity.residenceBuildingId ?? -1);
      const atWork = !!workplace?.completed && (entity.indoorBuildingId === workplace.id || isAtBuildingReach(entity, workplace));
      const atHome = !!home && (entity.indoorBuildingId === home.id || isAtBuildingReach(entity, home));
      const access = workplace?.completed ? buildingAccessPoint(workplace) : null;
      sample.distanceToAccess = access ? Math.hypot(access.x - entity.x, access.y - entity.y) : null;
      if (sample.distanceToAccess != null) {
        sample.closestApproach = Math.min(sample.closestApproach ?? Infinity, sample.distanceToAccess);
      }
      sample.walked += walked;
      if (walked > 0) sample.travelling++;
      else if (atWork) sample.atWork++;
      else if (atHome) sample.atHome++;
      else sample.idle++;
      if (atWork && sample.firstShiftArrivalTick == null && isWorkScheduleHour(schedule, getHourOfDay(world.tick))) {
        sample.firstShiftArrivalTick = getTickOfDay(world.tick);
      }
    }
    for (const id of previousPositions.keys()) {
      if (!livingIds.has(id)) previousPositions.delete(id);
    }
  };
  let previousKeys: TransitionKeys | null = null;
  let previousDiagnostics = 0;
  let previousLeaderId = world.villageLeaderId;
  let leaderChanges = 0;
  let relationshipTransitions = 0;
  let jobChanges = 0;
  let residenceChanges = 0;

  const observe = (day: number, deltas: DeltaSample, invariantErrors: readonly string[]): ColonyHealthReport => {
    const keys = transitionKeys(world);
    if (previousKeys) {
      for (const [id, value] of keys.assignments) {
        const before = previousKeys.assignments.get(id);
        if (before == null || before === value) continue;
        const [beforeWorkplace, beforeResidence] = before.split('|');
        const [afterWorkplace, afterResidence] = value.split('|');
        if (beforeWorkplace !== afterWorkplace) jobChanges += 1;
        if (beforeResidence !== afterResidence) residenceChanges += 1;
      }
      relationshipTransitions += countChanged(previousKeys.relationships, keys.relationships);
    }
    previousKeys = keys;
    if (world.villageLeaderId !== previousLeaderId) {
      leaderChanges += 1;
      previousLeaderId = world.villageLeaderId;
    }

    const events = counter.observe(world);
    const history = getRelationshipDiagnosticsHistory();
    const interval: RelationshipDiagnosticsSnapshot[] = [];
    for (let index = previousDiagnostics; index < history.length; index += 1) {
      const snapshot = history[index];
      if (snapshot) interval.push(snapshot);
    }
    previousDiagnostics = history.length;
    const sum = (key: 'pregnanciesStartedThisInterval' | 'birthsCompletedThisInterval' | 'affairChecks' | 'affairsEstablished' | 'gossipChecks' | 'scandalExposures'): number =>
      interval.reduce((total, snapshot) => total + snapshot[key], 0);

    const latest = getLatestRelationshipDiagnostics();
    const housing = collectHousingDiagnostics(world, day);
    const relationshipCounts = countRelationships(world);
    const players = livingHumans(world);
    const workforceCounts = countWorkingAndIdleSettlers(world.entities, world.buildings);
    const jobBuildings = world.buildings.filter(
      (building) => building.completed && building.faction !== 'rival' && BUILDING_JOB_TYPES[building.type] != null,
    );
    const staffable = jobBuildings.filter((building) => BUILDING_CONFIGS[building.type].maxOccupants > 0);
    const assignedByBuilding = new Map<number, number>();
    for (const human of players) {
      if (human.workerBuildingId == null) continue;
      assignedByBuilding.set(human.workerBuildingId, (assignedByBuilding.get(human.workerBuildingId) ?? 0) + 1);
    }
    const staffedJobBuildings = staffable.filter((building) => (assignedByBuilding.get(building.id) ?? 0) > 0).length;
    const ledger = world.economyLedger;
    const recentFoodFlow = getRecentFoodFlow(world, 30);
    const weeklyFoodFlow = getRecentFoodFlow(world, 7);
    const farms = staffable.filter((building) => building.type === BuildingType.Farm);
    const campaign = getGuidedCampaignProgress(world);
    const promiseStatus = getActiveElectionPromises(world);
    const leader = world.villageLeaderId == null
      ? null
      : world.entities.find((entity) => entity.id === world.villageLeaderId) ?? null;
    const wildlife: Record<string, number> = Object.fromEntries(Object.entries(world.wildlifeCounts));
    const wildlifeTotal = Object.values(wildlife).reduce((total, value) => total + value, 0);

    return {
      movement: { dayStart: movementDayStart, secondsPerDayAt1x: TICKS_PER_DAY / BASE_TICKS_PER_SECOND,
        settlers: [...movement.values()].map((sample) => ({ ...sample })) },
      day,
      tick: world.tick,
      year: world.year,
      food: {
        stored: Math.round(world.resources.food ?? 0),
        storageMax: world.storageMax.food,
        spoilageRatePerDay: world.foodSpoilageRate,
        producedToday: ledger?.producedTotal ?? 0,
        consumedToday: ledger?.consumedTotal ?? 0,
        netToday: (ledger?.producedTotal ?? 0) - (ledger?.consumedTotal ?? 0),
        ledgerDay: ledger?.day ?? null,
        last30Days: {
          sampledDays: recentFoodFlow?.days ?? 0,
          produced: (recentFoodFlow?.producedPerDay ?? 0) * (recentFoodFlow?.days ?? 0),
          consumed: (recentFoodFlow?.consumedPerDay ?? 0) * (recentFoodFlow?.days ?? 0),
          net: (recentFoodFlow?.netPerDay ?? 0) * (recentFoodFlow?.days ?? 0),
        },
        last7Days: {
          sampledDays: weeklyFoodFlow?.days ?? 0,
          produced: (weeklyFoodFlow?.producedPerDay ?? 0) * (weeklyFoodFlow?.days ?? 0),
          consumed: (weeklyFoodFlow?.consumedPerDay ?? 0) * (weeklyFoodFlow?.days ?? 0),
          net: (weeklyFoodFlow?.netPerDay ?? 0) * (weeklyFoodFlow?.days ?? 0),
        },
      },
      housing: { ...housing, healthy: isHousingDiagnosticsHealthy(housing) },
      workforce: {
        working: workforceCounts.working,
        idle: workforceCounts.idle,
        jobBuildings: jobBuildings.length,
        staffedJobBuildings,
        unstaffedJobBuildings: staffable.length - staffedJobBuildings,
        workerSlots: staffable.reduce((total, building) => total + BUILDING_CONFIGS[building.type].maxOccupants, 0),
        filledWorkerSlots: [...assignedByBuilding.entries()]
          .filter(([buildingId]) => jobBuildings.some((building) => building.id === buildingId))
          .reduce((total, [, count]) => total + count, 0),
        farmBuildings: farms.length,
        staffedFarms: farms.filter((farm) => (assignedByBuilding.get(farm.id) ?? 0) > 0).length,
        assignedFarmWorkers: farms.reduce((total, farm) => total + (assignedByBuilding.get(farm.id) ?? 0), 0),
      },
      lifecycle: {
        conceptionsLogged: events.conceptions,
        activePregnancies: latest?.activePregnancies ?? relationshipCounts.pregnant,
        birthsLogged: events.births,
        deathsLogged: events.deaths,
      },
      relationships: {
        active: {
          marriages: latest?.activeMarriages ?? relationshipCounts.marriedPairs,
          courtships: latest?.activeCourtships ?? relationshipCounts.courtshipPairs,
          youthLovePairs: latest?.activeYouthLovePairs ?? relationshipCounts.youthLovePairs,
          affairs: latest?.activeAffairs ?? relationshipCounts.affairPairs,
        },
        interval: {
          pregnanciesStarted: sum('pregnanciesStartedThisInterval'),
          birthsCompleted: sum('birthsCompletedThisInterval'),
          affairChecks: sum('affairChecks'),
          affairsEstablished: sum('affairsEstablished'),
          gossipChecks: sum('gossipChecks'),
          scandalExposures: sum('scandalExposures'),
        },
        transitions: relationshipTransitions,
      },
      assignments: {
        employed: workforceCounts.working,
        jobChanges,
        residenceChanges,
        transitions: jobChanges + residenceChanges,
      },
      stories: {
        pending: world.pendingStoryEvents?.length ?? 0,
        storyFlags: Object.keys(world.storyFlags ?? {}).length,
        campaignCompleted: campaign.completed,
        campaignTotal: campaign.total,
        currentChapter: campaign.current?.id ?? null,
      },
      elections: {
        leaderId: world.villageLeaderId,
        leaderName: leader ? formatCitizenName(leader) : null,
        leaderChanges,
        lastElectionYear: world.lastElectionYear,
        leaderSinceYear: world.leaderSinceYear,
        pendingElectionYear: world.pendingElectionYear,
        electionLogEntries: events.electionEntries,
        electionIntervalYears: ELECTION_INTERVAL_YEARS,
        promises: promiseStatus?.promises ?? [],
      },
      animals: {
        tamed: countTamedAnimals(world),
        careStatus: getAnimalCareStatus(world),
        fedToday: tamedAnimalsFedToday(world),
        wildlifeTotal,
        wildlife,
      },
      deltas,
      invariants: {
        violations: invariantErrors.length,
        sample: invariantErrors.slice(0, 5),
      },
    };
  };

  return {
    sampleMovement,
    observe,
    events(): ColonyEventTotals {
      return counter.observe(world);
    },
  };
}

/** The invariant collector this project already owns; counted here so violations are never merged with perf counters. */
export function collectInvariantErrors(world: WorldState): string[] {
  return collectSimulationInvariantErrors(world);
}

// Non-vacuity: a world with no invariant left to break can still be a dead colony
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a settled colony is not growing, one cause per verdict — only states the growth path failed to
 * correct, read from numbers the observer records (a preset like spare adults is not a stall).
 */
export type ColonyStallReason =
  | 'housing-full'
  | 'food-exhausted'
  | 'wood-pinned';

/** Runs long enough that a demand the colony never meets stops being a settling-in period. */
export const STALL_SETTLING_DAYS = 30;
/** Below this share of its own storage cap a resource is pinned at nothing, not merely low. */
const RESOURCE_PINNED_SHARE = 0.02;

export interface ColonyStallVerdict {
  stalled: boolean;
  reasons: ColonyStallReason[];
  /** One line per reason, carrying the numbers the verdict rests on. */
  evidence: string[];
}

export function assertColonyNotStalled(verdict: ColonyStallVerdict, label: string): void {
  if (!verdict.stalled) return;
  throw new Error(`${label} is stalled (${verdict.reasons.join(', ')}): ${verdict.evidence.join('; ')}`);
}

/**
 * What the non-vacuity rules may read: recorded health snapshots plus the world's own counters, so a
 * caller cannot soften a verdict by describing the run differently.
 */
export interface ColonyStallInput {
  world: WorldState;
  /** Every checkpoint, oldest first, plus the final observation. */
  snapshots: readonly ColonyHealthReport[];
  final: ColonyHealthReport;
  /** Buildings standing at the end that were not standing at day zero. */
  newBuildingsAtEnd: number;
}

export function assessColonyStall(input: ColonyStallInput): ColonyStallVerdict {
  const { world, snapshots, final, newBuildingsAtEnd } = input;
  const reasons: ColonyStallReason[] = [];
  const evidence: string[] = [];

  // A run shorter than the settling period is a settling-in period, not a verdict.
  if (final.day < STALL_SETTLING_DAYS) return { stalled: false, reasons, evidence };

  const observations = snapshots.length;
  const housing = final.housing;
  const woodPin = world.storageMax.wood * RESOURCE_PINNED_SHARE;
  const stonePin = world.storageMax.stone * RESOURCE_PINNED_SHARE;

  if (housing.homelessPlayerHumans > 0 && housing.occupiedBeds >= housing.totalBeds && newBuildingsAtEnd === 0) {
    reasons.push('housing-full');
    evidence.push(
      `housing-full: ${housing.homelessPlayerHumans} homeless with every one of ${housing.totalBeds} beds taken `
        + `and 0 buildings raised in ${final.day} days`,
    );
  }

  if (final.food.stored <= 0 && final.food.producedToday < final.food.consumedToday) {
    reasons.push('food-exhausted');
    evidence.push(
      `food-exhausted: larder at ${final.food.stored} while the day consumed ${final.food.consumedToday} `
        + `against ${final.food.producedToday} produced`,
    );
  }

  // Sized against the colony's own caps: a woodpile that never rose above the pinned share while
  // nothing was ever built is a colony that cannot pay for its next building.
  const wood = world.resources.wood ?? 0;
  const stone = world.resources.stone ?? 0;
  if (newBuildingsAtEnd === 0 && wood <= woodPin && stone <= stonePin) {
    reasons.push('wood-pinned');
    evidence.push(
      `wood-pinned: wood ${Math.round(wood)}/${world.storageMax.wood} and stone `
        + `${Math.round(stone)}/${world.storageMax.stone} at day ${final.day} with 0 buildings raised`,
    );
  }

  if (reasons.length > 0) {
    evidence.push(`judged on the final day (${observations} earlier observations recorded the same run)`);
  }

  return { stalled: reasons.length > 0, reasons, evidence };
}

/** Human-readable outcome for the run log and the summary line. */
export function formatColonyStallVerdict(verdict: ColonyStallVerdict): string {
  return verdict.reasons.length > 0 ? `stalled(${verdict.reasons.join(',')})` : 'healthy';
}


