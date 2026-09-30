import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  HUMAN_FEMALE_CLASS_COUNT,
  HUMAN_MALE_CLASS_COUNT,
  HUMAN_MIN_SCREEN_PX,
  HUMAN_SPRITE_ASPECT,
  HUMAN_SPRITE_MIN_ZOOM,
  HUMAN_VARIANT_LABELS,
  HUMAN_WALK_FRAMES,
  WALK_SHEET_PATHS,
  getHumanMarkerColors,
  getHumanMarkerRadius,
  getHumanVariantLabel,
  getHumanWalkSheetPath,
  humanRenderDetail,
  pickHumanVariant,
  sliceWalkFrame,
} from '../src/game/humanSprites';
import { HUMAN_SPRITE_PATHS } from '../src/game/spriteLoader';
import type { SpriteFrame } from '../src/game/spriteLoader';
import type { Entity } from '../src/game/gameTypes';
import { getHumanWalkMotion } from '../src/game/renderer/spriteDrawing';
import { CAMERA_ZOOM_PRESETS } from '../src/game/viewState';

/**
 * Male class ladder — the ten cut sprites from
 * `public/sprites/new_male_set/V2/Spritesheet_V2_10_males.png` (2026-09-16).
 *
 * Three nameable risks are guarded here:
 *  1. a ladder entry whose PNG is missing from the public tree — the loader then logs
 *     a failed-asset console error at boot and quietly falls back to the base sprite;
 *  2. the weighted social ladder silently flattening (a uniform male spread was the
 *     pre-2026-09-16 behaviour, and the female ladder's whole point is that the poor
 *     are common and the aristocracy rare);
 *  3. an out-of-range `spriteVariant` (older saves, hand-edited fixtures) escaping the
 *     ladder instead of wrapping into it.
 *
 * The previous five male files are kept under `new_male_set/legacy/` for rollback, so
 * the existence check also covers that path.
 */
describe('humanSprites.maleLadder.test.ts', () => {
  /** `public/...` path existence, the same way tests/terrainAtlas.waterColor.test.ts reads art. */
  function assetExists(publicPath: string): boolean {
    return existsSync(fileURLToPath(new URL(`../public${publicPath}`, import.meta.url)));
  }

  describe('male class ladder', () => {
    it('declares ten classes, every sprite file present, ordered poorest to aristocrat', () => {
      expect(WALK_SHEET_PATHS.male).toHaveLength(HUMAN_MALE_CLASS_COUNT);
      expect(HUMAN_VARIANT_LABELS.male).toHaveLength(HUMAN_MALE_CLASS_COUNT);
      expect(HUMAN_FEMALE_CLASS_COUNT).toBe(10);
      expect(new Set(WALK_SHEET_PATHS.male).size).toBe(HUMAN_MALE_CLASS_COUNT);

      for (const path of WALK_SHEET_PATHS.male) {
        expect(path.startsWith('/sprites/new_male_set/male_'), path).toBe(true);
        expect(assetExists(path), `${path} is missing from public/`).toBe(true);
        // A ladder path outside the loader's set is never preloaded and loses the
        // feet-down anchor, so the two lists must stay in sync.
        expect(HUMAN_SPRITE_PATHS.has(path), `${path} is not registered with spriteLoader`).toBe(true);
      }
      for (const path of WALK_SHEET_PATHS.female) {
        expect(HUMAN_SPRITE_PATHS.has(path), `${path} is not registered with spriteLoader`).toBe(true);
      }
      // The superseded five-character set stays on disk for rollback.
      expect(assetExists('/sprites/new_male_set/legacy/male_craftsman.png')).toBe(true);

      expect(HUMAN_VARIANT_LABELS.male[0]).toBe('Poor Labourer');
      expect(HUMAN_VARIANT_LABELS.male[HUMAN_MALE_CLASS_COUNT - 1]).toBe('Aristocrat');
    });

    it('draws the same weighted social ladder for men and women, not a uniform spread', () => {
      const counts = (gender: 'male' | 'female'): number[] => {
        const buckets = new Array<number>(HUMAN_MALE_CLASS_COUNT).fill(0);
        for (let id = 1; id <= 20_000; id++) buckets[pickHumanVariant(id, gender)]++;
        return buckets;
      };
      const male = counts('male');
      const female = counts('female');
      const share = (buckets: number[], index: number): number =>
        buckets[index] / buckets.reduce((sum, count) => sum + count, 0);

      // ~47% of villagers are the bottom two classes, ~1.5% the top two.
      expect(share(male, 0) + share(male, 1)).toBeGreaterThan(0.42);
      expect(share(male, 0) + share(male, 1)).toBeLessThan(0.52);
      expect(share(male, 8) + share(male, 9)).toBeLessThan(0.03);
      expect(share(male, 0)).toBeGreaterThan(share(male, 9));

      // Both genders share one weight array, so their shapes agree within sampling noise.
      for (let i = 0; i < HUMAN_MALE_CLASS_COUNT; i++) {
        expect(Math.abs(share(male, i) - share(female, i)), `class ${i} share`).toBeLessThan(0.02);
      }
    });

    it('wraps out-of-range variants into the ladder instead of the base sprite', () => {
      for (const variant of [-1, HUMAN_MALE_CLASS_COUNT, 37, -13]) {
        expect(WALK_SHEET_PATHS.male).toContain(getHumanWalkSheetPath('male', variant));
        expect(getHumanVariantLabel('male', variant)).not.toMatch(/^Outfit /);
      }
      // A variant stored by an older save (0..7) still resolves to a declared class.
      expect(WALK_SHEET_PATHS.male).toContain(getHumanWalkSheetPath('male', 7));
    });
  });
});

