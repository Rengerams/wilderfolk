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

import { seededRandomForRun } from './simRng';
import { PER_TICK_RATE_SCALE, TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycleClock';
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

export const DIALOGUE_EVENT_KEYS = [
  'ambient.social',
  'ambient.home',
  'ambient.courtship',
  'ambient.work',
  'ambient.visitor',
  'ambient.rival',
  'ambient.hunt',
  'ambient.child',
  'ambient.school',
  'ambient.pregnancy',
  'ambient.affair',
  'ambient.sleep',
  'ambient.renffr',
  'ambient.fear',
  'ambient.winter',
  'ambient.festival',
  'ambient.guard',
  'ambient.food',
  'ambient.election',
  'family.daily',
  'famine.hunger',
  'pregnancy.daily',
  'workplace.banter.solo',
  'workplace.banter.start',
  'workplace.banter.reply',
  'workplace.banter',
  'neighbor.greeting.start',
  'neighbor.greeting.reply',
  'neighbor.greeting',
  'child.play',
  'hunting.scarce',
  'hunting.thinTrails',
  'hotel.arrival',
  'hotel.service.busy',
  'hotel.service.welcome',
  'hospital.patient.pregnant',
  'hospital.patient.other',
  'hospital.doctor',
  'townHall.foodAid',
  'townHall.heard',
  'townHall.audience.petitioner',
  'townHall.audience.leader',
  'townHall.goldAid',
  'townHall.generic',
  'townHall.official',
  'marriage.accepted',
  'renffr.omen',
  'election.buildup',
  'election.ceremony',
  'election.tension',
  'election.winner',
  'social.impulse.sick_day',
  'social.impulse.grief.church',
  'social.impulse.grief.home',
  'social.impulse.bad_weather.drought',
  'social.impulse.bad_weather.storm',
  'social.impulse.bad_weather.snow',
  'social.impulse.bad_weather.rain',
  'social.impulse.elder_rest',
  'social.impulse.care_pregnant.to_hospital',
  'social.impulse.care_pregnant.check_spouse',
  'social.impulse.care_pregnant.rest',
  'social.impulse.hospital_visit.checkup',
  'social.impulse.hospital_visit.midwives',
  'social.impulse.hospital_visit.doctor',
  'social.impulse.sunday_service',
  'social.impulse.civic_petition.grief',
  'social.impulse.civic_petition.food',
  'social.impulse.civic_petition.general',
  'social.impulse.birthday',
  'social.impulse.market_errand.well',
  'social.impulse.market_errand.other',
  'social.impulse.comfort_neighbor',
  'social.impulse.day_off',
  'visitor.poi.market',
  'visitor.poi.hall',
  'visitor.poi.church',
  'visitor.poi.study',
  'visitor.poi.hunt',
  'visitor.poi.trail',
  'visitor.poi.campfire',
  'visitor.poi.homes',
  'visitor.poi.help',
  'visitor.poi.shelter',
  'visitor.poi.stage',
  'visitor.poi.show',
  'visitor.poi.square',
  'visitor.poi.well',
  'visitor.poi.shrine',
  'visitor.poi.notes',
  'visitor.poi.visit',
  'visitor.poi.road',
  'visitor.poi.plea',
  'visitor.performer',
] as const;

export type DialogueEventKey = (typeof DIALOGUE_EVENT_KEYS)[number];
const DIALOGUE_EVENT_KEY_SET: ReadonlySet<string> = new Set(DIALOGUE_EVENT_KEYS);

export interface DialogueLine {
  readonly speaker: string;
  readonly text: string;
}

type DialogueTreeBase = Readonly<{
  id: string;
  category: DialogueCategory;
  eventKey: DialogueEventKey;
  lines: readonly DialogueLine[];
}>;

export type DialogueTree = DialogueTreeBase & (
  | Readonly<{ mode: 'solo'; speakers: readonly [string] }>
  | Readonly<{ mode: 'pair'; speakers: readonly [string, string] }>
);

export interface DialogueBankFile {
  readonly version: string;
  readonly dialogue_trees: readonly DialogueTree[];
  readonly categories: readonly DialogueCategory[];
}

export const DIALOGUE_SCHEMA_VERSION = '1.3';

interface DialogueSourceTree {
  id: string;
  category: DialogueCategory;
  eventKey: DialogueEventKey;
  conversation_type: 'one_way' | 'two_way';
  speakers: readonly string[];
  lines: readonly DialogueLine[];
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

function freezeDialogueTree(tree: DialogueTree): DialogueTree {
  const lines = Object.freeze(tree.lines.map((line) => Object.freeze({ ...line })));
  if (tree.mode === 'solo') {
    return Object.freeze({ ...tree, speakers: Object.freeze([tree.speakers[0]] as const), lines });
  }
  return Object.freeze({ ...tree, speakers: Object.freeze([tree.speakers[0], tree.speakers[1]] as const), lines });
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
      if (tree.category !== source.category || !DIALOGUE_EVENT_KEY_SET.has(tree.eventKey)) {
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
      const compiled: DialogueTree = mode === 'solo'
        ? { ...scene, mode: 'solo', speakers: [tree.speakers[0]!] }
        : { ...scene, mode: 'pair', speakers: [tree.speakers[0]!, tree.speakers[1]!] };
      dialogue_trees.push(freezeDialogueTree(compiled));
      seenIds.add(tree.id);
    }
  }

  return Object.freeze({
    version: DIALOGUE_SCHEMA_VERSION,
    dialogue_trees: Object.freeze(dialogue_trees),
    categories: Object.freeze([...DIALOGUE_CATEGORIES]),
  });
}

/** Canonical content payload shared by the main thread and worker. */
export const canonicalDialogueBank = buildCanonicalDialogueBank(DIALOGUE_SOURCE_FILES);

let bank: DialogueBankFile | null = null;
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
  const nextTreesById = new Map<string, DialogueTree>();
  const nextTreesByEvent = new Map<string, DialogueTree[]>();
  const frozenTrees: DialogueTree[] = [];

  for (const tree of next.dialogue_trees) {
    if (!isDialogueCategory(tree.category)) {
      throw new Error(`[dialogue] Unsupported tree category: ${String(tree.category)}`);
    }
    if (nextTreesById.has(tree.id)) {
      throw new Error(`[dialogue] Duplicate dialogue tree id: ${tree.id}`);
    }
    const mode = tree.mode;
    if (mode !== 'solo' && mode !== 'pair') throw new Error('[dialogue] Missing compiled mode');
    if ((mode === 'solo' ? 1 : 2) !== tree.speakers.length || !tree.lines.length || tree.lines.some((line) => !tree.speakers.includes(line.speaker) || !line.text.trim())) {
      throw new Error(`[dialogue] Invalid roles or lines for ${tree.id}`);
    }
    if (!DIALOGUE_EVENT_KEY_SET.has(tree.eventKey)) throw new Error(`[dialogue] Invalid event key for ${tree.id}`);
    const frozen = freezeDialogueTree(tree);
    const key = `${frozen.eventKey}:${mode}`;
    const entries = nextTreesByEvent.get(key) ?? [];
    entries.push(frozen);
    nextTreesByEvent.set(key, entries);
    nextTreesById.set(frozen.id, frozen);
    frozenTrees.push(frozen);
  }

  bank = Object.freeze({
    version: next.version,
    dialogue_trees: Object.freeze(frozenTrees),
    categories: Object.freeze([...next.categories]),
  });
  treesById = nextTreesById;
  treesByEvent = new Map([...nextTreesByEvent].map(([key, entries]) => [key, Object.freeze(entries)]));
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
      throw new Error(`[dialogue] Invalid presentation tree: ${tree.id}`);
    }
    if (tree.eventKey === eventKey) {
      if (selected) throw new Error(`[dialogue] Ambiguous presentation event key: ${eventKey}`);
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
  if (!selected) throw new Error(`[dialogue] Missing presentation event key: ${eventKey}`);
  return Object.freeze(selected);
}

