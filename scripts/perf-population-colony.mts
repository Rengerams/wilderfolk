import { appendFileSync, writeFileSync } from 'node:fs';
import { gameTick } from '../src/game/gameTick';
import { createEntity } from '../src/game/entityFactory';
import { BuildingType, BUILDING_CONFIGS } from '../src/game/buildings';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { getAbsoluteCalendarDay, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { isPlayerHuman } from '../src/game/playerHuman';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { buildEntityByType } from '../src/game/simFocus';
import { moveResident, syncResidenceOccupants } from '../src/game/residencyReconciliation';
import { assignWorkerTransition, syncJobBuildingOccupants } from '../src/game/workforce';
import { updateStorageCaps } from '../src/game/economy';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { loadNames } from '../src/game/nameLoader';
import { getSimFocus } from './simFocus';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { prepareColonyWorld, createCompletedBuilding, applyColonyBotAction, collectInvariantErrors } from './colonyHealth';

// The same real gameTick + hourly VirtualPlayer command route used by run-full-year.mts.
// The setup is a one-time seeded, staffed colony: no free births, resources or buildings during measurement.
const POPULATION = Number(process.env.PERF_POPS ?? '250');
const DAYS = Number(process.env.PERF_DAYS ?? '2');
const SEED = Number(process.env.PERF_SEED ?? '12345');
const WARMUP = Number(process.env.PERF_WARMUP ?? '12');
const REPORT = process.env.PERF_REPORT;
const EXPECT_CAREER = process.env.PERF_EXPECT_CAREER === '1';

if (!Number.isSafeInteger(POPULATION) || POPULATION < 24 || POPULATION > 5000 ||
    !Number.isSafeInteger(DAYS) || DAYS < 1 || DAYS > 180 ||
    !Number.isSafeInteger(WARMUP) || WARMUP < 0 || WARMUP >= TICKS_PER_DAY ||
    !Number.isSafeInteger(SEED) || !REPORT) {
  throw new Error('Requires PERF_POPS=250|750|1800, PERF_DAYS=1..180, PERF_WARMUP=0..287, PERF_SEED and PERF_REPORT');
}

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function livingPlayers(world: WorldState): Entity[] {
  return world.entities.filter((entity) => entity.alive && isPlayerHuman(entity));
}

function careerCredits(world: WorldState): number {
  let total = 0;
  // Keep historical credits of settlers who died during a long simulation.
  for (const entity of world.entities) {
    if (!entity.careerHistory) continue;
    for (const row of Object.values(entity.careerHistory)) total += row?.days ?? 0;
  }
  return total;
}

function prepareScaledColony(target: number): WorldState {
  const prepared = prepareColonyWorld({ size: MapSize.Huge, seed: SEED, scenario: 'producers' });
  const world = prepared.world;
  const founders = livingPlayers(world);
  const needed = target - founders.length;
  if (needed < 0) throw new Error('Requested population is below the founding population');
  const districtSize = 24;
  const districts = Math.ceil(needed / districtSize);
  const columns = Math.ceil(Math.sqrt(districts * 1.5));
  const rows = Math.ceil(districts / columns);
  const left = Math.round(world.width / 2 - columns * 305 / 2);
  const top = Math.round(world.height / 2 - rows * 270 / 2);
  let spawned = 0;

  for (let district = 0; district < districts; district++) {
    const x = left + (district % columns) * 305;
    const y = top + Math.floor(district / columns) * 270;
    const homes = [0, 72, 144, 216].map((offset) =>
      createCompletedBuilding(world, BuildingType.House, x + offset, y));
    const jobs: Building[] = [
      ...[0, 72, 144, 216].map((offset) => createCompletedBuilding(world, BuildingType.Farm, x + offset, y + 95)),
      createCompletedBuilding(world, BuildingType.LumberMill, x, y + 185),
      createCompletedBuilding(world, BuildingType.Quarry, x + 82, y + 185),
      createCompletedBuilding(world, BuildingType.Market, x + 166, y + 185),
      createCompletedBuilding(world, BuildingType.Tavern, x + 238, y + 185),
    ];

    if (district % 4 === 0) {
      createCompletedBuilding(world, BuildingType.Barn, x + 235, y - 72);
      createCompletedBuilding(world, BuildingType.Silo, x + 170, y - 72);
    }

    const residents: Entity[] = [];
    for (let local = 0; local < districtSize && spawned < needed; local++, spawned++) {
      const home = homes[Math.floor(local / 6)];
      const settler = createEntity(
        EntityType.Human,
        home.x + 15 + local % 3 * 5,
        home.y + 12 + local % 2 * 5,
        world.nextEntityId++,
        400,
        false,
        { ageYears: 22 + spawned % 26, colonyDay: 0, generation: 2 },
      );
      world.entities.push(settler);
      moveResident(settler, home.id, 'assignment', { buildings: world.buildings });
      residents.push(settler);
    }
    let next = 0;
    for (const job of jobs) {
      const cap = BUILDING_CONFIGS[job.type].maxOccupants;
      for (let position = 0; position < cap && next < residents.length; position++) {
        const worker = residents[next++];
        if (!assignWorkerTransition(worker, job)) throw new Error('Unable to assign seeded workplace');
      }
    }
  }

  world.humanPopulation = livingPlayers(world).length;
  world.maxHumanPopulation = Math.max(world.maxHumanPopulation, target);
  updateStorageCaps(world);
  world.resources.food = Math.min(world.storageMax.food, Math.max(world.resources.food, target * 12));
  world.resources.wood = Math.min(world.storageMax.wood, Math.max(world.resources.wood, target * 2));
  syncResidenceOccupants(world.entities, world.buildings);
  syncJobBuildingOccupants(world.entities, world.buildings);
  world.entityByType = buildEntityByType(world.entities);
  rebuildEntityByIdMap(world);
  if (world.humanPopulation !== target) {
    throw new Error('Wrong seeded population: expected ' + target + ', got ' + world.humanPopulation);
  }
  return world;
}

async function main(): Promise<void> {
  await preloadDialogueBank();
  await loadNames();
  let world = prepareScaledColony(POPULATION);
  const focus = getSimFocus(world);
  const measuredTicks = DAYS * TICKS_PER_DAY;
  const wallTicks: number[] = [];
  const cpuTicks: number[] = [];
  const botTicks: number[] = [];
  const dailySnapshots: Array<{
    day: number;
    calendarDay: number;
    tick: number;
    humans: number;
    housed: number;
    workersAssigned: number;
    buildings: number;
    food: number;
    wood: number;
    careerWorkers: number;
    creditedDays: number;
    newCreditsToday: number;
    newCreditsByJob: Record<string, number>;
    creditedByJob: Record<string, number>;
    botActions: number;
    newBotActionsToday: number;
    botIdleHours: number;
    invariantErrors: number;
    averageTickMs: number;
    p95TickMs: number;
  }> = [];
  let lastBotActedTick: number | null = null;
  let botActionCount = 0;
  let botAttemptHours = 0;
  let botIdleHours = 0;
  let invariantCount = 0;
  let careerEventCount = 0;
  let previousDayCredits = 0;
  let previousDayBotActions = 0;
  let lastDailySampleIndex = 0;
  let measuredCareerBaseline = careerCredits(world);
  const botByOperation = new Map<string, number>();
  const careerByJob = new Map<string, number>();
  const careerWorkerIds = new Set<number>();
  const seenCredits = new Map<string, number>();
  const firstTick = world.tick;
  const eventLogPath = REPORT!.replace(/\.json$/i, '') + '.events.jsonl';

  // The audit is captured outside the timed tick; events are saved as JSONL for CI artifacts.
  writeFileSync(eventLogPath, JSON.stringify({
    kind: 'start', seed: SEED, population: POPULATION, days: DAYS, warmup: WARMUP,
    initialTick: firstTick, initialBuildings: world.buildings.length, bot: true,
    scenario: 'producers', ticksPerHour: TICKS_PER_HOUR, ticksPerDay: TICKS_PER_DAY,
  }) + '\n');
  const writeEvents = (rows: readonly Record<string, unknown>[]): void => {
    if (rows.length) appendFileSync(eventLogPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  };

  for (const entity of world.entities) {
    if (!entity.careerHistory) continue;
    for (const [job, history] of Object.entries(entity.careerHistory)) {
      if (history) seenCredits.set(entity.id + ':' + job, history.days);
    }
  }

  for (let step = 1; step <= WARMUP + measuredTicks; step++) {
    const cpuStart = process.cpuUsage();
    const started = performance.now();
    world = gameTick(world, focus);
    const simMs = performance.now() - started;
    const botStart = performance.now();
    const events: Record<string, unknown>[] = [];

    if (shouldVirtualPlayerAct(true, world, lastBotActedTick)) {
      lastBotActedTick = world.tick;
      botAttemptHours++;
      const operation = applyColonyBotAction(world);
      if (operation !== null) {
        botActionCount++;
        botByOperation.set(operation, (botByOperation.get(operation) ?? 0) + 1);
        events.push({
          kind: 'bot-action', tick: world.tick, day: getAbsoluteCalendarDay(world.tick),
          hour: Math.floor((world.tick % TICKS_PER_DAY) / TICKS_PER_HOUR), op: operation,
        });
      } else {
        botIdleHours++;
      }
    }
    const botMs = performance.now() - botStart;
    const cpu = process.cpuUsage(cpuStart);
    if (step > WARMUP) {
      wallTicks.push(simMs);
      cpuTicks.push((cpu.user + cpu.system) / 1000);
      botTicks.push(botMs);
    } else if (step === WARMUP) {
      measuredCareerBaseline = careerCredits(world);
    }

    // Poll at most once per in-game hour, including any work credited at the daily noon pass.
    // This avoids an audit scan on every tick and preserves exact worker / job / site evidence.
    if (world.tick % TICKS_PER_HOUR === 0) {
      for (const entity of world.entities) {
        if (!entity.careerHistory) continue;
        for (const [job, history] of Object.entries(entity.careerHistory)) {
          if (!history) continue;
          const key = entity.id + ':' + job;
          const previous = seenCredits.get(key) ?? 0;
          if (!Number.isSafeInteger(history.days) || history.days < previous ||
              history.days > previous + 1) {
            throw new Error('Invalid career day transition for entity ' + entity.id +
              ' job ' + job + ': ' + previous + ' -> ' + history.days);
          }
          if (history.days === previous) continue;
          seenCredits.set(key, history.days);
          careerEventCount++;
          careerWorkerIds.add(entity.id);
          careerByJob.set(job, (careerByJob.get(job) ?? 0) + 1);
          events.push({
            kind: 'career-workday', tick: world.tick,
            entityId: entity.id, name: entity.name ?? null, job,
            workplaceId: entity.scheduleLastWorkedSiteId ?? null,
            observedHours: entity.scheduleLastWorkedHours ?? null,
            lastDay: history.lastDay, previousDays: previous, totalDays: history.days,
          });
        }
      }
    }
    writeEvents(events);

    // Exactly one snapshot for every measured 288 ticks, with warmup excluded.
    if (step <= WARMUP || (step - WARMUP) % TICKS_PER_DAY !== 0) continue;
    const measuredDay = (step - WARMUP) / TICKS_PER_DAY;
    const errors = collectInvariantErrors(world);
    invariantCount += errors.length;
    const players = livingPlayers(world);
    const newCreditsToday = careerEventCount - previousDayCredits;
    const newBotActionsToday = botActionCount - previousDayBotActions;
    const tickWindow = wallTicks.slice(lastDailySampleIndex);
    lastDailySampleIndex = wallTicks.length;
    const newCreditsByJob: Record<string, number> = {};
    // Cumulative job totals are retained in the report; per-day counts come from this day's event log.
    const dailyEvents: Record<string, unknown> = {
      kind: 'daily-summary', day: measuredDay, calendarDay: getAbsoluteCalendarDay(world.tick),
      tick: world.tick, residents: players.length, activeWorkers: players.filter(p => p.workerBuildingId != null).length,
      newCreditsToday, botActionsToday: newBotActionsToday,
    };
    // Per-job daily deltas come from observed history increments.
    for (const [job, count] of careerByJob) {
      const earlier = (dailySnapshots[dailySnapshots.length - 1]?.creditedByJob ?? {})[job] ?? 0;
      newCreditsByJob[job] = count - earlier;
    }
    const snapshot = {
      day: measuredDay, calendarDay: getAbsoluteCalendarDay(world.tick), tick: world.tick,
      humans: players.length,
      housed: players.filter((p) => p.residenceBuildingId != null).length,
      workersAssigned: players.filter((p) => p.workerBuildingId != null).length,
      buildings: world.buildings.length,
      food: world.resources.food, wood: world.resources.wood,
      careerWorkers: careerWorkerIds.size,
      creditedDays: careerEventCount,
      newCreditsToday, newCreditsByJob,
      botActions: botActionCount, newBotActionsToday, botIdleHours,
      invariantErrors: errors.length,
      averageTickMs: tickWindow.reduce((sum, value) => sum + value, 0) / tickWindow.length,
      p95TickMs: percentile(tickWindow, 0.95),
      creditedByJob: Object.fromEntries(careerByJob),
    };
    dailySnapshots.push(snapshot);
    writeEvents([{ ...dailyEvents, ...snapshot }]);
    previousDayCredits = careerEventCount;
    previousDayBotActions = botActionCount;

    if (errors.length || world.paused || world.tick !== firstTick + step) {
      throw new Error('Day ' + measuredDay + ': invalid simulation (tick=' + world.tick +
        ', invariantErrors=' + errors.length + '): ' + errors.slice(0, 5).join('; '));
    }
    if (DAYS <= 2 || measuredDay % 10 === 0 || measuredDay === DAYS) {
      console.log('[colony] day=' + measuredDay + '/' + DAYS +
        ' humans=' + players.length + ' housed=' + snapshot.housed +
        ' assigned=' + snapshot.workersAssigned + ' buildings=' + world.buildings.length +
        ' workedDays=' + careerEventCount + ' (+ ' + newCreditsToday + ')' +
        ' botActions=' + botActionCount + ' tick_p95=' + snapshot.p95TickMs.toFixed(2) + 'ms');
    }
  }

  const totalWall = wallTicks.reduce((sum, value) => sum + value, 0);
  const totalBot = botTicks.reduce((sum, value) => sum + value, 0);
  const creditedDays = careerCredits(world) - measuredCareerBaseline;
  if (creditedDays !== careerEventCount) {
    throw new Error('Career audit mismatch: entity history delta=' + creditedDays +
      ' vs recorded career events=' + careerEventCount);
  }
  if (EXPECT_CAREER && (creditedDays <= 0 || careerWorkerIds.size === 0)) {
    throw new Error('Vacuous career benchmark: no observed shifts credited during real simulation');
  }
  const report = {
    version: 4,
    scenario: 'producers-virtual-player',
    seed: SEED, populationTarget: POPULATION, days: DAYS,
    ticks: wallTicks.length, warmup: WARMUP,
    ticksPerHour: TICKS_PER_HOUR, ticksPerDay: TICKS_PER_DAY,
    node: process.version, platform: process.platform, arch: process.arch,
    viewportFocus: focus != null,
    initialPopulation: POPULATION, finalPopulation: livingPlayers(world).length,
    finalBuildings: world.buildings.length,
    botActions: botActionCount, botAttemptHours, botIdleHours,
    botByOperation: Object.fromEntries(botByOperation),
    creditedDays, careerEventCount, careerWorkers: careerWorkerIds.size,
    careerByJob: Object.fromEntries(careerByJob),
    eventLogPath,
    invariantErrors: invariantCount,
    averageMs: totalWall / wallTicks.length,
    averageCpuMs: cpuTicks.reduce((sum, value) => sum + value, 0) / cpuTicks.length,
    p50Ms: percentile(wallTicks, 0.5), p95Ms: percentile(wallTicks, 0.95),
    p99Ms: percentile(wallTicks, 0.99), maxMs: Math.max(...wallTicks),
    ticksPerSecond: wallTicks.length * 1000 / (totalWall + totalBot),
    averageBotMs: totalBot / botTicks.length,
    daySnapshots: dailySnapshots,
  };
  writeEvents([{
    kind: 'finish', tick: world.tick, finalPopulation: report.finalPopulation,
    careerWorkers: report.careerWorkers, creditedDays, careerByJob: report.careerByJob,
    botActions: botActionCount, botByOperation: report.botByOperation,
    invariantErrors: invariantCount,
  }]);
  writeFileSync(REPORT!, JSON.stringify(report, null, 2) + '\n');
  console.log('PERF_COLONY_RESULT ' + JSON.stringify({
    target: POPULATION, days: DAYS, averageMs: report.averageMs, p95Ms: report.p95Ms,
    finalPopulation: report.finalPopulation, creditedDays,
    careerWorkers: careerWorkerIds.size, careerByJob: report.careerByJob,
    botActions: botActionCount, botByOperation: report.botByOperation,
    invariantErrors: invariantCount, eventLogPath,
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
