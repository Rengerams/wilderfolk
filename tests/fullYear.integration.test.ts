/**
 * Full in-game year integration test.
 *
 * Runs one real calendar year through `gameTick` with a fixed seed and verifies:
 *  - no Simulation Authority invariant violations at 90-day checkpoints
 *  - the calendar advances exactly one year
 *  - the colony is not extinct
 *  - resources, positions, and energies remain finite and non-negative
 *  - workplace/residence/prison references point at existing buildings
 *  - building occupants reference living entities
 *  - story/event infrastructure remains valid
 *  - the year produced real social activity, not a quiet no-op
 *
 * The scenario gives the founders one home and a raised larder so the year is not spent starving,
 * but that provisioning does not survive: `updateStorageCaps` recomputes the cap and the spoilage
 * rate from the completed buildings, and the larder empties before day 360. Food economics are
 * therefore outside this test on purpose — the long-run harness carries the food and stall gate.
 *
 * The test intentionally prints a compact report at days 90, 180, 270, and
 * 360. This makes long-run behavior inspectable without flooding the output
 * with one line per tick.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame, gameTick } from '../src/game/gameEngine';
import { createBuilding } from '../src/game/worldGen';
import { assignMissingResidences } from '../src/game/dayCycle';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import {
  getLatestRelationshipDiagnostics,
  getRelationshipDiagnosticsHistory,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { isResidenceOccupantEntity } from '../src/game/residencyOccupancy';

const SEED = 12345;
const FULL_YEAR_TICKS = DAYS_PER_YEAR * TICKS_PER_DAY;
const STARTER_HOUSE_OFFSET = 24;
const POPULATION_SANITY_LIMIT = 5_000;
const TEST_TIMEOUT_MS = 300_000;
/** The larder this scenario starts with; raised so food never gates a social event. */
const SCAFFOLD_FOOD = 100_000;
const DEBUG = process.env.WILDERFOLK_DEBUG !== '0';
const VERBOSE = process.env.WILDERFOLK_VERBOSE === '1';
const DEBUG_PROGRESS_DAYS = 30;
const DEBUG_HISTORY_LIMIT = 80;
const WATCH_ENTITY_IDS = new Set(
  (process.env.WILDERFOLK_WATCH_IDS ?? '1096,1658,1720,2005')
    .split(',').map(Number).filter(Number.isSafeInteger),
);
const CHECKPOINT_DAYS = Array.from(
  { length: Math.ceil(DAYS_PER_YEAR / 90) },
  (_, index) => Math.min((index + 1) * 90, DAYS_PER_YEAR),
);

function writeFullYearDebug(label: string, detail: unknown): void {
  console.info(`[FullYear ${label}] ${JSON.stringify(detail)}`);
}

function fullYearEntitySnapshot(entity: Entity): Record<string, unknown> {
  return {
    id: entity.id, name: entity.name, surname: entity.surname, type: entity.type,
    alive: entity.alive, faction: entity.faction ?? null, age: entity.age,
    birthYear: entity.birthYear, birthDay: entity.birthDay, juvenile: entity.isJuvenile,
    energy: entity.energy, x: entity.x, y: entity.y,
    residenceBuildingId: entity.residenceBuildingId ?? null,
    workerBuildingId: entity.workerBuildingId ?? null,
    prisonBuildingId: entity.prisonBuildingId ?? null,
    partnerId: entity.partnerId ?? null, occupation: entity.occupation,
  };
}

function fullYearResidentRecords(world: WorldState): Map<number, {
  entity: Entity;
  snapshot: Record<string, unknown>;
}> {
  return new Map(world.entities.filter(isResidenceOccupantEntity).map((entity) => [
    entity.id, { entity, snapshot: fullYearEntitySnapshot(entity) },
  ]));
}

interface FullYearDebugState {
  previous: ReturnType<typeof fullYearResidentRecords>;
  history: Array<Record<string, unknown>>;
  deaths: number;
  removalsUnconfirmed: number;
  moves: number;
  firstFailureTick?: number;
}

