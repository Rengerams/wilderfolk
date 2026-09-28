# Runtime import cycle through the `dayCycle` hub

- Bug: the runtime import graph contained an 8-module cycle, so `npm run audit:deps:cycles:strict` failed; the warn-only default hid it behind "Import-cycle gate OK"
- Status: resolved
- Date discovered: 2026-09-20
- Version/build: Wilderfolk 0.6.4 (working tree)
- Reporter: Coding assistant — found by `scripts/check-import-cycles.mjs` while verifying an unrelated adoption fix
- Area: performance (module graph / build health)
- Owner module: `src/game/dayCycleConstants.ts` (the age ladder's home), `src/game/dayCycle.ts`, `src/game/citizenId.ts`
- Cadence: none — build/architecture only

## Status history

- 2026-09-20 — open (the gate reported `Runtime import cycles: 1`; an A/B with a newly added edge removed reproduced the same cycle, proving it predated that work)
- 2026-09-20 — resolved (the two age constants moved to their owner; `No runtime import cycles`, strict gate exit 0)

## Observed behavior

```text
Import graph: 334 modules, 1654 runtime dependencies
Runtime import cycles: 1
  cycle of 8: citizenId.ts → dayCycle.ts → humanLifecycleCleanup.ts → moonHowlerForm.ts
            → nameLoader.ts → residencyReconciliation.ts → residencySelection.ts → workforce.ts
```

The default gate printed `Import-cycle gate OK — 334 modules checked` and exited 0 regardless, so the
cycle was only visible to `audit:deps:cycles:strict`.

## Expected behavior

`docs`/roadmap row **T1** and the previous cycle repair (**N33**) both treat `audit:deps:cycles:strict`
exiting 0 as the contract. A runtime cycle is a real hazard: the edges are evaluated at import time, so
a cycle means some module observes a partially-initialised dependency depending on entry order.

## Reproduction steps

1. `npm run audit:deps` — prints the cycle but exits 0 (warn-only).
2. `npm run audit:deps:cycles:strict` — fails while the cycle exists.

## Evidence

Before: `Runtime import cycles: 1` with the path above.
After: `No runtime import cycles.` / `Import-cycle gate OK — 334 modules checked.` (exit 0).

Note for a future reader: **the gate's printed "cycle of N" is an SCC node listing, not a literal edge
path.** Four of its consecutive pairs (`moonHowlerForm → nameLoader`, `nameLoader →
residencyReconciliation`, `residencySelection → workforce`, `workforce → citizenId`) are not direct
imports. Verify edges against `npm run audit:deps:graph` (JSON) rather than trusting the printed order.

## Root cause

The cycle was closed by `citizenId.ts` importing two **age-ladder** constants from the `dayCycle` hub:

```ts
// src/game/citizenId.ts:2, before the fix
import { HUMAN_CHILDHOOD_DAYS, HUMAN_VENERABLE_AGE } from './dayCycle';
```

`citizenId` needs them only to decide how to label a settler's age for display. `dayCycle` is the
calendar/tick hub — it reaches `humanLifecycleCleanup` (dayCycle.ts:407) → `moonHowlerForm:16` →
`workforce:12` → `residencyReconciliation:7` → `residencySelection` → … and back, so any leaf module
that wanted an age constant was pulled into the graph's largest component.

This is the same shape **N33** repaired for `householdComposition`: a consumer reaching a *hub* for a
value its **owner** defines.

## Fix

Applied 2026-09-20 — a pure relocation, no behaviour change:

1. `HUMAN_CHILDHOOD_DAYS` (12) and `HUMAN_VENERABLE_AGE` (60) moved from `dayCycle.ts` to
   `dayCycleConstants.ts`, which is already the age-ladder's home (`HUMAN_ADULT_MIN_AGE` lives there)
   and has **no game-module dependencies at all** — so it cannot participate in a cycle.
2. `dayCycle.ts` imports them for its own use and **re-exports** them, so existing callers keep
   working unchanged (`tests/adultFloor.age18.test.ts`, `tests/immigration.composition.test.ts`).
3. `citizenId.ts` now imports them from `./dayCycleConstants`, which removes the `citizenId → dayCycle`
   edge and with it the whole cycle.

`HUMAN_VENERABLE_AGE` had exactly one importer (`citizenId`) and `HUMAN_CHILDHOOD_DAYS` three, so the
blast radius was three lines plus the definition move.

## Regression test

The gate itself is the regression test: `npm run audit:deps:cycles:strict` must exit 0. It is
self-asserting (it fails on 0 modules cruised), which is the defect that removing `dependency-cruiser`
fixed — see the roadmap's N33/T1 rows.

## Invariants checked

Pure relocation: both constants keep their values (12 / 60), `dayCycle`'s own uses are unchanged
through the import, and the re-export keeps the two existing test imports resolving. No save,
simulation, worker or tick-layer impact.

## Save/migration impact

None.

## Verification result

**Resolved 2026-09-20.** `npm run audit:deps:cycles:strict` → `No runtime import cycles.` /
`Import-cycle gate OK — 334 modules checked.` (exit 0). `npm run audit:deps` no longer lists any
runtime cycle.

Still reported and **deliberately not fatal**: one **type-only** 7-module cycle
(`adjacencyIndex · beautyGrid · challenges · gameTypes · scentGrid · spatialGrid · stats`), which is
erased at run time and is the warning the roadmap's T1 row records.

## Related commits or files

- `src/game/dayCycleConstants.ts` — the two constants move here
- `src/game/dayCycle.ts` — imports them, re-exports them, no longer defines them
- `src/game/citizenId.ts` — imports from the owner instead of the hub
- `scripts/check-import-cycles.mjs` — the gate
- `tests/adultFloor.age18.test.ts`, `tests/immigration.composition.test.ts` — unaffected, via the re-export
- Roadmap rows **T1** and **N33** — the contract and the precedent
