# 2026-09-13-worker-tick-rollback-leaves-stats: 2026-09-13

- Bug: A failed worker tick did not roll back the year-rollover and stats fields, so the retried tick double-counted them
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4 (working tree, post worker-fault-fallback)
- Reporter: Code audit of the worker prep/rollback contract
- Area: Truth | worker | save/migration
- Owner module: `src/game/simWorker/simPrep.ts` (prep payload), written by `src/game/gameTick.ts`
- Cadence: Year boundary (`gameTick` calendar block) and 10-tick stats sampling (`tickLayerRealtime.ts`)

## Status history

- 2026-09-13 — open (found while auditing the prep payload against the fields
  `gameTick` writes: `SimPrepKeys` omitted the three fields updated by the same
  calendar block whose siblings it did list).
- 2026-09-13 — resolved (all three fields added to `SimPrepKeys` and to
  `extractSimPrep`/`applySimPrep` as deep clones; `tests/simPrep.rollbackClosure.test.ts`
  fails without the change and passes with it; typecheck, lint, build and the
  standard suite green).

## Observed behavior

`src/game/simWorker/gameWorker.ts` wraps a worker tick in
`try { gameTick(world, msg.focus) } catch (err) { applySimPrep(world, prepBackup); postError(...) }`
(`gameWorker.ts:319-362`), where `prepBackup = extractSimPrep(world)` is taken
before the tick. The rollback only restores the fields listed in `SimPrepKeys`
(`simPrep.ts:10-87`).

Three fields written inside `gameTick` were **not** in that list:

- `yearlyStats` / `lifetimeStats`, pushed and incremented by the year-rollover
  block (`gameTick.ts:82-94`).
- `populationHistory`, sampled every `STATS_SAMPLE_INTERVAL_TICKS` (10) by the
  realtime layer (`tickLayerRealtime.ts:168-209`).

After a failed tick the worker reports the error and the host gives up on the
worker rather than retrying it: `GameWorkerHost.handleMessage` →
`onWorkerFault('tick', …)` (`GameWorkerHost.ts:492-505`) → `gameLoop.ts:348-351`
→ `fallbackFromWorker` (`gameLoop.ts:385-404`), which disposes the worker,
leaves `workerEnabled = false`, and syncs the host to the authoritative world.
The rollback restored `tick`, `year`, and `dayInYear`, so on the **next frame
the main thread re-executed the same tick** (`gameLoop.ts:863-878`) and re-ran
the year-rollover block — but the arrays it had already appended to were never
rewound.

Concretely, for a tick at a year boundary (absolute day index a multiple of
`DAYS_PER_YEAR` = 360):

- `state.yearlyStats` received a **second entry for the same year** (`gameTick.ts:84`).
- `state.lifetimeStats.totalMarriages` and `totalBuildingsUpgraded` were
  incremented a second time (`stats.ts:128-139` uses `+= latestYear.<field>`).
- A `populationHistory` sample taken by the failed tick survived the rollback,
  so the stats chart carried a sample for a tick the worker reported as failed.

## Expected behavior

A tick the worker reports as failed leaves no trace: `applySimPrep(world,
extractSimPrep(world))` is the inverse of the tick's mutations for every field
`gameTick` advances. A failed tick that is re-executed on the main thread must
produce exactly the same state as one clean execution.

## Reproduction steps

1. Start a game with the simulation worker active.
2. Make a layer inside `gameTick` throw on a tick whose calendar block performs
   a year rollover (`getCalendarDay(tick) === 0` with `DAYS_PER_YEAR` = 360).
3. Observe `[GameLoop] Worker tick error: <message> — falling back to
   main-thread ticks`, then the main thread re-executing that tick.
4. Inspect `state.yearlyStats`: the closing year appears twice, and
   `state.lifetimeStats.totalMarriages` advanced twice for one year.

Deterministic reproduction without a worker — the mechanism the fix actually
relies on:

```ts
const world = initGame();
world.tick = TICKS_PER_DAY * DAYS_PER_YEAR - 1; // next tick is the year boundary
world.dayInYear = TICKS_PER_DAY - 1;
const prep = extractSimPrep(world);
gameTick(world);                 // advances yearlyStats, lifetimeStats, populationHistory
applySimPrep(world, prep);       // what the worker does on a failed tick
// before the fix: world.populationHistory had an extra entry and the stats
// stayed advanced. After: extractSimPrep(world) deep-equals prep.
```

This is locked in by `tests/simPrep.rollbackClosure.test.ts`.

## Evidence

- `simPrep.ts` `SimPrepKeys` listed `tick`, `year`, `dayInYear`,
  `eventsThisYear`, `ecoHealthYearsAbove80`, `totalBuildingsCompleted`, … but not
  `populationHistory`, `yearlyStats`, or `lifetimeStats` — while every other
  field written by the same `gameTick.ts:82-94` block was present.
- The duplication is permanent, not transient: `recordYearlyStats` appends
  unconditionally (`stats.ts:61-126`, no per-year dedup — contrast
  `trackYearEvent`, which guards with `includes`), `lifetimeStats` is persisted
  (`saveSchema.ts:14-15`), and the duplicate entry becomes the next year's
  `prevYearStats` baseline (`stats.ts:67`, `:73`, `:87`).
