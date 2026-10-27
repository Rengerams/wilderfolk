/**
 * Save inspector — what is in this `.json`, and why does it load (or not)?
 *
 * Written for the 2026-09-16 “savegame failed loading” report: the game collapses every
 * load failure into a player-facing guess, so a sent-in save has to be run through the
 * real path outside the browser to see the failing step.
 *
 * Usage: npx tsx scripts/inspect-save.mts <save.json> [--days=N] [--shifts]
 *
 * `--days=N` walks the sim forward on the walkability grid; `--shifts` censuses one week of
 * attendance per trade. Both unpause the loaded world first.
 */
import { readFileSync } from 'node:fs';
import { describeSaveReadFailure, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { BuildingType, EntityType, JobType, PATH_CELL } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import {
  getAbsoluteCalendarDay,
  getHourOfDay,
  getWeekdayLabel,
  isStartOfClockHour,
} from '../src/game/dayCycleClock';
import { gameTick } from '../src/game/gameTick';
import { getPathGrid, type PathGrid } from '../src/game/pathfinding';
import { isWalkableTerrainType, tileAt, Walkability } from '../src/game/terrain/terrainGrid';
import { isPlayerHuman } from '../src/game/playerHuman';
import { humanDisplayName } from '../src/game/citizenId';
import { prisonGuardIds } from '../src/game/prisonGuardDuty';
import {
  prisonRoster,
  shiftCoversHour,
  vacantPrisonShifts,
} from '../src/game/prisonShifts';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { isNearBuilding } from '../src/game/simulation/humanRelationships';
import { isAsleepAtHome } from '../src/game/humanSchedule';
import { ticksForDays } from '../src/game/dayCycleClock';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/inspect-save.mts <save.json>');
  process.exit(2);
}

const text = readFileSync(file, 'utf8');
console.log(`file ${file}`);
console.log(`size ${text.length} bytes`);

let raw: Record<string, unknown> | undefined;
try {
  raw = JSON.parse(text) as Record<string, unknown>;
} catch (e) {
  console.log(`JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`);
}

if (raw) {
  console.log(
    `_version=${String(raw._version)} · _ticksPerDay=${String(raw._ticksPerDay)} · _savedAt=${String(raw._savedAt)}`,
  );
  const map = raw.worldMap as Record<string, unknown> | undefined;
  console.log(
    `worldMap: ${map ? `size=${String(map.size)} ${String(map.width)}x${String(map.height)} seed=${String(map.seed)} compact=${String(map._compact ?? false)}` : 'absent'}`,
  );
  const entities = Array.isArray(raw.entities) ? (raw.entities as Record<string, unknown>[]) : [];
  const buildings = Array.isArray(raw.buildings) ? (raw.buildings as Record<string, unknown>[]) : [];
  const countType = (type: string): number => entities.filter((e) => e.type === type).length;
  console.log(
    `entities=${entities.length} (humans=${countType(EntityType.Human)} grass=${countType(EntityType.Grass)} trees=${countType(EntityType.Tree)} wildlife=${
      entities.length - countType(EntityType.Human) - countType(EntityType.Grass) - countType(EntityType.Tree)
    })`,
  );
  console.log(`buildings=${buildings.length} tick=${String(raw.tick)} day=${Number(raw.tick ?? 0) / TICKS_PER_DAY}`);
  console.log(`save keys: ${Object.keys(raw).length} present`);

  const missingWorldKeys = WORLD_STATE_SAVE_KEYS.filter((key) => !(key in raw));
  if (missingWorldKeys.length) console.log(`world keys absent from the file: ${missingWorldKeys.join(', ')}`);

  const humans = entities.filter((e) => e.type === EntityType.Human);
  for (const field of ENTITY_PERSISTED_FIELDS) {
    const missing = humans.filter((human) => !(field in human)).length;
    if (missing) console.log(`entity field "${field}" absent on ${missing}/${humans.length} humans`);
  }
}

