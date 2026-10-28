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

// Curated 512px albedos from rubberduck's CC0 50-texture pack. Other albedos
// remain available for future buildings/paths but are never loaded into the map
// without a material that actually uses them.
export const TERRAIN_MATERIAL_PATHS = {
  sand: '/sprites/terrain/rubberduck/246.jpg',
  soil: '/sprites/terrain/rubberduck/206.jpg',
  drySoil: '/sprites/terrain/rubberduck/217.jpg',
  gravel: '/sprites/terrain/rubberduck/232.jpg',
  rock: '/sprites/terrain/rubberduck/235.jpg',
  straw: '/sprites/terrain/rubberduck/210.jpg',
  pebbles: '/sprites/terrain/rubberduck/215.jpg',
} as const;

export type NaturalTerrainMaterial = keyof typeof TERRAIN_MATERIAL_PATHS;

// The original Cethiel pack. Dirt_03 has parallel ruts: keep it available for
// future deliberate path/farm painting, never random-repeat it as natural soil.
export const DIRT_TEXTURE_PATHS = {
  loam: '/sprites/terrain/cethiel/Dirt_01.png',
  coarseSoil: '/sprites/terrain/cethiel/Dirt_02.png',
  rutted: '/sprites/terrain/cethiel/Dirt_03.png',
  leafLitter: '/sprites/terrain/cethiel/Dirt_04.png',
} as const;

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

function decodeTerrainAlbedo(image: HTMLImageElement): GroundGrassTexture | null {
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
  const aa = decodeTerrainAlbedo(a), bb = decodeTerrainAlbedo(b);
  const cc = decodeTerrainAlbedo(c), dd = decodeTerrainAlbedo(d);
  return aa && bb && cc && dd ? [aa, bb, cc, dd] : null;
}

export type LoadedTerrainMaterials = Record<NaturalTerrainMaterial, GroundGrassTexture>;

/** Decode the seven used photographic materials at most once per loaded image. */
export function loadedTerrainMaterials(): LoadedTerrainMaterials | null {
  const sand = getSprite(TERRAIN_MATERIAL_PATHS.sand);
  const soil = getSprite(TERRAIN_MATERIAL_PATHS.soil);
  const drySoil = getSprite(TERRAIN_MATERIAL_PATHS.drySoil);
  const gravel = getSprite(TERRAIN_MATERIAL_PATHS.gravel);
  const rock = getSprite(TERRAIN_MATERIAL_PATHS.rock);
  const straw = getSprite(TERRAIN_MATERIAL_PATHS.straw);
  const pebbles = getSprite(TERRAIN_MATERIAL_PATHS.pebbles);
  if (!sand || !soil || !drySoil || !gravel || !rock || !straw || !pebbles) return null;
  const values = [
    decodeTerrainAlbedo(sand), decodeTerrainAlbedo(soil), decodeTerrainAlbedo(drySoil),
    decodeTerrainAlbedo(gravel), decodeTerrainAlbedo(rock),
    decodeTerrainAlbedo(straw), decodeTerrainAlbedo(pebbles),
  ];
  if (values.some((texture) => !texture)) return null;
  return {
    sand: values[0]!, soil: values[1]!, drySoil: values[2]!,
    gravel: values[3]!, rock: values[4]!,
    straw: values[5]!, pebbles: values[6]!,
  };
}

/**
 * Add colour-neutral material relief to a reusable RGB tuple. Uses the world XY
 * position rather than chunk-relative UV, keeping 2.5D chunk seams invisible.
 */
export function sampleTerrainMaterial(
  texture: GroundGrassTexture,
  worldX: number, worldY: number,
  out: [number, number, number],
): void {
  const x = ((Math.floor(worldX) % texture.width) + texture.width) % texture.width;
  const y = ((Math.floor(worldY) % texture.height) + texture.height) % texture.height;
  const i = (y * texture.width + x) * 4;
  out[0] = texture.pixels[i] - texture.mean[0];
  out[1] = texture.pixels[i + 1] - texture.mean[1];
  out[2] = texture.pixels[i + 2] - texture.mean[2];
}

/** Three natural ground variants; the directional Dirt_03 is deliberately excluded. */
export interface CethielDirtTextures {
  loam: GroundGrassTexture;
  coarseSoil: GroundGrassTexture;
  leafLitter: GroundGrassTexture;
}

/** Decodes the three appropriate dirt images through the shared albedo cache. */
export function loadedDirtTextures(): CethielDirtTextures | null {
  const loam = getSprite(DIRT_TEXTURE_PATHS.loam);
  const coarse = getSprite(DIRT_TEXTURE_PATHS.coarseSoil);
  const leaves = getSprite(DIRT_TEXTURE_PATHS.leafLitter);
  if (!loam || !coarse || !leaves) return null;
  const a = decodeTerrainAlbedo(loam);
  const b = decodeTerrainAlbedo(coarse);
  const c = decodeTerrainAlbedo(leaves);
  return a && b && c ? { loam: a, coarseSoil: b, leafLitter: c } : null;
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
