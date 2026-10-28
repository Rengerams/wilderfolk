import chaosDialogueJson from './data/chaos.json' with { type: 'json' };
import environmentDialogueJson from './data/environment.json' with { type: 'json' };
import existentialDialogueJson from './data/existential.json' with { type: 'json' };
import festivalDialogueJson from './data/festival.json' with { type: 'json' };
import needsDialogueJson from './data/needs.json' with { type: 'json' };
import socialDialogueJson from './data/social.json' with { type: 'json' };
import workDialogueJson from './data/work.json' with { type: 'json' };
import ambientSoloSocialJson from './data/dialogue/ambient-solo-social.json' with { type: 'json' };
import ambientSoloNeedsJson from './data/dialogue/ambient-solo-needs.json' with { type: 'json' };
import ambientSoloWorkJson from './data/dialogue/ambient-solo-work.json' with { type: 'json' };
import ambientSoloChaosJson from './data/dialogue/ambient-solo-chaos.json' with { type: 'json' };
import ambientSoloExistentialJson from './data/dialogue/ambient-solo-existential.json' with { type: 'json' };
import ambientSoloEnvironmentJson from './data/dialogue/ambient-solo-environment.json' with { type: 'json' };
import ambientSoloFestivalJson from './data/dialogue/ambient-solo-festival.json' with { type: 'json' };
import eventWorkplaceDialogueJson from './data/dialogue/workplace.json' with { type: 'json' };
import eventNeighborDialogueJson from './data/dialogue/neighbor.json' with { type: 'json' };
import eventChild_playDialogueJson from './data/dialogue/child-play.json' with { type: 'json' };
import eventHuntingDialogueJson from './data/dialogue/hunting.json' with { type: 'json' };
import eventHotelDialogueJson from './data/dialogue/hotel.json' with { type: 'json' };
import eventHospitalDialogueJson from './data/dialogue/hospital.json' with { type: 'json' };
import eventTown_hallDialogueJson from './data/dialogue/town-hall.json' with { type: 'json' };
import eventMarriageDialogueJson from './data/dialogue/marriage.json' with { type: 'json' };
import eventRenffr_omenDialogueJson from './data/dialogue/renffr-omen.json' with { type: 'json' };
import eventElectionDialogueJson from './data/dialogue/election.json' with { type: 'json' };
import eventSocial_impulseDialogueJson from './data/dialogue/social-impulse.json' with { type: 'json' };
import eventVisitorDialogueJson from './data/dialogue/visitor.json' with { type: 'json' };
import eventFamilyDialogueJson from './data/Family.json' with { type: 'json' };
import eventFamineDialogueJson from './data/Famine.json' with { type: 'json' };
import eventPregnancyDialogueJson from './data/pregnancy.json' with { type: 'json' };
import { readUtf8RelativeToModule } from './nodeRuntime';
import type { Season, WeatherType } from './gameTypes';

import { seededRandomForRun } from './simRng';
import { isDialogueBusy, startDialogueTreeChat, prepareScriptedDialogue, tickHumanChat, type ChatSpeaker, type HumanChatContext, type ChatPickOptions } from './humanChat';
export const DIALOGUE_CATEGORIES = [
  'work',
  'needs',
  'social',
  'existential',
  'chaos',
  'environment',
  'festival',
  'family',
  'famine',
  'pregnancy',
] as const;

export type DialogueCategory = (typeof DIALOGUE_CATEGORIES)[number];

export interface DialogueLine {
  speaker: string;
  text: string;
}

export interface DialogueTree {
  id: string;
  category: DialogueCategory;
  speakers: readonly string[];
  eventKey?: string;
  mode?: 'solo' | 'pair';
  lines: readonly DialogueLine[];
}

export interface DialogueBankFile {
  version: string;
  dialogue_trees: DialogueTree[];
  categories: DialogueCategory[];
}

export const DIALOGUE_SCHEMA_VERSION = '1.3';

interface DialogueSourceTree extends Omit<DialogueTree, 'mode'> {
  eventKey: string;
  conversation_type: 'one_way' | 'two_way';
}

interface DialogueSourceFile {
  version: string;
  game: string;
  category: DialogueCategory;
  categories: DialogueCategory[];
  dialogue_trees: DialogueSourceTree[];
}

