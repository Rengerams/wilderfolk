# Regular election buildup starts a year early

- Bug: Regular election notice and gossip start 360 days before voting.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: 0.6.5.1 save / 0.6.5.2 development
- Reporter: owner, New Frontier Year 2 Day 14
- Area: leadership elections
- Owner module: `villageLeadership.ts`; scheduling caller `dailyWorldEvents.ts`

## Status history
- 2026-11-27 — investigating: source correction committed; CI not yet verified.

## Observed behavior
The Year 2 rollover announces the Year 3 regular election and permits election gossip throughout the year.

## Expected behavior
Announce and permit regular buildup only on the final day before voting. Preserve the two-year calendar and succession scheduling.

## Reproduction steps
1. Run through the first year rollover with a living leader.
2. Observe the premature election notification and gossip.
3. Advance to the final day before the next regular election.

## Evidence and root cause
`tickElectionBuildup` used `until === 1` at year rollover; `tickElectionGossip` used the same whole-year countdown without a day gate.

## Fix
Use the existing midnight caller every day, gate regular buildup on the final day of the preceding year, key the one-shot notice by the target election year, and record it in the Chronicle. Preserve the regular term starter and succession behavior.

## Save/migration impact
No schema change. Legacy notice markers refer to the preceding year and cannot suppress the corrected target-year notice.

## Verification result
Updated the existing save-boundary regression for early rejection, final-day one-shot and legacy marker compatibility. Tests and live-save replay NOT RUN.
