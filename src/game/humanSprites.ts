import type { Entity } from './gameTypes';
import { getSpriteFrame, isHumanSpritesReady, type SpriteFrame } from './spriteLoader';
import { Social } from './gameConstants';

export const HUMAN_WALK_FRAMES = 4;
/** Male class ladder length: Poor Labourer … Aristocrat (10 classes). */
export const HUMAN_MALE_CLASS_COUNT = 10;
/** Female class ladder length: Mudlark … Aristocrat (10 classes). */
export const HUMAN_FEMALE_CLASS_COUNT = 10;

export type HumanGender = 'male' | 'female';

export const HUMAN_BASE_SPRITES: Record<HumanGender, string> = {
  male: '/sprites/human_male.png',
  female: '/sprites/human_female.png',
};

/** Adult class ladders — the ten characters of each gender's set, lowest class first. */
export const WALK_SHEET_PATHS: Record<HumanGender, readonly string[]> = {
  // Male class ladder: Poor Labourer → Aristocrat, 10 classes, in order.
  male: [
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
  ],
  // Female class ladder: Mudlark → Aristocrat, 10 classes, in order.
  female: [
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
  ],
} as const;

/** Dedicated juvenile sprites, with two visual variants per gender for the preview. */
export const JUVENILE_SPRITE_PATHS: Record<HumanGender, readonly string[]> = {
  male: [
    '/sprites/new_child_set/new/child_boy_bakersboy.png',
    '/sprites/new_child_set/new/child_boy_merchantson.png',
  ],
  female: [
    '/sprites/new_child_set/new/child_girl_doctorsdaughter.png',
    '/sprites/new_child_set/new/child_girl_poorservant.png',
  ],
} as const;

/**
 * Painted figure height as a fraction of each child sprite's canvas, per {@link JUVENILE_SPRITE_PATHS}
 * entry (PNG alpha bounding box). The draw site scales the box by `1 / fraction` so figures match.
 */
const JUVENILE_FIGURE_FRACTIONS: Record<HumanGender, readonly number[]> = {
  male: [0.918, 0.880], // child_boy_bakersboy, child_boy_merchantson
  female: [1.0, 0.970], // child_girl_doctorsdaughter, child_girl_poorservant
};

/** Index into `JUVENILE_SPRITE_PATHS[gender]` — the one place the child-variant rule lives. */
function juvenileSpriteIndex(gender: HumanGender, variant: number): number {
  const paths = JUVENILE_SPRITE_PATHS[gender];
  return ((Math.floor(variant) % paths.length) + paths.length) % paths.length;
}

/**
 * `spriteH` multiplier for the drawn box of a child's sprite: grown by `1 / fraction` so the painted
 * figure comes out at the shared `spriteH`. Applied at the draw site, keeping metrics figure-sized.
 */
export function getJuvenileFigureScale(human: Entity): number {
  const gender = (human.gender ?? 'male') as HumanGender;
  const variant = human.spriteVariant ?? pickHumanVariant(human.id, gender);
  const fraction = JUVENILE_FIGURE_FRACTIONS[gender][juvenileSpriteIndex(gender, variant)] ?? 1;
  return fraction > 0 ? 1 / fraction : 1;
}

export const HUMAN_VARIANT_LABELS: Record<HumanGender, readonly string[]> = {
  male: [
    'Poor Labourer',
    'Farmhand',
    'Craftsman',
    'Pioneer',
    'Shopkeeper',
    'Clerk',
    'Merchant',
    'Prosperous Farmer',
    'Wealthy Gentry',
    'Aristocrat',
  ],
  female: [
    'Mudlark',
    'Factory Hand',
    'Scullery Maid',
    'Pioneer',
    'Shop Assistant',
    'Governess',
    "Merchant's Wife",
    'Wealthy Gentry',
    'High Society',
    'Aristocrat',
  ],
} as const;

/** Native artboard — feet on bottom edge. */
export const PIONEER_FRAME_W = 40;
export const PIONEER_FRAME_H = 56;

/**
 * Human scale is tied to building footprints, not collision size: a house footprint is 40wu tall and
 * settlers target ~50% of that on screen, readable in top-down view without towering over buildings.
 */
