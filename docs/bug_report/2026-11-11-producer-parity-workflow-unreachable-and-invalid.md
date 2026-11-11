# Historical producer parity check is gated on an obsolete branch and has invalid JavaScript

- Bug: Historical producer parity check is gated on an obsolete branch and has invalid JavaScript.
- Status: investigating — fix committed on fix/audit-ci-gates-20261111, verification pending
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.2 development, main 926eb5f
- Reporter: 2026-11-11 code audit
- Area: test and CI infrastructure
- Owner module: .github/workflows/calendar-scheduler.yml
- Related branch: fix/audit-ci-gates-20261111

## Status history
- 2026-11-11 — investigating: reproduced by a source-level control-flow trace; targeted configuration patch committed, CI pending.

## Observed behavior
The producer-parity job only runs when the PR head equals `fix/a1-calendar-restpunten-20261107`, so it is skipped for normal PRs and main pushes. If activated, its final Node script contains `for (const day of)` and cannot parse. The simulation output is piped through `tee` without explicitly enabling Bash pipefail.

## Expected behavior
The expensive historical A1 comparison is an explicit, usable optional check. When selected, it compares days 7, 30 and 360, failing on missing checkpoints or failed harness commands; the short calendar scheduler remains required.

## Reproduction steps
1. Inspect the `producer-parity` job in `.github/workflows/calendar-scheduler.yml` at main `926eb5f`.
2. Its branch-name condition is false for any other head, and the push event does not provide a PR head.
3. `for (const day of)` is invalid JavaScript; a run would fail in the final comparison step.

## Evidence
The named exact source paths and step conditions above were read at main `926eb5f`; no runtime outcome is invented.

## Root cause
A one-off historical branch condition persisted and the checkpoint loop lost its iterable list.

## Fix / proposed fix
Make the expensive job opt-in via typed `workflow_dispatch.inputs.producer_parity`, repair `for (const day of [7, 30, 360])`, and use explicit Bash for `-eo pipefail`. Keep the short calendar scheduler running on every PR and main push.

## Save/migration impact
None. No gameplay or persisted-state code changes.

## Verification result
NOT RUN for the optional 360-day job; manual dispatch and full workload remain to be verified. Calendar scheduler is exercised by PR CI.
