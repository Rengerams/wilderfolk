import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, maybeDialogueChat, requestDialogue } from '../src/game/dialogueTrees';
import { prepareScriptedDialogue, resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('contextual catalogue reachability and dialogue variety', () => {
  it('cycles through every authored alternative for every multi-variant event/mode', () => {
    const groups = new Map<string, typeof canonicalDialogueBank.dialogue_trees[number][]>();
    for (const tree of canonicalDialogueBank.dialogue_trees) {
      const key = tree.eventKey + ':' + tree.mode;
      const group = groups.get(key) ?? [];
      group.push(tree);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const a: ChatSpeaker = { id: 98001 };
      const b: ChatSpeaker = { id: 98002 };
      const observed: string[] = [];
      for (let index = 0; index <= group.length; index++) {
        expect(requestDialogue({
          eventKey: group[0]!.eventKey,
          speaker: a,
          partner: group[0]!.mode === 'pair' ? b : null,
          tick: 500 + index,
          priority: 'scripted',
          selectionRoll: 0,
        }), key).toBe(true);
        const chosen = a.dialogueRecentScenes?.[key]?.id;
        expect(chosen, key).toBeDefined();
        observed.push(chosen!);
      }
      expect(new Set(observed.slice(0, group.length)).size, key).toBe(group.length);
      expect(observed[group.length], key).toBe(observed[0]);
    }
  });

  it('allows the only authored ambient variant again after a three-day cooldown', () => {
    const actor: ChatSpeaker = { id: 98301 };
    const request = { eventKey: 'social.impulse.grief.home' as const, speaker: actor };
    expect(requestDialogue({ ...request, tick: 25 })).toBe(true);
    prepareScriptedDialogue(actor);
    expect(requestDialogue({ ...request, tick: 26 })).toBe(false);
    expect(requestDialogue({ ...request, tick: 25 + TICKS_PER_DAY * 3 })).toBe(true);
  });

  it('routes the complete pregnancy pool by true actor roles, including reversed authored dialogue', () => {
    const roleCases = [
      ['expectant_mother'],
      ['partner'],
      ['expectant_mother', 'partner'],
      ['expectant_mother', 'neighbor'],
    ] as const;
    const reached = new Set<string>();
    for (const roles of roleCases) {
      const a: ChatSpeaker = { id: 98501 };
      const b: ChatSpeaker = { id: 98502 };
      const matching = canonicalDialogueBank.dialogue_trees.filter((tree) =>
        tree.eventKey === 'pregnancy.daily'
        && tree.speakers.length === roles.length
        && tree.speakers.every((role) => roles.includes(role as never)));
      expect(matching.length, roles.join('/')).toBeGreaterThan(0);
      const key = 'pregnancy.daily:' + (roles.length === 1 ? 'solo' : 'pair')
        + ':' + [...roles].sort().join(':');
      for (let index = 0; index < matching.length; index++) {
        expect(requestDialogue({
          eventKey: 'pregnancy.daily', roles, speaker: a,
          partner: roles.length === 2 ? b : null,
          tick: 1000 + index,
          selectionRoll: 0,
          priority: 'scripted',
        })).toBe(true);
        reached.add(a.dialogueRecentScenes![key]!.id);
      }
    }
    const authored = canonicalDialogueBank.dialogue_trees.filter((tree) =>
      tree.eventKey === 'pregnancy.daily');
    expect([...reached].sort()).toEqual(authored.map((tree) => tree.id).sort());

    const mother: ChatSpeaker = { id: 98701, pregnant: true, partnerId: 98702 };
    const father: ChatSpeaker = { id: 98702, partnerId: 98701 };
    expect(requestDialogue({
      eventKey: 'pregnancy.daily', treeId: 'wf_pregnant_pillows',
      roles: ['expectant_mother', 'partner'],
      speaker: mother, partner: father, tick: 100,
    })).toBe(true);
    expect(father.chatPhrase).toContain('eleven pillows');
    expect(mother.chatPhrase).toBeUndefined();
  });

  it('separates mother, expecting partner, neighbor, parent-child and housemate speech', () => {
    const mother: ChatSpeaker = { id: 98801, pregnant: true, partnerId: 98802 };
    const neighbor: ChatSpeaker = { id: 98803 };
    maybeDialogueChat(mother, neighbor, 'pregnant', 130, 1);
    const neighborTree = mother.dialogueRecentScenes?.['pregnancy.daily:pair:expectant_mother:neighbor']?.id;
    expect(['wf_pregnant_neighbor_advice', 'wf_pregnant_tired']).toContain(neighborTree);

    const expectingPartner: ChatSpeaker = { id: 98804 };
    maybeDialogueChat(expectingPartner, null, 'pregnant', 140, 1, {}, { expectingPartner: true });
    const partnerTree = expectingPartner.dialogueRecentScenes?.['pregnancy.daily:solo:partner']?.id;
    expect(['wf_pregnant_father_happy', 'wf_pregnant_partner_diapers', 'wf_pregnant_partner_woodworking'])
      .toContain(partnerTree);

    const parent: ChatSpeaker = { id: 98805, childrenIds: [98806] };
    const child: ChatSpeaker = { id: 98806, isJuvenile: true };
    maybeDialogueChat(parent, child, 'home', 150, 1);
    const familyTree = parent.dialogueRecentScenes?.['family.daily:pair:child:parent']?.id;
    expect(['wf_family_drawing_portrait', 'wf_family_bedtime_excuses',
      'wf_family_dinner_vegetables', 'wf_family_lost_boots']).toContain(familyTree);

    const housemateA: ChatSpeaker = { id: 98807, residenceBuildingId: 91 };
    const housemateB: ChatSpeaker = { id: 98808, residenceBuildingId: 91 };
    maybeDialogueChat(housemateA, housemateB, 'home', 160, 1);
    expect(['wf_family_roommate_leftovers', 'wf_family_roommate_window'])
      .toContain(housemateA.dialogueRecentScenes?.['family.daily:pair:housemate_a:housemate_b']?.id);
  });
});
