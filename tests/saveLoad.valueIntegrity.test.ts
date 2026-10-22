/**
 * The value layer of the load boundary, and the two globals a refused load used to leave changed.
 *
 * `saveLoad.elementShape.test.ts` guards element *shape*; this covers the consequences of trusting
 * values that are the right type but the wrong content: an id allocator that is missing or rewound,
 * duplicate ids, a festival whose `daysLeft` is not a number, and the clock fields a date is derived
 * from. It also pins the contract the load
 * path declares — "the session, or the reason" — for the RNG and the auto-save preference, which the
 * restore adopts part-way through and used to leave adopted after a refusal.
 *
 * The fixture is a **real** payload from `buildSaveData` with one field corrupted, so a green case
 * proves the guard refuses the corruption without refusing the world it came from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, describeSaveLoadOutcome } from '../src/game/saveLoad';
import { getSimSeed, resetSimRng, setSimSeed } from '../src/game/simRng';
import type { WorldState } from '../src/game/gameTypes';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
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
    // Missing resources is a genuine invalid save. Missing researchNodes is now
    // an intentionally supported legacy-save case and must not be used to force refusal.
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
  it('repairs an absent allocator to one past the highest live id', () => {
    const payload = realPayload();
    delete payload.nextEntityId;

    const world = buildWorld(payload)!;

    const highest = Math.max(...world.entities.map((entity) => entity.id));
    expect(Number.isSafeInteger(world.nextEntityId)).toBe(true);
    expect(world.nextEntityId).toBeGreaterThan(highest);
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
    delete payload.nextEntityId;

    const world = buildWorld(payload)!;

    expect(world.nextEntityId).toBeGreaterThan(deadSettlerId);
  });

  it('retires a camp structure id a rival row still names', () => {
    const payload = realPayload();
    // A young colony may hold no buildings yet, so the live floor can legitimately be zero.
    const buildings = payload.buildings as { id: number }[];
    const retiredCampId = Math.max(0, ...buildings.map((building) => building.id)) + 10;
    payload.rivalSettlements = [{
      id: 'rival_camp',
      name: 'FoxGlen',
      campX: 10,
      campY: 10,
      population: 1,
      entityIds: [],
      buildingIds: [retiredCampId],
      relationship: 'tense',
      foundedYear: 1,
      daysUntilAction: 0,
      raidCooldownDays: 0,
      peaceTreatyDays: 0,
    }];
    delete payload.nextBuildingId;

    const world = buildWorld(payload)!;

    expect(world.nextBuildingId).toBeGreaterThan(retiredCampId);
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
