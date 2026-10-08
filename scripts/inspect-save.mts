/**
 * Save inspector — what is in this `.json`, and why does it load (or not)?
 *
 * Written for the 2026-09-16 “savegame failed loading” report: the game collapses every
 * load failure into a player-facing guess, so a sent-in save has to be run through the
 * real path outside the browser to see the failing step.
 *
 * Usage: npx tsx scripts/inspect-save.mts <save.json>
 */
import { readFileSync } from 'node:fs';
import { describeSaveReadFailure, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { BuildingType, EntityType, PATH_CELL } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { gameTick } from '../src/game/gameTick';
import { getPathGrid, type PathGrid } from '../src/game/pathfinding';
import { isWalkableTerrainType, tileAt, Walkability } from '../src/game/terrain/terrainGrid';
import { isPlayerHuman } from '../src/game/playerHuman';
import { humanDisplayName } from '../src/game/citizenId';

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
