/*
 * BUG 2026-08-21-dialogue-bubbles-use-unscaled-legacy-ticks.
 * Dialogue text must not remain over a citizen for most of an in-game day after
 * the production cadence changed from one to three ticks per clock hour.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isDialogueBusy,
  tickHumanChat,
  resetDialogueSessions,
  ticksForDialogueLine,
  type ChatSpeaker,
} from '../src/game/humanChat';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { dialogueHoursFromNominalTicks, requestDialogue } from '../src/game/dialogueTrees';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

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

  it('preserves actual legacy speech tick lifetimes for migrated domain captions', () => {
    // Before the JSON cutover, these were passed to sayHumanChatPhrase in nominal
    // ticks and scaled by the current simulation clock. The new request must
    // preserve that effective duration, not treat nominal ticks as game hours.
    const cases = [
      { eventKey: 'hospital.patient.other', nominalTicks: 48 },
      { eventKey: 'hospital.doctor', nominalTicks: 44 },
      { eventKey: 'hotel.arrival', nominalTicks: 50 },
      { eventKey: 'hotel.service.welcome', nominalTicks: 44 },
      { eventKey: 'hunting.scarce', nominalTicks: 48 },
      { eventKey: 'hunting.thinTrails', nominalTicks: 40 },
      { eventKey: 'townHall.foodAid', nominalTicks: 50 },
      { eventKey: 'townHall.heard', nominalTicks: 52 },
      { eventKey: 'townHall.audience.leader', nominalTicks: 48 },
      { eventKey: 'townHall.goldAid', nominalTicks: 40 },
      { eventKey: 'townHall.official', nominalTicks: 44 },
      { eventKey: 'renffr.omen', nominalTicks: 150 },
    ] as const;

    for (const [index, scene] of cases.entries()) {
      const expectedTicks = Math.max(4, Math.round(scene.nominalTicks * PER_TICK_RATE_SCALE));
      const durationHours = dialogueHoursFromNominalTicks(scene.nominalTicks);
      expect(Math.round(durationHours * TICKS_PER_HOUR)).toBe(expectedTicks);

      const speaker: ChatSpeaker = { id: 7100 + index };
      expect(requestDialogue({
        eventKey: scene.eventKey, speaker, tick: 100 + index,
        durationHours, priority: 'scripted', selectionRoll: 0,
      })).toBe(true);
      expect(speaker.chatTicks).toBe(expectedTicks);
      expect(isDialogueBusy(speaker)).toBe(true);

      for (let elapsed = 1; elapsed < expectedTicks; elapsed++) {
        tickHumanChat(speaker);
        expect(speaker.chatTicks).toBe(expectedTicks - elapsed);
        expect(isDialogueBusy(speaker)).toBe(true);
      }
      tickHumanChat(speaker);
      expect(speaker.chatPhrase).toBeUndefined();
      expect(speaker.chatTicks).toBeUndefined();
      expect(speaker.chatDialogueSessionKey).toBeUndefined();
      expect(isDialogueBusy(speaker)).toBe(false);
    }
  });

});
