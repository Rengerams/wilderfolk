# Bonded apprentices enter workforce swap and donor eligibility

- Bug: A bonded apprentice can be selected as swap backfill or counted as movable supply; the assignment transition refuses the appointment after the incumbent moves.
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
A bonded apprentice can be selected as swap backfill or counted as movable supply; the assignment transition refuses the appointment after the incumbent moves.

## Expected behavior
Reuse the idle selector and reserve apprentices in the shared transfer gate, including food emergencies.

## Reproduction steps
Create a Quarry with one incumbent able to commute to a vacancy and a bonded apprentice near the original Quarry. Rebalance; the incumbent must retain the original post. Separately test a Quarry with two bonded apprentices and a Farm vacancy during an emergency.

## Evidence
Source trace at base `ab0525ce`; regression on PR #213, head `22ac3cb5`. tests/workforce.persistentCommute.test.ts — 8 passed; tests/workforce.autoTransferCooldown.test.ts — 16 passed.

## Root cause
The separate swap filter and shared transfer eligibility lacked the apprentice guard.

## Fix / proposed fix
Reuse the idle selector and reserve apprentices in the shared transfer gate, including food emergencies.

## Save/migration impact
None. No new persisted fields or schema changes.

## Verification result
GitHub Actions Node.js CI, run 45849306866, head 22ac3cb5: focused workforce suites passed; full standard suite 3,037 passed / 1 failed (idle exact-tie regression addressed in follow-up). All three population performance workflows, housing regression and required calendar scheduler passed. Follow-up head CI and live-save reproduction not yet verified.
