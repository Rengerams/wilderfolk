/**
 * Every travelling-theatre stage answers the card it belongs to.
 *
 * `resolveTravelingTheatre` dispatched on `FLAG_STATUS` alone, but the Opening Night card
 * is pushed by `tickTravelingTheatre` without advancing that flag (it only stamps
 * `FLAG_STAGE3`), so stage-3 answers arrived while the flag still read `preparing` and were
 * routed into `resolveStage2`. Its switch has no case for `correct_story` /
 * `let_legend_grow` / `interrupt`, so they fell through to `case 'cancel_show': default:`
 * — **every** opening-night answer cancelled the show, emitted "the troupe leaves
 * offended", and made `resolveStage3` (the +2/+3 "living legend", +1 "honest history", and
 * the -1 interruption) unreachable.
 *
 * The tests drive the real sequence: `maybeOfferTravelingTheatre` (stage-1 card) →
 * script answer → support answer → `tickTravelingTheatre` (opening-night card) → stage-3
 * answer, which is exactly the order the daily layer and the UI use.
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
  const state = initGame({ seed: 20240913 });
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
    const state = initGame({ seed: 20240913 });
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