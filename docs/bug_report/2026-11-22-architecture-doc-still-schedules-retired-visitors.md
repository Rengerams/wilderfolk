# Architecture docs still schedule the retired visitor camps

- Bug: On-map visitor camps were retired and their tick has no caller, but the architecture doc, the ownership ledger and the TEST-16 report still describe the feature as running at 00:00.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-22
- Version/build: V.0.6.5.1 / `audit-simulation-logic` @ `ecd9866c`
- Reporter: simulation-logic audit 2026-11-22 (`docs/plans/simulation-logic-audit-2026-11-22.md`, F-03)
- Area: Documentation and dead simulation surface
- Owner module: `src/game/groupEvents.ts` (retired lifecycle) and the affected documents
- Related PR/commit: none yet

## Status history
- 2026-11-22 — open: confirmed by call-site search and a read of the three documents; not yet fixed.
- 2026-11-22 — open (documents fixed): the architecture layer/module/tree tables, the ownership ledger rows and the TEST-16 report were corrected or marked legacy; the two unreachable `state.visitorGroups` reads in `humanTick.ts` are still code work.
- 2026-11-22 — resolved: both `state.visitorGroups` reads in `humanTick.ts` are removed, with the performer target they fed in `humanLeisureBehavior.ts` and the dead performer courtship multiplier; the two tests that pinned them were updated.

## Observed behavior

- `ARCHITECTURE.md:114` lists "00:00 visitors" as daily-layer work.
- `OWNERSHIP_OVERVIEW.md:910` lists `tickVisitorGroups` as a live writer of the food ledger (`gift`)
  "on each inflow".
- `docs/bug_report/2026-11-07-visitor-groups-never-depart.md` is marked **resolved** by moving the
  visitor lifecycle call to 00:00; that call no longer exists.
- `humanTick.ts:481` and `humanTick.ts:1355` read `state.visitorGroups` for festival performers and
  courtship; the array is always empty because save loading clears it (both reads removed 2026-11-22).

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

Done 2026-11-22 (documents): `ARCHITECTURE.md` no longer lists 00:00 visitors in the daily layer
and describes `groupEvents.ts` as rivals plus a retired visitor lifecycle; the ownership ledger
rows for the daily scheduler, event-site sampling, yearly events, camp hit testing and highlights,
food-ledger sources and the visitor quest now say retired or legacy; the TEST-16 report carries a
deprecation banner.

Done 2026-11-22 (code): the two unreachable `state.visitorGroups` reads are gone — the festival
gathering target now resolves to the Square, else a staffed Town Hall, else the map centre; the
courtship rate keeps only the festival and cohabitation multipliers. The `festivalPerformers` input
of `tickHumanLeisure` went with them, and the two tests that pinned the performer branches now cover
only the shipped paths.

## Save/migration impact

None — the load path already strips visitor groups and actors.

## Verification result

- Reproduction: PASS — call-site search and document reads above.
- Fix (documents): PASS — the quoted `ARCHITECTURE.md` and `OWNERSHIP_OVERVIEW.md` lines no longer describe live visitors, and the TEST-16 report is marked deprecated.
- Fix (code): PASS — `rg -n "visitorGroups" src/game/humanTick.ts src/game/humanLeisureBehavior.ts` returns nothing; `npm run test:types`, `npm run lint`, the targeted vitest suites (`workerHandoff.state`, `humanLeisureBehavior`, `humanTick.hotPathIndexes`, `courtship.churchRestraint`, `personality.romanceContext`, `duplicationA.remaining`, `simulation.decisionRegistry`, `venueSchedule`), the semantic-duplicate and function-overlap gates all PASS.
- Docs check (`node scripts/test.mjs check`): PASS after the change.
