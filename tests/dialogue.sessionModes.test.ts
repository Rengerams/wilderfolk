import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requestDialogue, tickDialogue } from '../src/game/dialogueTrees';
import { isDialogueBusy, resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const actor = (id: number): ChatSpeaker => ({ id, name: 'Actor ' + id });
beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('solo, paired and forced dialogue sessions', () => {
  it('never turns a pair-only event into a solo conversation', () => {
    const a = actor(1);
    expect(requestDialogue({ eventKey: 'neighbor.greeting', speaker: a, tick: 40 })).toBe(false);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(requestDialogue({ eventKey: 'ambient.social', speaker: a, tick: 40, durationHours: 4 / TICKS_PER_HOUR })).toBe(true);
    expect(a.chatDialogueSessionKey).toBe('solo:1');
    expect(isDialogueBusy(a)).toBe(true);
  });

  it('locks both actors while alternating and releases both at the end', () => {
    const a = actor(2);
    const b = actor(3);
    const resolve = (id: number) => id === a.id ? a : id === b.id ? b : undefined;
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: a, partner: b, tick: 42,
      durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(requestDialogue({ eventKey: 'ambient.social', speaker: b, tick: 42 })).toBe(false);
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    for (let i = 0; i < 4; i++) tickDialogue(a, resolve);
    expect(a.chatPhrase).toBeUndefined();
    expect(b.chatPhrase).toBeTruthy();
    for (let i = 0; i < 4; i++) tickDialogue(b, resolve);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
    expect(isDialogueBusy(a)).toBe(false);
    expect(isDialogueBusy(b)).toBe(false);
  });

  it('scripted speech interrupts and releases a paired session through the real resolver', () => {
    const a = actor(4);
    const b = actor(5);
    const resolve = (id: number) => id === a.id ? a : id === b.id ? b : undefined;
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: a, partner: b, tick: 4,
      durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(requestDialogue({
      eventKey: 'hospital.doctor', speaker: a, tick: 5, priority: 'scripted',
      resolvePartner: resolve, durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(a.chatDialogueSessionKey).toBe('solo:4');
    expect(b.chatDialogueSessionKey).toBeUndefined();
    expect(isDialogueBusy(b)).toBe(false);
  });
  it('scripted speech releases a busy counterpart immediately without a resolver', () => {
    const a = actor(16);
    const b = actor(17);
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: a, partner: b, tick: 7,
      durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(isDialogueBusy(b)).toBe(true);
    expect(requestDialogue({
      eventKey: 'election.winner', speaker: a, tick: 8, priority: 'scripted',
      durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(a.chatDialogueSessionKey).toBe('solo:16');
    expect(b.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatPartnerId).toBeUndefined();
    expect(b.chatPhrase).toBeUndefined();
    expect(isDialogueBusy(b)).toBe(false);
    expect(requestDialogue({
      eventKey: 'ambient.social', speaker: b, tick: 9,
      durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
  });


});