const HOUSE_REFERENCE_HEIGHT = 40;
/** Screen height as fraction of a house's displayed height (at any zoom). */
export const HUMAN_HEIGHT_BUILDING_RATIO = 0.5;
export const HUMAN_WORLD_HEIGHT = HOUSE_REFERENCE_HEIGHT * HUMAN_HEIGHT_BUILDING_RATIO;
/** Shadow / badge radius multiplier on collision size. */
export const HUMAN_DRAW_SCALE = 1.35;
/** Feet sit this fraction of sprite height below entity center (top-down). */
export const HUMAN_FOOT_OFFSET_RATIO = 0.2;
export const HUMAN_MIN_SCREEN_PX = 30;
/** Fallback aspect ratio of the human PNG sprites (27x72, feet on bottom row). */
export const HUMAN_SPRITE_ASPECT = 27 / 72;
/**
 * The clickable floor for a settler, in screen pixels: the smallest box a pointer can reliably hit.
 * Applied as a screen-space minimum in `getHumanSelectionBounds`, so tolerance stays constant.
 */
export const HUMAN_MIN_HIT_WIDTH_PX = 26;
export const HUMAN_MIN_HIT_HEIGHT_PX = 34;
export interface HumanSpriteMetrics {
  size: number;
  spriteH: number;
  footOffset: number;
}

/** Screen-pixel layout shared by renderer and click hit-testing. */
export function getHumanSpriteMetrics(human: Entity, camZoom: number): HumanSpriteMetrics {
  const cfgSize = human.size || 10;
  const baseSize = human.isJuvenile ? cfgSize * 0.7 : cfgSize;
  // `spriteH` is the height of the figure, for every settler. A child's canvas carries padding around
  // its figure and the draw site grows the box instead, keeping headY and the shadow figure-sized.
  const worldH = human.isJuvenile ? HUMAN_WORLD_HEIGHT * 0.72 : HUMAN_WORLD_HEIGHT;
  const spriteH = Math.max(HUMAN_MIN_SCREEN_PX, worldH * camZoom);
  const size = baseSize * HUMAN_DRAW_SCALE * camZoom;
  const footOffset = spriteH * HUMAN_FOOT_OFFSET_RATIO;
  return { size, spriteH, footOffset };
}

export function getHumanSpritePath(human: Entity): string {
  const gender = (human.gender ?? 'male') as HumanGender;
  const variant = human.spriteVariant ?? pickHumanVariant(human.id, gender);
  return getHumanWalkSheetPath(gender, variant);
}

/**
 * A sprite's clickable box, in world units, for the current zoom. The bounds are clamped to a floor
 * measured in screen pixels and converted back, so tolerance stays constant however far the camera is in.
 */
export function getHumanSelectionBounds(
  human: Entity,
  camZoom: number,
): { cx: number; cy: number; rx: number; ry: number } {
  const worldH = human.isJuvenile ? HUMAN_WORLD_HEIGHT * 0.72 : HUMAN_WORLD_HEIGHT;
  const footOffsetWorld = worldH * HUMAN_FOOT_OFFSET_RATIO;
  const cx = human.x;
  const cy = human.y + footOffsetWorld - worldH / 2;
  // A zoom that is not a real, positive, finite number reads as the default rather than being
  // allowed to collapse the box: an infinite zoom divides the screen-space floor away to nothing.
  const zoom = Number.isFinite(camZoom) && camZoom > 0 ? camZoom : 1;
  const ry = Math.max(worldH / 2, HUMAN_MIN_HIT_HEIGHT_PX / 2 / zoom);
  const rx = Math.max(worldH * HUMAN_SPRITE_ASPECT / 2, HUMAN_MIN_HIT_WIDTH_PX / 2 / zoom);
  return { cx, cy, rx, ry };
}

interface PioneerPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoe: string;
  accent: string;
  outline: string;
}

const MALE_PALETTES: PioneerPalette[] = [
  { skin: '#ffcc99', hair: '#4a3020', shirt: '#a0622e', pants: '#3d2818', shoe: '#1a1008', accent: '#f5deb3', outline: '#120a04' },
  { skin: '#ffd4a8', hair: '#5c3d28', shirt: '#c08050', pants: '#4a3528', shoe: '#221810', accent: '#ffe8c8', outline: '#181008' },
  { skin: '#e8b888', hair: '#2a1808', shirt: '#6b4420', pants: '#28180c', shoe: '#100804', accent: '#c89860', outline: '#0c0604' },
  { skin: '#f0c090', hair: '#3d2810', shirt: '#8b5028', pants: '#352010', shoe: '#1c1008', accent: '#d8a868', outline: '#100804' },
];

