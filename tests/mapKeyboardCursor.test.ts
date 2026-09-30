/**
 * The map canvas's keyboard cursor — the last half of bug 55 / OPEN-6 (2026-09-20 audit, A-2).
 *
 * `GameMapStage`'s canvas has carried `role="img"`, a name and `tabIndex={0}` since A-2, so a screen
 * reader could reach it and read its name — but every *action* on the map was pointer-only: there
 * was no cursor to move, therefore nothing to place a building on and nothing to select. The cursor
 * maths and the key → intent mapping live in the hook so they can be pinned here, without a browser:
 * this tier is `environment: 'node'` (`vitest.config.ts`), so the hook cannot be mounted and the
 * canvas cannot be rendered. What these tests own is the arithmetic (where a key sequence puts the
 * cursor, and where its clamp stops) and the mapping (which key means what, and what it does while
 * an overlay owns the keyboard); the canvas wiring is pinned by source in
 * `tests/keyboardGuards.contract.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_CURSOR_KEYS,
  MAP_CURSOR_KEYSHORTCUTS,
  MAP_CURSOR_STEP_WORLD_UNITS,
  clampMapCursor,
  describeMapCursor,
  initialMapCursorPoint,
  mapCursorBounds,
  mapCursorClientPoint,
  moveMapCursor,
  resolveMapCursorIntent,
  type MapCursorBounds,
  type MapCursorPoint,
  type MapCursorView,
} from '../src/components/useMapKeyboardCursor';
import { snapBuildingCenter } from '../src/game/buildingRotation';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';
import { getPlaceBuildingFailureLabel } from '../src/game/buildingPlacementLabels';
import { screenToWorld } from '../src/game/viewState';
import { initGame } from '../src/game/worldGen';
import {
  HOTKEY_BUILDINGS,
  LOGISTICS_HOTKEY,
  LOGISTICS_HOTKEY_CODE,
  TAB_HOTKEY_CODES,
  TAB_HOTKEYS,
} from '../src/game/hotkeys';
import {
  BuildingType,
  GRID_SIZE,
  TERRAIN_TILE_SIZE,
  TerrainType,
  type Camera,
  type WorldState,
} from '../src/game/gameTypes';
import { rebakeTerrainGrids, setTileOverride, tileAt } from '../src/game/terrain/terrainGrid';

/** A camera whose live and target values agree, so `worldToScreen`/`screenToWorld` round-trip. */
function cameraAt(x: number, y: number, zoom = 1): Camera {
  return { x, y, zoom, targetX: x, targetY: y, targetZoom: zoom };
}

/** The whole map is reachable — the case where the map, not the viewport, is the limit. */
const WHOLE_MAP: MapCursorBounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };

/** Fold a key sequence the way the hook does, so the assertions read as "what the player pressed". */
function pressKeys(start: MapCursorPoint, keys: readonly string[], bounds: MapCursorBounds): MapCursorPoint[] {
  let cursor = start;
  const trail: MapCursorPoint[] = [];
  for (const key of keys) {
    const intent = resolveMapCursorIntent(key, { keyboardClaimed: false, hasCursor: true, isRepeat: false });
    if (intent.type !== 'move') throw new Error(`expected ${key} to move the cursor, got ${intent.type}`);
    cursor = moveMapCursor(cursor, intent.step, bounds);
    trail.push({ ...cursor });
  }
  return trail;
}

