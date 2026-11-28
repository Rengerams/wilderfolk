import { describe, expect, it } from 'vitest';
import legacyElectionSource from './fixtures/dialogue-legacy-elections.json';
import ambientSource from '../src/game/data/dialogue/ambient.json';
import {
  canonicalDialogueBank, DIALOGUE_SCHEMA_VERSION, getDialogueTreeById,
  getDialogueTrees, installDialogueBankPayload, isDialogueBankReady,
} from '../src/game/dialogueTrees';

describe('canonical dialogue bank integrity', () => {
  it('provides a complete, unique indexed source catalog with valid event/mode combinations', () => {
    expect(canonicalDialogueBank.version).toBe(DIALOGUE_SCHEMA_VERSION);
    expect(canonicalDialogueBank.dialogue_trees.length).toBeGreaterThanOrEqual(300);
    const ids = new Set<string>();
    for (const tree of canonicalDialogueBank.dialogue_trees) {
      expect(ids.has(tree.id), tree.id).toBe(false);
      ids.add(tree.id);
      expect(tree.eventKey?.trim(), tree.id).toBeTruthy();
      expect(tree.mode, tree.id).toBe(tree.speakers.length === 1 ? 'solo' : 'pair');
      expect(tree.lines.length, tree.id).toBeGreaterThan(0);
      expect(getDialogueTreeById(tree.id)?.id).toBe(tree.id);
    }
    expect(getDialogueTrees().length).toBe(canonicalDialogueBank.dialogue_trees.length);
  });

  it('accepts identical serialized worker content and rejects a duplicated runtime tree ID atomically', () => {
    const wire = JSON.parse(JSON.stringify(canonicalDialogueBank)) as typeof canonicalDialogueBank;
    installDialogueBankPayload(wire);
    expect(isDialogueBankReady()).toBe(true);
    const known = getDialogueTreeById('evt_hospital_patient_other_0');
    expect(known).toBeDefined();
    const duplicate = {
      ...wire,
      dialogue_trees: [...wire.dialogue_trees, wire.dialogue_trees[0]!],
    };
    expect(() => installDialogueBankPayload(duplicate)).toThrow(/Duplicate dialogue tree id/);
    expect(getDialogueTreeById('evt_hospital_patient_other_0')?.id).toBe(known?.id);
    installDialogueBankPayload(canonicalDialogueBank);
  });
});

describe('quarantined legacy Elections.json reconciliation', () => {
  it('makes distinct archived need dialogues playable without misclassifying them as elections', () => {
    const legacy = legacyElectionSource.dialogue_trees;
    const current = new Map(ambientSource.dialogue_trees.map((tree) => [tree.id, tree]));
    expect(legacy).toHaveLength(10);
    const activeIds = new Set(canonicalDialogueBank.dialogue_trees.map((tree) => tree.id));
    const ids = new Set<string>();
    for (const tree of legacy) {
      expect(ids.has(tree.id), tree.id).toBe(false);
      ids.add(tree.id);
      const duplicate = current.get(tree.id);
      expect(duplicate, tree.id).toBeDefined();
      // These are different historical authorings, not byte-identical redundant data.
      expect(JSON.stringify(tree), tree.id).not.toBe(JSON.stringify(duplicate));
      expect(activeIds.has(tree.id), tree.id).toBe(true);
      const active = canonicalDialogueBank.dialogue_trees.find((scene) => scene.id === tree.id);
      expect(active?.lines).toEqual(duplicate?.lines);
      expect(active?.eventKey).toBe(duplicate?.eventKey);
      expect(tree.category).toBe('needs');
      const distinctText = JSON.stringify(tree.lines.map((line) => line.text))
        !== JSON.stringify(duplicate?.lines.map((line) => line.text));
      const migrated = current.get('wf_needs_alternative_' + tree.id);
      if (distinctText) {
        expect(migrated?.lines, tree.id).toEqual(tree.lines);
        expect(migrated?.eventKey, tree.id).toBe(duplicate?.eventKey);
        expect(activeIds.has(migrated!.id), tree.id).toBe(true);
      } else {
        expect(migrated, tree.id).toBeUndefined();
      }
    }
    expect(ambientSource.dialogue_trees.filter((tree) =>
      tree.id.startsWith('wf_needs_alternative_'))).toHaveLength(9);
    expect([...ids].some((id) => id.startsWith('election.'))).toBe(false);
    const election = canonicalDialogueBank.dialogue_trees.filter((tree) =>
      tree.eventKey?.startsWith('election.'));
    expect(election.length).toBeGreaterThan(0);
    expect(election.every((tree) => tree.category === 'dialogue')).toBe(true);
  });
});
