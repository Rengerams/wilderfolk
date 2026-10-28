/*
 * BUG 2026-08-21-dialogue-bubbles-use-unscaled-legacy-ticks.
 * Dialogue text must not remain over a citizen for most of an in-game day after
 * the production cadence changed from one to three ticks per clock hour.
 */
import { describe, expect, it } from 'vitest';
import {
  isDialogueBusy,
  tickHumanChat,
  ticksForDialogueLine,
  type ChatSpeaker,
} from '../src/game/humanChat';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { requestDialogue } from '../src/game/dialogueTrees';

describe('human chat duration at production cadence', () => {
  it('converts a short line from legacy tick duration into bounded game hours', () => {
    const woodLineTicks = ticksForDialogueLine('Wood pile low.');

    expect(woodLineTicks).toBeLessThanOrEqual(4 * TICKS_PER_HOUR);
  });

  it('advances and releases a two-line solo session without a partner resolver', () => {
    const speaker: ChatSpeaker = { id: 75 };
    expect(requestDialogue({
      eventKey: 'ambient.social', treeId: 'ambient_solo_social',
      speaker, tick: 16, durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(isDialogueBusy(speaker)).toBe(true);
    for (let tick = 0; tick < 4; tick++) tickHumanChat(speaker);
    expect(speaker.chatPhrase).toContain('He named himself');
    expect(isDialogueBusy(speaker)).toBe(true);
    for (let tick = 0; tick < 4; tick++) tickHumanChat(speaker);
    expect(speaker.chatPhrase).toBeUndefined();
    expect(speaker.chatDialogueSessionKey).toBeUndefined();
    expect(isDialogueBusy(speaker)).toBe(false);
  });

  it('expires a one-line event caption promptly and clears the renderer-visible state', () => {
    const speaker: ChatSpeaker = { id: 71 };
    expect(requestDialogue({
      eventKey: 'social.impulse.grief.home', speaker, tick: 1,
      priority: 'scripted', durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);

    expect(speaker.chatTicks).toBe(4);
    for (let tick = 0; tick < 4; tick++) {
      tickHumanChat(speaker);
    }

    expect(speaker.chatTicks).toBeUndefined();
    expect(speaker.chatPhrase).toBeUndefined();
    expect(isDialogueBusy(speaker)).toBe(false);
  });
});