describe('arrow keys step the cursor across the map', () => {
  it('pins the world coordinates a sequence of presses produces', () => {
    // Two cells per press (`MAP_CURSOR_STEP_WORLD_UNITS`), so the trail is arithmetic a reviewer can
    // check by hand rather than "a function was called".
    expect(pressKeys({ x: 300, y: 200 }, ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'], WHOLE_MAP))
      .toEqual([
        { x: 340, y: 200 },
        { x: 380, y: 200 },
        { x: 380, y: 240 },
        { x: 340, y: 240 },
        { x: 340, y: 200 },
      ]);
  });

  it('steps by a whole number of placement cells, not by a screen pixel', () => {
    // The step has to be a world distance: a pixel step would be a different world distance at every
    // zoom, and would not divide the lattice the placement snap uses (`GRID_SIZE`, 20 wu).
    expect(MAP_CURSOR_STEP_WORLD_UNITS).toBeGreaterThan(0);
    expect(MAP_CURSOR_STEP_WORLD_UNITS % GRID_SIZE).toBe(0);
    expect(pressKeys({ x: 300, y: 200 }, ['ArrowRight'], WHOLE_MAP)[0].x % GRID_SIZE).toBe(0);
  });

  it('reveals the cursor in the middle of what the player is looking at', () => {
    // `screenToWorld` at the viewport centre IS the camera target, so the first press cannot put the
    // cursor somewhere the player cannot see. Snapped to the placement lattice, so every later step
    // stays on it.
    const camera = cameraAt(1000, 800, 2);
    const start = initialMapCursorPoint(camera, 800, 600);
    expect(start).toEqual({ x: 1000, y: 800 });
    expect(start.x % GRID_SIZE).toBe(0);
    expect(start.y % GRID_SIZE).toBe(0);

    // And it is the pointer's own mapping, not a second one: the centre of the screen is that point.
    expect(screenToWorld(400, 300, camera, 800, 600)).toEqual([start.x, start.y]);
  });
});

describe('the cursor clamps at the edges', () => {
  it('stops at the map edge when the whole map is on screen', () => {
    // A viewport wider than the map: the visible-rect clamp must not shrink the map's own bounds.
    const camera = cameraAt(1000, 1000);
    expect(mapCursorBounds(camera, { width: 2000, height: 2000 }, 4000, 4000))
      .toEqual({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });

    const atEdge = pressKeys({ x: 1980, y: 1980 }, ['ArrowRight', 'ArrowDown'], WHOLE_MAP);
    expect(atEdge).toEqual([{ x: 2000, y: 1980 }, { x: 2000, y: 2000 }]);
  });

  it('stops at the visible edge, so the cursor can never be scrolled off screen', () => {
    // 400 × 300 at zoom 1 around (100, 100): the visible world rect is (-100, -150)…(300, 250),
    // narrowed to the map, so the cursor's box is (0, 0)…(300, 250).
    const bounds = mapCursorBounds(cameraAt(100, 100), { width: 1000, height: 800 }, 400, 300);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 250 });
    expect(moveMapCursor({ x: 280, y: 240 }, { x: MAP_CURSOR_STEP_WORLD_UNITS, y: 0 }, bounds))
      .toEqual({ x: 300, y: 240 });

    // Same viewport, camera in open country: the box follows the camera.
    expect(mapCursorBounds(cameraAt(500, 400), { width: 1000, height: 800 }, 400, 300))
      .toEqual({ minX: 300, minY: 250, maxX: 700, maxY: 550 });
  });

  it('clamping is idempotent, so a second press at the edge changes nothing', () => {
    const bounds: MapCursorBounds = { minX: 40, minY: 40, maxX: 200, maxY: 160 };
    const once = clampMapCursor({ x: 400, y: -50 }, bounds);
    expect(once).toEqual({ x: 200, y: 40 });
    expect(clampMapCursor(once, bounds)).toEqual(once);
    expect(moveMapCursor({ x: 200, y: 40 }, { x: MAP_CURSOR_STEP_WORLD_UNITS, y: 0 }, bounds)).toEqual(once);
  });

  it('falls back to the whole map when the canvas has no size yet', () => {
    // The canvas is 0 × 0 until layout runs; an inverted box would otherwise freeze the cursor.
    expect(mapCursorBounds(cameraAt(500, 400), { width: 1000, height: 800 }, 0, 0))
      .toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 800 });
  });
});

