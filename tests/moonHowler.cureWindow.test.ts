/**
 * Regression: the Moon Howler curse can only be broken during the full-moon
 * NIGHT (20:00 → before 06:00), while the cursed settler is still in 🌝 form —
 * never at 7am work start.
 *
 * The sim has gated the Church exorcism to the night window since 3854df70,
 * but nothing locked it in: the tutorial/help copy still told players "dawn
 * (7am)", and the 0.5.0 changelog described a 7am cure. At 6am the cursed
 * settler has already reverted to human form, so a 7am cure would be both
 * wrong in lore and impossible in the sim.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  isMoonHowlerCureWindow,
  isMoonHowlerTransformTick,
  isMoonHowlerRevertTick,
  tryMoonHowlerChurchCures,
} from '../src/game/moonHowler';
import { EntityType } from '../src/game/gameTypes';

describe('Moon Howler cure window — night only, not 7am', () => {
  it('allows the cure through the full-moon night (20:00 → before 06:00)', () => {
    // 8pm on a full-moon day (day 0 ≡ 0 mod 14)
    expect(isMoonHowlerCureWindow(0, 20)).toBe(true);
    expect(isMoonHowlerCureWindow(0, 23)).toBe(true);
    // Pre-dawn hours of the following morning are still the same full-moon night
    expect(isMoonHowlerCureWindow(1, 0)).toBe(true);
    expect(isMoonHowlerCureWindow(1, 5)).toBe(true);
  });

  it('rejects 6am onwards — the werewolf reverts at 06:00, so 7am is too late', () => {
    expect(isMoonHowlerCureWindow(1, 6)).toBe(false); // revert hour
    expect(isMoonHowlerCureWindow(1, 7)).toBe(false); // THE bug: "dawn (7am)" copy
    expect(isMoonHowlerCureWindow(1, 12)).toBe(false); // midday
  });

  it('rejects ordinary (non-full-moon) nights', () => {
    expect(isMoonHowlerCureWindow(3, 22)).toBe(false);
    expect(isMoonHowlerCureWindow(4, 2)).toBe(false);
  });

  it('keeps the transform/revert anchors consistent with the window', () => {
    expect(isMoonHowlerTransformTick(0, 20)).toBe(true); // transform at 8pm
    expect(isMoonHowlerRevertTick(6)).toBe(true); // revert at 6am
    expect(isMoonHowlerRevertTick(7)).toBe(false); // already human by 7am
  });

  it('skips the church exorcism at 7am even when a cursed howler is abroad', () => {
    const state = initGame();
    const human = state.entities.find((e) => e.type === EntityType.Human && e.alive);
    expect(human).toBeDefined();

    // A cursed settler currently in werewolf form, hunting at 7am.
    const were = { ...human!, type: EntityType.Werewolf, moonHowlerCursed: true, alive: true };
    const res = tryMoonHowlerChurchCures(
      state,
      [were],
      [], // no churches needed — the window gate fires before church checks
      1, // colonyDay — not a full-moon day
      7, // hourOfDay — 7am, outside the night window
      new Map([[were.id, were]]),
    );

    expect(res.skippedReason).toBe('not_full_moon_night');
    expect(res.attempted).toBe(false);
  });
});
