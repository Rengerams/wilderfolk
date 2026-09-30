# Name of file: 2026-08-28

- Bug: Taming command accepted a nearby rival-owned Taming Post
- Status: resolved
- Date discovered: 2026-08-28
- Version/build: 0.6.4 development
- Reporter: Manus AI
- Area: Play | Truth | worker
- Owner module: `settlerInteractionActions.ts`
- Cadence: player-command

## Status history

- 2026-08-28 — open (discovered while separating the settler interaction domain during serial Slice 1.5).
- 2026-08-28 — investigating (the Taming Post proximity gate was compared with player-command ownership guards).
- 2026-08-28 — resolved (only a nearby completed player-owned Taming Post now permits the action; focused and full automated validation passed).

## Observed behavior

`tameEntity()` treated any completed nearby Taming Post as sufficient, including one owned by the rival faction.

## Expected behavior

A player taming command must require a nearby completed player-owned Taming Post. Rival buildings must not unlock player interaction abilities.

## Reproduction steps

1. Place or obtain a completed rival-owned Taming Post near an eligible wild animal.
2. Ensure no completed player-owned Taming Post is nearby.
3. Issue a valid tame command with sufficient food using a player human.

## Evidence

The proximity predicate checked only `completed`, `type`, and distance. Other player-owned building interactions in the command domain reject rival building ownership.

## Root cause

The proximity predicate omitted the existing faction guard when determining whether the player has the required infrastructure.

## Regression test

`tests/settlerInteractionActions.test.ts` verifies a player-owned post permits taming, while a rival-only post neither spends food nor changes `tamedBy`.

## Invariants checked

- Player commands mutate authoritative state only through the established command boundary.
- Rival buildings do not unlock player interaction capabilities.
- Taming consumes food only after all gates pass.

## Save/migration impact

Not applicable — no stored state shape or migration changes.

## Verification result

Focused interaction and worker-command regressions, TypeScript checking, linting, the complete test suite, and the production build passed. No dedicated interactive browser smoke check was required for this command authorization correction.

## Related commits or files

- `src/game/buildingActions.ts`
- `src/game/settlerInteractionActions.ts`
- `src/game/simWorker/commands.ts`

## Fix

Settler interactions now live in a focused owner and require `faction !== 'rival'` for the nearby completed Taming Post gate.
