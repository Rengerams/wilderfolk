# Unasserted 90-day diagnostic runs in ordinary Vitest suite

- Bug: Unasserted 90-day diagnostic runs in ordinary Vitest suite.
- Status: resolved (source only; runtime unverified)
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: PR #126, V.0.6.5.2 development branch
- Reporter: source review and user-supplied test findings
- Area: tests/tmp-probe-mirror.test.ts; scripts/probe-mirror.mts
- Owner module: tests/tmp-probe-mirror.test.ts; scripts/probe-mirror.mts
- Related PR: https://github.com/Rengerams/wilderfolk/pull/126

## Status history
- 2026-11-06 — reported with static trace or targeted failure; remediation committed to the PR, verification pending.

## Observed behavior
Vitest previously discovered a 90-day, 900-second-cap mirror of colony simulation with log writes and diagnostic global overrides but no assertions. It could pass regardless of gameplay outcomes.

## Expected behavior
A valid action must respect the single owner, available resources and staff, persistent established jobs, and existing safety constraints.

## Reproduction steps
Run ordinary Vitest discovery or inspect tests/tmp-probe-mirror.test.ts: the single test invokes run() unconditionally.

## Evidence
Vitest discovery not run; test absent from tests/ and standalone entry present.

## Root cause
The original decision path did not consider the needed boundary condition described above.

## Fix / proposed fix
Probe moved to scripts/probe-mirror.mts and test file deleted. Invoke explicitly with npx tsx scripts/probe-mirror.mts; DAYS, FEATURES and LOG remain configurable. Global diagnostics and capture are reset in finally.

## Save/migration impact
No save schema changes; existing valid jobs must be preserved.

## Verification result
Targeted tests, type check, lint, build and extended simulation: NOT RUN in this session; CI status is tracked separately.
