import { seededRandomForRun } from './simRng';
import {
  ensureDialogueBankFromBundle,
  getDialogueTreeById,
  isDialogueBankReady,
  pickDialogueTree,
  speakerRoleIndex,
  type DialogueTree,
} from './dialogueTrees';
import { PER_TICK_RATE_SCALE, TICKS_PER_HOUR } from './dayCycleClock';
import type { Season, WeatherType } from './gameTypes';

export type HumanChatContext =
  | 'social'
  | 'home'
  | 'courtship'
  | 'work'
  | 'visitor'
  | 'rival'
  | 'hunt'
  | 'child'
  | 'school'
  | 'pregnant'
  | 'affair'
  | 'sleep'
  | 'renffr'
  | 'fear'
  | 'winter'
  | 'festival'
  | 'guard'
  | 'food'
  | 'election';

export interface ChatPickOptions {
  season?: Season;
  weather?: WeatherType;
  festivalActive?: boolean;
  foodLow?: boolean;
  avoidTreeId?: string;
}

export interface ChatWorldHints {
  season?: Season;
  weather?: WeatherType;
  festivalActive?: boolean;
  food?: number;
}

export type ChatSpeaker = {
  id: number;
  chatPhrase?: string;
  chatTicks?: number;
  chatPartnerId?: number;
  chatDialogueSessionKey?: string;
  isJuvenile?: boolean;
  name?: string;
};

/** A participant is busy while either a visible line or paired dialogue session is active. */
export function isDialogueBusy(entity: Pick<ChatSpeaker, 'chatTicks' | 'chatDialogueSessionKey'>): boolean {
  return (entity.chatTicks ?? 0) > 0 || entity.chatDialogueSessionKey != null;
}

/** Legacy display duration from the 24-tick day; converted at the chat boundary. */
export const CHAT_DEFAULT_DURATION_LEGACY_TICKS = 90;

/** Scaled duration: ~1–2.5 in-game hours per line to prevent multi-day conversations. */
export const DIALOGUE_LINE_BASE_HOURS = 1.0;
export const DIALOGUE_LINE_CHAR_HOURS = 0.04;
export const CHAT_BUBBLE_MAX_CHARS_PER_LINE = 38;
export const CHAT_BUBBLE_MAX_LINES = 3;

const DEFAULT_FALLBACK_LINES = ['Lovely weather.', 'Good to see friendly faces.', 'The village grows every season.'];

const FALLBACK_CHAT_LINES: Partial<Record<HumanChatContext, string[]>> = {
  social: DEFAULT_FALLBACK_LINES,
  home: ['Home at last.', 'Pass the stew?', 'Quiet night in.'],
  work: ['Back to it.', 'Tools need sharpening.', 'Steady hands today.'],
  courtship: ['You have a kind smile.', 'Walk with me?', 'The stars are bright.'],
  child: ['Tag, you\'re it!', 'Can we play outside?', 'Story time?'],
  food: ['Stores are thin.', 'Who\'s cooking tonight?', 'We need more grain.'],
  winter: ['Wood pile\'s low.', 'Frost on the roof.', 'Stay warm, friend.'],
};

interface DialogueSession {
  treeId: string;
  step: number;
  entityAId: number;
  entityBId: number;
  solo: boolean;
}

const dialogueSessions = new Map<string, DialogueSession>();

export function chatHintsFromWorld(world: ChatWorldHints): ChatPickOptions {
  return {
    season: world.season,
    weather: world.weather,
    festivalActive: world.festivalActive,
    foodLow: (world.food ?? 99) < 12,
  };
}

export function wrapChatLines(
  text: string,
  maxCharsPerLine = CHAT_BUBBLE_MAX_CHARS_PER_LINE,
  maxLines = CHAT_BUBBLE_MAX_LINES,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['…'];

  const lines: string[] = [];
  let current = '';
  
  for (const word of words) {
    if (current && (current.length + 1 + word.length > maxCharsPerLine)) {
      lines.push(current);
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1]!;
        lines[lines.length - 1] = last.slice(0, maxCharsPerLine - 1) + '…';
        return lines;
      }
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      const last = lines[lines.length - 1]!;
      lines[lines.length - 1] = last.slice(0, maxCharsPerLine - 1) + '…';
    }
  }

  return lines.length > 0 ? lines : ['…'];
}

/** Flatten wrapped lines for storage in chatPhrase ({speaker} = self, {name}/{target} = addressee). */
export function formatChatLine(
  line: string,
  speaker?: Pick<ChatSpeaker, 'name'>,
  listener?: Pick<ChatSpeaker, 'name'>,
): string {
  const speakerName = speaker?.name?.split(/\s+/)[0] ?? 'friend';
  const targetName = listener?.name?.split(/\s+/)[0] ?? 'friend';
  const substituted = line
    .replace(/\{speaker\}/g, speakerName)
    .replace(/\{name\}|\{target\}/g, targetName);
  return wrapChatLines(substituted).join('\n');
}

