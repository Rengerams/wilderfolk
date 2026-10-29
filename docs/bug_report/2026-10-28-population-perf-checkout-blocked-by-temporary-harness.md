# Population benchmark checkout blocked by temporary untracked harness

- Bug: All three PR #99 population benchmarks abort before the candidate run because checkout would overwrite an untracked benchmark script.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: PR #99, commit `565b157e`
- Reporter: GitHub Actions failures and user-provided error
- Area: population performance CI
- Owner module: `.github/workflows/perf-population-reusable.yml`
- Related PR/commit: [PR #99](https://github.com/Rengerams/wilderfolk/pull/99); fix `d007fee8`

## Status history
- 2026-10-28 — open: Small, medium and large CI benchmarks failed at the candidate checkout.
- 2026-10-28 — investigating: Committed cleanup of the baseline-only untracked script; candidate CI rerun pending.

## Observed behavior
The baseline benchmark completes, but the next step fails with `The following untracked working tree files would be overwritten by checkout: scripts/perf-population-colony.mts`. No candidate timings are produced for the affected runs.

## Expected behavior
Baseline and candidate measurements use the same harness and run consecutively; switching from the baseline commit to the PR commit must not be blocked by temporary files.

## Reproduction steps
1. On PR #99 commit `565b157e`, run any of the small (250), medium (750) or large (1,800) population workflows in 2-day comparison mode.
2. The baseline step checks out `$BASE_SHA` and creates `scripts/perf-population-colony.mts` with `git show "$HEAD_SHA:scripts/perf-population-colony.mts" > scripts/perf-population-colony.mts`.
3. The candidate step calls `git checkout --detach "$HEAD_SHA"` and aborts because the generated script is untracked in the baseline tree but tracked at the PR head.

## Evidence
GitHub Actions runs [250](https://github.com/Rengerams/wilderfolk/actions/runs/40776337140), [750](https://github.com/Rengerams/wilderfolk/actions/runs/40776337286), and [1,800](https://github.com/Rengerams/wilderfolk/actions/runs/40776337274) all fail during `Benchmark PR with real simulation and VirtualPlayer` with the same checkout error.

## Root cause
The reusable workflow copies the PR-only benchmark script into the baseline working tree. That file is untracked in the baseline commit, and Git refuses to replace it with the tracked copy during checkout.

## Fix / proposed fix
Commit `d007fee8` inserts `git clean -f -- scripts/perf-population-colony.mts` before candidate checkout. This path-limited cleanup deletes only untracked files and does not remove a tracked harness during the 180-day manual run. No game logic or benchmark methodology changed.

## Save/migration impact
None.

## Verification result
- FAIL before fix: three PR #99 population comparisons stopped at Git checkout, with baseline logs retained.
- NOT RUN locally: repository checkout and benchmarks unavailable in this connector-only edit.
- PENDING: latest-head CI run must complete baseline, checkout, candidate measurement and report validation before this report becomes resolved.
