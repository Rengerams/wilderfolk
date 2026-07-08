import { vi } from 'vitest';

/** Deterministic 32-bit PRNG — same seed yields identical Math.random() sequence. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spy Math.random with a seeded sequence for the duration of `fn`. */
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const rng = mulberry32(seed);
  const spy = vi.spyOn(Math, 'random').mockImplementation(rng);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

/** Fixed sequence — use when a test needs explicit roll values, not a full seed stream. */
export function withRandomSequence<T>(rolls: number[], fn: () => T): T {
  let i = 0;
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => rolls[Math.min(i++, rolls.length - 1)]);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}