export function ticksForDialogueLine(text: string): number {
  const durationHours = DIALOGUE_LINE_BASE_HOURS + text.length * DIALOGUE_LINE_CHAR_HOURS;
  return Math.max(1, Math.round(durationHours * TICKS_PER_HOUR));
}

function activeChatTicksFromLegacyDuration(legacyTicks: number): number {
  return Math.max(1, Math.round(legacyTicks * PER_TICK_RATE_SCALE));
}

function sessionKeyFor(aId: number, bId: number): string {
  const lo = Math.min(aId, bId);
  const hi = Math.max(aId, bId);
  return `${lo}:${hi}`;
}

function clearEntityChat(entity: ChatSpeaker): void {
  entity.chatTicks = undefined;
  entity.chatPhrase = undefined;
}

function clearDialogueSession(key: string, entityA?: ChatSpeaker, entityB?: ChatSpeaker): void {
  dialogueSessions.delete(key);
  if (entityA && entityA.chatDialogueSessionKey === key) {
    entityA.chatDialogueSessionKey = undefined;
    entityA.chatPartnerId = undefined;
    clearEntityChat(entityA);
  }
  if (entityB && entityB.chatDialogueSessionKey === key) {
    entityB.chatDialogueSessionKey = undefined;
    entityB.chatPartnerId = undefined;
    clearEntityChat(entityB);
  }
}

function resolveSessionEntities(
  entity: ChatSpeaker,
  resolvePartner: (id: number) => ChatSpeaker | null | undefined,
): { session: DialogueSession; self: ChatSpeaker; partner: ChatSpeaker | null } | null {
  const key = entity.chatDialogueSessionKey;
  if (!key) return null;
  
  const session = dialogueSessions.get(key);
  if (!session) {
    // Session is orphaned, scrub the entity immediately
    entity.chatDialogueSessionKey = undefined;
    entity.chatPartnerId = undefined;
    clearEntityChat(entity);
    return null;
  }

  const partnerId = entity.chatPartnerId;
  const partner = partnerId != null ? resolvePartner(partnerId) ?? null : null;
  
  // Partner missing/despawned mid-session: abort exchange and free the survivor
  if (!session.solo && !partner) {
    clearDialogueSession(key, entity, undefined);
    return null;
  }

  return { session, self: entity, partner: session.solo ? null : partner };
}

function showDialogueStep(
  tree: DialogueTree,
  step: number,
  entityA: ChatSpeaker,
  entityB: ChatSpeaker | null,
  solo: boolean,
): void {
  const line = tree.lines[step];
  if (!line) return;

  const ticks = ticksForDialogueLine(line.text);

  if (solo || !entityB) {
    clearEntityChat(entityA);
    entityA.chatPhrase = formatChatLine(line.text, entityA, undefined);
    entityA.chatTicks = ticks;
    return;
  }

  const role = speakerRoleIndex(tree, line);
  const active = role === 0 ? entityA : entityB;
  const idle = role === 0 ? entityB : entityA;
  
  clearEntityChat(idle);
  active.chatPhrase = formatChatLine(line.text, active, idle);
  active.chatTicks = ticks;
}

export function startDialogueTreeChat(
  entityA: ChatSpeaker,
  entityB: ChatSpeaker | null,
  tree: DialogueTree,
  solo = false,
): void {
  if (isDialogueBusy(entityA)) return;
  if (!solo && entityB && isDialogueBusy(entityB)) return;

  const key = solo || !entityB
    ? `solo:${entityA.id}`
    : sessionKeyFor(entityA.id, entityB.id);

  if (dialogueSessions.has(key)) return;

  dialogueSessions.set(key, {
    treeId: tree.id,
    step: 0,
    entityAId: entityA.id,
    entityBId: entityB?.id ?? entityA.id,
    solo: solo || !entityB,
  });

  entityA.chatDialogueSessionKey = key;
  entityA.chatPartnerId = entityB?.id;
  if (entityB) {
    entityB.chatDialogueSessionKey = key;
    entityB.chatPartnerId = entityA.id;
  }

  showDialogueStep(tree, 0, entityA, entityB, solo || !entityB);
}

function resolveSessionSpeaker(
  entityId: number,
  self: ChatSpeaker,
  partner: ChatSpeaker | null,
): ChatSpeaker | null {
  if (self.id === entityId) return self;
  if (partner?.id === entityId) return partner;
  return null;
}

