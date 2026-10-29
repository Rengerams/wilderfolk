import { describe, expect, it } from 'vitest';
import {
  clampCameraTarget,
  clampCameraToCoverage,
  createInitialView,
  worldCoverZoom,
  zoomCameraViewAt,
  type ViewState,
} from '../src/game/viewState';

const LARGE_MAP = { width: 4096, height: 3072 };

describe('worldCoverZoom', () => {
  it('returns the zoom at which the map exactly covers the viewport', () => {
    expect(worldCoverZoom(LARGE_MAP, 1920, 1080)).toBeCloseTo(1920 / 4096, 6);
    expect(worldCoverZoom(LARGE_MAP, 1280, 720)).toBeCloseTo(1280 / 4096, 6);
  });

  it('never leaves the map smaller than the viewport at that zoom', () => {
    for (const [cw, ch] of [[1920, 1080], [1280, 720], [2560, 1440], [800, 600]]) {
      const zoom = worldCoverZoom(LARGE_MAP, cw, ch);
      expect(LARGE_MAP.width * zoom).toBeGreaterThanOrEqual(cw - 0.001);
      expect(LARGE_MAP.height * zoom).toBeGreaterThanOrEqual(ch - 0.001);
    }
  });
});

describe('clampCameraTarget coverage', () => {
  it('centres an axis the zoomed-out map no longer covers, so no backdrop shows', () => {
    const cam = { x: 0, y: 0, zoom: 0.48, targetX: 100, targetY: 100, targetZoom: 0.48 };
    const clamped = clampCameraTarget(cam, 2560, 1920, 2000, 685);
    expect(clamped.targetX).toBeCloseTo(1280, 6);
    expect(clamped.targetY).toBeCloseTo(685 / 0.48 / 2, 6);
  });

  it('leaves panning untouched while the map is larger than the view', () => {
    const cam = { x: 0, y: 0, zoom: 1.45, targetX: 600, targetY: 500, targetZoom: 1.45 };
    const clamped = clampCameraTarget(cam, 2560, 1920, 1232, 685);
    expect(clamped).toBe(cam);
  });
});

describe('clampCameraToCoverage', () => {
  it('raises a restored camera that sits below the cover zoom, so no backdrop shows', () => {
    const restored = { x: 100, y: 100, zoom: 0.2, targetX: 100, targetY: 100, targetZoom: 0.2 };
    const cam = clampCameraToCoverage(restored, LARGE_MAP, 1920, 1080);
    expect(cam.targetZoom).toBeCloseTo(worldCoverZoom(LARGE_MAP, 1920, 1080), 6);
    expect(cam.zoom).toBeCloseTo(cam.targetZoom, 6);
    expect(LARGE_MAP.width * cam.targetZoom).toBeGreaterThanOrEqual(1920 - 0.001);
    expect(LARGE_MAP.height * cam.targetZoom).toBeGreaterThanOrEqual(1080 - 0.001);
  });

  it('leaves a camera that already covers the viewport untouched', () => {
    const cam = { x: 1000, y: 900, zoom: 1.45, targetX: 1000, targetY: 900, targetZoom: 1.45 };
    expect(clampCameraToCoverage(cam, LARGE_MAP, 1920, 1080)).toBe(cam);
  });
});

describe('zoomCameraViewAt zooming out', () => {
  it('stops at the cover zoom instead of showing empty backdrop around the map', () => {
    const start: ViewState = createInitialView(1920, 1080);
    const coverZoom = worldCoverZoom(LARGE_MAP, 1920, 1080);
    let view = start;
    for (let i = 0; i < 12; i++) {
      view = zoomCameraViewAt(view, 0.8, 960, 540, 1920, 1080, LARGE_MAP);
    }
    expect(view.camera.targetZoom).toBeCloseTo(coverZoom, 6);
    expect(LARGE_MAP.width * view.camera.targetZoom).toBeGreaterThanOrEqual(1920 - 0.001);
  });

  it('still zooms in freely past the cover zoom', () => {
    const start: ViewState = createInitialView(1920, 1080);
    const zoomedIn = zoomCameraViewAt(start, 1.2, 960, 540, 1920, 1080, LARGE_MAP);
    expect(zoomedIn.camera.targetZoom).toBeGreaterThan(start.camera.targetZoom);
  });
});
