/**
 * Wilderfolk — seeded long-run colony gate (roadmap O4 / P1 "Seeded Colony Health Scenario").
 *
 * One seeded settlement, one JSONL run log under `docs/log/`, invariant-gated at checkpoints, and a
 * combined health report for **food, housing, workforce, relationships, stories, elections, animals
 * and deltas**.
 *
 * Two scenarios, named on every run so a reader can never mistake one for the other:
 *
 *   --scenario=restocked  (default) the pre-existing gate: no producers, and food/wood are refilled
 *                         to `storageMax` at every checkpoint.
 *   --scenario=producers  the coverage gap closed (roadmap O4, measured): producers are built and
 *                         staffed, and **nothing is restocked after day 0**, so production, spoilage
 *                         and consumption economics are inside the gate.
 *
 * Run:
 *   npx tsx scripts/run-full-year.mts                              # 1 year, restocked (the old gate)
 *   npx tsx scripts/run-full-year.mts --years=2
 *   npx tsx scripts/run-full-year.mts --scenario=producers --days=100
 *   npx tsx scripts/run-full-year.mts --scenario=producers --days=100 --verbose
 *
 * Options:
 *   --years=N       1..10 (default 1); ignored when --days is given
 *   --days=N        explicit length, 1..3600; the P1 scenario command uses --days=100
 *   --scenario=     restocked | producers (default restocked)
 *   --seed=N        world/colony seed (default 12345); review a run by seed and checkpoint
 *   --verbose       print the full per-checkpoint health record to stdout (default: one summary line)
 *
 * Normal mode is deliberately bounded: one line per checkpoint on stdout, with the complete record
 * written to the JSONL log. Nothing here changes a simulation rule; see `scripts/colonyHealth.ts`.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameTick } from '../src/game/gameEngine';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import {
  getRelationshipDiagnosticsHistory,
  resetRelationshipDiagnostics,
  setRelationshipDiagnosticsConsoleLoggingEnabled,
  setRelationshipDiagnosticsEnabled,
} from '../src/game/relationshipDiagnostics';
import { resetSimRng } from '../src/game/simRng';
import {
  PACING_TICK_BUDGET_MS,
  SCENARIOS,
  SERIALIZATION_SPIKE_MS,
  captureConsoleVolume,
  collectInvariantErrors,
  countRelationships,
  createColonyObserver,
  isScenarioName,
  prepareColonyWorld,
  sampleDelta,
  summarizeLivingPopulation,
  type ColonyHealthReport,
  type ScenarioName,
} from './colonyHealth';

const DEFAULT_SEED = 12345;
const DEFAULT_YEARS = 1;
const MAX_YEARS = 10;
const MAX_DAYS = MAX_YEARS * DAYS_PER_YEAR;
const CHECKPOINT_INTERVAL_DAYS = 30;
const POPULATION_SANITY_LIMIT = 5_000;

type SocialMetric =
  | 'conceptionCandidates'
  | 'pregnanciesStartedThisInterval'
  | 'birthsCompletedThisInterval'
  | 'affairChecks'
  | 'affairProgressGains'
  | 'affairsEstablished'
  | 'gossipChecks'
  | 'scandalExposures';

interface RunOptions {
  scenario: ScenarioName;
  days: number;
  seed: number;
  verbose: boolean;
}

function readPositiveIntegerOption(args: readonly string[], name: string): number | null {
  const supplied = args.filter((arg) => arg.startsWith(`--${name}=`));
  if (supplied.length === 0) return null;
  if (supplied.length !== 1) throw new Error(`Use --${name}=<positive integer> only once.`);
  const value = supplied[0].slice(`--${name}=`.length);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`The --${name} value must be a positive integer, for example --${name}=2.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`The --${name} value must be a safe integer.`);
  return parsed;
}

function readRunOptions(args: readonly string[]): RunOptions {
  const years = readPositiveIntegerOption(args, 'years');
  const days = readPositiveIntegerOption(args, 'days');
  if (years != null && days != null) {
    throw new Error('Use either --years=<n> or --days=<n>, not both.');
  }
  if (years != null && years > MAX_YEARS) {
    throw new Error(`The --years value must be between 1 and ${MAX_YEARS}.`);
  }

  const scenarioArgs = args.filter((arg) => arg.startsWith('--scenario='));
  if (scenarioArgs.length > 1) throw new Error('Use --scenario=<name> only once.');
  const scenarioValue = scenarioArgs[0]?.slice('--scenario='.length) ?? 'restocked';
  if (!isScenarioName(scenarioValue)) {
    throw new Error(`Unknown --scenario "${scenarioValue}". Known: ${Object.keys(SCENARIOS).join(', ')}.`);
  }

  const seed = readPositiveIntegerOption(args, 'seed') ?? DEFAULT_SEED;
  const totalDays = days ?? (years ?? DEFAULT_YEARS) * DAYS_PER_YEAR;
  if (totalDays > MAX_DAYS) {
    throw new Error(`The scenario length must be between 1 and ${MAX_DAYS} days.`);
  }

  return { scenario: scenarioValue, days: totalDays, seed, verbose: args.includes('--verbose') };
}

const options = readRunOptions(process.argv.slice(2));
const TOTAL_DAYS = options.days;
const TOTAL_TICKS = TOTAL_DAYS * TICKS_PER_DAY;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logDirectory = resolve(projectRoot, 'docs', 'log');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const logPath = resolve(logDirectory, `full-year-${runId}.jsonl`);

/** Counters the roadmap requires to stay separate; never merged into one "problems" number. */
interface RunCounters {
  stalledTicks: number;
  serializationSpikes: number;
  invariantViolations: number;
  /** Always 0 here: this scenario never exercises the worker transport (P2 measures it). */
  workerFallbacks: number;
}

