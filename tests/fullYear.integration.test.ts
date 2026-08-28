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
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import {
  getLatestRelationshipDiagnostics,
  getRelationshipDiagnosticsHistory,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

const SEED = 12345;
const FULL_YEAR_TICKS = DAYS_PER_YEAR * TICKS_PER_DAY;
const STARTER_HOUSE_OFFSET = 24;
const POPULATION_SANITY_LIMIT = 5_000;
const TEST_TIMEOUT_MS = 120_000;
const DEBUG = process.argv.includes('--debug') || process.env.WILDERFOLK_DEBUG === '1';
const CHECKPOINT_DAYS = Array.from(
  { length: Math.ceil(DAYS_PER_YEAR / 90) },
  (_, index) => Math.min((index + 1) * 90, DAYS_PER_YEAR),
);

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
  if (entity.homeBuildingId != null) {
    expect(buildingIds.has(entity.homeBuildingId), `entity ${entity.id} homeBuildingId`).toBe(true);
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
  const diagnosticDay = diagnostics?.calendarDay ?? null;
  const diagnosticTick = diagnostics?.tick ?? null;

  // This is deliberately one line per 90-day checkpoint so `vitest` output is
  // useful when running the long integration test from a terminal or CI log.
  console.info('[FullYear checkpoint]', {
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

function runFullYear(seed: number): { world: WorldState; startYear: number; startTick: number } {
  const world = initGame({ size: MapSize.Medium, seed });
  setSimSeed(seed);

  // `initGame` intentionally starts before the player has built housing. A
  // full-year relationship test with no house would therefore measure colony
  // starvation and settler deaths, not relationship behavior. Give the seeded
  // founders one completed home and enough starting food for this integration
  // scenario; all subsequent movement, relationship, and daily logic remains
  // production code.
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
  world.storageMax.food = 100_000;
  world.resources.food = world.storageMax.food;
  world.foodSpoilageRate = 0;
  assignMissingResidences(founders, world.buildings, world.entities);
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  const startYear = world.year;
  const startTick = world.tick;
  const checkpoints = new Set(CHECKPOINT_DAYS.map((day) => day * TICKS_PER_DAY));
  let lastDiagnosticSnapshotCount = 0;

  for (let tick = 1; tick <= FULL_YEAR_TICKS; tick += 1) {
    gameTick(world);
    if (!checkpoints.has(tick)) continue;

    const day = tick / TICKS_PER_DAY;
    const errors = collectSimulationInvariantErrors(world);
    expect(errors, `Simulation invariants at day ${day}`).toEqual([]);
    const history = getRelationshipDiagnosticsHistory();
    printCheckpoint(day, world, history.slice(lastDiagnosticSnapshotCount), history);
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
      peakActivePregnancies: history.reduce((peak, snapshot) => Math.max(peak, snapshot.activePregnancies), 0),
      finalActivePregnancies: history.at(-1)?.activePregnancies ?? 0,
    });
  }
  return { world, startYear, startTick };
}

describe('full in-game year integration', () => {
  afterEach(() => {
    resetRelationshipDiagnostics();
    resetSimRng();
  });

  it(
    `runs ${DAYS_PER_YEAR} days (${FULL_YEAR_TICKS} ticks) with seed ${SEED} without invariant violations`,
    () => {
      const { world, startYear, startTick } = runFullYear(SEED);

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
      expect(world.pendingStoryEvents).toBeDefined();
      for (const event of world.pendingStoryEvents) {
        expect(typeof event.id).toBe('string');
        expect(event.id.length).toBeGreaterThan(0);
        expect(typeof event.title).toBe('string');
        expect(event.title.length).toBeGreaterThan(0);
        expect(typeof event.storyKey).toBe('string');
        expect(event.storyKey.length).toBeGreaterThan(0);
      }

      // Final invariant pass (redundant with the last checkpoint but explicit).
      expect(collectSimulationInvariantErrors(world)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
