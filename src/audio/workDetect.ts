/**
 * Work & footstep detection (Phase 3.3) — pure logic, no audio side effects,
 * so it's unit-testable. The audio hook calls these throttled.
 */
import { EntityType } from '../game/gameTypes';
import { BuildingType, TERRAIN_TILE_SIZE } from '../game/gameTypes';
import type { Building, Entity, TerrainType as TerrainTypeName, WorldMap } from '../game/gameTypes';
import { isWorkHour } from '../game/dayCycle';
import type { WorkKind } from './workSfx';

/** Staffed, completed production buildings → the work sound they should make. */
const WORK_BUILDING_KINDS: Partial<Record<BuildingType, WorkKind>> = {
  [BuildingType.LumberMill]: 'chop',
  [BuildingType.Quarry]: 'mine',
  [BuildingType.Blacksmith]: 'hammer',
  [BuildingType.Workshop]: 'hammer',
  [BuildingType.Farm]: 'farm',
  [BuildingType.Greenhouse]: 'farm',
  [BuildingType.HuntingSpot]: 'gather',
};

/**
 * What work sound is the village making right now? Returns the kind of the
 * first staffed, completed production building during work hours, else null.
 */
export function detectWorkActivity(buildings: Building[], hourOfDay: number): WorkKind | null {
  if (!isWorkHour(hourOfDay)) return null;
  for (const b of buildings) {
    if (!b.completed || b.faction === 'rival' || b.occupants.length === 0) continue;
    const kind = WORK_BUILDING_KINDS[b.type];
    if (kind) return kind;
  }
  return null;
}

/** Terrain family under a world position (10-unit terrain cells). */
export function terrainAt(map: WorldMap | null, x: number, y: number): TerrainTypeName | null {
  if (!map) return null;
  const tx = Math.floor(x / TERRAIN_TILE_SIZE);
  const ty = Math.floor(y / TERRAIN_TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return map.tiles[ty]?.[tx]?.type ?? null;
}

/**
 * Surface under a moving settler's feet this tick. Returns the terrain of the
 * first alive player human that moved since the previous snapshot, else null.
 */
export function detectFootstepSurface(
  prevEntities: Entity[],
  currentEntities: Entity[],
  map: WorldMap | null,
): TerrainTypeName | null {
  if (!map) return null;
  const prevById = new Map(prevEntities.map((e) => [e.id, e]));
  for (const curr of currentEntities) {
    if (!curr.alive || curr.type !== EntityType.Human) continue;
    const prev = prevById.get(curr.id);
    if (!prev || !prev.alive) continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    if (dx * dx + dy * dy < 0.25) continue; // barely moved — no step
    return terrainAt(map, curr.x, curr.y);
  }
  return null;
}