/**
 * 4-frame walk sheets: landscape human sprites are sliced into
 * HUMAN_WALK_FRAMES frames side by side (real leg animation), while portrait
 * art (the current 27×72 placeholders) stays a single frame. Variants also
 * fall back to the entity-id pick when unset, so the village shows all outfits.
 */
describe('humanSprites.walkFrames.test.ts', () => {
  function sheet(sw: number, sh: number, anchorY?: number): SpriteFrame {
    return { image: {} as unknown as HTMLImageElement, sx: 0, sy: 0, sw, sh, anchorY };
  }

  describe('human walk-sheet slicing', () => {
    it('a landscape sheet is sliced into 4 frames by walk frame', () => {
      const s = sheet(320, 112); // 4 × 80px frames
      expect(sliceWalkFrame(s, 0).sx).toBe(0);
      expect(sliceWalkFrame(s, 1).sx).toBe(80);
      expect(sliceWalkFrame(s, 2).sx).toBe(160);
      expect(sliceWalkFrame(s, 3).sx).toBe(240);
      for (const f of [0, 1, 2, 3]) {
        const sliced = sliceWalkFrame(s, f);
        expect(sliced.sw).toBe(80);
        expect(sliced.sh).toBe(112);
        expect(sliced.anchorY).toBe(undefined);
      }
    });

    it('walk frames wrap safely outside 0..3', () => {
      const s = sheet(320, 112);
      expect(sliceWalkFrame(s, 4).sx).toBe(0);
      expect(sliceWalkFrame(s, -1).sx).toBe(240);
    });

    it('portrait art (single frame) is returned untouched', () => {
      // The portrait ratio is the owner's (`HUMAN_SPRITE_ASPECT = 27 / 72`), not a re-typed
      // `27 × 72`; a sprite-pack change to a different portrait ratio now reaches this fixture.
      const portraitWidth = 27;
      const s = sheet(portraitWidth, portraitWidth / HUMAN_SPRITE_ASPECT);
      for (const f of [0, 1, 2, 3]) {
        expect(sliceWalkFrame(s, f)).toBe(s);
      }
    });

    it('anchorY is preserved on sliced frames', () => {
      const s = sheet(320, 112, 1);
      expect(sliceWalkFrame(s, 2).anchorY).toBe(1);
    });

    it('unset variants pick deterministically from the entity id', () => {
      const a = pickHumanVariant(11, 'female');
      const b = pickHumanVariant(11, 'female');
      const c = pickHumanVariant(12, 'female');
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(HUMAN_WALK_FRAMES);
      expect(a === c).toBe(false);
    });
  });
});

/**
 * Settlers show a step while walking (audit `visuals-looks.md` D10).
 *
 * `humanSprites.sliceWalkFrame` returns the sheet **unchanged** for every walk frame because
 * every shipped human sheet is portrait (taller than it is wide), so `HUMAN_WALK_FRAMES`, the
 * modulo and the frame counter produced no visible leg or arm motion at all — walking settlers
 * translated with a bob and nothing else. `getHumanWalkMotion` therefore drives the step from
 * the draw transform, and `renderer/humans.ts` forwards the whole motion object.
 */
