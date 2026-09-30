/**
 * Shared seeded-scenario and colony-health observation for the two long-run harnesses:
 *
 *  - `scripts/run-full-year.mts` — roadmap **P1** "Seeded Colony Health Scenario" (100-day seeded
 *    run through the existing invariant gate, one scenario with producers and no restock).
 *  - `scripts/perf-seeded-year.mts` — roadmap **P2** "Seeded One-Year Performance Run" (Huge-map
 *    metric set: tick p50/p95/max, path calls, delta size, memory trend, fallback count, console
 *    volume).
 *
 * Why this module exists (roadmap O4, measured coverage gap): `run-full-year.mts` gave its
 * settlement no producers and refilled food and wood to `storageMax` at every checkpoint, so
 * production, spoilage and consumption economics sat outside the gate. The scenario plans and the
 * health projection therefore live here **once**, so the restocked run and the producers run cannot
 * drift apart, every report says plainly which one restocks, and the P2 run measures the same
 * settlement shape. Without this, each harness would carry its own copy of the settlement.
 *
 * Observes only: nothing here changes a simulation rule. Every write is setup the game performs
 * itself when a player raises those buildings (`createBuilding` + `updateStorageCaps`) or assigns a
 * worker (`assignWorkerTransition`), or is the harness's own initial provisioning, which is why
 * `SCENARIOS` names it explicitly.
 */
import { createHash } from 'node:crypto';
import { serialize as v8Serialize } from 'node:v8';
import { initGame } from '../src/game/gameEngine';
import { createBuilding } from '../src/game/worldGen';
import { assignMissingResidences } from '../src/game/dayCycle';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES, BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { updateStorageCaps } from '../src/game/economy';
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

/**
 * One in-game tick's real-time budget at 1× speed, taken from the loop's own pacing constant rather
 * than copied (`tests/gameLoop.test.ts` exists because a copy of that rate drifted).
 * A tick slower than this cannot hold the baseline pace, which is what the harness counts as a
 * stalled tick.
 */
export const PACING_TICK_BUDGET_MS = 1000 / BASE_TICKS_PER_SECOND;

/** Delta serialization slower than this counts as a spike (named so the report can cite a value). */
export const SERIALIZATION_SPIKE_MS = 50;

/** Worker stall watchdog window for the harness's own transport sample, mirroring `gameLoop`. */
export const WORKER_STALL_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
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
const PRODUCERS_BARN_COUNT = 3;
const PRODUCERS_SILO_COUNT = 1;
/** Share of the computed storage cap the producers scenario starts with, so production must carry it. */
const PRODUCERS_INITIAL_FOOD_SHARE = 0.25;
const PRODUCERS_INITIAL_WOOD_SHARE = 0.5;
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

function placeStarterHousing(world: WorldState, anchor: { x: number; y: number }): void {
  for (let index = 0; index < STARTER_HOUSE_COUNT; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    createCompletedBuilding(
      world,
      BuildingType.House,
      Math.max(0, anchor.x - 160 + column * 96),
      Math.max(0, anchor.y - 96 + row * 128),
    );
  }
}

/**
 * Storage is owned by the buildings (`updateStorageCaps` recomputes `storageMax` and
 * `foodSpoilageRate` from completed Barns/Silos/Storehouses/Stores), so the harness can no longer
 * declare a larder the buildings do not provide. Both scenarios therefore *build* their storage and
 * then fill only up to the cap the owner computes.
 *
 * The producers scenario deliberately carries **one** Silo: `foodSpoilageRate` is
 * `0.02 − silos × 0.012`, so one Silo leaves 0.8 %/day of spoilage in the gate while the restocked
 * gate's four Silos zero it out. That difference is why the two plans are named here rather than
 * shared.
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
      createCompletedBuilding(
        world,
        type,
        Math.max(0, anchor.x - 160 + column * 80),
        Math.max(0, anchor.y + 160 + row * 80),
      );
    }
    return silos;
  }

  // Producers plan: 3 Barns + 1 Silo → 2 600 food storage, 1 700 wood storage, spoilage 0.8 %/day.
  for (let index = 0; index < PRODUCERS_SILO_COUNT; index += 1) {
    silos += 1;
    createCompletedBuilding(world, BuildingType.Silo, Math.max(0, anchor.x - 160), Math.max(0, anchor.y + 160));
  }
  for (let index = 0; index < PRODUCERS_BARN_COUNT; index += 1) {
    createCompletedBuilding(
      world,
      BuildingType.Barn,
      Math.max(0, anchor.x - 80 + index * 80),
      Math.max(0, anchor.y + 160),
    );
  }
  return silos;
}

/**
 * Producers in staffing order: the Lumber Mill first, then the Farms.
 *
 * The order is part of the seeded scenario, not cosmetics: `prepareColonyWorld` staffs the first
 * producer with the settlement's second adult (the first one becomes the Prison Guard), and which
 * workplace that settler walks to changes the world's own RNG stream from tick 1. The Lumber Mill is
 * first so the Farm slots are left to the auto-assign layer as the colony grows — the shape the
 * 100-day run was calibrated on and the one whose reported lifecycle numbers (conceptions, births,
 * pregnancies, deaths) are non-zero.
 */
