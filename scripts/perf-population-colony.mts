import { appendFileSync, writeFileSync } from 'node:fs';
import { gameTick } from '../src/game/gameTick';
import { createEntity } from '../src/game/entityFactory';
import { BuildingType, BUILDING_CONFIGS } from '../src/game/buildings';
import { EntityType, MapPreset, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { getAbsoluteCalendarDay, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { isPlayerHuman } from '../src/game/playerHuman';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { buildEntityByType } from '../src/game/simFocus';
import { moveResident, syncResidenceOccupants } from '../src/game/housingPipeline';
import { assignWorkerTransition, syncJobBuildingOccupants } from '../src/game/workforce';
import { buildingAccessPoints } from '../src/game/buildingAccess';
import { beginCommuteRoutePass, isWithinAssignableCommute, quoteBuildingCommute, MAX_ASSIGNABLE_COMMUTE_HOURS } from '../src/game/commuteReach';
import { getCurrentPathGrid, getReadOnlyPathGrid, isGroundWalkableAt, setCurrentPathMap } from '../src/game/pathfinding';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { createBuilding } from '../src/game/worldGen';
import { updateStorageCaps } from '../src/game/economy';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { loadNames } from '../src/game/nameLoader';
import { getSimFocus } from './simFocus';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { prepareColonyWorld, createCompletedBuilding, findDryBenchmarkStart, applyColonyBotAction, collectInvariantErrors } from './colonyHealth';

// The same real gameTick + hourly VirtualPlayer command route used by run-full-year.mts.
// The setup is a one-time seeded, staffed colony: no free births, resources or buildings during measurement.
const POPULATION = Number(process.env.PERF_POPS ?? '250');
const DAYS = Number(process.env.PERF_DAYS ?? '360');
const SEED = Number(process.env.PERF_SEED ?? '12345');
const WARMUP = Number(process.env.PERF_WARMUP ?? '12');
const REPORT = process.env.PERF_REPORT;
const EXPECT_CAREER = process.env.PERF_EXPECT_CAREER === '1';

if (!Number.isSafeInteger(POPULATION) || POPULATION < 24 || POPULATION > 5000 ||
    !Number.isSafeInteger(DAYS) || DAYS < 1 || DAYS > 180 ||
    !Number.isSafeInteger(WARMUP) || WARMUP < 0 || WARMUP >= TICKS_PER_DAY ||
    !Number.isSafeInteger(SEED) || !REPORT) {
  throw new Error('Requires PERF_POPS=250|750|1800, PERF_DAYS=1..360, PERF_WARMUP=0..287, PERF_SEED and PERF_REPORT');
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
  // Current-world credits only: gameTick prunes dead/departed entities. The
  // benchmark separately archives removed entities' final history below.
  for (const entity of world.entities) {
    if (!entity.careerHistory) continue;
    for (const row of Object.values(entity.careerHistory)) total += row?.days ?? 0;
  }
  return total;
}

/** Rotate benchmark district geometry without changing building types or their owners. */
function rotateDistrictOffset(x: number, y: number, quarterTurns: number): { x: number; y: number } {
  switch (quarterTurns) {
    case 1: return { x: -y, y: x };
    case 2: return { x: -x, y: -y };
    case 3: return { x: y, y: -x };
    default: return { x, y };
  }
}

function prepareScaledColony(target: number): WorldState {
  // A 1,800-resident city needs a genuinely buildable contiguous mainland. The
  // Meadows preset is a real world-generation mode, not a bypass of water rules.
  // Both baseline and PR use this identical scenario and the same settlement
  // harness, while 250/750 residents retain their continental stress coverage.
  const preset = target >= 1800 ? MapPreset.Meadows : MapPreset.Continental;
  const prepared = prepareColonyWorld({
    size: MapSize.Huge, seed: SEED, scenario: 'producers', preset, preferConnectedStart: true,
  });
  const world = prepared.world;
  const founders = livingPlayers(world);
  const needed = target - founders.length;
  if (needed < 0) throw new Error('Requested population is below the founding population');
  const districtSize = 24;
  const districts = Math.ceil(needed / districtSize);
  const preferred = world.worldMap?.campSite ?? { x: world.width / 2, y: world.height / 2 };
  const scaledResidents: Entity[] = [];
  let spawned = 0;

  for (let district = 0; district < districts; district++) {
    // The full template (buildings plus genuine walk corridors) is the same on
    // baseline and PR; rotate it to fit irregular mainland and coastal terrain.
    const siteTypes: Array<readonly [BuildingType, number, number]> = [
      ...[0, 72, 144, 216].map((offset) => [BuildingType.House, offset, 0] as const),
      ...[0, 72, 144, 216].map((offset) => [BuildingType.Farm, offset, 95] as const),
      [BuildingType.LumberMill, 0, 185],
      [BuildingType.Quarry, 82, 185],
      [BuildingType.Market, 166, 185],
      [BuildingType.Tavern, 238, 185],
    ];
    if (district % 4 === 0) {
      siteTypes.push([BuildingType.Barn, 235, -72], [BuildingType.Silo, 170, -72]);
    }
    let choice: { center: { x: number; y: number }; orientation: number } | null = null;
    for (let orientation = 0; orientation < 4; orientation++) {
      const centreOffset = rotateDistrictOffset(120, 65, orientation);
      const districtSites = siteTypes.map(([type, offsetX, offsetY]) => {
        const point = rotateDistrictOffset(offsetX, offsetY, orientation);
        return {
          x: point.x - centreOffset.x, y: point.y - centreOffset.y,
          width: BUILDING_CONFIGS[type].width + 8,
          height: BUILDING_CONFIGS[type].height + 8,
        };
      });
      // One shared dry central lane and two cross-streets keep each row connected.
      for (const [px, py, width, height] of [
        [36, 92, 8, 192], [120, 55, 260, 8], [120, 140, 260, 8],
      ]) {
        const rotated = rotateDistrictOffset(px, py, orientation);
        districtSites.push({
          x: rotated.x - centreOffset.x, y: rotated.y - centreOffset.y,
          width: orientation % 2 ? height : width,
          height: orientation % 2 ? width : height,
        });
      }
      try {
        const center = findDryBenchmarkStart(world, preferred, districtSites, (spot) => {
          const origin = { x: spot.x - centreOffset.x, y: spot.y - centreOffset.y };
          const preview = siteTypes.map(([type, offsetX, offsetY], index) => {
            const point = rotateDistrictOffset(offsetX, offsetY, orientation);
            return { ...createBuilding(type, origin.x + point.x, origin.y + point.y, -index - 1), completed: true };
          });
          const grid = getReadOnlyPathGrid(world.worldMap!, [...world.buildings, ...preview]);
          const homes = preview.slice(0, 4);
          const jobs = preview.slice(4, 12);
          const checked = new Set<string>();
          let workerIndex = 0;
          for (const job of jobs) {
            for (let position = 0; position < BUILDING_CONFIGS[job.type].maxOccupants
              && workerIndex < districtSize; position++, workerIndex++) {
              const home = homes[Math.floor(workerIndex / 6)];
              const key = home.id + ':' + job.id;
              if (checked.has(key)) continue;
              checked.add(key);
              const quote = quoteBuildingCommute(home, job, SPECIES_CONFIG[EntityType.Human].speed, grid);
              if (quote.status !== 'priced' || quote.leadHours > MAX_ASSIGNABLE_COMMUTE_HOURS) return false;
            }
          }
          return true;
        });
        choice = { center, orientation };
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Benchmark map contains no unoccupied dry district plot')) throw error;
      }
    }
    if (!choice) throw new Error('No dry, routed district remains after ' + district + ' of ' + districts + ' districts');
    const centreOffset = rotateDistrictOffset(120, 65, choice.orientation);
    const origin = { x: choice.center.x - centreOffset.x, y: choice.center.y - centreOffset.y };
    const placed = siteTypes.map(([type, offsetX, offsetY]) => {
      const point = rotateDistrictOffset(offsetX, offsetY, choice.orientation);
      return createCompletedBuilding(world, type, origin.x + point.x, origin.y + point.y);
    });
    const homes = placed.slice(0, 4);
    const jobs: Building[] = placed.slice(4, 12);

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
      scaledResidents.push(settler);
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

  // Validate the same entrances and commute routes production uses before measuring.
  // Never start a benchmark resident in water or the solid centre of a house.
  setCurrentPathMap(world.worldMap, world.buildings);
  const pathGrid = getCurrentPathGrid();
  if (!pathGrid) throw new Error('Scaled benchmark has no navigation grid');
  const buildingById = new Map(world.buildings.map((site) => [site.id, site]));
  const checkedCommutes = new Set<string>();
  for (const resident of scaledResidents) {
    const home = buildingById.get(resident.residenceBuildingId ?? -1);
    if (!home) throw new Error('Scaled benchmark resident has no valid home');
    const entrances = buildingAccessPoints(home, pathGrid);
    if (entrances.length === 0) throw new Error('Scaled benchmark home has no usable entrance: ' + home.id);
    const entrance = entrances[resident.id % entrances.length];
    resident.x = entrance.x;
    resident.y = entrance.y;
    if (!isGroundWalkableAt(resident.x, resident.y, pathGrid)) {
      throw new Error('Scaled benchmark resident starts on blocked terrain: ' + resident.id);
    }
    const job = buildingById.get(resident.workerBuildingId ?? -1);
    if (!job) continue;
    const key = home.id + ':' + job.id;
    if (checkedCommutes.has(key)) continue;
    checkedCommutes.add(key);
    beginCommuteRoutePass();
    if (!isWithinAssignableCommute(
      resident, job, world.buildings, SPECIES_CONFIG[EntityType.Human].speed, buildingById,
    )) {
      throw new Error('Scaled benchmark has no genuine two-hour commute for ' + key);
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
  // gameTick removes dead/departed settlers from world.entities. Preserve their
  // final earned career days independently of the hourly workday-event audit.
  // This is a true lifetime sum, not a bypass of the equality assertion.
  let removedCareerCredits = 0;
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
    const entitiesBeforeTick = world.entities;
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
    // Keep an independent accounting of histories on entities that left the
    // authoritative world during this tick. These identities are not in the
    // final game state, but their credited workdays remain real.
    if (entitiesBeforeTick !== world.entities) {
      const currentIds = new Set(world.entities.map((entity) => entity.id));
      for (const entity of entitiesBeforeTick) {
        if (currentIds.has(entity.id) || !entity.careerHistory) continue;
        for (const row of Object.values(entity.careerHistory)) {
          removedCareerCredits += row?.days ?? 0;
        }
      }
    }
    const cpu = process.cpuUsage(cpuStart);
    if (step > WARMUP) {
      wallTicks.push(simMs);
      cpuTicks.push((cpu.user + cpu.system) / 1000);
      botTicks.push(botMs);
    } else if (step === WARMUP) {
      measuredCareerBaseline = careerCredits(world) + removedCareerCredits;
    }

    // Poll at most once per in-game hour: career days are credited in the midnight fatigue pass, so
    // hourly sampling keeps exact worker / job / site evidence without scanning every tick.
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
  const creditedDays = careerCredits(world) + removedCareerCredits - measuredCareerBaseline;
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