const parsed = parseSaveJson(text);
if (!parsed.valid) {
  console.log(`\nREFUSED at parse: ${parsed.reason} — ${describeSaveReadFailure(parsed)}`);
  process.exit(1);
}
console.log('\nparsed OK — attempting the full restore (a thrown step prints below)…');
const loaded = loadGameFromParsed(parsed.parsed);
if (!loaded) {
  console.log('\nRESULT: load returned null — the "Save load failed:" line above is the failing step.');
  process.exit(1);
}
console.log(
  `\nRESULT: loaded · tick=${loaded.world.tick} entities=${loaded.world.entities.length} buildings=${loaded.world.buildings.length} humans=${loaded.world.humanPopulation}`,
);

const loadedMap = loaded.world.worldMap;
if (!loadedMap) {
  console.log('worldMap: absent after load');
} else {
  const tilePx = loaded.world.width / loadedMap.width;
  console.log(
    `world state ${loaded.world.width}x${loaded.world.height} px · worldMap ${loadedMap.width}x${loadedMap.height} tiles · tile = ${tilePx} px`,
  );
  const expectedTilesX = Math.ceil(loaded.world.width / PATH_CELL);
  const expectedTilesY = Math.ceil(loaded.world.height / PATH_CELL);
  const matches = loadedMap.width === expectedTilesX && loadedMap.height === expectedTilesY;
  console.log(
    `expected ${expectedTilesX}x${expectedTilesY} tiles for that world size — ${matches ? 'MATCHES' : 'MISMATCH: the valley was regenerated at the wrong scale'}`,
  );
  const outOfBounds = loaded.world.entities.filter(
    (e) => e.x > loadedMap.width * PATH_CELL || e.y > loadedMap.height * PATH_CELL,
  ).length;
  console.log(`entities outside the restored map: ${outOfBounds}/${loaded.world.entities.length}`);
  reportGroundAudit(loaded.world, loadedMap);
}

/**
 * Where the colony stands on the walkability grid, and — with `--days=N` — whether it walks onto
 * ground the grid blocks. The owner's "they just walk over water … and over walls" arrives as a
 * save, so this is the read-only half of that report: water, reserved decor and a completed wall's
 * footprint all read as blocked by the same owner the movement path asks.
 */
