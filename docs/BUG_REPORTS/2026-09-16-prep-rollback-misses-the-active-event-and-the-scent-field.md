# The prep rollback missed the active event and destroyed the scent field, so a failed tick was not fully undone

- **Bug:** two fields the tick writes were outside the rollback payload's effect. (1) `activeEvent` is written by the daily layer inside `gameTick` and shipped by the delta, but it was the one `WorldState` field missing from `SimPrepKeys` / `extractSimPrep` / `applySimPrep`, so a failed tick could leave an event latched (or lose the one that was live). (2) `applySimPrep` ended with `invalidateWorldRuntimeCaches`, which drops `scentGrid` — a simulation field, not a derived index — so every rollback zeroed the wolves' accumulated scent trail
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 worker-boundary audit, findings **F3** (medium) and **F5** (low) (`docs/private/audits/2026-09-16/game-worker.md`); both runtime-reproduced there and pinned here
- **Area:** worker (tick rollback) with a Truth consequence (event state and a simulation field the rollback did not cover)
- **Owner module:** `src/game/simWorker/simPrep.ts`
- **Cadence:** per tick (the prep payload is taken before each `gameTick`) and on a failed command/tick rollback

## Status history

- 2026-09-16 — open (audit findings; F3 was masked because a tick fault also disposes the worker, and the rollback test only ran 240 ticks so no event existed in its fixture)
- 2026-09-16 — resolved (`activeEvent` added to the payload; the scent grid is carried across the cache rebuild; regression tests `tests/simPrep.rollbackFields.test.ts`)

## Observed behavior

```ts
// src/game/simWorker/simPrep.ts (before)
// SimPrepKeys: 92 fields — `activeEvent` absent, while `simDelta.ts` shipped it
// applySimPrep tail:
invalidateWorldRuntimeCaches(world);   // world.scentGrid = undefined  (worldRuntimeCaches.ts:23)
hydrateWorldRuntimeCaches(world);
```

Audit repro: `activeEvent before tick: null` → after tick `visitor_pilgrims_504` → after
`applySimPrep` still `visitor_pilgrims_504` (bigNews was correctly restored to 0). Separately:
`scentGrid before rollback: present` → `after rollback: absent`.

## Expected behavior

`applySimPrep(world, extractSimPrep(world))` is the inverse of the tick's mutations for every field
`gameTick` advances — the invariant the 2026-09-13 rollback report established — and a rollback does
not destroy simulation state that the tick merely updates. The wolves keep their scent field; an event
latched by a failed tick is gone, and the event that was live before it is back.

## Reproduction steps

1. `npx vitest run tests/simPrep.rollbackFields.test.ts` — before the fix, the event cases fail (the
   latched event survives the rollback) and the scent case fails (`world.scentGrid` is `undefined`).
2. Against the old code: latch an event by ticking into a first-week visitor boundary (tick ≥ 504),
   then `applySimPrep(world, prep)` and observe the event still latched.

## Evidence

- `src/game/dailyWorldEvents.ts:194-230` — the four `state.activeEvent` writers inside the daily layer.
- `src/game/simWorker/simPrep.ts` (before) — 92 keys, no `activeEvent`; `simDelta.ts:124,357,511`
  carries it, which made it the only asymmetric `WorldState` field.
- `src/game/worldRuntimeCaches.ts:23` — `world.scentGrid = undefined` inside `invalidateWorldRuntimeCaches`,
  which `hydrateWorldRuntimeCaches` calls again (`:38`), so the drop was guaranteed twice.
- `src/game/scentGrid.ts:313-334,336-343` — `ensureScentGrid` recreates an **empty** grid and
  `tickScentGrid` early-returns when there is none, so the trail restarts from nothing.
- `tests/workerBoundary.closure.test.ts:275` — the 240-tick fixture is why the existing rollback test
  could not catch F3 (the first-week event needs tick ≥ 504).

## Root cause

Two membership mistakes around one payload. F3: a field added to the tick after the payload's field
list was written, with nothing enforcing closure (the delta grew independently). F5: a blanket cache
invalidation used for a rollback, where one of the "caches" is actually accumulated simulation state.

## Regression test

`tests/simPrep.rollbackFields.test.ts` (3 tests), on a real `initGame()` world:
- an event latched by the failed tick is undone (`activeEvent` back to `null`);
- the event that was live before the tick is restored by id;
- the live `ScentGrid` instance and its values survive `applySimPrep`.

The blanket guard is already in `tests/simPrep.rollbackClosure.test.ts` ("round-trips every field the
prep payload claims to own"): it now covers `activeEvent` automatically, because it iterates the
payload's keys rather than a hard-coded list.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied (the change is rollback-only, so no live behaviour moves).

## Save/migration impact

None. `activeEvent` was already saved; `scentGrid` is a runtime field that is deliberately stripped
from saves and rebuilt. No key, format or version changed.

## Verification result

- `npx vitest run tests/simPrep.rollbackFields.test.ts tests/simPrep.rollbackClosure.test.ts` — passed (6 tests).
- `npm test` — passed: 160 files / 865 tests, 0 failures.
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm run test:full-year`, `npm run test:browser` — passed.

## Related commits or files

- `src/game/simWorker/simPrep.ts` — `'activeEvent'` added to `SimPrepKeys`, `structuredClone` in
  `extractSimPrep`, assignment in `applySimPrep`; the scent grid is captured before the cache rebuild
  and restored after it
- `tests/simPrep.rollbackFields.test.ts` — new

## Fix

F3: `'activeEvent'` joins the payload next to `festival`/`electionCeremony`, extracted as
`state.activeEvent ? structuredClone(state.activeEvent) : null` and applied directly, so
`extractSimPrep` is inverse across the whole payload again.

F5: `applySimPrep` keeps the live grid across the invalidation —

```ts
const scentGrid = world.scentGrid;
invalidateWorldRuntimeCaches(world);
hydrateWorldRuntimeCaches(world);
if (scentGrid) world.scentGrid = scentGrid;
```

Chosen over snapshotting the grid in the payload (the audit's alternative) because the payload is
taken per tick: cloning a `Float32Array` field every tick to protect a rare failure path is worse than
not destroying simulation state during a rebuild. The residual imperfection is documented: the failed
tick's own scent deposits stay in the grid, so a rollback is "trail preserved" rather than
"scent-exact". If scent ever needs exact rollback, the payload is the place for it.
