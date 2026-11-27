# Auto-player bypasses workforce owner

- Bug: Auto-play independently selects workers for dismissal, including soldiers.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Reporter: owner screenshot showing release Adrianne from the Barracks
- Area: auto-play/workforce
- Owner: workforce.ts (staffing); virtualPlayer.ts (policy proposals)

## Status history
- 2026-11-27 — investigating: source path confirmed; independent dismissal removed; CI pending.

## Observed behavior
decideSurplusWorkers counts raw workplace links against configured posts, then proposes removeWorker for the least-skilled person. Reserved posts can be counted as active staff, contrary to workforce policy. The screenshot confirms a proposal, not a successful removal.

## Expected behavior
Auto-play may request the canonical workforce pass but cannot choose individual hires or dismissals.

## Reproduction and evidence
An over-capacity farm or barracks enters the old surplus decision branch after higher-priority proposals are exhausted. The previous regression explicitly required removeWorker. The screenshot's exact live state is not available.

## Fix
Remove the decision and its ladder entry; exclude assignWorker/removeWorker from the proposal type. Replace the old test contract with regressions for both farms and barracks. Preserve canonical workforce decisions and command compatibility.

## Save compatibility
No schema changes.

## Verification
Source inspected and commits made. Focused tests and live replay NOT RUN; CI pending.
