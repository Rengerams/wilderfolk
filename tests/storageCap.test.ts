import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeStorageMax, updateStorageCaps } from '../src/game/economy';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import type { Building, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { addResource, getAvailableStorageHeadroom } from '../src/game/resourceUtils';
import { deliverVisitorQuest } from '../src/game/visitorQuest';

const BOOTSTRAP_FIXTURE_SEED = 20_260_920;

/** A completed player building — the only kind `computeStorageMax` counts. */
function addCompleted(state: WorldState, type: BuildingType): void {
  const cfg = BUILDING_CONFIGS[type];
  state.buildings.push({
    id: 10_000 + state.buildings.length,
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

/**
 * `computeStorageMax` is the one owner of the storage caps; world-gen and the save-load fallback
 * must both derive from it instead of carrying their own literals.
 */
describe('F10 — the bootstrap writers of `storageMax` call the owner', () => {
  it('world-gen gives a fresh colony the caps of the owner rule, from tick 0', () => {
    const fresh = initGame({ skipTerrain: true, seed: BOOTSTRAP_FIXTURE_SEED });

    // The premise: a fresh colony has no buildings and its first daily pass has not run.
    expect(fresh.buildings).toEqual([]);
    expect(fresh.tick).toBe(TICKS_PER_HOUR * 8);
    expect(fresh.tick).toBeLessThan(TICKS_PER_DAY);

    // A fresh start uses the cap owner's derivation, never a stored literal.
    expect(fresh.storageMax).toEqual(computeStorageMax(fresh.buildings));

    // The daily owner agrees with world-gen instead of moving it: one rule, two callers.
    const atFirstDayBoundary = initGame({ skipTerrain: true, seed: BOOTSTRAP_FIXTURE_SEED });
    updateStorageCaps(atFirstDayBoundary);
    expect(atFirstDayBoundary.storageMax).toEqual(fresh.storageMax);
  });

  it('the load fallback derives the caps of the buildings the save carries', () => {
    const world = initGame({ skipTerrain: true, seed: BOOTSTRAP_FIXTURE_SEED });
    addCompleted(world, BuildingType.Barn);
    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const payload = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    // Exactly the save shape the fallback exists for: a payload with no `storageMax` at all.
    delete payload.storageMax;

    const loaded = loadGameFromParsed(payload);
    expect(loaded, 'the save must still restore').not.toBeNull();
    const loadedWorld = loaded!.world;
    expect(
      loadedWorld.buildings.some((b) => b.completed && b.type === BuildingType.Barn),
      'fixture premise: the Barn survived the round trip',
    ).toBe(true);

    // The fallback derives caps from the saved buildings, so the Barn's storage counts.
    expect(loadedWorld.storageMax).toEqual(computeStorageMax(loadedWorld.buildings));
    const noBuildings = computeStorageMax([]);
    expect(loadedWorld.storageMax.wood).toBeGreaterThan(noBuildings.wood);
    expect(loadedWorld.storageMax.food).toBeGreaterThan(noBuildings.food);
  });

  it('no opening store starts at or above its own cap, so day 1 can still bank a gain', () => {
    const world = initGame({ skipTerrain: true, seed: BOOTSTRAP_FIXTURE_SEED });

    // Against `computeStorageMax([])`, every starter stock sits below its cap, so a first gain is
    // accepted; `worldGen` clamps each starter stock to `storageMax`.
    for (const key of ['wood', 'stone', 'food', 'gold', 'iron'] as const) {
      expect(world.resources[key], `${key} starts at or above its cap`).toBeLessThan(
        world.storageMax[key],
      );
      expect(getAvailableStorageHeadroom(world, key), `${key} has no headroom on day 1`).toBeGreaterThan(0);
    }

    // The failure mode: a first gain must be accepted even on a fresh store.
    const woodBefore = world.resources.wood;
    expect(addResource(world, 'wood', 10)).toBe(10);
    expect(world.resources.wood).toBe(woodBefore + 10);
  });
});

const GAIN_CLAMP_FIXTURE_SEED = 20_260_917;

/**
 * A gain must never lower a purse already above its cap: `addCappedResource` floors headroom at
 * zero and returns what it actually added, so surplus stock survives.
 */
describe('a gain never lowers an over-cap store', () => {
  it('a completed visitor quest leaves an over-cap purse alone and keeps the surplus', () => {
    const state = initGame({ skipTerrain: true, villageName: 'Caps', size: 'medium', seed: GAIN_CLAMP_FIXTURE_SEED });
    state.storageMax.gold = 100;
    state.resources.gold = 250; // over cap, e.g. after a demolition refund
    state.resources.wood = 50;
    state.visitorQuest = {
      id: 'quest_1',
      emoji: '🔨',
      title: 'The traveling smith',
      description: 'Deliver 20 wood.',
      goalType: 'deliver',
      goalResource: 'wood',
      goalAmount: 20,
      progress: 0,
      status: 'active',
      rewardGold: 30,
      rewardReputation: 1,
      expiresDay: 99,
    };

    expect(deliverVisitorQuest(state)).toBe(true);

    expect(state.resources.wood).toBe(30); // the delivery still deducts
    expect(state.resources.gold).toBe(250); // the reward adds nothing over the cap…
    expect(state.resources.gold).not.toBe(100); // …and never clamps the purse down to it
  });

  it('keeps the defect expression out of src entirely', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') || full.endsWith('.tsx')) files.push(full);
      }
    };
    walk(resolve(process.cwd(), 'src'));

    // The exact shape: assigning `Math.min(storageMax.X, resources.X + …)` back onto the store;
    // `worldGen`'s starter-stock clamp and the reputation clamp are different shapes.
    const defect = /state\.resources\.\w+\s*=\s*Math\.min\(\s*state\.storageMax\./;
    const offenders = files.filter((file) => defect.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
    expect(files.length).toBeGreaterThan(300); // the walk must actually cover the tree
  });
});

/** Minimal world: only the fields `updateStorageCaps` touches. */
function makeWorld(): WorldState {
  return {
    buildings: [],
    storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    foodSpoilageRate: 0,
  } as unknown as WorldState;
}

function addBuilding(w: WorldState, type: BuildingType, faction: 'player' | 'rival'): void {
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
    faction,
  } as Building);
}

/** `storageMax` the caps owner derives from `types`, each owned by `faction`. */
function capsFor(types: BuildingType[], faction: 'player' | 'rival'): WorldState {
  const w = makeWorld();
  for (const type of types) addBuilding(w, type, faction);
  updateStorageCaps(w);
  return w;
}

/**
 * `updateStorageCaps` counts only completed player buildings: a rival Market or Silo must confer
 * no storage or spoilage benefit on the player.
 */
describe('E-1 — a rival building confers no storage on the player', () => {
  it('a rival Market changes nothing; a player Market still adds its storage', () => {
    const base = capsFor([], 'player');
    const rival = capsFor([BuildingType.Market], 'rival');
    const player = capsFor([BuildingType.Market], 'player');

    // A rival Market confers none of a player Market's caps.
    expect(rival.storageMax).toEqual(base.storageMax);
    expect(rival.foodSpoilageRate).toBe(base.foodSpoilageRate);

    expect(player.storageMax.wood).toBe(base.storageMax.wood + 200);
    expect(player.storageMax.stone).toBe(base.storageMax.stone + 200);
    expect(player.storageMax.iron).toBe(base.storageMax.iron + 100);
  });

  it('covers every cap contributor: Barn, Silo and Wood Storehouse, plus the Silo spoilage cut', () => {
    const player = capsFor(
      [BuildingType.Barn, BuildingType.Silo, BuildingType.WoodStorehouse],
      'player',
    );
    const rival = capsFor(
      [BuildingType.Barn, BuildingType.Silo, BuildingType.WoodStorehouse],
      'rival',
    );
    const base = capsFor([], 'player');

    expect(rival.storageMax).toEqual(base.storageMax);
    // Only the player's own Silo lowers the spoilage rate.
    expect(rival.foodSpoilageRate).toBe(base.foodSpoilageRate);

    expect(player.storageMax.wood).toBeGreaterThan(base.storageMax.wood);
    expect(player.storageMax.food).toBeGreaterThan(base.storageMax.food);
    expect(player.storageMax.stone).toBeGreaterThan(base.storageMax.stone);
    expect(player.foodSpoilageRate).toBeLessThan(base.foodSpoilageRate);
  });
});
