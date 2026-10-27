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
 * F10 (`docs/private/audits/2026-09-20/`, tracked in `LIVE-FINDINGS-STATUS.md`): `storageMax` had
 * **three** writers and they disagreed — `worldGen`'s initial literal
 * (`1000 / 500 / 1000 / 2000 / 500`), `saveLoad`'s fallback (`800 / 300 / 800 / 20000 / 300`) and
 * `economy.computeStorageMax`, the owner whose rule `updateStorageCaps` applies every day.
 *
 * The disagreement was visible, not theoretical: `updateStorageCaps` runs only in the daily layer and
 * `initGame` starts a world at tick 24, so the first pass is the tick-72 day boundary — the world-gen
 * literal was the ceiling the player actually played the first days against, with gold 10× too low
 * and materials 25–67 % too high.
 *
 * These tests pin the two *bootstrap* writers to the owner: world-gen from tick 0, and the load
 * fallback for a save that carries no `storageMax` at all. They are deliberately about the numbers a
 * player starts against, not about the daily recompute, which `tests/storageCaps.dailyWiring.test.ts`
 * already covers.
 */
describe('F10 — the bootstrap writers of `storageMax` call the owner', () => {
  it('world-gen gives a fresh colony the caps of the owner rule, from tick 0', () => {
    const fresh = initGame({ seed: BOOTSTRAP_FIXTURE_SEED });

    // The premise that made the old literal matter: a fresh colony has no buildings, and the first
    // daily pass is still 48 ticks away (tick 24 → the tick-72 day boundary).
    expect(fresh.buildings).toEqual([]);
    expect(fresh.tick).toBe(TICKS_PER_HOUR * 8);
    expect(fresh.tick).toBeLessThan(TICKS_PER_DAY);

    // Pre-fix this was `{ wood: 1000, stone: 500, food: 1000, gold: 2000, iron: 500 }`.
    expect(fresh.storageMax).toEqual(computeStorageMax(fresh.buildings));

    // The daily owner agrees with world-gen instead of moving it: one rule, two callers.
    const atFirstDayBoundary = initGame({ seed: BOOTSTRAP_FIXTURE_SEED });
    updateStorageCaps(atFirstDayBoundary);
    expect(atFirstDayBoundary.storageMax).toEqual(fresh.storageMax);
  });

  it('the load fallback derives the caps of the buildings the save carries', () => {
    const world = initGame({ seed: BOOTSTRAP_FIXTURE_SEED });
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

    // Pre-fix the fallback was a third literal and building-blind: every save loaded with
    // `800 / 800` wood and food, i.e. without the Barn's 300 wood and 400 food.
    expect(loadedWorld.storageMax).toEqual(computeStorageMax(loadedWorld.buildings));
    const noBuildings = computeStorageMax([]);
    expect(loadedWorld.storageMax.wood).toBeGreaterThan(noBuildings.wood);
    expect(loadedWorld.storageMax.food).toBeGreaterThan(noBuildings.food);
  });

  it('no opening store starts at or above its own cap, so day 1 can still bank a gain', () => {
    const world = initGame({ seed: BOOTSTRAP_FIXTURE_SEED });

    // Measured against `computeStorageMax([])` = `800 / 300 / 800 / 20000 / 300`:
    // wood 220/800, stone 70/300, food 530/800, gold 80/20000, iron 30/300. Every starter stock sits
    // **below** its ceiling, so the corrected caps change no day-1 resource. The F10 writeup's
    // "the opening `wood: 2000` was already above its own cap of 1000, so a fresh colony could not
    // gain a single unit of wood" does **not** reproduce here: `worldGen` already clamps each starter
    // stock with `Math.min(<stock>, storageMax.<resource>)`. Reported to the coordinator as an open
    // question rather than silently re-balanced.
    for (const key of ['wood', 'stone', 'food', 'gold', 'iron'] as const) {
      expect(world.resources[key], `${key} starts at or above its cap`).toBeLessThan(
        world.storageMax[key],
      );
      expect(getAvailableStorageHeadroom(world, key), `${key} has no headroom on day 1`).toBeGreaterThan(0);
    }

    // The failure mode the finding described, asserted directly: a first gain must be accepted.
    const woodBefore = world.resources.wood;
    expect(addResource(world, 'wood', 10)).toBe(10);
    expect(world.resources.wood).toBe(woodBefore + 10);
  });
});

const GAIN_CLAMP_FIXTURE_SEED = 20_260_917;

/**
 * A gain must never *lower* a purse that is already above its cap.
 *
 * Regression for audit M2 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`). Stock legitimately exceeds a cap — `refundHalfBuildingCost`
 * adds resources uncapped, and a Barn/Silo demolished recomputes `storageMax` downwards while the
 * stores stay put. `state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + gain)`
 * then *sets gold down to the cap*, so the reward is credited to nobody, the surplus is deleted, and
 * the float/chronicle still announce a gain. The audit found two live sites; the same expression
 * appeared at eleven (nine more in `groupEvents.ts`, which it flagged for "one sweep").
 *
 * The owner already existed: `resourceUtils.addCappedResource` floors the headroom at zero and
 * returns what it actually added. Every site now calls it, and the source guard below keeps the
 * expression from coming back.
 */
describe('a gain never lowers an over-cap store', () => {
  it('a completed visitor quest leaves an over-cap purse alone and keeps the surplus', () => {
    const state = initGame({ villageName: 'Caps', size: 'medium', seed: GAIN_CLAMP_FIXTURE_SEED });
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

    // The exact shape: assigning `Math.min(storageMax.X, resources.X + …)` back onto the store.
    // `worldGen`'s `Math.min(220, storageMax.wood)` initialisation is a different shape and is not
    // matched; neither is the legitimate `Math.min(100, villageReputation + n)`.
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
 * E-1 (`docs/private/audits/2026-09-20/`): `updateStorageCaps` counted **rival-faction** buildings.
 *
 * The four filters were `completed && type === …`, so a rival Market — which `rivalEvents` really
 * does build (`completed: true`, `faction: 'rival'`, `groupEvents.createFactionBuilding`) — handed
 * the player +200 wood, +200 stone and +100 iron of storage on the next colony-day boundary, while
 * `canEstablishTradeRoute` still refused with "Build a Market". A rival Silo cut the player's
 * spoilage rate as well. The same concept is owned correctly elsewhere
 * (`tradeCaravans.hasCompletedMarket` uses `b.completed && b.faction !== 'rival' && …`).
 *
 * The player half of each case is asserted too, so the test cannot pass by the formula simply
 * falling back to its base values.
 */
describe('E-1 — a rival building confers no storage on the player', () => {
  it('a rival Market changes nothing; a player Market still adds its storage', () => {
    const base = capsFor([], 'player');
    const rival = capsFor([BuildingType.Market], 'rival');
    const player = capsFor([BuildingType.Market], 'player');

    // Pre-fix the rival Market produced exactly the player's numbers.
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
    // A rival Silo used to cut the *player's* spoilage rate to 0.8%.
    expect(rival.foodSpoilageRate).toBe(base.foodSpoilageRate);

    expect(player.storageMax.wood).toBeGreaterThan(base.storageMax.wood);
    expect(player.storageMax.food).toBeGreaterThan(base.storageMax.food);
    expect(player.storageMax.stone).toBeGreaterThan(base.storageMax.stone);
    expect(player.foodSpoilageRate).toBeLessThan(base.foodSpoilageRate);
  });
});
