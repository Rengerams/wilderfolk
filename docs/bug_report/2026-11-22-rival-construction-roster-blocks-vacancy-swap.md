# Rival construction roster blocks a legal staffing vacancy swap

- Bug: A legacy unfinished rival building listing a free player settler as an occupant incorrectly excludes that settler from the idle replacement pool during a vacancy swap.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: `main` base `3122449ff1687084c07c2143387b1f88b1d14b18`; source inspected in PR #160
- Reporter: source-code review of PR #160, followed by Codex review comment
- Area: workforce / vacancy swap / construction-crew eligibility
- Owner module: `src/game/workforce.ts` (`swapReachableWorkersIntoVacancies`); membership rule owned by `src/game/workforceSummary.ts` (`buildConstructionCrewIndex`)
- Related PR/commit: [PR #160](https://github.com/Rengerams/wilderfolk/pull/160), source change `814a8ed5d372be74acb49e269c54382104e80eaf`

## Status history
- 2026-11-22 — investigating: source trace established that the swap's local scan included unfinished rival rosters, unlike the canonical player-only crew index.
- 2026-11-22 — fix committed in PR #160: swap now reuses the canonical index; static/index tests and a focused swap-level regression have been added. Fresh CI for the report/test commit is pending; do not treat it as verified yet.

## Observed behavior
The pre-fix `swapReachableWorkersIntoVacancies` implementation collected every unfinished building's `occupants` into `crewIds`, without checking `building.faction`. A free player settler whose id remains on a legacy rival site's roster is thus treated as a builder and excluded from the idle replacement list, even though that rival site is not a player construction assignment. When the swap needs that settler to refill the donor job, it cannot proceed and a reachable vacancy remains empty.

This is an evidence-backed static failure mode, not a confirmed observation from a live player save. Normal current rival settlements do not construct player-map buildings, but legacy or inconsistent saved data may still expose the faulty branch.

## Expected behavior
Only unfinished **player-owned** construction sites reserve a player settler from staffing. Rival rosters must not block a legal swap. All staffing paths use the same single read-only crew-index owner.

## Reproduction steps
1. Create a completed Lumber Mill at (600, 0) with one player worker near (850, 0), and an empty completed Quarry at (1200, 0); add an otherwise idle player settler near (100, 0).
2. Add an unfinished rival House to the building list, with the idle settler's id in its stale `occupants` list.
3. Run `rebalanceJobWorkers(humans, buildings, 'growth', 100)`. Before the fix the swap-level idle filter excludes the free settler, so the Mill worker cannot move to the Quarry and backfill the Mill.
4. With PR #160's index call, the swap may use the free settler to backfill the Mill while the original worker moves to the Quarry.

The focused `tests/economyWorkforce.auditRemediation.test.ts` scenario encodes this setup. It has not yet been executed on the new commit at the time of this report.

## Evidence
- Pre-fix `src/game/workforce.ts`: `swapReachableWorkersIntoVacancies` built `crewIds` by iterating `buildings` and checking only `!site.completed`.
- `src/game/workforceSummary.ts`: `buildConstructionCrewIndex` excludes `building.faction === 'rival'`, which the other staffing paths already use.
- `tests/workforce.transitions.test.ts`: index and working/idle ownership regressions, plus a check that the vacancy swap uses the canonical index.
- `tests/economyWorkforce.auditRemediation.test.ts`: a new swap-level legacy-rival-roster scenario, added in the same PR; fresh CI verification pending.

## Root cause
The vacancy-swap path retained an independently implemented construction roster scan after the player-only `buildConstructionCrewIndex` was made the canonical owner. The divergent scan did not enforce player ownership.

## Fix / proposed fix
Replace the local `Set`-construction loop in `swapReachableWorkersIntoVacancies` with `new Set(buildConstructionCrewIndex(buildings).keys())`. Keep `buildConstructionCrewIndex` read-only and preserve all actual workforce transitions in `workforce.ts`. No extra policy owner or scheduler is introduced.

## Save/migration impact
No schema or persistence change. This corrects behavior when legacy/inconsistent rival construction entries exist; loading and cleanup of such entries remain owned by their existing save pipeline.

## Verification result
- Pre-report source commit `b74a4db2c8b623c6c247d4610f0cb926d9f4c6f8`: **PASS** — seven GitHub Actions workflows (Node.js CI, 90-day housing regression, 120-day simulation, required calendar gate and 250/750/1800 population-performance gates).
- New focused swap-level regression and this documentation commit: **NOT RUN yet** at report creation; new PR-head CI results must be checked separately.
- Direct saved-game reproduction: **NOT RUN**. Static control-flow trace and deterministic test fixture establish the failure mode; no live-play observation is claimed.
