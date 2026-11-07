/**
 * A civic petition is resolved once per colony day: `tickTownHallAudiences` is the single resolver,
 * and the realtime paths only walk and greet.
 */
import { personDayRoll } from '../src/game/simRng';
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';

import { officialHandlePetitioners, resolveCivicPetition, tickTownHallAudiences } from '../src/game/townHall';
import { advanceHumanNeeds, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';

const OFFICIAL_ID = 1;
const PETITIONER_ID = 2;
const FIXTURE_SEED = 20240913;
const HALL_X = 100;
const HALL_Y = 100;
/** Hour 8 of the day: inside the hall's open hours. */
const WORK_HOUR_TICK_OFFSET = 8 * TICKS_PER_HOUR;

function human(id: number, job: JobType): Entity {
  return {
    id,
    type: EntityType.Human,
    x: HALL_X + 20,
    y: HALL_Y + 20,
    energy: 60,
    maxEnergy: 200,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: 2,
    size: 10,
    vx: 0,
    vy: 0,
    flash: 0,
    alive: true,
    gender: 'female',
    name: id === OFFICIAL_ID ? 'Officer' : 'Petitioner',
    surname: 'Vale',
    generation: 1,
    isJuvenile: false,
    job,
    childrenIds: [],
    reproductionCooldown: 0,
    relationshipStatus: 'single',
  } as Entity;
}

function makeHall(): Building {
  const cfg = BUILDING_CONFIGS[BuildingType.TownHall];
  return {
    id: 500,
    type: BuildingType.TownHall,
    x: HALL_X,
    y: HALL_Y,
    width: cfg.width,
    height: cfg.height,
    occupants: [OFFICIAL_ID],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never;
}

/** A day whose "grief / scandal heard" roll (salt 823) passes, at an hour the hall is open. */
function servableTick(): number {
  for (let day = 1; day <= 5000; day++) {
    const tick = day * TICKS_PER_DAY + WORK_HOUR_TICK_OFFSET;
    if (personDayRoll(PETITIONER_ID, tick, 823) < 0.55) return tick;
  }
  throw new Error('no day produces a passing civic-petition roll');
}

function makeWorld(): { state: WorldState; hall: Building; official: Entity; petitioner: Entity } {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  const hall = makeHall();
  const official = human(OFFICIAL_ID, JobType.Official);
  const petitioner = human(PETITIONER_ID, JobType.Settler);
  // `wantsCivicAudience` is satisfied by an active scandal cooldown; the "heard" branch
  // then needs its own passing roll, which `servableTick` finds.
  petitioner.scandalCooldownUntilTick = servableTick() + 100;
  state.entities = [official, petitioner];
  state.buildings = [hall];
  state.tick = servableTick();
  state.villageLeaderId = null;
  return { state, hall, official, petitioner };
}

describe('civic petitions resolve at the daily cadence only', () => {
  it('food relief credits nutrition exactly once, not a disposable legacy energy projection', () => {
    const { state, hall, petitioner } = makeWorld();
    // The actual petition owner uses two independent deterministic rolls.
    let served = false;
    for (let day = 1; day <= 5000 && !served; day++) {
      const tick = day * TICKS_PER_DAY + WORK_HOUR_TICK_OFFSET;
      if (personDayRoll(PETITIONER_ID, tick, 821 + day) >= 0.4 ||
          personDayRoll(PETITIONER_ID, tick, 822) >= 0.45) continue;
      state.tick = tick;
      state.humanPopulation = 100;
      state.resources.food = 30;
      petitioner.energy = 160;
      petitioner.needs = initialHumanNeeds(160, 200);
      petitioner.needs.nutrition = 5;
      petitioner.needs.severeHungerTicks = 100;
      const result = resolveCivicPetition(state, petitioner, hall);
      expect(result).toEqual({ kind: 'aid_food', amount: 1 });
      expect(state.resources.food).toBe(29);
      expect(state.economyLedger?.consumed.petition).toBe(1);
      expect(petitioner.needs.nutrition).toBe(15);
      expect(petitioner.needs.severeHungerTicks).toBe(0);
      expect(petitioner.needs.stamina).toBe(80);
      expect(petitioner.energy).toBe(160);
      advanceHumanNeeds(petitioner, { tick: tick + 1, sleeping: false, working: false, moving: false });
      expect(petitioner.needs.nutrition).toBeGreaterThan(14);
      served = true;
    }
    expect(served).toBe(true);
  });

  it('hearing a petitioner credits the stamina owner, surviving the next physiology tick', () => {
    const { state, hall, petitioner } = makeWorld();
    petitioner.needs = initialHumanNeeds(60, 200);
    const before = petitioner.needs.stamina;
    const result = resolveCivicPetition(state, petitioner, hall);
    expect(result.kind).toBe('heard');
    expect(petitioner.needs.stamina).toBeGreaterThan(before);
    const credited = petitioner.needs.stamina;
    advanceHumanNeeds(petitioner, { tick: state.tick + 1, sleeping: false, working: false, moving: false });
    expect(petitioner.needs.stamina).toBeGreaterThanOrEqual(credited);
  });
  it('an official standing at the hall applies no petition effect per tick', () => {
    const { state, hall, official, petitioner } = makeWorld();
    const energyBefore = petitioner.energy;
    const reputationBefore = state.villageReputation;
    const foodBefore = state.resources.food;
    const goldBefore = state.resources.gold;

    for (let i = 0; i < 12; i++) {
      officialHandlePetitioners(state, official, hall, [official, petitioner]);
    }

    expect(petitioner.energy).toBe(energyBefore);
    expect(state.villageReputation).toBe(reputationBefore);
    expect(state.resources.food).toBe(foodBefore);
    expect(state.resources.gold).toBe(goldBefore);
  });

  it('the daily town-hall pulse still resolves a petition', () => {
    const { state, hall, official, petitioner } = makeWorld();
    const energyBefore = petitioner.energy;
    const reputationBefore = state.villageReputation;

    tickTownHallAudiences(state, hall, [official, petitioner]);

    expect(petitioner.energy).toBeGreaterThan(energyBefore);
    expect(state.villageReputation).toBe(reputationBefore + 1);
  });
});