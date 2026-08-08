/**
 * Phase 3.3 — work & footstep detection is pure logic (no audio side effects):
 * staffed production buildings pick the work sound during work hours, and a
 * moving settler's surface is sampled from the terrain map for the footstep.
 */
import { describe, it, expect } from 'vitest';
import { BuildingType, EntityType, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldMap } from '../src/game/gameTypes';
import {
  detectWorkActivity,
  detectFootstepSurface,
  terrainAt,
} from '../src/audio/workDetect';
import { isWorkHour } from '../src/game/dayCycle';

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
    const map = {
      width: 2,
      height: 2,
      tiles: [
        [{ type: TerrainType.Grassland } as WorldMap['tiles'][number][number], { type: TerrainType.DeepWater } as WorldMap['tiles'][number][number]],
        [{ type: TerrainType.Mountains }, { type: TerrainType.Forest }],
      ] as WorldMap['tiles'],
    } as WorldMap;
    expect(terrainAt(map, 5, 5)).toBe(TerrainType.Grassland);
    expect(terrainAt(map, 15, 15)).toBe(TerrainType.Forest);
    expect(terrainAt(map, 5, 15)).toBe(TerrainType.Mountains);
    expect(terrainAt(null, 5, 5)).toBeNull();
  });

  it('a moving settler reports the surface underfoot; idle ones stay silent', () => {
    const map = {
      width: 2,
      height: 2,
      tiles: [
        [{ type: TerrainType.Grassland }, { type: TerrainType.Snow }],
        [{ type: TerrainType.DarkForest }, { type: TerrainType.River }],
      ] as WorldMap['tiles'],
    } as WorldMap;
    const prev = [stubHuman(1, 4, 5), stubHuman(2, 5, 5)];
    const moved = [stubHuman(1, 5, 5), stubHuman(2, 5, 5)]; // id 1 moved 1px on grassland
    expect(detectFootstepSurface(prev, moved, map)).toBe(TerrainType.Grassland);
    expect(detectFootstepSurface(prev, prev, map)).toBeNull();
    expect(detectFootstepSurface(prev, moved, null)).toBeNull();
  });
});