function printFullYearFailure(
  world: WorldState, debug: FullYearDebugState, errors: string[], seed: number,
): void {
  const ids = new Set(WATCH_ENTITY_IDS);
  for (const error of errors) {
    for (const match of error.matchAll(/human (\d+)/g)) ids.add(Number(match[1]));
  }
  writeFullYearDebug('failure', {
    seed, tick: world.tick, day: world.tick / TICKS_PER_DAY,
    firstFailureTick: debug.firstFailureTick, errors,
    food: world.resources.food, deathsThisYear: world.deathsThisYear,
    observedDeaths: debug.deaths, unconfirmedRemovals: debug.removalsUnconfirmed,
    settlers: [...ids].map((id) => {
      const entity = world.entities.find((person) => person.id === id);
      return { id, present: !!entity, current: entity ? fullYearEntitySnapshot(entity) : null,
        previous: debug.previous.get(id)?.snapshot ?? null,
        graves: (world.graveRecords ?? []).filter((grave) => grave.deceasedId === id) };
    }),
    buildings: world.buildings.map((building) => ({
      id: building.id, type: building.type, faction: building.faction ?? null,
      completed: building.completed, health: building.health,
      occupants: [...building.occupants],
      assignedResidents: world.entities.filter((entity) => isResidenceOccupantEntity(entity)
        && entity.residenceBuildingId === building.id).map((entity) => entity.id),
    })),
    recentChanges: debug.history,
    recentEvents: world.eventLog.slice(0, 30),
    recentCombatAndDeaths: world.eventLog.filter((event) => event.type === 'combat'
      || event.type === 'death' || event.type === 'disaster').slice(0, 30),
    raids: world.pendingRaidEvents, outgoingRaids: world.pendingOutgoingRaidEvents,
  });
}

function traceFullYearTick(world: WorldState, debug: FullYearDebugState, seed: number): void {
  const current = fullYearResidentRecords(world);
  for (const [id, previous] of debug.previous) {
    const next = current.get(id);
    const changed = !next || next.snapshot.residenceBuildingId !== previous.snapshot.residenceBuildingId
      || next.snapshot.type !== previous.snapshot.type;
    if (!changed) continue;
    const died = !previous.entity.alive
      || (world.graveRecords ?? []).some((grave) => grave.deceasedId === id);
    const status = next ? 'residence-or-form-change' : died ? 'confirmed-death' : 'removed-or-ineligible';
    if (!next && died) debug.deaths++;
    else if (!next) debug.removalsUnconfirmed++;
    else if (next.snapshot.residenceBuildingId !== previous.snapshot.residenceBuildingId) debug.moves++;
    const change = { tick: world.tick, day: world.tick / TICKS_PER_DAY, id, status,
      before: previous.snapshot, after: next?.snapshot ?? fullYearEntitySnapshot(previous.entity) };
    debug.history.push(change);
    if (VERBOSE || WATCH_ENTITY_IDS.has(id)) writeFullYearDebug('settler-change', change);
  }
  if (debug.history.length > DEBUG_HISTORY_LIMIT) {
    debug.history.splice(0, debug.history.length - DEBUG_HISTORY_LIMIT);
  }
  if (debug.firstFailureTick === undefined) {
    const errors = collectSimulationInvariantErrors(world);
    if (errors.length > 0) {
      debug.firstFailureTick = world.tick;
      printFullYearFailure(world, debug, errors, seed);
    }
  }
  debug.previous = current;
}

function expectFiniteNumber(value: number, label: string): void {
  expect(Number.isFinite(value), `${label} must be finite`).toBe(true);
}

function expectNonNegative(value: number, label: string): void {
  expect(Number.isFinite(value), `${label} must be finite`).toBe(true);
  expect(value, `${label} must be >= 0`).toBeGreaterThanOrEqual(0);
}

