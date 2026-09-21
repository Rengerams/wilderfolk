/**
 * The opening screen's reveal timeline — the beats, and how long the whole thing really lasts.
 *
 * This lives outside `IntroScreen` because the *arithmetic* is what went wrong: `ready: 6000` sat inside
 * the beats map, where every other entry is an offset from mount, so the CTA and the bottom progress bar
 * fired at 6 s — before the subtitle (9.8 s), the hook (14.2 s) and the food chain (17.6 s). The button
 * appeared over a half-built title screen, jumped down as the remaining beats opened, and the bar read
 * full with three beats still to come (`LIVE-FINDINGS-STATUS.md`, F9). Keeping the beats and the total in
 * one module with a test on the relationship makes that mistake fail a test instead of shipping.
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
