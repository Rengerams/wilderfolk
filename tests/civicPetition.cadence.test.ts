/**
 * A civic petition is resolved once per colony day, by the town-hall owner.
 *
 * `resolveCivicPetition` is gated by a **day-stable** roll (`personDayRoll(id, tick, 821 + day)`),
 * but it was called from two realtime paths — the free-time petition helper and
 * `officialHandlePetitioners` — which both run every tick while the settler or official
 * stands at the hall. A roll that passed, therefore passed for all 72 ticks of the day, so
 * the petition's effects repeated at tick rate: +0.06 Official skill for every hall occupant
 * per tick, +1 reputation on the "heard" branch until reputation saturated at 100, and
 * food/gold aid spent per tick.
 *
 * The realtime paths are now cosmetic (the free-time walking motive stays; the official only
 * greets), and `tickTownHallAudiences` — the daily owner — is the single resolver. These
 * tests pin both halves: the official's per-tick greeting changes no state, and the daily
 * pulse still resolves a petition.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/humanSchedule';
import { officialHandlePetitioners, tickTownHallAudiences } from '../src/game/townHall';

const OFFICIAL_ID = 1;
const PETITIONER_ID = 2;
const FIXTURE_SEED = 20240913;
const HALL_X = 100;
const HALL_Y = 100;
/** Hour 8 of the day: inside the hall's open hours. */
const WORK_HOUR_TICK_OFFSET = 8 * 3;

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
  const state = initGame({ seed: FIXTURE_SEED });
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