const counters: RunCounters = {
  stalledTicks: 0,
  serializationSpikes: 0,
  invariantViolations: 0,
  workerFallbacks: 0,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertFiniteNonNegative(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite`);
  assert(value >= 0, `${label} must be non-negative`);
}

function writeLog(event: Record<string, unknown>, stdoutLine?: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
  appendFileSync(logPath, `${line}\n`, 'utf8');
  process.stdout.write(`${stdoutLine ?? line}\n`);
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

function sumDiagnostics(
  snapshots: readonly NonNullable<ReturnType<typeof getRelationshipDiagnosticsHistory>[number]>[],
  metric: SocialMetric,
): number {
  return snapshots.reduce((total, snapshot) => total + snapshot[metric], 0);
}

/**
 * One bounded stdout line per checkpoint, so normal mode never floods a terminal, while the full
 * health record goes to the JSONL log (and to stdout with --verbose).
 */
function checkpointSummary(health: ColonyHealthReport, world: WorldState): string {
  return [
    `[colony] day ${health.day}`,
    `tick ${health.tick}`,
    `scenario=${options.scenario}`,
    `restocks=${SCENARIOS[options.scenario].restocksAtCheckpoint}`,
    `settlers=${livingSettlers(world)}`,
    `food=${health.food.stored}/${health.food.storageMax}`,
    `producedToday=${health.food.producedToday}`,
    `consumedToday=${health.food.consumedToday}`,
    `beds=${health.housing.occupiedBeds}/${health.housing.totalBeds}`,
    `working=${health.workforce.working}`,
    `idle=${health.workforce.idle}`,
    `unstaffed=${health.workforce.unstaffedJobBuildings}`,
    `marriedPairs=${health.relationships.active.marriages}`,
    `conceptions=${health.lifecycle.conceptionsLogged}`,
    `pregnancies=${health.lifecycle.activePregnancies}`,
    `births=${health.lifecycle.birthsLogged}`,
    `deaths=${health.lifecycle.deathsLogged}`,
    `stories=${health.stories.pending}`,
    `leaderChanges=${health.elections.leaderChanges}`,
    `tamed=${health.animals.tamed}`,
    `deltaBytes=${health.deltas.v8Bytes}`,
    `invariants=${health.invariants.violations}`,
  ].join(' ');
}

function livingSettlers(world: WorldState): number {
  return world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human).length;
}

function writeCheckpoint(day: number, world: WorldState, startedAt: number, health: ColonyHealthReport): void {
  writeLog(
    {
      kind: 'full-year-checkpoint',
      scenario: options.scenario,
      restocksAtCheckpoint: SCENARIOS[options.scenario].restocksAtCheckpoint,
      day,
      tick: world.tick,
      year: world.year,
      elapsedMs: Math.round(performance.now() - startedAt),
      population: summarizeLivingPopulation(world),
      buildings: world.buildings.length,
      food: Math.round(world.resources.food ?? 0),
      wood: Math.round(world.resources.wood ?? 0),
      relationships: countRelationships(world),
      health,
    },
    options.verbose ? undefined : checkpointSummary(health, world),
  );
}

function run(): void {
  const startedAt = performance.now();
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  // Console volume is measured, never hidden: every call is still forwarded to the real console.
  const consoleCapture = captureConsoleVolume();

  const { world, startTick, startYear, restocksAtCheckpoint, settlement } = prepareColonyWorld({
    size: MapSize.Medium,
    seed: options.seed,
    scenario: options.scenario,
  });
  const observer = createColonyObserver(world);
  const checkpoints = new Set(
    Array.from(
      { length: Math.ceil(TOTAL_DAYS / CHECKPOINT_INTERVAL_DAYS) },
      (_, index) => Math.min((index + 1) * CHECKPOINT_INTERVAL_DAYS, TOTAL_DAYS) * TICKS_PER_DAY,
    ),
  );

  writeLog({
    kind: 'full-year-start',
    logPath,
    scenario: options.scenario,
    restocksAtCheckpoint,
    restockPolicy: restocksAtCheckpoint
      ? 'food and wood are refilled to storageMax at every checkpoint (this scenario restocks)'
      : 'initial provisioning only; nothing is restocked at checkpoints',
    seed: options.seed,
    days: TOTAL_DAYS,
    ticks: TOTAL_TICKS,
    checkpointIntervalDays: CHECKPOINT_INTERVAL_DAYS,
    settlement,
    initialPopulation: summarizeLivingPopulation(world),
    initialResources: {
      food: Math.round(world.resources.food ?? 0),
      wood: Math.round(world.resources.wood ?? 0),
    },
  });

  for (let tick = 1; tick <= TOTAL_TICKS; tick += 1) {
    const tickStartedAt = performance.now();
    gameTick(world);
    if (performance.now() - tickStartedAt > PACING_TICK_BUDGET_MS) counters.stalledTicks += 1;
    if (!checkpoints.has(tick)) continue;

    if (restocksAtCheckpoint) {
      // Scenario `restocked` only. This is the measured coverage gap the roadmap asks the producers
      // scenario to close, so it is named here rather than left implicit.
      world.resources.food = world.storageMax.food;
      world.resources.wood = world.storageMax.wood;
    }

    const day = tick / TICKS_PER_DAY;
    const invariantErrors = collectInvariantErrors(world);
    counters.invariantViolations += invariantErrors.length;
    assert(invariantErrors.length === 0, `Simulation invariants failed at day ${day}: ${invariantErrors.join('; ')}`);

    const deltas = sampleDelta(world);
    if (deltas.serializeMs > SERIALIZATION_SPIKE_MS) counters.serializationSpikes += 1;
    const health = observer.observe(day, deltas, invariantErrors);
    writeCheckpoint(day, world, startedAt, health);
  }

  assert(world.tick === startTick + TOTAL_TICKS, 'calendar tick did not advance by the requested duration');
  assert(
    world.year === startYear + Math.floor(TOTAL_DAYS / DAYS_PER_YEAR),
    'calendar year did not advance by the requested duration',
  );
  if (TOTAL_DAYS % DAYS_PER_YEAR === 0) {
    assert(world.dayInYear === 0, 'calendar did not return to day zero');
  }

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

  const finalInvariantErrors = collectInvariantErrors(world);
  counters.invariantViolations += finalInvariantErrors.length;
  assert(finalInvariantErrors.length === 0, `Final simulation invariants failed: ${finalInvariantErrors.join('; ')}`);

  const finalDelta = sampleDelta(world);
  const finalHealth = observer.observe(TOTAL_DAYS, finalDelta, finalInvariantErrors);
  // Domains the simulation invariant collector does not cover, checked here on the same run:
  //   - housing: the housing owner's own consistency verdict (over-capacity, orphaned references,
  //     occupant-list mismatches) — capacity pressure is reported separately as `housingPressure`.
  //   - animals: every wildlife count stays a finite non-negative number and the valley is not empty,
  //     and the animal-care owner reports one of its three states.
  assert(finalHealth.housing.healthy, 'housing diagnostics reported an inconsistent colony');
  assert(finalHealth.animals.wildlifeTotal > 0, 'the valley lost all wildlife');
  for (const [species, count] of Object.entries(finalHealth.animals.wildlife)) {
    assertFiniteNonNegative(count, `wildlife ${species}`);
  }
  const snapshots = getRelationshipDiagnosticsHistory().filter(
    (snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null,
  );
  const humans = world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
  const consoleVolume = consoleCapture.volume();
  consoleCapture.restore();

  writeLog({
    kind: 'full-year-complete',
    scenario: options.scenario,
    restocksAtCheckpoint,
    elapsedMs: Math.round(performance.now() - startedAt),
    seed: options.seed,
    days: TOTAL_DAYS,
    ticks: TOTAL_TICKS,
    settlement,
    counters: {
      ...counters,
      workerFallbacksSource: 'main-thread scenario: the worker transport is not exercised here (P2 measures it)',
      serializationSpikeThresholdMs: SERIALIZATION_SPIKE_MS,
      stalledTickThresholdMs: PACING_TICK_BUDGET_MS,
      serializationSamples: checkpoints.size + 1,
    },
    console: consoleVolume,
    health: finalHealth,
    outcome: {
      population: {
        ...summarizeLivingPopulation(world),
        currentlyImprisoned: humans.filter((human) => human.prisonBuildingId != null).length,
      },
      relationships: countRelationships(world),
      // Exact, counted from new log ids rather than from the 2 000-entry-capped log.
      eventTotals: observer.events(),
      annualSocialTotals: {
        conceptionCandidates: sumDiagnostics(snapshots, 'conceptionCandidates'),
        pregnanciesStarted: sumDiagnostics(snapshots, 'pregnanciesStartedThisInterval'),
        birthsCompleted: sumDiagnostics(snapshots, 'birthsCompletedThisInterval'),
        affairChecks: sumDiagnostics(snapshots, 'affairChecks'),
        affairProgressGains: sumDiagnostics(snapshots, 'affairProgressGains'),
        affairsEstablished: sumDiagnostics(snapshots, 'affairsEstablished'),
        gossipChecks: sumDiagnostics(snapshots, 'gossipChecks'),
        scandalExposures: sumDiagnostics(snapshots, 'scandalExposures'),
      },
      relationshipDiagnosticDays: snapshots.length,
    },
  });
}

mkdirSync(logDirectory, { recursive: true });
try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  writeLog({ kind: 'full-year-failed', scenario: options.scenario, seed: options.seed, message });
  process.exitCode = 1;
} finally {
  resetRelationshipDiagnostics();
  resetSimRng();
}
