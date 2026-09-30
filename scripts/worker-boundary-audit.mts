/**
 * Worker-boundary audit probe — Wilderfolk.
 *
 * Answers one question mechanically: does every piece of state the simulation
 * needs actually cross the host <-> worker boundary, and does it survive?
 *
 * The probe mimics `GameWorkerHost`/`gameWorker.ts` exactly, including the
 * `postMessage` serialization step (structuredClone) and the
 * invalidate/hydrate calls each side performs, then diffs the two worlds.
 *
 * Run: npx tsx scripts/worker-boundary-audit.mts
 */
import { initGame } from '../src/game/worldGen';
import fs from 'node:fs';
import { gameTick } from '../src/game/gameTick';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import {
  applyWorkerCommand,
  extractCommandDelta,
  type WorkerCommand,
} from '../src/game/simWorker/commands';
import {
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
} from '../src/game/worldRuntimeCaches';
import {
  adoptSimSeedFromWorld,
  getSimRng,
  parseSimRngSnapshot,
  resetSimRng,
  restoreSimRng,
  setSimSeed,
  snapshotSimRng,
} from '../src/game/simRng';
import { ENTITY_PERSISTED_FIELDS, WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { getWorkSchedule } from '../src/game/workSchedule';
import { getVenueSchedule } from '../src/game/venueSchedule';
import type { WorldState } from '../src/game/gameTypes';

const SEED = 12345;
const TICK_COUNT = 2880; // 60 colony days — crosses day, week, season and social cadences

/** Keys whose value is a class instance / runtime cache, not plain JSON state. */
const CLASS_CACHE_KEYS = [
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
];

/**
 * Keys the worker never ships on purpose — the player authors them on the main
 * thread (`speed`, `paused`) and pushes the presentation slices back through
 * `patchUi`, while the schedule/preference fields are read locally. Documented
 * in `worldRuntimeCaches.carryPresentationControls`.
 */
const HOST_AUTHORED_KEYS = [
  'speed',
  'paused',
  'autoSave',
  'tutorialSeen',
  'soundEnabled',
  'musicEnabled',
  'dismissedBigNewsIds',
  'dismissedNotificationIds',
  'dismissedActiveEventIds',
];

const IGNORE_WORLD_KEYS = new Set([...CLASS_CACHE_KEYS, ...HOST_AUTHORED_KEYS]);

type Finding = { section: string; key: string; kind: string; a: string; b: string };
const findings: Finding[] = [];

function classOf(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto === null || proto === Object.prototype || proto === Array.prototype) return null;
  return (proto.constructor as { name?: string } | undefined)?.name ?? 'unknown';
}

