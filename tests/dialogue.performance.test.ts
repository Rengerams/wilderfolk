import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, requestDialogue } from '../src/game/dialogueTrees';
import { resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

function percentile(sorted: readonly number[], percentileValue: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileValue))]!;
}

describe('bounded dialogue lookup and performance guard', () => {
  it('selects specific indexed events without rebuilding a whole-category pool on every request', () => {
    const source = canonicalDialogueBank.dialogue_trees;
    const eligible = source.filter((scene) => scene.eventKey === 'hospital.doctor' && scene.mode === 'solo');
    expect(eligible.length).toBeGreaterThanOrEqual(2);
    const count = 512;
    const timings: number[] = [];
    let visible = 0;
    for (let i = 0; i < count; i++) {
      const speaker: ChatSpeaker = { id: 100_000 + i };
      const startedAt = performance.now();
      const started = requestDialogue({
        eventKey: 'hospital.doctor', speaker, tick: 100 + i,
        selectionRoll: (i % eligible.length) / eligible.length,
      });
      timings.push(performance.now() - startedAt);
      expect(started).toBe(true);
      if (speaker.chatPhrase) visible++;
    }
    timings.sort((a, b) => a - b);
    const p50 = percentile(timings, 0.5);
    const p95 = percentile(timings, 0.95);
    console.info('[dialogue-perf] indexed 512 solo events: p50='
      + p50.toFixed(4) + ' ms, p95=' + p95.toFixed(4)
      + ' ms, visible=' + visible + ', active=' + count
      + ', catalog=' + source.length);
    expect(visible).toBe(count);
    expect(Number.isFinite(p50) && Number.isFinite(p95)).toBe(true);
    expect(p95).toBeGreaterThanOrEqual(p50);
  });
});
