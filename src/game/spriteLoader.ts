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

/**
 * Kept in sync with humanSprites path constants (no import — avoids circular dep).
 * Exported so `tests/humanSprites.test.ts` can assert the sync: a ladder
 * path missing from this set is neither preloaded nor bottom-anchored.
 *
 * The 16 legacy `human_male_v0…v7` / `human_female_v0…v7` walk sheets used to be listed here and were
 * fetched on every boot, although nothing had referenced them since the class-ladder art landed
 * (`humanSprites.WALK_SHEET_PATHS` is the only reader of a human walk sheet). Their PNGs stay in
 * `public/sprites/` for rollback; re-adding a path here is only correct together with a ladder entry
 * that can return it, because this set decides both preloading and the feet-down anchor
 */
export const HUMAN_SPRITE_PATHS = new Set<string>([
  '/sprites/human_male.png',
  '/sprites/human_female.png',
  '/sprites/new_male_set/male_poor_labourer.png',
  '/sprites/new_male_set/male_farmhand.png',
  '/sprites/new_male_set/male_craftsman.png',
  '/sprites/new_male_set/male_pioneer.png',
  '/sprites/new_male_set/male_shopkeeper.png',
  '/sprites/new_male_set/male_clerk.png',
  '/sprites/new_male_set/male_merchant.png',
  '/sprites/new_male_set/male_prosperous_farmer.png',
  '/sprites/new_male_set/male_wealthy_gentry.png',
  '/sprites/new_male_set/male_aristocrat.png',
  '/sprites/new_female_set_v2/cut/female_mudlark.png',
  '/sprites/new_female_set_v2/cut/female_factory_hand.png',
  '/sprites/new_female_set_v2/cut/female_scullery_maid.png',
  '/sprites/new_female_set_v2/cut/female_pioneer.png',
  '/sprites/new_female_set_v2/cut/female_shop_assistant.png',
  '/sprites/new_female_set_v2/cut/female_governess.png',
  '/sprites/new_female_set_v2/cut/female_merchants_wife.png',
  '/sprites/new_female_set_v2/cut/female_wealthy_gentry.png',
  '/sprites/new_female_set_v2/cut/female_high_society.png',
  '/sprites/new_female_set_v2/cut/female_aristocrat.png',
  '/sprites/new_child_set/new/child_boy_bakersboy.png',
  '/sprites/new_child_set/new/child_boy_merchantson.png',
  '/sprites/new_child_set/new/child_girl_doctorsdaughter.png',
  '/sprites/new_child_set/new/child_girl_poorservant.png',
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
    // Artist-authored top-down conifers (Ansimuz, CC0). New-world vegetation uses real artwork.
    '/sprites/nature/ansimuz/summer_pine_tree_tiles.png',
    // CC0 image-based L3 scenery: artist assets instead of drawProp Canvas primitives.
    '/sprites/nature/kenney/naturePack_026_0.png',
    '/sprites/nature/kenney/naturePack_054_0.png',
    '/sprites/nature/kenney/naturePack_078_0.png',
    '/sprites/blueberry_tree.png',
    '/sprites/grass.png',
    '/sprites/grass2.png',
    '/sprites/bush.png',
    '/sprites/stump.png',
    '/sprites/tile_pavement.png',
    '/sprites/oga_drummyfish/tile_pavement.png',
    '/sprites/oga_drummyfish/wall.png',
    '/sprites/oga_drummyfish/gate.png',
    '/sprites/walls/wall_straight.svg',
    '/sprites/walls/wall_gate.svg',
    '/sprites/roads/road_straight_1.png',
    '/sprites/roads/road_straight_2.png',
    '/sprites/roads/road_cross.png',
    '/sprites/roads/road_tee_1.png',
    '/sprites/roads/road_tee_2.png',
    '/sprites/roads/road_corner_1.png',
    '/sprites/roads/road_corner_2.png',
    '/sprites/roads/road_corner_3.png',
    '/sprites/roads/road_corner_4.png',
    '/sprites/ground_soil.PNG',
    // Leader's manor — not yet wired to a BuildingType, preloaded explicitly.
    '/sprites/house_leader.png',
    '/sprites/human_male.png',
    '/sprites/human_female.png',
    // Seamless ground fills — exactly the paths `terrainLayer`'s fill table stamps in `bakeTerrainLayer`.
    '/sprites/terrain/grass_fill.png',
    // Cethiel (CC0) tileable grass albedos: v4 Whittaker ground samples their
    // pixels once per terrain chunk bake and blends across moisture ecotones.
    '/sprites/terrain/cethiel/Grass_01.png',
    '/sprites/terrain/cethiel/Grass_02.png',
    '/sprites/terrain/cethiel/Grass_03.png',
    '/sprites/terrain/cethiel/Grass_04.png',
    '/sprites/terrain/forest.png',
    '/sprites/terrain/dirt.png',
    '/sprites/terrain/sand_fill.png',
    '/sprites/terrain/water_shallow_fill.png',
    '/sprites/terrain/water_deep_fill.png',
    '/sprites/terrain/snow.png',
    '/sprites/terrain/mountain.png',
    // The optional transparent 4×4 sand-bank/water mask sheet
    // (`SAND_WATER_OVERLAY_PATH`) is omitted until `public/sprites/terrain/sand_water_overlay.png`
    // ships: the retired tile bake reads it only when the sprite is present, and preloading a missing
    // file spams boot errors. See `BUG_REPORTS/2026-09-16-sand-water-overlay-sprite-missing.md`.
  ];
  // Decor buildings draw procedurally — they declare no sprite at all.
  const buildingSprites = Object.values(BUILDING_CONFIGS)
    .filter((cfg) => !cfg.decor)
    .flatMap((cfg) => (cfg.sprite ? [cfg.sprite] : []));
  const sprites = [...new Set([...wildlifeAndHumans, ...buildingSprites])];

  return Promise.all([
    ...sprites.map(loadSprite),
    loadHumanWalkSheets(),
  ]).then(() => {});
}