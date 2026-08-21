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
  tryAmbientRandomDialogue,
} from '../src/game/humanChat';
import { getDialogueTreeById } from '../src/game/dialogueTrees';

afterEach(() => {
  vi.restoreAllMocks();
  resetDialogueSessions();
});

describe('ambient dialogue pairing', () => {
  it('uses a nearby free settler even when the old optional-partner roll would select solo speech', () => {
    const leader = { id: 1 };
    const ordinarySettler = { id: 2 };
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // ambient chance succeeds
      .mockReturnValueOnce(0) // context selection
      .mockReturnValueOnce(0.8); // old 60% partner branch would have rejected this

    tryAmbientRandomDialogue(leader, [ordinarySettler], 0, 1);

    expect(leader.chatPartnerId).toBe(ordinarySettler.id);
    expect(ordinarySettler.chatPartnerId).toBe(leader.id);
    expect(leader.chatDialogueSessionKey).toBe(ordinarySettler.chatDialogueSessionKey);
  });

  it('hands the next visible line to the ordinary conversation partner', () => {
    const leader = { id: 11 };
    const ordinarySettler = { id: 22 };
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
