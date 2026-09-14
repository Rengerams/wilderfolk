
export type RngStream = () => number;

let currentSeed = 1;
const streams = new Map<string, RngStream>();

/**
 * Live 32-bit state of a created stream. Mulberry32 keeps `s` inside the closure, so a
 * rollback/save snapshot needs a handle to read it and to reset it in place — re-deriving the
 * stream from its seed would replay every draw instead of resuming it.
 */
interface StreamStateHandle {
  get(): number;
  set(state: number): void;
}
const streamStates = new WeakMap<RngStream, StreamStateHandle>();

/** Native Math.random captured at module load — prevents clobbering test runners. */
const NATIVE_MATH_RANDOM = Math.random;
let installedSeededGlobal = false;
let seededGlobalStream: RngStream | null = null;

/**
 * 32-bit FNV-1a string hash used to derive independent stream salts.
 */
export function hashSalt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Creates an independent Mulberry32 PRNG stream from a base seed and domain salt.
 * State is pre-mixed to ensure maximum entropy on the very first draw.
 */
export function createSeededRng(seed: number, owner: string): RngStream {
  let s = (((seed >>> 0) ^ hashSalt(owner)) + 0x6d2b79f5) >>> 0;

  // Pre-mix initial state to eliminate low-entropy seed correlation artifacts
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  s = (s ^ t) >>> 0;

  const stream: RngStream = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = s;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  // Register the state handle so a snapshot can read/reset this stream in place. `seededRandom`
  // and `seededRandomForRun` also create throwaway streams; their handles are harmless (the
  // WeakMap drops them with the function) and only the streams in `streams` are ever snapshotted.
  streamStates.set(stream, { get: () => s, set: (state: number) => { s = state >>> 0; } });
  return stream;
}

/**
 * Stateless context roll: [seed + salt] always returns the exact same float in [0, 1).
 */
export function seededRandom(seed: number, salt: string): number {
  return createSeededRng(seed, salt)();
}

/**
 * Stateless context roll using the active colony seed.
 */
export function seededRandomForRun(salt: string): number {
  return seededRandom(currentSeed, salt);
}

/**
 * Sets the base simulation seed and drops all cached per-owner streams.
 */
export function setSimSeed(seed: number): void {
  currentSeed = (seed >>> 0) || 1;
  streams.clear();
  if (installedSeededGlobal) {
    seededGlobalStream = createSeededRng(currentSeed, '__global__');
  }
}

/**
 * The host's own `Math.random`, captured at module load.
 *
 * This is the *only* legitimate `Math.random` consumer left in the simulation, and it is for
 * choosing a new game's seed: `initGame` and `adoptSimSeedFromWorld` install the seeded
 * global override, so drawing the next game's seed through `Math.random` would take it from
 * the previous game's seeded stream (making a second new game in one session anything but
 * fresh) instead of from entropy.
 */
export function nativeRandom(): number {
  return NATIVE_MATH_RANDOM();
}

/**
 * Returns the current active simulation seed.
 */
export function getSimSeed(): number {
  return currentSeed;
}

/** Persistable positions of a realm's RNG streams (see `snapshotSimRng`). */
export interface SimRngSnapshot {
  seed: number;
  /** State of the seeded `Math.random` override, or null when it is not installed. */
  global: number | null;
  /** Per-owner Mulberry32 states, in stream-creation order. */
  owners: Array<[string, number]>;
}

/**
 * Capture every live stream position so a resumed or retried world continues its draws.
 *
 * Without this, a loaded colony and a rolled-back tick both restart each owner's sequence from
 * its beginning: the world state is restored but the randomness is replayed, which the audit
 * recorded as "a resumed or retried world cannot reproduce its continuation" (cross-cutting
 * X5). Stateless rolls (`seededRandomForRun`, `personDayRoll`) need nothing here — they derive
 * from the seed and their call site.
 */
export function snapshotSimRng(): SimRngSnapshot {
  const owners: Array<[string, number]> = [];
  for (const [owner, stream] of streams) {
    const handle = streamStates.get(stream);
    if (handle) owners.push([owner, handle.get()]);
  }
  const globalState = seededGlobalStream ? streamStates.get(seededGlobalStream)?.get() : undefined;
  return { seed: currentSeed, global: globalState ?? null, owners };
}