function advanceDialogue(
  entity: ChatSpeaker,
  resolvePartner: (id: number) => ChatSpeaker | null | undefined,
): boolean {
  const resolved = resolveSessionEntities(entity, resolvePartner);
  if (!resolved) return false;

  const { session, self, partner } = resolved;
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  const tree = getDialogueTreeById(session.treeId);
  const sessionKey = self.chatDialogueSessionKey!;
  
  if (!tree || (!session.solo && !partner)) {
    clearDialogueSession(sessionKey, self, partner ?? undefined);
    return false;
  }

  const entityA = resolveSessionSpeaker(session.entityAId, self, partner) ?? self;
  const entityB = session.solo ? null : resolveSessionSpeaker(session.entityBId, self, partner);
    
  if (!session.solo && !entityB) {
    clearDialogueSession(sessionKey, entityA, undefined);
    return false;
  }

  let nextStep = session.step + 1;

  // Fast-forward over partner lines if speaking solo to prevent dual-persona monologues
  if (session.solo) {
    while (nextStep < tree.lines.length && speakerRoleIndex(tree, tree.lines[nextStep]!) !== 0) {
      nextStep++;
    }
  }

  if (nextStep >= tree.lines.length) {
    clearDialogueSession(sessionKey, entityA, entityB ?? undefined);
    return true;
  }

  session.step = nextStep;
  showDialogueStep(tree, nextStep, entityA, entityB, session.solo);
  return true;
}

export function sayHumanChatPhrase(
  entity: ChatSpeaker,
  phrase: string,
  legacyDurationTicks = CHAT_DEFAULT_DURATION_LEGACY_TICKS,
): void {
  entity.chatDialogueSessionKey = undefined;
  entity.chatPartnerId = undefined;
  entity.chatPhrase = formatChatLine(phrase, entity);
  entity.chatTicks = activeChatTicksFromLegacyDuration(legacyDurationTicks);
}

export function startHumanChat(
  entity: ChatSpeaker,
  context: HumanChatContext,
  entityId: number,
  tick: number,
  _legacyDurationTicks = CHAT_DEFAULT_DURATION_LEGACY_TICKS,
  options: ChatPickOptions = {},
  partner: ChatSpeaker | null = null,
): void {
  if (isDialogueBusy(entity)) return;
  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();
  const tree = pickDialogueTree(context, entityId, tick, options, options.avoidTreeId);
  if (!tree) return;
  startDialogueTreeChat(entity, partner, tree, partner == null);
}

export function tickHumanChat(
  entity: ChatSpeaker,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  // Idle sweep: Unstick entity if its timer expired but it holds an orphaned session
  if (!entity.chatTicks || entity.chatTicks <= 0) {
    if (entity.chatDialogueSessionKey) {
      const session = dialogueSessions.get(entity.chatDialogueSessionKey);
      if (!session) {
        entity.chatDialogueSessionKey = undefined;
        entity.chatPartnerId = undefined;
        clearEntityChat(entity);
      }
    }
    return;
  }

  entity.chatTicks--;
  if (entity.chatTicks > 0) return;

  if (entity.chatDialogueSessionKey) {
    if (resolvePartner) {
      const advanced = advanceDialogue(entity, resolvePartner);
      if (advanced) return;
    } else {
      // Abort session if partner cannot be resolved
      clearDialogueSession(entity.chatDialogueSessionKey, entity, undefined);
    }
  }

  clearEntityChat(entity);
}

let warnedMissingBank = false;

