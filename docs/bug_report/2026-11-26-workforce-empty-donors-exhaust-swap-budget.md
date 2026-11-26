# Empty workplaces consume the vacancy-swap donor budget

- Bug: Empty and immovable donor sites consume the eight-check allowance and can hide a viable staffed donor.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main at `ab0525ce`, fix on PR #213
- Reporter: source audit and focused regression
- Area: workforce / automatic staffing
- Owner module: `src/game/workforce.ts`
- Related PR: [#213](https://github.com/Rengerams/wilderfolk/pull/213)

## Status history
- 2026-11-26 — investigating: source defect corrected; regression passed on head `22ac3cb5`; latest-head and live-save verification pending.

## Observed behavior
Empty and immovable donor sites consume the eight-check allowance and can hide a viable staffed donor.

## Expected behavior
Skip sites with no movable staff before consuming the allowance; retain existing route and transfer limits.

## Reproduction steps
Create two Quarry sites with one incumbent able to reach the vacancy, an idle worker near the original site, and ten empty distant Quarry sites. Rebalance must swap and backfill the donor.

## Evidence
Source trace at base `ab0525ce`; regression on PR #213, head `22ac3cb5`. tests/workforce.persistentCommute.test.ts — 8 tests passed.

## Root cause
The reverse-priority scan decrements donorChecksLeft before checking the indexed movable count.

## Fix / proposed fix
Skip sites with no movable staff before consuming the allowance; retain existing route and transfer limits.

## Save/migration impact
None. No new persisted fields or schema changes.

## Verification result
GitHub Actions Node.js CI, run 45849306866, head 22ac3cb5: focused workforce suites passed; full standard suite 3,037 passed / 1 failed (idle exact-tie regression addressed in follow-up). All three population performance workflows, housing regression and required calendar scheduler passed. Follow-up head CI and live-save reproduction not yet verified.