describe('key → intent', () => {
  const context = { keyboardClaimed: false, hasCursor: true, isRepeat: false };

  it('binds exactly the four arrows, Enter and Escape', () => {
    expect(MAP_CURSOR_KEYSHORTCUTS).toBe('ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape');
    expect(resolveMapCursorIntent('ArrowUp', context)).toEqual({ type: 'move', step: { x: 0, y: -MAP_CURSOR_STEP_WORLD_UNITS } });
    expect(resolveMapCursorIntent('ArrowDown', context)).toEqual({ type: 'move', step: { x: 0, y: MAP_CURSOR_STEP_WORLD_UNITS } });
    expect(resolveMapCursorIntent('ArrowLeft', context)).toEqual({ type: 'move', step: { x: -MAP_CURSOR_STEP_WORLD_UNITS, y: 0 } });
    expect(resolveMapCursorIntent('ArrowRight', context)).toEqual({ type: 'move', step: { x: MAP_CURSOR_STEP_WORLD_UNITS, y: 0 } });
    expect(resolveMapCursorIntent('Enter', context)).toEqual({ type: 'activate' });
    expect(resolveMapCursorIntent('Escape', context)).toEqual({ type: 'cancel' });
  });

  it('the first Enter reveals the cursor instead of acting blind', () => {
    // Nothing is under a cursor that does not exist yet, so the first press establishes it and the
    // announcement says where it landed; the second one acts.
    expect(resolveMapCursorIntent('Enter', { ...context, hasCursor: false }))
      .toEqual({ type: 'reveal' });
    expect(resolveMapCursorIntent('Enter', { ...context, hasCursor: true }))
      .toEqual({ type: 'activate' });
  });

  it('a held Enter does not become a building spree', () => {
    // Auto-repeat keeps firing without a new press; one press is one placement, exactly like one
    // click. Arrows still repeat — holding one walks the cursor.
    expect(resolveMapCursorIntent('Enter', { ...context, isRepeat: true })).toEqual({ type: 'none' });
    expect(resolveMapCursorIntent('ArrowRight', { ...context, isRepeat: true }))
      .toEqual({ type: 'move', step: { x: MAP_CURSOR_STEP_WORLD_UNITS, y: 0 } });
  });

  it('leaves every other key to its owner — including Space, which is the pause key', () => {
    // Space is deliberately not an activation key here: `useKeyboardControls` binds it to pause on
    // `window` in the capture phase (`isActivatableTarget` is false for a `role="img"` canvas), so it
    // runs before any handler on the canvas and cannot be preempted from this file. Binding Space
    // would pause the game on every placement. `MiniMap` gets Space for free only because its canvas
    // is a `role="button"`, which is exactly the target `isActivatableTarget` looks for.
    for (const key of ['w', 'b', 'r', 'x', 'h', 'v', 'f', 'n', 'p', 'l', 'm', '1', '9', '?', ' ', 'Tab', 'Shift', 'a']) {
      expect(resolveMapCursorIntent(key, context), key).toEqual({ type: 'none' });
    }
  });

  it('acts on nothing while an overlay owns the keyboard', () => {
    // The game's own claim (`keyboardOwnership.isKeyboardClaimed`), not a second ownership rule:
    // the same predicate `useKeyboardControls` returns on.
    for (const key of MAP_CURSOR_KEYS) {
      expect(resolveMapCursorIntent(key, { ...context, keyboardClaimed: true }), key)
        .toEqual({ type: 'none' });
    }
  });

  it('binds no key the game layer already owns (`hotkeys.ts`)', () => {
    for (const key of MAP_CURSOR_KEYS) {
      expect(TAB_HOTKEYS[key], `${key} is a sidebar-tab hotkey`).toBeUndefined();
      expect(TAB_HOTKEY_CODES[key], `${key} is a sidebar-tab hotkey code`).toBeUndefined();
      expect(HOTKEY_BUILDINGS[key], `${key} is a build-rail hotkey`).toBeUndefined();
      expect(key.toLowerCase()).not.toBe(LOGISTICS_HOTKEY);
      expect(key).not.toBe(LOGISTICS_HOTKEY_CODE);
    }
  });
});

describe('Enter acts where the cursor is', () => {
  it('maps the cursor to the client point the pointer path reads back as the same world point', () => {
    // The activation dispatches the same DOM event a click is, at the cursor's screen position, and
    // the pointer path converts it back with `useCanvasInteractions.getEventWorldCoords`. This is
    // that conversion, so the two directions are pinned against each other.
    const camera = cameraAt(500, 400, 2);
    const canvasWidth = 800;
    const canvasHeight = 600;
    const cursor: MapCursorPoint = { x: 540, y: 360 };

    for (const rect of [
      { left: 120, top: 40, width: 800, height: 600 },
      { left: 10, top: 20, width: 400, height: 300 },
    ]) {
      const point = mapCursorClientPoint(cursor, camera, canvasWidth, canvasHeight, rect);
      const screenX = (point.clientX - rect.left) * (canvasWidth / rect.width);
      const screenY = (point.clientY - rect.top) * (canvasHeight / rect.height);
      expect(screenToWorld(screenX, screenY, camera, canvasWidth, canvasHeight), JSON.stringify(rect))
        .toEqual([cursor.x, cursor.y]);
    }
  });

  it('falls back to the middle of the canvas when it has no measurable size', () => {
    const rect = { left: 120, top: 40, width: 0, height: 0 };
    expect(mapCursorClientPoint({ x: 540, y: 360 }, cameraAt(500, 400, 2), 0, 0, rect))
      .toEqual({ clientX: 120, clientY: 40 });
  });
});

