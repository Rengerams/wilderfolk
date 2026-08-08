/**
 * 4-frame walk sheets: landscape human sprites are sliced into
 * HUMAN_WALK_FRAMES frames side by side (real leg animation), while portrait
 * art (the current 27×72 placeholders) stays a single frame. Variants also
 * fall back to the entity-id pick when unset, so the village shows all outfits.
 */
import { describe, it, expect } from 'vitest';
import {
  HUMAN_WALK_FRAMES,
  pickHumanVariant,
  sliceWalkFrame,
} from '../src/game/humanSprites';
import type { SpriteFrame } from '../src/game/spriteLoader';

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
    const s = sheet(27, 72);
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
