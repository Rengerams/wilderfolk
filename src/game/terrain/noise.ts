/**
 * Noise & PRNG primitives for the procedural map generator.
 *
 * Ported verbatim from Teraforge (`src/lib/noise.ts`) so the two generators share
 * one deterministic engine — same seed + settings = same terrain in both projects.
 */

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  frequency?: number;
}

export function fbm(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const { octaves = 5, lacunarity = 2.03, gain = 0.5, frequency = 1 } = opts;
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function ridged(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const { octaves = 5, lacunarity = 2.07, gain = 0.55, frequency = 1 } = opts;
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 7717) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function warp(
  x: number,
  y: number,
  seed: number,
  strength: number,
  freq: number,
): [number, number] {
  const wx = fbm(x * freq + 11.3, y * freq - 4.7, seed + 5501, { octaves: 3 }) - 0.5;
  const wy = fbm(x * freq - 8.1, y * freq + 2.9, seed + 9907, { octaves: 3 }) - 0.5;
  return [x + wx * strength, y + wy * strength];
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothRange(edge0: number, edge1: number, x: number): number {
  return smoothstep(clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1));
}

export function ridgedMulti(x: number, y: number, seed: number, octaves: number, gain: number): number {
  const lacunarity = 2.07;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 7717) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
