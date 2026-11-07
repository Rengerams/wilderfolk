# Day-boundary performance gate read an out-of-scope report

- Bug: The `PERF_DAY_BOUNDARY` ceiling check compared a `report` binding that only exists inside `bench`, so enabling the gate threw a `ReferenceError` and the harness type check was red.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1
- Reporter: owner-supplied `node scripts/test.mjs scripts-types` output
- Area: developer tooling — population performance harness
- Owner module: `scripts/perf-at-pop.ts` (`bench` is the sole owner; registered in `OWNERSHIP_OVERVIEW.md`)
- Related PR/commit: abaf9b0d added the check

## Status history
- 2026-11-07 — open: the scripts type check reported two TS2552 errors; the check could not run at all.
- 2026-11-07 — resolved: `bench` returns its report and `main` binds it; type check and a boundary-enabled smoke run pass.

## Observed behavior
`node scripts/test.mjs scripts-types` fails with `TS2552: Cannot find name 'report'` at the two lines of the
`PERF_DAY_BOUNDARY` check. At runtime the same check would throw `ReferenceError: report is not defined`
whenever the environment variable is set, so the 5 s ceiling could never be evaluated.

## Expected behavior
With `PERF_SAVE` and `PERF_DAY_BOUNDARY=1`, the harness compares the measured run's `maxMs` against the
5 000 ms ceiling and sets a failing exit code when it is exceeded.

## Reproduction steps
1. Run `node scripts/test.mjs scripts-types` → two TS2552 errors in `scripts/perf-at-pop.ts`.
2. Write a save (`PERF_INFRASTRUCTURE_VISUAL_SAVE=<path> npx tsx scripts/perf-at-pop.ts`).
3. Run `PERF_SAVE=<path> PERF_DAY_BOUNDARY=1 npx tsx scripts/perf-at-pop.ts` on the unfixed source → the
   comparison throws `ReferenceError` and the process exits 1 through `main().catch`.

## Evidence
The compile output names `report` at lines 298–299 and points at `REPORT` (the `PERF_REPORT` output path,
a different binding). `bench` built a `BenchmarkReport` and returned only `{ avg, p95 }`, while `main` called
it without capturing any result.

## Root cause
Commit abaf9b0d appended the ceiling check to `main`, where the only `report` identifier is `bench`'s local
`const`; it was never in scope at the call site.

## Fix / proposed fix
`bench` now returns the `BenchmarkReport` it pushes to `benchmarkReports`, and `main` binds that return as
`report` before evaluating the ceiling. No new helper, no second owner.

## Save/migration impact
None; harness-only change.

## Verification result
- `node scripts/test.mjs scripts-types` — PASS (1 step, 0 errors).
- Boundary-enabled smoke run (`PERF_SAVE`, `PERF_TICKS=3`, `PERF_WARMUP=1`, `PERF_DAY_BOUNDARY=1`) —
  PASS: exit 0, max tick 26.2 ms, no `ReferenceError`.
- `npm run test:types` — PASS; `npm run lint` — PASS; `npm run build` — PASS.
