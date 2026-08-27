# R2 Rival Daily Simulation — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `rivalProfiles.ts` for action policy and ledger transactions; `rivalEvents.ts` for the existing new-calendar-day rival owner; `FrontierPanel.tsx` for read-only latest-action feedback
**Cadence:** at most one action per eligible rival when the existing `daysUntilAction` reaches zero

## Player outcome

Each eligible rival now selects at most one bounded daily action from its profile, relationship, recovery pressure, and ledger availability. The action spends or restores only rival-owned ledger values and records a concise event-log entry. The Frontier panel shows the latest successful action, recovery pressure, and current ledger values.

The existing raid and diplomacy scheduling remain distinct frontier systems. R2 does not turn a daily action into a guaranteed raid, does not add player diplomacy commands, and does not change player resources.

## Action contract

| Action | Selection reason | Ledger effect |
|---|---|---|
| Recover | Recovery below 45 with provisions | −5 food, +22 recovery, +2 morale |
| Gather | Low supplies or fallback action | +10 food, +6 wood, −6 recovery |
| Trade | Food/trade priority with gold | −5 gold, +15 food, −3 recovery |
| Fortify | Security/shelter priority with wood | −12 wood, −5 recovery |
| Scout | Tense relationship with gold | −3 gold, −4 recovery |
| Cool down | Partial recovery pressure | +10 recovery, +1 morale |
| None | No valid affordable action | No mutation and no forced event |

All ledger values remain bounded: resources 0–200, morale/recovery 0–100. The selector accepts an injected RNG for deterministic tests, while state-driven priority checks take precedence over random fallback selection.

## Simulation Change Record

- Owner boundary: `rivalEvents.ts` remains the single daily rival owner; `rivalProfiles.ts` contains pure selection and bounded transaction policy.
- Cadence: Existing new-calendar-day cadence and `daysUntilAction` cooldown are reused. No new tick layer or realtime population scan was added.
- State written: `RivalSettlement.profile.ledger`, `lastAction`, and `lastActionDay`; the existing `rivalSettlements` save/worker field carries the state.
- Authority: UI reads normalized copies and never mutates rival state. Daily simulation mutates state only in the existing rival owner.
- Non-effects: No player resource mutation, no automatic staffing, no guaranteed raid, no diplomacy outcome, no relationship mutation, and no change to School, Church, Town Hall, schedule, mortality, pregnancy, or relationship cadence.
- Legacy behavior: Missing R1 profiles are normalized before action selection; malformed ledger values are clamped before any transaction.
- Rollback plan: Remove the R2 selection/application call and latest-action display; R1 profile state remains backward-compatible.

## Validation

| Check | Result |
|---|---:|
| Focused R2 ledger/action tests | 1 file, 6 tests passed |
| Full regression/type suite | 75 files, 429 tests passed in the completed full-suite run |
| TypeScript after final config correction | Passed |
| Production build after final config correction | Passed; circular chunk and >500 kB warning remain visible |
| ESLint after final config correction | Passed |
| `git diff --check` after final config correction | Passed |

The first chained full-suite attempt reported one sidecar/worker-ready timeout in the test process; the completed full-suite run subsequently passed 75 files and 429 tests. The final re-run request was interrupted by a disconnected desktop sidecar after the build had already passed; no source test failure was reported in that interruption.

## Deferred non-goals

R3 player-directed diplomacy, demands, trade offers, tribute, relationship consequences, and R4 rival history/map storytelling remain deferred.
