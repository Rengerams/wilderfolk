# Calendar regression coverage is not enforced

- Bug: TEST-11
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1
- Reporter: 2026-11-07 full audit
- Area: test quality / calendar phase owners
- Owner module: vitest.config.ts (coverage thresholds); .github/workflows (required gate)
- Related branch: fix/a2-fast-calendar-ci-gate-20261107

## Status history
- 2026-11-07 — open: standard unit tests assert outcomes but do not enforce any coverage floor.
- 2026-11-07 — investigating: calendar-owner coverage floor scoped narrowly to prevent expensive whole-project collection on every PR.
- 2026-11-07 — resolved: scoped V8 report measured 72.09% statements, 54.28% branches, 71.42% functions and 76.69% lines; ratcheted CI floors pass.

## Observed behavior
The default CI does not run Vitest with --coverage, and vitest.config.ts has no coverage thresholds. Entire calendar paths could become untested without a coverage regression signal.

## Expected behavior
A fast, always-required, targeted calendar coverage floor should fail when the measured owner coverage drops below the configured baseline. Larger directory thresholds can ratchet in later clusters.

## Reproduction steps
1. Inspect node.js.yml and vitest.config.ts.
2. Neither --coverage nor thresholds appears in the required check.
3. Run of unit tests alone cannot ensure a coverage minimum.

## Evidence
Full audit TEST-11 plus inspected workflow and Vitest config.

## Root cause
No minimum coverage contract is configured for critical scheduling code.

## Fix / proposed fix
Enable V8 coverage only for the calendar scheduler modules in the dedicated CI gate, with explicit low-but-real baseline thresholds and full text summary. Ratchet thresholds after a measured run; do not add whole-app instrumentation to the rapid check.

## Save/migration impact
none.

## Verification result
PASS — GitHub Actions run 42412449453, 11/11 tests: measured statements 72.09% (floor 65%), branches 54.28% (floor 45%), functions 71.42% (floor 60%), lines 76.69% (floor 70%). Targeted modules only; not a whole-repository threshold.
