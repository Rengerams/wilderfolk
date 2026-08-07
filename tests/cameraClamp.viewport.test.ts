/**
 * Regression: zooming out on a small map exposed an empty ring around the
 * world — the camera center was clamped to the map bounds but the viewport
 * (screen / zoom) was ignored. clampCameraTarget now keeps the visible
 * viewport inside the world, or pins to the center when the viewport is
 * larger than the map.
 */
import { describe, it, expect } from 'vitest';
import { clampCameraTarget } from '../src/game/viewState';
import type { Camera } from '../src/game/gameTypes';

function cam(x: number, y: number, zoom: number): Camera {
  return { x, y, zoom, targetX: x, targetY: y, targetZoom: zoom };
}

describe('clampCameraTarget (viewport-aware)', () => {
  it('pins to map center when the viewport is larger than the world (zoomed out)', () => {
    // Small map 800x600, huge screen 2560x1440 at zoom 0.5 → viewport 5120x2880 > world.
    const out = clampCameraTarget(cam(100, 100, 0.5), 800, 600, 2560, 1440);
    // Center pinned (within the 2% margin around world center 400,300).
    expect(out.targetX).toBeGreaterThanOrEqual(380);
    expect(out.targetX).toBeLessThanOrEqual(420);
    expect(out.targetY).toBeGreaterThanOrEqual(280);
    expect(out.targetY).toBeLessThanOrEqual(320);
  });

  it('keeps the viewport inside the world at normal zoom', () => {
    // 2560 screen at zoom 2 → viewport 1280x720 < world 1600x1200 (large map).
    const out = clampCameraTarget(cam(1600, 600, 2), 1600, 1200, 2560, 1440);
    // half-view = 640w / 360h → right edge 1280+640 = 1920 > 1600 → clamp to
    // worldW - halfView = 960, plus the 2% margin (32) = 992.
    expect(out.targetX).toBeLessThanOrEqual(992);
    expect(out.targetX).toBeGreaterThanOrEqual(640);
    // y: world 1200, half-view 360 → 600 is within [360, 840], unclamped.
    expect(out.targetY).toBe(600);
  });

  it('center stays clamped even when dragged far outside', () => {
    const out = clampCameraTarget(cam(99999, -99999, 1), 800, 600, 800, 600);
    // half-view = 400w / 300h; right clamp = 800-400 = 400 (+ margin 16).
    expect(out.targetX).toBeLessThanOrEqual(432);
    expect(out.targetX).toBeGreaterThanOrEqual(368);
    // y pinned to center (viewport 600 = world 600), within margin.
    expect(out.targetY).toBeGreaterThanOrEqual(280);
    expect(out.targetY).toBeLessThanOrEqual(320);
  });
});
