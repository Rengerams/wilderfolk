import {
  getDialogueTreeById,
  pickDialogueTree,
  speakerRoleIndex,
  type DialogueTree,
} from './dialogueTrees';
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

export const CHAT_DEFAULT_DURATION_TICKS = 90;
export const DIALOGUE_LINE_BASE_TICKS = 75;
export const DIALOGUE_LINE_CHAR_TICKS = 1.8;
export const CHAT_BUBBLE_MAX_CHARS_PER_LINE = 38;
export const CHAT_BUBBLE_MAX_LINES = 3;

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
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === 0) return [text.slice(0, maxCharsPerLine)];
  return lines.slice(0, maxLines);
}

/** Flatten wrapped lines for storage in chatPhrase (renderer splits on newline). */
export function formatChatLine(line: string, speaker?: Pick<ChatSpeaker, 'name'>): string {
  const firstName = speaker?.name?.split(/\s+/)[0] ?? 'friend';
  const substituted = line.replace(/\{name\}/g, firstName);
  return wrapChatLines(substituted).join('\n');
}

export function ticksForDialogueLine(text: string): number {
  return Math.round(DIALOGUE_LINE_BASE_TICKS + text.length * DIALOGUE_LINE_CHAR_TICKS);
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
  if (entityA) {
    entityA.chatDialogueSessionKey = undefined;
    entityA.chatPartnerId = undefined;
    clearEntityChat(entityA);
  }
  if (entityB) {
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
  if (!session) return null;

  const partnerId = entity.chatPartnerId;
  const partner = partnerId != null ? resolvePartner(partnerId) ?? null : null;
  if (!session.solo && !partner) {
    clearDialogueSession(key, entity, partner ?? undefined);
    return null;
  }

  const self = entity;
  if (session.solo) return { session, self, partner: null };
  return { session, self, partner };
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
  const formatted = formatChatLine(line.text);

  if (solo || !entityB) {
    clearEntityChat(entityB ?? entityA);
    entityA.chatPhrase = formatted;
    entityA.chatTicks = ticks;
    return;
  }

  const role = speakerRoleIndex(tree, line);
  const active = role === 0 ? entityA : entityB;
  const idle = role === 0 ? entityB : entityA;
  clearEntityChat(idle);
  active.chatPhrase = formatChatLine(line.text, active);
  active.chatTicks = ticks;
}

export function startDialogueTreeChat(
  entityA: ChatSpeaker,
  entityB: ChatSpeaker | null,
  tree: DialogueTree,
  solo = false,
): void {
  if ((entityA.chatTicks ?? 0) > 0) return;
  if (entityB && (entityB.chatTicks ?? 0) > 0) return;

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

function advanceDialogue(
  entity: ChatSpeaker,
  resolvePartner: (id: number) => ChatSpeaker | null | undefined,
): boolean {
  const resolved = resolveSessionEntities(entity, resolvePartner);
  if (!resolved) return false;

  const { session, self, partner } = resolved;
  const tree = getDialogueTreeById(session.treeId);
  const sessionKey = self.chatDialogueSessionKey!;
  if (!tree) {
    clearDialogueSession(sessionKey, self, partner ?? undefined);
    return false;
  }

  const entityA = self.id === session.entityAId ? self : (partner ?? self);
  const entityB = session.solo ? null : (self.id === session.entityBId ? self : partner);

  const nextStep = session.step + 1;
  if (nextStep >= tree.lines.length) {
    clearDialogueSession(sessionKey, entityA, entityB ?? undefined);
    return true;
  }

  session.step = nextStep;
  showDialogueStep(tree, nextStep, entityA, entityB, session.solo);
  return true;
}

/** Force a specific line (e.g. rare world events, elections). */
export function sayHumanChatPhrase(
  entity: ChatSpeaker,
  phrase: string,
  durationTicks = 120,
): void {
  entity.chatDialogueSessionKey = undefined;
  entity.chatPartnerId = undefined;
  entity.chatPhrase = formatChatLine(phrase, entity);
  entity.chatTicks = durationTicks;
}

export function startHumanChat(
  entity: ChatSpeaker,
  context: HumanChatContext,
  entityId: number,
  tick: number,
  _durationTicks = CHAT_DEFAULT_DURATION_TICKS,
  options: ChatPickOptions = {},
  partner: ChatSpeaker | null = null,
): void {
  if ((entity.chatTicks ?? 0) > 0) return;
  const tree = pickDialogueTree(context, entityId, tick, options, options.avoidTreeId);
  if (!tree) return;
  startDialogueTreeChat(entity, partner, tree, partner == null);
}

export function tickHumanChat(
  entity: ChatSpeaker,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  if (!entity.chatTicks || entity.chatTicks <= 0) return;
  entity.chatTicks--;
  if (entity.chatTicks > 0) return;

  if (entity.chatDialogueSessionKey && resolvePartner) {
    const advanced = advanceDialogue(entity, resolvePartner);
    if (advanced) return;
  }

  clearEntityChat(entity);
}

export function maybeDialogueChat(
  entity: ChatSpeaker,
  partner: ChatSpeaker | null,
  context: HumanChatContext,
  tick: number,
  chance: number,
  options: ChatPickOptions = {},
): void {
  if ((entity.chatTicks ?? 0) > 0) return;
  if (partner && (partner.chatTicks ?? 0) > 0) return;
  if (Math.random() > chance) return;

  const tree = pickDialogueTree(context, entity.id, tick, options, options.avoidTreeId);
  if (!tree) return;
  startDialogueTreeChat(entity, partner, tree, partner == null);
}

export function maybeHumanChat(
  entity: ChatSpeaker,
  context: HumanChatContext,
  entityId: number,
  tick: number,
  chance: number,
  durationTicks = CHAT_DEFAULT_DURATION_TICKS,
  options: ChatPickOptions = {},
  partner: ChatSpeaker | null = null,
): void {
  maybeDialogueChat(entity, partner, context, tick, chance, options);
  void durationTicks;
  void entityId;
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

/** Pair chat bubbles between settlers sharing a home. */
export function maybeHousemateChat(
  entity: ChatSpeaker,
  housemates: ChatSpeaker[],
  tick: number,
  chance: number,
  _durationTicks = 95,
  options: ChatPickOptions = {},
): void {
  if ((entity.chatTicks ?? 0) > 0) return;
  const others = housemates.filter((h) => h.id !== entity.id);
  if (others.length === 0) {
    maybeDialogueChat(entity, null, housemateChatContext(entity, null, options), tick, chance * 0.6, options);
    return;
  }
  if (Math.random() > chance) return;
  const mate = others[(entity.id + Math.floor(tick / 40)) % others.length]!;
  maybeDialogueChat(entity, mate, housemateChatContext(entity, mate, options), tick, 1, options);
}

/** @deprecated Use dialogue trees via maybeDialogueChat */
export function startPairedHumanChat(
  speaker: ChatSpeaker,
  listener: ChatSpeaker,
  pair: readonly [string, string],
  _tick: number,
  durationTicks = CHAT_DEFAULT_DURATION_TICKS,
): void {
  sayHumanChatPhrase(speaker, pair[0], durationTicks);
  sayHumanChatPhrase(listener, pair[1], durationTicks);
}

/** @deprecated Dialogue trees replace static pairs */
export function pickCourtshipPair(_entityId: number, _tick: number): readonly [string, string] {
  return ['Walk with me?', 'Gladly.'];
}

/** @deprecated Dialogue trees drive phrase selection */
export function pickChatPhrase(
  context: HumanChatContext,
  entityId: number,
  tick: number,
  options: ChatPickOptions = {},
): string {
  const tree = pickDialogueTree(context, entityId, tick, options);
  return tree?.lines[0]?.text ?? '…';
}

export function truncateChatForBubble(text: string, maxChars = CHAT_BUBBLE_MAX_CHARS_PER_LINE): string {
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
  if (entity.chatPhrase) return entity.chatPhrase;
  return getAnimatedChatDots(tick, entity.id);
}

export function resetDialogueSessions(): void {
  dialogueSessions.clear();
}