const FEMALE_PALETTES: PioneerPalette[] = [
  { skin: '#ffcc99', hair: '#8b2020', shirt: '#e04040', pants: '#fff8f0', shoe: '#3d2818', accent: '#ffffff', outline: '#120a04' },
  { skin: '#ffd4a8', hair: '#6b1818', shirt: '#b83038', pants: '#f8f0e4', shoe: '#322010', accent: '#fffaf5', outline: '#181008' },
  { skin: '#ffcc99', hair: '#a02828', shirt: '#f05050', pants: '#fffaf2', shoe: '#4a3020', accent: '#ffffff', outline: '#120a04' },
  { skin: '#e8b888', hair: '#501010', shirt: '#902028', pants: '#ece4d8', shoe: '#28180c', accent: '#f5f0e8', outline: '#0c0604' },
];

function normalizeVariant(variant: number, gender: HumanGender): number {
  const count = gender === 'female' ? HUMAN_FEMALE_CLASS_COUNT : HUMAN_MALE_CLASS_COUNT;
  return ((variant % count) + count) % count;
}

function paletteFor(gender: HumanGender, variant: number): PioneerPalette {
  const palettes = gender === 'female' ? FEMALE_PALETTES : MALE_PALETTES;
  const v = normalizeVariant(variant, gender) % palettes.length;
  return palettes[v];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
}

/** Draw one full-body pioneer (feet at y = PIONEER_FRAME_H). */
export function drawPioneerFrame(
  ctx: CanvasRenderingContext2D,
  walkFrame: number,
  gender: HumanGender,
  palette: PioneerPalette,
) {
  const isFemale = gender === 'female';
  const legSwing = walkFrame === 1 ? 3 : walkFrame === 3 ? -3 : 0;
  const bob = walkFrame === 1 || walkFrame === 3 ? -1 : 0;
  const W = PIONEER_FRAME_W;
  const H = PIONEER_FRAME_H;

  const cx = W / 2;
  const footY = H - 2 + bob;

  // Dark silhouette behind figure (readability on any background)
  px(ctx, cx - 11, footY - 48 + bob, 22, 48, palette.outline);

  px(ctx, cx - 9, footY - 4, 7, 4, palette.shoe);
  px(ctx, cx + 2 + legSwing * 0.6, footY - 4, 7, 4, palette.shoe);

  px(ctx, cx - 8, footY - 18, 5, 14, palette.pants);
  px(ctx, cx + 3 + legSwing, footY - 18, 5, 14, palette.pants);

  if (isFemale) {
    px(ctx, cx - 12, footY - 32, 24, 16, palette.shirt);
    px(ctx, cx - 9, footY - 40, 18, 10, palette.shirt);
    px(ctx, cx - 5, footY - 36, 10, 12, palette.accent);
  } else {
    px(ctx, cx - 10, footY - 38, 20, 18, palette.shirt);
    px(ctx, cx - 13, footY - 36, 4, 12, palette.shirt);
    px(ctx, cx + 9, footY - 36, 4, 12, palette.shirt);
    px(ctx, cx - 5, footY - 38, 10, 4, palette.accent);
  }

  const headY = footY - 50 + bob;
  px(ctx, cx - 8, headY, 16, 14, palette.skin);
  px(ctx, cx - 9, headY - 3, 18, 6, palette.hair);
  px(ctx, cx - 9, headY, 4, 8, palette.hair);
  px(ctx, cx + 5, headY, 4, 7, palette.hair);
  px(ctx, cx - 4, headY + 5, 3, 3, '#120a04');
  px(ctx, cx + 1, headY + 5, 3, 3, '#120a04');
}

/** Draw a settler directly on the game canvas (no baked PNG — always full body). */
export function drawPioneerAt(
  ctx: CanvasRenderingContext2D,
  sx: number,
  footY: number,
  pixelHeight: number,
  gender: HumanGender | undefined,
  variant: number,
  walkFrame: number,
  flipX: boolean,
  bobY = 0,
) {
  const g = gender ?? 'male';
  const scale = pixelHeight / PIONEER_FRAME_H;
  const drawW = PIONEER_FRAME_W * scale;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-sx, 0);
  }
  ctx.translate(sx - drawW / 2, footY - pixelHeight - bobY);
  ctx.scale(scale, scale);
  drawPioneerFrame(ctx, walkFrame, g, paletteFor(g, variant));
  ctx.restore();
}

/**
 * Pick a sprite variant (social class) for a new settler: a weighted draw over
 * `Social.CLASS_LADDER_WEIGHTS` per gender, deterministic from the entity id so every path agrees.
 */
export function pickHumanVariant(entityId: number, gender: HumanGender): number {
  const genderSalt = gender === 'female' ? 1013904223 : 0;
  const seed = (entityId * 2654435761 + genderSalt) >>> 0;

  const weights = Social.CLASS_LADDER_WEIGHTS;
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  const roll = (seed % 10000) / 10000;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (roll < acc) return i;
  }
  return weights.length - 1;
}

