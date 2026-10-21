/**
 * Economy audit regression tests — storage caps, gold cap, spoilage, and the
 * Wood Storehouse building fix the audit's winter-banking / snowball findings
 * (see docs/private/ECONOMY_AUDIT_2026-08-17.md).
 */
import { describe, it, expect } from 'vitest';
import { updateStorageCaps } from '../src/game/economy';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import type { WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  // Minimal world: only the fields updateStorageCaps touches.
  return {
    buildings: [],
    storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    foodSpoilageRate: 0,
  } as unknown as WorldState;
}

function addBuilding(w: WorldState, type: BuildingType): void {
  const cfg = BUILDING_CONFIGS[type];
  w.buildings.push({
    id: w.buildings.length + 1,
    type,
    x: 0,
    y: 0,
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
}

describe('economy audit fixes', () => {
  it('base caps: wood 800 (winter banking), food 800, gold capped at 20000', () => {
    const w = makeWorld();
    updateStorageCaps(w);
    expect(w.storageMax.wood).toBe(800);
    expect(w.storageMax.food).toBe(800);
    expect(w.storageMax.gold).toBe(20000);
  });

  it('base spoilage is 2% (was 3%)', () => {
    const w = makeWorld();
    updateStorageCaps(w);
    expect(w.foodSpoilageRate).toBeCloseTo(0.02);
  });

  it('one Storehouse adds +800 capacity for all non-food resources', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.WoodStorehouse);
    updateStorageCaps(w);
    expect(w.storageMax.wood).toBe(1600);
    expect(w.storageMax.stone).toBe(1100);
    expect(w.storageMax.iron).toBe(1100);
    expect(w.storageMax.gold).toBe(20800);
    expect(w.storageMax.food).toBe(800);
  });

  it('upgraded Storehouses add 1800 at level 2 and 2800 at level 3 to each non-food resource', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.WoodStorehouse);
    w.buildings[0]!.level = 2;
    updateStorageCaps(w);
    expect(w.storageMax).toMatchObject({ wood: 2600, stone: 2100, iron: 2100, gold: 21800, food: 800 });
    w.buildings[0]!.level = 3;
    updateStorageCaps(w);
    expect(w.storageMax).toMatchObject({ wood: 3600, stone: 3100, iron: 3100, gold: 22800, food: 800 });
    addBuilding(w, BuildingType.WoodStorehouse);
    updateStorageCaps(w);
    expect(w.storageMax).toMatchObject({ wood: 4400, stone: 3900, iron: 3900, gold: 23600, food: 800 });
  });

  it('a Silo raises food storage to 2800 and cuts spoilage to 0.8%', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.Silo);
    updateStorageCaps(w);
    expect(w.storageMax.food).toBe(2800);
    expect(w.foodSpoilageRate).toBeCloseTo(0.008);
  });

  it('upgraded Silos grant 2500 at level 2 and 3000 at level 3, stacking by building', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.Silo);
    w.buildings[0]!.level = 2;
    updateStorageCaps(w);
    expect(w.storageMax.food).toBe(3300);
    w.buildings[0]!.level = 3;
    updateStorageCaps(w);
    expect(w.storageMax.food).toBe(3800);
    addBuilding(w, BuildingType.Silo);
    updateStorageCaps(w);
    expect(w.storageMax.food).toBe(5800);
  });

  it('a Barn raises wood storage +300 and food +400', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.Barn);
    updateStorageCaps(w);
    expect(w.storageMax.wood).toBe(1100);
    expect(w.storageMax.food).toBe(1200);
  });

  it('the Storehouse config retains its sprite and saved building type', () => {
    const cfg = BUILDING_CONFIGS[BuildingType.WoodStorehouse];
    expect(cfg.sprite).toBe('/sprites/storehouse.png');
    expect(cfg.label).toBe('Storehouse');
    expect(cfg.maxOccupants).toBe(0);
  });
});