function reportGroundAudit(world: WorldState, map: NonNullable<WorldState['worldMap']>): void {
  const grid: PathGrid = getPathGrid(map, world.buildings);
  const census = new Map<string, number>();
  for (const building of world.buildings) {
    census.set(building.type, (census.get(building.type) ?? 0) + 1);
  }
  console.log(
    `buildings by type: ${[...census.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}=${count}`)
      .join(' ')}`,
  );

  const livingSettlers = (): Entity[] =>
    world.entities.filter((entity) => entity.alive && isPlayerHuman(entity));

  /**
   * Does the regenerated ground still fit what the save placed on it?
   *
   * A compact save regenerates the whole valley from seed/preset/size and re-applies only the sparse
   * overrides, so a change to the generator moves every river and coast in an existing save. The
   * save's own placements are the witnesses: a Fishing Spot's rule requires water inside its
   * footprint, and no building may be placed on water at all.
   */
  const waterAt = (x: number, y: number): boolean => {
    const tx = Math.floor(x / PATH_CELL);
    const ty = Math.floor(y / PATH_CELL);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return false;
    const idx = ty * grid.cols + tx;
    // The raw L0 grid, not `grid.blocked`: that copy also carries a completed wall's footprint, so a
    // building standing beside a wall would read as standing on water.
    if (map.pathGrid) return map.pathGrid[idx] === Walkability.Water;
    const tile = tileAt(map, tx, ty);
    return !!tile && !isWalkableTerrainType(tile.type);
  };
  const footprintHasWater = (building: Building): boolean => {
    for (let y = building.y; y <= building.y + building.height; y += PATH_CELL / 2) {
      for (let x = building.x; x <= building.x + building.width; x += PATH_CELL / 2) {
        if (waterAt(x, y)) return true;
      }
    }
    return false;
  };
  let waterCells = 0;
  if (map.pathGrid) {
    for (let i = 0; i < map.pathGrid.length; i++) if (map.pathGrid[i] === Walkability.Water) waterCells++;
  } else {
    for (let ty = 0; ty < grid.rows; ty++) {
      for (let tx = 0; tx < grid.cols; tx++) {
        const tile = tileAt(map, tx, ty);
        if (tile && !isWalkableTerrainType(tile.type)) waterCells++;
      }
    }
  }
  console.log(
    `restored ground: ${waterCells}/${grid.cols * grid.rows} water cells (${((waterCells / (grid.cols * grid.rows)) * 100).toFixed(1)} %)`,
  );

  const onWater = world.buildings.filter(
    (building) =>
      building.completed
      && building.type !== BuildingType.Bridge
      && footprintHasWater(building),
  );
  console.log(
    `completed buildings whose footprint is now on water (placement forbids that): ${onWater.length}/${world.buildings.length}`,
  );
  for (const building of onWater.slice(0, 8)) {
    console.log(`  ${building.type} #${building.id} at ${building.x.toFixed(0)},${building.y.toFixed(0)}`);
  }
  const fishing = world.buildings.filter((building) => building.type === BuildingType.FishingSpot);
  const dryFishing = fishing.filter((building) => !footprintHasWater(building));
  console.log(`fishing spots with no water under them (their own rule requires it): ${dryFishing.length}/${fishing.length}`);
  for (const building of dryFishing.slice(0, 8)) {
    console.log(`  fishingSpot #${building.id} at ${building.x.toFixed(0)},${building.y.toFixed(0)}`);
  }
  const flora = world.entities.filter(
    (entity) => entity.alive && (entity.type === EntityType.Grass || entity.type === EntityType.Tree),
  );
  const drowned = flora.filter((entity) => waterAt(entity.x, entity.y));
  console.log(
    `flora standing on restored water (worldgen scatters it on land): ${drowned.length}/${flora.length}`,
  );

  /** What blocks a tile: a completed wall's footprint, water, or the decor the L3 pass reserved. */
  const walls = world.buildings.filter(
    (building) => building.type === BuildingType.Wall && building.completed && building.faction !== 'rival',
  );
  const blockerAt = (entity: Entity): 'wall' | 'water' | 'decor' | null => {
    const tx = Math.floor(entity.x / PATH_CELL);
    const ty = Math.floor(entity.y / PATH_CELL);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) return null;
    if (grid.blocked[ty * grid.cols + tx] !== 1) return null;
    for (const wall of walls) {
      if (
        entity.x >= wall.x && entity.x <= wall.x + wall.width
        && entity.y >= wall.y && entity.y <= wall.y + wall.height
      ) {
        return 'wall';
      }
    }
    const tile = tileAt(map, tx, ty);
    return tile && !isWalkableTerrainType(tile.type) ? 'water' : 'decor';
  };
  const blockedAt = (entity: Entity): boolean => blockerAt(entity) !== null;

  const standing = livingSettlers().filter(blockedAt);
  const tally = { wall: 0, water: 0, decor: 0 };
  console.log(`settlers standing on blocked ground at load: ${standing.length}/${livingSettlers().length}`);
  for (const entity of standing) {
    const kind = blockerAt(entity);
    if (kind) tally[kind]++;
    const tile = tileAt(map, Math.floor(entity.x / PATH_CELL), Math.floor(entity.y / PATH_CELL));
    const tag = kind === 'wall' ? 'INSIDE A WALL' : kind === 'water' ? 'IN WATER' : 'on decor';
    console.log(
      `  ${tag} #${entity.id} ${humanDisplayName(entity)} ${entity.x.toFixed(0)},${entity.y.toFixed(0)} tile=${tile?.type ?? 'none'} job=${String(entity.job ?? '-')}`,
    );
  }
  console.log(`  … of which in water=${tally.water}, inside a wall=${tally.wall}, on reserved decor=${tally.decor}`);

  const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
  const days = daysArg ? Number(daysArg.slice('--days='.length)) : 0;
  if (!Number.isFinite(days) || days <= 0) return;

  // A load deliberately restores the world paused (`saveLoad`: `paused: true`), and `gameTick` returns
  // immediately on that flag — so a run that does not clear it measures a frozen colony and reports a
  // clean zero. Say so, then unpause.
  if (world.paused) console.log('  (the load restores the world paused — unpausing to run)');
  world.paused = false;

  let previous = new Set(standing.map((entity) => entity.id));
  let steps = 0;
  const walkers = new Set<number>();
  for (let day = 0; day < days; day++) {
    // A "0 steps onto blocked ground" reading is only worth something if the colony walked at all
    // that day, so the movers are counted beside it — a frozen population would report 0 too.
    const movers = new Set<number>();
    const startX = new Map<number, number>();
    const startY = new Map<number, number>();
    for (const entity of livingSettlers()) {
      startX.set(entity.id, entity.x);
      startY.set(entity.id, entity.y);
    }
    for (let tick = 0; tick < TICKS_PER_DAY; tick++) {
      gameTick(world);
      const now = new Set<number>();
      for (const entity of livingSettlers()) {
        if (blockedAt(entity)) now.add(entity.id);
        if (
          Math.hypot(entity.x - (startX.get(entity.id) ?? entity.x), entity.y - (startY.get(entity.id) ?? entity.y)) > 1
        ) {
          movers.add(entity.id);
        }
      }
      for (const id of now) {
        if (!previous.has(id)) {
          steps++;
          walkers.add(id);
        }
      }
      previous = now;
    }
    console.log(
      `  day ${day + 1}: tick ${world.tick} · ${movers.size} settler(s) walked · ${previous.size} on blocked ground · ${steps} step(s) onto it so far`,
    );
  }
  console.log(`walked onto blocked ground over ${days} day(s): ${steps} step(s), ${walkers.size} settler(s)`);
  const stillStuck = livingSettlers().filter(blockedAt);
  console.log(`still on blocked ground after ${days} day(s): ${stillStuck.length}`);
  for (const entity of stillStuck.slice(0, 10)) {
    const kind = blockerAt(entity);
    const tile = tileAt(map, Math.floor(entity.x / PATH_CELL), Math.floor(entity.y / PATH_CELL));
    console.log(
      `  ${kind ?? '?'} #${entity.id} ${humanDisplayName(entity)} ${entity.x.toFixed(0)},${entity.y.toFixed(0)} tile=${tile?.type ?? 'none'} job=${String(entity.job ?? '-')}`,
    );
  }
}

