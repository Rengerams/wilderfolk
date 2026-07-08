import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '@/game/gameTypes';
import type { Building, WorldState } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import {
  createInitialView,
  createViewFromSave,
  mergeForSave,
  normalizeCameraForSave,
  resolveBuilding,
  resolveEntity,
  sanitizeCamera,
  sanitizeViewSelection,
  updateView,
  zoomCameraViewAt,
} from '@/game/viewState';
import { WORLD_STATE_SAVE_KEYS } from '@/game/saveSchema';

function minimalWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    width: 200,
    height: 200,
    entities: [],
    buildings: [],
    ...overrides,
  } as WorldState;
}

function sampleBuilding(id: number, completed = true): Building {
  return {
    id,
    type: BuildingType.House,
    x: 10,
    y: 10,
    width: 32,
    height: 32,
    occupants: [],
    level: 1,
    constructionProgress: completed ? 100 : 40,
    completed,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

describe('zoomCameraViewAt', () => {
  it('keeps the world point under the cursor fixed when zooming', () => {
    const view = createInitialView(800, 600);
    view.camera.targetX = 400;
    view.camera.targetY = 300;
    view.camera.targetZoom = 1;
    view.camera.x = 400;
    view.camera.y = 300;
    view.camera.zoom = 1;

    const cw = 800;
    const ch = 600;
    const sx = 600;
    const sy = 400;
    const beforeX = (sx - cw / 2) / view.camera.targetZoom + view.camera.targetX;
    const beforeY = (sy - ch / 2) / view.camera.targetZoom + view.camera.targetY;

    const zoomed = zoomCameraViewAt(view, 1.2, sx, sy, cw, ch);
    const afterX = (sx - cw / 2) / zoomed.camera.targetZoom + zoomed.camera.targetX;
    const afterY = (sy - ch / 2) / zoomed.camera.targetZoom + zoomed.camera.targetY;

    expect(zoomed.camera.targetZoom).toBeCloseTo(1.2, 5);
    expect(afterX).toBeCloseTo(beforeX, 4);
    expect(afterY).toBeCloseTo(beforeY, 4);
  });
});

describe('updateView', () => {
  it('returns the same object when camera and shake are at rest', () => {
    const view = createInitialView(200, 200);
    const next = updateView(view, 16.67);
    expect(next).toBe(view);
  });

  it('returns the same object after camera lerp settles', () => {
    const view = createInitialView(200, 200);
    view.camera.targetX = 80;
    view.camera.targetY = 120;

    let current = view;
    for (let i = 0; i < 400; i++) {
      current = updateView(current, 16.67);
    }
    expect(current.camera.x).toBeCloseTo(80, 1);
    expect(current.camera.y).toBeCloseTo(120, 1);

    const settled = updateView(current, 16.67);
    expect(settled).toBe(current);
  });
});

describe('sanitizeViewSelection', () => {
  it('clears dead entity and missing building selections', () => {
    const alive = createEntity(EntityType.Human, 0, 0, 1, 250);
    const dead = createEntity(EntityType.Deer, 5, 5, 2, 250);
    dead.alive = false;
    const world = minimalWorld({
      entities: [alive, dead],
      buildings: [sampleBuilding(1, true)],
    });
    const view = createInitialView(200, 200);
    view.selectedEntityId = 2;
    view.selectedBuildingId = 99;

    const sanitized = sanitizeViewSelection(world, view);
    expect(sanitized.selectedEntityId).toBeNull();
    expect(sanitized.selectedBuildingId).toBeNull();
    expect(sanitized).not.toBe(view);
  });
});

describe('resolveEntity / resolveBuilding', () => {
  it('resolveEntity ignores dead entities', () => {
    const alive = createEntity(EntityType.Human, 0, 0, 1, 250);
    const dead = createEntity(EntityType.Deer, 5, 5, 2, 250);
    dead.alive = false;
    const world = minimalWorld({ entities: [alive, dead] });

    expect(resolveEntity(world, 1)?.id).toBe(1);
    expect(resolveEntity(world, 2)).toBeNull();
  });

  it('resolveBuilding returns null for demolished buildings but keeps in-progress sites', () => {
    const completed = sampleBuilding(1, true);
    const inProgress = sampleBuilding(2, false);
    const world = minimalWorld({ buildings: [completed, inProgress] });

    expect(resolveBuilding(world, 1)?.completed).toBe(true);
    expect(resolveBuilding(world, 2)?.completed).toBe(false);
    expect(resolveBuilding(world, 99)).toBeNull();
  });
});

describe('sanitizeCamera', () => {
  it('replaces NaN and Infinity with map-center fallback', () => {
    const fallback = createInitialView(400, 300).camera;
    const sanitized = sanitizeCamera(
      { x: NaN, y: Infinity, zoom: NaN, targetX: 50, targetY: 60, targetZoom: 2.5 },
      fallback,
    );
    expect(sanitized.x).toBe(50);
    expect(sanitized.y).toBe(60);
    expect(sanitized.targetX).toBe(50);
    expect(sanitized.targetY).toBe(60);
    expect(sanitized.zoom).toBe(fallback.zoom);
    expect(sanitized.targetZoom).toBe(2.5);
  });
});

describe('save round-trip', () => {
  it('mergeForSave preserves camera pan via target coords and stores selection ids only', () => {
    const world = minimalWorld({
      entities: [createEntity(EntityType.Human, 0, 0, 7, 250)],
      buildings: [sampleBuilding(3, true)],
      scentGrid: { cols: 1, rows: 1, cellSize: 56, values: new Float32Array(1) } as never,
      bigNews: [{ id: 'bn_1', title: 't', message: 'm', type: 'neutral', createdAt: 0, dismissed: false }],
    });
    const view = createInitialView(200, 200);
    view.camera.x = 42;
    view.camera.y = 84;
    view.camera.targetX = 100;
    view.camera.targetY = 120;
    view.camera.targetZoom = 1.8;
    view.selectedEntityId = 7;
    view.selectedBuildingId = 3;

    const payload = mergeForSave(world, view);
    const camera = payload.camera as { x: number; y: number; targetX: number; targetY: number; zoom: number };

    expect(camera).toEqual(normalizeCameraForSave(view.camera));
    expect(camera.x).toBe(100);
    expect(camera.y).toBe(120);
    expect(camera.zoom).toBe(1.8);
    expect(payload.selectedEntityId).toBe(7);
    expect(payload.selectedBuildingId).toBe(3);
    expect(payload.selectedEntity).toBeUndefined();
    expect(payload.selectedBuilding).toBeUndefined();
    expect(payload.scentGrid).toBeUndefined();
    expect(payload.bigNews).toBeUndefined();
    expect(payload.worldMap).toBeUndefined();

    const overlayKeys = new Set([
      'camera', 'selectedEntityId', 'selectedBuildingId', 'buildMode', 'buildRotation',
      'showGrid', 'showPaths', 'showTechTree', 'screenShake', 'deathParticles',
      'floatingTexts', 'notifications', 'disasters', 'activeEvent',
    ]);
    const allowedWorldKeys = new Set(WORLD_STATE_SAVE_KEYS);
    for (const key of Object.keys(payload)) {
      expect(overlayKeys.has(key) || allowedWorldKeys.has(key as typeof WORLD_STATE_SAVE_KEYS[number])).toBe(true);
    }
  });

  it('createViewFromSave restores pan lerp state and sanitizes corrupted camera data', () => {
    const world = minimalWorld({
      width: 200,
      height: 200,
      entities: [createEntity(EntityType.Human, 0, 0, 5, 250)],
      buildings: [sampleBuilding(9, true)],
    });
    const view = createViewFromSave(
      {
        width: 200,
        height: 200,
        camera: {
          x: 42,
          y: 84,
          targetX: 100,
          targetY: 120,
          zoom: 1.45,
          targetZoom: 1.6,
        },
        selectedEntityId: 5,
        selectedBuildingId: 9,
      },
      world,
    );

    expect(view.camera.x).toBe(100);
    expect(view.camera.y).toBe(120);
    expect(view.camera.targetX).toBe(100);
    expect(view.camera.targetY).toBe(120);
    expect(view.camera.zoom).toBe(1.6);
    expect(view.selectedEntityId).toBe(5);
    expect(view.selectedBuildingId).toBe(9);

    const corrupted = createViewFromSave(
      {
        width: 200,
        height: 200,
        camera: { x: NaN, y: Infinity, zoom: NaN, targetX: NaN, targetY: NaN, targetZoom: NaN },
      },
      world,
    );
    expect(Number.isFinite(corrupted.camera.x)).toBe(true);
    expect(Number.isFinite(corrupted.camera.y)).toBe(true);
  });
});