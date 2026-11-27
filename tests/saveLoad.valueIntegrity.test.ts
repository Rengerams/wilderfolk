/**
 * Value checks at the load boundary: an id allocator that is missing or rewound, duplicate ids, bad
 * festival days and clock fields must be refused as "the session, or the reason".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, describeSaveLoadOutcome } from '../src/game/saveLoad';
import { getSimSeed, resetSimRng, setSimSeed } from '../src/game/simRng';
import { MapSize, WeatherType, type GameEventLog, type WorldState } from '../src/game/gameTypes';
import { createEmptyLifetimeStats } from '../src/game/stats';
import { addBigNews } from '../src/game/simEffects';
import { logEvent, EVENT_LOG_MAX_ENTRIES } from '../src/game/eventLog';

let initialPayload: Record<string, unknown> | undefined;

function realPayload(): Record<string, unknown> {
  resetSimRng();
  if (!initialPayload) {
    const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
    initialPayload = buildSaveData(world, createInitialView(world.width, world.height));
  }
  return structuredClone(initialPayload);
}

function buildWorld(payload: Record<string, unknown>): WorldState | null {
  const outcome = loadGameFromParsedOutcome(payload);
  return outcome.ok ? outcome.world : null;
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a refused load leaves the running session exactly as it was', () => {
  it('restores the live RNG when an invalid save is refused', () => {
    const payload = realPayload();
    setSimSeed(777);
    const before = getSimSeed();
    // Missing resources is a genuine invalid save; missing researchNodes is a supported
    // legacy-save case.
    delete payload.resources;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    expect(getSimSeed()).toBe(before);
  });

  it('still adopts the saved auto-save setting on a load that succeeds', () => {
    const payload = realPayload();
    payload.autoSave = false;

    const world = buildWorld(payload);

    expect(world?.autoSave).toBe(false);
  });
});

describe('the id allocators are made safe to consume', () => {
  it('refuses absent retirement history instead of inferring it from surviving ids', () => {
    const payload = realPayload();
    delete payload.nextEntityId;
    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('identity counters');
  });

  it('repairs a rewound allocator that would collide with a live id', () => {
    const payload = realPayload();
    payload.nextEntityId = 1;

    const world = buildWorld(payload)!;

    const highest = Math.max(...world.entities.map((entity) => entity.id));
    expect(world.nextEntityId).toBeGreaterThan(highest);
  });

  it('never lowers an allocator that is already above every live id', () => {
    const payload = realPayload();
    const generous = 999_999;
    payload.nextEntityId = generous;

    const world = buildWorld(payload)!;

    expect(world.nextEntityId).toBe(generous);
  });

  it('retires the id of a settler the genealogy registry still keeps', () => {
    const payload = realPayload();
    const entities = payload.entities as { id: number }[];
    if (entities.length === 0) throw new Error('fixture needs entities');
    const deadSettlerId = Math.max(...entities.map((entity) => entity.id)) + 10;
    payload.genealogyRegistry = {
      people: {
        [String(deadSettlerId)]: {
          id: deadSettlerId,
          name: 'Forgotten',
          birthSurname: '',
          surname: '',
          alive: false,
          partners: [],
          childrenIds: [],
        },
      },
    };
    payload.nextEntityId = 1;

    const world = buildWorld(payload)!;

    expect(world.nextEntityId).toBeGreaterThan(deadSettlerId);
  });

  it('refuses a stored allocator that has no usable successor left', () => {
    const payload = realPayload();
    payload.nextEntityId = Number.MAX_SAFE_INTEGER - 1;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('ignores a remembered id with no usable successor, so the floored allocator can still advance', () => {
    const payload = realPayload();
    payload.genealogyRegistry = {
      people: {
        [`${Number.MAX_SAFE_INTEGER - 1}`]: {
          id: Number.MAX_SAFE_INTEGER - 1,
          name: 'Forgotten',
          birthSurname: '',
          surname: '',
          alive: false,
          partners: [],
          childrenIds: [],
        },
      },
    };
    payload.nextEntityId = 1;

    const world = buildWorld(payload)!;

    expect(Number.isSafeInteger(world.nextEntityId + 1)).toBe(true);
    expect(world.nextEntityId).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER - 2);
  });

  it('ignores a retired id no allocator could advance past, instead of flooring onto it', () => {
    const payload = realPayload();
    payload.genealogyRegistry = {
      people: {
        [`${Number.MAX_SAFE_INTEGER}`]: {
          id: Number.MAX_SAFE_INTEGER,
          name: 'Forgotten',
          birthSurname: '',
          surname: '',
          alive: false,
          partners: [],
          childrenIds: [],
        },
      },
    };
    payload.nextEntityId = 1;

    const world = buildWorld(payload)!;

    expect(Number.isSafeInteger(world.nextEntityId)).toBe(true);
  });

  it('preserves the first building id when an empty colony is reloaded', () => {
    const payload = realPayload();
    payload.buildings = [];
    payload.nextBuildingId = 0;
    expect(buildWorld(payload)?.nextBuildingId).toBe(0);
  });

  it('keeps the live building id floor without a rival building list', () => {
    const payload = realPayload();
    payload.nextBuildingId = 1;

    const world = buildWorld(payload)!;

    expect(Number.isSafeInteger(world.nextBuildingId)).toBe(true);
  });
});

describe('entity ids must be integers, non-negative and unique', () => {
  function firstTwoEntities(payload: Record<string, unknown>): Record<string, unknown>[] {
    const list = payload.entities as Record<string, unknown>[];
    if (list.length < 2) throw new Error('fixture needs two entities');
    return list;
  }

  it('refuses a repeated id by name, because entityById would silently drop one of them', () => {
    const payload = realPayload();
    const list = firstTwoEntities(payload);
    list[1].id = list[0].id;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('duplicate');
  });

  it('refuses a fractional id', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = 1.5;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('refuses a negative id', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = -4;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('refuses an id with no successor, which would leave the allocator unable to advance', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = Number.MAX_SAFE_INTEGER;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('refuses an id whose floored allocator could no longer hand out a usable successor', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = Number.MAX_SAFE_INTEGER - 1;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('refuses the top id an allocator could hand out, which leaves the allocator nothing to hand out', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = Number.MAX_SAFE_INTEGER - 3;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
  });

  it('loads the highest id a save keeps, leaving an allocator the next save still accepts', () => {
    const payload = realPayload();
    firstTwoEntities(payload)[0].id = Number.MAX_SAFE_INTEGER - 4;
    payload.nextEntityId = 1;

    const world = buildWorld(payload)!;

    // The floor is the highest allocator value a save may carry, so the state the load produced is savable.
    expect(world.nextEntityId).toBe(Number.MAX_SAFE_INTEGER - 3);
    expect(loadGameFromParsedOutcome(buildSaveData(world, createInitialView(world.width, world.height))).ok).toBe(true);
  });

  it('still loads the uncorrupted payload, so those refusals are about the corruption', () => {
    expect(loadGameFromParsedOutcome(realPayload()).ok).toBe(true);
  });
});

describe('a festival must be one the daily tick can actually end', () => {
  it('drops a festival whose daysLeft is not a number, which would never expire', () => {
    const payload = realPayload();
    payload.festival = { active: true, name: 'Harvest Festival', daysLeft: 'abc' };

    const world = buildWorld(payload)!;

    expect(world.festival).toBeNull();
  });

  it('drops a festival that has already run out', () => {
    const payload = realPayload();
    payload.festival = { active: true, name: 'Harvest Festival', daysLeft: 0 };

    expect(buildWorld(payload)!.festival).toBeNull();
  });

  it('keeps a well-formed festival', () => {
    const payload = realPayload();
    payload.festival = { active: true, name: 'Harvest Festival', daysLeft: 3 };

    expect(buildWorld(payload)!.festival).toEqual({
      active: true,
      name: 'Harvest Festival',
      daysLeft: 3,
    });
  });
});

describe('the clock fields must be whole numbers the calendar can derive a date from', () => {
  /** The refusal detail a player is shown, so the failing field is actionable rather than a blank reason. */
  function refusalDetail(payload: Record<string, unknown>): string {
    const outcome = loadGameFromParsedOutcome(payload);
    if (outcome.ok) throw new Error('payload was expected to be refused');
    return describeSaveLoadOutcome(outcome);
  }

  it('refuses a negative tick, which the header would read as a year before the settlement', () => {
    const payload = realPayload();
    payload.tick = -1;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
    expect(refusalDetail(payload)).toContain('tick');
  });

  it('refuses a fractional tick, which no tick layer ever advances to a day boundary', () => {
    const payload = realPayload();
    payload.tick = 10.5;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
    expect(refusalDetail(payload)).toContain('tick');
  });

  it('refuses a tick past the last one whose day boundary is exact', () => {
    const payload = realPayload();
    // One day is added to a live tick by the calendar helpers, so the largest safe integer is past
    // the last usable tick and would round the day boundary the displayed date is derived from.
    payload.tick = Number.MAX_SAFE_INTEGER;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
    expect(refusalDetail(payload)).toContain('tick');
  });

  it('refuses a processed calendar day the daily gate could never pass again', () => {
    const payload = realPayload();
    // `isNewCalendarDayTick` runs the daily layer on `day > lastProcessedCalendarDay`, so a day
    // ahead of every real one stops days, seasons, ageing and births for good.
    payload.lastProcessedCalendarDay = 1e21;

    expect(loadGameFromParsedOutcome(payload).ok).toBe(false);
    expect(refusalDetail(payload)).toContain('lastProcessedCalendarDay');
  });

  it('still loads the uncorrupted payload, keeping its tick', () => {
    const payload = realPayload();

    const world = buildWorld(payload)!;

    expect(world.tick).toBe(payload.tick);
    expect(Number.isSafeInteger(world.tick)).toBe(true);
  });
});

