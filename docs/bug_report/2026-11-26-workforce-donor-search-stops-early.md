# Staffing capacity search abandons larger eligible donors

- Bug: A small donor that cannot lend above the recipient baseline stops the search even when a larger eligible donor remains.
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
A small donor that cannot lend above the recipient baseline stops the search even when a larger eligible donor remains.

## Expected behavior
Reject that donor and continue the existing search.

## Reproduction steps
Create three Markets with 1, 2 and 3 workers. Rebalance at tick 100. Expect 2/2/2 without lowering protected coverage.

## Evidence
Source trace at base `ab0525ce`; regression on PR #213, head `22ac3cb5`. tests/workforce.autoTransferCooldown.test.ts — 16 tests passed.

## Root cause
The capacity pass selects the smallest donor first and breaks on insufficient recipient-relative surplus.

## Fix / proposed fix
Reject that donor and continue the existing search.

## Save/migration impact
None. No new persisted fields or schema changes.

## Verification result
GitHub Actions Node.js CI, run 45849306866, head 22ac3cb5: focused workforce suites passed; full standard suite 3,037 passed / 1 failed (idle exact-tie regression addressed in follow-up). All three population performance workflows, housing regression and required calendar scheduler passed. Follow-up head CI and live-save reproduction not yet verified.
