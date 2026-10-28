/*
 * BUG 2026-08-21-ambient-dialogue-often-becomes-leader-monologue.
 * Nearby eligible settlers must join an ambient exchange rather than being
 * randomly discarded into a solo speech line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetDialogueSessions,
  startDialogueTreeChat,
  tickHumanChat,
  type ChatSpeaker,
} from '../src/game/humanChat';
import { canonicalDialogueBank, getDialogueTreeById, installDialogueBankPayload, tryAmbientRandomDialogue } from '../src/game/dialogueTrees';
import { setSimSeed, resetSimRng } from '../src/game/simRng';

afterEach(() => {
  vi.restoreAllMocks();
  resetDialogueSessions();
  resetSimRng();
});

describe('ambient dialogue pairing', () => {
  it('uses a nearby free settler even when the old optional-partner roll would select solo speech', () => {
    const leader: ChatSpeaker = { id: 1 };
    const ordinarySettler: ChatSpeaker = { id: 2 };
    installDialogueBankPayload(canonicalDialogueBank);
    setSimSeed(11);
    // Chance 1 guarantees the ambient gate; seeded context/partner rolls are
    // controlled by the simulation RNG, not Math.random.
    tryAmbientRandomDialogue(leader, [ordinarySettler], 0, 1);

    expect(leader.chatPartnerId).toBe(ordinarySettler.id);
    expect(ordinarySettler.chatPartnerId).toBe(leader.id);
    expect(leader.chatDialogueSessionKey).toBe(ordinarySettler.chatDialogueSessionKey);
  });

  it('hands the next visible line to the ordinary conversation partner', () => {
    const leader: ChatSpeaker = { id: 11 };
    const ordinarySettler: ChatSpeaker = { id: 22 };
    const tree = getDialogueTreeById('dt_rock');
    expect(tree).toBeDefined();
    const dialogueTree = tree!;

    startDialogueTreeChat(leader, ordinarySettler, dialogueTree);
    const firstLineTicks = leader.chatTicks ?? 0;
    for (let tick = 0; tick < firstLineTicks; tick++) {
      tickHumanChat(leader, (id) => (id === ordinarySettler.id ? ordinarySettler : undefined));
    }

    expect(leader.chatPhrase).toBeUndefined();
    expect(ordinarySettler.chatPhrase).toContain(dialogueTree.lines[1]!.text);
    expect(ordinarySettler.chatTicks).toBeGreaterThan(0);
  });
});