export function getHumanWalkSheetPath(gender: HumanGender, variant: number): string {
  const v = normalizeVariant(variant, gender);
  return WALK_SHEET_PATHS[gender][v] ?? HUMAN_BASE_SPRITES[gender];
}

export function getHumanVariantLabel(gender: HumanGender | undefined, variant: number): string {
  const g = gender ?? 'male';
  const v = normalizeVariant(variant, g);
  return HUMAN_VARIANT_LABELS[g][v] ?? `Outfit ${v + 1}`;
}

/**
 * Slice one walk frame out of a human sheet. Landscape sheets (wider than ~1.5× tall) are
 * HUMAN_WALK_FRAMES frames side by side; portrait art is a single frame and returned as-is.
 */
export function sliceWalkFrame(frame: SpriteFrame, walkFrame: number): SpriteFrame {
  const w = frame.sw;
  if (w > frame.sh * 1.5) {
    const f = ((Math.floor(walkFrame) % HUMAN_WALK_FRAMES) + HUMAN_WALK_FRAMES) % HUMAN_WALK_FRAMES;
    const frameW = w / HUMAN_WALK_FRAMES;
    return {
      image: frame.image,
      sx: frame.sx + f * frameW,
      sy: frame.sy,
      sw: frameW,
      sh: frame.sh,
      anchorY: frame.anchorY,
    };
  }
  return frame;
}

export function getHumanSpriteFrame(
  gender: HumanGender | undefined,
  variant: number,
  frame: number,
): SpriteFrame | null {
  if (!isHumanSpritesReady()) return null;
  const g = gender ?? 'male';
  const v = normalizeVariant(variant, g);
  const sheet = getSpriteFrame(getHumanWalkSheetPath(g, v)) ?? getSpriteFrame(HUMAN_BASE_SPRITES[g]);
  if (!sheet) return null;
  return sliceWalkFrame(sheet, frame);
}

/** Dedicated child sprite (toddler art) — single frame, no slicing. */
export function getJuvenileSpriteFrame(gender: HumanGender | undefined, variant = 0): SpriteFrame | null {
  if (!isHumanSpritesReady()) return null;
  const g = gender ?? 'male';
  return getSpriteFrame(JUVENILE_SPRITE_PATHS[g][juvenileSpriteIndex(g, variant)]);
}

/** Walk pace below which a settler counts as standing still — read by the walk owner and the renderer. */
export const HUMAN_WALK_SPEED_THRESHOLD = 0.12;

/**
 * At overview zoom, crowds use markers while small colonies retain full sprites. The threshold sits
 * between zoom presets so each is unambiguous, and a marker skips the whole sprite draw path.
 */
export const HUMAN_SPRITE_MIN_ZOOM = 1.15;
const HUMAN_OVERVIEW_SPRITE_LIMIT = 12;

export type OverviewRenderDetail = 'sprite' | 'marker';

/** Keep small colonies recognizable; reserve compact markers for actual crowds. */
export function overviewRenderDetail(zoom: number, isSelected = false, visibleCount = Infinity): OverviewRenderDetail {
  if (isSelected || visibleCount <= HUMAN_OVERVIEW_SPRITE_LIMIT) return 'sprite';
  return zoom < HUMAN_SPRITE_MIN_ZOOM ? 'marker' : 'sprite';
}

/** Marker radius in screen px — small and stable, so a crowd reads as texture, not blobs. */
export function getHumanMarkerRadius(zoom: number, isJuvenile = false, isLeader = false): number {
  const base = Math.max(3.2, Math.min(4.5, 2.6 * zoom + 1.1));
  return base * (isJuvenile ? 0.7 : 1) * (isLeader ? 1.5 : 1);
}

/** Marker colours: the settler's own class palette, so the social mix stays readable. */
export function getHumanMarkerColors(
  gender: HumanGender,
  variant: number,
): { fill: string; outline: string } {
  const palette = paletteFor(gender, variant);
  return { fill: palette.skin, outline: palette.outline };
}

export function getHumanWalkFrameIndex(animFrame: number, speed: number): number {
  if (speed < HUMAN_WALK_SPEED_THRESHOLD) return 0;
  return Math.floor(animFrame) % HUMAN_WALK_FRAMES;
}

export function getHumanWalkBob(frame: number, speed: number, camZoom: number): number {
  if (speed < HUMAN_WALK_SPEED_THRESHOLD) return 0;
  const stride = Math.min(1, speed / 1.4);
  const passing = frame === 1 || frame === 3;
  return (passing ? 1.1 : 0.15) * stride * camZoom;
}