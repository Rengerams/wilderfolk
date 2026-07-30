/**
 * Viewport focus, off-screen throttles, and entity draw buckets.
 */
import type { Camera, Entity, EntityByType, WorldState } from './gameTypes';
import { EntityType, emptyEntityByType, getRenderEntityLayer } from './gameTypes';

/** Region of the world that receives full simulation this tick. */
export interface SimulationFocus {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Extra margin around the viewport in world units where AI still runs. */
const FOCUS_MARGIN = 120;

/**
 * How often off-screen humans run full AI (every N ticks).
 * Keep in sync with `TICKS_PER_HOUR` in dayCycle (3 → 24 ticks ≈ 8 clock hours).
 * Do not import dayCycle here — avoids circular init (simFocus ↔ dayCycle).
 */
export const OFFSCREEN_HUMAN_THROTTLE = 24;

/** How often off-screen wildlife runs full AI (every N wildlife-layer calls). */
export const OFFSCREEN_WILDLIFE_THROTTLE = 8;

/**
 * Wildlife AI cadence in game ticks — must match `LAYER_SYSTEMS_INTERVAL`.
 * Grass is daily (`tickGrassDaily`); trees are static props (no sim tick).
 */
export const WILDLIFE_LAYER_INTERVAL = 4;

/** @deprecated Grass runs once per day in `tickGrassDaily`, not per-tick. */
export const OFFSCREEN_GRASS_THROTTLE = 4;

function sortEntitiesByY(entities: Entity[]): Entity[] {
  return entities.slice().sort((a, b) => a.y - b.y);
}

/** Bucket alive entities by `entity.type` (call again after mid-tick type changes, e.g. Moon Howlers). */
export function buildEntityByType(entities: Iterable<Entity>): EntityByType {
  const byType = emptyEntityByType();
  for (const e of entities) {
    if (e.alive) byType[e.type].push(e);
  }
  return byType;
}

/** Sorted draw lists for canvas layers — uses sim `byType` buckets (no full-entity scan). */
export function buildEntityDrawBuckets(byType: EntityByType): {
  trees: Entity[];
  animals: Entity[];
  humans: Entity[];
} {
  const trees = sortEntitiesByY(byType[EntityType.Tree]);
  const humans = sortEntitiesByY(byType[EntityType.Human]);
  const animals: Entity[] = [];
  for (const type of Object.values(EntityType) as EntityType[]) {
    if (getRenderEntityLayer(type) !== 'animal') continue;
    animals.push(...byType[type]);
  }
  return { trees, animals: sortEntitiesByY(animals), humans };
}

export function computeSimulationFocus(
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
): SimulationFocus {
  const halfW = canvasWidth / camera.zoom / 2 + FOCUS_MARGIN;
  const halfH = canvasHeight / camera.zoom / 2 + FOCUS_MARGIN;
  return {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  };
}

export function isInFocus(entity: Entity, focus: SimulationFocus): boolean {
  return (
    entity.x >= focus.minX
    && entity.x <= focus.maxX
    && entity.y >= focus.minY
    && entity.y <= focus.maxY
  );
}

/** Typical settlement viewport for headless sims — matches in-game camera throttling. */
export function createSimFocus(
  state: Pick<WorldState, 'width' | 'height'>,
  options?: Partial<{ canvasWidth: number; canvasHeight: number; zoom: number }>,
): SimulationFocus {
  const canvasWidth = options?.canvasWidth ?? 1280;
  const canvasHeight = options?.canvasHeight ?? 720;
  const zoom = options?.zoom ?? 0.45;
  const cx = state.width / 2;
  const cy = state.height / 2;
  const camera: Camera = {
    x: cx, y: cy, zoom,
    targetX: cx, targetY: cy, targetZoom: zoom,
  };
  return computeSimulationFocus(camera, canvasWidth, canvasHeight);
}