describe('the cursor says what is under it', () => {
  /**
   * Flat, building-free ground the game's own placement rule accepts — on the `GRID_SIZE` lattice,
   * which is the lattice `snapBuildingCenter` snaps a cursor to, so the spot the fixture verifies is
   * the spot the description asks about.
   */
  function findLegalSpot(world: WorldState, type: BuildingType): MapCursorPoint {
    const map = world.worldMap;
    if (!map) throw new Error('fixture: the generated world has no terrain map');
    for (let gy = 200; gy < world.height - 200; gy += GRID_SIZE * 8) {
      for (let gx = 200; gx < world.width - 200; gx += GRID_SIZE * 8) {
        const x = Math.round(gx / GRID_SIZE) * GRID_SIZE;
        const y = Math.round(gy / GRID_SIZE) * GRID_SIZE;
        if (world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 250)) continue;
        const startTx = Math.max(0, Math.floor((x - 120) / TERRAIN_TILE_SIZE));
        const endTx = Math.min(map.width, Math.ceil((x + 120) / TERRAIN_TILE_SIZE));
        const startTy = Math.max(0, Math.floor((y - 120) / TERRAIN_TILE_SIZE));
        const endTy = Math.min(map.height, Math.ceil((y + 120) / TERRAIN_TILE_SIZE));
        for (let ty = startTy; ty < endTy; ty++) {
          for (let tx = startTx; tx < endTx; tx++) {
            const tile = tileAt(map, tx, ty);
            if (tile) setTileOverride(map, tx, ty, { ...tile, type: TerrainType.Grassland });
          }
        }
        rebakeTerrainGrids(map, { startTx, endTx, startTy, endTy });
        if (getPlaceBuildingFailureReason(world, type, x, y, 0) === null) return { x, y };
      }
    }
    throw new Error('fixture: no legal placement point found');
  }

  const unarmed: MapCursorView = { buildMode: null, buildRotation: 0 };

  it('names the armed type and the owner verdict for a legal spot', () => {
    const world = initGame();
    const spot = findLegalSpot(world, BuildingType.Farm);
    const text = describeMapCursor(world, { buildMode: BuildingType.Farm, buildRotation: 0 }, spot);

    expect(text).toContain('Farm');
    expect(text).toMatch(/can be placed here/i);
    expect(text).toContain(`${spot.x}, ${spot.y}`);
  });

  it('names the reason a refusal is refused, in the owner\'s wording', () => {
    // The wording is `buildingPlacementLabels`' (the same label the canvas ghost draws), so a screen
    // reader and the ghost cannot disagree about why a spot is refused.
    const world = initGame();
    const spot = findLegalSpot(world, BuildingType.Farm);
    world.resources.wood = 500;
    world.resources.stone = 500;
    world.resources.gold = 500;
    const placed = startBuilding(world, BuildingType.Farm, spot.x, spot.y, 0);

    const snapped = snapBuildingCenter(BuildingType.Farm, spot.x, spot.y, 0);
    const reason = getPlaceBuildingFailureReason(placed, BuildingType.Farm, snapped.x, snapped.y, 0);
    expect(reason, 'the fixture must actually overlap the placed farm').not.toBeNull();

    const text = describeMapCursor(placed, { buildMode: BuildingType.Farm, buildRotation: 0 }, spot);
    expect(text).toContain(getPlaceBuildingFailureLabel(BuildingType.Farm, reason!, placed.researchNodes));
  });

  it('names the building under the cursor when nothing is armed', () => {
    const world = initGame();
    const spot = findLegalSpot(world, BuildingType.Farm);
    world.resources.wood = 500;
    world.resources.stone = 500;
    world.resources.gold = 500;
    const placed = startBuilding(world, BuildingType.Farm, spot.x, spot.y, 0);
    const farm = placed.buildings.find((building) => building.type === BuildingType.Farm);
    expect(farm, 'the fixture must have placed a farm').toBeDefined();

    expect(describeMapCursor(placed, unarmed, { x: farm!.x, y: farm!.y })).toContain('Farm');
    expect(describeMapCursor(placed, unarmed, { x: 5, y: 5 })).toMatch(/open ground/i);
  });
});
