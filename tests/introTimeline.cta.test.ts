/**
 * The intro's CTA, key prompt and progress bar finish only after the last reveal beat, so a keypress
 * cannot skip beats that have not played; beats and total live in `introTimeline.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  INTRO_DURATION_MS,
  INTRO_LAST_BEAT_MS,
  INTRO_READY_DELAY_MS,
  INTRO_TIMELINE_MS,
} from '../src/game/introTimeline';

describe('intro timeline', () => {
  it('finishes after the last reveal beat, not before it', () => {
    expect(INTRO_DURATION_MS).toBe(INTRO_LAST_BEAT_MS + INTRO_READY_DELAY_MS);
    // The CTA must outlast every beat: duration is the last beat plus the ready delay.
    expect(INTRO_DURATION_MS).toBe(23_600);
    expect(INTRO_DURATION_MS).toBeGreaterThan(INTRO_LAST_BEAT_MS);
  });

  it('keeps every beat inside the intro', () => {
    expect(INTRO_LAST_BEAT_MS).toBe(Math.max(...Object.values(INTRO_TIMELINE_MS)));
    for (const [beat, at] of Object.entries(INTRO_TIMELINE_MS)) {
      expect(at, `${beat} plays after the intro is over`).toBeLessThanOrEqual(INTRO_LAST_BEAT_MS);
    }
  });

  it('carries no offset-shaped "ready" beat', () => {
    expect('ready' in INTRO_TIMELINE_MS, 'a "ready" offset is back in the beats map').toBe(false);
  });
});
