
export type RngStream = () => number;

let currentSeed = 1;
const streams = new Map<string, RngStream>();

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

  return function mulberry32(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = s;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
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
 * Returns the current active simulation seed.
 */
export function getSimSeed(): number {
  return currentSeed;
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