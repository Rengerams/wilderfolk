import { loadHumanWalkSheets } from './humanSprites';
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

/** Kept in sync with humanSprites path constants (no import — avoids circular dep). */
const HUMAN_SPRITE_PATHS = new Set<string>([
  '/sprites/human_male.png',
  '/sprites/human_female.png',
  '/sprites/human_male_v0.png',
  '/sprites/human_male_v1.png',
  '/sprites/human_male_v2.png',
  '/sprites/human_male_v3.png',
  '/sprites/human_female_v0.png',
  '/sprites/human_female_v1.png',
  '/sprites/human_female_v2.png',
  '/sprites/human_female_v3.png',
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

export function preloadAllSprites(): Promise<void> {
  const wildlifeAndHumans = [
    '/sprites/rabbit.png',
    '/sprites/deer.png',
    '/sprites/wolf.png',
    '/sprites/fox.png',
    '/sprites/tree.png',
    '/sprites/grass.png',
    '/sprites/human_male.png',
    '/sprites/human_female.png',
  ];
  const buildingSprites = Object.values(BUILDING_CONFIGS).map((cfg) => cfg.sprite);
  const sprites = [...new Set([...wildlifeAndHumans, ...buildingSprites])];

  return Promise.all([
    ...sprites.map(loadSprite),
    loadHumanWalkSheets(),
  ]).then(() => {});
}