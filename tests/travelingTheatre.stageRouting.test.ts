/**
 * Every travelling-theatre stage answers the card it belongs to: the Opening Night card is pushed
 * without advancing `FLAG_STATUS`, so stage-3 answers must not be routed into `resolveStage2`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import type { WorldState } from '../src/game/gameTypes';
import { logEvent } from '../src/game/eventLog';
import {
  maybeOfferTravelingTheatre,
  resolveTravelingTheatre,
  tickTravelingTheatre,
  travelingTheatreEligibleDay,
} from '../src/game/travelingTheatre';

const CANCEL_MESSAGE = 'The show is cancelled; the troupe folds its canvas and departs.';
const newsMessages = (state: WorldState): string[] => state.bigNews.map((item) => item.message);

/**
 * Runs the real offer and stage sequence and stops when the Opening Night card is open
 * (status still reads `preparing`, which is the state the defect depended on).
 */
function reachOpeningNight(support: 'support_improvise' | 'support_hospitality'): WorldState {
  const state = initGame({ skipTerrain: true, seed: 20240913 });
  state.dayInYear = travelingTheatreEligibleDay(state.worldMap?.seed) + 1;
  state.visitorGroups.push({ kind: 'performers', daysLeft: 5 } as never);
  logEvent(state, 'season', 'A hard winter passed');

  maybeOfferTravelingTheatre(state);
  expect(resolveTravelingTheatre(state, 'first_winter')).toBe(true);
  expect(resolveTravelingTheatre(state, support)).toBe(true);

  state.dayInYear += 10; // the performance day arrives
  tickTravelingTheatre(state);
  return state;
}

describe('traveling theatre stage routing', () => {
  it('applies the opening-night choice instead of cancelling the show', () => {
    const state = reachOpeningNight('support_improvise');
    const reputationBefore = state.villageReputation;

    expect(resolveTravelingTheatre(state, 'let_legend_grow')).toBe(true);

    expect(state.villageReputation).toBe(reputationBefore + 2);
    expect(newsMessages(state)).toContain(
      'The play becomes local folklore; the factual Chronicle remains untouched underneath.',
    );
    expect(newsMessages(state)).not.toContain(CANCEL_MESSAGE);
  });

  it('still honours an explicit stage-2 cancel', () => {
    const state = initGame({ skipTerrain: true, seed: 20240913 });
    state.dayInYear = travelingTheatreEligibleDay(state.worldMap?.seed) + 1;
    state.visitorGroups.push({ kind: 'performers', daysLeft: 5 } as never);
    logEvent(state, 'season', 'A hard winter passed');
    maybeOfferTravelingTheatre(state);

    expect(resolveTravelingTheatre(state, 'first_winter')).toBe(true);
    expect(resolveTravelingTheatre(state, 'cancel_show')).toBe(true);
    expect(newsMessages(state)).toContain(CANCEL_MESSAGE);
  });

  it('routes the other two opening-night answers', () => {
    const corrected = reachOpeningNight('support_hospitality');
    const beforeCorrect = corrected.villageReputation;
    expect(resolveTravelingTheatre(corrected, 'correct_story')).toBe(true);
    expect(corrected.villageReputation).toBe(beforeCorrect + 1);
    expect(newsMessages(corrected)).toContain(
      'The factual version is preserved, and the colony gains modest respect.',
    );

    const interrupted = reachOpeningNight('support_improvise');
    const beforeInterrupt = interrupted.villageReputation;
    expect(resolveTravelingTheatre(interrupted, 'interrupt')).toBe(true);
    expect(interrupted.villageReputation).toBe(beforeInterrupt - 1);
    expect(newsMessages(interrupted)).toContain(
      'The troupe leaves in a huff; the valley is amused and embarrassed in equal measure.',
    );
  });
});