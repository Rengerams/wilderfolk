# Full test gate references a nonexistent Build step

- Bug: Full test gate references a nonexistent Build step.
- Status: investigating — fix committed on fix/audit-ci-gates-20261111, verification pending
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: 0.6.5.2 development, main 926eb5f
- Reporter: 2026-11-11 code audit
- Area: test and CI infrastructure
- Owner module: scripts/test.mjs
- Related branch: fix/audit-ci-gates-20261111

## Status history
- 2026-11-11 — investigating: reproduced by a source-level control-flow trace; targeted configuration patch committed, CI pending.

## Observed behavior
`GATE.full` ends in `Build`, but the step registry defines only lowercase `build`. `GATE[name].map()` therefore produces `undefined` for its final command; it cannot run the intended production build.

## Expected behavior
`npm test -- full` completes every scheduled verification step and ends with `npm run build`.

## Reproduction steps
1. Read `GATE.full` and `STEP.build` in `scripts/test.mjs` at main `926eb5f`.
2. Compare the case-sensitive property key `Build` with `build`.
3. The runner attempts to spawn an undefined command if earlier full checks pass.

## Evidence
The named exact source paths and step conditions above were read at main `926eb5f`; no runtime outcome is invented.

## Root cause
Case mismatch in the central runner's step-key list.

## Fix / proposed fix
Change `Build` to `build` in `GATE.full`; keep the existing canonical `STEP.build` command.

## Save/migration impact
None. No gameplay or persisted-state code changes.

## Verification result
NOT RUN for the entire full-duration gate; source mapping corrected, and the PR standard CI must pass separately.
