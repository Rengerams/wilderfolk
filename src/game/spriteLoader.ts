import { BUILDING_CONFIGS } from './gameTypes';

export interface SpriteFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Y anchor within the frame (0 = top, 1 = feet). Defaults to 0.85 in drawSpriteFrame. */
  anchorY?: number;
}

const spriteCache = new Map<string, HTMLImageElement>();
const frameCache = new Map<string, SpriteFrame>();
const loadingPromises = new Map<string, Promise<SpriteFrame>>();

let humanSpritesReady = false;

/** Kept in sync with humanSprites path constants (no import — avoids circular dep). */
const HUMAN_SPRITE_PATHS = new Set<string>([
  '/sprites/human_male.png',
  '/sprites/human_female.png',
  '/sprites/human_male_toddler_v1.png',
  '/sprites/human_female_toddler_v1.png',
  '/sprites/human_male_v0.png',
  '/sprites/human_male_v1.png',
  '/sprites/human_male_v2.png',
  '/sprites/human_male_v3.png',
  '/sprites/human_male_v4.png',
  '/sprites/human_male_v5.png',
  '/sprites/human_male_v6.png',
  '/sprites/human_male_v7.png',
  '/sprites/human_female_v0.png',
  '/sprites/human_female_v1.png',
  '/sprites/human_female_v2.png',
  '/sprites/human_female_v3.png',
  '/sprites/human_female_v4.png',
  '/sprites/human_female_v5.png',
  '/sprites/human_female_v6.png',
  '/sprites/human_female_v7.png',
]);

export function loadSprite(src: string): Promise<SpriteFrame> {
  if (frameCache.has(src)) return Promise.resolve(frameCache.get(src)!);
  if (loadingPromises.has(src)) return loadingPromises.get(src)!;

  const promise = new Promise<SpriteFrame>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(src, img);
      // Use full image bounds — alpha trim skews aspect ratio and warps sprites.
      const isHumanSprite = HUMAN_SPRITE_PATHS.has(src);
      const frame: SpriteFrame = {
        image: img,
        sx: 0,
        sy: 0,
        sw: img.width,
        sh: img.height,
        // Pioneer PNGs are authored feet-down; anchor the bottom edge when drawing.
        ...(isHumanSprite ? { anchorY: 1 as const } : {}),
      };
      frameCache.set(src, frame);
      loadingPromises.delete(src);
      resolve(frame);
    };
    img.onerror = () => {
      loadingPromises.delete(src);
      reject(new Error(`Failed to load sprite: ${src}`));
    };
    img.src = src;
  });

  loadingPromises.set(src, promise);
  return promise;
}

export function getSprite(src: string): HTMLImageElement | null {
  return spriteCache.get(src) || null;
}

export function getSpriteFrame(src: string): SpriteFrame | null {
  return frameCache.get(src) || null;
}

export function isSpriteLoaded(src: string): boolean {
  return frameCache.has(src);
}

export function isHumanSpritesReady(): boolean {
  return humanSpritesReady;
}

export async function loadHumanWalkSheets(): Promise<void> {
  await Promise.all(Array.from(HUMAN_SPRITE_PATHS).map(loadSprite));
  humanSpritesReady = true;
}


export function preloadAllSprites(): Promise<void> {
  const wildlifeAndHumans = [
    '/sprites/rabbit.png',
    '/sprites/deer.png',
    '/sprites/wolf.png',
    '/sprites/huntingspot.png',
    '/sprites/fox.png',
    '/sprites/tree.png',
    '/sprites/tree2.png',
    '/sprites/blueberry_tree.png',
    '/sprites/grass.png',
    '/sprites/grass2.png',
    '/sprites/bush.png',
    '/sprites/stump.png',
    '/sprites/tile_pavement.png',
    // Leader's manor — not yet wired to a BuildingType, preloaded explicitly.
    '/sprites/house_leader.png',
    '/sprites/human_male.png',
    '/sprites/human_female.png',
    // Seamless ground fills (Phase A terrain — stamped in bakeTerrainLayer)
    '/sprites/terrain/grass_fill.png',
    '/sprites/terrain/dirt_fill.png',
    '/sprites/terrain/sand_fill.png',
    '/sprites/terrain/water_shallow_fill.png',
    '/sprites/terrain/water_deep_fill.png',
    // Saturated azure water texture — rivers + coast stamp this (survives the
    // season wash where the light-cyan fills turned green).
    '/sprites/ocean.png',
    // Painted terrain atlas (2.5D Painted Relief — grass biome tiles)
    '/sprites/tileset_grass.png',
    // Transparent 4×4 sand-bank/water masks, baked into the existing terrain cache.
    '/sprites/terrain/sand_water_overlay.png',
    // Painted dirt (25×25 seamless) — hills/peaks relief surfaces
    '/sprites/tile_dirt.png',
  ];
  // Decor buildings draw procedurally — they reference no real sprite file.
  const buildingSprites = Object.values(BUILDING_CONFIGS)
    .filter((cfg) => !cfg.decor)
    .map((cfg) => cfg.sprite);
  const sprites = [...new Set([...wildlifeAndHumans, ...buildingSprites])];

  return Promise.all([
    ...sprites.map(loadSprite),
    loadHumanWalkSheets(),
  ]).then(() => {});
}