/** Validate an untrusted snapshot (save files) into the shape `restoreSimRng` accepts. */
export function parseSimRngSnapshot(value: unknown): SimRngSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.seed !== 'number' || !Number.isFinite(record.seed)) return null;

  const owners: Array<[string, number]> = [];
  if (Array.isArray(record.owners)) {
    for (const entry of record.owners) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [owner, state] = entry as [unknown, unknown];
      if (typeof owner !== 'string') continue;
      if (typeof state !== 'number' || !Number.isFinite(state)) continue;
      owners.push([owner, state >>> 0]);
    }
  }

  return {
    seed: record.seed >>> 0,
    global:
      typeof record.global === 'number' && Number.isFinite(record.global) ? record.global >>> 0 : null,
    owners,
  };
}

/**
 * Resume the streams from a snapshot. Existing stream objects are reset **in place** so a module
 * that cached `getSimRng(owner)` keeps drawing from the restored position; streams this realm
 * created after the snapshot are dropped (they did not exist at that point, so re-deriving them
 * from the seed is exact). Returns false when the snapshot is missing or not credible, which
 * leaves the realm on the seed-only behaviour (older saves).
 */
export function restoreSimRng(snapshot: unknown): boolean {
  const parsed = parseSimRngSnapshot(snapshot);
  if (!parsed) return false;

  currentSeed = parsed.seed >>> 0 || 1;
  const pending = new Map(parsed.owners);
  for (const [owner, stream] of [...streams]) {
    const state = pending.get(owner);
    if (state === undefined) {
      streams.delete(owner);
      continue;
    }
    streamStates.get(stream)?.set(state);
    pending.delete(owner);
  }
  for (const [owner, state] of pending) {
    const stream = getSimRng(owner);
    streamStates.get(stream)?.set(state);
  }

  if (parsed.global != null) {
    enableSeededGlobalRandom();
    const global = seededGlobalStream;
    if (global) streamStates.get(global)?.set(parsed.global);
  }
  return true;
}

/**
 * Adopt the seed a world already carries.
 *
 * A realm that *receives* a world rather than creating one — the simulation worker, or a
 * loaded save — begins with this module's default seed. Without adopting the world's own
 * `worldMap.seed`, every `getSimRng(owner)` and `seededRandomForRun()` draw in that realm
 * comes from seed 1 while the world was built with its map seed: the same world then
 * diverges between worker mode and main-thread mode, and two different seeds share one set
 * of random streams. Installing the seeded global also covers the few third-party or
 * reach-through paths that still call `Math.random` directly.
 */
export function adoptSimSeedFromWorld(world: { worldMap?: { seed?: number } | null }): number {
  const seed = world.worldMap?.seed ?? 1;
  setSimSeed(seed);
  enableSeededGlobalRandom();
  return seed;
}

/**
 * Retrieves or lazily creates a domain-isolated PRNG stream for the current run seed.
 */
export function getSimRng(owner: string): RngStream {
  let rng = streams.get(owner);
  if (!rng) {
    rng = createSeededRng(currentSeed, owner);
    streams.set(owner, rng);
  }
  return rng;
}

// ============ UTILITY SAMPLING HELPERS ============

/**
 * Draws a random floating-point number in range [min, max) using the given stream.
 */
export function randomFloat(rng: RngStream, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Draws a random integer in range [min, max] inclusive using the given stream.
 */
export function randomInt(rng: RngStream, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  return Math.floor(lo + rng() * (hi - lo + 1));
}

/**
 * Selects a random element from an array using the given stream.
 */
export function randomChoice<T>(rng: RngStream, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.floor(rng() * items.length);
  return items[idx];
}

/**
 * Evaluates a Bernoulli trial with probability `chance` [0..1].
 */
export function randomBool(rng: RngStream, chance = 0.5): boolean {
  return rng() < chance;
}

// ============ GLOBAL HOOKS & TEST HELPERS ============

/**
 * Installs a seeded global `Math.random` override for headless testing.
 * Preserves test framework spies if Math.random was already mocked.
 */
export function enableSeededGlobalRandom(): void {
  if (installedSeededGlobal || Math.random !== NATIVE_MATH_RANDOM) return;
  seededGlobalStream = createSeededRng(currentSeed, '__global__');
  Math.random = () => seededGlobalStream!();
  installedSeededGlobal = true;
}

/**
 * Restores native `Math.random`.
 */
export function disableSeededGlobalRandom(): void {
  if (!installedSeededGlobal) return;
  Math.random = NATIVE_MATH_RANDOM;
  installedSeededGlobal = false;
  seededGlobalStream = null;
}

/**
 * Full teardown utility for unit tests — resets seed, clears caches, and uninstalls hooks.
 */
export function resetSimRng(): void {
  disableSeededGlobalRandom();
  currentSeed = 1;
  streams.clear();
}