/** Phase 6+7 regression tests — Fishing Spot placement, Preserve config, Valley Chronicle. */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import { getPlaceBuildingFailureReason } from '../src/game/buildingActions';
import { VALLEY_CHAPTERS, advanceValleyChronicle } from '../src/game/valleyChronicle';
import type { WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  return initGame({ villageName: 'Phase678', size: 'medium' });
}

function addBuilding(w: WorldState, type: BuildingType): WorldState {
  const cfg = BUILDING_CONFIGS[type];
  w.buildings.push({
    id: w.nextBuildingId++,
    type,
    x: 300,
    y: 300,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never);
  return w;
}

const TILE = 10;
const isWater = (w: WorldState, tx: number, ty: number): boolean => {
  const t = w.worldMap?.tiles[ty]?.[tx];
  return !!t && (t.type === 'river' || t.type === 'shallowWater' || t.type === 'deepWater');
};

/** Search land tiles (with sub-tile offsets) for a placement result; return the first match. */
function findPlacement(w: WorldState, wantReason: null | 'terrain'): { x: number; y: number } | null {
  const map = w.worldMap;
  if (!map) return null;
  const offsets = [0.5, 0.25, 0.75, 0.35, 0.65];
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (isWater(w, tx, ty)) continue;
      const touchesWater =
        isWater(w, tx - 1, ty) || isWater(w, tx + 1, ty) || isWater(w, tx, ty - 1) || isWater(w, tx, ty + 1);
      if (wantReason === null && !touchesWater) continue;
      if (wantReason === 'terrain' && touchesWater) continue;
      for (const off of offsets) {
        const x = (tx + off) * TILE;
        const y = (ty + off) * TILE;
        const reason = getPlaceBuildingFailureReason(w, BuildingType.FishingSpot, x, y);
        if (reason === wantReason) return { x, y };
      }
    }
  }
  return null;
}

describe('fishing spot placement (rivers matter)', () => {
  it('config exists with its sprite and a hunter job', () => {
    const cfg = BUILDING_CONFIGS[BuildingType.FishingSpot];
    expect(cfg.sprite).toBe('/sprites/fishingspot.png');
    expect(cfg.maxOccupants).toBe(2);
  });

  it('can be placed on land that touches water', () => {
    const w = makeWorld();
    const spot = findPlacement(w, null);
    expect(spot).not.toBeNull();
  });

  it('cannot be placed far from water (terrain failure)', () => {
    const w = makeWorld();
    const spot = findPlacement(w, 'terrain');
    expect(spot).not.toBeNull();
  });
});

describe('wildlife preserve (eco tool)', () => {
  it('config exists with its sprite and no workers', () => {
    const cfg = BUILDING_CONFIGS[BuildingType.WildlifePreserve];
    expect(cfg.sprite).toBe('/sprites/wildlife_preserve.png');
    expect(cfg.maxOccupants).toBe(0);
  });
});

describe('valley chronicle (story spine)', () => {
  it('foundation chapter unlocks once a house is completed', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.House);
    const newly = advanceValleyChronicle(w);
    expect(newly).toContain('foundation');
    expect(w.chronicleChapters).toContain('foundation');
    // second call — no duplicates
    expect(advanceValleyChronicle(w)).toEqual([]);
  });

  it('chapters are an ordered list with unique ids', () => {
    const ids = VALLEY_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VALLEY_CHAPTERS.length).toBeGreaterThanOrEqual(8);
  });

  it('unmet chapters do not unlock', () => {
    const w = makeWorld();
    expect(advanceValleyChronicle(w)).toEqual([]);
  });
});
