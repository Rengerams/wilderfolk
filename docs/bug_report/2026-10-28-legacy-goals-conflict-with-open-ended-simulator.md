# Legacy Goals conflict with an open-ended simulator

- Bug: The Valley Chronicle presented a finite Legacy Goals completion track in an open-ended colony simulator.
- Status: resolved (source changes; runtime verification not run)
- Severity: low
- Date discovered: 2026-10-28
- Version/build: main, target version 0.6.5.2
- Reporter: project owner
- Area: Chronicle presentation and historical projections
- Owner module: formerly src/game/legacyGoals.ts; view src/components/tabPanels/ValleyChroniclePanel.tsx
- Related PR/commit: see commit history from 2026-10-28

## Status history
- 2026-10-28 — open: owner requested removal of Legacy Goals as inconsistent with the game's open-ended design.
- 2026-10-28 — resolved in source: removed projection, goal UI and isolated tests; runtime test/build verification not run.

## Observed behavior
ValleyChroniclePanel displayed a separate Legacy Goals section with earned/total counts derived by collectLegacyGoals. The finite track sits beside the settlement's historical chapters.

## Expected behavior
The open-ended simulator retains event history and historically reached chapters, without a separate goal-achievement counter or final victory condition.

## Reproduction steps
1. Inspect the pre-removal Chronicle panel and the collectLegacyGoals projection.
2. Observe its Legacy Goals list and completion fraction on the history screen.

## Evidence
Before removal, the UI imported src/game/legacyGoals.ts, which computed four achieved/unachieved statuses from existing events and statistics. The separate goals had no saved state.

## Root cause
An achievement-style projection was added to the history interface despite an open-ended game design.

## Fix / proposed fix
Remove the obsolete Legacy Goals module, the UI section, their isolated tests, and stale imports/documentation. Retain existing Valley Chronicle chapters, logs, game state, and simulation behavior.

## Save/migration impact
None. Legacy Goals were a read-only projection, not a saved data structure; historical eventLog, chronicleChapters and statistics remain untouched.

## Verification result
Source inspection and reference search completed. Targeted runtime tests, typecheck, and build: NOT RUN in this GitHub editing environment.
