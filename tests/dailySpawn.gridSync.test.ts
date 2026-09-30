/**
 * S-1/S-2 of the 2026-09-20 audit: daily-layer spawns that bypass the canonical spawn primitive.
 *
 * `gameTick` builds the tick's authoritative entity list *before* the daily layer runs and only
 * drains `ctx.newEntities` into it afterwards, so a daily spawn that hand-rolls
 * `state.entities.push(...)` / `allAlive.push(...)` stays invisible to the spatial grids (and to the
 * worker delta) for the rest of the tick. The daily immigrant path and the wildlife replenisher
 * already route through `pushNewEntity`; these tests pin the autumn herd (S-1b, fixed), the
 * emergency grass patches (S-2, fixed) and the yearly world events still owned by the `groupEvents`
 * lane (S-1a, expected red until that lane lands).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EntityType, MapSize, TerrainType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { EntitySpatialGrid } from '../src/game/spatialGrid';
import { gameTick, initGame } from '../src/game/gameEngine';
import { replenishDepletedWildlife } from '../src/game/worldGen';
import { HERD_BASE_SIZE, migrationArrivalDay, tickMigration } from '../src/game/migration';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { pushNewEntity } from '../src/game/simulation/simulationEntities';
import { rebakeTerrainGrids, setTileOverride } from '../src/game/terrain/terrainGrid';

const WIDTH = 1200;
const HEIGHT = 900;
/** Seed whose first `migration` draw picks a herd edge on this fixture. */
const HERD_SEED = 7;
/** Known-good first candidate for the yearly-event search below (kept first so the search is cheap). */
const WORLD_EVENT_SEED_CANDIDATES = [3];
const WORLD_EVENT_SEED_LIMIT = 40;

afterEach(() => {
  resetSimRng();
});

/** The membership assertion `tests/dailyImmigration.gridSync.test.ts` uses. */
function gridContains(grid: EntitySpatialGrid, entity: Entity): boolean {
  const found: number[] = [];
  grid.forEachInRadius(entity.x, entity.y, 8, (candidate) => found.push(candidate.id));
  return found.includes(entity.id);
}

function missingFromGrid(grid: EntitySpatialGrid | undefined, entities: Entity[]): string[] {
  return entities
    .filter((entity) => !grid || !gridContains(grid, entity))
    .map((entity) => `${entity.type}#${entity.id}${grid ? '' : ' (no grid)'}`);
}

function ids(list: Entity[]): number[] {
  return list.map((entity) => entity.id).sort((a, b) => a - b);
}

/**
 * Minimal daily-layer fixture. `state.entities` and `allAlive` are the same array, exactly as
 * `gameTick` hands them to the daily layer, and there is no `worldMap`, so the shared wildlife
 * passability predicate accepts every edge position (the herd places without nudging).
 */
function herdFixture(): {
  state: WorldState;
  ctx: TickContext;
  allAlive: Entity[];
  mobileGrid: EntitySpatialGrid;
} {
  const allAlive: Entity[] = [];
  const state = {
    entities: allAlive,
    tick: 0,
    year: 0,
    dayInYear: 0,
    width: WIDTH,
    height: HEIGHT,
    nextEntityId: 100,
    eventLog: [],
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
  } as unknown as WorldState;

  const mobileGrid = new EntitySpatialGrid(WIDTH, HEIGHT, 128);
  const ctx = {
    width: WIDTH,
    height: HEIGHT,
    newEntities: [],
    entityById: new Map<number, Entity>(),
    mobileGrid,
  } as unknown as TickContext;

  return { state, ctx, allAlive, mobileGrid };
}

/** One real tick forced onto the yearly world-event roll (year 2, even, not rolled yet). */
function tickWithYearlyWorldEvent(seed: number): { world: WorldState; before: Set<number> } {
  setSimSeed(seed);
  // `MapSize` has no `Small` member (`gameTypes.MapSize` is Medium | Large | Huge), so asking for one
  // passed `undefined` and `initGame`'s default silently built a **Medium** 1200×900 world — the
  // fixture read as a small map and never was one (2026-09-20 audit, T-1 root cause 1). Name what it
  // actually builds.
  const world = initGame({ size: MapSize.Medium, seed });
  setSimSeed(seed);
  // `gameTick` derives `dayInYear` from the tick and only advances `year` on a day-0 rollover, so
  // both are set directly: day 500 of year 2 is a plain daily tick that still owes its yearly event.
  world.tick = 500 * TICKS_PER_DAY - 1;
  world.year = 2;
  world.dayInYear = DAYS_PER_YEAR / 2 - 40;
  world.lastEventYear = 0;
  // Keep the unrelated first-week visitor from claiming `activeEvent` on this synthetic day.
  world.firstWeekVisitorSpawned = true;

  const before = new Set(world.entities.map((entity) => entity.id));
  gameTick(world);
  return { world, before };
}

