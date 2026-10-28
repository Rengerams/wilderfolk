import { describe, expect, it } from 'vitest';
import legacyElectionSource from '../src/game/data/Elections.json';
import needsSource from '../src/game/data/needs.json';
import { canonicalDialogueBank } from '../src/game/dialogueTrees';

describe('quarantined legacy Elections.json reconciliation', () => {
  it('preserves all ten historical alternatives without injecting them into active election scenes', () => {
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
    }
    expect([...ids].some((id) => id.startsWith('election.'))).toBe(false);
    const election = canonicalDialogueBank.dialogue_trees.filter((tree) =>
      tree.eventKey?.startsWith('election.'));
    expect(election.length).toBeGreaterThan(0);
    expect(election.every((tree) => tree.category !== 'needs')).toBe(true);
  });
});
