# Bug: Dialogue bubbles use unscaled legacy ticks

- Status: resolved — live verification pending
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-reported live rendering defect
- Area: Play | Truth | UI
- Owner module: `src/game/humanChat.ts`
- Cadence: Per-human simulation tick; renderer reads the resulting `chatTicks`

## Status history

- 2026-08-21 — open (user reported that a dialogue bubble remained above a citizen when no conversation appeared to be occurring)
- 2026-08-21 — investigating (live phrase and chat timer lifecycle traced)
- 2026-08-21 — resolved — live verification pending (legacy duration conversion and deterministic expiry coverage completed)

## Observed behavior

A short phrase such as “Wood pile low.” remains above one citizen for most of an in-game day or longer. It feels like a stale bubble rather than a short line of dialogue, especially when there is no visible conversational response.

## Expected behavior

A short spoken line should display briefly, then clear its bubble and permit the next social interaction. The duration must retain the same intended in-game-hours pacing after the production cadence changed from one tick per hour to three ticks per hour.

## Reproduction steps

1. Run a settlement at normal production cadence (`TICKS_PER_HOUR = 3`).
2. Wait for a solo or pair dialogue line such as “Wood pile low.”
3. Observe that the bubble uses a raw 75-plus-tick timer and remains for roughly 25–40 in-game hours.

## Evidence

`DIALOGUE_LINE_BASE_TICKS` is 75 and `DIALOGUE_LINE_CHAR_TICKS` is 1.8. `ticksForDialogueLine()` returns the raw sum, while `dayCycle.ts` defines `TICKS_PER_HOUR = 3` and `TICKS_PER_DAY = 72`. `tickHumanChat()` correctly decrements and clears the phrase when the timer reaches zero, and the worker-to-render snapshot propagation correctly clears expired phrase state. The observed phrase is therefore active far too long, not stuck in the renderer.

## Root cause

The dialogue display duration retained legacy raw-tick constants after the cadence changed from 24 to 72 ticks per day. Unlike rate-based systems, it is not converted through the production `TICKS_PER_HOUR` scale.

## Fix

Resolved. Tree dialogue uses an explicit 2.5-hour base plus 0.08 hours per character, converted with `TICKS_PER_HOUR`; direct phrase callers retain their intended legacy duration but are converted at the single `sayHumanChatPhrase()` boundary using `PER_TICK_RATE_SCALE`. Dialogue selection, social probability, session ownership, and worker/main-thread authority are unchanged.

## Regression test

Implemented in `tests/humanChat.duration.test.ts`. It proves “Wood pile low.” lasts at most four game hours and that a direct short phrase clears both `chatTicks` and `chatPhrase`, leaving `isDialogueBusy()` false after expiry.

## Invariants checked

- `humanChat.ts` remains the only owner of dialogue session and timer lifecycle.
- Renderer remains read-only and draws a bubble only while authoritative `chatTicks > 0`.
- Dialogue selection frequency and social simulation cadence are unchanged.

## Save/migration impact

None. `chatTicks` is transient session state and is not a gameplay migration field.

## Verification result

Resolved — focused duration and dialogue-busy tests, TypeScript, scoped ESLint, production build, and the complete suite (**60 files / 361 tests**) passed. One full-suite run exposed the known random weather-yield flake; its isolated rerun passed. A brief player live check remains pending because the browser entered user-takeover mode before the new short timer could be observed end-to-end.

## Related commits or files

- `src/game/humanChat.ts`
- `src/game/humanTick.ts`
- `src/game/simBuffers/applyKinematics.ts`
- `src/game/renderer/humans.ts`
- `tests/humanChat.duration.test.ts`
- `BUG REPORTS/2026-08-21-dialogue-bubbles-use-unscaled-legacy-ticks.md`
