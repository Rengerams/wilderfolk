# Selected doorstep cannot satisfy arrival

- Bug: Selected doorstep cannot satisfy arrival.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-08
- Version/build: PR #134, a3349fac
- Reporter: Codex review / verification
- Area: src/game/buildingAccess.ts; src/game/simulation/humanMovement.ts
- Owner module: src/game/buildingAccess.ts; src/game/simulation/humanMovement.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/134

## Status history
- 2026-11-08 — resolved: traced the production path and verified the targeted regression.

## Observed behavior
A south wall covers the first 20 pixels beyond the facade. The 22-pixel outward point is open, but its inward midpoint remains blocked. Zero-distance steering divides by zero.

## Expected behavior
Require isAtBuildingReach for every candidate and guard zero-distance blocked fallback steering.

## Reproduction steps
1. Inspect PR head a3349fac.
2. Exercise the condition described above using `tests/buildingAccess.routeAround.test.ts`.
3. Observe the mismatch described in Observed behavior.

## Evidence
A south wall covers the first 20 pixels beyond the facade. The 22-pixel outward point is open, but its inward midpoint remains blocked. Zero-distance steering divides by zero. The focused tests cover the named regression through the actual owners.

## Root cause
Candidate selection checked only outward walkability.

## Fix / proposed fix
Require isAtBuildingReach for every candidate and guard zero-distance blocked fallback steering.

## Save/migration impact
None. Existing world and worker fields are reused.

## Verification result
PASS: npx vitest run tests/buildingAccess.routeAround.test.ts.