const DIALOGUE_SOURCE_FILES: readonly DialogueSourceFile[] = [
  chaosDialogueJson as unknown as DialogueSourceFile,
  environmentDialogueJson as unknown as DialogueSourceFile,
  existentialDialogueJson as unknown as DialogueSourceFile,
  festivalDialogueJson as unknown as DialogueSourceFile,
  needsDialogueJson as unknown as DialogueSourceFile,
  socialDialogueJson as unknown as DialogueSourceFile,
  workDialogueJson as unknown as DialogueSourceFile,
  ambientSoloSocialJson as unknown as DialogueSourceFile,
  ambientSoloNeedsJson as unknown as DialogueSourceFile,
  ambientSoloWorkJson as unknown as DialogueSourceFile,
  ambientSoloChaosJson as unknown as DialogueSourceFile,
  ambientSoloExistentialJson as unknown as DialogueSourceFile,
  ambientSoloEnvironmentJson as unknown as DialogueSourceFile,
  ambientSoloFestivalJson as unknown as DialogueSourceFile,
  eventWorkplaceDialogueJson as unknown as DialogueSourceFile,
  eventNeighborDialogueJson as unknown as DialogueSourceFile,
  eventChild_playDialogueJson as unknown as DialogueSourceFile,
  eventHuntingDialogueJson as unknown as DialogueSourceFile,
  eventHotelDialogueJson as unknown as DialogueSourceFile,
  eventHospitalDialogueJson as unknown as DialogueSourceFile,
  eventTown_hallDialogueJson as unknown as DialogueSourceFile,
  eventMarriageDialogueJson as unknown as DialogueSourceFile,
  eventRenffr_omenDialogueJson as unknown as DialogueSourceFile,
  eventElectionDialogueJson as unknown as DialogueSourceFile,
  eventSocial_impulseDialogueJson as unknown as DialogueSourceFile,
  eventVisitorDialogueJson as unknown as DialogueSourceFile,
  eventFamilyDialogueJson as unknown as DialogueSourceFile,
  eventFamineDialogueJson as unknown as DialogueSourceFile,
  eventPregnancyDialogueJson as unknown as DialogueSourceFile,
];

const DIALOGUE_SOURCE_FILE_NAMES = [
  'chaos.json',
  'environment.json',
  'existential.json',
  'festival.json',
  'needs.json',
  'social.json',
  'work.json',
  'dialogue/ambient-solo-social.json',
  'dialogue/ambient-solo-needs.json',
  'dialogue/ambient-solo-work.json',
  'dialogue/ambient-solo-chaos.json',
  'dialogue/ambient-solo-existential.json',
  'dialogue/ambient-solo-environment.json',
  'dialogue/ambient-solo-festival.json',
  'dialogue/workplace.json',
  'dialogue/neighbor.json',
  'dialogue/child-play.json',
  'dialogue/hunting.json',
  'dialogue/hotel.json',
  'dialogue/hospital.json',
  'dialogue/town-hall.json',
  'dialogue/marriage.json',
  'dialogue/renffr-omen.json',
  'dialogue/election.json',
  'dialogue/social-impulse.json',
  'dialogue/visitor.json',
  'Family.json',
  'Famine.json',
  'pregnancy.json',
] as const;

function isDialogueCategory(value: string): value is DialogueCategory {
  return (DIALOGUE_CATEGORIES as readonly string[]).includes(value);
}

function buildCanonicalDialogueBank(sources: readonly DialogueSourceFile[]): DialogueBankFile {
  const dialogue_trees: DialogueTree[] = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    if (source.version !== DIALOGUE_SCHEMA_VERSION || source.game !== 'Wilderfolk Sim') {
      throw new Error(`[dialogue] Unsupported source schema: ${source.category} v${source.version}`);
    }
    if (!isDialogueCategory(source.category) || source.categories?.length !== 1 || source.categories[0] !== source.category) {
      throw new Error(`[dialogue] Invalid source categories: ${String(source.category)}`);
    }
    for (const tree of source.dialogue_trees) {
      if (tree.category !== source.category || !tree.eventKey?.trim()) {
        throw new Error(`[dialogue] Invalid category or event key: ${tree.id}`);
      }
      if (seenIds.has(tree.id)) throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
      if (tree.conversation_type !== 'one_way' && tree.conversation_type !== 'two_way') {
        throw new Error(`[dialogue] Invalid conversation type: ${tree.id}`);
      }
      const mode = tree.conversation_type === 'one_way' ? 'solo' : 'pair';
      if (tree.speakers.length !== (mode === 'solo' ? 1 : 2) || !tree.lines.length
        || tree.lines.some((line) => !tree.speakers.includes(line.speaker) || !line.text.trim())) {
        throw new Error(`[dialogue] Invalid speaker roles or lines: ${tree.id}`);
      }
      const { conversation_type: _conversationType, ...scene } = tree;
      dialogue_trees.push({ ...scene, mode });
      seenIds.add(tree.id);
    }
  }

  return {
    version: DIALOGUE_SCHEMA_VERSION,
    dialogue_trees,
    categories: [...DIALOGUE_CATEGORIES],
  };
}

