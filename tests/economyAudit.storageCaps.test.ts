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

  it('one Wood Storehouse adds +800 wood storage (winter fuel)', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.WoodStorehouse);
    updateStorageCaps(w);
    expect(w.storageMax.wood).toBe(1600);
  });

  it('a Silo raises food storage to 1400 and cuts spoilage to 0.8%', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.Silo);
    updateStorageCaps(w);
    expect(w.storageMax.food).toBe(1400);
    expect(w.foodSpoilageRate).toBeCloseTo(0.008);
  });

  it('a Barn raises wood storage +300 and food +400', () => {
    const w = makeWorld();
    addBuilding(w, BuildingType.Barn);
    updateStorageCaps(w);
    expect(w.storageMax.wood).toBe(1100);
    expect(w.storageMax.food).toBe(1200);
  });

  it('the Wood Storehouse config exists with its sprite', () => {
    const cfg = BUILDING_CONFIGS[BuildingType.WoodStorehouse];
    expect(cfg.sprite).toBe('/sprites/storehouse_wood.png');
    expect(cfg.maxOccupants).toBe(0);
  });
});
