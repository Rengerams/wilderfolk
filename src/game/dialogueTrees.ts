import chaosDialogueJson from './data/chaos.json';
import environmentDialogueJson from './data/environment.json';
import existentialDialogueJson from './data/existential.json';
import festivalDialogueJson from './data/festival.json';
import needsDialogueJson from './data/needs.json';
import socialDialogueJson from './data/social.json';
import workDialogueJson from './data/work.json';
import { readUtf8RelativeToModule } from './nodeRuntime';

export const DIALOGUE_CATEGORIES = [
  'work',
  'needs',
  'social',
  'existential',
  'chaos',
  'environment',
  'festival',
] as const;

export type DialogueCategory = (typeof DIALOGUE_CATEGORIES)[number];

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

export interface DialogueBankFile {
  version: string;
  dialogue_trees: DialogueTree[];
  categories: DialogueCategory[];
}

interface DialogueSourceFile {
  version: string;
  category: DialogueCategory;
  dialogue_trees: DialogueTree[];
}

const DIALOGUE_SOURCE_FILES: readonly DialogueSourceFile[] = [
  chaosDialogueJson as unknown as DialogueSourceFile,
  environmentDialogueJson as unknown as DialogueSourceFile,
  existentialDialogueJson as unknown as DialogueSourceFile,
  festivalDialogueJson as unknown as DialogueSourceFile,
  needsDialogueJson as unknown as DialogueSourceFile,
  socialDialogueJson as unknown as DialogueSourceFile,
  workDialogueJson as unknown as DialogueSourceFile,
];

const DIALOGUE_SOURCE_FILE_NAMES = [
  'chaos.json',
  'environment.json',
  'existential.json',
  'festival.json',
  'needs.json',
  'social.json',
  'work.json',
] as const;

function isDialogueCategory(value: string): value is DialogueCategory {
  return (DIALOGUE_CATEGORIES as readonly string[]).includes(value);
}

function buildCanonicalDialogueBank(sources: readonly DialogueSourceFile[]): DialogueBankFile {
  const dialogue_trees: DialogueTree[] = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    if (!isDialogueCategory(source.category)) {
      throw new Error(`[dialogue] Unsupported source category: ${source.category}`);
    }
    for (const tree of source.dialogue_trees) {
      if (tree.category !== source.category) {
        throw new Error(`[dialogue] Tree ${tree.id} is ${tree.category} inside ${source.category}.json`);
      }
      if (seenIds.has(tree.id)) {
        throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
      }
      seenIds.add(tree.id);
      dialogue_trees.push(tree);
    }
  }

  return {
    version: 'split-1.1',
    dialogue_trees,
    categories: [...DIALOGUE_CATEGORIES],
  };
}

/** Canonical content payload shared by the main thread and worker. */
export const canonicalDialogueBank = buildCanonicalDialogueBank(DIALOGUE_SOURCE_FILES);

let bank: DialogueBankFile | null = null;
let treesByCategory = new Map<DialogueCategory, DialogueTree[]>();
let treesById = new Map<string, DialogueTree>();
let loadPromise: Promise<void> | null = null;

/** Headless sims/tests can read the same split sources from disk if imports are unavailable. */
async function loadDialogueFromDisk(): Promise<boolean> {
  const rawSources = await Promise.all(
    DIALOGUE_SOURCE_FILE_NAMES.map((fileName) => readUtf8RelativeToModule(import.meta.url, 'data', fileName)),
  );
  if (rawSources.some((source) => !source)) return false;
  const parsedSources = rawSources.map((source) => JSON.parse(source!) as DialogueSourceFile);
  indexDialogueBank(buildCanonicalDialogueBank(parsedSources));
  return true;
}

function indexDialogueBank(next: DialogueBankFile): void {
  const nextTreesByCategory = new Map<DialogueCategory, DialogueTree[]>();
  const nextTreesById = new Map<string, DialogueTree>();

  for (const tree of next.dialogue_trees) {
    if (!isDialogueCategory(tree.category)) {
      throw new Error(`[dialogue] Unsupported tree category: ${tree.category}`);
    }
    if (nextTreesById.has(tree.id)) {
      throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
    }
    const list = nextTreesByCategory.get(tree.category) ?? [];
    list.push(tree);
    nextTreesByCategory.set(tree.category, list);
    nextTreesById.set(tree.id, tree);
  }

  bank = {
    ...next,
    dialogue_trees: [...next.dialogue_trees],
    categories: [...next.categories],
  };
  treesByCategory = nextTreesByCategory;
  treesById = nextTreesById;
}

/** Install the statically bundled split dialogue sources if nothing is loaded yet. */
export function ensureDialogueBankFromBundle(): boolean {
  if (bank && bank.dialogue_trees.length > 0) return true;
  try {
    indexDialogueBank(canonicalDialogueBank);
    return Boolean(bank && bank.dialogue_trees.length > 0);
  } catch (err) {
    console.error('[dialogue] Failed to install split dialogue bank', err);
    return false;
  }
}

export function isDialogueBankReady(): boolean {
  return bank !== null && bank.dialogue_trees.length > 0;
}

/** Install pre-serialized dialogue data (e.g. the worker’s canonical static bundle). */
export function installDialogueBankPayload(payload: DialogueBankFile): void {
  indexDialogueBank(payload);
}

/** Load the canonical split dialogue bank on demand. */
export async function preloadDialogueBank(): Promise<void> {
  if (isDialogueBankReady()) return;
  if (await loadDialogueFromDisk()) return;
  if (!loadPromise) {
    loadPromise = Promise.resolve().then(() => {
      indexDialogueBank(canonicalDialogueBank);
    });
  }
  await loadPromise;
  if (!isDialogueBankReady()) {
    throw new Error('Dialogue bank failed to load from split category files');
  }
}

function requireBank(): DialogueBankFile {
  if (!isDialogueBankReady()) {
    ensureDialogueBankFromBundle();
  }
  if (!bank) {
    throw new Error('Dialogue bank not loaded — call preloadDialogueBank() before chat simulation');
  }
  return bank;
}

export function getDialogueTrees(): readonly DialogueTree[] {
  if (!isDialogueBankReady()) {
    ensureDialogueBankFromBundle();
  }
  return bank?.dialogue_trees ?? [];
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
  festival: ['festival', 'social'],
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
  if (hints?.festivalActive) out.add('festival');
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
  if (trees.length === 0) return null;

  const categories = resolveDialogueCategories(context, hints);
  const pool: DialogueTree[] = [];
  for (const category of categories) {
    const list = treesByCategory.get(category);
    if (list) pool.push(...list);
  }
  const usePool = pool.length > 0 ? pool : [...trees];

  const seed = entityId * 47 + tick * 13;
  let index = Math.abs(seed) % usePool.length;
  let tree = usePool[index]!;
  if (avoidTreeId && usePool.length > 1) {
    for (let attempt = 0; attempt < usePool.length && tree.id === avoidTreeId; attempt++) {
      index = (index + 5 + entityId) % usePool.length;
      tree = usePool[index]!;
    }
  }
  return tree;
}

export function getDialogueTreeById(id: string): DialogueTree | undefined {
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  return treesById.get(id);
}

export function speakerRoleIndex(tree: DialogueTree, line: DialogueLine): 0 | 1 {
  return line.speaker === tree.speakers[0] ? 0 : 1;
}

// Eager install keeps the first worker/main-thread chat tick deterministic.
ensureDialogueBankFromBundle();
