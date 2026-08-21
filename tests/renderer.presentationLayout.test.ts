/**
 * Regressions for two player-visible Canvas layout defects:
 * - atypically framed building art must retain its catalog display geometry;
 * - an active dialogue bubble takes priority over a competing name label.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType } from '../src/game/buildings';
import {
  getSpeechBubbleFontSize,
  getSpeechBubbleHeadClearance,
  resolveSpeechBubbleRect,
  shouldDrawHumanNameLabel,
} from '../src/game/renderer/overheadLayout';
import { drawContactShadow, getBuildingSpriteDrawBounds } from '../src/game/renderer/spriteDrawing';

describe('building sprite presentation geometry', () => {
  it('uses the Leader’s House catalog scale and bottom anchor rather than generic sprite geometry', () => {
    const leaderConfig = BUILDING_CONFIGS[BuildingType.LeaderHouse];
    const generic = getBuildingSpriteDrawBounds(BuildingType.LeaderHouse, 63, 53, 1);
    const tuned = getBuildingSpriteDrawBounds(
      BuildingType.LeaderHouse,
      63,
      53,
      1,
      leaderConfig.spriteDisplayScale,
      leaderConfig.spriteAnchorY,
    );

    expect(leaderConfig.spriteDisplayScale).toBeGreaterThan(1.15);
    expect(tuned.drawW).toBeGreaterThan(generic.drawW);
    expect(tuned.drawH).toBeGreaterThan(generic.drawH);
    expect(tuned.anchorY).toBe(0.97);
  });
});

describe('grounded 2.5D depth pass', () => {
  it('uses a compact contact shadow and suppresses the cosmetic cast tail when effects are reduced', () => {
    const calls: Array<{ kind: string; args?: number[] }> = [];
    const ctx = {
      fillStyle: '',
      save: () => calls.push({ kind: 'save' }),
      restore: () => calls.push({ kind: 'restore' }),
      beginPath: () => calls.push({ kind: 'begin' }),
      ellipse: (...args: number[]) => calls.push({ kind: 'ellipse', args }),
      fill: () => calls.push({ kind: 'fill' }),
    } as unknown as CanvasRenderingContext2D;

    drawContactShadow(ctx, 40, 60, 12, 3, { enhanced: true });
    expect(calls.filter((call) => call.kind === 'ellipse')).toHaveLength(2);
    expect(calls.filter((call) => call.kind === 'save')).toHaveLength(1);
    expect(calls.filter((call) => call.kind === 'restore')).toHaveLength(1);

    calls.length = 0;
    drawContactShadow(ctx, 40, 60, 12, 3, { enhanced: false });
    expect(calls.filter((call) => call.kind === 'ellipse')).toHaveLength(1);
  });

  it('keeps human, animal, tree, and building renderers on the shared contact-shadow helper', () => {
    for (const rendererPath of [
      'src/game/renderer/humans.ts',
      'src/game/renderer/animals.ts',
      'src/game/renderer/trees.ts',
      'src/game/renderer/buildings.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), rendererPath), 'utf8');
      expect(source).toContain('drawContactShadow(');
      expect(source).toContain('state.juiceEffectsEnabled');
    }
  });
});

describe('human overhead presentation layout', () => {
  it('prioritizes an active dialogue bubble over the competing name label', () => {
    expect(shouldDrawHumanNameLabel(true)).toBe(false);
    expect(shouldDrawHumanNameLabel(false)).toBe(true);
  });

  it('keeps text readable and reserves extra clearance for a leader crown', () => {
    expect(getSpeechBubbleFontSize(1.45)).toBeGreaterThan(8.5);
    expect(getSpeechBubbleHeadClearance(12, 1.45, true))
      .toBeGreaterThan(getSpeechBubbleHeadClearance(12, 1.45, false));
  });

  it('stacks overlapping active dialogue bubbles instead of drawing them through each other', () => {
    const first = { x: 100, y: 100, width: 90, height: 30 };
    const second = resolveSpeechBubbleRect(
      { x: 110, y: 106, width: 90, height: 30 },
      [first],
    );

    expect(second.y + second.height).toBeLessThanOrEqual(first.y - 6);
  });

  it('renders simulation notices beneath human speech and name overlays', () => {
    const compositeSource = readFileSync(
      resolve(process.cwd(), 'src/game/renderer/entityComposite.ts'),
      'utf8',
    );
    const floatingTextsCall = compositeSource.indexOf('  drawFloatingTexts(drawCtx, state, cw, ch);');
    const humansCall = compositeSource.indexOf('  drawHumans(drawCtx, state, cw, ch, true);');

    expect(floatingTextsCall).toBeGreaterThanOrEqual(0);
    expect(humansCall).toBeGreaterThan(floatingTextsCall);
  });
});
