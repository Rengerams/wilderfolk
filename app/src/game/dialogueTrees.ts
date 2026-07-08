

import { readUtf8RelativeToModule } from './nodeRuntime';

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

let bank: DialogueBankFile | null = null;
let treesByCategory = new Map<DialogueCategory, DialogueTree[]>();
let loadPromise: Promise<void> | null = null;

/** Headless sims/tests (tsx/node) cannot rely on Vite async JSON chunks. */
async function loadDialogueFromDisk(): Promise<boolean> {
  const raw = await readUtf8RelativeToModule(import.meta.url, 'data', 'sim_dialogue_trees.json');
  if (!raw) return false;
  indexDialogueBank(JSON.parse(raw) as DialogueBankFile);
  return bank !== null;
}

function indexDialogueBank(next: DialogueBankFile): void {
  bank = next;
  treesByCategory = new Map();
  for (const tree of next.dialogue_trees) {
    const list = treesByCategory.get(tree.category) ?? [];
    list.push(tree);
    treesByCategory.set(tree.category, list);
  }
}

export function isDialogueBankReady(): boolean {
  return bank !== null;
}

/** Load dialogue JSON on demand — keeps the main game chunk smaller in production builds. */
export async function preloadDialogueBank(): Promise<void> {
  if (bank) return;
  if (await loadDialogueFromDisk()) return;
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = import('./data/sim_dialogue_trees.json')
    .then((mod) => {
      indexDialogueBank(mod.default as unknown as DialogueBankFile);
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });
  await loadPromise;
}

function requireBank(): DialogueBankFile {
  if (!bank) {
    throw new Error('Dialogue bank not loaded — call preloadDialogueBank() before chat simulation');
  }
  return bank;
}

export function getDialogueTrees(): readonly DialogueTree[] {
  return requireBank().dialogue_trees;
}

export function getDialogueCategories(): readonly DialogueCategory[] {
  return requireBank().categories;
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
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  weather?: 'clear' | 'rain' | 'snow' | 'storm' | 'drought' | 'heatwave' | 'fog';
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
  const trees = getDialogueTrees();
  const categories = resolveDialogueCategories(context, hints);
  const pool: DialogueTree[] = [];
  for (const cat of categories) {
    const list = treesByCategory.get(cat);
    if (list) pool.push(...list);
  }
  if (pool.length === 0) return trees[0] ?? null;

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
  return getDialogueTrees().find((t) => t.id === id);
}

export function speakerRoleIndex(tree: DialogueTree, line: DialogueLine): 0 | 1 {
  return line.speaker === tree.speakers[0] ? 0 : 1;
}