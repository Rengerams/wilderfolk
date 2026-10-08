/**
 * Measured producers-run defects: an established affair was announced once per tick of the encounter
 * hour (three times a day, and again on every later night), a night's hotel lodging announced once per
 * check-in tick, and the auto-staff card blamed idle settlers while the only open posts were manual.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, HOTEL_GUEST_CAPACITY } from '../src/game/gameTypes';
import type { Building, Entity, GameEventLog, WorldState } from '../src/game/gameTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  AFFAIR_ESTABLISHED_LOG_PHRASE,
  tryDailyAffairEncounter,
} from '../src/game/simulation/humanRelationships';
import { personDayRoll } from '../src/game/humanSchedule';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tickHotelLodging } from '../src/game/hotelStay';
import { autoStaffAllWorkers } from '../src/game/buildingStaffingActions';
import { assignMissingWorkers } from '../src/game/workforce';
import { invalidateEntityByIdMap } from '../src/game/entityIndex';
import {
  EVENT_LOG_MAX_ENTRIES,
  logEvent,
  repairEventLogOnLoad,
} from '../src/game/eventLog';
import { createEventCounter } from '../scripts/colonyHealth';

/** The staggered hour `humanTick` evaluates a settler's affair encounter at. */
const ENCOUNTER_HOUR = 18;

function settler(id: number, x: number, y: number, opts: Parameters<typeof createEntity>[6] = {}): Entity {
  return createEntity(EntityType.Human, x, y, id, 100, false, { ageYears: 30, ...opts });
}

/** A married wife at full tryst progress with a distant husband and a single paramour beside her. */
function affairFixture(tick: number) {
  const wife = settler(1, 10, 10, { gender: 'female', relationshipStatus: 'married', partnerId: 2 });
  const husband = settler(2, 100, 100, { gender: 'male' });
  const paramour = settler(3, 12, 10, { gender: 'male', relationshipStatus: 'single' });
  wife.affairProgress = 100;
  paramour.affairProgress = 100;
  const state = initGame();
  state.entities = [wife, husband, paramour];
  state.tick = tick;
  const entityById = new Map([[1, wife], [2, husband], [3, paramour]]);
  return { state, wife, paramour, others: [husband, paramour], entityById };
}

function encounterTick(day: number, subTick = 0): number {
  return day * TICKS_PER_DAY + ENCOUNTER_HOUR * TICKS_PER_HOUR + subTick;
}

/** The first colony day on which settler 1's encounter roll passes (the roll is keyed on the day). */
function firstPassingDay(fromDay: number): number {
  for (let day = fromDay; day < fromDay + 2000; day++) {
    if (personDayRoll(1, encounterTick(day), 610) < 0.01) return day;
  }
  throw new Error('no passing affair day found');
}

function affairLines(state: WorldState): GameEventLog[] {
  return state.eventLog.filter(
    (entry) => entry.type === 'scandal' && entry.message.includes(AFFAIR_ESTABLISHED_LOG_PHRASE),
  );
}

describe('affair establishment is announced once per affair', () => {
  it('three ticks of the encounter hour produce exactly one line', () => {
    const day = firstPassingDay(1);
    const { state, wife, paramour, others, entityById } = affairFixture(encounterTick(day));

    for (let subTick = 0; subTick < TICKS_PER_HOUR; subTick++) {
      state.tick = encounterTick(day, subTick);
      tryDailyAffairEncounter(
        state, wife, entityById, state.buildings, new Map(), 0, ENCOUNTER_HOUR, undefined, others,
        state.width, state.height,
      );
    }

    expect(wife.affairPartnerId).toBe(3);
    expect(paramour.affairPartnerId).toBe(1);
    expect(affairLines(state)).toHaveLength(1);
    expect(state.notifications.filter((note) => note.title === 'Affair')).toHaveLength(1);
  });

  it('a later passing night does not re-announce the same affair', () => {
    const day = firstPassingDay(1);
    const laterDay = firstPassingDay(day + 1);
    const { state, wife, others, entityById } = affairFixture(encounterTick(day));

    for (const tick of [encounterTick(day), encounterTick(laterDay)]) {
      state.tick = tick;
      tryDailyAffairEncounter(
        state, wife, entityById, state.buildings, new Map(), 0, ENCOUNTER_HOUR, undefined, others,
        state.width, state.height,
      );
    }

    expect(laterDay).toBeGreaterThan(day);
    expect(affairLines(state)).toHaveLength(1);
  });
});

function visitor(id: number, x: number, y: number): Entity {
  const entity = settler(id, x, y);
  entity.faction = 'visitor';
  return entity;
}

function hotel(id: number, x: number, y: number): Building {
  const building = createBuilding(BuildingType.Hotel, x, y, id);
  building.completed = true;
  building.occupants = [999];
  return building;
}

/** Visitor ids whose check-in rolls all pass, so one call fills a whole hotel deterministically. */
function checkInReadyIds(count: number, tick: number): number[] {
  const ids: number[] = [];
  for (let id = 2000; id < 200000 && ids.length < count; id++) {
    if (personDayRoll(id, tick, 910) <= 0.55 && personDayRoll(id, tick, 911) < 0.35) ids.push(id);
  }
  return ids;
}