export function maybeDialogueChat(
  entity: ChatSpeaker,
  partner: ChatSpeaker | null,
  context: HumanChatContext,
  tick: number,
  chance: number,
  options: ChatPickOptions = {},
): void {
  if (isDialogueBusy(entity)) return;
  if (partner && isDialogueBusy(partner)) return;
  if (seededRandomForRun(`chat-roll:${entity.id}:${tick}`) > chance) return;

  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();

  const tree = pickDialogueTree(context, entity.id, tick, options, options.avoidTreeId);
  if (tree) {
    startDialogueTreeChat(entity, partner, tree, partner == null);
    return;
  }

  if (!warnedMissingBank) {
    warnedMissingBank = true;
    console.warn('[chat] Dialogue bank empty — using fallback phrases (split dialogue files not loaded)');
  }
  const fallback = FALLBACK_CHAT_LINES[context] ?? DEFAULT_FALLBACK_LINES;
  const phrase = fallback[(entity.id + tick) % fallback.length]!;
  sayHumanChatPhrase(entity, phrase, CHAT_DEFAULT_DURATION_LEGACY_TICKS);
  if (partner) {
    const reply = fallback[(entity.id + tick + 1) % fallback.length]!;
    sayHumanChatPhrase(partner, reply, CHAT_DEFAULT_DURATION_LEGACY_TICKS);
  }
}

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
  const pool: HumanChatContext[] = [
    'social', 'social', 'social', 'social',
    'work', 'work',
    'home', 'home',
  ];
  if (options.foodLow) pool.push('food', 'food');
  if (options.festivalActive) pool.push('festival', 'festival');
  if (entity.isJuvenile) pool.push('child', 'child', 'school');
  if (extra?.pregnant) pool.push('pregnant');
  if (extra?.renffr) pool.push('renffr', 'renffr');
  if (extra?.workHour) pool.push('work', 'work');
  if (extra?.night) pool.push('home', 'sleep', 'sleep');
  
  // Non-clear weather routes to environment chatter
  if (options.weather && options.weather !== 'clear') {
    pool.push('winter', 'winter');
  }

  return pool[Math.floor(seededRandomForRun(`chat-context:${entity.id}:${tick}`) * pool.length)]!;
}

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
  if (isDialogueBusy(entity)) return;
  if (seededRandomForRun(`chat-ambient:${entity.id}:${tick}`) > chancePerTick) return;

  const context = pickRandomChatContext(entity, tick, options, extra);
  
  let partner: ChatSpeaker | null = null;
  if (nearbyCandidates.length > 0) {
    let attempts = 0;
    const maxAttempts = Math.min(nearbyCandidates.length, 5);
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

function maybeHumanChat(
  entity: ChatSpeaker,
  context: HumanChatContext,
  _entityId: number,
  tick: number,
  chance: number,
  _legacyDurationTicks = CHAT_DEFAULT_DURATION_LEGACY_TICKS,
  options: ChatPickOptions = {},
  partner: ChatSpeaker | null = null,
): void {
  maybeDialogueChat(entity, partner, context, tick, chance, options);
}

function housemateChatContext(
  entity: ChatSpeaker,
  mate: ChatSpeaker | null,
  options: ChatPickOptions,
): HumanChatContext {
  if (options.foodLow) return 'food';
  if (entity.isJuvenile || mate?.isJuvenile) return 'child';
  return 'home';
}

function maybeHousemateChat(
  entity: ChatSpeaker,
  housemates: ChatSpeaker[],
  tick: number,
  chance: number,
  _durationTicks = 95,
  options: ChatPickOptions = {},
): void {
  if (isDialogueBusy(entity)) return;
  const others = housemates.filter((h) => h.id !== entity.id);
  if (others.length === 0) {
    maybeDialogueChat(entity, null, housemateChatContext(entity, null, options), tick, chance * 0.6, options);
    return;
  }
  if (seededRandomForRun(`chat-home:${entity.id}:${tick}`) > chance) return;
  
  const mate = others[(entity.id + Math.floor(tick / 40)) % others.length]!;
  if (isDialogueBusy(mate)) return;

  maybeDialogueChat(entity, mate, housemateChatContext(entity, mate, options), tick, 1, options);
}

function startPairedHumanChat(
  speaker: ChatSpeaker,
  listener: ChatSpeaker,
  pair: readonly [string, string],
  _tick: number,
  legacyDurationTicks = CHAT_DEFAULT_DURATION_LEGACY_TICKS,
): void {
  sayHumanChatPhrase(speaker, pair[0], legacyDurationTicks);
  sayHumanChatPhrase(listener, pair[1], legacyDurationTicks);
}

function pickCourtshipPair(_entityId: number, _tick: number): readonly [string, string] {
  return ['Walk with me?', 'Gladly.'];
}

function pickChatPhrase(
  context: HumanChatContext,
  entityId: number,
  tick: number,
  options: ChatPickOptions = {},
): string {
  const tree = pickDialogueTree(context, entityId, tick, options);
  return tree?.lines[0]?.text ?? '…';
}

function truncateChatForBubble(text: string, maxChars = CHAT_BUBBLE_MAX_CHARS_PER_LINE): string {
  const lines = wrapChatLines(text, maxChars, 1);
  return lines[0] ?? '…';
}

export function getAnimatedChatDots(tick: number, entityId: number): string {
  const phase = (Math.floor(tick / 4) + entityId) % 3;
  return '.'.repeat(phase + 1);
}

export function getChatBubbleText(
  entity: Pick<ChatSpeaker, 'chatPhrase' | 'chatTicks' | 'id'>,
  tick: number,
): string {
  const talking = (entity.chatTicks ?? 0) > 0;
  if (!talking) return '';
  const phrase = entity.chatPhrase?.trim();
  if (phrase) return phrase;
  return getAnimatedChatDots(tick, entity.id);
}

export function resetDialogueSessions(): void {
  dialogueSessions.clear();
}

export function cleanupEntityDialogueState(entity: ChatSpeaker): void {
  const key = entity.chatDialogueSessionKey;
  if (key) {
    dialogueSessions.delete(key);
  }
  entity.chatDialogueSessionKey = undefined;
  entity.chatPartnerId = undefined;
  clearEntityChat(entity);
}