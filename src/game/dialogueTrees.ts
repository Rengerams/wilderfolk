import chaosDialogueJson from './data/chaos.json';
import environmentDialogueJson from './data/environment.json';
import existentialDialogueJson from './data/existential.json';
import famineDialogueJson from './data/famine.json';
import festivalDialogueJson from './data/festival.json';
import needsDialogueJson from './data/needs.json';
import socialDialogueJson from './data/social.json';
import workDialogueJson from './data/work.json';
import { readUtf8RelativeToModule } from './nodeRuntime';
import type { Season, WeatherType } from './gameTypes';

export const DIALOGUE_CATEGORIES = [
  'work',
  'needs',
  'social',
  'existential',
  'chaos',
  'environment',
  'festival',
  'famine',
] as const;

export type DialogueCategory = (typeof DIALOGUE_CATEGORIES)[number];

export type ConversationType = 'one_way' | 'two_way';

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueTree {
  id: string;
  category: DialogueCategory;
  conversation_type?: ConversationType;
  speakers: readonly string[];
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
  famineDialogueJson as unknown as DialogueSourceFile,
  festivalDialogueJson as unknown as DialogueSourceFile,
  needsDialogueJson as unknown as DialogueSourceFile,
  socialDialogueJson as unknown as DialogueSourceFile,
  workDialogueJson as unknown as DialogueSourceFile,
];

const DIALOGUE_SOURCE_FILE_NAMES = [
  'chaos.json',
  'environment.json',
  'existential.json',
  'famine.json',
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
      throw new Error(`[dialogue] Unsupported source category: ${String(source.category)}`);
    }
    for (const tree of source.dialogue_trees) {
      if (tree.category !== source.category) {
        throw new Error(`[dialogue] Tree ${tree.id} is ${tree.category} inside ${source.category}.json`);
      }
      if (seenIds.has(tree.id)) {
        throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
      }
      
      // Structural guard supporting both 1-speaker monologues and 2-speaker dialogues
      if (!tree.lines || !Array.isArray(tree.lines) || tree.lines.length === 0 || !tree.speakers || tree.speakers.length === 0) {
        console.warn(`[dialogue] Skipping malformed tree: ${tree.id}`);
        continue;
      }

      seenIds.add(tree.id);
      dialogue_trees.push(tree);
    }
  }

  return {
    version: 'split-1.2',
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
  try {
    const rawSources = await Promise.all(
      DIALOGUE_SOURCE_FILE_NAMES.map((fileName) => readUtf8RelativeToModule(import.meta.url, 'data', fileName)),
    );
    if (rawSources.some((source) => !source)) return false;
    const parsedSources = rawSources.map((source) => JSON.parse(source!) as DialogueSourceFile);
    indexDialogueBank(buildCanonicalDialogueBank(parsedSources));
    return true;
  } catch {
    return false;
  }
}

function indexDialogueBank(next: DialogueBankFile): void {
  const nextTreesByCategory = new Map<DialogueCategory, DialogueTree[]>();
  const nextTreesById = new Map<string, DialogueTree>();

  for (const tree of next.dialogue_trees) {
    if (!isDialogueCategory(tree.category)) {
      throw new Error(`[dialogue] Unsupported tree category: ${String(tree.category)}`);
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
  food: ['famine', 'needs'],
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
  season?: Season;
  weather?: WeatherType;
  festivalActive?: boolean;
  foodLow?: boolean;
  solo?: boolean;
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
  if (hints?.foodLow) {
    out.add('famine');
    out.add('needs');
  }
  
  // All weather variations route to environment
  if (hints?.season === 'winter' || (hints?.weather && hints.weather !== 'clear')) {
    out.add('environment');
  }
  
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
    if (list) {
      for (const tree of list) {
        pool.push(tree);
      }
    }
  }
  
  let usePool = pool.length > 0 ? pool : [...trees];

  // If chatting in a pair, prioritize interactive two-way conversations
  if (hints?.solo === false) {
    const twoWayOnly = usePool.filter((t) => t.conversation_type !== 'one_way' && t.speakers.length > 1);
    if (twoWayOnly.length > 0) {
      usePool = twoWayOnly;
    }
  }

  // MurmurHash3 mix: Eliminates the modulo harmonic resonance
  let h = (entityId * 31337) ^ tick;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const seed = (h ^ (h >>> 16)) >>> 0;
  
  let index = seed % usePool.length;
  let tree = usePool[index]!;
  
  // Linear probe (+1): gcd(1, length) is always 1, guaranteeing all indices are reachable
  if (avoidTreeId && usePool.length > 1) {
    for (let attempt = 0; attempt < usePool.length && tree.id === avoidTreeId; attempt++) {
      index = (index + 1) % usePool.length;
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
  if (tree.speakers.length < 2) return 0;
  return line.speaker === tree.speakers[0] ? 0 : 1;
}

// Eager install keeps the first worker/main-thread chat tick deterministic.
ensureDialogueBankFromBundle();