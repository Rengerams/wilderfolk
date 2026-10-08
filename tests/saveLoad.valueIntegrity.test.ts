/**
 * The value layer of the load boundary, and the two globals a refused load used to leave changed.
 *
 * `saveLoad.elementShape.test.ts` guards element *shape*; this covers the consequences of trusting
 * values that are the right type but the wrong content: an id allocator that is missing or rewound,
 * duplicate ids, and a festival whose `daysLeft` is not a number. It also pins the contract the load
 * path declares — "the session, or the reason" — for the RNG and the auto-save preference, which the
 * restore adopts part-way through and used to leave adopted after a refusal.
 *
 * The fixture is a **real** payload from `buildSaveData` with one field corrupted, so a green case
 * proves the guard refuses the corruption without refusing the world it came from.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
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
  it('puts the RNG seed and streams back, instead of keeping the refused save', () => {
    const payload = realPayload();
    // The live session's own seed, set *after* the fixture was built — the fixture resets the RNG,
    // so a snapshot taken before it would measure the fixture rather than the session.
    setSimSeed(777);
    const before = getSimSeed();
    // `researchNodes` is read lower down the restore, after the seed adopt and the RNG restore, so
    // this refuses at the point where the globals have already been replaced.
    delete payload.researchNodes;

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