/** Canonical content payload shared by the main thread and worker. */
export const canonicalDialogueBank = buildCanonicalDialogueBank(DIALOGUE_SOURCE_FILES);

let bank: DialogueBankFile | null = null;
let treesByCategory = new Map<DialogueCategory, DialogueTree[]>();
let treesById = new Map<string, DialogueTree>();
let treesByEvent = new Map<string, readonly DialogueTree[]>();
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
    // 🛡️ ROBUSTNESS: Gracefully fail and fall back to bundled JSON if disk reading 
    // throws (e.g., in browser environments where readUtf8RelativeToModule is unavailable).
    return false;
  }
}

function indexDialogueBank(next: DialogueBankFile): void {
  if (next.version !== DIALOGUE_SCHEMA_VERSION) {
    throw new Error(`[dialogue] Unsupported dialogue bank version: ${next.version}`);
  }
  const nextTreesByCategory = new Map<DialogueCategory, DialogueTree[]>();
  const nextTreesById = new Map<string, DialogueTree>();
  const nextTreesByEvent = new Map<string, DialogueTree[]>();

  for (const tree of next.dialogue_trees) {
    if (!isDialogueCategory(tree.category)) {
      throw new Error(`[dialogue] Unsupported tree category: ${String(tree.category)}`);
    }
    if (nextTreesById.has(tree.id)) {
      throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
    }
    const mode = tree.mode;
    if (mode !== 'solo' && mode !== 'pair') throw new Error(`[dialogue] Missing compiled mode for ${tree.id}`);
    if ((mode === 'solo' ? 1 : 2) !== tree.speakers.length || !tree.lines.length || tree.lines.some((line) => !tree.speakers.includes(line.speaker) || !line.text.trim())) {
      throw new Error(`[dialogue] Invalid roles or lines for ${tree.id}`);
    }
    if (!tree.eventKey) throw new Error(`[dialogue] Missing event key for ${tree.id}`);
    const key = `${tree.eventKey}:${mode}`;
    const entries = nextTreesByEvent.get(key) ?? [];
    entries.push(tree);
    nextTreesByEvent.set(key, entries);
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
  treesByEvent = nextTreesByEvent;
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
  if (payload.version !== DIALOGUE_SCHEMA_VERSION) {
    throw new Error(`[dialogue] Unsupported dialogue bank version: ${payload.version}`);
  }
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

// 🔄 TYPE UNIFICATION: Use gameTypes to prevent drift with ChatPickOptions
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
): DialogueTree | null {
  const trees = getDialogueTrees();
  if (trees.length === 0) return null;

  const categories = resolveDialogueCategories(context, hints);
  const pool: DialogueTree[] = [];
  
  for (const category of categories) {
    const list = treesByCategory.get(category);
    if (list) {
      // 🚀 OPTIMIZED: Safe iteration prevents "Maximum call stack size exceeded" 
      // errors that can occur with pool.push(...list) on large arrays.
      for (const tree of list) {
        pool.push(tree);
      }
    }
  }
  
  const usePool = pool.length > 0 ? pool : [...trees];

  const seed = entityId * 47 + tick * 13;
  const index = Math.abs(seed) % usePool.length;

  return usePool[index]!;
}

/**
 * Timed, presentation-only dialogue (e.g. PR #91's paused Spotlight Lore).
 * This is NOT an Entity chat session: the caller owns its wall-clock timing,
 * real actor mapping, pause/camera/skip, and world state.
 */
export interface PresentationDialogueLine extends DialogueLine {
  /** Optional authored wall-clock caption duration, not simulation ticks. */
  durationMs?: number;
}

export interface PresentationDialogueScene {
  readonly id: string;
  readonly eventKey: string;
  readonly speakers: readonly string[];
  readonly lines: readonly PresentationDialogueLine[];
}

interface PresentationDialogueSource {
  version: string;
  game: string;
  category: string;
  categories: string[];
  dialogue_trees: Array<{
    id: string;
    category: string;
    eventKey: string;
    conversation_type: string;
    speakers: string[];
    lines: PresentationDialogueLine[];
  }>;
}

/**
 * Parse PR-owned 1.3 JSON without importing it into an ambient-chat bank.
 *
 * PR #91 imports its own JSON and calls this once at module initialization.
 * A group scene may identify many named roles (or one rotating "chorus" role),
 * but it never touches chatPhrase, chatTicks, the simulation clock or RNG.
 * Missing/ambiguous event keys and invalid content fail closed with an error.
 */
export function readPresentationDialogue(
  rawSource: unknown,
  eventKey: string,
): PresentationDialogueScene {
  if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) {
    throw new Error('[dialogue] Invalid presentation source');
  }
  const source = rawSource as PresentationDialogueSource;
  if (source.version !== DIALOGUE_SCHEMA_VERSION || source.game !== 'Wilderfolk Sim'
    || typeof source.category !== 'string' || !source.category.trim()
    || !Array.isArray(source.categories) || source.categories.length !== 1
    || source.categories[0] !== source.category || !Array.isArray(source.dialogue_trees)) {
    throw new Error('[dialogue] Invalid 1.3 presentation source header');
  }
  if (typeof eventKey !== 'string' || !eventKey.trim()) {
    throw new Error('[dialogue] Presentation event key is required');
  }
  const ids = new Set<string>();
  let selected: PresentationDialogueScene | undefined;
  for (const tree of source.dialogue_trees) {
    if (!tree || typeof tree.id !== 'string' || !tree.id.trim() || ids.has(tree.id)) {
      throw new Error('[dialogue] Invalid or duplicate presentation tree ID');
    }
    ids.add(tree.id);
    if (tree.category !== source.category || typeof tree.eventKey !== 'string' || !tree.eventKey.trim()
      || tree.conversation_type !== 'group'
      || !Array.isArray(tree.speakers) || tree.speakers.length < 1
      || tree.speakers.length > 16
      || tree.speakers.some((role) => typeof role !== 'string' || !role.trim())
      || new Set(tree.speakers).size !== tree.speakers.length
      || !Array.isArray(tree.lines) || tree.lines.length < 1 || tree.lines.length > 512
      || tree.lines.some((line) => !line || typeof line.text !== 'string' || !line.text.trim()
        || !tree.speakers.includes(line.speaker)
        || (line.durationMs !== undefined && (!Number.isInteger(line.durationMs)
          || line.durationMs < 250 || line.durationMs > 60000)))) {
      throw new Error(\`[dialogue] Invalid presentation tree: \${tree.id}\`);
    }
    if (tree.eventKey === eventKey) {
      if (selected) throw new Error(\`[dialogue] Ambiguous presentation event key: \${eventKey}\`);
      selected = {
        id: tree.id,
        eventKey,
        speakers: Object.freeze([...tree.speakers]),
        lines: Object.freeze(tree.lines.map((line) => Object.freeze({
          speaker: line.speaker,
          text: line.text,
          ...(line.durationMs === undefined ? {} : { durationMs: line.durationMs }),
        }))),
      };
    }
  }
  if (!selected) throw new Error(\`[dialogue] Missing presentation event key: \${eventKey}\`);
  return Object.freeze(selected);
}

/**
 * Resolve the ordered speaker_1 ... speaker_N roles of a group presentation to
 * its real adult performers. Extra gathered performers remain non-speaking.
 * Called when preparing the stage, never from a simulation tick.
 */
export interface BoundPresentationDialogueLine extends PresentationDialogueLine {
  readonly speakerId: number;
}

export function bindNumberedPresentationSpeakers(
  presentation: PresentationDialogueScene,
  performerIds: readonly number[],
): readonly BoundPresentationDialogueLine[] {
  if (!Array.isArray(performerIds) || presentation.speakers.length > performerIds.length) {
    throw new Error('[dialogue] Not enough real performers for presentation');
  }
  for (let i = 0; i < presentation.speakers.length; i++) {
    if (presentation.speakers[i] !== `speaker_${i + 1}`) {
      throw new Error('[dialogue] Numbered presentation speaker roles must be sequential');
    }
  }
  const cast = performerIds.slice(0, presentation.speakers.length);
  if (cast.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(cast).size !== cast.length) {
    throw new Error('[dialogue] Invalid or duplicate presentation performer IDs');
  }
  return Object.freeze(presentation.lines.map((line) => {
    const index = presentation.speakers.indexOf(line.speaker);
    if (index < 0) throw new Error('[dialogue] Undeclared presentation speaker');
    return Object.freeze({
      ...line,
      speakerId: cast[index]!,
    });
  }));
}

export function getDialogueTreeById(id: string): DialogueTree | undefined {
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  return treesById.get(id);
}

export function speakerRoleIndex(tree: DialogueTree, line: DialogueLine): 0 | 1 {
  return line.speaker === tree.speakers[0] ? 0 : 1;
}


export interface DialogueRequest {
  eventKey: string;
  /** Exact vetted variant within the event pool (for outcome-dependent content). */
  treeId?: string;
  speaker: ChatSpeaker;
  partner?: ChatSpeaker | null;
  /** Optional resolver for immediate release of the interrupted paired session. */
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined;
  tick: number;
  priority?: 'ambient' | 'scripted';
  durationHours?: number;
  variables?: Readonly<Record<string, string>>;
  selectionRoll?: number;
}

export function requestDialogue(request: Readonly<DialogueRequest>): boolean {
  const { eventKey, speaker, tick } = request;
  const partner = request.partner ?? null;
  if (request.priority !== 'scripted' && (isDialogueBusy(speaker) || (partner && isDialogueBusy(partner)))) return false;
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  const mode = partner ? 'pair' : 'solo';
  const choices = treesByEvent.get(eventKey + ':' + mode);
  if (!choices?.length) return false;
  const explicit = request.treeId ? treesById.get(request.treeId) : undefined;
  if (request.treeId && (!explicit || !choices.includes(explicit))) return false;
  const roll = request.selectionRoll ?? (request.treeId ? 0
    : seededRandomForRun('dialogue-content:' + eventKey + ':' + speaker.id + ':' + (partner?.id ?? 0) + ':' + tick));
  const selected = explicit ?? choices[Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)))]!;
  if (request.priority === 'scripted') {
    prepareScriptedDialogue(speaker, request.resolvePartner);
    if (partner) prepareScriptedDialogue(partner, request.resolvePartner);
  }
  const tree = request.variables ? {
    ...selected,
    lines: selected.lines.map((line) => ({ ...line, text: line.text.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => request.variables?.[name] ?? match) })),
  } : selected;
  startDialogueTreeChat(speaker, partner, tree, mode === 'solo', request.durationHours);
  return true;
}

/** Pick an already-existing event context without creating another event scheduler.
 * Only use specific scenes when their real-world role requirements are met.
 * Unsupported relationships retain the original ambient source for that mode.
 */
function contextualAmbientScene(
  entity: ChatSpeaker,
  partner: ChatSpeaker | null,
  context: HumanChatContext,
  options: ChatPickOptions,
): { eventKey: string; treeId?: string } {
  if (context === 'pregnant' && entity.pregnant) {
    if (!partner) return { eventKey: 'pregnancy.daily', treeId: 'wf_pregnant_mother_waddle' };
    if (entity.partnerId === partner.id && partner.partnerId === entity.id) {
      return { eventKey: 'pregnancy.daily', treeId: 'wf_pregnant_kicking' };
    }
  }
  if (context === 'food' && options.foodLow && !partner) {
    return { eventKey: 'famine.hunger', treeId: 'wf_one_way_starving_monologue' };
  }
  if (context === 'home') {
    if (partner && entity.partnerId === partner.id && partner.partnerId === entity.id) {
      return { eventKey: 'family.daily', treeId: 'wf_family_warm_spot' };
    }
    if (partner && entity.residenceBuildingId != null
      && entity.residenceBuildingId === partner.residenceBuildingId) {
      return { eventKey: 'family.daily', treeId: 'wf_family_roommate_leftovers' };
    }
    if (!partner && (entity.partnerId != null || (entity.childrenIds?.length ?? 0) > 0)) {
      return { eventKey: 'family.daily' };
    }
  }
  return { eventKey: 'ambient.' + (context === 'pregnant' ? 'pregnancy' : context) };
}

/** One existing tick dispatch; humanChat remains the only field-writing session executor. */
export function tickDialogue(
  entity: ChatSpeaker,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  tickHumanChat(entity, resolvePartner);
}

export function maybeDialogueChat(
  entity: ChatSpeaker,
  partner: ChatSpeaker | null,
  context: HumanChatContext,
  tick: number,
  chance: number,
  options: ChatPickOptions = {},
): void {
  // Keep the same event eligibility and single seeded chance roll.
  if (isDialogueBusy(entity) || (partner && isDialogueBusy(partner))) return;
  if (seededRandomForRun(`chat-roll:${entity.id}:${tick}`) > chance) return;

  const content = contextualAmbientScene(entity, partner, context, options);
  requestDialogue({ ...content, speaker: entity, partner, tick });
}

/** Weighted pool of chat contexts — random pick, optional light bias from world state. */
export function pickRandomChatContext(
  entity: Pick<ChatSpeaker, 'isJuvenile' | 'id'>,
  tick: number,
  options: ChatPickOptions = {},
  extra?: {
    pregnant?: boolean;
    renffr?: boolean;
    workHour?: boolean;
    night?: boolean;
  },
): HumanChatContext {
  // Base weights: mostly social / work / home so trees across the bank get used.
  const pool: HumanChatContext[] = [
    'social', 'social', 'social', 'social',
    'work', 'work',
    'home', 'home',
  ];
  if (options.foodLow) pool.push('food', 'food');
  if (options.season === 'winter' || options.weather === 'snow') pool.push('winter', 'winter');
  if (options.festivalActive) pool.push('festival', 'festival');
  if (entity.isJuvenile) pool.push('child', 'child', 'school');
  if (extra?.pregnant) pool.push('pregnant');
  if (extra?.renffr) pool.push('renffr', 'renffr');
  if (extra?.workHour) pool.push('work', 'work');
  if (extra?.night) pool.push('home', 'sleep', 'sleep');
  if (options.weather === 'rain' || options.weather === 'storm') pool.push('winter');
  return pool[Math.floor(seededRandomForRun(`chat-context:${entity.id}:${tick}`) * pool.length)]!;
}

/**
 * Ambient dialogue — random time, random context, optional random nearby partner.
 * Not gated to work hours / evening / “arrived at building”.
 *
 * @param chancePerTick raw chance this tick (e.g. 0.012 ≈ occasional chatter)
 */
export function tryAmbientRandomDialogue(
  entity: ChatSpeaker,
  nearbyCandidates: ChatSpeaker[],
  tick: number,
  chancePerTick: number,
  options: ChatPickOptions = {},
  extra?: {
    pregnant?: boolean;
    renffr?: boolean;
    workHour?: boolean;
    night?: boolean;
  },
): void {
  // Owner predicate, not the visible-line counter — the candidate must not be mid-conversation
  if (isDialogueBusy(entity)) return;
  if (seededRandomForRun(`chat-ambient:${entity.id}:${tick}`) > chancePerTick) return;

  const context = pickRandomChatContext(entity, tick, options, extra);
  
  // 🚀 OPTIMIZED: Single-pass random partner selection instead of .filter()
  let partner: ChatSpeaker | null = null;
  if (nearbyCandidates.length > 0) {
    // Try to find a free partner randomly without allocating a new array
    let attempts = 0;
    const maxAttempts = Math.min(nearbyCandidates.length, 5); // Limit attempts to avoid infinite loops in dense crowds
    while (attempts < maxAttempts) {
      const candidate = nearbyCandidates[Math.floor(seededRandomForRun(`chat-cand:${entity.id}:${tick}:${attempts}`) * nearbyCandidates.length)];
      if (candidate && candidate.id !== entity.id && !isDialogueBusy(candidate)) {
        partner = candidate;
        break;
      }
      attempts++;
    }
  }

  maybeDialogueChat(entity, partner, context, tick, 1, options);
}


// Eager install keeps the first worker/main-thread chat tick deterministic.
ensureDialogueBankFromBundle();