describe('humanSprites.walkMotion.test.ts', () => {
  function walker(): Entity {
    return { id: 3, vx: 1, vy: 0, animFrame: 0 } as unknown as Entity;
  }

  describe('settler walk motion', () => {
    it('alternates a step squash across the four walk frames', () => {
      const frames = [0, 1, 2, 3].map((f) => getHumanWalkMotion(walker(), 1, true, f));

      // Passing frames compress / extend; contact frames stay neutral.
      expect(frames[1].scaleY).toBeLessThan(1);
      expect(frames[1].scaleX).toBeGreaterThan(1);
      expect(frames[3].scaleY).toBeGreaterThan(1);
      expect(frames[3].scaleX).toBeLessThan(1);
      expect(frames[0].scaleY).toBe(1);
      expect(frames[2].scaleY).toBe(1);
    });

    it('keeps the vertical bob, and wraps the step index safely', () => {
      expect(getHumanWalkMotion(walker(), 1, true, 1).bobY).toBeGreaterThan(0);
      // The squash table wraps; the bob owner keys on the raw frame, and production frames are
      // always 0…3 (`getHumanWalkFrameIndex`), so only the step is asserted here.
      expect(getHumanWalkMotion(walker(), 1, true, 5).scaleY).toBe(getHumanWalkMotion(walker(), 1, true, 1).scaleY);
      expect(getHumanWalkMotion(walker(), 1, true, -1).scaleY).toBe(getHumanWalkMotion(walker(), 1, true, 3).scaleY);
    });

    it('gives a still settler no motion at all', () => {
      const still = { id: 3, vx: 0, vy: 0, animFrame: 2 } as unknown as Entity;
      expect(getHumanWalkMotion(still, 1, true, 1)).toEqual({});
    });
  });
});

/**
 * Zoomed-out settler LOD (2026-09-16).
 *
 * Past a certain population the village stopped being readable: above
 * `HUMAN_MIN_SCREEN_PX` (30 px) the sprite path stops shrinking, so at village-wide zoom
 * every settler claimed 30 px of screen plus a shadow, a status badge, a speech bubble
 * and often a name plate. Below `HUMAN_SPRITE_MIN_ZOOM` a settler is now one small dot;
 * the frame cost falls with it, because the marker path skips the sprite lookup, walk
 * frame, contact shadow, bob, badge, bubble and label.
 *
 * These cases pin the parts that are pure decisions: which zoom levels switch, that a
 * selected settler is exempt, the marker's size bounds, and that every class still gets
 * a distinct dot colour with a legible outline. The canvas work itself is covered by the
 * browser acceptance tier.
 */
describe('humanSprites.zoomMarker.test.ts', () => {
  /** Perceived brightness of a #rrggbb colour — enough to compare fill against outline. */
  function luma(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  describe('human zoom LOD', () => {
    it('marks every far zoom preset as markers and every close one as sprites', () => {
      for (const preset of CAMERA_ZOOM_PRESETS) {
        const expected = preset < HUMAN_SPRITE_MIN_ZOOM ? 'marker' : 'sprite';
        expect(humanRenderDetail(preset), `preset ${preset}`).toBe(expected);
      }
      // The boundary itself belongs to the sprite side, so the threshold reads as
      // "closer than this shows people".
      expect(humanRenderDetail(HUMAN_SPRITE_MIN_ZOOM)).toBe('sprite');
      expect(humanRenderDetail(HUMAN_SPRITE_MIN_ZOOM - 0.01)).toBe('marker');
    });

    it('always keeps a selected settler as a full sprite', () => {
      expect(humanRenderDetail(0.5, false)).toBe('marker');
      expect(humanRenderDetail(0.5, true)).toBe('sprite');
      expect(humanRenderDetail(3.0, true)).toBe('sprite');
    });

    it('keeps the marker small, clamped, and smaller than the sprite it replaces', () => {
      expect(getHumanMarkerRadius(0.5)).toBeGreaterThanOrEqual(2.2);
      expect(getHumanMarkerRadius(1.0)).toBeLessThanOrEqual(4.5);
      // Ordered: child < adult < leader.
      expect(getHumanMarkerRadius(0.5, true)).toBeLessThan(getHumanMarkerRadius(0.5));
      expect(getHumanMarkerRadius(0.5, false, true)).toBeGreaterThan(getHumanMarkerRadius(0.5));
      // Even the leader's doubled diameter stays well under the 30 px sprite floor.
      expect(getHumanMarkerRadius(0.5, false, true) * 2).toBeLessThan(HUMAN_MIN_SCREEN_PX);
    });

    it('gives every class a real marker colour with a darker outline', () => {
      const ladders: ReadonlyArray<readonly ['male' | 'female', number]> = [
        ['male', HUMAN_MALE_CLASS_COUNT],
        ['female', HUMAN_FEMALE_CLASS_COUNT],
      ];
      for (const [gender, count] of ladders) {
        const fills = new Set<string>();
        for (let variant = 0; variant < count; variant++) {
          const { fill, outline } = getHumanMarkerColors(gender, variant);
          expect(fill, `${gender} ${variant} fill`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(outline, `${gender} ${variant} outline`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(luma(outline), `${gender} ${variant} outline darker than fill`).toBeLessThan(luma(fill));
          fills.add(fill);
        }
        // A dot must be able to differ from its neighbour's dot.
        expect(fills.size).toBeGreaterThan(1);
      }
    });
  });
});
