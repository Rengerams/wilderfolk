/**
 * The opening screen's reveal timeline — the beats, and how long the whole thing lasts.
 * Beats are offsets from mount; the ready delay is separate so the CTA cannot fire early.
 */

/** Reveal beats, each an offset in ms from mount. The CTA is deliberately **not** one of them. */
export const INTRO_TIMELINE_MS = {
  aurora: 900,
  logo: 3800,
  title: 5200,
  subtitle: 9800,
  hook: 14200,
  hookDetail: 15900,
  chain: 17600,
} as const;

/** The last reveal beat: nothing may appear on the finished screen before this. */
export const INTRO_LAST_BEAT_MS = INTRO_TIMELINE_MS.chain;

/** How long the finished screen holds before the CTA and the "press any key" prompt appear. */
export const INTRO_READY_DELAY_MS = 6000;

/** The intro's real length: the last beat, then the hold. Shared by the CTA and the progress bar. */
export const INTRO_DURATION_MS = INTRO_LAST_BEAT_MS + INTRO_READY_DELAY_MS;
