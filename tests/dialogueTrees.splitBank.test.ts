/*
 * BUG 2026-08-21-split-dialogue-bank-has-duplicate-and-mismatched-categories.
 * The split category files are the only canonical dialogue content source.
 */
import { describe, expect, it } from 'vitest';
import {
  DIALOGUE_CATEGORIES,
  canonicalDialogueBank,
  getDialogueTreeById,
  getDialogueTrees,
  pickDialogueTree,
  resolveDialogueCategories,
} from '../src/game/dialogueTrees';

describe('split dialogue bank', () => {
  it('merges every declared category into one canonical bank with unique tree IDs', () => {
    expect(canonicalDialogueBank.categories).toEqual([...DIALOGUE_CATEGORIES]);
    expect(canonicalDialogueBank.dialogue_trees).toHaveLength(115);

    const ids = canonicalDialogueBank.dialogue_trees.map((tree) => tree.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tree of canonicalDialogueBank.dialogue_trees) {
      expect(DIALOGUE_CATEGORIES).toContain(tree.category);
      expect(tree.lines.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes the original frontier humor additions in their matching categories', () => {
    expect(getDialogueTreeById('wf_funny_work_fence')?.category).toBe('work');
    expect(getDialogueTreeById('wf_funny_needs_stew')?.category).toBe('needs');
    expect(getDialogueTreeById('wf_funny_social_crow')?.category).toBe('social');
    expect(getDialogueTreeById('wf_funny_environment_frog')?.category).toBe('environment');
    expect(getDialogueTreeById('wf_funny_existential_cloud')?.category).toBe('existential');
    expect(getDialogueTreeById('wf_funny_chaos_goat')?.category).toBe('chaos');
    expect(getDialogueTreeById('wf_funny_festival_turnip')?.category).toBe('festival');
  });

  it('keeps festival content as a first-class dialogue category', () => {
    expect(resolveDialogueCategories('festival', { festivalActive: true })).toContain('festival');
    expect(getDialogueTrees().filter((tree) => tree.category === 'festival')).toHaveLength(6);
    expect(getDialogueTreeById('wf_festival_feast_scene')?.category).toBe('festival');
    expect(pickDialogueTree('festival', 0, 0, { festivalActive: true })?.category).toBe('festival');
  });
});
