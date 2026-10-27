/**
 * F9 — the intro's CTA and progress bar fired 11.6 s before the intro finished
 * (`docs/private/audits/2026-09-16/playability-gamefeel.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * `ready: 6000` sat inside `INTRO_TIMELINE_MS`, where every other entry is an offset from mount, so the
 * "Choose your land →" button, the "press any key" prompt and the bottom progress bar all completed at
 * 6 s — while the subtitle (9.8 s), hook (14.2 s) and food-chain (17.6 s) beats were still to come. Any
 * keypress after 6 s skipped the rest of the reveal. The beats and the total now live in
 * `src/game/introTimeline.ts` so the relationship is testable instead of implied.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTRO_DURATION_MS,
  INTRO_LAST_BEAT_MS,
  INTRO_READY_DELAY_MS,
  INTRO_TIMELINE_MS,
} from '../src/game/introTimeline';

describe('intro timeline', () => {
  it('finishes after the last reveal beat, not before it', () => {
    expect(INTRO_DURATION_MS).toBe(INTRO_LAST_BEAT_MS + INTRO_READY_DELAY_MS);
    // The defect in one number: the CTA used to fire at 6 000 ms, 11 600 ms short of the last beat.
    expect(INTRO_DURATION_MS).toBe(23_600);
    expect(INTRO_DURATION_MS).toBeGreaterThan(INTRO_LAST_BEAT_MS);
  });

  it('keeps every beat inside the intro', () => {
    expect(INTRO_LAST_BEAT_MS).toBe(Math.max(...Object.values(INTRO_TIMELINE_MS)));
    for (const [beat, at] of Object.entries(INTRO_TIMELINE_MS)) {
      expect(at, `${beat} plays after the intro is over`).toBeLessThanOrEqual(INTRO_LAST_BEAT_MS);
    }
  });

  it('schedules the CTA from the whole duration and carries no offset-shaped "ready" beat', () => {
    expect('ready' in INTRO_TIMELINE_MS, 'a "ready" offset is back in the beats map').toBe(false);
    const screen = readFileSync(resolve(process.cwd(), 'src/game/IntroScreen.tsx'), 'utf8');
    expect(screen).toContain('scheduleIntroBeat(INTRO_DURATION_MS, () =>');
  });
});
