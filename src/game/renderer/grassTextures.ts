/**
 * Continuous, image-based understory material for v4 terrain.
 *
 * Original 512×512 tileable PNGs by Cethiel (CC0):
 * https://opengameart.org/content/tileable-grass-textures-set-1
 *
 * The Whittaker terrain bakes offline in world-aligned bands. Sampling decoded
 * albedo pixels by absolute world coordinates is crucial: independently baked
 * terrain chunks must have identical pixels at their shared boundaries.
 *
 * Source textures are loaded once during sprite preload and decoded once into
 * typed arrays, not decoded or drawn separately for every ground pixel.
 */
import { MapPreset } from '../gameTypes';
import { getSprite } from '../spriteLoader';

export const GRASS_TEXTURE_PATHS = [
  '/sprites/terrain/cethiel/Grass_03.png', // open grass, readable individual leaves
  '/sprites/terrain/cethiel/Grass_04.png', // flower-rich meadow cover
  '/sprites/terrain/cethiel/Grass_02.png', // diverse woodland floor
  '/sprites/terrain/cethiel/Grass_01.png', // dense broadleaf vegetation
] as const;

export interface GroundGrassTexture {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Per-channel texture mean for colour-preserving, palette-safe compositing. */
  mean: readonly [number, number, number];
}

export type GroundGrassTextures = readonly [
  GroundGrassTexture,
  GroundGrassTexture,
  GroundGrassTexture,
  GroundGrassTexture,
];

const decoded = new WeakMap<HTMLImageElement, GroundGrassTexture>();

function decodeGrassTexture(image: HTMLImageElement): GroundGrassTexture | null {
  const cached = decoded.get(image);
  if (cached) return cached;
  if (typeof document === 'undefined' || !image.width || !image.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const channels: [number, number, number] = [0, 0, 0];
  // Sample every fourth pixel to calculate a stable albedo baseline in a bounded
  // one-time pass; texture detail then changes morphology without erasing biome hues.
  let count = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    channels[0] += pixels[i];
    channels[1] += pixels[i + 1];
    channels[2] += pixels[i + 2];
    count++;
  }
  const texture = {
    width: image.width,
    height: image.height,
    pixels,
    mean: [channels[0] / count, channels[1] / count, channels[2] / count] as const,
  };
  decoded.set(image, texture);
  // Decode CPU pixels once. The browser can release the temporary staging canvas.
  canvas.width = 0;
  canvas.height = 0;
  return texture;
}

/** Returns null until all four artist PNGs are loaded; legacy fallback stays available. */
export function loadedGrassTextures(): GroundGrassTextures | null {
  const a = getSprite(GRASS_TEXTURE_PATHS[0]);
  const b = getSprite(GRASS_TEXTURE_PATHS[1]);
  const c = getSprite(GRASS_TEXTURE_PATHS[2]);
  const d = getSprite(GRASS_TEXTURE_PATHS[3]);
  if (!a || !b || !c || !d) return null;
  const aa = decodeGrassTexture(a), bb = decodeGrassTexture(b);
  const cc = decodeGrassTexture(c), dd = decodeGrassTexture(d);
  return aa && bb && cc && dd ? [aa, bb, cc, dd] : null;
}

function smooth01(t: number): number {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
}

/**
 * Adds palette-neutral RGB texture *detail* to the supplied reusable tuple.
 * The Whittaker ground owns colour and climate; this layer only supplies authored
 * leaves, grasses, and flower texture. No per-pixel objects or arrays are allocated.
 */
export function grassDetailAt(
  textures: GroundGrassTextures,
  worldX: number,
  worldY: number,
  moisture: number,
  forestCut: number,
  denseForestCut: number,
  preset: MapPreset,
  out: [number, number, number],
): void {
  const forest = smooth01((moisture - (forestCut - 0.10)) / 0.24);
  const dense = forest * smooth01((moisture - (denseForestCut - 0.09)) / 0.20);
  const open = 1 - forest;
  const flowery = open * (preset === MapPreset.Meadows ? 0.72 : 0.12);
  const standard = open - flowery;
  const woodland = forest - dense;

  out[0] = 0; out[1] = 0; out[2] = 0;
  for (let i = 0; i < textures.length; i++) {
    const weight = i === 0 ? standard : i === 1 ? flowery : i === 2 ? woodland : dense;
    if (weight < 0.001) continue;
    const tex = textures[i];
    // A source texel covers one world pixel: no per-chunk UV origin, hence no seams.
    const x = ((Math.floor(worldX) % tex.width) + tex.width) % tex.width;
    const y = ((Math.floor(worldY) % tex.height) + tex.height) % tex.height;
    const offset = (y * tex.width + x) * 4;
    out[0] += (tex.pixels[offset] - tex.mean[0]) * weight;
    out[1] += (tex.pixels[offset + 1] - tex.mean[1]) * weight;
    out[2] += (tex.pixels[offset + 2] - tex.mean[2]) * weight;
  }
}
