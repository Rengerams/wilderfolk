# Bug: Speed and pause controls silently revert on the next command

- Status: resolved — live verification pending
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer ("speed options dont work good")
- Area: Play | worker | UI
- Owner module: `src/game/gameLoop.ts` (`rebuildOptimisticDisplay`), `src/game/worldRuntimeCaches.ts`
- Cadence: Realtime frame loop (tick scheduling), no simulation cadence change

## Status history

- 2026-09-10 — open: developer reported that the speed options "don't change anything", and added that even at 1× the day already runs too fast for work → home → social life to read.
- 2026-09-10 — resolved: `speed` and `paused` are now carried across the optimistic display rebuild; regression test fails without the carry-over and passes with it. Live in-game confirmation of the button behaviour is still pending.

## Observed behavior

Choosing 5×, 10×, or 0.5× appears to take effect, but the game drops back to the
previous speed as soon as the player does anything else. Speed buttons visually
re-select the old option on their own, so the control reads as inert.

## Expected behavior

The selected speed and pause state stay selected until the player changes them,
and the tick rate follows: `msPerTick = 1000 / (BASE_TICKS_PER_SECOND × speed)`,
so 10× must schedule ticks ten times as often as 1×.

## Reproduction steps

1. Start a colony with the worker active.
2. Click **5×** in the header (the button highlights, and the game speeds up).
3. Place a building, assign a worker, or issue any other command.
4. Observe that the highlight returns to 1× and the pace drops back with it.

## Evidence

New regression test `tests/gameLoop.speedControl.test.ts` drives the real
`GameLoop` against a fake worker host whose authoritative snapshot still holds the
pre-click speed (the realistic case: the `setSpeed` message is still in flight).
With the fix temporarily disabled, the test reports:

```text
AssertionError: expected 1 to be 5   // speed: chosen 5× reads back as 1×
AssertionError: expected false to be true   // paused: chosen pause reads back as playing
```

Both assertions cover the exact mechanism below, independently of the UI.

## Root cause

In the worker architecture the main thread keeps a **display copy** of the world,
and every player command rebuilds it from the worker's last received snapshot:

```text
applyCommand → rebuildOptimisticDisplay
  → createOptimisticDisplayWorld(workerHost.getAuthoritativeWorld())   // deep clone
  → re-apply pending optimistic commands
  → this.world = display
```

`speed` and `paused` are fields of `WorldState`. They are *authored* by the player
on the main thread (which is also the side that reads `speed` to schedule ticks),
but they are *stored* in the world the worker owns, so the clone carries the
worker's value:

1. The player clicks 5× → `mutateWorld` sets `world.speed = 5` and posts
   `setSpeed(5)` to the worker.
2. The very next command rebuilds the display from the last snapshot **the main
   thread has received** — which was produced before the worker processed
   `setSpeed`, so it still says `speed: 1`.
3. `this.world.speed` is now 1 again, and `msPerTick` follows it.
4. Nothing ever resends the choice: `mutateWorld` forwards a control only when it
   *changed* (`if (this.world.speed !== prevSpeed)`), and `GameWorkerHost.setSpeed`
   early-returns when its last sent value matches. The worker copy stays at 5 while
   the display runs at 1 — the two silently disagree.

Pause has the mirror-image failure: the display can read "playing" while the
worker's `gameTick` still early-returns on `paused`, so the loop requests ticks
that are deliberately ignored.

This is why the symptom is "speed options don't change anything": the choice is
real for a moment and is then undone by the next ordinary action.

## Fix

- `worldRuntimeCaches.ts` — added `carryPresentationControls(display, source)`,
  documented as the one deliberate exception: copy `speed` and `paused` from the
  outgoing display world onto the freshly cloned one. The allowlist is exactly
  those two fields, with the reason recorded in the doc comment (the simulation
  never authors them; the worker stores them only so `gameTick` can early-return
  while paused and so prep/sync round-trips stay coherent).
- `gameLoop.ts` — `rebuildOptimisticDisplay()` calls it immediately after the
  clone and before optimistic commands are re-applied, so the player's control
  choice outranks a stale snapshot while the command result still wins for
  everything else.

Deliberately **not** carried: `bigNews`, `floatingTexts`, and the dismissed-id
sets. The simulation authors those each tick, so preserving a stale display copy
would hide new entries — the opposite failure.

## Regression test

`tests/gameLoop.speedControl.test.ts` (local-only), 3 cases:

1. chosen speed survives a command that rebuilds the display (and `setSpeed` was
   forwarded to the worker exactly once);
2. chosen pause survives the same rebuild (and `setPaused` was forwarded);
3. the carry-over is exactly those two fields — authoritative `tick` and
   `resources.food` still come from the snapshot.

Verified load-bearing: with the `carryPresentationControls` call commented out the
suite fails with `expected 1 to be 5`, and passes with it restored.

## Invariants checked

- Worker authority is unchanged: authoritative simulation state (tick, resources,
  entities, buildings) still replaces the display copy on every rebuild; only two
  player-authored control fields are preserved.
- Optimistic display rules from §5 still hold: the display remains temporary and
  the authoritative command result still wins for all simulation state.
- No tick-layer, cadence, save-schema, or `SimTickDelta` change. `speed` and
  `paused` were already part of `WorldState` and already round-tripped in
  `simPrep`; only the display rebuild's merge priority changed.
- Both controls are still forwarded to the worker (asserted in the test), so the
  worker's `paused` early-return stays coherent with the loop's gating.

## Save/migration impact

None. No field was added, removed, or reinterpreted; saves are unchanged. Note for
context: `speed` is not persisted by `saveLoad.ts`, and loading a save pauses the
game by design (`paused: true`).

## Verification result

Automated: `tsc -b` clean, `npm run lint` 0/0, full suite 93 files / 488 tests
passing, with the new test proving both the failure mode and the fix. Visual
confirmation of the header buttons during real play is still pending.

## Related files

- `src/game/gameLoop.ts`
- `src/game/worldRuntimeCaches.ts`
- `src/game/simWorker/GameWorkerHost.ts`
- `src/App.tsx` (`setSpeed`, `SPEED_OPTIONS`)
- `tests/gameLoop.speedControl.test.ts`
