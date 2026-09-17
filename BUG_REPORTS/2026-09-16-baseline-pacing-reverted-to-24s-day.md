# The shipped "slower baseline pacing" is not in effect: a day is 24 real seconds at 1× again, not 48

- **Bug:** `gameLoop.ts` sets `BASE_TICKS_PER_SECOND = 3` while its own doc comment, the
  `CHANGELOG` entry that shipped slower pacing, and three other modules all state `1.5` / "48 real
  seconds per day at 1×". With `TICKS_PER_DAY = 72` the live tick rate gives **24 real seconds per
  in-game day at 1×**, i.e. the deliberate 2× slowdown recorded as shipped is absent, and every
  rationale written against 48 s (election-term length, the building-progress ramp, the build-bar
  comment) is now off by a factor of two
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (lead, playability/pacing pass)
- **Area:** Play (baseline pacing) with a Truth consequence (documented decision no longer matches code)
- **Owner module:** `src/game/gameLoop.ts` (`BASE_TICKS_PER_SECOND`, `frame()`)
- **Cadence:** animation-frame scheduler (not a simulation cadence)

## Status history

- 2026-09-16 — open (found while measuring real-time pacing for the full audit; confirmed against a measured browser run)
- 2026-09-16 — resolved (owner decision: repair the pacing, do not rewrite the documents. `BASE_TICKS_PER_SECOND` is `1.5` again, so a day is ~48 real seconds at 1×; the constant is exported and the missing tick-rate guard now exists as `tests/gameLoop.pacingContract.test.ts`)

## Observed behavior

The live tick rate is 3 ticks/s at 1×:

```ts
// src/game/gameLoop.ts:26-29
/**
 * Real-time tick rate at 1×. With TICKS_PER_DAY=72, 1.5 ticks/s ≈ 48 real seconds per day.
 */
const BASE_TICKS_PER_SECOND = 3;
```

```ts
// src/game/gameLoop.ts:827
const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed);
```

`TICKS_PER_DAY = 72` (`src/game/gameConstants.ts:87`), so at `speed = 1` a day is
72 ticks ÷ 3 ticks/s = **24 real seconds** (a year: 360 × 24 s = **2.4 h**).

Measured in the real browser run of this audit (`npm run test:browser`, production build): the HUD
clock advanced **11:00 → 15:00 over the harness's 4 000 ms liveness window** — one in-game hour per
real second. Since `hours per real second == speed` (`3 × speed` ticks/s ÷ `3` ticks/hour), the run
was at 1× and the day is 24 s. `src/game/worldGen.ts:554` confirms the default is `speed: 1`.

## Expected behavior

What the repository says shipped: `CHANGELOG.md:890` —

> **Slower baseline pacing** — a full in-game day now takes ~48 real seconds at 1× speed (was 24s); 72 ticks/day is unchanged, all speeds scale (0.5× ≈ 96s, 2× ≈ 24s)

That requires `BASE_TICKS_PER_SECOND = 1.5`, which is what the comment on the very same constant
asserts. Every later document reasons from 48 s:

- `CHANGELOG.md:36` — the `ELECTION_INTERVAL_YEARS = 2` rationale ("a day is 48 real seconds at 1×").
- `src/game/villageLeadership.ts:20-21` — "an in-game day is 48 real seconds at 1× (`gameLoop.BASE_TICKS_PER_SECOND = 1.5`, `TICKS_PER_DAY = 72`), so a year is ~4.8 h at 1×".
- `src/game/buildingProgressDisplay.ts:6` and `src/game/renderer/buildings.ts:79` — the ramp's justification ("a whole game day … 48 real seconds at 1x").
- `docs/HANDOVER-simulation-audit-2026-09-13.md` §8 — "a day is 48 real seconds at 1×".

One of the two must be wrong. Either the pacing regression is repaired (constant back to `1.5`) or
the four documents/comments are corrected to 24 s / 2.4 h and the election-term rationale is
re-derived.

## Reproduction steps

1. `src/game/gameLoop.ts:29` → `const BASE_TICKS_PER_SECOND = 3;` while `:27` states `1.5`.
2. `src/game/gameConstants.ts:87` → `TICKS_PER_DAY: 72`; `src/game/gameLoop.ts:827` → `msPerTick = 1000 / (3 * speed)`; at `speed = 1` that is 333 ms/tick × 72 = 24 s/day.
3. `npm run build && npm run test:browser` → read `liveness.hudBefore` / `liveness.hudAfter` in the JSON report: 4 in-game hours across a 4 000 ms window (`tmp/shots/report.json`).
4. `CHANGELOG.md:890` records 48 s/day as shipped; no later entry reverts it (grep for `pacing` in `CHANGELOG.md` returns only lines 415 and 890).

## Evidence

