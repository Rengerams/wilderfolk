/**
 * The Hunting/Fishing Spot ledger records what storage accepted, not the nominal catch.
 *
 * Regression for audit M5 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): both branches called `addResource(state, 'food', amount)`
 * for its return value and then discarded it, recording the *nominal* catch in the ledger and in the
 * float/chronicle lines. `addResource` clamps to `storageMax` and returns what it added, and the
 * ledger's contract is "food that actually entered storage" (`economyLedger.ts`).
 *
 * The assertion is **differential** on purpose. A single run's food total is also moved by spoilage
 * (earlier in the same daily pass) and by a second, *unrecorded* food gain this fixture does not own
 * (a fresh medium world adds ~79 food on a hunting day without a ledger entry — a separate defect,
 * out of scope here), so "food gained == ledger" is not a stable identity. "A store with no room
 * records less than the same catch with room" is stable, and it is exactly the contract that was
 * broken: before the fix both runs recorded the identical nominal amount.
 *
 * The tight run is therefore **calibrated against the fixture**, not hard-coded: it starts the store
 * one below the cap *minus* whatever that unrecorded gain turns out to be, which leaves a single unit
 * of headroom plus whatever spoilage opens — an order of magnitude below the nominal catch of an
 * eight-strong crew (≈81 meat, ≈40 fish).
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY, isProductionTick } from '../src/game/dayCycle';
import { gameTick } from '../src/game/gameTick';
import { initGame } from '../src/game/worldGen';
import { seededRandomForRun } from '../src/game/simRng';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';

const FIXTURE_SEED = 20_260_917;
const SPOT_ID = 10;
const PREY_ID = 2;
/** 8 workers, so the nominal catch dwarfs the headroom spoilage can open on a full store. */
const CREW = 8;
/** A workday with no weekend/festival edge cases. */
const DAY = 2;

type SpotKind = typeof BuildingType.HuntingSpot | typeof BuildingType.FishingSpot;
const LEDGER_KEY: Record<SpotKind, string> = {
  [BuildingType.HuntingSpot]: 'hunting',
  [BuildingType.FishingSpot]: 'fishing',
};
const UNIT: Record<SpotKind, string> = {
  [BuildingType.HuntingSpot]: 'meat',
  [BuildingType.FishingSpot]: 'fish',
};
const INTERVAL: Record<SpotKind, number> = {
  [BuildingType.HuntingSpot]: PRODUCTION_INTERVAL.huntingSpot,
  [BuildingType.FishingSpot]: PRODUCTION_INTERVAL.fishingSpot,
};

/**
 * `maxAge` and `reproductionCooldown` are load-bearing for the real `gameTick` below:
 * `tickWildlife` reads `entity.age >= entity.maxAge` for old-age death and
 * `Math.max(0, entity.reproductionCooldown - step)` every pulse — an absent cooldown is `NaN`,
 * which makes every downstream comparison false. Values match `SPECIES_CONFIG`.
 */
function human(id: number): Entity {
  return {
    id, type: EntityType.Human, x: 100, y: 100, energy: 100, maxEnergy: 100, age: 30,
    birthYear: 0, birthMonth: 0, birthDay: 0, alive: true, size: 10, speed: 2, vx: 0, vy: 0,
    flash: 0, animFrame: 0, spriteAngle: 0, childrenIds: [], generation: 0, isJuvenile: false,
    maxAge: 90, reproductionCooldown: 0,
    homeBuildingId: SPOT_ID,
  };
}

function deer(id: number): Entity {
  return {
    // Beside the crew (all at 100,100) on purpose: the spot now only takes an animal it is standing
    // next to (`huntingSpot.huntingKillReach` — the owner's *"120 px is way to far, its 1800's they dont
    // have guns"*), and the walking that closes the distance in game is `humanTick`'s job, not this
    // fixture's.
    id, type: EntityType.Deer, x: 112, y: 100, energy: 500, maxEnergy: 500, age: 10, maxAge: 4380,
    birthYear: 0, birthMonth: 0, birthDay: 0,
    alive: true, size: 12, speed: 1, vx: 0, vy: 0, flash: 0, animFrame: 0, spriteAngle: 0,
    childrenIds: [], generation: 0, isJuvenile: false, reproductionCooldown: 576,
  };
}

