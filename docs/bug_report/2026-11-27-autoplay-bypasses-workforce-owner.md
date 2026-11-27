# Auto-player bypasses workforce owner

- Bug: Auto-play independently selects workers for dismissal, including soldiers.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Reporter: owner screenshot showing release Adrianne from the Barracks
- Area: auto-play/workforce
- Owner: workforce.ts (staffing); virtualPlayer.ts (policy proposals)

## Status history
- 2026-11-27 — investigating: independent dismissal, staffing requests and policy overrides removed; legacy completed-job dismissal refused; CI pending.

## Observed behavior
decideSurplusWorkers counts raw workplace links against configured posts, then proposes removeWorker for the least-skilled person. Reserved posts can be counted as active staff, contrary to workforce policy. The screenshot confirms a proposal, not a successful removal.

## Expected behavior
Auto-play has no staffing authority. It uses only permitted player actions; the scheduled workforce owner decides staffing. Construction planning may read the workforce owner's feasibility verdict.

## Reproduction and evidence
An over-capacity farm or barracks enters the old surplus decision branch after higher-priority proposals are exhausted. The previous regression explicitly required removeWorker. The screenshot's exact live state is not available.

## Fix
Remove all three auto-play staffing decisions and ladder entries. Use an explicit allowlist of ordinary player proposals (no staffing or debug commands); read-only feasibility and idle eligibility belong in workforce.ts. Reject individual completed-job dismissal at the legacy command boundary while preserving construction and housing compatibility. Consolidate indexed donor selection into its single production implementation and test that directly. Regression tests exercise the normal workforce owner and assert that auto-play cannot change policy.

## Save compatibility
No schema changes.

## Verification
Source inspected and commits made. Focused tests and live replay NOT RUN; CI pending.
