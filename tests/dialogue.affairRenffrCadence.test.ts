import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { requestDialogue } from '../src/game/dialogueTrees';
import { resetDialogueSessions, tickHumanChat, type ChatSpeaker } from '../src/game/humanChat';
import { maybeTriggerRenffrOmen } from '../src/game/renffrStar';
import { resetSimRng } from '../src/game/simRng';
import { initGame } from '../src/game/worldGen';

const actor = (id: number): ChatSpeaker => ({ id, name: `Settler ${id}` });

function finishPair(a: ChatSpeaker, b: ChatSpeaker): void {
  const findPartner = (id: number) => id === a.id ? a : id === b.id ? b : null;
  for (let i = 0; i < 100 && (a.chatDialogueSessionKey || b.chatDialogueSessionKey); i++) {
    tickHumanChat(a, findPartner);
    tickHumanChat(b, findPartner);
  }
  expect(a.chatDialogueSessionKey).toBeUndefined();
  expect(b.chatDialogueSessionKey).toBeUndefined();
}

describe('affair chatter cadence', () => {
  beforeEach(resetDialogueSessions);
  afterEach(resetDialogueSessions);

  it('starts a 48-hour cooldown for BOTH actors after a successful conversation', () => {
    const a = actor(81);
    const b = actor(82);
    const other = actor(83);
    const start = 1_000;
    expect(requestDialogue({ eventKey: 'ambient.affair', speaker: a, partner: b, tick: start })).toBe(true);
    expect(a.dialogueRecentScenes?.['ambient.affair:pair']?.tick).toBe(start);
    expect(b.dialogueRecentScenes?.['ambient.affair:pair']?.tick).toBe(start);
    finishPair(a, b);

    // Each participant is blocked even if a different eligible lover is present.
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: other,
      tick: start + 2 * TICKS_PER_DAY - 1,
    })).toBe(false);
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: other, partner: b,
      tick: start + 2 * TICKS_PER_DAY - 1,
    })).toBe(false);
    expect(other.dialogueRecentScenes).toBeUndefined();

    // Exactly 48 elapsed game hours later, the actor may speak again.
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: other,
      tick: start + 48 * TICKS_PER_HOUR,
    })).toBe(true);
    finishPair(a, other);
  });

  it('preserves scripted scene access during the 48-hour ambient cooldown', () => {
    const a = actor(84);
    const b = actor(85);
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: b, tick: 1_000,
    })).toBe(true);
    finishPair(a, b);

    // Scripted requests intentionally bypass ordinary chatter limits so that
    // authored scenes remain reachable (including dialogue.variety.test.ts).
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: b,
      tick: 1_001, priority: 'scripted', selectionRoll: 0,
    })).toBe(true);
    finishPair(a, b);
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: b, tick: 1_002,
    })).toBe(false);
  });

  it('does not start a cooldown for a rejected request', () => {
    const a = actor(91);
    const b = actor(92);
    const start = 2_000;
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: b, tick: start,
      treeId: 'nonexistent-scene',
    })).toBe(false);
    expect(a.dialogueRecentScenes).toBeUndefined();
    expect(b.dialogueRecentScenes).toBeUndefined();
    expect(requestDialogue({
      eventKey: 'ambient.affair', speaker: a, partner: b, tick: start + 1,
    })).toBe(true);
    finishPair(a, b);
  });
});

describe('Renffr omen hourly opportunity and gossip cooldown', () => {
  afterEach(() => {
    resetDialogueSessions();
    resetSimRng();
  });

  it('only rolls at an hourly boundary and cannot retrigger during the three gossip days', () => {
    const state = initGame({ skipTerrain: true, seed: 4_242 });
    state.humanPopulation = Math.max(2, state.humanPopulation);
    state.tick = 3 * TICKS_PER_DAY + 1;
    expect(maybeTriggerRenffrOmen(state, state.entities, true)).toBe(false);
    expect(state.renffrOmen).toBeFalsy();

    let triggeredAt = -1;
    for (let tick = 3 * TICKS_PER_DAY; tick < 100 * TICKS_PER_DAY; tick += TICKS_PER_HOUR) {
      state.tick = tick;
      if (maybeTriggerRenffrOmen(state, state.entities, true)) {
        triggeredAt = tick;
        break;
      }
    }
    expect(triggeredAt).toBeGreaterThanOrEqual(3 * TICKS_PER_DAY);
    expect(state.renffrChatterUntilTick).toBe(triggeredAt + 3 * TICKS_PER_DAY);

    // Even after the visual omen expires, its three-day talk window is an event cooldown.
    state.renffrOmen = null;
    for (let tick = triggeredAt + TICKS_PER_HOUR; tick < triggeredAt + 3 * TICKS_PER_DAY; tick += TICKS_PER_HOUR) {
      state.tick = tick;
      expect(maybeTriggerRenffrOmen(state, state.entities, true)).toBe(false);
    }
  });
});
