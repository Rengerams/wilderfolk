import { describe, expect, it } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import type { Building } from '@/game/gameTypes';
import {
  analyzeStripJunction,
  classifyJunction,
  cornerRotationFromConnections,
  findStripBuildingNear,
  straightRotationFromConnections,
} from '@/game/stripJunction';

describe('stripJunction', () => {
  it('classifies elbow, tee, cross, and straight junctions', () => {
    expect(classifyJunction({ north: true, south: false, east: true, west: false })).toBe('elbow');
    expect(classifyJunction({ north: true, south: false, east: true, west: true })).toBe('tee');
    expect(classifyJunction({ north: true, south: true, east: true, west: true })).toBe('cross');
    expect(classifyJunction({ north: false, south: false, east: true, west: true })).toBe('straight');
  });

  it('picks corner rotation from connection arms', () => {
    expect(cornerRotationFromConnections({ north: true, south: false, east: true, west: false })).toBe(0);
    expect(cornerRotationFromConnections({ north: true, south: false, east: true, west: true })).toBe(0);
    expect(cornerRotationFromConnections({ north: true, south: true, east: true, west: true })).toBe(0);
  });

  it('picks straight rotation from axis connections', () => {
    expect(straightRotationFromConnections({ north: false, south: false, east: true, west: true })).toBe(0);
    expect(straightRotationFromConnections({ north: true, south: true, east: false, west: false })).toBe(90);
  });

  it('findStripBuildingNear returns the closest match, not the first', () => {
    const buildings: Building[] = [
      {
        id: 1,
        type: BuildingType.Wall,
        x: 100,
        y: 100,
        width: 40,
        height: 40,
        completed: true,
        constructionProgress: 100,
        occupants: [],
        health: 100,
        maxHealth: 100,
        level: 1,
        buildAnimTimer: 0,
        spriteScale: 1,
      },
      {
        id: 2,
        type: BuildingType.Wall,
        x: 104,
        y: 100,
        width: 40,
        height: 40,
        completed: true,
        constructionProgress: 100,
        occupants: [],
        health: 100,
        maxHealth: 100,
        level: 1,
        buildAnimTimer: 0,
        spriteScale: 1,
      },
    ];
    const hit = findStripBuildingNear(buildings, 103, 100, new Set([BuildingType.Wall]), 10);
    expect(hit?.id).toBe(2);
  });

  it('detects a tee where horizontal and vertical strips meet', () => {
    const hList = [{ x: 120, y: 200 }, { x: 180, y: 200 }];
    const vList = [{ x: 150, y: 200 }, { x: 150, y: 260 }];
    const info = analyzeStripJunction(150, 200, hList, vList, 60);
    expect(info.kind).toBe('tee');
  });
});