function logEntry(id: number, message: string): GameEventLog {
  return { id, tick: 1, year: 0, day: 0, type: 'event', message };
}

/** A payload whose event log carries exactly the entries given, newest first. */
function payloadWithEventLog(entries: GameEventLog[]): Record<string, unknown> {
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
  world.eventLog = entries;
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

describe('a loaded lifetime record is complete and numeric', () => {
  it('fills the fields the payload never carried, keeping the ones it did', () => {
    const payload = realPayload();
    payload.lifetimeStats = { totalHumansBorn: 12, goldFromTradeRoutes: 7 };

    const world = buildWorld(payload)!;

    expect(world.lifetimeStats).toEqual({
      ...createEmptyLifetimeStats(),
      totalHumansBorn: 12,
      goldFromTradeRoutes: 7,
    });
  });

  it('replaces a mistyped counter and a mistyped nested record with the empty defaults', () => {
    const payload = realPayload();
    payload.lifetimeStats = {
      totalHumansDied: 'lots',
      totalResourcesGathered: 'none',
      longestLivingHuman: { name: 5, age: 'old' },
      largestPopulation: null,
    };

    const world = buildWorld(payload)!;

    expect(world.lifetimeStats.totalHumansDied).toBe(0);
    expect(world.lifetimeStats.totalResourcesGathered).toEqual({ wood: 0, stone: 0, food: 0, gold: 0 });
    expect(world.lifetimeStats.longestLivingHuman).toEqual({ name: '', age: 0 });
    expect(world.lifetimeStats.largestPopulation).toEqual({ count: 0, year: 0 });
    expect(world.lifetimeStats.mostProductiveYear).toEqual({ year: 0, buildings: 0 });
  });

  it('keeps a well-formed record as it was saved', () => {
    const payload = realPayload();
    const saved = createEmptyLifetimeStats();
    saved.totalHumansBorn = 41;
    saved.totalBuildingsUpgraded = 6;
    saved.longestLivingHuman = { name: 'Ada Whitfield', age: 77 };
    saved.largestPopulation = { count: 30, year: 4 };
    payload.lifetimeStats = saved;

    const world = buildWorld(payload)!;

    expect(world.lifetimeStats).toEqual(saved);
  });

  it('still refuses a record that is not an object at all, naming it', () => {
    const payload = realPayload();
    payload.lifetimeStats = 'none';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('lifetimeStats');
  });
});

describe('the weather fields are vetted at the load boundary', () => {
  it('refuses a weather value this build has no rule for', () => {
    const payload = realPayload();
    payload.weather = 'tornado';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('weather');
  });

  it('refuses a weather timer that is not a number, which would freeze the weather for good', () => {
    const payload = realPayload();
    payload.weatherTimer = 'soon';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('weatherTimer');
  });

  it('loads every weather this build knows', () => {
    const payload = realPayload();
    payload.weather = WeatherType.Drought;
    payload.weatherTimer = 12;

    const world = buildWorld(payload)!;

    expect(world.weather).toBe(WeatherType.Drought);
    expect(world.weatherTimer).toBe(12);
  });
});

describe('Big News cards survive a save', () => {
  it('writes the live cards and restores them instead of resetting the panel', () => {
    resetSimRng();
    const world = initGame({ skipTerrain: true, seed: 4242 });
    addBigNews(world, 'Raiders sighted', 'A raid is coming', 'negative');
    const payload = structuredClone(
      buildSaveData(world, createInitialView(world.width, world.height)),
    );

    expect(payload.bigNews).toHaveLength(1);

    const reloaded = buildWorld(payload)!;

    expect(reloaded.bigNews).toHaveLength(1);
    expect(reloaded.bigNews[0]).toMatchObject({
      title: 'Raiders sighted',
      message: 'A raid is coming',
      type: 'negative',
      dismissed: false,
    });
  });

  it('refuses a card list that is not an array, naming it', () => {
    const payload = realPayload();
    payload.bigNews = 'raiders';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('bigNews');
  });

  it('makes a card whose fields are unusable safe for its readers', () => {
    const payload = realPayload();
    payload.bigNews = [{ id: 'bn_7' }];

    const world = buildWorld(payload)!;

    expect(world.bigNews).toEqual([
      { id: 'bn_7', title: '', message: '', type: 'neutral', createdAt: 0, dismissed: false },
    ]);
  });

  it('still refuses a card with no id, naming its position', () => {
    const payload = realPayload();
    payload.bigNews = [{ title: 'no id' }];

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain('bigNews[0].id');
  });
});

describe('duplicate event-log ids are repaired on load', () => {
  it('drops the later entry that repeats an id, keeping the newest-first order', () => {
    const payload = payloadWithEventLog([
      logEntry(9, 'newest'),
      logEntry(9, 'duplicate of the newest'),
      logEntry(8, 'older'),
    ]);

    const world = buildWorld(payload)!;

    expect(world.eventLog.map((entry) => entry.id)).toEqual([9, 8]);
    expect(world.eventLog.map((entry) => entry.message)).toEqual(['newest', 'older']);
  });

  it('keeps issuing ids above the repaired log', () => {
    const payload = payloadWithEventLog([logEntry(4, 'a'), logEntry(4, 'b'), logEntry(3, 'c')]);

    const world = buildWorld(payload)!;
    logEvent(world, 'event', 'first line after the load');

    expect(world.eventLog[0].id).toBe(5);
    expect(new Set(world.eventLog.map((entry) => entry.id)).size).toBe(world.eventLog.length);
  });

  it('leaves a log whose ids are already unique alone', () => {
    const payload = payloadWithEventLog([logEntry(5, 'a'), logEntry(4, 'b')]);

    const world = buildWorld(payload)!;

    expect(world.eventLog.map((entry) => entry.id)).toEqual([5, 4]);
  });

  it('trims a log longer than the writers’ cap, keeping the newest entries', () => {
    const overflow = EVENT_LOG_MAX_ENTRIES + 5;
    const entries = Array.from({ length: overflow }, (_, index) =>
      logEntry(overflow - index, `line ${overflow - index}`));

    const world = buildWorld(payloadWithEventLog(entries))!;

    expect(world.eventLog).toHaveLength(EVENT_LOG_MAX_ENTRIES);
    expect(world.eventLog[0].id).toBe(overflow);
    expect(world.eventLog[world.eventLog.length - 1].id).toBe(overflow - EVENT_LOG_MAX_ENTRIES + 1);
  });
});