function placeProducers(world: WorldState, anchor: { x: number; y: number }): Building[] {
  const producers: Building[] = [];
  for (let index = 0; index < PRODUCERS_LUMBER_MILL_COUNT; index += 1) {
    producers.push(
      createCompletedBuilding(world, BuildingType.LumberMill, Math.max(0, anchor.x + 240), Math.max(0, anchor.y + 240)),
    );
  }
  for (let index = 0; index < PRODUCERS_FARM_COUNT; index += 1) {
    producers.push(
      createCompletedBuilding(world, BuildingType.Farm, Math.max(0, anchor.x - 40 + index * 90), Math.max(0, anchor.y + 240)),
    );
  }
  return producers;
}

/**
 * Build one seeded colony and provision it exactly as the named scenario says. The settlement
 * skeleton (housing, tavern, prison, a staffed Prison Guard) is identical in both scenarios; only
 * the producers, the storage mix and the initial larder differ.
 */
export function prepareColonyWorld(options: ColonyScenarioOptions): ColonyScenario {
  const { size, seed, scenario } = options;
  const plan = SCENARIOS[scenario];
  const world = initGame({ size, seed });
  setSimSeed(seed);

  const founders = livingHumans(world);
  const anchor = founders[0] ?? { x: world.width / 2, y: world.height / 2 };

  placeStarterHousing(world, anchor);
  createCompletedBuilding(world, BuildingType.Tavern, anchor.x + 180, anchor.y - 24);
  const prison = createCompletedBuilding(world, BuildingType.Prison, anchor.x + 180, anchor.y + 88);
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

  const prisonGuard = founders.find((founder) => founder.age >= 18);
  assert(prisonGuard != null, 'starter settlement requires an adult founder to staff the prison');
  assert(assignWorkerTransition(prisonGuard, prison), 'could not assign the starter Prison Guard');

  // Producers are staffed from day 1 by the founders the game actually provides, so production does
  // not wait for the auto-assign layer to see a free settler.
  let staffedProducers = 0;
  if (plan.producers) {
    const spareAdults = founders.filter((founder) => !founder.isJuvenile && founder.id !== prisonGuard.id);
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
      prisonGuardAssigned: prisonGuard.homeBuildingId === prison.id,
      founders: founders.length,
      housedFounders,
      initialFood: Math.round(world.resources.food),
      initialWood: Math.round(world.resources.wood),
      foodStorageMax: world.storageMax.food,
      woodStorageMax: world.storageMax.wood,
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Population / relationship summaries (moved here from run-full-year.mts so P2 shares them)
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

// ─────────────────────────────────────────────────────────────────────────────
// Exact event totals (counted from new log ids, so the 2 000-entry log cap cannot truncate them)
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
   * founding appointment logs "leads the founding colony until the first merit election", so it is
   * deliberately *not* counted here; the founding head is visible in `elections.leaderId`. */
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
 * Counts event-log entries exactly once as the run proceeds. `eventLog` is newest-first and bounded
 * at `EVENT_LOG_MAX_ENTRIES`, so a year-long run cannot total it after the fact; ids are monotonic
 * per log, which makes "everything newer than the last id I saw" the exact increment.
 *
 * The log is walked **oldest → newest** (i.e. backwards) on purpose: the watermark advances as
 * entries are counted, so walking newest-first would count the newest entry and then skip every
 * older-but-still-new one. That defect was live in the first version of this counter and reported
 * 0 conceptions / 0 births for a run that had both.
 *
 * Every matcher here is the wording its owner writes, never a guess: `rumorScandals` counted
 * `'rumor'` while the affair owner writes "Whispers spread about …", so it read 0 for a year that
 * had 145 of them, and `divorces` counted any message containing "divorc" across all three divorce
 * lines. Both are why this counter is the place a reachability question gets answered.
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

// ─────────────────────────────────────────────────────────────────────────────
// Delta size (the worker port's serializer, sampled rather than per tick)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeltaSample {
  jsonBytes: number;
  /** `v8.serialize` bytes — the structured-clone serializer `postMessage` uses for the port. */
  v8Bytes: number;
  /** `v8.serialize` duration in ms; the per-tick serialization cost the worker pays. */
  serializeMs: number;
  /**
   * Short SHA-256 of the delta's JSON — the delta fingerprint a review can compare by seed and
   * checkpoint.
   *
   * It is expected to **differ between two runs of the same seed** even though every health number in
   * this report agrees: the delta embeds wall-clock presentation data (`huntVisuals[].startedAtMs`
   * comes from `Date.now()`), which JSON.stringify hides from the byte count because a 13-digit
   * timestamp has a constant width. Measured 2026-09-20 on the 100-day producers scenario: the JSON
   * length was identical at days 30/60/90/100 (564 312 / 695 099 / 821 002 / 864 085) while these
   * hashes differed at every checkpoint, and `v8Bytes` differed at two of them.
   */
  jsonHash: string;
}

/**
 * Size one tick's `SimTickDelta`. Serializing costs ~10–25 ms for the ~1 MB Huge-map delta, so the
 * harnesses sample this at checkpoint/day granularity instead of every tick — a per-tick sample
 * would dominate the very tick time being measured (measured 2026-09-20: 16 ms/tick JSON on Huge
 * against a ~2 ms median tick).
 */
export function sampleDelta(world: WorldState): DeltaSample {
  const delta = simTickDeltaFromWorld(world);
  const json = JSON.stringify(delta);
  const startedAt = performance.now();
  const v8Bytes = v8Serialize(delta).byteLength;
  return {
    jsonBytes: json.length,
    v8Bytes,
    serializeMs: performance.now() - startedAt,
    jsonHash: createHash('sha256').update(json).digest('hex').slice(0, 16),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
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
 * Count what the simulation writes to the console without hiding it: every call is forwarded to the
 * original method, so a real warning is still visible, and the volume is reported as data. The
 * harness's own report lines use `process.stdout.write`, so they are never counted.
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

// ─────────────────────────────────────────────────────────────────────────────
// The eight health domains, projected together
// ─────────────────────────────────────────────────────────────────────────────

export interface ColonyHealthReport {
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
  };
  /**
   * The four lifecycle numbers the roadmap requires to stay distinct: a conception is a pregnancy
   * that started (event log), an active pregnancy is a living pregnant settler right now, a birth is
   * a delivery, a death is a removal.
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
    assignments.set(human.id, `${human.homeBuildingId ?? '-'}|${human.residenceBuildingId ?? '-'}`);
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
  /** Snapshot the eight domains for `day`, plus the transitions since the previous call. */
  observe(day: number, deltas: DeltaSample, invariantErrors: readonly string[]): ColonyHealthReport;
  /** Exact cumulative event totals since the observer was created. */
  events(): ColonyEventTotals;
}

/**
 * One observer per run. It holds only observations (previous transition keys, the exact event
 * counter, the diagnostics history watermark) and reads the authoritative world every time; it
 * never writes to it.
 */
export function createColonyObserver(world: WorldState): ColonyObserver {
  const counter = createEventCounter();
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
      if (human.homeBuildingId == null) continue;
      assignedByBuilding.set(human.homeBuildingId, (assignedByBuilding.get(human.homeBuildingId) ?? 0) + 1);
    }
    const staffedJobBuildings = staffable.filter((building) => (assignedByBuilding.get(building.id) ?? 0) > 0).length;
    const ledger = world.economyLedger;
    const campaign = getGuidedCampaignProgress(world);
    const promiseStatus = getActiveElectionPromises(world);
    const leader = world.villageLeaderId == null
      ? null
      : world.entities.find((entity) => entity.id === world.villageLeaderId) ?? null;
    const wildlife: Record<string, number> = Object.fromEntries(Object.entries(world.wildlifeCounts));
    const wildlifeTotal = Object.values(wildlife).reduce((total, value) => total + value, 0);

    return {
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