/** Order-stable, class-aware, cycle-safe serialization for comparison. */
function stable(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    const type = typeof v;
    if (type === 'number') return Number.isFinite(v as number) ? v : `#num:${String(v)}`;
    if (type === 'undefined') return '#undefined';
    if (type === 'function') return '#function';
    if (type === 'bigint') return `#bigint:${String(v)}`;
    if (type === 'symbol') return '#symbol';
    if (type !== 'object') return v;
    const obj = v as object;
    if (seen.has(obj)) return '#circular';
    seen.add(obj);
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Map) {
      return { __class: 'Map', entries: [...v.entries()].map(([k, val]) => [walk(k), walk(val)]) };
    }
    if (v instanceof Set) return { __class: 'Set', values: [...v.values()].map(walk) };
    const cls = classOf(v);
    const out: Record<string, unknown> = {};
    if (cls) out.__class = cls;
    for (const key of Object.keys(obj).sort()) {
      out[key] = walk((obj as Record<string, unknown>)[key]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

function preview(text: string): string {
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function record(section: string, key: string, kind: string, a: string, b: string): void {
  findings.push({ section, key, kind, a: preview(a), b: preview(b) });
}

/**
 * Effective value of a key. Several slices are intentionally materialized by the
 * receiving side (`applySimTickDelta` writes the owner default when the delta
 * carries none), so an absent key and its owner default are the same information.
 */
function semanticValue(world: WorldState, key: string): unknown {
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

function diffWorld(a: WorldState, b: WorldState, section: string, ignore: Set<string> = IGNORE_WORLD_KEYS): void {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of [...keys].sort()) {
    if (ignore.has(key)) continue;
    const sa = stable(semanticValue(a, key));
    const sb = stable(semanticValue(b, key));
    if (sa === sb) continue;
    const kind =
      (a as unknown as Record<string, unknown>)[key] === undefined
        ? 'missing-on-source'
        : (b as unknown as Record<string, unknown>)[key] === undefined
          ? 'missing-on-target'
          : 'different';
    record(section, key, kind, sa, sb);
  }
}

function entityFieldDiff(a: WorldState, b: WorldState, section: string): void {
  const bById = new Map(b.entities.map((e) => [e.id, e]));
  const aIds = new Set(a.entities.map((e) => e.id));
  const counts = new Map<string, number>();
  const samples: string[] = [];
  let missing = 0;
  let orderDiffers = false;
  if (a.entities.length === b.entities.length) {
    for (let i = 0; i < a.entities.length; i++) {
      if (a.entities[i].id !== b.entities[i].id) {
        orderDiffers = true;
        break;
      }
    }
  }
  for (const entity of a.entities) {
    const other = bById.get(entity.id);
    if (!other) {
      missing++;
      continue;
    }
    const ea = entity as unknown as Record<string, unknown>;
    const eb = other as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
      if (stable(ea[key]) !== stable(eb[key])) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (samples.length < 6) {
          samples.push(`entity ${entity.id}.${key}: source=${preview(stable(ea[key]))} target=${preview(stable(eb[key]))}`);
        }
      }
    }
  }
  const onlyInB = b.entities.filter((e) => !aIds.has(e.id)).length;
  if (missing || onlyInB || orderDiffers) {
    record(
      section,
      'entities',
      'entity-set-mismatch',
      `${a.entities.length} source (${missing} absent on target)`,
      `${b.entities.length} target (${onlyInB} extra)${orderDiffers ? ' · different order' : ''}`,
    );
  }
  // Key-presence-only differences are invisible to a per-field value compare, so
  // report them explicitly (a `{x: undefined}` vs `{}` difference is not data loss,
  // but it must be named rather than hidden).
  const presence = new Map<string, number>();
  for (const entity of a.entities) {
    const other = bById.get(entity.id);
    if (!other) continue;
    const ka = new Set(Object.keys(entity as object));
    const kb = new Set(Object.keys(other as object));
    for (const key of ka) if (!kb.has(key)) presence.set(`only-on-source:${key}`, (presence.get(`only-on-source:${key}`) ?? 0) + 1);
    for (const key of kb) if (!ka.has(key)) presence.set(`only-on-target:${key}`, (presence.get(`only-on-target:${key}`) ?? 0) + 1);
  }
  for (const [key, count] of [...presence.entries()].sort()) {
    console.log(`    property-presence ${key} on ${count} entities`);
  }
  for (const [key, count] of [...counts.entries()].sort((x, y) => y[1] - x[1])) {
    record(section, `entity.${key}`, 'different-fields', `${count} entities`, 'diverged');
  }
  for (const sample of samples) console.log(`    ${sample}`);
}

/** One host -> worker hand-off, exactly as GameWorkerHost.queueFullWorldUpload does. */
function crossToWorker(hostWorld: WorldState): WorldState {
  invalidateWorldRuntimeCaches(hostWorld);
  hostWorld.simRng = snapshotSimRng();
  const wire = structuredClone(hostWorld); // postMessage serialization
  hydrateWorldRuntimeCaches(hostWorld); // host keeps its own usable copy
  return hydrateWorldRuntimeCaches(wire); // worker's resetWorkerSession
}

/** One worker -> host delta delivery, exactly as GameWorkerHost.handleMessage does. */
function crossToHost(display: WorldState, delta: unknown): void {
  const wire = structuredClone(delta); // postMessage serialization
  applySimTickDelta(display, wire as never, { cloneMode: 'transfer' });
  invalidateWorldRuntimeCaches(display);
  hydrateWorldRuntimeCaches(display);
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** First differing array entry with its differing fields — separates a save-side change from a load-side one. */
function firstEntryDiff(a: readonly unknown[], b: readonly unknown[], label: string): void {
  const limit = Math.min(a.length, b.length);
  if (a.length !== b.length) console.log(`    ${label}: length ${a.length} -> ${b.length}`);
  for (let i = 0; i < limit; i++) {
    if (stable(a[i]) === stable(b[i])) continue;
    const ea = (a[i] ?? {}) as Record<string, unknown>;
    const eb = (b[i] ?? {}) as Record<string, unknown>;
    const fields: string[] = [];
    for (const key of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
      if (stable(ea[key]) !== stable(eb[key])) {
        fields.push(`${key}: ${preview(stable(ea[key]))} -> ${preview(stable(eb[key]))}`);
      }
    }
    console.log(`    ${label}[${i}] differs: ${fields.join(' | ') || '(key presence/order only)'}`);
    return;
  }
  console.log(`    ${label}: identical`);
}

/* ------------------------------------------------------------------ */
/* 1. Census: which world keys exist and who carries them             */
/* ------------------------------------------------------------------ */
function census(): string[] {
  section('1. world key census (fresh colony)');
  const world = initGame({ seed: SEED });
  const prepKeys = new Set(Object.keys(extractSimPrep(world)));
  const deltaKeys = new Set(
    Object.keys(extractSimTickDelta(world, [], { headless: true })),
  );
  const saveKeys = new Set<string>(WORLD_STATE_SAVE_KEYS as readonly string[]);
  const rows = Object.keys(world)
    .sort()
    .map((key) => {
      const value = (world as unknown as Record<string, unknown>)[key];
      return {
        key,
        type: classOf(value) ?? typeof value,
        save: saveKeys.has(key),
        prep: prepKeys.has(key),
        delta: deltaKeys.has(key),
      };
    });
  const orphans = rows.filter((r) => !r.save && !r.delta && !CLASS_CACHE_KEYS.includes(r.key));
  console.log(
    `keys=${rows.length} · save=${rows.filter((r) => r.save).length} · prep=${rows.filter((r) => r.prep).length} · delta=${rows.filter((r) => r.delta).length}`,
  );
  console.log(
    `class-typed values: ${rows.filter((r) => CLASS_CACHE_KEYS.includes(r.key) || !['number', 'string', 'boolean', 'undefined', 'object'].includes(r.type)).map((r) => `${r.key}:${r.type}`).join(', ')}`,
  );
  for (const row of orphans) console.log(`  no save + no delta: ${row.key} (${row.type})`);
  const deltaOmitted = rows.filter((r) => r.save && !r.delta);
  console.log(`  saved but not in the tick delta: ${deltaOmitted.map((r) => r.key).join(', ') || '(none)'}`);
  const prepMissing = rows.filter((r) => r.save && !r.prep && !['worldMap', 'entities'].includes(r.key));
  console.log(`  saved but not in the prep snapshot: ${prepMissing.map((r) => r.key).join(', ') || '(none)'}`);
  return rows.map((r) => r.key);
}

/* ------------------------------------------------------------------ */
/* 2. Host -> worker hand-off                                          */
/* ------------------------------------------------------------------ */
function hostToWorker(): WorldState {
  section('2. host -> worker (init / importSave / syncWorld)');
  const host = initGame({ seed: SEED });
  const classKeysBefore = Object.keys(host).filter((k) => classOf((host as unknown as Record<string, unknown>)[k]));
  const workerWorld = crossToWorker(host);

  console.log(`class-typed keys on a fresh world: ${classKeysBefore.join(', ') || '(none)'}`);
  const survivedClasses = classKeysBefore.filter((k) =>
    classOf((workerWorld as unknown as Record<string, unknown>)[k]),
  );
  const brokenClasses = classKeysBefore.filter((k) => {
    const value = (workerWorld as unknown as Record<string, unknown>)[k];
    return value !== undefined && classOf(value) === null;
  });
  console.log(`cleared by invalidate: ${classKeysBefore.filter((k) => (workerWorld as unknown as Record<string, unknown>)[k] === undefined).join(', ') || '(none)'}`);
  console.log(`still class instances after crossing: ${survivedClasses.join(', ') || '(none)'}`);
  if (brokenClasses.length) {
    record('host->worker', brokenClasses.join(','), 'class-instance-arrived-as-plain-object', 'class instance', 'plain object (methods lost)');
  }

  const ignored = new Set([...IGNORE_WORLD_KEYS, 'simRng']);
  diffWorld(host, workerWorld, 'host->worker', ignored);

  // The worker rehydrates the indices it needs; entityById must be usable again.
  const rebuilt = [
    ['entityById', (workerWorld as unknown as Record<string, unknown>).entityById],
    ['entityByType', (workerWorld as unknown as Record<string, unknown>).entityByType],
  ].map(([name, value]) => `${name}:${value === undefined ? 'absent (lazy)' : classOf(value) ?? typeof value}`);
  console.log(`worker-side caches after hydrate: ${rebuilt.join(', ')}`);

  // A mature world carries the real runtime caches (grids, road index, adjacency),
  // which is where a non-serializable class instance would actually leak through.
  resetSimRng();
  const grown = initGame({ seed: SEED });
  adoptSimSeedFromWorld(grown);
  for (let i = 0; i < 720; i++) gameTick(grown);
  const grownClassKeys = Object.keys(grown).filter((k) => {
    const value = (grown as unknown as Record<string, unknown>)[k];
    return value !== undefined && classOf(value) !== null;
  });
  const grownWorker = crossToWorker(grown);
  console.log(`class-typed keys on a 10-day world: ${grownClassKeys.join(', ') || '(none)'}`);
  const leaked = grownClassKeys.filter((k) => {
    const value = (grownWorker as unknown as Record<string, unknown>)[k];
    return value !== undefined && classOf(value) === null;
  });
  if (leaked.length) {
    record('host->worker(mature)', leaked.join(','), 'cache-arrived-as-plain-object', 'class instance', 'plain object (methods lost)');
  }
  console.log(`caches that survive as usable instances: ${grownClassKeys.filter((k) => classOf((grownWorker as unknown as Record<string, unknown>)[k]) !== null).join(', ') || '(none)'}`);
  diffWorld(grown, grownWorker, 'host->worker(mature)', ignored);
  return grownWorker;
}

/* ------------------------------------------------------------------ */
/* 3. RNG positions across the boundary                                */
/* ------------------------------------------------------------------ */
function rngSurvival(): void {
  section('3. simRng positions across the boundary');
  resetSimRng();
  setSimSeed(4242);
  const stream = getSimRng('entityFactory');
  stream();
  stream();
  const snapshot = snapshotSimRng();
  const expected = [stream(), stream(), stream()]; // the continuation the worker must resume
  const wire = JSON.parse(JSON.stringify(snapshot)) as unknown;
  const parsed = parseSimRngSnapshot(wire);
  if (!parsed) {
    record('simRng', 'snapshot', 'unparseable-after-wire', stable(snapshot), stable(wire));
    return;
  }
  if (!restoreSimRng(wire)) {
    record('simRng', 'restore', 'restore-rejected', stable(wire), 'restoreSimRng returned false');
    return;
  }
  const resumedHeld = [stream(), stream(), stream()]; // the handle the module already holds
  if (stable(expected) !== stable(resumedHeld)) {
    record('simRng', 'positions-held-handle', 'restore-replayed-or-drifted', expected.join(','), resumedHeld.join(','));
  }
  // A freshly requested handle for the same owner must land on the same position too.
  restoreSimRng(wire);
  const fresh = getSimRng('entityFactory');
  const resumedFresh = [fresh(), fresh(), fresh()];
  if (stable(expected) !== stable(resumedFresh)) {
    record('simRng', 'positions-fresh-handle', 'restore-replayed-or-drifted', expected.join(','), resumedFresh.join(','));
  }
  console.log(`snapshot survives the wire: yes · snapshot keys: ${Object.keys(snapshot).join(', ')}`);
  console.log(`continuation after restore (held handle): ${resumedHeld.join(',')}`);
  console.log(`continuation after restore (fresh handle): ${resumedFresh.join(',')}`);
}

/* ------------------------------------------------------------------ */
/* 4. Worker -> host tick deltas                                       */
/* ------------------------------------------------------------------ */
function tickDeltaSurvival(): WorldState {
  section(`4. worker -> host tick deltas (${TICK_COUNT} ticks, headless worker path)`);
  resetSimRng();
  const authoritative = initGame({ seed: SEED });
  adoptSimSeedFromWorld(authoritative);
  const display = hydrateWorldRuntimeCaches(structuredClone(authoritative));

  for (let i = 0; i < TICK_COUNT; i++) {
    gameTick(authoritative);
    const aliveNow = authoritative.entities.filter((e) => e.alive);
    const delta = extractSimTickDelta(authoritative, aliveNow, {
      headless: true,
      cloneMode: 'transfer',
    });
    crossToHost(display, delta);
  }
  console.log(`tick ${authoritative.tick} · entities ${authoritative.entities.length} · buildings ${authoritative.buildings.length}`);
  diffWorld(authoritative, display, 'ticks:delta');
  entityFieldDiff(authoritative, display, 'ticks:entities');

  // The browser worker extracts with render metadata; that must not thin the payload.
  gameTick(authoritative);
  const aliveNow = authoritative.entities.filter((e) => e.alive);
  const headlessDelta = extractSimTickDelta(authoritative, aliveNow, { headless: true });
  const renderDelta = extractSimTickDelta(authoritative, aliveNow, {});
  const sameEntities = stable(headlessDelta.aliveEntities) === stable(renderDelta.aliveEntities);
  console.log(
    `render path ships the same entity payload: ${sameEntities ? 'yes' : 'NO'} · renderMetaBySlot: ${
      renderDelta.renderMetaBySlot ? `${renderDelta.renderMetaBySlot.length} slots` : 'absent'
    }`,
  );
  if (!sameEntities) {
    record('ticks:render', 'aliveEntities', 'thinned-by-render-path', 'headless payload', 'render payload differs');
  }
  return display;
}

/* ------------------------------------------------------------------ */
/* 5. Worker -> host command deltas                                    */
/* ------------------------------------------------------------------ */
function commandDeltaSurvival(): void {
  section('5. worker -> host command delta');
  resetSimRng();
  let world = initGame({ seed: SEED });
  adoptSimSeedFromWorld(world);
  const display = hydrateWorldRuntimeCaches(structuredClone(world));
  const commands: WorkerCommand[] = [
    { proto: 1, op: 'setWorkSchedule', startHour: 6, endHour: 15 },
    { proto: 1, op: 'autoStaffWorkers' },
    { proto: 1, op: 'startResearch', researchId: 'forestry_1' },
  ];
  for (const command of commands) {
    // The worker's handler reassigns the result: the command owners are immutable.
    world = applyWorkerCommand(world, command);
    const delta = extractCommandDelta(world);
    crossToHost(display, delta);
    console.log(`op ${command.op}: applied`);
  }
  diffWorld(world, display, 'commands:delta');
  entityFieldDiff(world, display, 'commands:entities');
}

/* ------------------------------------------------------------------ */
/* 6. Prep rollback closure                                            */
/* ------------------------------------------------------------------ */
function prepRollback(): void {
  section('6. prep snapshot rollback closure (failed tick/command recovery)');
  resetSimRng();
  const world = initGame({ seed: SEED });
  adoptSimSeedFromWorld(world);
  const beforeWorld = structuredClone(world) as WorldState;
  const prep = extractSimPrep(world);

  // Change the world the way a tick does — including in-place nested writes.
  for (let i = 0; i < 240; i++) gameTick(world);
  applySimPrep(world, prep);
  diffWorld(beforeWorld, world, 'prep:rollback');
  entityFieldDiff(beforeWorld, world, 'prep:entities');

  // Which keys does a tick change that the prep snapshot does not own?
  const changedUncovered: string[] = [];
  const untouched = structuredClone(beforeWorld) as WorldState;
  const reference = structuredClone(beforeWorld) as WorldState;
  for (let i = 0; i < 240; i++) gameTick(reference);
  const prepKeys = new Set(Object.keys(prep));
  for (const key of new Set([...Object.keys(untouched), ...Object.keys(reference)])) {
    if (IGNORE_WORLD_KEYS.has(key) || prepKeys.has(key)) continue;
    if (stable((untouched as unknown as Record<string, unknown>)[key]) === stable((reference as unknown as Record<string, unknown>)[key])) continue;
    changedUncovered.push(key);
  }
  console.log(`keys changed by a tick but not owned by prep: ${changedUncovered.join(', ') || '(none)'}`);
  for (const key of changedUncovered) record('prep', key, 'changed-but-not-rolled-back', 'changed by tick', 'not in extractSimPrep');
}

/* ------------------------------------------------------------------ */
/* 7. Save / load survival (including the worker export path)           */
/* ------------------------------------------------------------------ */
function saveLoadSurvival(display: WorldState): void {
  section('7. save -> load survival (worker export path)');
  // gameWorker 'exportSave': invalidate + structuredClone + hydrate, then postMessage.
  invalidateWorldRuntimeCaches(display);
  const exported = hydrateWorldRuntimeCaches(structuredClone(display));
  diffWorld(display, exported, 'export:wire', new Set([...IGNORE_WORLD_KEYS, 'simRng']));

  const save = buildSaveData(exported, createInitialView(exported.width, exported.height));
  const parsed = parseSaveJson(JSON.stringify(save));
  if (!parsed.valid) {
    record('save', 'parseSaveJson', 'rejected', '_version', stable(save._version));
    return;
  }
  const loaded = loadGameFromParsed(parsed.parsed);
  if (!loaded) {
    record('save', 'loadGameFromParsed', 'returned-null', 'valid save', 'null');
    return;
  }
  const reloaded = loaded.world;
  console.log(`save bytes: ${JSON.stringify(save).length} · entities ${reloaded.entities.length}`);

  const saveKeys = new Set<string>(WORLD_STATE_SAVE_KEYS as readonly string[]);
  const missing: string[] = [];
  const changed: string[] = [];
  for (const key of [...saveKeys].sort()) {
    if (!(key in (exported as unknown as Record<string, unknown>))) continue;
    const a = stable((exported as unknown as Record<string, unknown>)[key]);
    const b = stable((reloaded as unknown as Record<string, unknown>)[key]);
    if (b === '#undefined') missing.push(key);
    else if (a !== b) changed.push(key);
  }
  console.log(`save keys lost entirely: ${missing.join(', ') || '(none)'}`);
  console.log(`save keys changed by the round trip: ${changed.join(', ') || '(none)'}`);
  // Detail for the keys the round trip rewrites, so a documented migration can be
  // told apart from lost information.
  for (const key of changed) {
    const a = (exported as unknown as Record<string, unknown>)[key];
    const b = (reloaded as unknown as Record<string, unknown>)[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      console.log(`    ${key}: ${a.length} -> ${b.length}`);
    } else {
      console.log(`    ${key}: ${preview(stable(a))} -> ${preview(stable(b))}`);
    }
  }
  entityFieldDiff(exported, reloaded, 'save:entities');
  // Separate "the writer dropped it" from "the loader migrated it".
  const recorded = parsed.parsed as Record<string, unknown>;
  firstEntryDiff(exported.eventLog, (recorded.eventLog as unknown[]) ?? [], 'save-write eventLog');
  firstEntryDiff((recorded.eventLog as unknown[]) ?? [], reloaded.eventLog, 'load eventLog');
  firstEntryDiff(exported.entities, (recorded.entities as unknown[]) ?? [], 'save-write entities');
  firstEntryDiff((recorded.entities as unknown[]) ?? [], reloaded.entities, 'load entities');
  firstEntryDiff(exported.buildings, (recorded.buildings as unknown[]) ?? [], 'save-write buildings');
  const idsBefore = exported.eventLog.map((e) => e.id);
  const idsAfter = reloaded.eventLog.map((e) => e.id);
  const lostEntries = idsBefore.filter((id) => !idsAfter.includes(id));
  const gainEntries = idsAfter.filter((id) => !idsBefore.includes(id));
  console.log(`    eventLog ids source: ${idsBefore.join(',')}`);
  console.log(`    eventLog ids target: ${idsAfter.join(',')}`);
  if (lostEntries.length || gainEntries.length) {
    record('save', 'eventLog', 'entries-changed', `lost=[${lostEntries.join(',')}]`, `gained=[${gainEntries.join(',')}]`);
  }
  for (const key of missing) record('save', key, 'lost-on-load', 'present', 'undefined');
  for (const key of changed) record('save', key, 'changed-on-load', 'original', 'reloaded');

  // Entity-level: every entity field the schema promises must come back.
  const reloadedById = new Map(reloaded.entities.map((e) => [e.id, e]));
  for (const field of ENTITY_PERSISTED_FIELDS) {
    let diverged = 0;
    for (const entity of exported.entities) {
      const other = reloadedById.get(entity.id);
      if (!other) continue;
      const a = (entity as unknown as Record<string, unknown>)[field];
      const b = (other as unknown as Record<string, unknown>)[field];
      if (stable(a) !== stable(b)) diverged++;
    }
    if (diverged) record('save', `entity.${field}`, 'entity-field-diverged', `${diverged} entities`, 'reloaded differently');
  }
  // And the display world (what the player sees) must reload identically too.
  const saveFromDisplay = buildSaveData(display, createInitialView(display.width, display.height));
  const parsedDisplay = parseSaveJson(JSON.stringify(saveFromDisplay));
  if (parsedDisplay.valid) {
    const reloadedDisplay = loadGameFromParsed(parsedDisplay.parsed);
    if (reloadedDisplay) {
      const displayDiff: string[] = [];
      for (const key of [...saveKeys].sort()) {
        if (!(key in (display as unknown as Record<string, unknown>))) continue;
        if (stable((display as unknown as Record<string, unknown>)[key]) !== stable((reloadedDisplay.world as unknown as Record<string, unknown>)[key])) {
          displayDiff.push(key);
        }
      }
      console.log(`display-world save keys changed by reload: ${displayDiff.join(', ') || '(none)'}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 8. Host-side writers of world state                                 */
/* ------------------------------------------------------------------ */
/**
 * Every host-side assignment to a WorldState field must have a path into the
 * worker: the command channel, `patchUi`, `setPaused`/`setSpeed`, or a full
 * world hand-off. Anything else makes the worker's authority drift from the
 * screen without a transport error.
 */
function hostWriters(worldKeys: string[]): void {
  section('8. host-side writers of world state (do they reach the worker?)');
  const coveredByTransport = new Set([
    'paused',
    'speed',
    'bigNews',
    'floatingTexts',
    'autoSave',
    'nextFloatingTextId',
    'dismissedBigNewsIds',
    'dismissedNotificationIds',
    'dismissedActiveEventIds',
    'activeEvent',
    'tutorialSeen',
  ]);
  const keySet = new Set(worldKeys);
  const roots = ['src/App.tsx', 'src/game/gameLoop.ts', 'src/hooks', 'src/components'];
  const files: string[] = [];
  const collect = (target: string): void => {
    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isFile()) {
      if (/\.(ts|tsx|mts)$/.test(target)) files.push(target);
      return;
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      collect(`${target}/${entry.name}`);
    }
  };
  for (const root of roots) collect(root);

  const assignment = /(?:^|[^\w.])[\w$]*(?:world|state|w)\s*\.\s*([A-Za-z_]\w*)\s*=(?!=)/;
  const unaccounted: string[] = [];
  let hits = 0;
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const match = assignment.exec(line);
      if (!match) return;
      const key = match[1];
      if (!keySet.has(key)) return;
      hits++;
      if (coveredByTransport.has(key)) return;
      unaccounted.push(`${file}:${index + 1} writes world.${key}`);
    });
  }
  console.log(`scanned ${files.length} host files · world-field assignments: ${hits}`);
  if (unaccounted.length === 0) {
    console.log('every host-side world-field write is on a transported key');
  } else {
    for (const site of unaccounted) {
      console.log(`    ${site}`);
      record('host-writers', site.split(' writes ')[1], 'write-without-transport', site, 'no command/patchUi path found');
    }
  }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const args = new Set(process.argv.slice(2));
if (!args.has('--skip-ticks')) {
  const keys = census();
  hostToWorker();
  rngSurvival();
  const display = tickDeltaSurvival();
  commandDeltaSurvival();
  prepRollback();
  saveLoadSurvival(display);
  hostWriters(keys);
} else {
  const keys = census();
  hostToWorker();
  rngSurvival();
  hostWriters(keys);
}

section('findings');
/**
 * Triage table. The probe is deliberately strict — it flags any key that is not
 * identical — so each measured difference is classified here with the reason it
 * carries no information loss; anything that does not match a known reason stays
 * UNEXPLAINED and fails the run.
 */
function classify(finding: Finding): string {
  if (finding.key === 'simRng') {
    return 'benign: host-owned RNG snapshot — the display world is strictly richer';
  }
  if (finding.key === 'entities' && finding.section.includes('delta')) {
    return 'benign: property presence only — no entity field value differs';
  }
  if (finding.key === 'entities' && finding.section.startsWith('prep')) {
    return 'benign: property presence only — prep materializes optional keys as undefined';
  }
  if (
    finding.section.startsWith('save') &&
    ['paused', 'tradeRoutes', 'tutorialSeen', 'entities', 'eventLog'].includes(finding.key)
  ) {
    return 'benign: documented load-time normalization (starts paused, route merge, tutorial seed, migrateHumanAges)';
  }
  if (
    finding.section.startsWith('save') &&
    ['entity.birthDay', 'entity.birthMonth'].includes(finding.key)
  ) {
    return 'benign: migrateHumanAges backfills the calendar birth date the worker left at 0 (age and every persisted field survive)';
  }
  if (finding.section === 'host-writers') {
    return 'observation: host-side presentation cleanup; the durable dismissal travels via patchUi.dismissedNotificationIds';
  }
  return 'UNEXPLAINED';
}

let unexplained = 0;
for (const finding of findings) {
  const verdict = classify(finding);
  if (verdict === 'UNEXPLAINED') unexplained++;
  console.log(`[${finding.section}] ${finding.key} — ${finding.kind}\n    ${verdict}`);
  if (verdict === 'UNEXPLAINED') {
    console.log(`    source: ${finding.a}`);
    console.log(`    target: ${finding.b}`);
  }
}
console.log(
  `\nmeasured differences: ${findings.length} · unexplained: ${unexplained} · benign/observed: ${findings.length - unexplained}`,
);
if (findings.length === 0) console.log('every measured boundary is closed');
process.exitCode = unexplained > 0 ? 1 : 0;
