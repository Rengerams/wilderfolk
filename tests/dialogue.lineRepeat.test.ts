import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalDialogueBank, installDialogueBankPayload, requestDialogue, type DialogueBankFile, type DialogueTree,
} from '../src/game/dialogueTrees';
import { resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';

const pair = (id: string, first: string, second: string): DialogueTree => ({
  id,
  category: 'dialogue',
  eventKey: 'pregnancy.daily',
  mode: 'pair',
  speakers: ['expectant_mother', 'partner'],
  lines: [
    { speaker: 'expectant_mother', text: first },
    { speaker: 'partner', text: second },
  ],
});

const bank: DialogueBankFile = {
  version: '1.3',
  categories: ['dialogue'],
  dialogue_trees: [
    pair('line_a', 'Alpha line one.', 'Alpha line two.'),
    pair('line_b', 'Beta line one.', 'Beta line two.'),
  ],
};

const actor = (id: number): ChatSpeaker => ({ id, name: 'Actor ' + id });
const request = (a: ChatSpeaker, b: ChatSpeaker | null, tick: number) => requestDialogue({
  eventKey: 'pregnancy.daily',
  speaker: a,
  partner: b,
  roles: b ? ['expectant_mother', 'partner'] : undefined,
  tick,
  selectionRoll: 0,
});

describe('per-settler line repetition', () => {
  beforeEach(() => {
    resetDialogueSessions();
    installDialogueBankPayload(bank);
  });
  afterEach(() => {
    resetDialogueSessions();
    installDialogueBankPayload(canonicalDialogueBank);
  });

  it('moves the same settler to another scene instead of repeating their line', () => {
    const mother = actor(1);
    const partner = actor(2);
    expect(request(mother, partner, 1000)).toBe(true);
    expect(mother.chatPhrase).toContain('Alpha');
    expect(mother.dialogueRecentLines).toBeDefined();
    expect(partner.dialogueRecentLines).toBeDefined();

    resetDialogueSessions();
    for (const who of [mother, partner]) {
      who.chatPhrase = undefined;
      who.chatTicks = undefined;
      who.chatDialogueSessionKey = undefined;
      who.chatPartnerId = undefined;
    }
    expect(request(mother, partner, 1001)).toBe(true);
    expect(mother.chatPhrase).toContain('Beta');
  });

  it('allows a different settler to use a line the first settler already said', () => {
    const first = actor(3);
    const firstPartner = actor(4);
    expect(request(first, firstPartner, 1000)).toBe(true);
    resetDialogueSessions();
    const second = actor(5);
    const secondPartner = actor(6);
    expect(request(second, secondPartner, 1002)).toBe(true);
    expect(second.chatPhrase).toContain('Alpha');
  });

  it('requires a real second settler for a paired scene', () => {
    expect(request(actor(7), null, 1000)).toBe(false);
  });
});
