import { initGame, gameTick } from '../src/game/gameEngine';
import { createBuilding } from '../src/game/worldGen';
import { assignMissingResidences } from '../src/game/dayCycle';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
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

const SEED = 12345;
const STARTER_HOUSE_OFFSET = 24;
const CHECKPOINT_INTERVAL_DAYS = 30;
const FULL_YEAR_TICKS = DAYS_PER_YEAR * TICKS_PER_DAY;
const POPULATION_SANITY_LIMIT = 5_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertFiniteNonNegative(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite`);
  assert(value >= 0, `${label} must be non-negative`);
}

function assertWorldReferences(world: WorldState): void {
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  const buildingIds = new Set(world.buildings.map((building) => building.id));

  for (const entity of world.entities) {
    assertFiniteNonNegative(entity.x, `entity ${entity.id} x`);
    assertFiniteNonNegative(entity.y, `entity ${entity.id} y`);
    assertFiniteNonNegative(entity.energy, `entity ${entity.id} energy`);
    if (entity.homeBuildingId != null) {
      assert(buildingIds.has(entity.homeBuildingId), `entity ${entity.id} references a missing workplace`);
    }
    if (entity.residenceBuildingId != null) {
      assert(buildingIds.has(entity.residenceBuildingId), `entity ${entity.id} references a missing residence`);
    }
    if (entity.prisonBuildingId != null) {
      assert(buildingIds.has(entity.prisonBuildingId), `entity ${entity.id} references a missing prison`);
    }
  }

  for (const building of world.buildings) {
    assertFiniteNonNegative(building.x, `building ${building.id} x`);
    assertFiniteNonNegative(building.y, `building ${building.id} y`);
    assertFiniteNonNegative(building.health, `building ${building.id} health`);
    assertFiniteNonNegative(building.constructionProgress, `building ${building.id} constructionProgress`);
    for (const occupantId of building.occupants) {
      assert(entityIds.has(occupantId), `building ${building.id} contains a missing occupant ${occupantId}`);
    }
  }
}

function countRelationships(world: WorldState): Record<string, number> {
  const humans = world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
  return {
    humans: humans.length,
    marriedPairs: humans.filter((entity) => entity.relationshipStatus === 'married' && entity.partnerId != null && entity.id < entity.partnerId).length,
    courtshipPairs: humans.filter((entity) => entity.courtshipPartnerId != null && entity.id < entity.courtshipPartnerId).length,
    youthLovePairs: humans.filter((entity) => entity.youthLovePartnerId != null && entity.id < entity.youthLovePartnerId).length,
    affairPairs: humans.filter((entity) => entity.affairPartnerId != null && entity.id < entity.affairPartnerId).length,
    pregnant: humans.filter((entity) => entity.pregnant).length,
  };
}

function printProgress(day: number, world: WorldState, startedAt: number): void {
  const diagnostics = getLatestRelationshipDiagnostics();
  const elapsedMs = Math.round(performance.now() - startedAt);
  process.stdout.write(`${JSON.stringify({
    kind: 'full-year-checkpoint',
    day,
    tick: world.tick,
    year: world.year,
    elapsedMs,
    population: world.entities.filter((entity) => entity.alive).length,
    buildings: world.buildings.length,
    food: Math.round(world.resources.food ?? 0),
    wood: Math.round(world.resources.wood ?? 0),
    relationships: countRelationships(world),
    diagnostics: diagnostics
      ? {
          calendarDay: diagnostics.calendarDay,
          activePregnancies: diagnostics.activePregnancies,
          conceptions: diagnostics.pregnanciesStartedThisInterval,
          births: diagnostics.birthsCompletedThisInterval,
        }
      : null,
  })}\n`);
}

function prepareWorld(seed: number): { world: WorldState; startTick: number; startYear: number } {
  const world = initGame({ size: MapSize.Medium, seed });
  setSimSeed(seed);

  const founders = world.entities.filter((entity) => entity.type === EntityType.Human);
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

  return { world, startTick: world.tick, startYear: world.year };
}

function run(): void {
  const startedAt = performance.now();
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  const { world, startTick, startYear } = prepareWorld(SEED);
  const checkpoints = new Set(
    Array.from(
      { length: Math.ceil(DAYS_PER_YEAR / CHECKPOINT_INTERVAL_DAYS) },
      (_, index) => Math.min((index + 1) * CHECKPOINT_INTERVAL_DAYS, DAYS_PER_YEAR) * TICKS_PER_DAY,
    ),
  );

  process.stdout.write(`${JSON.stringify({
    kind: 'full-year-start',
    seed: SEED,
    days: DAYS_PER_YEAR,
    ticks: FULL_YEAR_TICKS,
    checkpointIntervalDays: CHECKPOINT_INTERVAL_DAYS,
  })}\n`);

  for (let tick = 1; tick <= FULL_YEAR_TICKS; tick += 1) {
    gameTick(world);
    if (!checkpoints.has(tick)) continue;

    const day = tick / TICKS_PER_DAY;
    const invariantErrors = collectSimulationInvariantErrors(world);
    assert(invariantErrors.length === 0, `Simulation invariants failed at day ${day}: ${invariantErrors.join('; ')}`);
    printProgress(day, world, startedAt);
  }

  assert(world.tick === startTick + FULL_YEAR_TICKS, 'calendar tick did not advance by one full year');
  assert(world.year === startYear + 1, 'calendar year did not advance by one');
  assert(world.dayInYear === 0, 'calendar did not return to day zero');
  assert(world.entities.length > 0, 'the colony became extinct');
  assert(world.entities.length < POPULATION_SANITY_LIMIT, 'population exceeded the sanity limit');

  for (const [resource, value] of Object.entries(world.resources ?? {})) {
    assertFiniteNonNegative(Number(value), `resource ${resource}`);
  }
  assertWorldReferences(world);
  assert(world.eventLog.length > 0, 'event log is unexpectedly empty');
  assert(Array.isArray(world.pendingStoryEvents), 'pending story events are missing');
  for (const event of world.pendingStoryEvents) {
    assert(typeof event.id === 'string' && event.id.length > 0, 'story event has no id');
    assert(typeof event.title === 'string' && event.title.length > 0, 'story event has no title');
    assert(typeof event.storyKey === 'string' && event.storyKey.length > 0, 'story event has no key');
  }

  const invariantErrors = collectSimulationInvariantErrors(world);
  assert(invariantErrors.length === 0, `Final simulation invariants failed: ${invariantErrors.join('; ')}`);
  const diagnostics = getRelationshipDiagnosticsHistory();
  process.stdout.write(`${JSON.stringify({
    kind: 'full-year-complete',
    elapsedMs: Math.round(performance.now() - startedAt),
    population: world.entities.length,
    buildings: world.buildings.length,
    relationshipDiagnosticDays: diagnostics.length,
  })}\n`);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[full-year] Failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  resetRelationshipDiagnostics();
  resetSimRng();
}
