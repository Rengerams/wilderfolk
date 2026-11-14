import ambientDialogueJson from './data/dialogue/ambient.json' with { type: 'json' };
import spotlightPresentationJson from './data/dialogue/spotlight-lore.json' with { type: 'json' };

import { seededRandomForRun } from './simRng';
import { PER_TICK_RATE_SCALE, TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycleClock';
import { isDialogueBusy, startDialogueTreeChat, prepareScriptedDialogue, tickHumanChat, type ChatSpeaker, type HumanChatContext, type ChatPickOptions } from './humanChat';
export const DIALOGUE_CATEGORIES = ['dialogue'] as const;

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
  ambientDialogueJson as unknown as DialogueSourceFile,
];

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

/** Await the bundled dialogue bank; the static bundle is the only content source. */
export async function preloadDialogueBank(): Promise<void> {
  if (!ensureDialogueBankFromBundle()) {
    throw new Error('Dialogue bank failed to install from the bundled split sources');
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
 * Timed, presentation-only dialogue. Not an Entity chat session: the caller owns its wall clock,
 * actor mapping, pause/camera/skip and world state.
 */
export interface PresentationDialogueLine extends DialogueLine {
  readonly id?: string;
  readonly cue?: string;
  /** Optional authored wall-clock caption duration, not simulation ticks. */
  readonly durationMs?: number;
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
 * Parse presentation-owned JSON without importing it into an ambient-chat bank. Never touches
 * `chatPhrase`, `chatTicks`, the simulation clock or RNG; invalid content fails closed.
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
        || (line.id !== undefined && (typeof line.id !== 'string' || !line.id.trim()))
        || (line.cue !== undefined && (typeof line.cue !== 'string' || !line.cue.trim()))
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
          ...(line.id === undefined ? {} : { id: line.id }),
          ...(line.cue === undefined ? {} : { cue: line.cue }),
          ...(line.durationMs === undefined ? {} : { durationMs: line.durationMs }),
        }))),
      };
    }
  }
  if (!selected) throw new Error(`[dialogue] Missing presentation event key: ${eventKey}`);
  return Object.freeze(selected);
}

/**
 * Presentation catalog for the dialogue orchestrator. JSON sources belong here, never in UI code;
 * these scenes never schedule Entity chat sessions or mutate chat fields.
 */
const presentationScenesByEvent = new Map<string, PresentationDialogueScene>();
for (const raw of [spotlightPresentationJson]) {
  const source = raw as PresentationDialogueSource;
  if (!Array.isArray(source.dialogue_trees) || source.dialogue_trees.length === 0) {
    throw new Error('[dialogue] Presentation source has no scenes');
  }
  for (const tree of source.dialogue_trees) {
    if (typeof tree?.eventKey !== 'string' || presentationScenesByEvent.has(tree.eventKey)) {
      throw new Error('[dialogue] Invalid or duplicate presentation event key');
    }
    const scene = readPresentationDialogue(raw, tree.eventKey);
    presentationScenesByEvent.set(scene.eventKey, scene);
  }
}

/** Resolve authored, immutable group presentation content from the same dialogue owner. */
export function getPresentationDialogue(eventKey: string): PresentationDialogueScene {
  const scene = presentationScenesByEvent.get(eventKey);
  if (!scene) throw new Error(`[dialogue] Missing presentation event key: ${eventKey}`);
  return scene;
}

/**
 * Bind numbered presentation roles to 6–10 distinct, real gathered adults. Never invent an actor,
 * mutate gameplay fields, or consume RNG.
 */
export interface BoundPresentationDialogueLine extends PresentationDialogueLine {
  readonly speakerId: number;
}

const PRESENTATION_MIN_PERFORMERS = 6;
const PRESENTATION_MAX_PERFORMERS = 10;