describe('daily spawns and the spatial grids (S-1/S-2)', () => {
  it('S-1b: every autumn-herd deer reaches mobileGrid and ctx.newEntities in its arrival tick', () => {
    const { state, ctx, allAlive, mobileGrid } = herdFixture();

    setSimSeed(HERD_SEED);
    const arrivalDay = migrationArrivalDay(state.worldMap?.seed, DAYS_PER_YEAR);
    state.tick = arrivalDay * TICKS_PER_DAY;
    state.dayInYear = arrivalDay % DAYS_PER_YEAR;

    tickMigration(state, allAlive, ctx);

    const herd = state.entities.filter(
      (entity) => entity.type === EntityType.Deer && entity.migrationTag === state.year,
    );
    expect(herd.length).toBe(HERD_BASE_SIZE);

    expect(missingFromGrid(mobileGrid, herd)).toEqual([]);
    expect(herd.filter((deer) => !ctx.newEntities.includes(deer)).map((deer) => deer.id)).toEqual([]);
  });

  it('S-2: every emergency grass patch reaches the onSpawn hook and ctx.newEntities', () => {
    const world = initGame({ size: MapSize.Medium, seed: 33 });
    // All-grassland tiles so all seven patch centres can place, plus a depleted denormalized grass
    // count and a healthy prey base so the replenisher takes the emergency-grass branch only.
    // Teraforge keeps no per-tile grid, so "grassland everywhere" is one override per tile — the
    // fields stay as generated and the overrides outrank them.
    if (world.worldMap) {
      const map = world.worldMap;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          setTileOverride(map, tx, ty, {
            type: TerrainType.Grassland, elevation: 30, moisture: 50, variation: 0,
          });
        }
      }
      rebakeTerrainGrids(map, { startTx: 0, endTx: map.width - 1, startTy: 0, endTy: map.height - 1 });
    }
    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 0,
      rabbits: 60,
      deer: 25,
      foxes: 20,
      wolves: 10,
    };

    const before = new Set(world.entities.map((entity) => entity.id));
    const hooked: Entity[] = [];
    const ctx = {
      newEntities: [],
      entityById: new Map<number, Entity>(),
    } as unknown as TickContext;

    // The production wiring from `dailyWorldEvents`: the hook is `pushNewEntity`.
    const changed = replenishDepletedWildlife(world, (entity) => {
      hooked.push(entity);
      pushNewEntity(world, ctx, entity);
    });

    expect(changed).toBe(true);

    const spawnedGrass = world.entities.filter(
      (entity) => entity.type === EntityType.Grass && !before.has(entity.id),
    );
    expect(spawnedGrass.length).toBeGreaterThan(0);

    expect(ids(hooked.filter((entity) => entity.type === EntityType.Grass))).toEqual(ids(spawnedGrass));
    expect(ids(ctx.newEntities.filter((entity) => entity.type === EntityType.Grass))).toEqual(ids(spawnedGrass));
  });

  // EXPECTED RED until the `groupEvents` lane routes its world-event spawns through the canonical
  // spawn path: `rollYearlyWorldEvent` still does `allAlive.push(x); indexLivingEntity(state, x);`,
  // so wolves/deer/grass/trees never reach `ctx.newEntities` or a grid in the tick they appear.
  //
  // The spawned types are asserted against their own grid (`mobileGrid` for wolves/deer, `grassGrid`
  // for grass, `treeGrid` for trees). Note for whoever lands that lane: `pushNewEntity` routes only
  // grass and mobile types, so trees additionally need the tree grid to be synced mid-tick
  // (`tickLayerRealtime` reconciles `treeGrid` from `byType` once per tick) — the tree assertion
  // below stays red until that is handled.
  it('S-1a: yearly world-event spawns reach the spatial grids (groupEvents lane)', () => {
    let fixture: { world: WorldState; before: Set<number> } | undefined;
    let eventId = '';
    const candidates = [
      ...WORLD_EVENT_SEED_CANDIDATES,
      ...Array.from({ length: WORLD_EVENT_SEED_LIMIT }, (_, index) => index + 1),
    ];

    for (const seed of candidates) {
      const candidate = tickWithYearlyWorldEvent(seed);
      const id = candidate.world.activeEvent?.id ?? '';
      if (id.startsWith('wolf_migration') || id.startsWith('nature_boom') || id.startsWith('deer_migration')) {
        fixture = candidate;
        eventId = id;
        break;
      }
    }

    if (!fixture) {
      throw new Error('fixture: no seed rolled a spawn-bearing yearly world event');
    }
    const { world, before } = fixture;
    const spawned = world.entities.filter((entity) => !before.has(entity.id));

    if (eventId.startsWith('wolf_migration')) {
      const wolves = spawned.filter((entity) => entity.type === EntityType.Wolf);
      expect(wolves.length).toBeGreaterThan(0);
      expect(missingFromGrid(world.mobileGrid, wolves)).toEqual([]);
      return;
    }

    if (eventId.startsWith('deer_migration')) {
      const deer = spawned.filter((entity) => entity.type === EntityType.Deer);
      expect(deer.length).toBeGreaterThan(0);
      expect(missingFromGrid(world.mobileGrid, deer)).toEqual([]);
      return;
    }

    const trees = spawned.filter((entity) => entity.type === EntityType.Tree);
    const grass = spawned.filter((entity) => entity.type === EntityType.Grass);
    expect(trees.length + grass.length).toBeGreaterThan(0);
    expect(missingFromGrid(world.grassGrid, grass)).toEqual([]);
    expect(missingFromGrid(world.treeGrid, trees)).toEqual([]);
  }, 120_000);
});
