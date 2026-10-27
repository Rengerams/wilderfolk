/**
 * Phase 3.3 — work & footstep detection is pure logic (no audio side effects):
 * staffed production buildings pick the work sound during work hours, and a
 * moving settler's surface is sampled from the terrain map for the footstep.
 */
import { describe, it, expect } from 'vitest';
import { BuildingType, EntityType, MapPreset, MapSize, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldMap } from '../src/game/gameTypes';
import {
  detectWorkActivity,
  detectFootstepSurface,
  terrainAt,
} from '../src/audio/workDetect';
import { isWorkHour } from '../src/game/dayCycle';
import { setTileOverride } from '../src/game/terrain/terrainGrid';

/**
 * A flat map whose every 10px tile projects to the same terrain type. Teraforge keeps no
 * per-tile grid: the tile type is decided by the L2 continuous fields, so a uniform field
 * value is how a fixture states "this whole valley is X".
 *
 * `elevation` 0.3 → Grassland at the default 0.24 sea level, 0 → DeepWater.
 */
function uniformMap(width: number, height: number, elevation: number): WorldMap {
  const cols = Math.ceil(width / 64);
  const rows = Math.ceil(height / 64);
  return {
    width,
    height,
    seed: 1,
    rivers: [],
    preset: MapPreset.Continental,
    size: MapSize.Medium,
    cols,
    rows,
    elevation: new Float32Array(cols * rows).fill(elevation),
    moisture: new Float32Array(cols * rows).fill(0.5),
    temperature: new Float32Array(cols * rows).fill(0.5),
    terrain: new Uint8Array(cols * rows),
    riverDist: new Float32Array(cols * rows),
  };
}

function stubBuilding(type: BuildingType, occupants: number): Building {
  return {
    id: Math.floor(Math.random() * 1e6),
    type,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    completed: true,
    occupants: Array.from({ length: occupants }, (_, i) => 1000 + i),
  } as Building;
}

function stubHuman(id: number, x: number, y: number, alive = true): Entity {
  return {
    id,
    type: EntityType.Human,
    x,
    y,
    alive,
    age: 25,
    name: 'T',
    surname: 'S',
    gender: 'male',
  } as Entity;
}

describe('work & footstep detection (Phase 3.3)', () => {
  it('a staffed lumber mill means chopping during work hours', () => {
    const workHour = [...Array(24).keys()].find((h) => isWorkHour(h)) ?? 9;
    expect(detectWorkActivity([stubBuilding(BuildingType.LumberMill, 2)], workHour)).toBe('chop');
  });

  it('a staffed quarry mines, a forge hammers, a farm farms', () => {
    const workHour = 9;
    expect(detectWorkActivity([stubBuilding(BuildingType.Quarry, 1)], workHour)).toBe('mine');
    expect(detectWorkActivity([stubBuilding(BuildingType.Blacksmith, 1)], workHour)).toBe('hammer');
    expect(detectWorkActivity([stubBuilding(BuildingType.Farm, 1)], workHour)).toBe('farm');
    expect(detectWorkActivity([stubBuilding(BuildingType.HuntingSpot, 1)], workHour)).toBe('gather');
  });

  it('unstaffed, incomplete, or residential buildings stay silent', () => {
    const workHour = 9;
    expect(detectWorkActivity([stubBuilding(BuildingType.LumberMill, 0)], workHour)).toBeNull();
    const unbuilt = stubBuilding(BuildingType.Quarry, 2);
    unbuilt.completed = false;
    expect(detectWorkActivity([unbuilt], workHour)).toBeNull();
    expect(detectWorkActivity([stubBuilding(BuildingType.House, 3)], workHour)).toBeNull();
  });

  it('no work sounds outside work hours', () => {
    const nightHour = [...Array(24).keys()].find((h) => !isWorkHour(h)) ?? 20;
    expect(detectWorkActivity([stubBuilding(BuildingType.LumberMill, 2)], nightHour)).toBeNull();
  });

  it('terrainAt samples the terrain cell under a world position', () => {
    const map = uniformMap(20, 20, 0);
    // One override per probed 10px tile: (5,5) → tile (0,0), (15,15) → (1,1), (5,15) → (0,1).
    setTileOverride(map, 0, 0, { type: TerrainType.Grassland, elevation: 30, moisture: 50, variation: 0 });
    setTileOverride(map, 1, 1, { type: TerrainType.Forest, elevation: 30, moisture: 50, variation: 0 });
    setTileOverride(map, 0, 1, { type: TerrainType.Mountains, elevation: 60, moisture: 50, variation: 0 });
    expect(terrainAt(map, 5, 5)).toBe(TerrainType.Grassland);
    expect(terrainAt(map, 15, 15)).toBe(TerrainType.Forest);
    expect(terrainAt(map, 5, 15)).toBe(TerrainType.Mountains);
    expect(terrainAt(null, 5, 5)).toBeNull();
  });

  it('a moving settler reports the surface underfoot; idle ones stay silent', () => {
    const map = uniformMap(20, 20, 0);
    // The step under test samples this tile at the settler's new position (5, 5).
    setTileOverride(map, 0, 0, { type: TerrainType.Grassland, elevation: 30, moisture: 50, variation: 0 });
    const prev = [stubHuman(1, 4, 5), stubHuman(2, 5, 5)];
    const moved = [stubHuman(1, 5, 5), stubHuman(2, 5, 5)]; // id 1 moved 1px on grassland
    expect(detectFootstepSurface(prev, moved, map)).toBe(TerrainType.Grassland);
    expect(detectFootstepSurface(prev, prev, map)).toBeNull();
    expect(detectFootstepSurface(prev, moved, null)).toBeNull();
  });
});