export function bindNumberedPresentationSpeakers(
  presentation: PresentationDialogueScene,
  performerIds: readonly number[],
  heroineId?: number,
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
  const hasHeroine = presentation.speakers.at(-1) === 'heroine';
  if ((hasHeroine && (heroineId === undefined || !Number.isSafeInteger(heroineId)
    || heroineId < 1 || performerIds.includes(heroineId)))
    || (!hasHeroine && heroineId !== undefined)) {
    throw new Error('[dialogue] Invalid independent presentation heroine');
  }
  const roleToActor = new Map<string, number>();
  for (let i = 0; i < presentation.speakers.length; i++) {
    const role = presentation.speakers[i];
    if (role === 'heroine' && hasHeroine && i === presentation.speakers.length - 1) {
      roleToActor.set(role, heroineId!);
    } else if (role === `speaker_${i + 1}`) {
      roleToActor.set(role, performerIds[i % performerIds.length]!);
    } else {
      throw new Error('[dialogue] Numbered presentation speaker roles must be sequential');
    }
  }
  const bound = Object.freeze(presentation.lines.map((line) => {
    const speakerId = roleToActor.get(line.speaker);
    if (speakerId === undefined) throw new Error('[dialogue] Undeclared presentation speaker');
    return Object.freeze({ ...line, speakerId });
  }));
  if (new Set(bound.filter((line) => line.speaker !== 'heroine').map((line) => line.speakerId)).size !== performerIds.length) {
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

/** A settler keeps only this many distinct recent lines, so a silent settler's history stays bounded. */
const MAX_DIALOGUE_RECENT_LINES = 48;

function rememberDialogueLine(who: ChatSpeaker, key: string, tick: number): void {
  const recent = (who.dialogueRecentLines ??= {});
  recent[key] = tick;
  const keys = Object.keys(recent);
  if (keys.length <= MAX_DIALOGUE_RECENT_LINES) return;
  keys.sort((a, b) => (recent[a] ?? 0) - (recent[b] ?? 0));
  for (let index = 0; index < keys.length - MAX_DIALOGUE_RECENT_LINES; index++) {
    delete recent[keys[index]!];
  }
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
  const lineCooldownTicks = TICKS_PER_DAY * 3;
  const lineKey = (text: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const lineSpeakers = partner ? [speaker, partner] : [speaker];
  for (const who of lineSpeakers) {
    const recent = who.dialogueRecentLines;
    if (!recent) continue;
    for (const [key, at] of Object.entries(recent)) {
      if (tick - at >= lineCooldownTicks) delete recent[key];
    }
  }
  const whoSays = (tree: DialogueTree, line: DialogueLine): ChatSpeaker | null => {
    if (!partner) return speaker;
    const swappedForTree = Boolean(roles?.length === 2
      && tree.speakers[0] === roles[1] && tree.speakers[1] === roles[0]);
    return line.speaker === tree.speakers[0]
      ? (swappedForTree ? partner : speaker)
      : (swappedForTree ? speaker : partner);
  };
  const repeatsOwnLine = (tree: DialogueTree): boolean => tree.lines.some((line) => {
    const who = whoSays(tree, line);
    const at = who?.dialogueRecentLines?.[lineKey(line.text)];
    return at != null && tick - at < lineCooldownTicks;
  });
  let selectionPool = choices;
  if (!request.treeId && request.priority !== 'scripted') {
    const clean = choices.filter((tree) => !repeatsOwnLine(tree));
    if (clean.length === 0) return false;
    selectionPool = clean;
  }
  const last = speaker.dialogueRecentScenes?.[historyKey];
  const lastIndex = selectionPool.findIndex((scene) => scene.id === last?.id);
  const recentlySpoken = last && Number.isSafeInteger(last.tick) && tick >= last.tick
    && tick - last.tick < TICKS_PER_DAY * 3;
  if (!explicit && choices.length === 1 && request.priority !== 'scripted'
    && recentlySpoken) return false;
  const suppliedRoll = request.selectionRoll;
  const roll = typeof suppliedRoll === 'number' && Number.isFinite(suppliedRoll) ? suppliedRoll
    : (request.treeId ? 0
      : seededRandomForRun('dialogue-content:' + eventKey + ':' + speaker.id + ':' + (partner?.id ?? 0) + ':' + tick));
  const initialIndex = Math.max(0, Math.min(selectionPool.length - 1, Math.floor(roll * selectionPool.length)));
  const selected = explicit ?? selectionPool[lastIndex >= 0 && selectionPool.length > 1
    ? (lastIndex + 1) % selectionPool.length : initialIndex]!;
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
    const scene = { id: selected.id, tick };
    (speaker.dialogueRecentScenes ??= {})[historyKey] = scene;
    // The partner owns the same scene, so a per-person per-day scene gate must see it too.
    if (partner) (partner.dialogueRecentScenes ??= {})[historyKey] = scene;
  }
  for (const line of selected.lines) {
    const who = whoSays(selected, line);
    if (!who) continue;
    rememberDialogueLine(who, lineKey(line.text), tick);
  }
  return true;
}

/** Whether `who` already owns a scene from one of these event families on the colony day of `tick`. */
/**
 * Whether this speaker already had a scene today. `eventKeys` narrows the check to one event family;
 * omitted, any scene counts — a person gets one scene per colony day across every family.
 */
export function hasDialogueSceneOnDay(
  who: ChatSpeaker,
  tick: number,
  eventKeys?: readonly DialogueEventKey[],
): boolean {
  const scenes = who.dialogueRecentScenes;
  if (!scenes) return false;
  const day = Math.floor(tick / TICKS_PER_DAY);
  for (const [key, scene] of Object.entries(scenes)) {
    if (Math.floor(scene.tick / TICKS_PER_DAY) !== day) continue;
    if (eventKeys == null || eventKeys.some((eventKey) => key.startsWith(eventKey + ':'))) return true;
  }
  return false;
}

/** Pick an existing event context; use a specific scene only when its role requirements are met. */
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
  if (context === 'bad_weather') {
    // The weather scenes are authored solo; a companion falls back to ordinary social lines.
    if (partner) return { eventKey: 'ambient.social' };
    const kind = options.weather === 'storm' ? 'storm'
      : options.weather === 'snow' ? 'snow'
        : options.weather === 'drought' ? 'drought' : 'rain';
    return { eventKey: `social.impulse.bad_weather.${kind}` as const };
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
  if (options.weather === 'rain' || options.weather === 'storm') pool.push('bad_weather');
  return pool[Math.floor(seededRandomForRun(`chat-context:${entity.id}:${tick}`) * pool.length)]!;
}

/**
 * Ambient dialogue — random time and context, optional nearby partner.
 * @param chancePerTick raw chance this tick (e.g. 0.012 ≈ occasional chatter)
 * @param readNearbyCandidates read only after the chance roll fires; the scan is the caller's cost
 */
export function tryAmbientRandomDialogue(
  entity: ChatSpeaker,
  readNearbyCandidates: () => ChatSpeaker[],
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

  const nearbyCandidates = readNearbyCandidates();
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