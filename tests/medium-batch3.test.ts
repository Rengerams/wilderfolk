/**
 * Medium-tier fixes, batch 3 (audit report, 2026-09-13).
 *
 * - M2 — `pickBeautySpot` returned the up-left corner of its search window when the grid held no
 *   beauty at all, because the first scanned cell always beat the `-1` seed.
 * - M32 — `availableScripts` read `eventLog.slice(-40)`, the *oldest* entries of a newest-first
 *   log, so the travelling theatre ignored recent history (and could find no script at all).
 * - M36 — rival-owned watchtowers counted as player early-warning towers and revealed their own
 *   raiders.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, JobType, TerrainType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TERRAIN_TILE_SIZE } from '../src/game/gameTypes';
import { pickBeautySpot } from '../src/game/beautyGrid';
import { detectRaidersFromWatchtowers, WATCHTOWER_DETECTION_RADIUS } from '../src/game/watchtowerDetection';
import { maybeOfferTravelingTheatre, travelingTheatreEligibleDay } from '../src/game/travelingTheatre';
import { logEvent } from '../src/game/eventLog';

const FIXTURE_SEED = 20240913;

function building(type: BuildingType, faction: string, x = 100, y = 100): Building {
  const cfg = BUILDING_CONFIGS[type];
  return {
    id: Math.floor(x * 1000 + y),
    type,
    x,
    y,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction,
  } as never;
}

describe('M2 — a beauty-free grid keeps the caller where they are', () => {
  const flatGrid = { cols: 12, rows: 12, values: new Array(144).fill(0) };

  it('returns the given position when no tile has beauty', () => {
    expect(pickBeautySpot(flatGrid as never, 250, 250)).toEqual({ x: 250, y: 250 });
  });

  it('still steers to the prettiest tile when there is one', () => {
    const values = new Array(144).fill(0);
    const gx = 1;
    const gy = 1;
    values[gy * 12 + gx] = 5;
    const spot = pickBeautySpot({ cols: 12, rows: 12, values } as never, TERRAIN_TILE_SIZE / 2, TERRAIN_TILE_SIZE / 2);
    expect(spot).toEqual({ x: (gx + 0.5) * TERRAIN_TILE_SIZE, y: (gy + 0.5) * TERRAIN_TILE_SIZE });
  });
});

describe('M32 — the theatre reads recent history', () => {
  it('offers a script derived from the newest entries of a newest-first log', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    state.dayInYear = travelingTheatreEligibleDay(state.worldMap?.seed) + 1;
    state.visitorGroups.push({ kind: 'performers', daysLeft: 5 } as never);
    // Newest entry is a scandal; everything older is filler, so only the head of the log
    // carries the history the script list is built from.
    state.eventLog = [{ id: 9999, tick: 0, year: 0, day: 0, type: 'scandal', message: 'A scandal' } as never];
    for (let i = 0; i < 45; i++) {
      logEvent(state, 'event', `filler ${i}`);
    }
    // logEvent unshifts, so re-add the scandal at the head to keep it newest.
    state.eventLog.unshift({ id: 9998, tick: state.tick, year: state.year, day: state.dayInYear, type: 'scandal', message: 'A scandal' } as never);

    maybeOfferTravelingTheatre(state);

    const card = state.pendingStoryEvents?.find((e) => e.storyKey.includes('theatre'));
    expect(card).toBeDefined();
    expect(card!.choices.map((c) => c.id)).toContain('town_hall_scandal');
  });
});

describe('M36 — only player watchtowers reveal raiders', () => {
  function raiderFixture(): { state: WorldState; rival: Entity } {
    const state = initGame({ seed: FIXTURE_SEED });
    state.pendingRaidEvents = [{ rivalId: 'r1' } as never];
    state.eventLog = [];
    const rival = {
      id: 9001,
      type: EntityType.Human,
      x: 100,
      y: 100,
      alive: true,
      faction: 'rival',
      groupId: 'r1',
      hiddenFromPlayer: true,
      energy: 100,
      maxEnergy: 100,
      age: 30,
      maxAge: 90,
      speed: 2,
      size: 10,
      vx: 0,
      vy: 0,
      flash: 0,
      gender: 'male',
      job: JobType.Soldier,
      childrenIds: [],
      isJuvenile: false,
    } as unknown as Entity;
    return { state, rival };
  }

  it('leaves the raider hidden when the only tower belongs to the rival camp', () => {
    const { state, rival } = raiderFixture();
    state.buildings = [building(BuildingType.Watchtower, 'rival')];

    detectRaidersFromWatchtowers(state, [rival]);

    expect(rival.hiddenFromPlayer).toBe(true);
    expect(state.eventLog.some((e) => e.message.includes('Watchtower spotted'))).toBe(false);
  });

  it('reveals the raider from a player watchtower', () => {
    const { state, rival } = raiderFixture();
    state.buildings = [building(BuildingType.Watchtower, 'player')];

    detectRaidersFromWatchtowers(state, [rival]);

    expect(rival.hiddenFromPlayer).toBe(false);
    expect(state.eventLog.some((e) => e.message.includes('Watchtower spotted'))).toBe(true);
  });
});
