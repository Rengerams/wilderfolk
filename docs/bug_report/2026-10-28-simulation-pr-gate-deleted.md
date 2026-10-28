# Simulation changes lost their separate long-run PR gate

- Bug: PR #93 removed the dedicated simulation workflow and supplied no replacement in the changed files.
- Status: investigating — bounded replacement added; GitHub Actions validation pending
- Severity: medium (CI coverage)
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2, PR #93
- Reporter: PR #93 audit
- Area: repository simulation CI
- Owner: `.github/workflows/simulation-120-day.yml`
- Related PR: [#93](https://github.com/Rengerams/wilderfolk/pull/93)

## Status history

- 2026-10-28 — confirmed in PR diff: the prior 360-day simulation workflow was removed; focused dialogue test jobs do not replace actual colony simulation.
- 2026-10-28 — user selected a shorter 120-day live colony test; replacement workflow committed, CI pending.

## Reproduction and observed behavior

Review PR #93's changed files before correction: `.github/workflows/simulation-360-day.yml` was deleted and no alternate live-simulation workflow was introduced.

## Expected behavior

Game-rule changes must still trigger a bounded real simulation with seeded bot decisions and checkpoint invariants; mere presentation changes should not trigger a slow simulation.

## Correction

Add `.github/workflows/simulation-120-day.yml`, triggered for game-rule PR changes or manual dispatch. It runs the existing producer scenario for **120 days** with seed 12345, the virtual player enabled, and 30-day invariant checkpoints. No 360-day CI run is restored.

## Regression and verification

The command is supported by the existing `run-full-year.mts --days` runner. The new workflow and actual CI result still require GitHub Actions confirmation. The longer historical test harness remains manually available.
