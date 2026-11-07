import { HUMAN_ADULT_MIN_AGE as HUMAN_CHILDHOOD_YEARS } from '../src/game/daycycleconstants';
/**
 * Reproduces the real host ↔ worker transport, `postMessage` serialization included, and compares
 * the two worlds field by field; `HOST_OR_CACHE_KEYS` is the authority for what is not compared.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initGame, createBuilding } from '../src/game/worldGen';
import { syncLeaderHouseResidency } from '../src/game/leaderHouse';
import { human, building } from '../src/test/factories';
import { gameTick } from '../src/game/gameTick';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import {
  applyWorkerCommand,
  extractCommandDelta,
} from '../src/game/simWorker/commands';
import {
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
} from '../src/game/worldRuntimeCaches';
import { adoptSimSeedFromWorld, resetSimRng } from '../src/game/simRng';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { getWorkSchedule } from '../src/game/workSchedule';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { getVenueSchedule } from '../src/game/venueSchedule';
import { EntityType, BuildingType, MapSize, type WorldState } from '../src/game/gameTypes';


const SEED = 4242;
const TICKS = 3 * TICKS_PER_DAY; // Advance three colony days across each daily phase.

/** Room for the two fixtures that carry whole colony days of state across the wire. */
const FIXTURE_TIMEOUT_MS = 120_000;

/** Host-owned or runtime-cache keys — excluded from the boundary comparison. */
const HOST_OR_CACHE_KEYS: readonly string[] = [
  'speed',
  'paused',
  'autoSave',
  'tutorialSeen',
  'dismissedBigNewsIds',
  'dismissedNotificationIds',
  'dismissedActiveEventIds',
  'entityById',
  'entityByType',
  'grassGrid',
  'mobileGrid',
  'humanSocialGrid',
  'treeGrid',
  'scentGrid',
  'roadAvoidance',
  'roadAvoidanceStamp',
  'adjacency',
  'beautyGrid',
  'spatialQueryStats',
  'simRng',
];

/**
 * Drops `undefined`-valued keys so an absent property and one explicitly set to `undefined`
 * compare equal: JSON drops them, and consumers read fields rather than enumerating keys.
 */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      out[key] = compact(entry);
    }
    return out;
  }
  return value;
}

/**
 * Effective value of a slice: several owners materialize a default when a world omits the key, so
 * an absent key and its owner default carry the same information.
 */
function effective(world: WorldState, key: string): unknown {
  const raw = (world as unknown as Record<string, unknown>)[key];
  switch (key) {
    case 'workSchedule':
      return getWorkSchedule(world);
    case 'tavernSchedule':
      return getVenueSchedule(world, 'tavern');
    case 'hotelSchedule':
      return getVenueSchedule(world, 'hotel');
    case 'huntVisuals':
    case 'chronicleChapters':
    case 'pendingStoryEvents':
    case 'bigNews':
    case 'notifications':
    case 'graveRecords':
      return raw ?? [];
    case 'storyFlags':
      return raw ?? {};
    case 'lastWildlifeReplenishLogDay':
    case 'renffrChatterUntilTick':
      return raw ?? 0;
    default:
      return raw;
  }
}

function worldProjection(world: WorldState, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (HOST_OR_CACHE_KEYS.includes(key)) continue;
    out[key] = compact(effective(world, key));
  }
  return out;
}

/**
 * Union of the own keys of every world being compared, so a key only one side materialized is
 * still compared against the other side's effective value.
 */
function comparableKeys(...worlds: readonly WorldState[]): string[] {
  const keys = new Set<string>();
  for (const world of worlds) {
    for (const key of Object.keys(world)) keys.add(key);
  }
  return [...keys].sort();
}

/** Entities without the calendar dates `migrateHumanAges` backfills on load. */
function entitiesWithoutBirthDates(world: WorldState): unknown[] {
  return world.entities.map((entity) => {
    const copy = compact(entity) as Record<string, unknown>;
    delete copy.birthDay;
    delete copy.birthMonth;
    return copy;
  });
}

/** Runs `ticks` simulation ticks through the real delta transport. */
function tickThroughDelta(ticks: number): { authority: WorldState; display: WorldState } {
  resetSimRng();
  const authority = initGame({ seed: SEED, size: MapSize.Medium });
  adoptSimSeedFromWorld(authority);
  const display = hydrateWorldRuntimeCaches(structuredClone(authority));

  for (let i = 0; i < ticks; i++) {
    gameTick(authority);
    const delta = extractSimTickDelta(authority, authority.entities.filter((e) => e.alive), {
      cloneMode: 'transfer',
    });
    // postMessage serialization: the host can never share objects with the worker.
    applySimTickDelta(display, structuredClone(delta), { cloneMode: 'transfer' });
    invalidateWorldRuntimeCaches(display);
    hydrateWorldRuntimeCaches(display);
  }
  return { authority, display };
}

