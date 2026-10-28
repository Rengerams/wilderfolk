import { describe, expect, it } from 'vitest';
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
