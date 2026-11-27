# Active raid presentation duplicates and replays combat

- Bug: The HUD and report present the same fight, and reopening an existing report can replay its commentary.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: package 0.6.5.1, development target 0.6.5.2, base a35e818
- Reporter: Player playtest (duplicate fight); source inspection (replay and tribute)
- Area: strategic raid presentation
- Owner module: src/App.tsx (presentation orchestration); src/components/BattleReportScreen.tsx (commentary playback)
- Related PR/commit: [PR #224](https://github.com/Rengerams/wilderfolk/pull/224), implementation 5588278

## Status history
- 2026-11-27 — investigating: source defect identified and implementation submitted; verification incomplete.

## Observed behavior
The player reported duplicate fights on 27 November. Source inspection shows the active outgoing HUD card rendering battleChronicle alongside the full-screen battle report, and completed fate decisions opening a fresh commentary playback. Accepted tribute also opened the combat window despite no battle.

## Expected behavior
One report per selected engagement, with a compact status card only when that report is closed. Reopening shows existing commentary immediately; tribute does not open a battle.

## Reproduction steps
1. Start an incoming defense or outgoing fight and open the battle report.
2. Inspect the HUD and report while fighting; close and reopen the same battle, or reopen a resolved surrender decision.
3. Accept a tribute offer in a separate encounter; no combat window should open.

## Evidence
At base a35e818, App.tsx rendered all pending raid cards regardless of the open report and the outgoing card displayed battleChronicle. BattleReportScreen initialized revealed to one entry on every mount. The original player save was not supplied or replayed.

## Root cause
The HUD and modal lacked mutually exclusive presentation for the same raid ID; the playback cursor reset on mount and the command handler grouped accepted tribute with fighting.

## Fix / proposed fix
Filter the active report's raid ID out of the HUD, replace the duplicate live commentary with Watch battle/Watch defense, skip historical playback on reopen, and open the combat report only for combat choices. No simulation writes.

## Save/migration impact
No schema or migration change. Existing Chronicle and raid records are retained.

## Verification result
tests/battleReportScreen.test.ts covers reopening a resolved fate with its full commentary and visible decision. HUD exclusivity, reopening a live report and accepted tribute still require browser verification.

On implementation head 5588278, all six GitHub Actions workflows passed (including Node.js CI, run 45920465379). A later documentation commit had no runs and GitHub reported a merge conflict with main. Main was integrated in 7fe53ef; follow-up CI is not yet verified. Browser replay is blocked in the current environment: no repository checkout, GitHub DNS unavailable, and no original player save. The report remains investigating.