- `src/game/gameLoop.ts:27` vs `:29` — the comment and the constant disagree inside one file.
- `src/game/gameLoop.ts:827` — `msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed)` inside `frame()`.
- `src/game/gameConstants.ts:81-92` — `Time.TICKS_PER_HOUR = 3`, `HOURS_PER_DAY = 24`, `TICKS_PER_DAY = 72`.
- `CHANGELOG.md:890` — the shipped "~48 real seconds at 1× (was 24s)" change; `CHANGELOG.md:36` and `:113` reason from 48 s.
- `src/game/worldGen.ts:554` — starting world has `speed: 1`.
- `tmp/audit-baseline/browser.log` — `npm run test:browser` verdict `pass`, `liveness.hudBefore` at `☀️11:00`, `liveness.hudAfter` at `☀️15:00`, `windowMs: 4000`, `advanced: true`.
- No test pins the value: a grep for `BASE_TICKS_PER_SECOND` / `msPerTick` / a 48-second expectation across `tests/` returns **0 matches** (only an unrelated 1.5× drought multiplier and a prose mention in `tests/buildingProgressDisplay.test.ts:5`), which is why the whole gate — build, lint, 151 files / 835 tests, the 360-day run and the browser tier — is green while the pacing decision is silently absent.

## Root cause

`BASE_TICKS_PER_SECOND` was set to `1.5` to ship the slower baseline pacing, and the current tree
carries `3` while the comment kept the older value. `gameLoop.ts` is known to have been rewritten by
the damaged-revision event recorded in `BUG_REPORTS/2026-09-16-production-build-red-five-compile-errors.md`
(that report documents `gameLoop.ts` importing a non-existent `./simWorker/gameWorkerHost`), so the
constant most plausibly reverted with that revision. The constant is module-private and untested, so
nothing in the repository can detect the change.

## Regression test

`tests/gameLoop.pacingContract.test.ts` (3 tests), written with the fix because a missing guard is why
this survived a fully green gate (build, lint, 151 files / 835 tests, the 360-day run and the browser
tier all passed while the pacing decision was silently absent):

- `BASE_TICKS_PER_SECOND === 1.5` and one in-game day is **48 000 ms** at 1×;
- the speed multipliers scale it — 0.5× ≈ 96 s, 2× ≈ 24 s, 10× ≈ 4.8 s;
- the browser tier's own liveness window (4 000 ms) advances **two** in-game hours at 1×, which is the
  measurement that exposed the 24 s/day rate (it advanced four hours at 3 ticks/s).

Before the fix, reverting the constant to `3` fails all three (`expected 3 to be 1.5`,
`expected 48000 to be close to 96000`, `expected 4 to be close to 2`) — verified by temporarily
restoring the old value.

## Invariants checked

Not a simulation invariant. The relevant repository rules are `AGENTS.md` §5.2 (one source of truth)
and the tick-rate contract implied by `worldRuntimeCaches.ts:66` (`msPerTick = 1000 / (BASE_TICKS_PER_SECOND * speed)`).

## Save/migration impact

None — the tick rate is scheduler-only. Saved `tick` values keep their meaning (72 ticks/day is
unchanged), so repairing the constant does not invalidate any save or the tick timeline migration.

## Verification result

After the fix (owner decision 2026-09-16: repair the pacing, not the documents):

- `npx vitest run tests/gameLoop.pacingContract.test.ts tests/gameLoop.speedControl.test.ts tests/gameLoop.commandDispatch.test.ts tests/gameLoop.diagnostics.test.ts` — passed (18 tests: 3 + 3 + 10 + 2).
- `npm test` — passed: 153 files / 843 tests, 0 failures.
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 321 files), `npm run test:types` — passed.
- `npm run test:browser` — verdict `pass`, 0 console errors, 0 page exceptions; the liveness window now measures **10:00 → 12:00 across 4 000 ms** (two in-game hours at 1×). The same window measured **11:00 → 15:00** (four hours) before the fix, which is the observation that exposed the regression.
- `npm run test:full-year` — exit 0 with totals identical to the pre-fix run (settlers 77, births 35, marriages 53, divorces 36), confirming the change is scheduler-only.
- Negative check: temporarily restoring `BASE_TICKS_PER_SECOND = 3` fails all three pacing tests (`expected 3 to be 1.5`), then reverted.

## Related commits or files

- `src/game/gameLoop.ts:27-29`, `:827`
- `src/game/gameConstants.ts:81-92`
- `src/game/villageLeadership.ts:14-29`, `src/game/buildingProgressDisplay.ts:5-8`, `src/game/renderer/buildings.ts:78-80`
- `CHANGELOG.md:36`, `:113`, `:890`
- `docs/HANDOVER-simulation-audit-2026-09-13.md` §8
- `BUG_REPORTS/2026-09-16-production-build-red-five-compile-errors.md` (the damaged `gameLoop.ts` revision)

## Fix

The shipped decision is repaired rather than re-derived: `src/game/gameLoop.ts` now reads
`export const BASE_TICKS_PER_SECOND = 1.5;`, so `msPerTick = 1000 / (1.5 × speed)` gives 667 ms/tick at
1× and `TICKS_PER_DAY = 72` ticks → **48 real seconds per in-game day** (0.5× ≈ 96 s, 2× ≈ 24 s,
10× ≈ 4.8 s). The constant is exported on purpose so the pacing contract can be pinned by a test, and
its doc comment now records the regression this guard exists for. Nothing else changed: the day is
still 72 ticks, so saved `tick` values, every simulation cadence, the worker protocol and the save
format are untouched, and the four modules and documents that reason from 48 s
(`villageLeadership.ts`, `buildingProgressDisplay.ts`, `renderer/buildings.ts`, the CHANGELOG's
election-term rationale) are correct again. `scripts/test.ts` and `scripts/probe-day-budget.mts` already
carried their own `1.5`, so the probe's printed real-time table is now accurate too.
