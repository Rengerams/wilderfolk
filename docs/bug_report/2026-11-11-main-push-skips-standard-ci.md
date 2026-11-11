# Main pushes report green CI without running the standard tests or build

- Bug: Main pushes report green CI without running the standard tests or build.
- Status: investigating — fix committed on fix/audit-ci-gates-20261111, verification pending
- Severity: high
- Date discovered: 2026-11-11
- Version/build: 0.6.5.2 development, main 926eb5f
- Reporter: 2026-11-11 code audit
- Area: test and CI infrastructure
- Owner module: .github/workflows/node.js.yml
- Related branch: fix/audit-ci-gates-20261111

## Status history
- 2026-11-11 — investigating: reproduced by a source-level control-flow trace; targeted configuration patch committed, CI pending.

## Observed behavior
The `Run PR checks and affected tests` step has `if: github.event_name == 'pull_request'`. A push to `main` runs the job but skips its only standard test and build step. The baseline preparation alone can succeed, so a green push check does not establish build health.

## Expected behavior
Every PR and main push must run source checks and build; PR may limit the unit subset using `--changed`, but main must run the full standard suite.

## Reproduction steps
1. Inspect `.github/workflows/node.js.yml` before this patch.
2. Follow the `push` trigger for `main`; the test/build step's condition evaluates to false.
3. Inspect main run 42988848465: its `build` job completed successfully despite the PR-only step.

## Evidence
The named exact source paths and step conditions above were read at main `926eb5f`; no runtime outcome is invented.

## Root cause
A job-level push trigger and step-level PR-only condition disagree.

## Fix / proposed fix
Remove the step-level condition and branch within the shell: `pull_request` uses `npm test -- standard --changed "$PR_BASE_SHA"`; `push` uses `npm test -- standard`; both run `npm run check:source` and `npm run build`.

## Save/migration impact
None. No gameplay or persisted-state code changes.

## Verification result
NOT RUN for patched push-to-main behavior; requires an actual push after merge. PR workflow verifies the PR path.