- `lifetimeStats.totalHumansBorn` / `totalHumansDied` are recomputed from the
  whole array each rollover (`stats.ts:131-132`) and therefore **self-healed**;
  only the two `+=` counters doubled, which is why this could go unnoticed.
- Existing fault/fallback coverage (`tests/gameLoop.commandDispatch.test.ts:409`
  fires a simulated `tick` fault) exercises the fallback plumbing, but no test
  asserted the prep payload was closed over the tick's write set.

## Root cause

`SimPrepKeys` is a hand-maintained allowlist, and a field the tick writes but
the list omits silently breaks the rollback. The failure is invisible in normal
play because it needs a mid-tick throw, and half of the damage
(`totalHumansBorn`, `totalHumansDied`) is self-correcting on the next rollover
while the other half (`totalMarriages`, `totalBuildingsUpgraded`) is not.

## Regression test

`tests/simPrep.rollbackClosure.test.ts` (3 tests):

1. `extractSimPrep` does not alias the live stats arrays — mutating
   `populationHistory` / `yearlyStats` / `lifetimeStats` in place after the
   backup does not change the backup.
2. A real `gameTick` at the production year boundary (tick
   `TICKS_PER_DAY * DAYS_PER_YEAR - 1`) advances `yearlyStats` and
   `lifetimeStats`, then `applySimPrep` restores all of them, including a seeded
   `populationHistory` sentinel sample. Fails before the fix with
   `expected [ …(2) ] to deeply equal [ … { tick: 25919 … } ]` — the extra
   surviving sample.
3. Every key in the payload is restored by `applySimPrep`, proven by poisoning
   each key with a sentinel and re-applying — so a field the payload claims but
   the applier ignores fails the test (this is what catches a half-fix that adds
   the keys to `extractSimPrep` only).

Both the symptom test and the closure test fail with the fix removed; neither
passed vacuously.

## Invariants checked

- Simulation authority §5 is unaffected; no invariant field (occupants,
  residence, pregnancy, Howler, leadership) is touched.
- Tick cadence and layer order are unchanged — only the failure-recovery payload
  changed. `STATS_SAMPLE_INTERVAL_TICKS` (10) and the year boundary remain as the
  owners declare them; the test pins that `TICKS_PER_DAY` (72) is *not* a
  multiple of the sample interval, so the sampled path and the rollover path are
  verified independently rather than through one coincidence.
- No second owner was introduced: the fields are restored, not recomputed, so
  `gameTick` remains the only writer.

## Save/migration impact

None. No save field, schema key, or version gate changed — `yearlyStats` and
`lifetimeStats` were already persisted (`saveSchema.ts:14-15`). Saves written
before this fix may carry a duplicated year entry and inflated counters; the fix
prevents new corruption but deliberately does not rewrite existing saves, since
a duplicate entry cannot be distinguished from two genuinely distinct rollovers
without a migration decision.

## Verification result

- `npx vitest run tests/simPrep.rollbackClosure.test.ts` — 3 passed.
- `npx tsc -p tsconfig.vitest.json --noEmit` — exit 0.
- `npm run test:standard` — 105 files / 593 tests passed (includes the prep
  round-trip in `tests/villageRequests.test.ts` and the fault-fallback case in
  `tests/gameLoop.commandDispatch.test.ts`).
- Fix-removal check: with the three `applySimPrep` restore lines removed, tests
  2 and 3 fail; restored byte-identical afterwards.

## Related files

- `src/game/simWorker/simPrep.ts`
- `src/game/gameTick.ts`
- `src/game/stats.ts`
- `src/game/tickLayerRealtime.ts`
- `src/game/simWorker/gameWorker.ts`
- `src/game/simWorker/GameWorkerHost.ts`
- `src/game/gameLoop.ts`
- `tests/simPrep.rollbackClosure.test.ts`

## Fix

Added the three missing fields to `SimPrepKeys` (`simPrep.ts`) and to both
`extractSimPrep` and `applySimPrep`. All three are **deep-cloned** with
`structuredClone`, matching the existing pattern used for `activeVillageRequest`
and `pendingStoryEvents`: `gameTick` mutates nested objects (`lifetimeStats`
holds `totalResourcesGathered`/`longestLivingHuman`/`largestPopulation`;
`yearlyStats` entries hold `population`/`births`/`deaths`/`resources`/`events`),
so a shallow spread would leave the backup aliasing the live objects and the
rollback would be a no-op. A comment in `SimPrepKeys` records why these fields
must stay in the payload.

This closes the array-identity half of `BUG_TRACKER.md` #18 for these three
fields. #18's remaining, deliberately accepted limitation — `entities` /
`buildings` are cloned only one level deep, so an in-place `entity.x` write or
`building.occupants.push` still survives a rollback — is unchanged and stays
documented as a tradeoff (deep-cloning ~1500 entities per tick would cost more
than the failure it guards). These three fields are small, so deep-cloning them
carries no comparable cost.

