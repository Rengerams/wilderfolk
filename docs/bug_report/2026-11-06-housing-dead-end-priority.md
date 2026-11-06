# Unresolved homelessness lost priority to optional food construction

- Bug: Unresolved homelessness lost priority to optional food construction.
- Status: resolved (source only; runtime unverified)
- Severity: high
- Date discovered: 2026-11-06
- Version/build: PR #126, V.0.6.5.2 development branch
- Reporter: source review and user-supplied test findings
- Area: virtualPlayer.ts
- Owner module: virtualPlayer.ts
- Related PR: https://github.com/Rengerams/wilderfolk/pull/126

## Status history
- 2026-11-06 — reported with static trace or targeted failure; remediation committed to the PR, verification pending.

## Observed behavior
Two acceptance tests found a Fishing Spot proposal while unhoused settlers had no legal House plot, even though demolition or expansion could restore housing.

## Expected behavior
A valid action must respect the single owner, available resources and staff, persistent established jobs, and existing safety constraints.

## Reproduction steps
tests/virtualPlayer.test.ts: expands a home when homeless have nowhere left to build; clears redundant empty outbuilding when no room is left.

## Evidence
tests/virtualPlayer.test.ts; these existing acceptance cases.

## Root cause
The original decision path did not consider the needed boundary condition described above.

## Fix / proposed fix
The current PR's decideHousing checks no legal House plot and tries the canonical redundant-building demolition first, then a permitted existing-home upgrade, before returning to food work. Housing and food remain one Virtual Player ladder.

## Save/migration impact
No save schema changes; existing valid jobs must be preserved.

## Verification result
Targeted tests, type check, lint, build and extended simulation: NOT RUN in this session; CI status is tracked separately.
