/**
 * The camp, incoming raid and provisions card are the persisted objects a malformed payload could
 * slip past the container rule, so each has its own load-boundary validation.
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
    entityIds: [],
    campX: 300,
    campY: 300,
    daysLeft: 4,
    spawnedAtCalendarDay: 2,
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
  cachedPayload ??= buildPayload();
  return structuredClone(cachedPayload);
}

let cachedPayload: Record<string, unknown> | null = null;

function buildPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
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

describe('retired camps and linked cards are dropped, but strategic raids still load', () => {
  it('accepts the payload the writer produced, but retires the camp and linked request', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(0);
    expect(outcome.world.pendingRaidEvents).toHaveLength(1);
    expect(outcome.world.pendingRaidEvents[0].attackerStrength).toBe(35);
    expect(outcome.world.activeVillageRequest).toBeUndefined();
  });
});

describe('loading saves retires on-map visitor NPCs without touching strategic raids', () => {
  it('does not resurrect a visitor actor or its camp', () => {
    const payload = realPayload();
    const entities = payload.entities as Array<Record<string, unknown>>;
    const player = entities.find((entity) => entity.type === 'human');
    expect(player).toBeDefined();
    if (!player) return;
    const visitorId = (payload.nextEntityId as number) + 1;
    entities.push({ ...player, id: visitorId, faction: 'visitor', groupId: 'visitor_traders_1' });
    payload.nextEntityId = visitorId + 1;
    payload.firstWeekVisitorSpawned = true;
    const buildings = payload.buildings as Array<Record<string, unknown>>;
    expect(buildings.length).toBeGreaterThan(0);
    const buildingId = buildings[0].id;
    buildings[0].hotelGuestIds = [visitorId];

    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.entities.some((entity) => entity.id === visitorId)).toBe(false);
    expect(outcome.world.entityById?.has(visitorId)).toBe(false);
    expect(outcome.world).not.toHaveProperty('firstWeekVisitorSpawned');
    const restoredBuilding = outcome.world.buildings.find((b) => b.id === buildingId);
    expect(restoredBuilding).toBeDefined();
    expect(restoredBuilding).not.toHaveProperty('hotelGuestIds');
    expect(outcome.world.visitorGroups).toHaveLength(0);
    expect(outcome.world.pendingRaidEvents).toHaveLength(1);
  });
});

describe('obsolete visitor camp records do not block existing saves', () => {
  it('discards a camp with no entityIds', () => {
    const payload = realPayload();
    delete visitorGroupIn(payload).entityIds;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(0);
  });

  it('discards a camp whose daysLeft is not a number', () => {
    const payload = realPayload();
    visitorGroupIn(payload).daysLeft = 'four';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(0);
  });

  it('discards a camp whose kind is unrecognized', () => {
    const payload = realPayload();
    visitorGroupIn(payload).kind = 'pirates';

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(0);
  });

  it('discards a camp with no giftsGiven', () => {
    const payload = realPayload();
    delete visitorGroupIn(payload).giftsGiven;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.visitorGroups).toHaveLength(0);
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

describe('retired provisions cards', () => {
  it('ignores malformed legacy cards rather than rejecting the colony', () => {
    const payload = realPayload();
    payload.activeVillageRequest = { choices: 'accept' };
    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.world.activeVillageRequest).toBeUndefined();
  });
});

describe('the saved simulation speed must be one the loop can run', () => {
  it('refuses speed 0 by name, which would stop the clock for good', () => {
    const payload = realPayload();
    payload.speed = 0;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('speed');
  });

  it('refuses a NaN speed, which JSON serializes as null', () => {
    const payload = realPayload();
    payload.speed = Number.NaN;
    const text = JSON.stringify(payload);
    expect(text).toContain('"speed":null');
    const parsed = parseSaveJson(text);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const outcome = loadGameFromParsedOutcome(parsed.parsed);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.detail).toContain('speed');
  });

  it('keeps the default speed when the payload carries none', () => {
    const payload = realPayload();
    delete payload.speed;

    const outcome = loadGameFromParsedOutcome(payload);

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.speed).toBe(1);
  });
});

describe('the save map dimensions are bounded per axis', () => {
  function roundTrip(size: MapSize): NonNullable<ReturnType<typeof loadGameFromParsed>> {
    resetSimRng();
    const world = initGame({ skipTerrain: true, seed: 55, size });
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
