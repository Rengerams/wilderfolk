/*
 * BUG 2026-08-21-dialogue-bubbles-use-unscaled-legacy-ticks.
 * Dialogue text must not remain over a citizen for most of an in-game day after
 * the production cadence changed from one to three ticks per clock hour.
 */
import { describe, expect, it } from 'vitest';
import {
  isDialogueBusy,
  sayHumanChatPhrase,
  tickHumanChat,
  ticksForDialogueLine,
} from '../src/game/humanChat';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';

describe('human chat duration at production cadence', () => {
  it('converts a short line from legacy tick duration into bounded game hours', () => {
    const woodLineTicks = ticksForDialogueLine('Wood pile low.');

    expect(woodLineTicks).toBeLessThanOrEqual(4 * TICKS_PER_HOUR);
  });

  it('expires a direct short phrase promptly and clears the renderer-visible state', () => {
    const speaker = { id: 71 };
    sayHumanChatPhrase(speaker, 'Morning!', 12);

    expect(speaker.chatTicks).toBe(4);
    for (let tick = 0; tick < 4; tick++) {
      tickHumanChat(speaker);
    }

    expect(speaker.chatTicks).toBeUndefined();
    expect(speaker.chatPhrase).toBeUndefined();
    expect(isDialogueBusy(speaker)).toBe(false);
  });
});
