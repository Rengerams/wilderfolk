import type { Entity } from './gameTypes';
import { loadSprite, type SpriteFrame } from './spriteLoader';

export const HUMAN_WALK_FRAMES = 4;
export const HUMAN_VARIANT_COUNT = 4;

export type HumanGender = 'male' | 'female';

export const HUMAN_BASE_SPRITES: Record<HumanGender, string> = {
  male: '/sprites/human_male.png',
  female: '/sprites/human_female.png',
};

export const WALK_SHEET_PATHS: Record<HumanGender, readonly string[]> = {
  male: [
    '/sprites/human_male_v0.png',
    '/sprites/human_male_v1.png',
    '/sprites/human_male_v2.png',
    '/sprites/human_male_v3.png',
  ],
  female: [
    '/sprites/human_female_v0.png',
    '/sprites/human_female_v1.png',
    '/sprites/human_female_v2.png',
    '/sprites/human_female_v3.png',
  ],
} as const;

export const HUMAN_VARIANT_LABELS: Record<HumanGender, readonly string[]> = {
  male: ['Brown', 'Tan', 'Dark Brown', 'Rust Brown'],
  female: ['Red Dress', 'Maroon', 'Rose Red', 'Burgundy'],
} as const;

/** Native artboard — feet on bottom edge. */
export const PIONEER_FRAME_W = 40;
export const PIONEER_FRAME_H = 56;

/**
 * Human scale is tied to building footprints, not collision size.
 * A house footprint is 40wu tall; settlers target ~50% of that on screen
 * (readable in top-down view without towering over buildings).
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

export interface HumanSpriteMetrics {
  size: number;
  spriteH: number;
  footOffset: number;
}

/** Screen-pixel layout shared by renderer and click hit-testing. */
export function getHumanSpriteMetrics(human: Entity, camZoom: number): HumanSpriteMetrics {
  const cfgSize = human.size || 10;
  const baseSize = human.isJuvenile ? cfgSize * 0.7 : cfgSize;
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

/** World-space selection bounds for a human sprite (centered on the visible sprite). */
export function getHumanSelectionBounds(
  human: Entity,
  camZoom: number,
): { cx: number; cy: number; rx: number; ry: number } {
  void camZoom; // bounds use world units; param kept for call-site API
  const worldH = human.isJuvenile ? HUMAN_WORLD_HEIGHT * 0.72 : HUMAN_WORLD_HEIGHT;
  const footOffsetWorld = worldH * HUMAN_FOOT_OFFSET_RATIO;
  const cx = human.x;
  const cy = human.y + footOffsetWorld - worldH / 2;
  const ry = worldH / 2;
  const rx = worldH * HUMAN_SPRITE_ASPECT / 2;
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

let ready = false;

function normalizeVariant(variant: number): number {
  return ((variant % HUMAN_VARIANT_COUNT) + HUMAN_VARIANT_COUNT) % HUMAN_VARIANT_COUNT;
}

function paletteFor(gender: HumanGender, variant: number): PioneerPalette {
  const v = normalizeVariant(variant);
  return gender === 'female' ? FEMALE_PALETTES[v] : MALE_PALETTES[v];
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

export function pickHumanVariant(entityId: number, gender: HumanGender): number {
  const genderSalt = gender === 'female' ? 1013904223 : 0;
  const seed = (entityId * 2654435761 + genderSalt) >>> 0;
  return seed % HUMAN_VARIANT_COUNT;
}

export function getHumanWalkSheetPath(gender: HumanGender, variant: number): string {
  const v = normalizeVariant(variant);
  return WALK_SHEET_PATHS[gender][v] ?? HUMAN_BASE_SPRITES[gender];
}

export function getHumanVariantLabel(gender: HumanGender | undefined, variant: number): string {
  const g = gender ?? 'male';
  const v = normalizeVariant(variant);
  return HUMAN_VARIANT_LABELS[g][v] ?? `Outfit ${v + 1}`;
}

const humanFrameCanvasCache = new Map<string, HTMLCanvasElement>();

export function getHumanSpriteFrame(
  gender: HumanGender | undefined,
  variant: number,
  frame: number,
): SpriteFrame | null {
  if (!ready) return null;
  const g = gender ?? 'male';
  const v = normalizeVariant(variant);
  const f = ((Math.floor(frame) % HUMAN_WALK_FRAMES) + HUMAN_WALK_FRAMES) % HUMAN_WALK_FRAMES;
  const cacheKey = `${g}:${v}:${f}`;
  let canvas = humanFrameCanvasCache.get(cacheKey);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = PIONEER_FRAME_W;
    canvas.height = PIONEER_FRAME_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      drawPioneerFrame(ctx, f, g, paletteFor(g, v));
    }
    humanFrameCanvasCache.set(cacheKey, canvas);
  }
  return {
    image: canvas,
    sx: 0,
    sy: 0,
    sw: PIONEER_FRAME_W,
    sh: PIONEER_FRAME_H,
    anchorY: 1,
  };
}

export function isHumanSpritesReady(): boolean {
  return ready;
}

const ALL_HUMAN_SPRITE_PATHS = [
  ...Object.values(HUMAN_BASE_SPRITES),
  ...WALK_SHEET_PATHS.male,
  ...WALK_SHEET_PATHS.female,
];

export async function loadHumanWalkSheets(): Promise<void> {
  await Promise.all(ALL_HUMAN_SPRITE_PATHS.map(loadSprite));
  ready = true;
}

export const generateHumanSprites = loadHumanWalkSheets;

/** Match renderer HUMAN_WALK_SPEED_THRESHOLD — idle settlers must not advance walk frames. */
export const HUMAN_WALK_SPEED_THRESHOLD = 0.12;

export function getHumanWalkFrameIndex(animFrame: number, speed: number): number {
  if (speed < HUMAN_WALK_SPEED_THRESHOLD) return 0;
  return Math.floor(animFrame) % HUMAN_WALK_FRAMES;
}

export function advanceHumanWalkAnim(human: Entity): void {
  let frame = human.animFrame ?? 0;
  const speed = Math.hypot(human.vx, human.vy);
  if (speed > HUMAN_WALK_SPEED_THRESHOLD) {
    frame += speed * 0.28;
    if (frame >= HUMAN_WALK_FRAMES * 8) {
      frame %= HUMAN_WALK_FRAMES;
    }
  } else if ((human.chatTicks ?? 0) > 0) {
    frame += 0.12;
  } else {
    frame *= 0.55;
    if (frame < 0.04) frame = 0;
  }
  human.animFrame = frame;
}

export function getHumanWalkBob(frame: number, speed: number, camZoom: number): number {
  if (speed < HUMAN_WALK_SPEED_THRESHOLD) return 0;
  const stride = Math.min(1, speed / 1.4);
  const passing = frame === 1 || frame === 3;
  return (passing ? 1.1 : 0.15) * stride * camZoom;
}