/**
 * Bind numbered presentation roles to 6–10 distinct, real gathered adults.
 * Every gathered actor must speak; excess JSON roles repeat real actors.
 * Never invent an actor, mutate gameplay fields, or consume RNG.
 */
export interface BoundPresentationDialogueLine extends PresentationDialogueLine {
  readonly speakerId: number;
}

const PRESENTATION_MIN_PERFORMERS = 6;
const PRESENTATION_MAX_PERFORMERS = 10;

export function bindNumberedPresentationSpeakers(
  presentation: PresentationDialogueScene,
  performerIds: readonly number[],
): readonly BoundPresentationDialogueLine[] {
  if (!Array.isArray(performerIds)
    || performerIds.length < PRESENTATION_MIN_PERFORMERS
    || performerIds.length > PRESENTATION_MAX_PERFORMERS) {
    throw new Error('[dialogue] Presentation requires 6–10 real performers');
  }
  if (performerIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(performerIds).size !== performerIds.length) {
    throw new Error('[dialogue] Invalid or duplicate presentation performer IDs');
  }
  const roleToActor = new Map<string, number>();
  for (let i = 0; i < presentation.speakers.length; i++) {
    const role = presentation.speakers[i];
    if (role !== `speaker_${i + 1}`) {
      throw new Error('[dialogue] Numbered presentation speaker roles must be sequential');
    }
    // Assign missing role slots to an already-present adult, in stable cast order.
    roleToActor.set(role, performerIds[i % performerIds.length]!);
  }
  const bound = Object.freeze(presentation.lines.map((line) => {
    const speakerId = roleToActor.get(line.speaker);
    if (speakerId === undefined) throw new Error('[dialogue] Undeclared presentation speaker');
    return Object.freeze({ ...line, speakerId });
  }));
  if (new Set(bound.map((line) => line.speakerId)).size !== performerIds.length) {
    throw new Error('[dialogue] Every gathered performer must speak at least once');
  }
  return bound;
}

