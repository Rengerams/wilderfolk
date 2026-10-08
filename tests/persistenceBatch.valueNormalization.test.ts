/**
 * Value vetting at the load boundary: lifetime stats, weather, Big News cards, event-log ids.
 * Each case corrupts one field of a real `buildSaveData` payload, so green means the guard works.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createEmptyLifetimeStats } from '../src/game/stats';
import { addBigNews } from '../src/game/simEffects';
import { logEvent } from '../src/game/eventLog';
import { resetSimRng } from '../src/game/simRng';
import { WeatherType, type GameEventLog, type WorldState } from '../src/game/gameTypes';

function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

function loadWorld(payload: Record<string, unknown>): WorldState | null {
  const outcome = loadGameFromParsedOutcome(payload);
  return outcome.ok ? outcome.world : null;
}

function logEntry(id: number, message: string): GameEventLog {
  return { id, tick: 1, year: 0, day: 0, type: 'event', message };
}

/** A payload whose event log carries exactly the entries given, newest first. */
function payloadWithEventLog(entries: GameEventLog[]): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ seed: 4242 });
  world.eventLog = entries;
  return structuredClone(buildSaveData(world, createInitialView(world.width, world.height)));
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a loaded lifetime record is complete and numeric', () => {
  it('fills the fields the payload never carried, keeping the ones it did', () => {
    const payload = realPayload();
    payload.lifetimeStats = { totalHumansBorn: 12, goldFromTradeRoutes: 7 };

    const world = loadWorld(payload)!;

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

    const world = loadWorld(payload)!;

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

    const world = loadWorld(payload)!;

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

    const world = loadWorld(payload)!;

    expect(world.weather).toBe(WeatherType.Drought);
    expect(world.weatherTimer).toBe(12);
  });
});

describe('Big News cards survive a save', () => {
  it('writes the live cards and restores them instead of resetting the panel', () => {
    resetSimRng();
    const world = initGame({ seed: 4242 });
    addBigNews(world, 'Raiders sighted', 'A raid is coming', 'negative');
    const payload = structuredClone(
      buildSaveData(world, createInitialView(world.width, world.height)),
    );

    expect(payload.bigNews).toHaveLength(1);

    const reloaded = loadWorld(payload)!;

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

    const world = loadWorld(payload)!;

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

    const world = loadWorld(payload)!;

    expect(world.eventLog.map((entry) => entry.id)).toEqual([9, 8]);
    expect(world.eventLog.map((entry) => entry.message)).toEqual(['newest', 'older']);
  });

  it('keeps issuing ids above the repaired log', () => {
    const payload = payloadWithEventLog([logEntry(4, 'a'), logEntry(4, 'b'), logEntry(3, 'c')]);

    const world = loadWorld(payload)!;
    logEvent(world, 'event', 'first line after the load');

    expect(world.eventLog[0].id).toBe(5);
    expect(new Set(world.eventLog.map((entry) => entry.id)).size).toBe(world.eventLog.length);
  });

  it('leaves a log whose ids are already unique alone', () => {
    const payload = payloadWithEventLog([logEntry(5, 'a'), logEntry(4, 'b')]);

    const world = loadWorld(payload)!;

    expect(world.eventLog.map((entry) => entry.id)).toEqual([5, 4]);
  });
});
