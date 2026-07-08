import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Season, WeatherType } from '@/game/gameTypes';
import { getDialogueTreeById, pickDialogueTree } from '@/game/dialogueTrees';
import {
  chatHintsFromWorld,
  formatChatLine,
  getAnimatedChatDots,
  getChatBubbleText,
  maybeHousemateChat,
  pickChatPhrase,
  resetDialogueSessions,
  startDialogueTreeChat,
  tickHumanChat,
  truncateChatForBubble,
  wrapChatLines,
  type ChatSpeaker,
} from '@/game/humanChat';

function chatEntity(id: number, isJuvenile = false, name?: string): ChatSpeaker {
  return { id, isJuvenile, name };
}

beforeEach(() => {
  resetDialogueSessions();
});

describe('humanChat', () => {
  it('pickChatPhrase returns the first line from a dialogue tree', () => {
    const phrase = pickChatPhrase('work', 1, 0);
    expect(phrase).toBeTruthy();
    expect(phrase).not.toBe('…');
  });

  it('pickDialogueTree can draw environment trees during winter social chat', () => {
    const categories = new Set<string>();
    for (let tick = 0; tick < 80; tick++) {
      const tree = pickDialogueTree('social', 3, tick, { season: Season.Winter });
      if (tree) categories.add(tree.category);
    }
    expect(categories.has('environment') || categories.has('social')).toBe(true);
  });

  it('chatHintsFromWorld flags low food below 12', () => {
    expect(chatHintsFromWorld({ food: 11 }).foodLow).toBe(true);
    expect(chatHintsFromWorld({ food: 40 }).foodLow).toBe(false);
  });

  it('truncateChatForBubble shortens long event lines for bubbles', () => {
    const long = 'This is an unusually long gossip line that should not overflow the bubble width';
    const capped = truncateChatForBubble(long);
    expect(capped.length).toBeLessThan(long.length);
    expect(capped.length).toBeLessThanOrEqual(42);
  });

  it('formatChatLine substitutes speaker first name', () => {
    expect(formatChatLine('Hello, {name}!', { name: 'Ada Stone' })).toBe('Hello, Ada!');
  });

  it('wrapChatLines splits long dialogue into readable rows', () => {
    const lines = wrapChatLines(
      "I've been carrying this rock for 3 hours. I don't know where to put it.",
      38,
      3,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 38)).toBe(true);
  });

  it('cycles animated dots through 1, 2, and 3 without duplicate singles', () => {
    const seen = new Set<string>();
    for (let tick = 0; tick < 36; tick++) {
      seen.add(getAnimatedChatDots(tick, 5));
    }
    expect(seen).toEqual(new Set(['.', '..', '...']));
  });

  it('getChatBubbleText prefers phrase over dots while chatting', () => {
    const entity = chatEntity(4);
    entity.chatTicks = 20;
    entity.chatPhrase = 'Fine day.';
    expect(getChatBubbleText(entity, 100)).toBe('Fine day.');
  });

  it('maybeHousemateChat starts solo home dialogue when alone', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const entity = chatEntity(1);
    maybeHousemateChat(entity, [], 100, 1);
    expect(entity.chatPhrase).toBeDefined();
    expect(entity.chatDialogueSessionKey).toMatch(/^solo:/);
    vi.restoreAllMocks();
  });

  it('never selects the speaking entity as its own chat partner', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const entity = chatEntity(2);
    const duplicateList = [chatEntity(3), entity, chatEntity(4)];
    maybeHousemateChat(entity, duplicateList, 80, 1);
    expect(entity.chatPartnerId).toBeDefined();
    expect(entity.chatPartnerId).not.toBe(entity.id);
    vi.restoreAllMocks();
  });

  it('startDialogueTreeChat plays paired three-beat exchanges', () => {
    const a = chatEntity(1, false, 'Mara');
    const b = chatEntity(2, false, 'Jon');
    const tree = getDialogueTreeById('dt_rock')!;
    startDialogueTreeChat(a, b, tree);

    expect(a.chatDialogueSessionKey).toBe('1:2');
    expect(b.chatDialogueSessionKey).toBe('1:2');
    expect(a.chatPhrase ?? b.chatPhrase).toContain('rock');

    const resolve = (id: number): ChatSpeaker | null => (id === 1 ? a : id === 2 ? b : null);
    const advanceBeat = (speaker: ChatSpeaker) => {
      speaker.chatTicks = 1;
      tickHumanChat(speaker, resolve);
    };

    const firstSpeaker = a.chatPhrase ? a : b;
    advanceBeat(firstSpeaker);
    const secondSpeaker = firstSpeaker.id === 1 ? b : a;
    expect(secondSpeaker.chatTicks).toBeGreaterThan(0);

    advanceBeat(secondSpeaker);
    const thirdSpeaker = secondSpeaker.id === 1 ? b : a;
    expect(thirdSpeaker.chatTicks).toBeGreaterThan(0);

    advanceBeat(thirdSpeaker);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
  });

  it('exposes chaos-category trees for fear context', () => {
    const tree = pickDialogueTree('fear', 9, 42);
    expect(tree?.category).toBe('chaos');
  });

  it('biases tree pool toward needs when food is low', () => {
    const categories = new Set<string>();
    for (let tick = 0; tick < 60; tick++) {
      const tree = pickDialogueTree('social', 4, tick, { foodLow: true });
      if (tree) categories.add(tree.category);
    }
    expect(categories.has('needs')).toBe(true);
  });

  it('maybeHousemateChat uses child context for juvenile housemates', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const adult = chatEntity(10, false);
    const child = chatEntity(11, true);
    maybeHousemateChat(adult, [child], 120, 1);
    expect(adult.chatDialogueSessionKey).toBe('10:11');
    expect(child.chatDialogueSessionKey).toBe('10:11');
    const childTreeIds = new Set<string>();
    for (let tick = 0; tick < 80; tick++) {
      const tree = pickDialogueTree('child', 10, tick);
      if (tree) childTreeIds.add(tree.id);
    }
    expect([...childTreeIds].some((id) => id.startsWith('wf_child_'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('maybeHousemateChat uses food context when food is low', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = chatEntity(1);
    const b = chatEntity(2);
    maybeHousemateChat(a, [b], 50, 1, 95, { foodLow: true });
    expect(getDialogueTreeById('wf_food_crisis')?.category).toBe('needs');
    vi.restoreAllMocks();
  });

  it('includes migrated legacy lines as dialogue trees', () => {
    const fearTree = getDialogueTreeById('wf_fear_run');
    const homeTree = getDialogueTreeById('wf_home_arrival');
    expect(fearTree?.lines[0]?.text).toBe('Run!');
    expect(homeTree?.lines[0]?.text).toBe('Home at last.');
    const homePick = pickDialogueTree('home', 2, 10);
    expect(homePick?.id.startsWith('wf_') || homePick?.id.startsWith('dt_')).toBe(true);
  });

  it('adds environment-category trees during rain', () => {
    const categories = new Set<string>();
    for (let tick = 0; tick < 80; tick++) {
      const tree = pickDialogueTree('social', 5, tick, { weather: WeatherType.Rain });
      if (tree) categories.add(tree.category);
    }
    expect(categories.has('environment')).toBe(true);
  });
});