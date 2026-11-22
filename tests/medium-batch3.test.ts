/** The beauty-grid and theatre owner rules (physical raider detection retired). */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { PATH_CELL } from '../src/game/gameTypes';
import { pickBeautySpot } from '../src/game/beautyGrid';
import { maybeOfferTravelingTheatre, travelingTheatreEligibleDay } from '../src/game/travelingTheatre';
import { logEvent } from '../src/game/eventLog';

const FIXTURE_SEED = 20240913;

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
    const spot = pickBeautySpot({ cols: 12, rows: 12, values } as never, PATH_CELL / 2, PATH_CELL / 2);
    expect(spot).toEqual({ x: (gx + 0.5) * PATH_CELL, y: (gy + 0.5) * PATH_CELL });
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
