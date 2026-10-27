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
 *   npx tsx scripts/run-full-year.mts --scenario=producers --days=720 --bot
 *
 * Options:
 *   --years=N       1..10 (default 1); ignored when --days is given
 *   --days=N        explicit length, 1..3600; the P1 scenario command uses --days=100
 *   --scenario=     restocked | producers (default restocked)
 *   --seed=N        world/colony seed (default 12345); review a run by seed and checkpoint
 *   --bot           drive the colony with the virtual player instead of ticking it passively
 *   --verbose       print the full per-checkpoint health record to stdout (default: one summary line)
 *
 * `--bot` runs the auto-play ladder on its own cadence (`shouldVirtualPlayerAct`) through the command
 * door the game uses. Every run writes the final `eventLog` beside its JSONL record, for tracing.
 *
 * A finished run is also judged on whether the colony still works: `assessColonyStall` reads the
 * recorded health and reports `healthy` or a `stalled(...)` verdict, which fails the run. Only
 * `--bot` raises buildings, so on a passive run `raised=0` is expected and the stall rules rest on
 * housing, food and wood instead.
 *
 * Normal mode is deliberately bounded: one line per checkpoint on stdout, with the complete record
 * written to the JSONL log. Nothing here changes a simulation rule; see `scripts/colonyHealth.ts`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameTick } from '../src/game/gameEngine';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { getResidenceCapacity, isResidenceBuilding } from '../src/game/residencyOccupancy';
import { isPlayerHuman } from '../src/game/playerHuman';
import {
  collectHousingDiagnostics,
  isHousingDiagnosticsHealthy,
  type HousingDiagnosticsSnapshot,
} from '../src/game/housingDiagnostics';
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
  applyColonyBotAction,
  assessColonyStall,
  assertColonyNotStalled,
  captureConsoleVolume,
  collectInvariantErrors,
  countRelationships,
  createColonyObserver,
  formatColonyStallVerdict,
  isScenarioName,
  prepareColonyWorld,
  sampleDelta,
  summarizeLivingPopulation,
  type ColonyHealthReport,
  type ColonyStallVerdict,
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
  /** True when the virtual player drives the run; false leaves the world ticking passively. */
  bot: boolean;
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

  return {
    scenario: scenarioValue,
    days: totalDays,
    seed,
    verbose: args.includes('--verbose'),
    bot: args.includes('--bot'),
  };
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
  /** Bot acts applied through the command door, and the in-game hours the bot found nothing to do. */
  botActs: number;
  botIdleHours: number;
  botByOp: Record<string, number>;
  /** Housing stability: settlers who changed home, and those moved again in the next window. */
  housingRelocations: number;
  housingRepeatMoves: number;
}

const counters: RunCounters = {
  stalledTicks: 0,
  serializationSpikes: 0,
  invariantViolations: 0,
  workerFallbacks: 0,
  botActs: 0,
  botIdleHours: 0,
  botByOp: {},
  housingRelocations: 0,
  housingRepeatMoves: 0,
};

/** The world the running attempt owns, so a failure still leaves its event-log trace on disk. */
let activeWorld: WorldState | null = null;

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

/**
 * Which home broke first, by the housing owner's own verdict. A count cannot say which residence
 * holds too many, and every hypothesis about why has to be checked against the real assignment.
 */
function describeHousingFailure(
  world: WorldState,
  housing: HousingDiagnosticsSnapshot,
): string {
  const overCapacity = world.buildings
    .filter((b) => isResidenceBuilding(b) && b.faction !== 'rival')
    .map((b) => ({ b, cap: getResidenceCapacity(b), held: b.occupants.length }))
    .filter((entry) => entry.held > entry.cap);
  if (overCapacity.length > 0) {
    return overCapacity.map((entry) => {
      const type = BUILDING_CONFIGS[entry.b.type].label;
      return `${type} #${entry.b.id} (level ${entry.b.level || 1}) holds ${entry.held} of ${entry.cap}: `
        + entry.b.occupants
          .map((id) => {
            const e = world.entities.find((candidate) => candidate.id === id);
            return e ? `#${id}${e.isJuvenile ? '(child)' : ''}` : `#${id}(missing)`;
          })
          .join(' ');
    }).join('; ');
  }
  if (housing.orphanedResidenceReferences > 0) {
    return `orphaned residence references: ${housing.orphanedResidenceReferences}`;
  }
  if (housing.occupantListMismatches > 0) {
    return `occupant-list mismatches: ${housing.occupantListMismatches}`;
  }
  return 'unknown';
}