function expectEntitySanity(entity: Entity, buildingIds: Set<number>): void {
  expectFiniteNumber(entity.x, `entity ${entity.id} x`);
  expectFiniteNumber(entity.y, `entity ${entity.id} y`);
  expectFiniteNumber(entity.energy, `entity ${entity.id} energy`);
  if (entity.workerBuildingId != null) {
    expect(buildingIds.has(entity.workerBuildingId), `entity ${entity.id} workerBuildingId`).toBe(true);
  }
  if (entity.residenceBuildingId != null) {
    expect(buildingIds.has(entity.residenceBuildingId), `entity ${entity.id} residenceBuildingId`).toBe(true);
  }
  if (entity.prisonBuildingId != null) {
    expect(buildingIds.has(entity.prisonBuildingId), `entity ${entity.id} prisonBuildingId`).toBe(true);
  }
}

function expectBuildingSanity(
  building: Building,
  entityIds: Set<number>,
): void {
  expectFiniteNumber(building.x, `building ${building.id} x`);
  expectFiniteNumber(building.y, `building ${building.id} y`);
  expectFiniteNumber(building.health, `building ${building.id} health`);
  expectFiniteNumber(building.constructionProgress, `building ${building.id} constructionProgress`);
  for (const occupantId of building.occupants) {
    expect(entityIds.has(occupantId), `building ${building.id} occupant ${occupantId}`).toBe(true);
  }
}

function summarizeRelationships(world: WorldState): {
  humans: number;
  marriedPairs: number;
  courtshipPairs: number;
  youthLovePairs: number;
  affairPairs: number;
  pregnant: number;
} {
  const humans = world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
  return {
    humans: humans.length,
    marriedPairs: humans.filter(
      (entity) => entity.relationshipStatus === 'married' && entity.partnerId != null && entity.id < entity.partnerId,
    ).length,
    courtshipPairs: humans.filter(
      (entity) => entity.courtshipPartnerId != null && entity.id < entity.courtshipPartnerId,
    ).length,
    youthLovePairs: humans.filter(
      (entity) => entity.youthLovePartnerId != null && entity.id < entity.youthLovePartnerId,
    ).length,
    affairPairs: humans.filter(
      (entity) => entity.affairPartnerId != null && entity.id < entity.affairPartnerId,
    ).length,
    pregnant: humans.filter((entity) => entity.pregnant).length,
  };
}

function printCheckpoint(
  day: number,
  world: WorldState,
  periodSnapshots: readonly ReturnType<typeof getLatestRelationshipDiagnostics>[],
  totalSnapshots: readonly ReturnType<typeof getLatestRelationshipDiagnostics>[],
): void {
  if (!DEBUG) return;
  const relationships = summarizeRelationships(world);
  const intervalSnapshots = periodSnapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null);
  const allSnapshots = totalSnapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null);
  const sum = (snapshots: typeof intervalSnapshots, key: 'conceptionCandidates' | 'pregnanciesStartedThisInterval' | 'birthsCompletedThisInterval') =>
    snapshots.reduce((total, snapshot) => total + snapshot[key], 0);
  const peakActivePregnancies = allSnapshots.reduce(
    (peak, snapshot) => Math.max(peak, snapshot.activePregnancies),
    0,
  );
  const diagnostics = getLatestRelationshipDiagnostics();
  const diagnosticTick = diagnostics?.tick ?? null;

  // This is deliberately one line per 90-day checkpoint so `vitest` output is
  // useful when running the long integration test from a terminal or CI log.
  writeFullYearDebug('checkpoint', {
    day,
    tick: world.tick,
    year: world.year,
    population: world.entities.filter((entity) => entity.alive).length,
    humans: relationships.humans,
    buildings: world.buildings.length,
    food: Math.round(world.resources.food ?? 0),
    wood: Math.round(world.resources.wood ?? 0),
    relationships,
    diagnostics: diagnostics
      ? {
          tick: diagnostics.tick,
          calendarDay: diagnostics.calendarDay,
          activeMarriages: diagnostics.activeMarriages,
          activeCourtships: diagnostics.activeCourtships,
          activeYouthLovePairs: diagnostics.activeYouthLovePairs,
          activeAffairs: diagnostics.activeAffairs,
          activePregnancies: diagnostics.activePregnancies,
          conceptionCandidates: diagnostics.conceptionCandidates,
          pregnanciesStartedThisInterval: diagnostics.pregnanciesStartedThisInterval,
          birthsCompletedThisInterval: diagnostics.birthsCompletedThisInterval,
        }
      : null,
    periodTotals: {
      diagnosticsDays: intervalSnapshots.length,
      conceptionCandidates: sum(intervalSnapshots, 'conceptionCandidates'),
      pregnanciesStarted: sum(intervalSnapshots, 'pregnanciesStartedThisInterval'),
      birthsCompleted: sum(intervalSnapshots, 'birthsCompletedThisInterval'),
    },
    runTotals: {
      diagnosticsDays: allSnapshots.length,
      pregnanciesStarted: sum(allSnapshots, 'pregnanciesStartedThisInterval'),
      birthsCompleted: sum(allSnapshots, 'birthsCompletedThisInterval'),
      peakActivePregnancies,
    },
    diagnosticAgeTicks: diagnosticTick == null ? null : world.tick - diagnosticTick,
  });
}

