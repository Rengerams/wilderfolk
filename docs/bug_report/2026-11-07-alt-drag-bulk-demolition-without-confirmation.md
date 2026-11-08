# UX-13/14 — Alt-drag can demolish an entire road or wall strip without confirmation

- Bug: Releasing Alt-drag directly issues a bulk demolition worker command for every matched strip segment.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-07
- Version/build: PR #131 before follow-up commits
- Area: canvas input / strip demolition
- Owner module: src/hooks/useCanvasInteractions.ts (gesture), src/game/simWorker/commands.ts (command door)
- Related PR: #131

## Status history
- 2026-11-07 — open: handleMouseUp dispatched demolishStripBuildings immediately for a nonempty selection.
- 2026-11-07 — source fixed: confirm with exact segment count before dispatch; canceled gesture clears its preview and performs no command. Browser verification pending.

## Observed behavior
Holding Alt while drawing a wall/road strip and releasing the pointer immediately removes all segments found by collectStripDemolitionIds, including an unintentionally long drag.

## Expected behavior
The player must knowingly confirm the number of segments before a destructive bulk operation; canceling must retain the existing structures.

## Reproduction steps
1. Open a colony with multiple connected road or wall segments.
2. Select the matching strip type and Alt-drag across several pieces.
3. Release the pointer; the previous implementation dispatched demolishStripBuildings with no prompt.

## Evidence
src/hooks/useCanvasInteractions.ts handleMouseUp previously called applyGameAction immediately after collecting buildingIds.

## Root cause
The multi-building command path bypassed the confirmation used for individual demolition.

## Fix / proposed fix
Guard the existing command with window.confirm and a segment-count warning; no extra command or simulation owner is introduced.

## Save/migration impact
None.

## Verification result
NOT RUN — browser Alt-drag confirm/cancel; added a source regression contract in tests/keyboardGuards.contract.test.ts.