function assertWorldReferences(world: WorldState): void {
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  const buildingIds = new Set(world.buildings.map((building) => building.id));

  for (const entity of world.entities) {
    assertFiniteNonNegative(entity.x, `entity ${entity.id} x`);
    assertFiniteNonNegative(entity.y, `entity ${entity.id} y`);
    assertFiniteNonNegative(entity.energy, `entity ${entity.id} energy`);
    if (entity.workerBuildingId != null) {
      assert(buildingIds.has(entity.workerBuildingId), `entity ${entity.id} references a missing workplace`);
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
function checkpointSummary(health: ColonyHealthReport, world: WorldState, stall: ColonyStallVerdict): string {
  return [
    `[colony] day ${health.day}`,
    `tick ${health.tick}`,
    `scenario=${options.scenario}`,
    `bot=${options.bot}`,
    `botActs=${counters.botActs}`,
    `restocks=${SCENARIOS[options.scenario].restocksAtCheckpoint}`,
    `settlers=${livingSettlers(world)}`,
    `food=${health.food.stored}/${health.food.storageMax}`,
    `producedToday=${health.food.producedToday}`,
    `consumedToday=${health.food.consumedToday}`,
    `food30d=${health.food.last30Days.produced}-${health.food.last30Days.consumed}=${health.food.last30Days.net}`,
    `foodDays=${health.food.last30Days.sampledDays}`,
    `beds=${health.housing.occupiedBeds}/${health.housing.totalBeds}`,
    `homeless=${health.housing.homelessPlayerHumans}`,
    `relocations=${counters.housingRelocations}`,
    `repeatMoves=${counters.housingRepeatMoves}`,
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
    `colony=${formatColonyStallVerdict(stall)}`,
  ].join(' ');
}

function livingSettlers(world: WorldState): number {
  return world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human).length;
}

/** One checkpoint window's housing churn: homes changed now, and movers who had just moved. */
interface ResidenceMoveTally {
  relocations: number;
  repeated: number;
  residences: Map<number, number | undefined>;
  movers: Set<number>;
}

function countResidenceMoves(
  previous: ReadonlyMap<number, number | undefined>,
  previousMovers: ReadonlySet<number>,
  world: WorldState,
): ResidenceMoveTally {
  const residences = new Map<number, number | undefined>();
  const movers = new Set<number>();
  let relocations = 0;
  let repeated = 0;
  for (const entity of world.entities) {
    if (!entity.alive || !isPlayerHuman(entity)) continue;
    const before = previous.get(entity.id);
    const now = entity.residenceBuildingId;
    residences.set(entity.id, now);
    if (before === now) continue;
    relocations += 1;
    movers.add(entity.id);
    if (previousMovers.has(entity.id)) repeated += 1;
  }
  return { relocations, repeated, residences, movers };
}

function writeCheckpoint(
  day: number,
  world: WorldState,
  startedAt: number,
  health: ColonyHealthReport,
  stall: ColonyStallVerdict,
): void {
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
      stall,
    },
    options.verbose ? undefined : checkpointSummary(health, world, stall),
  );
}

/** Count a bot decision using the same executor as the seeded non-vacuity test. */
function applyBotDecision(world: WorldState): void {
  const operation = applyColonyBotAction(world);
  if (operation == null) {
    counters.botIdleHours += 1;
    return;
  }
  counters.botActs += 1;
  counters.botByOp[operation] = (counters.botByOp[operation] ?? 0) + 1;
}

/** The world's own `eventLog`, unfiltered, one entry per line in the order the world holds it. */
function writeEventLogTrace(world: WorldState): { path: string; entries: number; bytes: number } {
  const tracePath = resolve(
    logDirectory,
    `event-log-${options.scenario}-seed${options.seed}-${TOTAL_DAYS}d-${runId}.jsonl`,
  );
  const traceText = world.eventLog.map((entry) => JSON.stringify(entry)).join('\n');
  const fileText = traceText.length > 0 ? `${traceText}\n` : '';
  writeFileSync(tracePath, fileText, 'utf8');
  const bytes = Buffer.byteLength(fileText, 'utf8');
  writeLog(
    {
      kind: 'full-year-event-log-trace',
      scenario: options.scenario,
      seed: options.seed,
      days: TOTAL_DAYS,
      path: tracePath,
      entries: world.eventLog.length,
      bytes,
      order: 'newest-first, exactly as WorldState.eventLog holds it',
      newestId: world.eventLog[0]?.id ?? null,
      oldestId: world.eventLog[world.eventLog.length - 1]?.id ?? null,
    },
    `[colony] event log trace ${relative(projectRoot, tracePath)} entries=${world.eventLog.length} bytes=${bytes}`,
  );
  return { path: tracePath, entries: world.eventLog.length, bytes };
}

