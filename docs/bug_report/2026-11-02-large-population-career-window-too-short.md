# Large-population performance comparison ends before career credit is visible

- Bug: The 1,800-resident two-day PR benchmark fails its strict career-credit requirement despite genuine recorded shifts and later settled attendance.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: PR #119, commit `f89daeb`
- Reporter: GitHub Actions logs
- Area: Performance CI benchmark horizon
- Owner module: `.github/workflows/perf-population-large.yml`
- Related PR/commit: PR #119

## Status history
- 2026-11-02 — investigating: The two-day benchmark recorded zero credited career days. Reproduced on both main baseline and PR head.
- 2026-11-02 — investigating: Diagnostic logging shows 1,447 active attendance accumulators by tick 288 and 1,448 settled work-hour records at tick 576. The two-day report still has zero career credits. Increased only the large tier's measurement to three days; CI pending.

## Observed behavior
The fixed-seed 1,800-settler run reports approximately 1,442 assigned jobs and zero `careerHistory` credits after the first two in-game days. The corresponding 250 and 750 tiers each produce actual career credits by day two. The 1,800 tier's attendance counters reach at least 1,448 settled workers at the second midnight.

## Expected behavior
The large-tier performance gate must observe and validate real work credits, with the production career writer as sole source. It must never invent shifts or disable the non-vacuous benchmark requirement.

## Reproduction steps
1. Trigger PR #119 on the large-tier workflow with the original two-day setting.
2. Observe baseline and candidate reports with zero `creditedDays` despite assigned jobs and recorded attendance.
3. Candidate stops at `Vacuous career benchmark: no observed shifts credited during real simulation`.

## Evidence
GitHub Actions run 41369655723, job 125037252194: attendance-debug shows 1,448 settlers with settled hours at tick 576 and zero career credits at the end of the two-day measurement. Both baseline and PR produce this outcome.

## Root cause
The two-day performance horizon does not capture a credited shift at this population scale. The precise source of the extra day of delay remains unconfirmed.

## Fix / proposed fix
Change only the automated 1,800-resident benchmark from two days to three days, leaving the smaller tiers and the strict nonzero `careerHistory` requirement unchanged. The baseline and PR must use the same three-day horizon, and three-day CI must prove genuine credits before this report is marked resolved.

## Save/migration impact
None.

## Verification result
- FAIL: two-day 1,800-resident benchmark on both baseline and candidate.
- PASS: 250- and 750-resident two-day comparisons on PR #119.
- PENDING: three-day 1,800-resident CI; TypeScript/lint/build CI and simulation run independently.
