/**
 * D1 — Deterministic production simulation seed (roadmap v0.6.3).
 *
 * One base seed per run; each simulation owner derives an independent stream
 * from that seed. Flavor/social draws use stateless context rolls so a single
 * call-order difference cannot shift the shared simulation stream.
 */

let currentSeed = 1;
const streams = new Map<string, () => number>();

/** Native Math.random captured at module load — used to avoid clobbering test mocks. */
const NATIVE_MATH_RANDOM = Math.random;
let installedSeededGlobal = false;
let seededGlobalStream: (() => number) | null = null;

/** FNV-1a string hash → uint32 (salt for owner streams). */
function hashSalt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Create an independent mulberry32 stream from a base seed and an owner salt. */
export function createSeededRng(seed: number, owner: string): () => number {
  let s = (((seed >>> 0) ^ hashSalt(owner)) + 0x6d2b79f5) >>> 0;
  return function mulberry32(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stateless context roll — same seed + salt always yields the same 0..1 value.
 * Used by flavor/social draws so a single global call order cannot shift the
 * simulation stream (D1 long-replay determinism).
 */
export function seededRandom(seed: number, salt: string): number {
  return createSeededRng(seed, salt)();
}

/** Stateless context roll using the current run seed. */
export function seededRandomForRun(salt: string): number {
  return seededRandom(currentSeed, salt);
}

/** Set the base seed for the current run and drop all per-owner streams. */
export function setSimSeed(seed: number): void {
  currentSeed = (seed >>> 0) || 1;
  streams.clear();
  if (installedSeededGlobal) {
    seededGlobalStream = createSeededRng(currentSeed, "__global__");
  }
}

/** Current run seed (useful for save/replay metadata). */
export function getSimSeed(): number {
  return currentSeed;
}

/** Lazy per-owner stream for the current run seed. */
export function getSimRng(owner: string): () => number {
  let rng = streams.get(owner);
  if (!rng) {
    rng = createSeededRng(currentSeed, owner);
    streams.set(owner, rng);
  }
  return rng;
}

/**
 * Install a seeded global Math.random fallback for the current run.
 * Does not clobber an existing test mock (Math.random !== native at install).
 */
export function enableSeededGlobalRandom(): void {
  if (installedSeededGlobal || Math.random !== NATIVE_MATH_RANDOM) return;
  seededGlobalStream = createSeededRng(currentSeed, "__global__");
  Math.random = () => seededGlobalStream!();
  installedSeededGlobal = true;
}

/** Restore native Math.random (test/teardown helper). */
export function disableSeededGlobalRandom(): void {
  if (!installedSeededGlobal) return;
  Math.random = NATIVE_MATH_RANDOM;
  installedSeededGlobal = false;
  seededGlobalStream = null;
}

/** Test/teardown helper — resets the run seed, all streams, and global override. */
export function resetSimRng(): void {
  disableSeededGlobalRandom();
  currentSeed = 1;
  streams.clear();
}
