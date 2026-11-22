# Architecture docs still schedule the retired visitor camps

- Bug: On-map visitor camps were retired and their tick has no caller, but the architecture doc, the ownership ledger and the TEST-16 report still describe the feature as running at 00:00.
- Status: open
- Severity: low
- Date discovered: 2026-11-22
- Version/build: V.0.6.5.1 / `audit-simulation-logic` @ `ecd9866c`
- Reporter: simulation-logic audit 2026-11-22 (`docs/plans/simulation-logic-audit-2026-11-22.md`, F-03)
- Area: Documentation and dead simulation surface
- Owner module: `src/game/groupEvents.ts` (retired lifecycle) and the affected documents
- Related PR/commit: none yet

## Status history
- 2026-11-22 — open: confirmed by call-site search and a read of the three documents; not yet fixed.

## Observed behavior

- `ARCHITECTURE.md:114` lists "00:00 visitors" as daily-layer work.
- `OWNERSHIP_OVERVIEW.md:910` lists `tickVisitorGroups` as a live writer of the food ledger (`gift`)
  "on each inflow".
- `docs/bug_report/2026-11-07-visitor-groups-never-depart.md` is marked **resolved** by moving the
  visitor lifecycle call to 00:00; that call no longer exists.
- `humanTick.ts:481` and `humanTick.ts:1355` still read `state.visitorGroups` for festival performers
  and courtship; the array is always empty because save loading clears it.

## Expected behavior

The maintained documents describe the shipped simulation: no visitor camp or visitor actor is
spawned or ticked, and the retired surface is either removed or explicitly marked as legacy
save-compatibility code.

## Reproduction steps

1. `rg -n "tickVisitorGroups|spawnVisitorGroup|tryMidYearVisitorEvent|tryFirstWeekVisitor" src/` —
   only definitions and registry prose appear; no call site.
2. `rg -n "00:00 visitors" ARCHITECTURE.md` — still listed as daily work.
3. `rg -n "tickVisitorGroups" OWNERSHIP_OVERVIEW.md` — still listed as a live ledger writer.

## Evidence

- `src/game/groupEvents.ts:257, 336, 1000, 1014` — definitions with no caller.
- `src/game/saveLoad.ts:1529` — `visitorGroups: []`; `saveLoad.ts:1549` — visitor actors filtered out.
- `src/game/simulation/decisionRegistry.ts:449` — "No visitor camps or actors are spawned."
- Documents quoted above.

## Root cause

The feature was retired in code (and the load path was migrated), but the documentation and two
read-only branches were not retired with it.

## Fix / proposed fix

Update the architecture layer table and the ownership ledger to state that visitor camps are
retired; correct the TEST-16 report's fix/verification section to record that the lifecycle was
removed rather than rescheduled; drop the two unreachable `state.visitorGroups` reads in
`humanTick.ts` with the rest of the retired surface.

## Save/migration impact

None — the load path already strips visitor groups and actors.

## Verification result

- Reproduction: PASS — call-site search and document reads above.
- Fix: NOT IMPLEMENTED.
- Docs check (`node scripts/test.mjs check`): PASS before the change.
