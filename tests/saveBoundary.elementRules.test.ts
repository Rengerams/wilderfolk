/**
 * What a camp, an incoming raid and a provisions card must be at the load boundary.
 *
 * These three are the persisted objects a malformed payload could get past the container rule: only
 * `id` was vetted, so `{ id, daysLeft: 0 }` with no `entityIds` loaded and then threw inside a daily
 * tick, a group with no `daysLeft` never departed, a raid with no `attackerStrength` resolved every
 * Defend/Barricade as `'defeat'`, and a card without a usable `choices` list white-screened the shell
 * from `getVillageRequestEligibility`.
 *
 * Each fixture is a **real** payload from `buildSaveData` with one writer-shaped element added, so a
 * green case proves the new rules refuse the corruption without refusing what the game writes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { MAP_SIZE_DIMENSIONS, MapSize, type RaidEvent, type VisitorGroup, type VillageRequest } from '../src/game/gameTypes';

/** A camp as `groupEvents.spawnVisitorGroup` writes one. */
function visitorGroup(): VisitorGroup {
  return {
    id: 'visitor_traders_1',
    name: 'The Fairweather Caravan',
    kind: 'traders',
    campX: 300,
    campY: 300,
    daysLeft: 4,
    spawnedAtCalendarDay: 2,
    entityIds: [],
    giftsGiven: 0,
    tradesCompleted: 0,
    gold: 40,
    refugeeResolved: true,
    leaderTalked: false,
  };
}

/** An incoming raid as `frontierCombat.maybeQueueRaid` writes one. */
function raidEvent(): RaidEvent {
  return {
    id: 'raid_rival_1_720',
    rivalId: 'rival_1',
    rivalName: 'Ravenhold',
    title: 'Ravenhold is raiding!',
    description: 'War-bands march.',
    emoji: '⚔️',
    choices: [{ id: 'defend', label: 'Defend the village', hint: 'Meet them in the open.' }],
    createdAtTick: 0,
    expiresAtTick: 720,
    marchDistanceTiles: 6,
    attackerStrength: 35,
    lootFood: 10,
    lootGold: 5,
    lootWood: 2,
    lootStone: 1,
  };
}

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  world.visitorGroups.push(visitorGroup());
  world.pendingRaidEvents.push(raidEvent());
  world.activeVillageRequest = {
    id: 'vreq_caravan_provisions_visitor_traders_1_2',
    kind: 'caravan_provisions',
    sourceVisitorGroupId: 'visitor_traders_1',
    sourceName: 'The Fairweather Caravan',
    emoji: '🥣',
    title: 'Caravan Provisions Offer',
    description: 'They offer preserved food.',
    choices: [
      { id: 'accept', label: 'Accept provisions', detail: 'Pay 20 gold for 30 food.' },
      { id: 'decline', label: 'Decline politely', detail: 'Keep your supplies.' },
    ],
    expiresDay: 5,
  } satisfies VillageRequest;
  return structuredClone(
    buildSaveData(world, createInitialView(world.width, world.height)),
  ) as Record<string, unknown>;
}

function visitorGroupIn(payload: Record<string, unknown>): Record<string, unknown> {
  const list = payload.visitorGroups as Record<string, unknown>[];
  return list[0];
}

function raidEventIn(payload: Record<string, unknown>): Record<string, unknown> {
  const list = payload.pendingRaidEvents as Record<string, unknown>[];
  return list[0];
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a real camp, raid and provisions card still load', () => {
  it('accepts the payload the writer produced, and keeps the card', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(1);
    expect(outcome.world.visitorGroups[0].daysLeft).toBe(4);
    expect(outcome.world.pendingRaidEvents).toHaveLength(1);
    expect(outcome.world.pendingRaidEvents[0].attackerStrength).toBe(35);
    expect(outcome.world.activeVillageRequest?.choices).toHaveLength(2);
  });
});

describe('a camp whose own fields are unusable is refused by name', () => {
  it('refuses a camp with no entityIds, which a daily tick dereferences', () => {
    const payload = realPayload();
    delete visitorGroupIn(payload).entityIds;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('visitorGroups[0].entityIds');
  });

  it('refuses a camp whose daysLeft is not a number, which never reaches 0', () => {
    const payload = realPayload();
    visitorGroupIn(payload).daysLeft = 'four';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('visitorGroups[0].daysLeft');
  });

  it('refuses a camp whose kind is none of the kinds the tick switches on', () => {
    const payload = realPayload();
    visitorGroupIn(payload).kind = 'pirates';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('visitorGroups[0].kind');
  });

  it('defaults a camp with no giftsGiven the way its sibling counter is defaulted', () => {
    const payload = realPayload();
    delete visitorGroupIn(payload).giftsGiven;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups[0].giftsGiven).toBe(0);
  });
});

describe('an incoming raid whose own fields are unusable is refused by name', () => {
  it('refuses a raid with no attackerStrength, which makes every defence a defeat', () => {
    const payload = realPayload();
    delete raidEventIn(payload).attackerStrength;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('pendingRaidEvents[0].attackerStrength');
  });

  it('refuses a raid whose marchDistanceTiles is not a number', () => {
    const payload = realPayload();
    raidEventIn(payload).marchDistanceTiles = null;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('pendingRaidEvents[0].marchDistanceTiles');
  });
});

describe('a provisions card the shell cannot render is refused by name', () => {
  it('refuses a card whose choices is not a list', () => {
    const payload = realPayload();
    payload.activeVillageRequest = { ...(payload.activeVillageRequest as object), choices: 'accept' };

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('activeVillageRequest');
  });

  it('refuses a card whose choice has no id, so nothing can be answered', () => {
    const payload = realPayload();
    payload.activeVillageRequest = {
      ...(payload.activeVillageRequest as object),
      choices: [{ label: 'Accept provisions', detail: 'Pay 20 gold.' }],
    };

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('activeVillageRequest');
  });
});

describe('the save map dimensions are bounded per axis', () => {
  function roundTrip(size: MapSize): NonNullable<ReturnType<typeof loadGameFromParsed>> {
    resetSimRng();
    const world = initGame({ seed: 55, size });
    const parsed = parseSaveJson(JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height))));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) throw new Error('save refused');
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) throw new Error(`${size} no longer loads`);
    return loaded;
  }

  it('still loads every shipped map size', () => {
    for (const size of Object.keys(MAP_SIZE_DIMENSIONS) as MapSize[]) {
      const loaded = roundTrip(size);
      expect(loaded.world.width).toBe(MAP_SIZE_DIMENSIONS[size].width);
      expect(loaded.world.height).toBe(MAP_SIZE_DIMENSIONS[size].height);
    }
  });

  it('refuses a pixel height beyond the shipped maximum, naming the axis', () => {
    // Under the single maximum both axes shared, `width`'s maximum also admitted this height — a pair
    // no shipped preset has, and the allocation the bound exists to cap.
    const payload = realPayload();
    payload.width = MAP_SIZE_DIMENSIONS[MapSize.Huge].width;
    payload.height = MAP_SIZE_DIMENSIONS[MapSize.Huge].height + 1;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('height');
  });
});
