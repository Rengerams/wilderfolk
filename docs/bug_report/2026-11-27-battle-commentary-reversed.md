# Battle commentary runs backward and mixes unrelated entries

- Bug: Battle commentary consumes newest-first Chronicle entries as a forward playback feed.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: package 0.6.5.1, development target 0.6.5.2, base a35e818
- Reporter: Source inspection during duplicate-fight investigation
- Area: strategic raid presentation
- Owner module: src/game/eventLog.ts (selectRaidBattleCommentary)
- Related PR/commit: [PR #224](https://github.com/Rengerams/wilderfolk/pull/224), implementation 5588278

## Status history
- 2026-11-27 — investigating: source defect identified and implementation submitted; verification incomplete.

## Observed behavior
The latest entry appeared first and new entries shifted the visible slice, risking repeat or skipped narration. The old filter admitted both raid directions and could exclude repelled defense entries; a resolved log line could mark the battle finished before its authoritative report.

## Expected behavior
Unique entries appear oldest first within the battle's scope, include repelled defenses, and the final outcome follows the actual persisted report or pending victory.

## Reproduction steps
1. Use a newest-first Chronicle containing two defense entries, a repeated ID, an outgoing entry for the same rival, and entries outside the battle window.
2. Open the incoming battle report and inspect the playback sequence.
3. Verify that only the unique in-window defense events appear in chronological order.

## Evidence
eventLog.ts logEvent uses unshift. At base a35e818, App.tsx filtered without reversing or side separation and BattleReportScreen sliced from index zero. Source trace only; no original save replay.

## Root cause
A newest-first history collection was passed directly into chronological presentation, with insufficient scope and a text-event-based completion gate.

## Fix / proposed fix
Use selectRaidBattleCommentary for chronological ID-deduplicated, side/rival/time/baseline-scoped entries, including repelled defenses. Resolve from the actual raid report or pending victory.

## Save/migration impact
No schema or migration change. Existing Chronicle and raid records are retained.

## Verification result
tests/eventLog.duplicatesAndNotifications.test.ts covers ordering, duplicate IDs, direction, time bounds, repelled defense and missing legacy start scope. Legacy Chronicle entries lack raid IDs; overlapping same-rival same-side records cannot be reliably separated.

On implementation head 5588278, GitHub Actions reported PASS for Dead code audit, Required calendar scheduler gate and all three population performance workflows; Node.js CI was still running when checked. NOT RUN locally: targeted unit tests, typecheck, lint, build and browser replay. The report remains investigating until relevant verification completes.