function run(): void {
  const startedAt = performance.now();
  resetRelationshipDiagnostics();
  setRelationshipDiagnosticsEnabled(true);
  setRelationshipDiagnosticsConsoleLoggingEnabled(false);
  // Console volume is measured, never hidden: every call is still forwarded to the real console.
  const consoleCapture = captureConsoleVolume();

  const prepared = prepareColonyWorld({
    size: MapSize.Medium,
    seed: options.seed,
    scenario: options.scenario,
  });
  const world = prepared.world;
  activeWorld = world;
  const { startTick, startYear, restocksAtCheckpoint, settlement } = prepared;
  const observer = createColonyObserver(world);
  const initialBuildingIds = new Set(world.buildings.map((building) => building.id));
  const healthObserved: ColonyHealthReport[] = [];
  let lastBotActedTick: number | null = null;
  let previousResidences = new Map<number, number | undefined>(
    world.entities.filter((entity) => entity.alive && isPlayerHuman(entity)).map((entity) => [entity.id, entity.residenceBuildingId]),
  );
  let previousMovers = new Set<number>();
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

    // The bot's own cadence rule, read from the hook that drives it in the game rather than copied.
    if (
      options.bot
      && shouldVirtualPlayerAct(true, { paused: world.paused, tick: world.tick }, lastBotActedTick)
    ) {
      lastBotActedTick = world.tick;
      applyBotDecision(world);
    }

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
    // Sampled at every checkpoint, not only at the end, so a housing break is dated rather than
    // dumped at year end with no clue which part of the run produced it.
    const housingSnapshot = collectHousingDiagnostics(world);
    assert(
      isHousingDiagnosticsHealthy(housingSnapshot),
      `Housing is inconsistent at day ${day}: ${describeHousingFailure(world, housingSnapshot)}`,
    );
    const housingMoves = countResidenceMoves(previousResidences, previousMovers, world);
    counters.housingRelocations += housingMoves.relocations;
    counters.housingRepeatMoves += housingMoves.repeated;
    previousResidences = housingMoves.residences;
    previousMovers = housingMoves.movers;

    const deltas = sampleDelta(world);
    if (deltas.serializeMs > SERIALIZATION_SPIKE_MS) counters.serializationSpikes += 1;
    const health = observer.observe(day, deltas, invariantErrors);
    healthObserved.push(health);
    // Evaluated from the observations so far, so a stalled colony is named at the checkpoint it
    // first reads as stalled rather than only at the end of the run.
    const provisional = assessColonyStall({
      world,
      snapshots: healthObserved,
      final: health,
      newBuildingsAtEnd: world.buildings.filter((building) => !initialBuildingIds.has(building.id) && building.faction !== 'rival').length,
    });
    writeCheckpoint(day, world, startedAt, health, provisional);
  }

  // Written before any assertion below: a run that breaks still leaves its trace on disk.
  const trace = writeEventLogTrace(world);

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
  assert(
    finalHealth.housing.healthy,
    `housing diagnostics reported an inconsistent colony (${describeHousingFailure(world, finalHealth.housing)}; `
      + `${finalHealth.housing.residences} residences, ${finalHealth.housing.totalBeds} beds, `
      + `${finalHealth.housing.occupiedBeds} occupied, ${finalHealth.housing.homelessPlayerHumans} homeless)`,
  );
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

  // Buildings that did not stand at day 0. The bot is the only command issuer in this run, so a new
  // player-owned building is one the bot raised; rival keeps count separately.
  const raisedBuildings = world.buildings.filter((building) => !initialBuildingIds.has(building.id));
  const raisedByType: Record<string, number> = {};
  const standingByType: Record<string, number> = {};
  for (const building of world.buildings) {
    const label = BUILDING_CONFIGS[building.type].label;
    standingByType[label] = (standingByType[label] ?? 0) + 1;
  }
  for (const building of raisedBuildings) {
    const label = BUILDING_CONFIGS[building.type].label;
    raisedByType[label] = (raisedByType[label] ?? 0) + 1;
  }

  // Non-vacuity: invariants and housing consistency can both hold while the colony has stopped
  // responding to its own demand. The verdict is a distinct outcome, not a softened failure.
  const stall = assessColonyStall({
    world,
    snapshots: healthObserved,
    final: finalHealth,
    newBuildingsAtEnd: raisedBuildings.filter((building) => building.faction !== 'rival').length,
  });

  writeLog({
    kind: 'full-year-complete',
    scenario: options.scenario,
    restocksAtCheckpoint,
    elapsedMs: Math.round(performance.now() - startedAt),
    seed: options.seed,
    days: TOTAL_DAYS,
    ticks: TOTAL_TICKS,
    settlement,
    bot: {
      enabled: options.bot,
      cadenceTicksPerHour: TICKS_PER_HOUR,
      acts: counters.botActs,
      idleHours: counters.botIdleHours,
      byOp: counters.botByOp,
    },
    eventLogTrace: {
      ...trace,
      relativePath: relative(projectRoot, trace.path),
      order: 'newest-first, exactly as WorldState.eventLog holds it',
      newestId: world.eventLog[0]?.id ?? null,
      oldestId: world.eventLog[world.eventLog.length - 1]?.id ?? null,
      /** Event ids are contiguous per process, so the shortfall against them is what the cap dropped. */
      droppedByLogCap: Math.max(0, (world.eventLog[0]?.id ?? 0) - world.eventLog.length),
    },
    counters: {
      ...counters,
      workerFallbacksSource: 'main-thread scenario: the worker transport is not exercised here (P2 measures it)',
      serializationSpikeThresholdMs: SERIALIZATION_SPIKE_MS,
      stalledTickThresholdMs: PACING_TICK_BUDGET_MS,
      serializationSamples: checkpoints.size + 1,
    },
    console: consoleVolume,
    health: finalHealth,
    stall,
    build: {
      standingAtEnd: world.buildings.length,
      standingByType,
      raisedSinceDayZero: raisedBuildings.length,
      raisedByType,
      raisedRivalOwned: raisedBuildings.filter((building) => building.faction === 'rival').length,
    },
    finalState: {
      resources: {
        food: Math.round(world.resources.food ?? 0),
        wood: Math.round(world.resources.wood ?? 0),
        stone: Math.round(world.resources.stone ?? 0),
        iron: Math.round(world.resources.iron ?? 0),
        gold: Math.round(world.resources.gold ?? 0),
      },
      storageMax: world.storageMax,
      foodSpoilageRatePerDay: world.foodSpoilageRate,
      research: {
        researched: world.researchNodes.filter((node) => node.researched).length,
        total: world.researchNodes.length,
        activeResearch: world.activeResearch,
        researchProgress: Math.round(world.researchProgress),
        unlockedTechs: world.unlockedTechs.length,
      },
      tradeRoutes: {
        total: world.tradeRoutes.length,
        active: world.tradeRoutes.filter((route) => route.active).length,
      },
      visitorKinds: world.visitorGroups.map((group) => group.kind),
      festival: world.festival,
      villageLeaderId: world.villageLeaderId,
      lastElectionYear: world.lastElectionYear,
      pendingElectionYear: world.pendingElectionYear,
      activeMigration: world.activeMigration ?? null,
      totalBuildingsCompleted: world.totalBuildingsCompleted,
      lifetimeStats: world.lifetimeStats,
    },
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

  process.stdout.write(
    `[colony] outcome scenario=${options.scenario} days=${TOTAL_DAYS} colony=${formatColonyStallVerdict(stall)}`
      + ` settlers=${livingSettlers(world)} buildings=${world.buildings.length} raised=${raisedBuildings.length}`
      + (stall.stalled ? ` reasons=${stall.reasons.join(',')}\n[colony] stall ${stall.evidence.join(' | ')}\n` : '\n'),
  );
  assertColonyNotStalled(stall, `the ${TOTAL_DAYS}-day ${options.scenario} run`);
}

mkdirSync(logDirectory, { recursive: true });
try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  writeLog({ kind: 'full-year-failed', scenario: options.scenario, seed: options.seed, message });
  if (activeWorld) writeEventLogTrace(activeWorld);
  process.exitCode = 1;
} finally {
  resetRelationshipDiagnostics();
  resetSimRng();
}
