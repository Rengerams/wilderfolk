export type RngStream = () => number;

let currentSeed = 1;
const streams = new Map<string, RngStream>();
/**
 * Main-thread presentation streams (screen shake, weather particles, sfx, the intro canvas).
 *
 * They are deliberately **not** in `streams`: `snapshotSimRng`/`restoreSimRng` carry the simulation
 * worker's stream positions, and the worker never draws a presentation stream. Leaving them in the
 * same registry meant every applied tick delta rewound them to the position frozen at the last
 * upload — or deleted a stream created after it — so weather respawn positions, screen shake and sfx
 * variation restarted from the same values ~3×/s. Use
 * `getPresentationRng` for these; `getSimRng` stays the simulation namespace.
 */
const presentationStreams = new Map<string, RngStream>();

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
 * Advances a Mulberry32 state by one step: `s = (s + 0x6d2b79f5) >>> 0`.
 *
 * Split from {@link mulberry32Draw} rather than returned as a `{ state, value }` tuple so the hot
 * stream body and closure-free callers (`renffrStar`, hot paths) stay allocation-free; the two
 * together are the one definition of the generator step (`duplication-deadcode.md` A21 — the copy in
 * `renffrStar.ts` had already drifted, omitting this file's documented pre-mix).
 */
export function mulberry32Advance(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

/** Mulberry32 output mix for an already-advanced state, as a float in `[0, 1)`. */
export function mulberry32Draw(advancedState: number): number {
  let t = advancedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Creates an independent Mulberry32 PRNG stream from a base seed and domain salt.
 * State is pre-mixed to ensure maximum entropy on the very first draw.
 */
export function createSeededRng(seed: number, owner: string): RngStream {
  let s = mulberry32Advance(((seed >>> 0) ^ hashSalt(owner)) >>> 0);

  // Pre-mix initial state to eliminate low-entropy seed correlation artifacts
  const preMixed = mulberry32Advance(s);
  let t = preMixed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  s = (preMixed ^ t) >>> 0;

  const stream: RngStream = () => {
    s = mulberry32Advance(s);
    return mulberry32Draw(s);
  };

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
 * Sets the base simulation seed and drops all cached per-owner streams (simulation and presentation).
 */
export function setSimSeed(seed: number): void {
  currentSeed = (seed >>> 0) || 1;
  streams.clear();
  presentationStreams.clear();
  if (installedSeededGlobal) {
    seededGlobalStream = createSeededRng(currentSeed, '__global__');
  }
}

/**
 * The host's own `Math.random`, captured at module load.
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
 * Simulation streams only — presentation streams (`getPresentationRng`) are main-thread-only and are
 * never captured or restored.
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
 * Resume streams from a snapshot. Existing stream objects are reset in place. Presentation streams
 * are outside the snapshot and are left untouched.
 */
export function restoreSimRng(snapshot: unknown): boolean {
  const parsed = parseSimRngSnapshot(snapshot);
  if (!parsed) return false;

  currentSeed = parsed.seed >>> 0 || 1;
  const pending = new Map(parsed.owners);
  // Iterate via Array.from to satisfy TypeScript iterating over Map.entries
  for (const [owner, stream] of Array.from(streams.entries())) {
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
 */
export function adoptSimSeedFromWorld(world: { worldMap?: { seed?: number } | null }): number {
  const seed = world.worldMap?.seed ?? 1;
  setSimSeed(seed);
  enableSeededGlobalRandom();
  return seed;
}

/**
 * Retrieves or lazily creates a domain-isolated PRNG stream for the current run seed.
 *
 * Simulation namespace: streams created here travel with the world (save file, worker hand-off,
 * prep rollback, tick delta). Presentation-owned randomness must use `getPresentationRng` instead,
 * or a restored snapshot will rewind it.
 */
export function getSimRng(owner: string): RngStream {
  let rng = streams.get(owner);
  if (!rng) {
    rng = createSeededRng(currentSeed, owner);
    streams.set(owner, rng);
  }
  return rng;
}

/**
 * Retrieves or lazily creates a main-thread **presentation** stream (screen shake, weather
 * particles, sfx, intro canvas).
 *
 * Seeded from the active simulation seed so a replay of one seed still looks the same, but kept in a
 * separate registry that `snapshotSimRng`/`restoreSimRng` never read or write: the simulation worker
 * cannot know a presentation stream's position, so its snapshot must not rewind or delete one.
 * `setSimSeed`/`resetSimRng` do clear this registry, so a new world starts every stream fresh.
 */
export function getPresentationRng(owner: string): RngStream {
  let rng = presentationStreams.get(owner);
  if (!rng) {
    rng = createSeededRng(currentSeed, owner);
    presentationStreams.set(owner, rng);
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
 * Full teardown utility for unit tests — resets seed, clears caches (simulation and presentation),
 * and uninstalls hooks.
 */
export function resetSimRng(): void {
  disableSeededGlobalRandom();
  currentSeed = 1;
  streams.clear();
  presentationStreams.clear();
}