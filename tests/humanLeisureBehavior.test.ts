import { PERSON_DAY_ROLL_SALTS, personDayRoll, resetSimRng, setSimSeed } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { BuildingType, WeatherType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import {
  CHILD_PLAYMATE_CANDIDATE_LIMIT,
  idleDestination,
  leisureKindFor,
  tickHumanChildLeisure,
} from '../src/game/humanLeisureBehavior';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';
import { homeStandPosition } from '../src/game/simulation/humanMovement';

function playerChild(prototype: Entity, id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(structuredClone(prototype), {
    id,
    alive: true,
    isJuvenile: true,
    age: 10,
    energy: 90,
    maxEnergy: 100,
    x: 100,
    y: 100,
    motherId: undefined,
    fatherId: undefined,
  }, overrides);
}

function childFixture(): { state: ReturnType<typeof initGame>; child: Entity } {
  const state = initGame({ skipTerrain: true, seed: 4242 });
  const prototype = state.entities.find((entity) => isPlayerHuman(entity) && entity.alive);
  if (!prototype) throw new Error('worldGen produced no player settler for the child leisure test');
  state.entities = [];
  state.buildings = [];
  state.weather = WeatherType.Clear;
  return { state, child: playerChild(prototype, 10) };
}

function playTickFor(child: Entity, start = 1, end = 500): number {
  for (let tick = start; tick < end; tick++) {
    const tickBucket = Math.floor(tick / TICKS_PER_HOUR);
    if (personDayRoll(child.id, tick, 718 + tickBucket) < 0.72) return tick;
  }
  throw new Error('could not find a child play tick');
}

function nextPlayHour(child: Entity): { firstCheck: number; sameHourCheck: number; nextCheck: number } {
  for (let hour = 0; hour < 500; hour++) {
    const nextCheck = (hour + 1) * TICKS_PER_HOUR;
    const nextBucket = Math.floor(nextCheck / TICKS_PER_HOUR);
    if (personDayRoll(child.id, nextCheck, 718 + nextBucket) < 0.72) {
      return {
        firstCheck: hour * TICKS_PER_HOUR + 1,
        sameHourCheck: hour * TICKS_PER_HOUR + 2,
        nextCheck,
      };
    }
  }
  throw new Error('could not find consecutive child play hours');
}

/** A crowded play tick whose uncapped choice would fall outside the bounded candidate list. */
function crowdedSteeringTick(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[]): number {
  const nearby = allHumans.length - 1;
  for (let tick = 1; tick < 5000; tick++) {
    const tickBucket = Math.floor(tick / TICKS_PER_HOUR);
    if ((child.id + tickBucket) % nearby < CHILD_PLAYMATE_CANDIDATE_LIMIT) continue;
    if (personDayRoll(child.id, tick, 718 + tickBucket) >= 0.72) continue;
    child.vx = 0;
    child.vy = 0;
    if (tickChild(state, child, allHumans, tick)) return tick;
  }
  throw new Error('could not find a crowded child play tick');
}

function tickChild(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[], tick: number): boolean {
  state.tick = tick;
  return tickHumanChildLeisure({
    state,
    entity: child,
    speed: 5,
    hourOfDay: 12,
    onSchedule: false,
    allHumans,
    entityById: new Map(allHumans.map((human) => [human.id, human])),
    updatedBuildings: [],
    buildingById: new Map(),
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
    livingHumanAt: () => undefined,
    suppressIdleInitial: false,
  });
}

describe('tickHumanChildLeisure', () => {
  it('steers children toward a playmate in the neighborhood', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, nearby, distant], playTickFor(child))).toBe(true);
    expect(child.vx).toBeGreaterThan(0);
  });

  it('does not select a child outside the neighborhood', () => {
    const { state, child } = childFixture();
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, distant], playTickFor(child))).toBe(false);
    expect(child.vx).toBe(0);
    expect(child.vy).toBe(0);
  });

  it('chooses from a bounded candidate set in a crowded neighborhood', () => {
    const { state, child } = childFixture();
    const right = Array.from({ length: CHILD_PLAYMATE_CANDIDATE_LIMIT }, (_, i) =>
      playerChild(child, 100 + i, { x: 140, y: 100 }));
    const left = Array.from({ length: CHILD_PLAYMATE_CANDIDATE_LIMIT / 2 }, (_, i) =>
      playerChild(child, 200 + i, { x: 60, y: 100 }));
    const humans = [child, ...right, ...left];

    crowdedSteeringTick(state, child, humans);

    expect(child.vx).toBeGreaterThan(0);
  });

  it('refreshes neighborhood selection every hour while keeping the mate between checks', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const { firstCheck, sameHourCheck, nextCheck } = nextPlayHour(child);

    expect(tickChild(state, child, [child], firstCheck)).toBe(false);
    expect(tickChild(state, child, [child, nearby], sameHourCheck)).toBe(false);
    expect(tickChild(state, child, [child, nearby], nextCheck)).toBe(true);
    expect(child.vx).toBeGreaterThan(0);
    expect(tickChild(state, child, [child, nearby], nextCheck + 1)).toBe(true);
  });

  it('drops a cached playmate that a rollback removed from the roster', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const tick = playTickInsideOneHour(child);

    expect(tickChild(state, child, [child, nearby], tick)).toBe(true);
    expect(child.vx).toBeGreaterThan(0);

    // The rollback restores a roster without the extra child, inside the same cached hour.
    child.vx = 0;
    child.vy = 0;
    expect(tickChild(state, child, [child], tick + 1)).toBe(false);
    expect(child.vx).toBe(0);
  });
});

