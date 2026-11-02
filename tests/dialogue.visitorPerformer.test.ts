import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ambientSource from '../src/game/data/dialogue/ambient.json';
import { requestDialogue } from '../src/game/dialogueTrees';
import { resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

const POIS = [
  'market', 'hall', 'church', 'study', 'hunt', 'trail', 'campfire', 'homes',
  'help', 'shelter', 'stage', 'show', 'square', 'well', 'shrine', 'notes',
  'visit', 'road', 'plea',
] as const;

describe('visitor & performer dialogue migration', () => {
  it('keeps every original location category with explicit solo-mode content', () => {
    expect(ambientSource.version).toBe('1.3');
    expect(ambientSource.category).toBe('dialogue');
    const visitorTrees = ambientSource.dialogue_trees.filter((tree) => tree.eventKey.startsWith('visitor.'));
    expect(visitorTrees).toHaveLength(62);
    for (const label of POIS) {
      const trees = visitorTrees.filter((tree) => tree.eventKey === `visitor.poi.${label}`);
      expect(trees.length, label).toBeGreaterThanOrEqual(3);
      expect(trees.every((tree) => tree.conversation_type === 'one_way'
        && tree.lines.length === 1 && tree.speakers.length === 1)).toBe(true);
    }
    expect(visitorTrees.filter((tree) => tree.eventKey === 'visitor.performer'))
      .toHaveLength(4);
  });

  it('does not overwrite an already-active paired visitor session', () => {
    const a: ChatSpeaker = { id: 2101 };
    const b: ChatSpeaker = { id: 2102 };
    expect(requestDialogue({
      eventKey: 'workplace.banter', treeId: 'evt_workplace_banter_pair_00',
      speaker: a, partner: b, tick: 20,
    })).toBe(true);
    const originalLine = a.chatPhrase;
    const originalKey = a.chatDialogueSessionKey;
    expect(requestDialogue({
      eventKey: 'visitor.poi.market', speaker: a, tick: 20,
      selectionRoll: 0,
    })).toBe(false);
    expect(requestDialogue({
      eventKey: 'visitor.performer', speaker: b, tick: 20,
      selectionRoll: 0,
    })).toBe(false);
    expect(a.chatPhrase).toBe(originalLine);
    expect(a.chatDialogueSessionKey).toBe(originalKey);
    expect(b.chatDialogueSessionKey).toBe(originalKey);
  });

  it('selects performer and POI variants without simulated partner IDs', () => {
    const performer: ChatSpeaker = { id: 2301 };
    expect(requestDialogue({
      eventKey: 'visitor.performer', speaker: performer, tick: 100, selectionRoll: 0,
    })).toBe(true);
    expect(performer.chatPhrase).toContain('♪ La la~');
    expect(performer.chatPartnerId).toBeUndefined();
    resetDialogueSessions();
    const visitor: ChatSpeaker = { id: 2302 };
    expect(requestDialogue({
      eventKey: 'visitor.poi.plea', speaker: visitor, tick: 101, selectionRoll: 0,
    })).toBe(true);
    expect(visitor.chatPhrase).toContain('Mercy…');
    expect(visitor.chatPartnerId).toBeUndefined();
  });
});

