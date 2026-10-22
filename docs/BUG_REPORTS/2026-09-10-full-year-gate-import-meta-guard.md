# Bug: Full-year long-run gate died on tick 1 (unguarded `import.meta.env` in gameTick)

- Status: resolved
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Coding assistant, running `npm run test:full-year` as a gate after simulation changes
- Area: tooling | worker | save/migration (regression-gate integrity)
- Owner module: `src/game/gameTick.ts`
- Cadence: Every tick (the guard wraps an existing once-per-colony-day block)

## Status history

- 2026-09-10 — open: `npm run test:full-year` failed immediately with
  `TypeError: Cannot read properties of undefined (reading 'DEV')` at
  `gameTick.ts:273`, i.e. before a single tick of the 25,920-tick run completed.
- 2026-09-10 — resolved: the env read is now guarded like the rest of the
  codebase; the run completes 360 in-game days / 25,920 ticks with exit code 0.

## Observed behavior

```text
{"kind":"full-year-start", ..., "ticks":25920, ...}
{"kind":"full-year-failed","message":"TypeError: Cannot read properties of undefined (reading 'DEV')
    at gameTick (src/game/gameTick.ts:273:23)
    at run (scripts/run-full-year.mts:298:5)"}
```

The runner aborts on the first tick, so the project's deterministic long-run
check silently stopped validating anything. Because the failure is in the
headless path only, nothing in the browser build or the ordinary suite reveals it.

## Expected behavior

`npm run test:full-year` runs a seeded 360-day colony to completion and reports
its checkpoints and outcome, or fails loudly on a real invariant violation rather
than on an environment shim.

## Reproduction steps

1. `npm run test:full-year`
2. Observe the `full-year-failed` line with the `reading 'DEV'` TypeError.

## Evidence

Two consecutive runs, before and after the fix, captured in
`docs/log/full-year-*.jsonl`:

- before: `full-year-start` then `full-year-failed` at the first tick, exit 1;
- after: 12 checkpoints (days 30…360) and `full-year-complete`, 25,920 ticks,
  ~41 s, exit 0.

## Root cause

`gameTick.ts` read the Vite build flag directly:

```ts
// Dev-only invariant pulse once per colony day — never repairs state.
if (import.meta.env.DEV && dailyLayerRan) {
```

Under Vite, `import.meta.env` exists. Under the `tsx`-run headless script it does
not, so `.DEV` dereferences `undefined` and throws. Every other environment read in
the codebase already guards this exact hazard —
`typeof import.meta !== 'undefined' && import.meta.env?.VITE_…` in `scent.ts`,
`scentGrid.ts`, `spatialGrid.ts`, `spatialQueryMetrics.ts`, and
`GameWorkerHost.ts` — so this single site was simply missing the convention. The
defect is committed history, not part of the 2026-09-10 working-tree pass.

## Fix

```ts
// Guarded like every other env read in the codebase: `import.meta.env` does not
// exist under the headless tsx runner (`npm run test:full-year`), where an
// unguarded read throws on the very first tick and kills the long-run gate.
const isDevBuild = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
if (isDevBuild && dailyLayerRan) {
```

No behaviour change in the browser: `import.meta.env.DEV` is `true` in dev there,
so the once-per-colony-day invariant pulse still runs exactly as before, and it
remains diagnostic-only (it never repairs state).

## Regression test

The gate itself is the regression test: `npm run test:full-year` now completes
360 days and fails loudly if the guard or the invariant pulse breaks again. The
change is deliberately not covered by a unit test, since the defect only exists in
the headless module-loading environment — a unit test would have to fake
`import.meta`, which would not have reproduced the original failure.

## Invariants checked

- No simulation rule, cadence, ownership, or state field changed; the edit only
  changes when a diagnostic block is allowed to run.
- The invariant pulse is still dev-only and still non-repairing.
- Save/migration untouched; `migrateTickTimeline` and `_ticksPerDay` behaviour
  unchanged.

## Save/migration impact

None. No save field, version, or migration path was touched.

## Verification result

- `npm run test:full-year`: exit 0, `full-year-complete`, 25,920 ticks, 360 days.
- `tsc -b`: clean. `npm run test:types`: clean. `npm run check:source`: OK.
- `npm run lint`: 0 warnings / 0 errors. Vitest: 93 files / 488 tests passing.

Outcome of the restored run (seed 12345, 1 year, 8 houses + tavern + staffed
prison): population 2 → 70 settlers, 145 marriages / 67 divorces, 176 scandal
events / 60 exposures / 28 imprisonments, 27 pregnancies started / 56 births, and
food declining 100,000 → 75,820. Recorded here as the run's observed output, not
as a balance claim — the developer judges that by playing.

## Related files

- `src/game/gameTick.ts`
- `scripts/run-full-year.mts`
- `src/audio/tracks.ts` — same unguarded shape (`import.meta.env.BASE_URL`), audio-only
  and browser-only today, left unchanged deliberately: guarding it needs a sensible
  fallback prefix for a real URL, which is a behaviour decision, not a typo fix.