/** The trades the attendance census samples, with the duty window each one is paid for. */
const CENSUS_TRADES: ReadonlyArray<{ job: JobType; window: string }> = [
  { job: JobType.Official, window: 'workday' },
  { job: JobType.Priest, window: 'workday, plus the full-moon night' },
  { job: JobType.PrisonGuard, window: 'rostered watch, all 24 h' },
  { job: JobType.Innkeeper, window: 'tavern 17-23' },
  { job: JobType.Hotelier, window: 'hotel 06-22' },
];

/**
 * `--shifts`: one week of the loaded colony, sampled at 23:00 — does each trade record attendance?
 *
 * `scheduleWorkedTicksToday` is the live accumulator the day boundary settles into
 * `scheduleLastWorkedHours`, so a trade that reads zero at every sample never recorded a shift.
 * The load restores `paused: true` and `gameTick` returns immediately on that flag, so the flag is
 * cleared first: without that the whole week reads a clean zero and proves nothing.
 */
function reportShiftAttendanceCensus(world: WorldState): void {
  if (world.paused) {
    console.log('  (the load restores the world paused — unpausing to run)');
    world.paused = false;
  }

  const sampleHour = 23;
  console.log(`\nshift attendance census — sampled at ${String(sampleHour).padStart(2, '0')}:00, ${TICKS_PER_HOUR} ticks per hour`);
  console.log('  day  weekday  trade         n   ticksToday  h today  lastWorkedHours  window');
  for (let day = 0; day < 7; day++) {
    for (let step = 0; step < TICKS_PER_DAY; step++) {
      gameTick(world);
      if (getHourOfDay(world.tick) !== sampleHour || !isStartOfClockHour(world.tick)) continue;
      for (const trade of CENSUS_TRADES) {
        const crew = world.entities.filter(
          (entity) => entity.alive && isPlayerHuman(entity) && !entity.isJuvenile && entity.job === trade.job,
        );
        let ticksSum = 0;
        let settledSum = 0;
        for (const entity of crew) {
          ticksSum += entity.scheduleWorkedTicksToday ?? 0;
          settledSum += entity.scheduleLastWorkedHours ?? 0;
        }
        const ticks = crew.length > 0 ? ticksSum / crew.length : 0;
        const settled = crew.length > 0 ? settledSum / crew.length : 0;
        console.log(
          `  ${String(getAbsoluteCalendarDay(world.tick)).padStart(4)}  ${getWeekdayLabel(world.tick).padEnd(7)}  `
          + `${trade.job.padEnd(12)}  ${String(crew.length).padStart(3)}  `
          + `${ticks.toFixed(2).padStart(10)}  ${(ticks / TICKS_PER_HOUR).toFixed(2).padStart(7)}  `
          + `${settled.toFixed(2).padStart(15)}  ${trade.window}`,
        );
      }
    }
  }
}

