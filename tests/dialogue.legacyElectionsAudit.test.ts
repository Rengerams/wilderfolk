import { describe, expect, it } from 'vitest';
import legacyElectionSource from '../src/game/data/Elections.json';
import needsSource from '../src/game/data/needs.json';
import { canonicalDialogueBank } from '../src/game/dialogueTrees';

describe('quarantined legacy Elections.json reconciliation', () => {
  it('makes distinct archived need dialogues playable without misclassifying them as elections', () => {
    const legacy = legacyElectionSource.dialogue_trees;
    const current = new Map(needsSource.dialogue_trees.map((tree) => [tree.id, tree]));
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
    expect(needsSource.dialogue_trees.filter((tree) =>
      tree.id.startsWith('wf_needs_alternative_'))).toHaveLength(9);
    expect([...ids].some((id) => id.startsWith('election.'))).toBe(false);
    const election = canonicalDialogueBank.dialogue_trees.filter((tree) =>
      tree.eventKey?.startsWith('election.'));
    expect(election.length).toBeGreaterThan(0);
    expect(election.every((tree) => tree.category !== 'needs')).toBe(true);
  });
});
