# GameLoop kept scheduling frames after stop and retained the old world

- Bug: `GameLoop.stop()` could not end the animation-frame chain, so every stopped loop kept running empty frames and retained its colony.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit
- Reporter: full-audit codebase review (CB-01)
- Area: game loop lifecycle
- Owner module: `src/game/gameLoop.ts`
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the unconditional reschedule in `frame`'s `finally`.
- 2026-11-07 — resolved: reschedule is guarded by `this.running`; stop/start regression added.

## Observed behavior
`frame` always called `requestAnimationFrame(this.frame)` in `finally`. A `stop()` issued from inside a running callback found `rafId` already executing, cancelled nothing, and the callback re-scheduled itself. Every later frame returned early but kept scheduling, retaining the loop's `WorldState`.

## Expected behavior
A stopped loop schedules no further frame; a restart produces exactly one chain.

## Reproduction steps
1. Create a `GameLoop` with a stubbed `requestAnimationFrame`.
2. Call `start()`, capture the scheduled callback, then `stop()`.
3. Invoke the captured callback; before the fix another frame was scheduled.

## Evidence
`tests/gameLoop.raf.test.ts` fails before the guard and passes after it.

## Root cause
The `finally` block did not check `this.running`.

## Fix / proposed fix
`if (this.running) this.rafId = requestAnimationFrame(this.frame);`.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/gameLoop.raf.test.ts` — PASS.
