# Battle reports repeat and mix raid commentary

- Bug: One battle can be presented repeatedly, and the battle modal can mix or duplicate commentary from different engagements.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-27
- Version/build: main `a35e8188cbedd865dd26130b2392615adea1f179`
- Reporter: player reports repeated battle display; source audit
- Area: raid presentation / Chronicle
- Owner module: `eventLog.ts` (timeline projection), `frontierCombat.ts` (combat event producer), `App.tsx` / `BattleReportScreen.tsx` (presentation)

## Status history
- 2026-11-27 — investigating: source defects identified and addressed; focused regression cases added. CI and reproduction in the player's save pending.

## Observed behavior
The player reports a battle still being shown twice. Source inspection confirms several ways to repeat its presentation: the modal filters the newest-first Chronicle by rival-name substring rather than raid identity, reveals the newest records first and changes the visible prefix as new entries arrive. Reopening for a surrender decision starts the same commentary again. Named losses, a grouped loss summary and a second battle commentary repeat the same deaths; a victory also emits two overlapping news announcements. The original symptom was not reproduced in a supplied save.

## Expected behavior
One chronological report per raid, with real recorded losses and final outcome; closing and reopening a report must not replay its existing commentary. Distinct engagements and distinct deaths must remain separate, while redundant complete loss summaries need not repeat in the modal. The Chronicle remains complete, and actual combat resolution and fate decisions retain their existing owners.

## Reproduction steps
1. Inspect `App.tsx` battle report projection and `BattleReportScreen.tsx` reveal initialization on the base commit.
2. Construct interleaved outgoing and incoming Chronicle rows against the same rival, including an older battle, repeated event ID, named losses and redundant aggregate summaries. The previous name filter has no exact raid identity; newest-first prefix reveals reorder as new events arrive.
3. Reopen an existing completed raid report from a pending fate choice. Previously the reveal count starts at one, replaying the old battle.
4. Review the successful outgoing resolution: it issues both surrender and victory announcements.
5. The added `tests/raidChronicle.lifecycle.test.ts` and `tests/battleReportScreen.test.ts` regressions cover identity, ordering, legacy window, unique deaths, partial history and resume.

## Root cause
A newest-first, name-based projection was reused as a live chronological report; opening an existing report was treated as starting a new playback. The casualty writer records both individual and aggregate events, and the victory path separately announces two aspects of the same outcome.

## Fix
Tag new battle Chronicle rows with their existing raid ID via `logEvent`; derive one sorted, deduplicated report with a conservative bounded legacy fallback. Suppress redundant group loss summaries only when complete named rows or the numbered summary carry the same news. Resume existing reports, avoid showing the same raid banner while its modal is active, and provide explicit reopen actions. Merge the victory announcements. The cinematic header and phase/strength visuals use authoritative state; no tactical combat or invented losses.

## Save/migration impact
Optional raid ID on new Chronicle rows only. Legacy rows remain readable through side, exact rival and known time-window filtering; old rows with insufficient identity may be omitted from the modal rather than falsely attributed. No save-format bump or new simulation writer.

## Verification result
- Source inspection: confirmed the above presentation paths.
- Regression tests, typecheck, lint, build and CI: NOT RUN by this agent.
- Browser / user's save reproduction: NOT RUN.
