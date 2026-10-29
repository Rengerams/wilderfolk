import { describe, expect, it } from 'vitest';
import {
  clampCameraTarget,
  clampCameraToFit,
  createInitialView,
  worldFitZoom,
  zoomCameraViewAt,
  type ViewState,
} from '../src/game/viewState';

const LARGE_MAP = { width: 4096, height: 3072 };

describe('worldFitZoom', () => {
  it('returns the zoom at which the whole map is in frame', () => {
    // The tighter axis decides: 1080 / 3072 is closer than 1920 / 4096.
    expect(worldFitZoom(LARGE_MAP, 1920, 1080)).toBeCloseTo(1080 / 3072, 6);
    expect(worldFitZoom(LARGE_MAP, 1280, 720)).toBeCloseTo(720 / 3072, 6);
  });

  it('never pushes the map past the viewport on either axis', () => {
    for (const [cw, ch] of [[1920, 1080], [1280, 720], [2560, 1440], [800, 600]]) {
      const zoom = worldFitZoom(LARGE_MAP, cw, ch);
      expect(LARGE_MAP.width * zoom).toBeLessThanOrEqual(cw + 0.001);
      expect(LARGE_MAP.height * zoom).toBeLessThanOrEqual(ch + 0.001);
    }
  });
});

describe('clampCameraTarget at the fit zoom', () => {
  it('centres an axis the whole-map view cannot fill, so the valley sits in the middle', () => {
    const fit = worldFitZoom(LARGE_MAP, 1920, 1080);
    const cam = { x: 0, y: 0, zoom: fit, targetX: 100, targetY: 100, targetZoom: fit };
    const clamped = clampCameraTarget(cam, LARGE_MAP.width, LARGE_MAP.height, 1920, 1080);
    expect(clamped.targetX).toBeCloseTo(LARGE_MAP.width / 2, 6);
    expect(clamped.targetY).toBeCloseTo(LARGE_MAP.height / 2, 6);
  });

  it('leaves panning untouched while the map is larger than the view', () => {
    const cam = { x: 0, y: 0, zoom: 1.45, targetX: 600, targetY: 500, targetZoom: 1.45 };
    const clamped = clampCameraTarget(cam, 2560, 1920, 1232, 685);
    expect(clamped).toBe(cam);
  });
});

describe('clampCameraToFit', () => {
  it('raises a restored camera that sits below the fit zoom, so the valley is in frame', () => {
    const restored = { x: 100, y: 100, zoom: 0.05, targetX: 100, targetY: 100, targetZoom: 0.05 };
    const cam = clampCameraToFit(restored, LARGE_MAP, 1920, 1080);
    expect(cam.targetZoom).toBeCloseTo(worldFitZoom(LARGE_MAP, 1920, 1080), 6);
    expect(cam.zoom).toBeCloseTo(cam.targetZoom, 6);
    expect(LARGE_MAP.width * cam.targetZoom).toBeLessThanOrEqual(1920 + 0.001);
    expect(LARGE_MAP.height * cam.targetZoom).toBeLessThanOrEqual(1080 + 0.001);
  });

  it('leaves a camera that already shows the whole map untouched', () => {
    const cam = { x: 1000, y: 900, zoom: 1.45, targetX: 1000, targetY: 900, targetZoom: 1.45 };
    expect(clampCameraToFit(cam, LARGE_MAP, 1920, 1080)).toBe(cam);
  });
});

describe('zoomCameraViewAt zooming out', () => {
  it('stops at the fit zoom, where the whole map is on screen', () => {
    const start: ViewState = createInitialView(1920, 1080);
    const fitZoom = worldFitZoom(LARGE_MAP, 1920, 1080);
    let view = start;
    for (let i = 0; i < 12; i++) {
      view = zoomCameraViewAt(view, 0.8, 960, 540, 1920, 1080, LARGE_MAP);
    }
    expect(view.camera.targetZoom).toBeCloseTo(fitZoom, 6);
    expect(LARGE_MAP.width * view.camera.targetZoom).toBeLessThanOrEqual(1920 + 0.001);
    expect(LARGE_MAP.height * view.camera.targetZoom).toBeLessThanOrEqual(1080 + 0.001);
  });

  it('reaches the fit zoom on a valley larger than the viewport at the old floor', () => {
    const huge = { width: 6144, height: 4608 };
    let view: ViewState = createInitialView(1275, 700);
    for (let i = 0; i < 20; i++) {
      view = zoomCameraViewAt(view, 0.8, 637, 350, 1275, 700, huge);
    }
    expect(view.camera.targetZoom).toBeCloseTo(700 / 4608, 6);
    expect(huge.width * view.camera.targetZoom).toBeLessThanOrEqual(1275 + 0.001);
  });

  it('still zooms in freely past the fit zoom', () => {
    const start: ViewState = createInitialView(1920, 1080);
    const zoomedIn = zoomCameraViewAt(start, 1.2, 960, 540, 1920, 1080, LARGE_MAP);
    expect(zoomedIn.camera.targetZoom).toBeGreaterThan(start.camera.targetZoom);
  });
});
