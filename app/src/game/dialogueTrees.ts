import dialogueBank from './data/sim_dialogue_trees.json';
import type { Season, WeatherType } from './gameTypes';

export type DialogueCategory =
  | 'work'
  | 'needs'
  | 'social'
  | 'existential'
  | 'chaos'
  | 'environment';

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueTree {
  id: string;
  category: DialogueCategory;
  speakers: readonly [string, string];
  lines: readonly DialogueLine[];
}

interface DialogueBankFile {
  version: string;
  dialogue_trees: DialogueTree[];
  categories: DialogueCategory[];
}

const bank = dialogueBank as unknown as DialogueBankFile;

export const DIALOGUE_TREES: readonly DialogueTree[] = bank.dialogue_trees;
export const DIALOGUE_CATEGORIES: readonly DialogueCategory[] = bank.categories;

const treesByCategory = new Map<DialogueCategory, DialogueTree[]>();
for (const tree of DIALOGUE_TREES) {
  const list = treesByCategory.get(tree.category) ?? [];
  list.push(tree);
  treesByCategory.set(tree.category, list);
}

const CONTEXT_CATEGORY: Partial<Record<string, DialogueCategory | DialogueCategory[]>> = {
  work: 'work',
  guard: 'work',
  hunt: 'work',
  home: 'needs',
  sleep: 'needs',
  food: 'needs',
  pregnant: 'needs',
  child: 'social',
  social: 'social',
  festival: 'social',
  courtship: 'social',
  affair: 'chaos',
  visitor: 'social',
  rival: 'social',
  school: 'social',
  fear: 'chaos',
  renffr: 'existential',
  winter: 'environment',
  election: 'existential',
};

export type DialoguePickHints = {
  season?: Season;
  weather?: WeatherType;
  festivalActive?: boolean;
  foodLow?: boolean;
};

export function resolveDialogueCategories(
  context: string,
  hints?: DialoguePickHints,
): DialogueCategory[] {
  const mapped = CONTEXT_CATEGORY[context];
  const fallback: DialogueCategory[] = ['social'];
  const base: DialogueCategory[] = Array.isArray(mapped) ? mapped : mapped ? [mapped] : fallback;
  const out = new Set<DialogueCategory>(base);
  if (hints?.festivalActive) out.add('social');
  if (hints?.foodLow) out.add('needs');
  if (hints?.season === 'winter') out.add('environment');
  if (hints?.weather === 'rain' || hints?.weather === 'snow' || hints?.weather === 'storm') {
    out.add('environment');
  }
  if (hints?.weather === 'drought') out.add('needs');
  return [...out];
}

export function pickDialogueTree(
  context: string,
  entityId: number,
  tick: number,
  hints?: DialoguePickHints,
  avoidTreeId?: string,
): DialogueTree | null {
  const categories = resolveDialogueCategories(context, hints);
  const pool: DialogueTree[] = [];
  for (const cat of categories) {
    const trees = treesByCategory.get(cat);
    if (trees) pool.push(...trees);
  }
  if (pool.length === 0) return DIALOGUE_TREES[0] ?? null;

  const seed = entityId * 47 + tick * 13;
  let idx = Math.abs(seed) % pool.length;
  let tree = pool[idx]!;
  if (avoidTreeId && pool.length > 1) {
    for (let attempt = 0; attempt < pool.length && tree.id === avoidTreeId; attempt++) {
      idx = (idx + 5 + entityId) % pool.length;
      tree = pool[idx]!;
    }
  }
  return tree;
}

export function getDialogueTreeById(id: string): DialogueTree | undefined {
  return DIALOGUE_TREES.find((t) => t.id === id);
}

export function speakerRoleIndex(tree: DialogueTree, line: DialogueLine): 0 | 1 {
  return line.speaker === tree.speakers[0] ? 0 : 1;
}