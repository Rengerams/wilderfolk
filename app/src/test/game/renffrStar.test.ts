import { describe, expect, it, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import {
  RENFFR_OMEN_LINES,
  beginRenffrSettlerChatter,
  createRenffrOmen,
  drawRenffrOmen,
  maybeTriggerRenffrOmen,
  tickRenffrOmen,
} from '@/game/renffrStar';
import * as humanChat from '@/game/humanChat';

function createStackTrackingCtx(): { ctx: CanvasRenderingContext2D; depth: () => number } {
  let depth = 0;
  const stack: Array<{
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    font: string;
    shadowBlur: number;
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    lineCap: CanvasLineCap;
    shadowColor: string;
    globalAlpha: number;
  }> = [];
  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    font: '10px sans-serif',
    shadowBlur: 0,
    shadowColor: 'transparent',
    globalAlpha: 1,
  };
  const ctx = {
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v: number) { state.lineWidth = v; },
    get lineCap() { return state.lineCap; },
    set lineCap(v: CanvasLineCap) { state.lineCap = v; },
    get textAlign() { return state.textAlign; },
    set textAlign(v: CanvasTextAlign) { state.textAlign = v; },
    get textBaseline() { return state.textBaseline; },
    set textBaseline(v: CanvasTextBaseline) { state.textBaseline = v; },
    get font() { return state.font; },
    set font(v: string) { state.font = v; },
    get shadowBlur() { return state.shadowBlur; },
    set shadowBlur(v: number) { state.shadowBlur = v; },
    get shadowColor() { return state.shadowColor; },
    set shadowColor(v: string) { state.shadowColor = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v: number) { state.globalAlpha = v; },
    save() {
      stack.push({ ...state });
      depth += 1;
    },
    restore() {
      const prev = stack.pop();
      if (prev) Object.assign(state, prev);
      depth -= 1;
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    arc: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    strokeText: () => undefined,
    fillText: () => undefined,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, depth: () => depth };
}

describe('beginRenffrSettlerChatter', () => {
  it('can speak all four omen lines when enough settlers are present', () => {
    const state = initGame();
    const spoken: string[] = [];
    vi.spyOn(humanChat, 'sayHumanChatPhrase').mockImplementation((entity, phrase) => {
      spoken.push(phrase);
      entity.chatPhrase = phrase;
    });

    const entities = Array.from({ length: 6 }, (_, i) => {
      const human = createEntity(EntityType.Human, i * 10, 0, i + 1, 250, false);
      human.faction = undefined;
      return human;
    });

    beginRenffrSettlerChatter(state, entities);

    expect(spoken).toHaveLength(RENFFR_OMEN_LINES.length);
    expect(spoken).toEqual(RENFFR_OMEN_LINES);
    vi.restoreAllMocks();
  });

  it('ignores visitor and rival humans', () => {
    const state = initGame();
    const spoken: string[] = [];
    vi.spyOn(humanChat, 'sayHumanChatPhrase').mockImplementation((_entity, phrase) => {
      spoken.push(phrase);
    });

    const visitor = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    visitor.faction = 'visitor';
    const rival = createEntity(EntityType.Human, 10, 0, 2, 250, false);
    rival.faction = 'rival';
    const settler = createEntity(EntityType.Human, 20, 0, 3, 250, false);
    settler.faction = undefined;

    beginRenffrSettlerChatter(state, [visitor, rival, settler]);

    expect(spoken).toHaveLength(1);
    vi.restoreAllMocks();
  });
});

describe('drawRenffrOmen', () => {
  it('balances canvas save/restore and does not leak textAlign', () => {
    const { ctx, depth } = createStackTrackingCtx();
    const omen = createRenffrOmen();
    omen.phase = 1;
    omen.phaseTimer = 24;

    drawRenffrOmen(ctx, omen, 800, 600, 1.5);

    expect(depth()).toBe(0);
    expect(ctx.textAlign).toBe('start');
    expect(ctx.shadowBlur).toBe(0);
  });
});

describe('maybeTriggerRenffrOmen', () => {
  it('is deterministic for the same seed and tick', () => {
    const a = initGame();
    a.tick = 500;
    a.humanPopulation = 5;
    const b = initGame();
    b.worldMap = a.worldMap;
    b.tick = a.tick;
    b.humanPopulation = a.humanPopulation;

    const entities: ReturnType<typeof createEntity>[] = [];
    for (let i = 0; i < 4; i++) {
      const h = createEntity(EntityType.Human, i * 10, 0, i + 1, 250, false);
      h.faction = undefined;
      entities.push(h);
    }

    const first = maybeTriggerRenffrOmen(a, entities, true);
    const second = maybeTriggerRenffrOmen(b, entities, true);

    expect(first).toBe(second);
    expect(!!a.renffrOmen).toBe(!!b.renffrOmen);
  });
});

describe('tickRenffrOmen', () => {
  it('uses deterministic scatter velocities when letters disperse', () => {
    const scatterFirstLetter = (life: number) => {
      const omen = createRenffrOmen();
      omen.phase = 1;
      omen.life = life;
      omen.phaseTimer = 44;
      tickRenffrOmen(omen);
      expect(omen?.phase).toBe(2);
      return omen!.letters[0];
    };

    const a = scatterFirstLetter(200);
    const b = scatterFirstLetter(200);

    expect(b.vx).toBe(a.vx);
    expect(b.vy).toBe(a.vy);
    expect(b.vr).toBe(a.vr);
  });
});