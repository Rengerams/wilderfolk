/**
 * The Hunting/Fishing Spot ledger records what `addResource` accepted, not the nominal catch, so
 * a store with no room records less than the same catch with room.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY, isProductionTick } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { gameTick } from '../src/game/gameTick';
import { initGame } from '../src/game/worldGen';
import { seededRandomForRun, setSimSeed } from '../src/game/simRng';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';

const FIXTURE_SEED = 20_260_917;
const SPOT_ID = 10;
const PREY_ID = 20;
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
 * `maxAge` and `reproductionCooldown` are required by the real `gameTick`: an absent cooldown is
 * `NaN`, which makes every downstream comparison false.
 */
function human(id: number): Entity {
  return {
    id, type: EntityType.Human, x: 100, y: 100, energy: 100, maxEnergy: 100, age: 30,
    birthYear: 0, birthMonth: 0, birthDay: 0, alive: true, size: 10, speed: 2, vx: 0, vy: 0,
    flash: 0, animFrame: 0, spriteAngle: 0, childrenIds: [], generation: 0, isJuvenile: false,
    maxAge: 90, reproductionCooldown: 0,
    workerBuildingId: SPOT_ID,
    scheduleLastWorkedHours: 8,
  };
}

function deer(id: number): Entity {
  return {
    // Beside the crew (all at 100,100) on purpose: the spot only takes an animal within
    // `huntingSpot.huntingKillReach`, and the closing walk is `humanTick`'s job.
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
   * Re-index after replacing `entities` wholesale: `ensureEntityByIdMap` trusts only the map built
   * for this world object, so the spot's crew would otherwise resolve to absent settlers.
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
  setSimSeed(FIXTURE_SEED);
  return seededRandomForRun(`hunt:${SPOT_ID}:${tick}:${PREY_ID}:success`) < 0.85;
}

function assertPartialCatch(type: SpotKind): void {
  const tick = tickAtDailyPhase(DAY, 'production');
  expect(isProductionTick(tick - tick % TICKS_PER_DAY, INTERVAL[type]), 'fixture day is not a production tick').toBe(true);
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
  // A nominal-catch ledger would record the same number for both runs.
  expect(tight.recorded).toBeLessThan(roomy.recorded);
  // The float echoes the ledger's number, not the nominal catch; matched by prefix because a
  // partially clamped catch appends its own note.
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
