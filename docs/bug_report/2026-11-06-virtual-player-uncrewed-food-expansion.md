# Measured deficit could grow food buildings without spare workers

- Bug: Measured deficit could grow food buildings without spare workers.
- Status: resolved (source only; runtime unverified)
- Severity: high
- Date discovered: 2026-11-06
- Version/build: PR #126, V.0.6.5.2 development branch
- Reporter: source review and user-supplied test findings
- Area: virtualPlayer.ts; workforce.ts
- Owner module: virtualPlayer.ts; workforce.ts
- Related PR: https://github.com/Rengerams/wilderfolk/pull/126

## Status history
- 2026-11-06 — reported with static trace or targeted failure; remediation committed to the PR, verification pending.

## Observed behavior
Under sustained negative food history, an incomplete-building limit of two did not prevent unlimited sequential new food buildings after existing vacant workplaces ran out of people.

## Expected behavior
A valid action must respect the single owner, available resources and staff, persistent established jobs, and existing safety constraints.

## Reproduction steps
Keep consecutive deficit days and no unemployed adults with multiple food vacancies. Each completed site formerly made room for yet another construction proposal.

## Evidence
tests/virtualPlayerHealthVerdict.test.ts; multi-day scarce-workforce and spare-worker counterexample.

## Root cause
The original decision path did not consider the needed boundary condition described above.

## Fix / proposed fix
decideFood now uses a single settlement worker-count pass, reserves vacancies at completed and under-construction food sites, and proposes another site only when a free adult remains; the first ever producer is a recovery exception. Existing measured yield and upgrades still drive priorities.

## Save/migration impact
No save schema changes; existing valid jobs must be preserved.

## Verification result
Targeted tests, type check, lint, build and extended simulation: NOT RUN in this session; CI status is tracked separately.
