# Newly assigned industry workers cannot rescue an empty Farm during famine

- Bug: Newly assigned industry workers cannot rescue an empty Farm during famine.
- Status: resolved (source only; runtime unverified)
- Severity: high
- Date discovered: 2026-11-06
- Version/build: PR #126, V.0.6.5.2 development branch
- Reporter: source review and user-supplied test findings
- Area: workforce.ts; virtualPlayer.ts; economyLedger.ts
- Owner module: workforce.ts; virtualPlayer.ts; economyLedger.ts
- Related PR: https://github.com/Rengerams/wilderfolk/pull/126

## Status history
- 2026-11-06 — reported with static trace or targeted failure; remediation committed to the PR, verification pending.

## Observed behavior
The 60-day transfer cooldown blocked otherwise viable food staffing even after the verified food-production ledger and stored food showed a crisis. Prior Virtual Player fallback could also release the only worker from an essential industry post.

## Expected behavior
A valid action must respect the single owner, available resources and staff, persistent established jobs, and existing safety constraints.

## Reproduction steps
Make a completed Farm vacant while a Lumber Mill has two recent assignments, all under cooldown, with several consecutive days of net-negative food and fewer than six days of stores.

## Evidence
tests/virtualPlayerHealthVerdict.test.ts; recent-assignment rescue and single industry worker protection.

## Root cause
The original decision path did not consider the needed boundary condition described above.

## Fix / proposed fix
One shared economy-ledger measured deficit verdict and workforce-owned acute emergency threshold trigger a food-only bypass in existing rebalanceJobWorkers. Normal non-food transfers retain cooldown; protected donor minimums, prison exclusion and reachable commuting remain mandatory. Workforce fingerprint includes emergency status.

## Save/migration impact
No save schema changes; existing valid jobs must be preserved.

## Verification result
Targeted tests, type check, lint, build and extended simulation: NOT RUN in this session; CI status is tracked separately.