/** A play tick that is not the last of its hour bucket, so `tick + 1` stays in the cached window. */
function playTickInsideOneHour(child: Entity): number {
  for (let tick = 1; tick < 500; tick++) {
    if (tick % TICKS_PER_HOUR === TICKS_PER_HOUR - 1) continue;
    const tickBucket = Math.floor(tick / TICKS_PER_HOUR);
    if (personDayRoll(child.id, tick, 718 + tickBucket) < 0.72) return tick;
  }
  throw new Error('could not find a child play tick inside one hour');
}

describe('seeded free-time selection', () => {
  afterEach(() => {
    resetSimRng();
  });

  it('changes the 12-way leisure activity with the run seed', () => {
    const kindsFor = (seed: number): number[] => {
      resetSimRng();
      setSimSeed(seed);
      // A slot per sample, so a seed moves the spice of every slot independently.
      return Array.from({ length: 12 }, (_, index) => leisureKindFor(7, 3000 + index * 1000, false));
    };

    const first = kindsFor(1);
    expect(kindsFor(1)).toEqual(first);
    expect(kindsFor(2)).not.toEqual(first);
  });

  it('holds one activity for the whole leisure slot instead of shifting with the calendar day', () => {
    resetSimRng();
    setSimSeed(77);
    // A leisure slot is 80 hours, so it spans several colony days; a day term in the choice made the
    // activity change every midnight even though the slot (and the UI's promise) says it holds.
    const slot = 3;
    const slotTicks = 80 * TICKS_PER_HOUR;
    const kinds = [0, 1, 2].map((dayOffset) =>
      leisureKindFor(0, slot * slotTicks + dayOffset * 288 + 10, false));

    expect(new Set(kinds).size).toBe(1);
  });

  it('never reuses a registered decision salt, so idle choices cannot correlate', () => {
    const salts = Object.values(PERSON_DAY_ROLL_SALTS);
    expect(new Set(salts).size).toBe(salts.length);
    // 812 is the scarce-hunt dialogue's salt; 201 is the schedule's weekend free-day roll.
    expect(salts).not.toContain(812);
    expect(salts).not.toContain(201);
  });

  it('does not send a settler home on the scarce-hunt dialogue roll', () => {
    const entityId = 10;
    // A day where the old shared 812 roll says "go home" but the leisure salt does not.
    let tick = -1;
    for (let day = 0; day < 2000; day++) {
      const candidate = day * 288;
      if (
        personDayRoll(entityId, candidate, 812) < 0.34
        && personDayRoll(entityId, candidate, PERSON_DAY_ROLL_SALTS.leisureIdleDestination) >= 0.34
      ) {
        tick = candidate;
        break;
      }
    }
    expect(tick).toBeGreaterThanOrEqual(0);

    const home = {
      id: 50,
      type: BuildingType.House,
      x: 400,
      y: 400,
      width: 40,
      height: 40,
      occupants: [entityId],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as unknown as Building;
    const settler = {
      id: entityId,
      type: 'human',
      alive: true,
      age: 30,
      x: 100,
      y: 100,
      residenceBuildingId: home.id,
    } as unknown as Entity;
    const state = { tick, beautyGrid: undefined } as unknown as WorldState;

    const destination = idleDestination(state, settler, [], new Map([[home.id, home]]));
    const porch = homeStandPosition(home, entityId);

    expect(destination).not.toEqual(porch);
  });
});
