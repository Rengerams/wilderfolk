# One outgoing victory emits two surrender notifications

- Bug: A successful outgoing raid queues separate surrender and victory announcements for the same resolution.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: package 0.6.5.1, development target 0.6.5.2, base a35e818
- Reporter: Source inspection during duplicate-fight investigation
- Area: strategic raid presentation
- Owner module: src/game/frontierCombat.ts (resolveOutgoingRaidCombat)
- Related PR/commit: [PR #224](https://github.com/Rengerams/wilderfolk/pull/224), implementation 5588278

## Status history
- 2026-11-27 — investigating: source defect identified and implementation submitted; verification incomplete.

## Observed behavior
The success branch queued both Rival settlement surrendered and War-band returns victorious for one outcome, duplicating the announcement while a separate persistent fate decision already existed.

## Expected behavior
One combined news announcement with losses, spoils and the settlement-fate instruction. The persistent decision remains available.

## Reproduction steps
1. Resolve a successful outgoing raid that creates a pendingRaidVictories entry.
2. Inspect the queued big news from that resolution.
3. Before the fix two announcements are emitted; after it only one combined surrender announcement should be emitted.

## Evidence
At base a35e818, resolveOutgoingRaidCombat contained two consecutive addBigNews calls in the success branch. The duplicate calls are confirmed by source inspection, not by an executed fixture.

## Root cause
The same success transition independently announced its surrender and victory.

## Fix / proposed fix
Combine the news into one addBigNews call, preserving the Chronicle victory entry and pending fate decision.

## Save/migration impact
No schema or migration change. Existing Chronicle and raid records are retained.

## Verification result
Added a regression in tests/frontierCombat.hostility.test.ts using the real launch, arrival, timed resolution and repeated tick lifecycle with a controlled winning strength ratio. It asserts exactly one surrender/victory announcement, relevant message content, one pending fate and one persisted report. Execution pending follow-up CI; browser verification remains outstanding.

On implementation head 5588278, all six GitHub Actions workflows passed (including Node.js CI, run 45920465379). A later documentation commit had no runs and GitHub reported a merge conflict with main. Main was integrated in 7fe53ef; follow-up CI is not yet verified. Browser replay is blocked in the current environment: no repository checkout, GitHub DNS unavailable, and no original player save. The report remains investigating.