if (process.argv.includes('--shifts')) reportShiftAttendanceCensus(loaded.world);

/** The post radius the presence sampler uses, read once so the report states the same number. */
const POST_RADIUS_PX = 55;

/** One recorded unguarded hour: which prison, when, and why nobody stood on the post. */
interface UnguardedHour {
  prisonId: number;
  day: number;
  hour: number;
  reason: string;
}

/** Distance from a settler to a building's centre — the measure `isNearBuilding` tests. */
function distanceToCentre(entity: Entity, building: Building): number {
  return Math.hypot(
    entity.x - (building.x + building.width / 2),
    entity.y - (building.y + building.height / 2),
  );
}

/**
 * Why nobody stood on the post this hour. Read-only: every fact comes from the owners the sampler
 * itself reads, so the report cannot disagree with the roll it is explaining.
 */
function unguardedReason(
  world: WorldState,
  prison: Building,
  guardIds: readonly number[],
  hour: number,
): string {
  if (guardIds.length === 0) return 'no guard assigned to the prison';
  const onPost = guardIds.filter((id) => {
    const guard = world.entities.find((e) => e.id === id && e.alive);
    return guard != null && isNearBuilding(guard, prison, POST_RADIUS_PX);
  });
  if (onPost.length > 0) return 'a guard stood on the post (not recorded by the code)';
  const roster = prisonRoster(guardIds, world.tick);
  const covering = roster.filter((entry) => entry.guardId != null && shiftCoversHour(entry.shift, hour));
  if (covering.length === 0) {
    return vacantPrisonShifts(roster).length > 0
      ? `no shift staffed at ${hour}:00 (${vacantPrisonShifts(roster).length} vacant)`
      : 'no roster shift covers this hour';
  }
  const states: string[] = [];
  for (const entry of covering) {
    const guard = world.entities.find((e) => e.id === entry.guardId && e.alive);
    if (!guard) continue;
    const dist = distanceToCentre(guard, prison);
    const moving = Math.hypot(guard.vx ?? 0, guard.vy ?? 0) > 0.01;
    const asleep = isAsleepAtHome(guard, world.buildings, hour);
    states.push(
      `${entry.shift.key} guard #${guard.id} ${dist.toFixed(0)}px ${moving ? 'walking' : 'standing'}`
      + `${asleep ? ' asleep at home' : ''}`,
    );
  }
  if (states.length === 0) return 'the rostered guard is missing or dead';
  const walking = states.some((state) => state.includes('walking'));
  const asleep = states.some((state) => state.includes('asleep'));
  if (asleep) return `the on-duty guard was asleep at home (${states.join('; ')})`;
  if (walking) return `the on-duty guard was walking, ${POST_RADIUS_PX}px from the post (${states.join('; ')})`;
  return `the on-duty guard stood away from the post (${states.join('; ')})`;
}

