import { describe, expect, it } from 'vitest';
import { computeMiniMapViewportRect } from '../src/components/MiniMap';

/** The mini-map canvas is fixed 152×110 CSS px, so the rectangle is expressed in those px. */
const MINIMAP_W = 152;
const MINIMAP_H = 110;

const CANVAS_W = 1560;
const CANVAS_H = 900;
const WORLD_W = 1200;
const WORLD_H = 900;

describe('mini-map viewport rectangle', () => {
  it('is derived from the live canvas, not from the world dimensions', () => {
    const rect = computeMiniMapViewportRect(CANVAS_W, CANVAS_H, WORLD_W, WORLD_H, {
      x: 600,
      y: 450,
      zoom: 1.45,
    });

    // (canvasW / zoom) * (minimapW / worldW), computed independently of the implementation.
    const expectedWidth = (1560 / 1.45) * (152 / 1200);
    const expectedHeight = (900 / 1.45) * (110 / 900);
    expect(rect.width).toBeCloseTo(expectedWidth, 6);
    expect(rect.height).toBeCloseTo(expectedHeight, 6);
    expect(rect.x).toBeCloseTo(600 * (152 / 1200) - expectedWidth / 2, 6);
    expect(rect.y).toBeCloseTo(450 * (110 / 900) - expectedHeight / 2, 6);
  });

  it('does not collapse to the world-sized box the canvas-free expression produced', () => {
    const rect = computeMiniMapViewportRect(CANVAS_W, CANVAS_H, WORLD_W, WORLD_H, {
      x: 600,
      y: 450,
      zoom: 1.45,
    });

    // What a world-derived rectangle gives: minimapW / zoom, independent of the canvas.
    const worldDerivedWidth = (1200 / 1.45) * (152 / 1200);
    const worldDerivedHeight = (900 / 1.45) * (110 / 900);
    expect(rect.width).toBeGreaterThan(worldDerivedWidth + 1);
    expect(rect.height).toBeCloseTo(worldDerivedHeight, 6);
    expect(rect.width).not.toBeCloseTo(worldDerivedWidth, 1);
  });

  it('follows a canvas with a different aspect on each axis independently', () => {
    const rect = computeMiniMapViewportRect(1600, 500, WORLD_W, WORLD_H, { x: 0, y: 0, zoom: 2 });

    expect(rect.width).toBeCloseTo((1600 / 2) * (152 / 1200), 6);
    expect(rect.height).toBeCloseTo((500 / 2) * (110 / 900), 6);
    expect(rect.x).toBeCloseTo(-rect.width / 2, 6);
    expect(rect.y).toBeCloseTo(-rect.height / 2, 6);
    // A wide canvas must not produce a uniformly scaled mini-map box.
    expect(rect.width / rect.height).not.toBeCloseTo(MINIMAP_W / MINIMAP_H, 1);
  });

  it('falls back to the whole map when the canvas measures zero', () => {
    const rect = computeMiniMapViewportRect(0, 0, WORLD_W, WORLD_H, { x: 600, y: 450, zoom: 1 });

    expect(rect).toEqual({ x: 0, y: 0, width: 152, height: 110 });
  });

  it('centres the rectangle on the camera as it moves', () => {
    const rect = computeMiniMapViewportRect(CANVAS_W, CANVAS_H, WORLD_W, WORLD_H, {
      x: 300,
      y: 225,
      zoom: 1.45,
    });

    const width = (1560 / 1.45) * (152 / 1200);
    const height = (900 / 1.45) * (110 / 900);
    expect(rect.x).toBeCloseTo(300 * (152 / 1200) - width / 2, 6);
    expect(rect.y).toBeCloseTo(225 * (110 / 900) - height / 2, 6);
  });
});
