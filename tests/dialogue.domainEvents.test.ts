import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, requestDialogue } from '../src/game/dialogueTrees';
import { resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('domain event-to-caption integration', () => {
  it('keeps hospital, lodging, civic, marriage, hunting and omen captions in their original outcome branch', () => {
    const cases = [
      'hospital.patient.pregnant', 'hospital.patient.other', 'hospital.doctor',
      'hotel.arrival', 'hotel.service.busy', 'hotel.service.welcome',
      'townHall.foodAid', 'townHall.goldAid', 'townHall.heard', 'townHall.generic',
      'townHall.audience.petitioner', 'townHall.audience.leader', 'townHall.official',
      'marriage.accepted', 'hunting.scarce', 'hunting.thinTrails', 'renffr.omen',
      'election.buildup', 'election.ceremony', 'election.tension', 'election.winner',
    ] as const;
    for (const [i, eventKey] of cases.entries()) {
      const tree = canonicalDialogueBank.dialogue_trees.find((scene) =>
        scene.eventKey === eventKey && scene.mode === 'solo');
      expect(tree, eventKey).toBeDefined();
      if (!tree) continue;
      const speaker = { id: 9000 + i, name: 'Speaker', energy: 63, gold: 17 };
      const before = { energy: speaker.energy, gold: speaker.gold };
      expect(requestDialogue({
        eventKey, treeId: tree.id, speaker, tick: 100 + i,
        variables: { leader: 'Mara', candidateA: 'Theo', candidateB: 'Ada', candidateC: 'Luz' },
      }), eventKey).toBe(true);
      expect(speaker.energy, eventKey).toBe(before.energy);
      expect(speaker.gold, eventKey).toBe(before.gold);
      expect(speaker.chatPartnerId, eventKey).toBeUndefined();
      expect(speaker.chatDialogueSessionKey, eventKey).toBe('solo:' + speaker.id);
    }
  });

  it('rejects text from a different outcome instead of inventing aid or pregnancy results', () => {
    const patient: ChatSpeaker = { id: 9701 };
    expect(requestDialogue({
      eventKey: 'hospital.patient.other', treeId: 'evt_hospital_patient_pregnant_0',
      speaker: patient, tick: 1,
    })).toBe(false);
    expect(requestDialogue({
      eventKey: 'townHall.foodAid', treeId: 'evt_townHall_goldAid_0',
      speaker: patient, tick: 1,
    })).toBe(false);
    expect(requestDialogue({ eventKey: 'pregnancy.daily', speaker: patient, tick: 1,
      treeId: 'wf_pregnant_kicking' })).toBe(false);
    expect(patient.chatDialogueSessionKey).toBeUndefined();
    expect(patient.chatPhrase).toBeUndefined();
  });

  it('speaks a marriage acceptance once per real actor without creating a pair or a game outcome', () => {
    const a: ChatSpeaker = { id: 9911 };
    const b: ChatSpeaker = { id: 9912 };
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: a, tick: 80,
      priority: 'scripted' })).toBe(true);
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: b, tick: 80,
      priority: 'scripted' })).toBe(true);
    expect(a.chatPhrase).toContain('Yes!');
    expect(b.chatPhrase).toContain('Yes!');
    expect(a.chatDialogueSessionKey).not.toBe(b.chatDialogueSessionKey);
    expect(a.chatPartnerId).toBeUndefined();
    expect(b.chatPartnerId).toBeUndefined();
  });
});