/** One prisoner, shaped the way the arrest path shapes one (no job, no home, a long sentence). */
function imprisonForWatch(world: WorldState, prison: Building, settler: Entity): void {
  world.buildings.forEach((building) => {
    if (building.occupants?.includes(settler.id)) {
      building.occupants = building.occupants.filter((id) => id !== settler.id);
    }
  });
  settler.workerBuildingId = undefined;
  settler.residenceBuildingId = undefined;
  settler.job = JobType.Settler;
  settler.occupation = 'settler';
  settler.prisonBuildingId = prison.id;
  settler.prisonSentenceCrime = 'scandal';
  settler.prisonerUntilTick = world.tick + ticksForDays(30);
  settler.x = prison.x + 4;
  settler.y = prison.y + 10;
  settler.vx = 0;
  settler.vy = 0;
  if (!prison.occupants.includes(settler.id)) prison.occupants.push(settler.id);
}

/**
 * `--prison=DAYS`: runs the loaded colony forward and reports what the escape rule actually does.
 *
 * A load has no prisoners, so the watch lends each staffed Prison one prisoner per day — the arrest
 * path's own shape — which is the state the roll needs to be measurable at all.
 */
function reportPrisonEscapeWatch(world: WorldState, days: number): void {
  if (world.paused) {
    console.log('  (the load restores the world paused — unpausing to run)');
    world.paused = false;
  }

  const prisons = (): Building[] =>
    world.buildings.filter(
      (b) => b.completed && b.type === BuildingType.Prison && b.faction !== 'rival'
        && (b.occupants ?? []).length > 0,
    );

  console.log(`\nprison escape watch — ${days} day(s) from tick ${world.tick}`);
  console.log('  prisons at load (completed, player, occupied):');
  for (const prison of prisons()) {
    const guards = prisonGuardIds(world, prison.occupants ?? []);
    const roster = prisonRoster(guards, world.tick);
    console.log(
      `    #${prison.id} at ${prison.x},${prison.y} · occupants ${(prison.occupants ?? []).length}`
      + ` · guards ${guards.length} (cap ${BUILDING_CONFIGS[BuildingType.Prison].maxOccupants} slots)`
      + ` · roster ${roster.map((r) => `${r.shift.key}:${r.guardId ?? '-'}`).join(' ')}`,
    );
  }

  const used = new Set<number>();
  let rolls = 0;
  let sampled = 0;
  const unguarded: UnguardedHour[] = [];
  const escapeMessages: string[] = [];
  const logStart = world.eventLog.length;
  const running = new Map<number, Set<number>>();
  const dayRows: string[] = [];

  for (let day = 0; day < days; day++) {
    // A prisoner per staffed prison: without one the sampler and the roll both skip the building.
    for (const prison of prisons()) {
      if (prisonGuardIds(world, prison.occupants ?? []).length === 0) continue;
      if (world.entities.some((e) => e.alive && e.prisonBuildingId === prison.id)) continue;
      const settler = world.entities.find(
        (e) => e.alive && isPlayerHuman(e) && !e.isJuvenile && e.job !== JobType.PrisonGuard
          && e.prisonBuildingId == null && e.workerBuildingId == null && !used.has(e.id),
      );
      if (!settler) continue;
      used.add(settler.id);
      imprisonForWatch(world, prison, settler);
    }

    let daySamples = 0;
    let dayRolls = 0;
    for (let step = 0; step < TICKS_PER_DAY; step++) {
      gameTick(world);
      // The roll runs in the daily layer of the boundary tick and clears the list there, so the hour
      // it sampled for the new day is the one this observation cannot see.
      const rolledNow = world.tick % TICKS_PER_DAY === 0;
      for (const prison of world.buildings) {
        if (prison.type !== BuildingType.Prison || prison.faction === 'rival') continue;
        const set = running.get(prison.id) ?? new Set<number>();
        for (const hour of prison.uncoveredPrisonHours ?? []) {
          if (set.has(hour)) continue;
          set.add(hour);
          daySamples++;
          sampled++;
          unguarded.push({
            prisonId: prison.id,
            day: getAbsoluteCalendarDay(world.tick),
            hour,
            reason: unguardedReason(
              world,
              prison,
              prisonGuardIds(world, prison.occupants ?? []),
              hour,
            ),
          });
        }
        running.set(prison.id, set);
        if (!rolledNow) continue;
        // The roll's own hour set: the day's samples unioned with every vacant shift's hours.
        const guards = prisonGuardIds(world, prison.occupants ?? []);
        const roster = prisonRoster(guards, world.tick);
        const vacantHours = new Set<number>();
        for (const entry of roster) {
          if (entry.guardId != null) continue;
          for (let hour = 0; hour < 24; hour++) {
            if (shiftCoversHour(entry.shift, hour)) vacantHours.add(hour);
          }
        }
        const held = world.entities.some((e) => e.alive && e.prisonBuildingId === prison.id);
        const rolled = held ? new Set<number>([...set, ...vacantHours]).size : 0;
        dayRolls += rolled;
        rolls += rolled;
        set.clear();
      }
    }
    for (const event of world.eventLog.slice(logStart)) {
      if (event.message.includes('slipped out') && !escapeMessages.includes(event.message)) {
        escapeMessages.push(event.message);
      }
    }
    dayRows.push(
      `  day ${String(day + 1).padStart(2)}  tick ${String(world.tick).padStart(6)}`
      + `  sampled hours ${String(daySamples).padStart(2)}  escape rolls ${String(dayRolls).padStart(2)}`
      + `  prisoners held ${String(world.entities.filter((e) => e.alive && e.prisonBuildingId != null).length).padStart(2)}`,
    );
  }
  for (const row of dayRows) console.log(row);

  const hours = new Map<number, number>();
  for (const sample of unguarded) hours.set(sample.hour, (hours.get(sample.hour) ?? 0) + 1);
  const reasons = new Map<string, number>();
  for (const sample of unguarded) {
    const key = sample.reason.replace(/#\d+/g, '#N').replace(/\d+px/g, 'Npx');
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const perPrison = new Map<number, number>();
  for (const sample of unguarded) perPrison.set(sample.prisonId, (perPrison.get(sample.prisonId) ?? 0) + 1);

  console.log(`  unguarded hours recorded: ${sampled} over ${days} day(s) — ${(sampled / days).toFixed(2)}/day`);
  console.log(`  escape rolls: ${rolls} — ${(rolls / days).toFixed(2)}/day`);
  console.log(`  escapes: ${escapeMessages.length} — ${(escapeMessages.length / days).toFixed(3)}/day`
    + ` (${(escapeMessages.length / days * 360).toFixed(1)}/year)`);
  for (const message of escapeMessages) console.log(`    ${message}`);
  console.log(`  unguarded hours per prison: ${[...perPrison.entries()].map(([id, n]) => `#${id}=${n}`).join(' ') || 'none'}`);
  console.log(`  unguarded hours by clock hour: ${[...hours.entries()].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${String(h).padStart(2, '0')}h=${n}`).join(' ') || 'none'}`);
  console.log('  why:');
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(4)}  ${reason}`);
  }
  console.log(`  entities kept as watch prisoners: ${used.size}`);
}

const prisonArg = process.argv.find((arg) => arg.startsWith('--prison'));
if (prisonArg) {
  const days = Number(prisonArg.split('=')[1] ?? 30);
  reportPrisonEscapeWatch(loaded.world, Number.isFinite(days) && days > 0 ? days : 30);
}
