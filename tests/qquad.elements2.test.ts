/** Scratch: element-shape probes for every object-array container in a real payload. */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  const payload = structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
  // Populate every object-array container a real save can carry, so the element scan has a
  // victim. The shapes are structural (an `id` + the fields the restore touches).
  const stamps = ['#uuid', 'village', 'faction'];
  const set = (key: string, value: unknown[]): void => {
    payload[key] = value;
  };
  set('populationHistory', [{ day: 1, population: 3, humans: 3 }]);
  set('challenges', [
    {
      id: 'settle',
      title: 'Settle',
      description: 'Grow',
      completed: false,
      targetPopulation: 10,
      targetBuildings: 1,
    },
  ]);
  set('researchNodes', [{ id: 'foraging', name: 'Foraging', unlocked: false, cost: 10, prerequisites: [] }]);
  set('tradeRoutes', [
    {
      id: 1,
      name: 'North road',
      partner: 'Northhold',
      active: true,
      tradeGood: 'wood',
      amount: 5,
      goldPerUnit: 2,
      distanceTiles: 10,
      caravanCarrierId: null,
      nextDepartureTick: 100,
      tradesCompleted: 1,
    },
  ]);
  set('yearlyStats', [
    {
      year: 1,
      population: 3,
      births: 0,
      deaths: 0,
      buildings: 1,
      resources: { wood: 1, stone: 0, food: 1, gold: 0, iron: 0 },
    },
  ]);
  set('eventLog', [
    { id: 1, tick: 5, day: 1, type: 'event', message: 'A quiet morning', stamps },
  ]);
  set('visitorGroups', [
    {
      id: 1,
      kind: 'traders',
      x: 100,
      y: 100,
      members: [],
      tradesCompleted: 0,
      spawnedAtCalendarDay: 1,
    },
  ]);
  set('rivalSettlements', [
    { id: 1, name: 'Rivals', x: 200, y: 200, population: 5, aggression: 1, raidCooldownDays: 0, peaceTreatyDays: 0 },
  ]);
  set('pendingDiplomacyEvents', [
    { id: 1, kind: 'message', rivalId: 1, createdAtTick: 1, expiresAtTick: 50, startedAtTick: 1 },
  ]);
  set('pendingRaidEvents', [
    { id: 1, rivalId: 1, createdAtTick: 1, expiresAtTick: 50, marchDistanceTiles: 10 },
  ]);
  set('pendingOutgoingRaidEvents', [
    { id: 1, rivalId: 1, createdAtTick: 1, expiresAtTick: 50 },
  ]);
  return payload;
}

const OBJECT_ARRAYS = [
  'populationHistory',
  'challenges',
  'researchNodes',
  'tradeRoutes',
  'yearlyStats',
  'eventLog',
  'visitorGroups',
  'rivalSettlements',
  'pendingDiplomacyEvents',
  'pendingRaidEvents',
  'pendingOutgoingRaidEvents',
] as const;

afterEach(() => {
  resetSimRng();
});

describe('scratch2', () => {
  it('loads the populated fixture itself', () => {
    const outcome = loadGameFromParsedOutcome(realPayload());
    console.log('BASELINE:', outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`);
    expect(outcome).toBeDefined();
  });

  it('probes a non-array value per container', () => {
    const lines: string[] = [];
    for (const key of OBJECT_ARRAYS) {
      const payload = realPayload();
      payload[key] = 'nope';
      const outcome = loadGameFromParsedOutcome(payload);
      lines.push(`${key} <- string => ${outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`}`);
    }
    console.log('NON-ARRAY:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('probes a null element per container', () => {
    const lines: string[] = [];
    for (const key of OBJECT_ARRAYS) {
      const payload = realPayload();
      (payload[key] as unknown[])[0] = null;
      const outcome = loadGameFromParsedOutcome(payload);
      lines.push(`${key}[0]=null => ${outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`}`);
    }
    console.log('NULL ELEMENT:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('probes a string element per container', () => {
    const lines: string[] = [];
    for (const key of OBJECT_ARRAYS) {
      const payload = realPayload();
      (payload[key] as unknown[])[0] = 'str';
      const outcome = loadGameFromParsedOutcome(payload);
      lines.push(`${key}[0]="str" => ${outcome.ok ? 'LOADED-OK' : `${outcome.reason}: ${outcome.detail}`}`);
    }
    console.log('STRING ELEMENT:\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });
});
