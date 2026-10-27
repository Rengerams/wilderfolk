/**
 * F-RND-15 — a completed building with no loaded frame must still read as that building.
 *
 * No sprite frame is available before the preload finishes (and none at all for a type whose art is
 * missing), so this is the picture every player sees for the first frames of a session. The fallback
 * draws the building's own footprint pad in its own category colour, so a farm, a church and a
 * prison do not all read as one blank white box.
 */
import { describe, expect, it, vi } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, type Building } from '../src/game/buildings';
import { parseHexRgb, rgbaFromRgb } from '../src/game/renderer/shared';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

const OLD_PLACEHOLDER = '#e7e5e4';

interface Recorder {
  ctx: CanvasRenderingContext2D;
  fillStyles: string[];
  strokeStyles: string[];
}

/** One no-op context that remembers the colours a painter chose. */
function recorder(): Recorder {
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = {
    fillStyles,
    strokeStyles,
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: '',
    get fillStyle() {
      return '';
    },
    set fillStyle(value: string) {
      fillStyles.push(String(value));
    },
    get strokeStyle() {
      return '';
    },
    set strokeStyle(value: string) {
      strokeStyles.push(String(value));
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    drawImage: () => {},
    fillText: () => {},
    measureText: () => ({ width: 10 }),
    setLineDash: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillStyles, strokeStyles };
}

function snapshot(buildings: Building[]): RenderSnapshot {
  return {
    camera: { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 },
    buildings,
    hoveredBuilding: null,
    selectedBuilding: null,
    selectedEntity: null,
    juiceEffectsEnabled: true,
    tick: 3,
    worldMap: null,
  } as unknown as RenderSnapshot;
}

function completedBuilding(type: BuildingType): Building {
  return {
    id: 1,
    type,
    x: 200,
    y: 200,
    width: BUILDING_CONFIGS[type].width,
    height: BUILDING_CONFIGS[type].height,
    completed: true,
    faction: undefined,
    level: 1,
    health: 100,
    maxHealth: 100,
    occupants: [],
    rotation: 0,
    spriteScale: 1,
  } as unknown as Building;
}

/** The pad's south face: the config colour shaded down 40 % at `alpha + 0.1`, alpha 0.32 unselected. */
function expectedPadFill(type: BuildingType): string {
  return rgbaFromRgb(parseHexRgb(BUILDING_CONFIGS[type].backgroundColor), 0.32 + 0.1, -0.4);
}

describe('F-RND-15 — the sprite-less fallback is the building, not a blank box', () => {
  it('paints the footprint pad in the building config colour', async () => {
    vi.resetModules();
    const { drawBuildings } = await import('../src/game/renderer/buildings');
    const { ctx, fillStyles } = recorder();
    drawBuildings(ctx, snapshot([completedBuilding(BuildingType.House)]), 800, 600);

    expect(fillStyles).not.toContain(OLD_PLACEHOLDER);
    expect(fillStyles).toContain(expectedPadFill(BuildingType.House));
  });

  it('is not drawn once the frame is loaded — the pad is the missing-sprite path only', async () => {
    vi.resetModules();
    const { drawBuildings } = await import('../src/game/renderer/buildings');
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 64;
      height = 64;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const { loadSprite } = await import('../src/game/spriteLoader');
    await loadSprite(BUILDING_CONFIGS[BuildingType.House].sprite!);
    vi.stubGlobal('Image', undefined);

    const { ctx, fillStyles } = recorder();
    drawBuildings(ctx, snapshot([completedBuilding(BuildingType.House)]), 800, 600);

    expect(fillStyles).not.toContain(expectedPadFill(BuildingType.House));
  });
});
