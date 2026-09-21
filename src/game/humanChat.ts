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
/** A spoken tree line remains visible for roughly 2.5–5 game hours. */
export const DIALOGUE_LINE_BASE_HOURS = 2.5;
export const DIALOGUE_LINE_CHAR_HOURS = 0.08;
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
    // If adding this word exceeds the line limit, push the current line
    if (current && (current.length + 1 + word.length > maxCharsPerLine)) {
      lines.push(current);
      if (lines.length >= maxLines) {
        // We've hit the max lines, append ellipsis to the last added line
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = last.slice(0, maxCharsPerLine - 1) + '…';
        return lines;
      }
      current = word;
    } else {
      // Add to current line
      current = current ? `${current} ${word}` : word;
    }
  }

  // Push any remaining text
  if (current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      // If we already have maxLines, append to the last one with ellipsis
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.slice(0, maxCharsPerLine - 1) + '…';
    }
  }

  return lines.length > 0 ? lines : ['…'];
}

/** Flatten wrapped lines for storage in chatPhrase (renderer splits on newline). */
export function formatChatLine(line: string, speaker?: Pick<ChatSpeaker, 'name'>): string {
  const firstName = speaker?.name?.split(/\s+/)[0] ?? 'friend';
  const substituted = line.replace(/\{name\}/g, firstName);
  return wrapChatLines(substituted).join('\n');
}