describe('worker boundary closure', () => {
  describe('shared three-day worker delta fixture', () => {
    let deltaWorlds: ReturnType<typeof tickThroughDelta>;
    beforeAll(() => {
      deltaWorlds = tickThroughDelta(TICKS);
    }, 60_000);

    it('ships every simulation-written world field to the display world through tick deltas', () => {
      const { authority, display } = deltaWorlds;

      // Guard the fixture: the run must actually have changed the world and moved
      // entities through births/deaths, or the comparison below proves little.
      expect(authority.tick).toBeGreaterThan(TICKS);
      expect(authority.entities.length).toBeGreaterThan(2);
      expect(authority.humanPopulation).toBeGreaterThan(0);

      const keys = comparableKeys(display, authority);
      expect(worldProjection(display, keys)).toEqual(worldProjection(authority, keys));
    });

    it('reloads a worker-authored colony with every saved field intact', () => {
      const { display } = deltaWorlds;

      // gameWorker 'exportSave': invalidate, clone across the wire, hydrate.
      invalidateWorldRuntimeCaches(display);
      const exported = hydrateWorldRuntimeCaches(structuredClone(display));
      hydrateWorldRuntimeCaches(display);

      // Day 0 of month 0 is January 1, which a load must tell apart from a save that never carried a
      // date by the year, so one adult is given that date here.
      const newYearSettler = exported.entities.find(
        (entity) => entity.type === EntityType.Human && entity.alive && entity.age >= HUMAN_CHILDHOOD_YEARS,
      );
      expect(newYearSettler, 'the fixture has an adult to carry a January 1 birth date').toBeDefined();
      if (!newYearSettler) return;
      newYearSettler.birthDay = 0;
      newYearSettler.birthMonth = 0;

      const save = buildSaveData(exported, createInitialView(exported.width, exported.height));
      const parsed = parseSaveJson(JSON.stringify(save));
      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;
      const loaded = loadGameFromParsed(parsed.parsed);
      expect(loaded).not.toBeNull();
      if (!loaded) return;
      const reloaded = loaded.world;

      // Documented load-time normalizations, asserted rather than skipped.
      expect(reloaded.paused).toBe(false); // a loaded colony resumes immediately
      expect(reloaded.tradeRoutes.length).toBeGreaterThanOrEqual(exported.tradeRoutes.length); // ensureFullTradeRoutes merges
      // `tutorialSeen` is host-owned, so `exported` may omit it; only the reloaded world is
      // guaranteed to hold an array, seeded by `loadGameFromParsed`.
      expect(reloaded.tutorialSeen, 'a reloaded colony always carries a tutorialSeen list').toBeTruthy();
      expect(exported.tutorialSeen, 'the worker-authored world under test carries one too').toBeTruthy();
      expect(reloaded.tutorialSeen!.length).toBeGreaterThanOrEqual(exported.tutorialSeen!.length); // seeded for existing colonies
      expect(reloaded.eventLog.map((entry) => entry.id)).toEqual(exported.eventLog.map((entry) => entry.id));

      // Every other save key keeps its effective value; the load normalizes the id allocators on
      // purpose (`floorIdAllocators`), so those are asserted by the value-integrity suite instead.
      const normalizedByLoad = new Set([
        'paused',
        'tradeRoutes',
        'tutorialSeen',
        'entities',
        'nextEntityId',
        'nextBuildingId',
        'nextFloatingTextId',
      ]);
      for (const key of WORLD_STATE_SAVE_KEYS) {
        if (normalizedByLoad.has(key)) continue;
        if (!(key in (exported as unknown as Record<string, unknown>))) continue;
        expect(compact(effective(reloaded, key)), key).toEqual(compact(effective(exported, key)));
      }

      // `worldMap` is stored compactly and regenerated on load, not in `WORLD_STATE_SAVE_KEYS`, so
      // a scale error here would leave every entity outside the restored valley.
      expect(reloaded.width).toBe(exported.width);
      expect(reloaded.height).toBe(exported.height);
      expect(reloaded.worldMap?.width).toBe(exported.worldMap?.width);
      expect(reloaded.worldMap?.height).toBe(exported.worldMap?.height);
      // Teraforge keeps no per-tile grid: the shape claim is made on the regenerated L0 path grid
      // (one cell per tile) plus the tile dimensions asserted above.
      expect(reloaded.worldMap?.pathGrid?.length).toBe(exported.worldMap?.pathGrid?.length);
      expect(reloaded.worldMap?.pCols).toBe(exported.worldMap?.pCols);
      expect(reloaded.worldMap?.pRows).toBe(exported.worldMap?.pRows);

      // Entities: identity, order, ages and every persisted field survive; `migrateHumanAges` rebuilds
      // only a calendar the payload never carried, so a saved date is left exactly as it was.
      expect(reloaded.entities.map((e) => e.id)).toEqual(exported.entities.map((e) => e.id));
      expect(entitiesWithoutBirthDates(reloaded)).toEqual(entitiesWithoutBirthDates(exported));
      const reloadedById = new Map(reloaded.entities.map((entity) => [entity.id, entity]));
      let newYearSettlers = 0;
      for (const entity of exported.entities) {
        const again = reloadedById.get(entity.id);
        expect(again, `entity ${entity.id} is missing after reload`).toBeDefined();
        if (!again) continue;
        expect(again.age, `entity ${entity.id} age`).toBe(entity.age);
        for (const field of ENTITY_PERSISTED_FIELDS) {
          expect(again[field], `entity ${entity.id}.${field}`).toEqual(entity[field]);
        }
        if (entity.type === EntityType.Human && entity.birthDay === 0 && entity.birthMonth === 0) {
          // The saved year marks the date as present, so January 1 is kept rather than rebuilt from age.
          expect(again.birthDay, `entity ${entity.id} birth date`).toBe(entity.birthDay);
          expect(again.birthMonth, `entity ${entity.id} birth month`).toBe(entity.birthMonth);
          expect(again.birthYear, `entity ${entity.id} birth year`).toBe(entity.birthYear);
          newYearSettlers++;
        }
      }
      expect(newYearSettlers).toBeGreaterThan(0); // the round trip really did carry a January 1 settler
    });  });

  it('keeps the leader couple and independent adult descendants across worker and save/load boundaries', () => {
    resetSimRng();
    const authority = initGame({ seed: SEED, size: MapSize.Medium });
    const leader = authority.entities.find((e) => e.type === EntityType.Human && e.alive);
    expect(leader).toBeDefined();
    if (!leader) throw new Error('No leader fixture');
    const spouseId = 900002;
    const childIds = Array.from({ length: 19 }, (_, i) => 900003 + i);
    const family = [
      human(leader.id, { partnerId: spouseId, childrenIds: childIds }),
      human(spouseId, { partnerId: leader.id, childrenIds: childIds }),
      ...childIds.map((id) => human(id, { motherId: spouseId, fatherId: leader.id, age: 22 })),
    ];
    const manor = building(900000, BuildingType.LeaderHouse);
    authority.entities = family;
    authority.buildings = [manor];
    authority.villageLeaderId = leader.id;
    syncLeaderHouseResidency(authority);
    const ids = [leader.id, spouseId].sort((a, b) => a - b);
    const assertHouse = (world: WorldState) => {
      const home = world.buildings.find((b) => b.id === manor.id);
      expect(home).toBeDefined();
      expect([...home!.occupants].sort((a, b) => a - b)).toEqual(ids);
      expect(world.entities.filter((e) => ids.includes(e.id)).every((e) => e.residenceBuildingId === manor.id)).toBe(true);
      expect(world.entities.filter((e) => childIds.includes(e.id))).toHaveLength(childIds.length);
    };
    assertHouse(authority);
    invalidateWorldRuntimeCaches(authority);
    const worker = hydrateWorldRuntimeCaches(structuredClone(authority));
    hydrateWorldRuntimeCaches(authority);
    assertHouse(worker);
    const display = hydrateWorldRuntimeCaches(structuredClone(worker));
    adoptSimSeedFromWorld(worker);
    gameTick(worker);
    assertHouse(worker);
    const delta = extractSimTickDelta(worker, worker.entities.filter((e) => e.alive), { cloneMode: 'transfer' });
    applySimTickDelta(display, structuredClone(delta), { cloneMode: 'transfer' });
    assertHouse(display);
    const save = buildSaveData(worker, createInitialView(worker.width, worker.height));
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) throw new Error('Invalid serialized save');
    const restored = loadGameFromParsed(parsed.parsed);
    expect(restored).not.toBeNull();
    if (!restored) throw new Error('Save failed to restore');
    assertHouse(restored.world);
    gameTick(restored.world);
    assertHouse(restored.world);
  });

  it('carries the whole world into the worker and rebuilds the worker-side indices', () => {
    resetSimRng();
    const host = initGame({ seed: SEED, size: MapSize.Medium });
    adoptSimSeedFromWorld(host);
    for (let i = 0; i < 720; i++) gameTick(host); // a mature world: the real caches exist

    // A mature world really does carry class-typed runtime caches to strip.
    expect(host.mobileGrid).toBeDefined();
    expect(host.adjacency).toBeDefined();

    // GameWorkerHost.queueFullWorldUpload followed by resetWorkerSession.
    invalidateWorldRuntimeCaches(host);
    const workerWorld = hydrateWorldRuntimeCaches(structuredClone(host));
    hydrateWorldRuntimeCaches(host);

    // Caches are gone (not smuggled across as inert plain objects) ...
    expect(workerWorld.mobileGrid).toBeUndefined();
    expect(workerWorld.adjacency).toBeUndefined();
    expect(workerWorld.roadAvoidance).toBeUndefined();
    // ... and the index the worker needs is usable again.
    expect(workerWorld.entityById).toBeInstanceOf(Map);
    const sample = workerWorld.entities[0];
    expect(sample).toBeDefined();
    expect(workerWorld.entityById?.get(sample.id)).toBeDefined();

    const projectedKeys = comparableKeys(host, workerWorld);
    const projectedHost = worldProjection(host, projectedKeys);
    const projectedWorker = worldProjection(workerWorld, projectedKeys);
    delete projectedHost.simRng;
    delete projectedWorker.simRng;
    expect(projectedWorker).toEqual(projectedHost);
  });

  it('applies a worker command delta without losing command-authored state', () => {
    resetSimRng();
    let world = initGame({ seed: SEED, size: MapSize.Medium });
    adoptSimSeedFromWorld(world);
    const display = hydrateWorldRuntimeCaches(structuredClone(world));

    for (const command of [
      { proto: 1, op: 'setWorkSchedule', startHour: 6, endHour: 15 } as const,
      { proto: 1, op: 'autoStaffWorkers' } as const,
      { proto: 1, op: 'startResearch', researchId: 'forestry_1' } as const,
    ]) {
      // The worker's own handler reassigns: the command owners are immutable.
      world = applyWorkerCommand(world, command);
      applySimTickDelta(display, structuredClone(extractCommandDelta(world)), {
        cloneMode: 'transfer',
      });
      invalidateWorldRuntimeCaches(display);
      hydrateWorldRuntimeCaches(display);
    }

    // The command really changed authoritative state ...
    expect(getWorkSchedule(world)).toEqual({ startHour: 6, endHour: 15 });
    // ... and the display world received it through the delta.
    expect(getWorkSchedule(display)).toEqual({ startHour: 6, endHour: 15 });
    expect(display.activeResearch).toBe(world.activeResearch);
    const keys = comparableKeys(display, world);
    expect(worldProjection(display, keys)).toEqual(worldProjection(world, keys));
  });

  it('rolls a failed tick back to the exact pre-tick world', () => {
    resetSimRng();
    const world = initGame({ seed: SEED, size: MapSize.Medium });
    adoptSimSeedFromWorld(world);
    const before = structuredClone(world) as WorldState;
    const entitiesBefore = entitiesWithoutBirthDates(world);

    const prep = extractSimPrep(world);
    for (let i = 0; i < TICKS; i++) gameTick(world);
    applySimPrep(world, prep);

    // The rollback must undo a tick that really did change state.
    expect(world.tick).toBe(before.tick);
    const keys = comparableKeys(world, before);
    expect(worldProjection(world, keys)).toEqual(worldProjection(before, keys));
    expect(entitiesWithoutBirthDates(world)).toEqual(entitiesBefore);
  });

  it('rolls a failed command back to the exact pre-command world', () => {
    // The command path is the other caller of the prep pair; a command is a different set of
    // owners mutating the same fields, so its rollback needs its own coverage.
    resetSimRng();
    let world = initGame({ seed: SEED, size: MapSize.Medium });
    adoptSimSeedFromWorld(world);
    // Pre-increment, matching every production allocator: post-increment allocates id 0 and leaves
    // `nextBuildingId` at 0, so the next building reuses id 0.
    world.buildings.push(createBuilding(BuildingType.Farm, 60, 60, ++world.nextBuildingId));
    const before = structuredClone(world) as WorldState;
    const entitiesBefore = entitiesWithoutBirthDates(world);

    const prep = extractSimPrep(world);
    world = applyWorkerCommand(world, { proto: 1, op: 'setWorkSchedule', startHour: 8, endHour: 17 });
    // The real schedule command must have changed the world before rollback.
    expect(world.workSchedule).toEqual({ startHour: 8, endHour: 17 });
    applySimPrep(world, prep);

    const keys = comparableKeys(world, before);
    expect(worldProjection(world, keys)).toEqual(worldProjection(before, keys));
    expect(entitiesWithoutBirthDates(world)).toEqual(entitiesBefore);
  });


});
