/**
 * Worker-boundary closure — measured 2026-09-16.
 *
 * The audit behind these cases answered one question: does every piece of state the
 * simulation needs actually cross the host <-> worker boundary, and does it survive?
 * Each case reproduces the real transport (`GameWorkerHost.queueFullWorldUpload` /
 * `gameWorker.ts` handlers) including the `postMessage` serialization step, then
 * compares the two worlds field by field.
 *
 * What the boundary guarantees, and what these tests pin:
 *
 * - host -> worker (`init` / `importSave` / `syncWorld`): the whole WorldState crosses
 *   after `invalidateWorldRuntimeCaches` strips the class-typed runtime caches
 *   (grids, road index, adjacency), and `hydrateWorldRuntimeCaches` gives the worker a
 *   usable `entityById` back. `entityByType` is rebuilt lazily by its own owner.
 * - worker -> host (tick/command delta): every field the simulation writes reaches the
 *   display world, including the ones the earlier audits caught missing (visitorQuest,
 *   chronicleChapters, huntVisuals, workingSettlers, villageHappiness).
 * - rollback (`extractSimPrep` / `applySimPrep`): a failed tick or command restores the
 *   exact pre-tick world, nested entity state included.
 * - save/load: every `WORLD_STATE_SAVE_KEYS` value and every `ENTITY_PERSISTED_FIELDS`
 *   field survives the round trip. The only differences are the documented load-time
 *   normalizations, asserted explicitly below rather than skipped.
 *
 * Deliberately NOT compared, with the reason each is host-owned or transient (see
 * `HOST_OR_CACHE_KEYS` below — the list there is the authority, not this prose):
 * - `speed`, `paused` — authored on the main thread, carried across display rebuilds by
 *   `carryPresentationControls`, forwarded by `setSpeed` / `setPaused`.
 * - `autoSave`, `tutorialSeen`, the three `dismissed*Ids` sets — pushed into the worker by
 *   `patchUi` (`extractUiPatch`) and excluded by `HOST_OR_CACHE_KEYS`.
 * - `entityById`, `entityByType`, `*Grid`, `roadAvoidance`, `roadAvoidanceStamp`,
 *   `adjacency`, `beautyGrid` — runtime caches, rebuilt on each side by their owners.
 * - `simRng` — a snapshot the host stamps at hand-off; the display world receiving one
 *   from the delta is strictly more information, never less.
 *
 * The worker-authored presentation slices — `bigNews`, `floatingTexts`, `activeEvent`,
 * `nextFloatingTextId` — are **compared**, not excluded. Watch the fixture length when reading a
 * pass: `TICKS = 240` is 5 colony days and the first-week visitor event needs tick ≥ 504, so
 * `activeEvent` is `undefined` on both sides here. That vacuous comparison is exactly why the
 * missing `activeEvent` entry in the prep rollback payload could hide from this suite
 * (`BUG_REPORTS/2026-09-16-prep-rollback-misses-the-active-event-and-the-scent-field.md`).
 */
import { describe, expect, it } from 'vitest';
import { initGame, createBuilding } from '../src/game/worldGen';
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
import { getVenueSchedule } from '../src/game/venueSchedule';
import { EntityType, BuildingType, type WorldState } from '../src/game/gameTypes';

const SEED = 4242;
const TICKS = 240; // 5 colony days — crosses every daily cadence at least five times

