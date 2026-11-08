# Standalone probes bypass normal movement integration

- Bug: Standalone probes bypass normal movement integration.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-08
- Version/build: PR #134, a3349fac
- Reporter: Codex review / verification
- Area: scripts/colonyHealth.ts; scripts/run-full-year.mts
- Owner module: scripts/colonyHealth.ts; scripts/run-full-year.mts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/134

## Status history
- 2026-11-08 — resolved: traced the production path and verified the targeted regression.

## Observed behavior
The approach probe integrated velocity directly and omitted the collision grid; commute and day-budget scripts also constructed separate worlds and copied timing rules.

## Expected behavior
Remove the three scripts; add --movement observation after normal gameTick in the existing full-year harness. Reports use actual positions, canonical reach, configured shift and loop pacing.

## Reproduction steps
1. Inspect PR head a3349fac.
2. Exercise the condition described above using `tests/colonyProducerCommute.test.ts`.
3. Observe the mismatch described in Observed behavior.

## Evidence
The approach probe integrated velocity directly and omitted the collision grid; commute and day-budget scripts also constructed separate worlds and copied timing rules. The focused tests cover the named regression through the actual owners.

## Root cause
New measurements were implemented outside the established harness.

## Fix / proposed fix
Remove the three scripts; add --movement observation after normal gameTick in the existing full-year harness. Reports use actual positions, canonical reach, configured shift and loop pacing.

## Save/migration impact
None. Existing world and worker fields are reused.

## Verification result
PASS: npx vitest run tests/colonyProducerCommute.test.ts.