export function getDialogueTreeById(id: string): DialogueTree | undefined {
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  return treesById.get(id);
}

export function speakerRoleIndex(tree: DialogueTree, line: DialogueLine): 0 | 1 {
  return line.speaker === tree.speakers[0] ? 0 : 1;
}


/** Keep effective bubble ticks when an existing nominal-tick speech event migrates to hours. */
export function dialogueHoursFromNominalTicks(nominalTicks: number): number {
  return Math.max(4, Math.round(nominalTicks * PER_TICK_RATE_SCALE)) / TICKS_PER_HOUR;
}

export interface DialogueRequest {
  eventKey: DialogueEventKey;
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
  /** Author-defined speaker roles for contextual dialogue, including swapped pair order. */
  roles?: readonly string[];
}

export function requestDialogue(request: Readonly<DialogueRequest>): boolean {
  const { eventKey, speaker, tick } = request;
  const partner = request.partner ?? null;
  if (request.priority !== 'scripted' && (isDialogueBusy(speaker) || (partner && isDialogueBusy(partner)))) return false;
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  const mode = partner ? 'pair' : 'solo';
  const pool = treesByEvent.get(eventKey + ':' + mode);
  const roles = request.roles;
  const choices = roles ? pool?.filter((tree) =>
    tree.speakers.length === roles.length
    && (tree.speakers.every((role, index) => role === roles[index])
      || (tree.mode === 'pair' && tree.speakers[0] === roles[1] && tree.speakers[1] === roles[0])))
    : pool;
  if (!choices?.length) return false;
  const explicit = request.treeId ? treesById.get(request.treeId) : undefined;
  if (request.treeId && (!explicit || !choices.includes(explicit))) return false;
  const historyKey = eventKey + ':' + mode + (roles ? ':' + [...roles].sort().join(':') : '');
  const last = speaker.dialogueRecentScenes?.[historyKey];
  const lastIndex = choices.findIndex((scene) => scene.id === last?.id);
  const recentlySpoken = last && Number.isSafeInteger(last.tick) && tick >= last.tick
    && tick - last.tick < TICKS_PER_DAY * 3;
  if (!explicit && choices.length === 1 && request.priority !== 'scripted'
    && recentlySpoken) return false;
  const roll = request.selectionRoll ?? (request.treeId ? 0
    : seededRandomForRun('dialogue-content:' + eventKey + ':' + speaker.id + ':' + (partner?.id ?? 0) + ':' + tick));
  const initialIndex = Math.max(0, Math.min(choices.length - 1, Math.floor(roll * choices.length)));
  const selected = explicit ?? choices[lastIndex >= 0 && choices.length > 1
    ? (lastIndex + 1) % choices.length : initialIndex]!;
  if (request.priority === 'scripted') {
    prepareScriptedDialogue(speaker, request.resolvePartner);
    if (partner) prepareScriptedDialogue(partner, request.resolvePartner);
  }
  const tree: DialogueTree = request.variables ? freezeDialogueTree({
    ...selected,
    lines: selected.lines.map((line) => ({ ...line, text: line.text.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => request.variables?.[name] ?? match) })),
  }) : selected;
  const swapped = Boolean(partner && roles?.length === 2
    && selected.speakers[0] === roles[1] && selected.speakers[1] === roles[0]);
  startDialogueTreeChat(swapped ? partner! : speaker, swapped ? speaker : partner,
    tree, mode === 'solo', request.durationHours);
  if (!request.treeId) {
    (speaker.dialogueRecentScenes ??= {})[historyKey] = { id: selected.id, tick };
  }
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
  tick: number,
  extra?: { expectingPartner?: boolean },
): { eventKey: DialogueEventKey; roles?: readonly string[] } {
  if (context === 'pregnant') {
    if (entity.pregnant) {
      if (!partner) {
        const eventKey = seededRandomForRun('pregnancy-solo:' + entity.id + ':' + tick) < 0.5
          ? 'ambient.pregnancy' : 'pregnancy.daily';
        return { eventKey, roles: ['expectant_mother'] };
      }
      if (entity.partnerId === partner.id && partner.partnerId === entity.id) {
        return { eventKey: 'pregnancy.daily', roles: ['expectant_mother', 'partner'] };
      }
      return { eventKey: 'pregnancy.daily', roles: ['expectant_mother', 'neighbor'] };
    }
    if (extra?.expectingPartner) {
      return {
        eventKey: 'pregnancy.daily',
        roles: partner?.pregnant ? ['partner', 'expectant_mother'] : ['partner'],
      };
    }
    return { eventKey: 'ambient.social' };
  }
  if (context === 'food' && options.foodLow) {
    return { eventKey: 'famine.hunger' };
  }
  if (context === 'home') {
    if (partner && entity.childrenIds?.includes(partner.id)) {
      return { eventKey: 'family.daily', roles: ['parent', 'child'] };
    }
    if (partner && partner.childrenIds?.includes(entity.id)) {
      return { eventKey: 'family.daily', roles: ['child', 'parent'] };
    }
    if (partner && entity.partnerId === partner.id && partner.partnerId === entity.id) {
      return { eventKey: 'family.daily', roles: ['partner_a', 'partner_b'] };
    }
    if (partner && entity.residenceBuildingId != null
      && entity.residenceBuildingId === partner.residenceBuildingId) {
      return { eventKey: 'family.daily', roles: ['housemate_a', 'housemate_b'] };
    }
    if (!partner && (entity.partnerId != null || (entity.childrenIds?.length ?? 0) > 0)) {
      return { eventKey: 'family.daily' };
    }
  }
  return { eventKey: `ambient.${context}` };
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
  extra?: { expectingPartner?: boolean },
): void {
  // Keep the same event eligibility and single seeded chance roll.
  if (isDialogueBusy(entity) || (partner && isDialogueBusy(partner))) return;
  if (seededRandomForRun(`chat-roll:${entity.id}:${tick}`) > chance) return;

  const content = contextualAmbientScene(entity, partner, context, options, tick, extra);
  requestDialogue({ ...content, speaker: entity, partner, tick });
}

/** Weighted pool of chat contexts — random pick, optional light bias from world state. */
export function pickRandomChatContext(
  entity: Pick<ChatSpeaker, 'isJuvenile' | 'id'>,
  tick: number,
  options: ChatPickOptions = {},
  extra?: {
    pregnant?: boolean;
    expectingPartner?: boolean;
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
  if (extra?.pregnant || extra?.expectingPartner) pool.push('pregnant');
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
    expectingPartner?: boolean;
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

  if (context === 'pregnant') {
    const spouse = nearbyCandidates.find((candidate) =>
      candidate.id === entity.partnerId && candidate.partnerId === entity.id
      && (entity.pregnant || candidate.pregnant) && !isDialogueBusy(candidate));
    if (spouse) partner = spouse;
    else if (extra?.expectingPartner && !entity.pregnant) partner = null;
  }
  maybeDialogueChat(entity, partner, context, tick, 1, options, extra);
}


// Eager install keeps the first worker/main-thread chat tick deterministic.
ensureDialogueBankFromBundle();