function runFullYear(seed: number): {
  world: WorldState;
  startYear: number;
  startTick: number;
  /** Ticks on which the story queue held at least one card — see the guard in the test below. */
  storyCardsQueued: number;
  /** Exact counts taken from the log as it grows; `lifetimeStats` only settles at a year boundary. */
  birthsLogged: number;
  marriagesLogged: number;
} {
  const world = initGame({ size: MapSize.Medium, seed });
  setSimSeed(seed);

  // `initGame` starts before the player has built housing. A full-year relationship test with no
  // house would measure colony starvation and settler deaths, not relationship behavior. Give the
  // seeded founders one completed home and enough starting food for this integration scenario; all
  // subsequent movement, relationship, and daily logic remains production code.
  //
  // Honest limits of that provisioning, measured on this seed: `updateStorageCaps` recomputes both
  // `storageMax` and `foodSpoilageRate` from the completed buildings, so the raised larder and the
  // zeroed spoilage rate below do not survive the year, and the larder does reach 0 before day 360.
  // This test therefore says nothing about food economics; the long-run harness carries that gate.
  const founders = world.entities.filter((entity) => entity.type === EntityType.Human);
  // If no founder exists, place the starter house at the map center.
  const anchor = founders[0] ?? { x: world.width / 2, y: world.height / 2 };
  const starterHouse = createBuilding(
    BuildingType.House,
    Math.max(0, anchor.x - STARTER_HOUSE_OFFSET),
    Math.max(0, anchor.y - STARTER_HOUSE_OFFSET),
    world.nextBuildingId++,
  );
  starterHouse.completed = true;
  starterHouse.constructionProgress = 1;
  starterHouse.spriteScale = 1;
  world.buildings.push(starterHouse);
  world.storageMax.food = SCAFFOLD_FOOD;
  world.resources.food = world.storageMax.food;
  world.foodSpoilageRate = 0;
  assignMissingResidences(founders, world.buildings, world.entities);
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  const startYear = world.year;
  const startTick = world.tick;
  const checkpoints = new Set(CHECKPOINT_DAYS.map((day) => day * TICKS_PER_DAY));
  let lastDiagnosticSnapshotCount = 1;
  let storyCardsQueued = 0;
  let birthsLogged = 0;
  let marriagesLogged = 0;
  const countedEventIds = new Set<number>();
  const debug: FullYearDebugState = {
    previous: fullYearResidentRecords(world), history: [], deaths: 0, removalsUnconfirmed: 0, moves: 0,
  };
  if (DEBUG) writeFullYearDebug('start', {
    seed, ticks: FULL_YEAR_TICKS, ticksPerDay: TICKS_PER_DAY, debug: DEBUG, verbose: VERBOSE,
    watchIds: [...WATCH_ENTITY_IDS], founders: [...debug.previous.values()].map((entry) => entry.snapshot),
    starterHouse: { id: starterHouse.id, occupants: [...starterHouse.occupants] },
    virtualPlayerUsed: false, note: 'Simulation ticks only; no player actions or automated colony management.',
  });

  for (let tick = 1; tick <= FULL_YEAR_TICKS; tick += 1) {
    gameTick(world);
    if (DEBUG) traceFullYearTick(world, debug, seed);
    if (world.pendingStoryEvents?.length) storyCardsQueued += 1;
    for (const event of world.eventLog) {
      if (countedEventIds.has(event.id)) continue;
      countedEventIds.add(event.id);
      if (event.type === 'birth') birthsLogged += 1;
      if (event.type === 'marriage') marriagesLogged += 1;
    }
    if (DEBUG && tick % (DEBUG_PROGRESS_DAYS * TICKS_PER_DAY) === 0) {
      writeFullYearDebug('progress', {
        day: tick / TICKS_PER_DAY, tick: world.tick, food: world.resources.food,
        playerResidentsAlive: world.entities.filter(isResidenceOccupantEntity).length,
        deathsObserved: debug.deaths, removalsUnconfirmed: debug.removalsUnconfirmed,
        residenceChanges: debug.moves, firstFailureTick: debug.firstFailureTick ?? null,
      });
    }
    if (!checkpoints.has(tick)) continue;

    const day = tick / TICKS_PER_DAY;
    const errors = collectSimulationInvariantErrors(world);
    const history = getRelationshipDiagnosticsHistory();
    printCheckpoint(day, world, history.slice(lastDiagnosticSnapshotCount), history);
    if (errors.length > 0) printFullYearFailure(world, debug, errors, seed);
    expect(errors, `Simulation invariants at day ${day}; seed ${seed}; tick ${world.tick}`).toEqual([]);
    lastDiagnosticSnapshotCount = history.length;
  }
  if (DEBUG) {
    const history = getRelationshipDiagnosticsHistory().filter(
      (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null,
    );
    console.info('[FullYear totals]', {
      seed,
      days: DAYS_PER_YEAR,
      diagnosticsDays: history.length,
      pregnanciesStarted: history.reduce((total, snapshot) => total + snapshot.pregnanciesStartedThisInterval, 0),
      birthsCompleted: history.reduce((total, snapshot) => total + snapshot.birthsCompletedThisInterval, 0),
      affairsEstablished: history.reduce((total, snapshot) => total + snapshot.affairsEstablished, 0),
      peakActiveMarriages: history.reduce((peak, snapshot) => Math.max(peak, snapshot.activeMarriages), 0),
      peakActiveAffairs: history.reduce((peak, snapshot) => Math.max(peak, snapshot.activeAffairs), 0),
      peakActivePregnancies: history.reduce((peak, snapshot) => Math.max(peak, snapshot.activePregnancies), 0),
      finalActivePregnancies: history.at(-1)?.activePregnancies ?? 0,
      lifetimeStats: { ...world.lifetimeStats, totalResourcesGathered: undefined, longestLivingHuman: undefined },
      yearlyStats: world.yearlyStats.map((ys) => ({ year: ys.year, births: ys.births.humans, marriages: ys.marriages, deaths: ys.deaths.humans })),
      eventLogEntries: world.eventLog.length,
      caravanCompletions: world.lifetimeStats.tradeCaravansCompleted,
    });
  }
  return { world, startYear, startTick, storyCardsQueued, birthsLogged, marriagesLogged };
}

describe('full in-game year integration', () => {
  afterEach(() => {
    resetRelationshipDiagnostics();
    resetSimRng();
  });

  it(
    `runs ${DAYS_PER_YEAR} days (${FULL_YEAR_TICKS} ticks) with seed ${SEED} without invariant violations`,
    () => {
      const { world, startYear, startTick, storyCardsQueued, birthsLogged, marriagesLogged } = runFullYear(SEED);

      // Calendar exactly one year later (360-day year, dayInYear is 0-based).
      expect(world.tick).toBe(startTick + FULL_YEAR_TICKS);
      expect(world.year).toBe(startYear + 1);
      expect(world.dayInYear).toBe(0);

      // Colony still alive.
      const alive = world.entities.filter((entity) => entity.alive);
      expect(alive.length).toBeGreaterThan(0);
      expect(alive.length).toBeLessThan(POPULATION_SANITY_LIMIT);

      // Resources finite and never negative.
      for (const [key, value] of Object.entries(world.resources ?? {})) {
        expectNonNegative(Number(value), `resource ${key}`);
      }

      // Entity/building cross-reference sanity.
      const entityIds = new Set(world.entities.map((entity) => entity.id));
      const buildingIds = new Set(world.buildings.map((building) => building.id));
      for (const entity of world.entities) {
        expectEntitySanity(entity, buildingIds);
      }
      for (const building of world.buildings) {
        expectBuildingSanity(building, entityIds);
      }

      // Story/event infrastructure produced valid, non-empty activity.
      expect(world.eventLog.length).toBeGreaterThan(0);
      // `initGame` never sets `pendingStoryEvents`: `offerStoryEvent` creates it lazily (`??= []`,
      // `storyEvents.ts`), so the field may legitimately be absent when the bell rings. Guard it
      // instead of iterating a possibly-`undefined` value — a throw here would abort a 360-day run
      // and read as a hang rather than a failure.
      if (world.pendingStoryEvents !== undefined) {
        expect(Array.isArray(world.pendingStoryEvents), 'pendingStoryEvents must be an array when present').toBe(true);
      }
      // Non-vacuity guard: the year really did queue story cards, so the loop below was reached.
      expect(storyCardsQueued, 'the story queue was exercised during the year').toBeGreaterThan(0);
      for (const event of world.pendingStoryEvents ?? []) {
        expect(typeof event.id).toBe('string');
        expect(event.id.length).toBeGreaterThan(0);
        expect(typeof event.title).toBe('string');
        expect(event.title.length).toBeGreaterThan(0);
        expect(typeof event.storyKey).toBe('string');
        expect(event.storyKey.length).toBeGreaterThan(0);
      }

      // Final invariant pass (redundant with the last checkpoint but explicit).
      expect(collectSimulationInvariantErrors(world)).toEqual([]);

      // Non-vacuity for the domains this test does cover. Invariants hold trivially in a year where
      // nothing happens, so the year has to show real relationship and lifecycle activity. Measured
      // on this seed: pregnancies start, births are delivered and marriages are formed.
      expect(birthsLogged, 'births were delivered during the year').toBeGreaterThan(0);
      expect(marriagesLogged, 'marriages were formed during the year').toBeGreaterThan(0);
      const diagnostics = getRelationshipDiagnosticsHistory().filter(
        (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null,
      );
      expect(
        diagnostics.reduce((sum, snapshot) => sum + snapshot.pregnanciesStartedThisInterval, 0),
        'pregnancies started during the year',
      ).toBeGreaterThan(0);
      const humans = world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
      expect(humans.length, 'the year left more than the two founders alive').toBeGreaterThan(2);

      // Food economics are deliberately outside this test, and the numbers say so rather than
      // implying otherwise: the storage owner recomputes cap and spoilage from the one house, so the
      // provisioning above is spent, and the larder empties before the year ends. `foodEmpty` is
      // recorded for the reader instead of asserted — asserting it either way would be a lie about
      // what this scenario measures.
      if (DEBUG) {
        console.info('[FullYear food]', {
          stored: Math.round(world.resources.food ?? 0),
          spoilageRatePerDay: world.foodSpoilageRate,
        });
      }
      expect(world.foodSpoilageRate).toBeGreaterThanOrEqual(0);
    },
    TEST_TIMEOUT_MS,
  );
});
