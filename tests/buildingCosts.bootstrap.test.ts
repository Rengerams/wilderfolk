/**
 * Bootstrap invariant for building costs.
 *
 * A building that is the colony's *only* source of a material must never charge that
 * material — nor gold — or a colony at 0 of it can never build its way back. The reported
 * cases: a **Store** whose own description is "Generates gold." costing 15 gold, a **Mine**
 * that can dig the gold seam costing 15 gold, a **Lumber Mill** costing 35 wood, and a
 * **Quarry** costing 10 stone.
 *
 * Where the production lives: `dailyBuildingEconomy.ts` has one branch per producer, each
 * paying out its own resource (`addResource(state, 'gold'|'food'|'wood'|'stone'|'iron')`),
 * and `PRODUCTION_INTERVAL` lists every producing building. Market and Town Hall are
 * *additional* gold sources, gated behind `trade_1` / `architecture_2`, so they may charge
 * gold — the Store alone closes the dead end.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, MapSize } from '../src/game/gameTypes';
import type { BuildingCost } from '../src/game/buildings';
import { initGame } from '../src/game/gameEngine';

type Resource = 'wood' | 'stone' | 'food' | 'gold' | 'iron';

/**
 * `BuildingCost` (`src/game/buildings.ts`) is `{ wood; stone; gold; iron? }` — it has **no** `food`
 * key, and no config sets one. The "never charges a producer the material it produces" invariant
 * therefore held *by construction* for the four food producers, which is what made the old
 * `cost[produces] ?? 0` a check that could never fail: `cost['food']` was always `undefined → 0`.
 *
 * This type-level guard is the fix for that: if `BuildingCost` ever gains a `food` key it stops
 * compiling, so the assumption becomes a guarded one instead of an invisible one.
 */
const BUILDING_COST_HAS_NO_FOOD_KEY: 'food' extends keyof BuildingCost ? false : true = true;

/** The only axes a `BuildingCost` can charge on — the real keys of the type. */
const CHARGEABLE_RESOURCES = ['wood', 'stone', 'gold', 'iron'] as const satisfies readonly (keyof BuildingCost)[];

/** The colony's first (bootstrap) producer of each material, and what it pays out. */
const BOOTSTRAP_PRODUCERS: ReadonlyArray<{ type: BuildingType; produces: Resource }> = [
  { type: BuildingType.Farm, produces: 'food' },
  { type: BuildingType.Greenhouse, produces: 'food' },
  { type: BuildingType.FishingSpot, produces: 'food' },
  { type: BuildingType.HuntingSpot, produces: 'food' },
  { type: BuildingType.LumberMill, produces: 'wood' },
  { type: BuildingType.Quarry, produces: 'stone' },
  { type: BuildingType.Mine, produces: 'gold' },
  { type: BuildingType.Store, produces: 'gold' },
];

describe('bootstrap producer costs', () => {
  it('has no food axis in BuildingCost, so no producer can be charged what it makes', () => {
    expect(BUILDING_COST_HAS_NO_FOOD_KEY).toBe(true);
    for (const { type } of BOOTSTRAP_PRODUCERS) {
      expect(Object.keys(BUILDING_CONFIGS[type].cost), `${type} must not be charged food`).not.toContain('food');
    }
  });

  it('never charges a producer the material it produces', () => {
    for (const { type, produces } of BOOTSTRAP_PRODUCERS) {
      const cost = BUILDING_CONFIGS[type].cost;
      // A food producer cannot be charged food at all: `BuildingCost` has no `food` key, asserted
      // in the guard test above. Every other material is a real key, so this stays a live check.
      const charged = produces === 'food' ? 0 : cost[produces];
      expect({ type, charged }).toEqual({ type, charged: 0 });
    }
  });

  it('never charges a producer gold, so a broke colony can still build an income', () => {
    for (const { type } of BOOTSTRAP_PRODUCERS) {
      expect({ type, gold: BUILDING_CONFIGS[type].cost.gold ?? 0 }).toEqual({ type, gold: 0 });
    }
  });

  it('lets a new colony afford the first producer of every material', () => {
    const world = initGame({ size: MapSize.Medium, seed: 4242 });
    for (const { type } of BOOTSTRAP_PRODUCERS) {
      const cost = BUILDING_CONFIGS[type].cost;
      // Only the real `BuildingCost` keys: `food` is not one of them, so the old five-key list had a
      // food axis that could never fail.
      const affordable = CHARGEABLE_RESOURCES.every((key) => (world.resources[key] ?? 0) >= (cost[key] ?? 0));
      expect({ type, affordable }).toEqual({ type, affordable: true });
    }
  });

  it('lets a colony with no gold still house its settlers', () => {
    // Housing is survival. A House that costs 5 gold left a measured 30-day run with three
    // homeless settlers for ten days, because research and recruits had spent the treasury.
    expect(BUILDING_CONFIGS[BuildingType.House].cost.gold ?? 0).toBe(0);
  });

  it('keeps wood and stone mutually reachable, so neither is a dead end', () => {
    // The Lumber Mill is paid in stone and the Quarry in wood: either material alone can
    // start the other, and neither needs gold.
    expect(BUILDING_CONFIGS[BuildingType.LumberMill].cost.stone).toBeGreaterThan(0);
    expect(BUILDING_CONFIGS[BuildingType.LumberMill].cost.wood).toBe(0);
    expect(BUILDING_CONFIGS[BuildingType.Quarry].cost.wood).toBeGreaterThan(0);
    expect(BUILDING_CONFIGS[BuildingType.Quarry].cost.stone).toBe(0);
  });
});
