# Repeated prisoner rations debit food more than once

- Bug: Repeating the 08:00 meal attempt for one foreign captive debits multiple food units on the same colony day.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: PR #100, commit 517099ea34ae249ce5a2fb625d6604ba6fc59de6
- Reporter: failed Node.js CI and code audit
- Area: human meal transactions and captivity
- Owner module: simulation/humanNeeds.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/100

## Status history
- 2026-10-29 — open: two regression tests fail because a second meal request at 08:00 consumes food again.
- 2026-10-29 — investigating: an optional persisted lastRationDay field is written after a successful food debit; focused tests and CI verification are pending.

## Observed behavior
The previous canEatColonyMeal gate checked only the 08:00 hour and ignored whether a ration had already been paid. Calling tryEatColonyMeal twice for the same prisoner at one tick returned true twice, consuming two food units.

## Expected behavior
One unit of food at most per captive per calendar day, and only if food was available and actually debited. No energy or player physiology is created. Another captive may independently receive a ration, and a new calendar day permits a new ration.

## Reproduction steps
1. Use the foreign captive fixtures in tests/humanNeeds.mealRule.test.ts and tests/personality.captiveEnergyIntegration.test.ts.
2. Call tryEatColonyMeal twice at the same 08:00 hour and observe the second result.
3. Save and reload a fed captive at 08:00; a repeated attempt must not debit another unit.
4. Advance to 08:00 the following day; the same captive may consume one new ration.

## Evidence
The earlier Node.js CI on PR #100 failed tests/humanNeeds.mealRule.test.ts:70 and tests/personality.captiveEnergyIntegration.test.ts:23, both expecting false from the second meal call.
The meal gate previously returned hourOfDay === 8 for every captive call.

## Root cause
The only food transaction owner lacked a per-captive persisted last-fed-day guard.

## Fix / proposed fix
Add optional lastRationDay to the existing warCaptive record; compare it with the authoritative absolute calendar day in canEatColonyMeal, and update it only after spendFood succeeds in tryEatColonyMeal. Reject invalid persisted day values on save load.

## Save/migration impact
The new custody field is optional, so old saves with no ration stamp remain readable. The field is serialized with the existing warCaptive payload, preventing duplicate charges after reload. Recruitment or recapture creates or discards the relevant custody record normally.

## Verification result
Focused regression cases and persistence validation committed with PR #100: code prepared. Latest-head CI and local suite: NOT YET VERIFIED at report edit.
