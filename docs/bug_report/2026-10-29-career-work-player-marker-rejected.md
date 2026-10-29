# Explicit player-owned settlers could not earn career workdays

- Bug: The career-credit writer and its attendance recorder rejected any truthy faction, including a legacy explicit `'player'` marker accepted by the canonical player-owned predicate.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: PR #99, 0.6.5.2 development branch
- Reporter: source audit of PR-D acceptance
- Area: schedule attendance and career credit
- Owner module: `src/game/scheduleFatigue.ts` (attendance writer), `src/game/careers/careerHistory.ts` (career credit writer); `src/game/playerHuman.ts` owns the player-membership rule
- Related PR/commit: #99, corrections `f790ca07`, `a2ebdb64`, regression `3f9e8370`

## Status history
- 2026-10-29 — investigating: reproduced by source inspection of both truthy-faction gates, corrected to share player membership and committed a direct regression; CI verification pending.

## Observed behavior
`isPlayerHuman` deliberately accepts a Human whose faction is absent or is a legacy marker not classified as foreign (e.g. `'player'`). Yet `recordScheduleWorkTick` returned before recording their actual shift, and `recordCareerWork` rejected previously observed attendance for that same person. The economy's `playerWorkers` already used the canonical predicate, so its membership and the two work-credit gates disagreed.

## Expected behavior
A living, eligible player-owned adult with a real, verifiable site/job shift earns one bounded career day, regardless of whether a legacy explicit `'player'` marker is present. Foreign factions (`rival`, `visitor`, `trade_caravan`) still earn none.

## Reproduction steps
1. Create a valid adult Farmer assigned to a completed Farm with a legacy `'player'` marker.
2. Record one hour through `recordScheduleWorkTick`, settle the last-worked site/job through `resolveDailyScheduleFatigue`, then call `recordCareerWork`.
3. Before the change the attendance counter remains empty and the career writer rejects the entity. With the correction both owners use `isPlayerHuman`. Foreign entities remain excluded.

## Evidence
The inspected PR-head source previously contained `entity.faction` in `scheduleFatigue.recordScheduleWorkTick` and `worker.faction` in `careerHistory.recordCareerWork`, unlike `dailyBuildingEconomy` which filters with `isPlayerHuman`. `tests/careers.history.test.ts` now pins the entire record→settle→credit path and exclusion for three foreign factions.

## Root cause
Duplicated truthy-faction eligibility checks diverged from the sole player-membership classifier when legacy world/test data uses an explicit player marker.

## Fix / proposed fix
Use the existing `isPlayerHuman` predicate directly from both existing decision owners, preserving age, prison, real-work provenance, job/site matching and once-per-day limits. No extra world scans or new helper, owner, RNG call, alias or persisted field.

## Save/migration impact
None. Works with existing optional faction field and unchanged career save representation.

## Verification result
- Deterministic source trace: PASS.
- Regression test: ADDED, NOT YET RUN.
- Typecheck, lint, build and post-merge CI: NOT YET RUN.