/** Host-owned or runtime-cache keys — excluded for the reasons in the file header. */
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
 * Drops `undefined`-valued keys so an absent property and a property explicitly set to
 * `undefined` compare equal: every consumer reads a field, none enumerates entity keys,
 * and JSON drops them. The measured presence differences are exactly this shape.
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
 * Effective value of a slice. Several owners materialize a default when a world omits
 * the key (`getWorkSchedule`, `getVenueSchedule`, and the delta's `?? []` / `?? {}`
 * fallbacks), so an absent key and its owner default carry the same information.
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
 * Union of the own keys of every world being compared. A key the sender materialized
 * with an owner default and the receiver never created carries the same information,
 * so both sides are projected over the same key list rather than each over its own.
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
  const authority = initGame({ seed: SEED });
  adoptSimSeedFromWorld(authority);
  const display = hydrateWorldRuntimeCaches(structuredClone(authority));

  for (let i = 0; i < ticks; i++) {
    gameTick(authority);
    const delta = extractSimTickDelta(authority, authority.entities.filter((e) => e.alive), {
      headless: true,
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
  it('ships every simulation-written world field to the display world through tick deltas', () => {
    const { authority, display } = tickThroughDelta(TICKS);

    // Guard the fixture: the run must actually have changed the world and moved
    // entities through births/deaths, or the comparison below proves little.
    expect(authority.tick).toBeGreaterThan(TICKS);
    expect(authority.entities.length).toBeGreaterThan(2);
    expect(authority.humanPopulation).toBeGreaterThan(0);

    const keys = comparableKeys(display, authority);
    expect(worldProjection(display, keys)).toEqual(worldProjection(authority, keys));
  });

  it('carries the whole world into the worker and rebuilds the worker-side indices', () => {
    resetSimRng();
    const host = initGame({ seed: SEED });
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
    let world = initGame({ seed: SEED });
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
    const world = initGame({ seed: SEED });
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
    // The command path is the *other* caller of the prep pair (`gameWorker.ts`, the `command` case),
    // and it had no coverage at all: the tick case above proves the snapshot restores a world the tick
    // advanced, while a command is a different set of owners (`buildingPlacementActions`, `workforce`,
    // `groupEvents` …) mutating the same fields. A command owner that returns a world the payload
    // cannot undo would break the worker's failure path without touching any assertion.
    resetSimRng();
    let world = initGame({ seed: SEED });
    adoptSimSeedFromWorld(world);
    world.buildings.push(createBuilding(BuildingType.Farm, 60, 60, world.nextBuildingId++));
    const before = structuredClone(world) as WorldState;
    const entitiesBefore = entitiesWithoutBirthDates(world);

    const prep = extractSimPrep(world);
    world = applyWorkerCommand(world, { proto: 1, op: 'autoStaffWorkers' });
    // The command must have changed the world, or the rollback assertion below is vacuous.
    // `autoStaffAllWorkers` always posts a notification, so this is a change a real command makes.
    expect(world.notifications.length).toBeGreaterThan(before.notifications.length);
    applySimPrep(world, prep);

    const keys = comparableKeys(world, before);
    expect(worldProjection(world, keys)).toEqual(worldProjection(before, keys));
    expect(entitiesWithoutBirthDates(world)).toEqual(entitiesBefore);
  });

  it('reloads a worker-authored colony with every saved field intact', () => {
    const { display } = tickThroughDelta(TICKS);

    // gameWorker 'exportSave': invalidate, clone across the wire, hydrate.
    invalidateWorldRuntimeCaches(display);
    const exported = hydrateWorldRuntimeCaches(structuredClone(display));
    hydrateWorldRuntimeCaches(display);

    const save = buildSaveData(exported, createInitialView(exported.width, exported.height));
    const parsed = parseSaveJson(JSON.stringify(save));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    if (!loaded) return;
    const reloaded = loaded.world;

    // Documented load-time normalizations, asserted rather than skipped.
    expect(reloaded.paused).toBe(true); // a loaded colony starts paused
    expect(reloaded.tradeRoutes.length).toBeGreaterThanOrEqual(exported.tradeRoutes.length); // ensureFullTradeRoutes merges
    // `tutorialSeen` is host-owned (see HOST_OR_CACHE_KEYS), so the worker-authored `exported`
    // world may legitimately omit it entirely — only the reloaded world is guaranteed to hold an
    // array, because `loadGameFromParsed` seeds it via `seedTutorialSeenForExistingState`.
    expect(reloaded.tutorialSeen, 'a reloaded colony always carries a tutorialSeen list').toBeTruthy();
    expect(exported.tutorialSeen, 'the worker-authored world under test carries one too').toBeTruthy();
    expect(reloaded.tutorialSeen!.length).toBeGreaterThanOrEqual(exported.tutorialSeen!.length); // seeded for existing colonies
    expect(reloaded.eventLog.map((entry) => entry.id)).toEqual(exported.eventLog.map((entry) => entry.id));

    // Every other save key keeps its effective value.
    const normalizedByLoad = new Set(['paused', 'tradeRoutes', 'tutorialSeen', 'entities']);
    for (const key of WORLD_STATE_SAVE_KEYS) {
      if (normalizedByLoad.has(key)) continue;
      if (!(key in (exported as unknown as Record<string, unknown>))) continue;
      expect(compact(effective(reloaded, key)), key).toEqual(compact(effective(exported, key)));
    }

    // `worldMap` is not in WORLD_STATE_SAVE_KEYS (it is stored compactly and regenerated
    // on load), so it needs its own assertion: a scale error there is invisible to the
    // key loop above and silently leaves every entity outside the restored valley.
    expect(reloaded.width).toBe(exported.width);
    expect(reloaded.height).toBe(exported.height);
    expect(reloaded.worldMap?.width).toBe(exported.worldMap?.width);
    expect(reloaded.worldMap?.height).toBe(exported.worldMap?.height);
    // The old assertion was `worldMap.tiles.length` / `tiles[0].length`, which was the tile
    // rectangle. Teraforge keeps no per-tile grid: the same shape claim is made on the regenerated
    // L0 path grid (one cell per tile) and the tile dimensions asserted just above.
    expect(reloaded.worldMap?.pathGrid?.length).toBe(exported.worldMap?.pathGrid?.length);
    expect(reloaded.worldMap?.pCols).toBe(exported.worldMap?.pCols);
    expect(reloaded.worldMap?.pRows).toBe(exported.worldMap?.pRows);

    // Entities: identity, order, ages and every persisted field survive; only the
    // calendar birth dates are backfilled by migrateHumanAges where the worker left 0.
    expect(reloaded.entities.map((e) => e.id)).toEqual(exported.entities.map((e) => e.id));
    expect(entitiesWithoutBirthDates(reloaded)).toEqual(entitiesWithoutBirthDates(exported));
    const reloadedById = new Map(reloaded.entities.map((entity) => [entity.id, entity]));
    let backfilled = 0;
    for (const entity of exported.entities) {
      const again = reloadedById.get(entity.id);
      expect(again, `entity ${entity.id} is missing after reload`).toBeDefined();
      if (!again) continue;
      expect(again.age, `entity ${entity.id} age`).toBe(entity.age);
      for (const field of ENTITY_PERSISTED_FIELDS) {
        expect(again[field], `entity ${entity.id}.${field}`).toEqual(entity[field]);
      }
      if (entity.type === EntityType.Human && entity.birthDay === 0 && entity.birthMonth === 0) {
        expect(again.birthDay, `entity ${entity.id} birth date`).toBeGreaterThan(0);
        backfilled++;
      }
    }
    expect(backfilled).toBeGreaterThan(0); // the round trip really did exercise the migration
  });
});
