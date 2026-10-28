# Wilderfolk test-suite optimization — 2026-10-28

## Baseline

GitHub Actions run 40679149798 passed on main 9be1356: 390 test files, 2,571 passed and 2 skipped cases; Vitest wall time 667.62 s. Long-run colony file alone took 216.42 s, warfare lifecycle 88.69 s and full terrain ground bake 80.09 s.

## Implementation

- Keep all 90-day bot, food, housing and growth assertions in their own integration test while preserving four isolated stall-verdict tests in the standard suite.
- The full runner includes both 90-day and 360-day integration coverage as well as the separate full-year fixture.
- Generate the known-valid save fixture once and clone it independently per case; preserve corrupt-field validations and global RNG cleanup.
- Cache full terrain preset renders and return independently cloned maps and pixel buffers. The determinism test forces a second fresh render.
- Avoid rerunning lint and duplication scanning during Node CI build; standalone build remains fully guarded.
- Run housing benchmarks only on relevant PR paths; short food-needs calibrations on PRs, 150-day recovery weekly and on manual dispatch.

## Deferred

No gameplay logic, save formats or existing assertions were modified. Keep historical audit tests until a proven equivalence check and module coverage audit allow safe deletion. Measured post-change timing and CI verification are required before claiming any achieved speedup.

## Bug report count

New bug reports: 0. Updated bug reports: 0. No new gameplay defect was discovered in this organizational change.
