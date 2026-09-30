# Bug: Hunt visual state outlives its animation clock

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: Hunting logic audit
- Area: rendering | performance
- Owner module: `src/game/huntvisuals.ts` lifecycle helper
- Cadence: Realtime pruning during the simulation tick

## Observed behavior

Hunt arrow visuals animate from `startedAtMs` for 1,000 ms and are considered active for 1,400 ms, but pruning retains them for 45 simulation ticks. At the base rate this leaves finished visuals in the transient render snapshot for about 30 seconds; at higher speeds the retention duration changes with simulation speed rather than the animation lifecycle.

## Expected behavior

A hunt visual should remain in transient state only for the same real-time interval that the renderer can display it, independent of colony simulation speed.

## Reproduction steps

1. Trigger a free-roam or Hunting Spot hunt.
2. Let the 1.4-second visible animation window elapse.
3. Inspect `state.huntVisuals`: the renderer no longer draws the arrow, but realtime cleanup retains the entry until 45 simulation ticks have passed.

## Evidence

`huntAnimProgress()` and `isHuntVisualActive()` use `startedAtMs`, while `pruneHuntVisuals()` tests `state.tick - startedAtTick < 45`. With a base rate of 1.5 ticks/s, 45 ticks is 30 seconds at 1× and 6 seconds at 5×, although the renderer stops drawing the arrow after its 1.4-second wall-clock window.

## Root cause

The visual was moved into simulation state for worker snapshot transport, but the pruning condition retained a simulation-tick time-to-live while rendering retained a wall-clock animation time-to-live.

## Fix

`pruneHuntVisuals()` now accepts an optional wall-clock instant and delegates retention to `isHuntVisualActive()`, using the existing `HUNT_ANIM_MS + 400` visibility window. The simulation tick remains metadata for identity/debugging only.

## Regression test

`tests/huntVisuals.lifecycle.test.ts` proves that a recent visual survives despite an old simulation tick and that it is removed exactly at the wall-clock visibility boundary.

## Invariants checked

- Renderer progress and visual retention use one time domain.
- Playback speed does not change the retention duration of finished transient visual state.
- The bounded visual buffer remains capped at eight entries.

## Save/migration impact

None. Hunt visuals are transient presentation data.

## Verification result

Focused Hunting Spot and Hunt Visual regressions passed (3 tests). TypeScript validation, focused linting, the full suite (54 files / 344 tests), and the production build all passed on 2026-08-21. The existing circular-chunk and large-bundle build warnings remain unrelated.

## Related files

- `src/game/huntvisuals.ts`
- `src/game/tickLayerRealtime.ts`
- `src/game/renderer/humans.ts`
- `tests/huntVisuals.lifecycle.test.ts`
