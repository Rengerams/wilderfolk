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
No dedicated notification-count regression has been added in PR #224; existing raid lifecycle coverage remains. A focused successful-raid news assertion and browser verification remain outstanding.

On implementation head 5588278, GitHub Actions reported PASS for Dead code audit, Required calendar scheduler gate and all three population performance workflows; Node.js CI was still running when checked. NOT RUN locally: targeted unit tests, typecheck, lint, build and browser replay. The report remains investigating until relevant verification completes.