export function ticksForDialogueLine(text: string): number {
  const durationHours = DIALOGUE_LINE_BASE_HOURS + text.length * DIALOGUE_LINE_CHAR_HOURS;
  return Math.max(TICKS_PER_HOUR, Math.round(durationHours * TICKS_PER_HOUR));
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

/**
 * Drop whatever dialogue session this settler holds, leaving the counterpart to be reclaimed.
 *
 * Called when a settler stops being ticked. `tickHumanChat` runs only for
 * `byType[EntityType.Human]`, so an entity that leaves that population can no longer advance its
 * session: a pair mid-dialogue whose active half transforms into a Moon Howler froze for the night
 * (`moonHowler.ts` sets `type = EntityType.Werewolf`), because the wolf's `chatTicks` stopped
 * decrementing while the idle half stayed `isDialogueBusy`. The idle half could not self-heal —
 * the session entry is *live*, so the orphan reclaim below cannot see it, and its own `chatTicks`
 * are already 0 so it never reaches `advanceDialogue` (2026-09-20 audit, F-chat-1 residual).
 *
 * No partner resolver is needed here: deleting the entry is enough. The survivor's key becomes an
 * orphan and the hoisted reclaim releases it on that settler's next tick — the same net that already
 * covers the resolver-less `sayHumanChatPhrase` path.
 */
export function releaseDialogueSession(entity: ChatSpeaker): void {
  const key = entity.chatDialogueSessionKey;
  if (!key) return;
  clearDialogueSession(key, entity);
}

function clearDialogueSession(key: string, entityA?: ChatSpeaker, entityB?: ChatSpeaker): void {
  dialogueSessions.delete(key);
  if (entityA) {
    // Only clear if this entity is actually part of this specific session
    if (entityA.chatDialogueSessionKey === key) {
      entityA.chatDialogueSessionKey = undefined;
      entityA.chatPartnerId = undefined;
      clearEntityChat(entityA);
    }
  }
  if (entityB) {
    if (entityB.chatDialogueSessionKey === key) {
      entityB.chatDialogueSessionKey = undefined;
      entityB.chatPartnerId = undefined;
      clearEntityChat(entityB);
    }
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
  
  // If non-solo and partner is missing, clean up
  if (!session.solo && !partner) {
    clearDialogueSession(key, entity, undefined);
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
  
  // Clear the idle participant so they don't show two bubbles
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
  // `isDialogueBusy`, not a raw `chatTicks` read: a participant is busy while either a visible line
  // *or* a paired session is live, and `showDialogueStep` clears the idle half's line while keeping its
  // session key. The raw test therefore read the idle half as free, and `entityB.chatDialogueSessionKey
  // = key` below overwrote an in-flight partner's key — one settler speaking two dialogue trees at once
  // while the old session entry stayed live (2026-09-20 audit, F-chat-2). `isDialogueBusy` is the
  // contract `tests/socialLife.dialogueBusy.test.ts` pins.
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
  
  if (!tree) {
    clearDialogueSession(sessionKey, self, partner ?? undefined);
    return false;
  }

  if (!session.solo && !partner) {
    clearDialogueSession(sessionKey, self, undefined);
    return false;
  }

  const entityA = resolveSessionSpeaker(session.entityAId, self, partner) ?? self;
  const entityB = session.solo
    ? null
    : resolveSessionSpeaker(session.entityBId, self, partner);
    
  if (!session.solo && !entityB) {
    clearDialogueSession(sessionKey, entityA, undefined);
    return false;
  }

  const nextStep = session.step + 1;
  if (nextStep >= tree.lines.length) {
    clearDialogueSession(sessionKey, entityA, entityB ?? undefined);
    return true;
  }

  session.step = nextStep;
  showDialogueStep(tree, nextStep, entityA, entityB, session.solo);
  return true;
}

/**
 * Force a specific line (e.g. rare world events, elections).
 *
 * A forced phrase abandons whatever dialogue session this settler held, and the **counterpart must be
 * released with it**: the session map entry is what `isDialogueBusy` reads, so deleting the entry while
 * leaving the partner's key behind stranded that settler as dialogue-busy on a session nobody owns
 * (2026-09-20 audit, F-chat-1). `resolvePartner` is how the other half is reached; without it the
 * orphan is caught by `tickHumanChat`'s hoisted reclaim instead of never.
 */
export function sayHumanChatPhrase(
  entity: ChatSpeaker,
  phrase: string,
  legacyDurationTicks = 120,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  const staleKey = entity.chatDialogueSessionKey;
  if (staleKey) {
    const session = dialogueSessions.get(staleKey);
    const counterpartId = session
      ? (session.entityAId === entity.id ? session.entityBId : session.entityAId)
      : entity.chatPartnerId;
    const counterpart = counterpartId != null ? resolvePartner?.(counterpartId) ?? undefined : undefined;
    // `clearDialogueSession` deletes the entry *and* releases whichever halves it is handed.
    clearDialogueSession(staleKey, entity, counterpart);
  }
  entity.chatDialogueSessionKey = undefined;
  entity.chatPartnerId = undefined;
  entity.chatPhrase = formatChatLine(phrase, entity);
  entity.chatTicks = activeChatTicksFromLegacyDuration(legacyDurationTicks);
}

export function tickHumanChat(
  entity: ChatSpeaker,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  // Reclaim an orphaned session key FIRST, before the visible-line gate below.
  //
  // The key is what `isDialogueBusy` reads, and the only place it used to be released sat behind
  // `if (!entity.chatTicks) return;` — unreachable for the *idle* half of a pair, whose visible line
  // was already cleared by `showDialogueStep`. `resetDialogueSessions()` empties the map on every
  // renderer-cache reset (boot, and every session swap), so a save/load during a paired dialogue
  // stranded that settler: `resolveSessionEntities` returns null on a missing entry, so it could never
  // advance, and it stayed excluded from greetings, workplace banter and ambient pairing until it
  // happened to speak a solo line (2026-09-20 audit, F-chat-1).
  const orphanKey = entity.chatDialogueSessionKey;
  if (orphanKey && !dialogueSessions.has(orphanKey)) {
    entity.chatDialogueSessionKey = undefined;
    entity.chatPartnerId = undefined;
    clearEntityChat(entity);
    return;
  }

  if (!entity.chatTicks || entity.chatTicks <= 0) return;
  entity.chatTicks--;
  if (entity.chatTicks > 0) return;

  if (entity.chatDialogueSessionKey) {
    const advanced = resolvePartner ? advanceDialogue(entity, resolvePartner) : false;
    if (advanced) return;
    // `advanceDialogue` returning false means the session is gone (a forced phrase reclaimed it, or the
    // partner vanished). Release both halves, not just this one.
    const goneKey = entity.chatDialogueSessionKey;
    if (!dialogueSessions.has(goneKey)) {
      const partnerId = entity.chatPartnerId;
      const counterpart = partnerId != null ? resolvePartner?.(partnerId) ?? undefined : undefined;
      clearDialogueSession(goneKey, entity, counterpart);
      if (counterpart) clearEntityChat(counterpart);
    }
  }

  clearEntityChat(entity);
}

/**
 * Ends an ordinary (non-dialogue) chat because the settler has gone home for the
 * night. Returns true when something was actually cleared.
 *
 * A scripted dialogue session is deliberately left alone: the dialogue tree owns it,
 * not the sleep schedule, and ending it here would cut a story beat mid-line. Only the
 * ambient chatter — which used to follow a settler indoors and put a speech bubble over
 * somebody in bed — is stopped.
 */
export function endAmbientHumanChat(entity: ChatSpeaker): boolean {
  if (entity.chatDialogueSessionKey) return false;
  if ((entity.chatTicks ?? 0) <= 0 && entity.chatPhrase == null) return false;
  clearEntityChat(entity);
  entity.chatPartnerId = undefined;
  return true;
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
  // See `startDialogueTreeChat`: the busy test is the owner predicate, not the visible-line counter
  // (2026-09-20 audit, F-chat-2).
  if (isDialogueBusy(entity)) return;
  if (partner && isDialogueBusy(partner)) return;
  if (seededRandomForRun(`chat-roll:${entity.id}:${tick}`) > chance) return;

  if (!isDialogueBankReady()) ensureDialogueBankFromBundle();

  const tree = pickDialogueTree(context, entity.id, tick, options);
  if (tree) {
    startDialogueTreeChat(entity, partner, tree, partner == null);
    return;
  }

  // Bank missing or empty — short emergency lines only (should be rare).
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
  // (2026-09-20 audit, F-chat-2).
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
  // Prefer stored tree line; only animate dots if phrase was lost in transfer.
  const phrase = entity.chatPhrase?.trim();
  if (phrase) return phrase;
  return getAnimatedChatDots(tick, entity.id);
}

export function resetDialogueSessions(): void {
  dialogueSessions.clear();
}

/**
 * Remove a dead/despawned entity's dialogue session and clear its chat state.
 *
 * The counterpart is released explicitly when a resolver is supplied. The old comment here claimed the
 * partner's "next tick … clean itself up" — that was false for the idle half, whose `chatTicks` is 0, so
 * `tickHumanChat` returned before it could reclaim anything and the survivor stayed dialogue-busy on a
 * session with no owner (2026-09-20 audit, F-chat-1). The hoisted reclaim there now catches the case
 * even without a resolver; passing one releases the partner immediately instead of a tick later.
 */
export function cleanupEntityDialogueState(
  entity: ChatSpeaker,
  resolvePartner?: (id: number) => ChatSpeaker | null | undefined,
): void {
  const key = entity.chatDialogueSessionKey;
  if (key) {
    const session = dialogueSessions.get(key);
    const counterpartId = session
      ? (session.entityAId === entity.id ? session.entityBId : session.entityAId)
      : entity.chatPartnerId;
    const counterpart =
      counterpartId != null ? resolvePartner?.(counterpartId) ?? undefined : undefined;
    clearDialogueSession(key, entity, counterpart);
    if (counterpart) clearEntityChat(counterpart);
  }
  entity.chatDialogueSessionKey = undefined;
  entity.chatPartnerId = undefined;
  clearEntityChat(entity);
}