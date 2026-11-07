# CB-01 — Frame loop continues after stop

- Bug: GameLoop.frame unconditionally schedules requestAnimationFrame in finally, even after stop.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: main after PR #130
- Area: game loop lifecycle / renderer
- Owner module: src/game/gameLoop.ts
- Related branch: fix/a5-top-blockers-lifecycle-load-modal-20261107

## Status history
- 2026-11-07 — open: 2026-11-07 audit, CB-01; source trace confirmed unconditional RAF scheduling.
- 2026-11-07 — investigating: add a running guard, release rendering caches on stop and test stop/restart.

## Observed behavior
frame() always enters finally with requestAnimationFrame(this.frame), even after stop() cancels the known frame. If a frame is in progress and stop fires, that finally callback creates a new animation chain retaining the session and world. The renderer-level caches also remain alive after stop.

## Expected behavior
No more RAFs after stop, no renderer cache retention from an abandoned session; restarting creates exactly one RAF chain.

## Reproduction steps
1. Construct GameLoop, start and invoke the scheduled callback.
2. Call stop inside a frame body or before invoking a stale already-queued callback.
3. Observe that the old implementation schedules another frame in finally.

## Evidence
src/game/gameLoop.ts frame() finally block and stop(); audit CB-01.

## Root cause
Unconditional RAF reschedule outside running state guard; incomplete cache disposal.

## Fix / proposed fix
Schedule only if running, cancel outstanding callback, reset renderer caches on stop, and guard stale frame callbacks from invoking the stopped body. Test reentrant stop and start.

## Save/migration impact
None.

## Verification result
NOT RUN — pending implementation and CI.