function spot(type: SpotKind): Building {
  return {
    id: SPOT_ID, type, x: 80, y: 80, width: 40, height: 40,
    occupants: Array.from({ length: CREW }, (_, i) => i + 1), level: 1,
    constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1,
    buildAnimTimer: 0, huntingSpotPrey: 'deer',
  };
}

interface Harvest {
  state: WorldState;
  recorded: number;
}

function harvest(tick: number, food: number, type: SpotKind): Harvest {
  const state = initGame({ villageName: 'Ledger', size: 'medium', seed: FIXTURE_SEED });
  state.tick = tick - 1; // `gameTick` increments first, so the shot key uses `tick`
  state.entities = [...Array.from({ length: CREW }, (_, i) => human(i + 1)), deer(PREY_ID)];
  /**
   * Re-index after replacing `entities` wholesale, or the spot has no crew and produces nothing.
   *
   * `ensureEntityByIdMap` deliberately trusts only the map that was built **for this world object**
   * (`entityIndex.ts:29-33`), so the map `initGame` built for the generated world survives the
   * replacement and the spot's `occupants` (ids 1..8) resolve against settlers that are no longer in
   * `state.entities`. Production now resolves its hunter through that map
   * (`dailyBuildingEconomy.findLiveAssignedWorker`), so this test failed with
   * `{ hasHunter: false, occupants: 8, deer: 1, staffed: true }` once the Hunting Spot stopped
   * hunting without a hunter — the old code only used the hunter to *draw* the projectile and fired
   * anyway, which was the defect (`BUG_REPORTS/2026-09-30-hunting-yield-unbounded.md`). The fix is to
   * staff the fixture honestly, not to relax the no-hunter rule: `rebuildEntityByIdMap` is documented
   * for exactly this caller ("Full rebuild from alive entities — load recovery, init, and tests only").
   */
  rebuildEntityByIdMap(state);
  state.buildings = [spot(type)];
  state.humanPopulation = CREW;
  state.resources.food = food;
  gameTick(state);
  return { state, recorded: state.economyLedger?.produced[LEDGER_KEY[type]] ?? 0 };
}

/** The Hunting Spot's shot is a stateless seeded roll keyed on building, tick and prey. */
function shotLands(tick: number): boolean {
  return seededRandomForRun(`hunt:${SPOT_ID}:${tick}:${PREY_ID}:success`) < 0.85;
}

function assertPartialCatch(type: SpotKind): void {
  const tick = DAY * TICKS_PER_DAY;
  expect(isProductionTick(tick, INTERVAL[type]), 'fixture day is not a production tick').toBe(true);
  if (type === BuildingType.HuntingSpot) {
    expect(shotLands(tick), 'fixture day is one where the shot misses').toBe(true);
  }

  const roomy = harvest(tick, 0, type);
  expect(roomy.recorded, 'the roomy run recorded nothing — production never ran').toBeGreaterThan(0);

  // Everything the store gained that the ledger did not credit, measured rather than assumed.
  const unrecorded = roomy.state.resources.food - roomy.recorded;
  const cap = roomy.state.storageMax.food;
  const tight = harvest(tick, cap - unrecorded - 1, type);

  expect(tight.recorded, 'the tight run recorded nothing — the store rejected the whole catch').toBeGreaterThan(0);
  // Before the fix both runs record the nominal catch, which is the same number in both.
  expect(tight.recorded).toBeLessThan(roomy.recorded);
  // The float echoes the same number as the ledger, not the nominal catch. It is matched by prefix, not
  // by equality, because a *partially* clamped catch now also says so (F6): the Fishing Spot appends
  // " (store full)" to its own line, while the Hunting Spot raises the shared "Stores full!" float at the
  // building and keeps `+N meat` over the prey.
  const echoed = tight.state.floatingTexts.find((t) => t.text.startsWith(`+${tight.recorded} ${UNIT[type]}`));
  expect(echoed, 'no float echoed the accepted count').toBeTruthy();
  expect(
    tight.state.floatingTexts.some((t) => t.text.includes('tores full') || t.text.includes('store full')),
    'a partially clamped catch went unmentioned (F6)',
  ).toBe(true);
}

describe('hunting and fishing record what storage accepted (M5)', () => {
  it('records the accepted catch, not the nominal one, for the Hunting Spot', () => {
    assertPartialCatch(BuildingType.HuntingSpot);
  });

  it('records the accepted catch for the Fishing Spot too', () => {
    assertPartialCatch(BuildingType.FishingSpot);
  });
});
