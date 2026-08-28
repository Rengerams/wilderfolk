import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GameMapStage, { getNearestCameraZoomPreset } from '../src/components/GameMapStage';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';

describe('GameMapStage', () => {
  it('renders the established canvas surface, FPS meter, minimap, and camera controls', () => {
    const world = initGame();
    const view = createInitialView(world.width, world.height);
    const markup = renderToStaticMarkup(createElement(GameMapStage, {
      canvasRef: { current: null },
      canvasCursor: 'crosshair',
      fps: 60,
      showFps: true,
      worldRef: { current: world },
      viewRef: { current: view },
      cameraTargetZoom: view.camera.targetZoom,
      onNavigate: vi.fn(),
      onApplyZoom: vi.fn(),
      onSetZoomLevel: vi.fn(),
      onResetZoom: vi.fn(),
      onClick: vi.fn(),
      onContextMenu: vi.fn(),
      onMouseDown: vi.fn(),
      onMouseLeave: vi.fn(),
      onMouseMove: vi.fn(),
      onMouseUp: vi.fn(),
    }));

    expect(markup).toContain('class="map-canvas"');
    expect(markup).toContain('60 FPS');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Zoom preset"');
    expect(markup).toContain('aria-label="Zoom out"');
    expect(markup).toContain('aria-label="Reset zoom"');
  });

  it('selects the nearest supported camera zoom preset after clamping', () => {
    expect(getNearestCameraZoomPreset(1.49)).toBe(1.45);
    expect(getNearestCameraZoomPreset(0)).toBe(getNearestCameraZoomPreset(0.1));
    expect(getNearestCameraZoomPreset(99)).toBe(getNearestCameraZoomPreset(3));
  });
});