describe('a night of hotel lodging is announced once', () => {
  it('a second staffed hotel filling on the same night adds no card and no chronicle line', () => {
    const tick = TICKS_PER_DAY + 19 * TICKS_PER_HOUR;
    const state = initGame();
    const ids = checkInReadyIds(HOTEL_GUEST_CAPACITY * 2, tick);
    expect(ids).toHaveLength(HOTEL_GUEST_CAPACITY * 2);

    const firstBatch = ids.slice(0, HOTEL_GUEST_CAPACITY);
    state.entities = firstBatch.map((id, index) => visitor(id, 300 + index, 300));
    state.buildings = [hotel(100, 300, 300)];
    state.tick = tick;
    invalidateEntityByIdMap(state);

    tickHotelLodging(state);
    const afterFirstNight = state.notifications.filter((note) => note.title === 'Hotel full of guests');
    expect(afterFirstNight).toHaveLength(1);

    const secondBatch = ids.slice(HOTEL_GUEST_CAPACITY);
    state.entities = [
      ...state.entities,
      ...secondBatch.map((id, index) => visitor(id, 301 + index, 300)),
    ];
    state.buildings = [...state.buildings, hotel(101, 301, 300)];
    invalidateEntityByIdMap(state);

    tickHotelLodging(state);

    expect(state.notifications.filter((note) => note.title === 'Hotel full of guests')).toHaveLength(1);
    expect(state.eventLog.filter((entry) => entry.message.startsWith('Hotel lodging'))).toHaveLength(1);
  });
});

describe('the auto-staff card reports the pass that ran', () => {
  it('an automatic staffing pulse announces nothing', () => {
    const state = initGame();
    const before = state.notifications.length;

    assignMissingWorkers(state.entities.filter((entity) => entity.alive), state.buildings, state);

    expect(state.notifications.length).toBe(before);
  });

  it('names the manual workplace instead of claiming every building is staffed', () => {
    const state = initGame();
    const church = createBuilding(BuildingType.Church, 400, 400, 700);
    church.completed = true;
    state.buildings = [church];
    state.entities = [settler(1, 400, 400, { gender: 'male' })];
    invalidateEntityByIdMap(state);

    const before = state.notifications.length;
    const staffed = autoStaffAllWorkers(state);
    const cards = staffed.notifications.slice(before).filter((note) => note.title.includes('Auto-staff'));

    expect(cards).toHaveLength(1);
    expect(cards[0]!.message).toMatch(/manual workplace/);
    expect(cards[0]!.message).not.toMatch(/already staffed/);
  });
});

describe('the lifecycle death counter counts death lines exactly once', () => {
  it('counts one per death entry, ignores other types, and never re-counts on re-observation', () => {
    const state = initGame();
    state.eventLog = [
      { id: 4, tick: 10, year: 0, day: 0, type: 'birth', message: 'A child was born' },
      { id: 3, tick: 9, year: 0, day: 0, type: 'death', message: 'A settler died of a sudden illness' },
      { id: 2, tick: 8, year: 0, day: 0, type: 'event', message: 'A wolf took a deer' },
      { id: 1, tick: 7, year: 0, day: 0, type: 'death', message: 'A settler died of old age' },
    ] as GameEventLog[];

    const counter = createEventCounter();
    expect(counter.observe(state).deaths).toBe(2);
    expect(counter.observe(state).deaths).toBe(2);
    expect(counter.observe(state).births).toBe(1);
  });
});

/** Newest-first, exactly as `logEvent`'s unshift builds it: index 0 carries the highest id. */
function newestFirstLog(count: number): GameEventLog[] {
  return Array.from({ length: count }, (_, index) => {
    const id = count - index;
    return { id, tick: id, year: 0, day: 0, type: 'event', message: `entry ${id}` };
  }) as GameEventLog[];
}

describe('the chronicle cap is a rolling window of the newest entries', () => {
  it('the tick trim drops the oldest entry and keeps the newest', () => {
    const state = {
      tick: 50000,
      year: 3,
      dayInYear: 1,
      eventLog: newestFirstLog(EVENT_LOG_MAX_ENTRIES),
    } as unknown as WorldState;

    logEvent(state, 'event', 'the newest line');

    expect(state.eventLog).toHaveLength(EVENT_LOG_MAX_ENTRIES);
    expect(state.eventLog[0]!.message).toBe('the newest line');
    expect(state.eventLog[state.eventLog.length - 1]!.id).toBe(2);
    expect(state.eventLog.some((entry) => entry.id === 1)).toBe(false);
  });

  it('a save/load round trip keeps the newest cap and drops the oldest', () => {
    const oversize = newestFirstLog(EVENT_LOG_MAX_ENTRIES + 500);
    const reloaded = JSON.parse(JSON.stringify({ eventLog: oversize })) as { eventLog: GameEventLog[] };

    repairEventLogOnLoad(reloaded);

    expect(reloaded.eventLog).toHaveLength(EVENT_LOG_MAX_ENTRIES);
    expect(reloaded.eventLog[0]!.id).toBe(EVENT_LOG_MAX_ENTRIES + 500);
    expect(reloaded.eventLog[reloaded.eventLog.length - 1]!.id).toBe(501);
  });
});
