import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, DIALOGUE_EVENT_KEYS, maybeDialogueChat, requestDialogue, type DialogueEventKey } from '../src/game/dialogueTrees';
import {
  resetDialogueSessions, tickHumanChat, type ChatSpeaker,
} from '../src/game/humanChat';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';

const speaker = (id: number): ChatSpeaker => ({ id, name: `Actor${id}` });

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('single dialogue event routing', () => {
  it('indexes JSON visitor, child, election, social and paired workplace keys', () => {
    const keyAndMode = canonicalDialogueBank.dialogue_trees
      .map((tree) => `${tree.eventKey}:${tree.mode}`);
    for (const key of [
      'visitor.poi.market:solo', 'visitor.poi.plea:solo', 'visitor.performer:solo',
      'child.play:solo', 'social.impulse.grief.church:solo',
      'social.impulse.grief.home:solo', 'workplace.banter:pair',
      'neighbor.greeting:pair', 'election.buildup:solo',
      'election.ceremony:solo', 'election.tension:solo', 'election.winner:solo',
    ]) expect(keyAndMode).toContain(key);
  });

  it('does not start a missing event, invalid variant, or pair-only event as solo', () => {
    const a = speaker(1001);
    const b = speaker(1002);
    expect(requestDialogue({ eventKey: 'no.such.event' as DialogueEventKey, speaker: a, tick: 10 })).toBe(false);
    expect(requestDialogue({ eventKey: 'neighbor.greeting', speaker: a, tick: 10 })).toBe(false);
    expect(requestDialogue({
      eventKey: 'workplace.banter', treeId: 'evt_neighbor_greeting_pair_00',
      speaker: a, partner: b, tick: 10,
    })).toBe(false);
    expect(requestDialogue({
      eventKey: 'workplace.banter', treeId: 'evt_workplace_banter_pair_00',
      speaker: a, tick: 10,
    })).toBe(false);
    expect(a.chatPhrase).toBeUndefined();
    expect(a.chatDialogueSessionKey).toBeUndefined();
  });

  it('binds two real coworkers to a single alternating session', () => {
    const a = speaker(1201);
    const b = speaker(1202);
    expect(requestDialogue({
      eventKey: 'workplace.banter', treeId: 'evt_workplace_banter_pair_00',
      speaker: a, partner: b, tick: 12, durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(a.chatPhrase).toContain('How is it going?');
    expect(b.chatPhrase).toBeUndefined();
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    expect(a.chatPartnerId).toBe(b.id);
    expect(b.chatPartnerId).toBe(a.id);
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: b, partner: a, tick: 12,
    })).toBe(false);
    const resolver = (id: number) => id === a.id ? a : id === b.id ? b : undefined;
    for (let i = 0; i < 4; i++) tickHumanChat(a, resolver);
    expect(b.chatPhrase).toContain('Same as ever.');
    expect(a.chatPhrase).toBeUndefined();
    for (let i = 0; i < 4; i++) tickHumanChat(b, resolver);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
  });

  it('chooses an exact election record variant and interpolates only the actual names', () => {
    const a = speaker(1401);
    expect(requestDialogue({
      eventKey: 'election.buildup',
      treeId: 'evt_election_buildup_record_economy_good',
      speaker: a, tick: 90,
      variables: { leader: 'Mara', candidateA: 'Theo', candidateB: 'Ada', candidateC: 'Luz' },
    })).toBe(true);
    expect(a.chatPhrase).toContain('Prosperity favors Mara');
    expect(a.chatPhrase).not.toContain('{leader}');
  });

  it('uses pregnancy JSON only for a real mother and reciprocal partner', () => {
    const mother = { ...speaker(1601), pregnant: true, partnerId: 1602 };
    const partner = { ...speaker(1602), partnerId: 1601 };
    maybeDialogueChat(mother, partner, 'pregnant', 30, 1);
    expect(mother.chatDialogueSessionKey).toBe(partner.chatDialogueSessionKey);
    expect(mother.chatPhrase).toContain('baby');
    expect(partner.chatPartnerId).toBe(mother.id);
  });

  it('uses family lines for real married partners without inventing family bonds', () => {
    const a = { ...speaker(1701), partnerId: 1702 };
    const b = { ...speaker(1702), partnerId: 1701 };
    maybeDialogueChat(a, b, 'home', 32, 1);
    expect(a.chatPhrase).toBeDefined();
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    const c = speaker(1703);
    maybeDialogueChat(c, null, 'home', 33, 1);
    expect(c.chatPhrase).toBeDefined();
    expect(c.chatDialogueSessionKey).not.toBe(a.chatDialogueSessionKey);
  });

  it('chooses famine lines only under the existing food-low ambient context', () => {
    const a = speaker(1801);
    maybeDialogueChat(a, null, 'food', 45, 1, { foodLow: true });
    expect(a.chatPhrase).toBeDefined();
    const famine = canonicalDialogueBank.dialogue_trees.find((tree) => tree.id === 'wf_one_way_starving_monologue')!;
    expect(a.chatPhrase?.replaceAll('\n', ' ')).toBe(famine.lines[0]!.text);
  });

  it('retains outcome-specific social impulse content', () => {
    const a = speaker(1501);
    expect(requestDialogue({
      eventKey: 'social.impulse.grief.home', speaker: a, tick: 91,
    })).toBe(true);
    expect(a.chatPhrase).toContain('Leave me a while…');
  });
});
