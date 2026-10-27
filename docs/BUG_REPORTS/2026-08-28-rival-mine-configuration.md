# Name of file: 2026-08-28

- Bug: Rival mine configuration accepted by the player command action
- Status: resolved
- Date discovered: 2026-08-28
- Version/build: 0.6.4 development
- Reporter: Manus AI
- Area: Truth | worker
- Owner module: `buildingConfigurationActions.ts`
- Cadence: player-command

## Status history

- 2026-08-28 — open (discovered while comparing all persisted building-configuration command guards during Slice 1.4).
- 2026-08-28 — investigating (direct action behavior was compared with the worker-command validation and peer configuration actions).
- 2026-08-28 — resolved (the configuration owner now rejects invalid modes and rival Mine updates; focused and full automated validation passed).

## Observed behavior

`setMineMode()` accepted a valid mode for any Mine, including a rival-owned Mine. The direct workshop-recipe, hunting-prey, and staffing-mode configuration actions all reject rival buildings.

## Expected behavior

A player-issued building-configuration command may change only player-controlled eligible buildings. Rival buildings must reject mine-mode updates just as they reject the other configuration updates.

## Reproduction steps

1. Create or obtain a completed rival Mine in authoritative world state.
2. Issue the valid `setMineMode` player command against that building.
3. Observe `mineMode` change despite the building being rival-owned.

## Evidence

The worker-command protocol correctly restricts the requested mode to `stone` or `iron`, but `buildingActions.setMineMode()` lacked the peer actions' `building.faction === 'rival'` guard.

## Root cause

The Mine command validated only building type; the adjacent configuration commands consistently validated both type and player ownership.

## Regression test

`tests/buildingConfigurationActions.test.ts` verifies valid player-owned workshop, staffing, Mine, and Hunting Spot updates, plus direct rejection of invalid Mine modes and rival-Mine updates. Existing worker-command tests retain command-boundary coverage.

## Invariants checked

- Player commands mutate authoritative state only through the established command boundary.
- Rival buildings are not player-configurable.
- Persisted building modes remain restricted to their declared values.

## Save/migration impact

Not applicable — no stored state shape or migration changes. Existing invalid rival-mine values remain readable; future player commands cannot create them.

## Verification result

Focused configuration and worker-command regressions, TypeScript checking, linting, the complete test suite, and the production build passed. No dedicated interactive browser smoke check was required for this command authorization correction.

## Related commits or files

- `src/game/buildingActions.ts`
- `src/game/buildingConfigurationActions.ts`
- `src/game/simWorker/commands.ts`

## Fix

The configuration domain now lives in `buildingConfigurationActions.ts`; it aligns Mine ownership validation with the other player configuration commands and rejects values outside the declared Mine and staffing-mode unions at the action boundary.
