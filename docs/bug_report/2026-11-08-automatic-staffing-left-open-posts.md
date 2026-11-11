# Automatic staffing left every workplace at a single worker

- Bug: A finished workplace with several worker posts kept only its protected minimum (one hand, or the food/guard minimum) while another workplace held a clear surplus, so its remaining posts stayed open forever.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: master-approach-buglist at `cb070512`
- Reporter: owner observation in play — "he doesn't assign more workers to one building"
- Area: workforce / automatic staffing
- Owner module: `src/game/workforce.ts` (`rebalanceJobWorkers`, `pickOverstaffedDonor`)
- Related plan: `docs/plans/persistent-automatic-workforce-2026-11-06.md`

## Status history
- 2026-11-08 — resolved: a capacity pass now fills open posts from a workplace holding at least two more workers; protected coverage still runs first, and the new regression cases plus the staffing suites pass.

## Observed behavior
`rebalanceJobWorkers` filled each job building only up to `Math.min(capacity, minimumAutoCoverage(building))` — one worker for most trades, three for food and guards. With every adult already employed, `assignWorkerInPlace` had no idle settler left to hire, so a workshop showing "1 of 2 filled" never received the second hand even while a market or second mill of the same trade held three. Manual assignment had already been retired, so the player had no way to fill the post by hand.

## Expected behavior
The workforce owner fills a workplace's open posts up to its capacity when another workplace keeps more hands than it needs, while food and guard coverage stays protected and a settler is never moved for a marginal difference (which would otherwise bounce a worker back on the next pulse).

## Reproduction steps
1. Take a world at tick 5000 with `workforcePolicy: 'survival'`, a completed Workshop (capacity 2) holding one worker and a completed Market (capacity 3) holding three.
2. Call `assignMissingWorkers` (or `rebalanceJobWorkers`) before this change: the Workshop stays at 1 of 2 and the Market keeps all three.
3. After this change: the Workshop reaches 2, the Market drops to 2, and a second pulse moves nobody.

## Evidence
- `src/game/workforce.ts` — the rebalance target was `Math.min(capacity, minimumAutoCoverage(needy))`.
- Probe with the described world: `workshop 1/2 | market 3/3` before, `workshop 2/2 | market 2/3` after, unchanged on four later pulses.
- `tests/workforce.capacityFill.test.ts` (5 cases) and the staffing suites pass; `tests/workforce.autoTransferCooldown.test.ts` now asserts the topped-up contract.

## Root cause
The rebalance pass treated "protected minimum coverage" as the final target instead of the first step, so open posts above that minimum were only reachable from unemployed adults — a pool that is empty in a mature colony.

## Fix / proposed fix
`rebalanceJobWorkers` keeps its coverage pass and adds a second pass up to `staffingCapFor(...).cap`. `pickOverstaffedDonor` gained an optional minimum donor count; the capacity pass asks for `staffed + 2`, so a workplace that is only one hand ahead never donates. That bound keeps the rosters stable: after one move the two workplaces are at most one apart, so no worker is bounced back.

## Save/migration impact
None. No schema, save field or job identity changes; only which existing workplace a transferred settler works at.

## Verification result
- `npx tsx tmp/staff-probe4.ts` — PASS: workshop 1 → 2 from a market at 3 (market 2), farm coverage restored from a quarry surplus, and idle pulses changed nothing.
- `npx vitest run` on the 14 staffing suites — PASS except the pre-existing `buildingPanel.staffingRule` "Walking to work" label case, which fails on the base commit as well and is unrelated.
- `npm run test:types` — PASS. Lint and build run at the end of the change.
