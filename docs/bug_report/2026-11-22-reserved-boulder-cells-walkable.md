# Big rocks no longer block walking after the scenery passability change

- Bug: The generator reserves a path cell for every large rock (`Walkability.Reserved`), but the walk grid treated only `Walkability.Water` as blocked, so settlers walked straight through boulders that buildings cannot even be placed on.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: Wilderfolk 0.6.5.2 development
- Reporter: code review of the pathfinding owner (prompted by "settlers walk the wrong way")
- Area: movement / pathfinding passability
- Owner module: `src/game/pathfinding.ts` (`buildPathGrid`)
- Related PR/commit: regression introduced by `bd809679` ("fix(navigation): ignore non-solid scenery, reserve solid collisions")

## Status history
- 2026-11-22 — resolved: the passability grid treats every non-`Open` cell as blocked again, so reserved rock cells bar walking while decorative *buildings* stay walkable; regression test rewritten.

## Observed behavior
A `rock_big` decoration writes `pathGrid[cell] = 2` (`Walkability.Reserved`) during terrain generation. The walking grid only blocked `Walkability.Water`, so settlers walked straight through a boulder roughly 30 px wide. The build grid still classified the same cell as `Mixed` and placement still refuses it, so the player could not build on the rock but settlers crossed it.

## Expected behavior
`Walkability.Reserved` is documented as "Hard decor the generator reserved (big rock) — bars walking"; `rebakePathCell` deliberately preserves the reservation across terrain edits, and placement refuses to build there. Walking must refuse it as well.

## Reproduction steps
1. Generate a map through `testWorldMap` and set one path cell to `Walkability.Reserved`.
2. Before the fix `getPathGrid(map, []).blocked[cell] === 0` and `lineCrossesBlocked` through it was `false`.

## Evidence
`buildPathGrid` read `map.pathGrid![i] === Walkability.Water ? 1 : 0`. The previous implementation used `!== Walkability.Open`. The enum documents `Reserved` as "Hard decor the generator reserved (big rock) — bars walking", `rebakePathCell` deliberately preserves the reservation, and `placementUtils` already refuses to build on it.

## Root cause
Commit `bd809679` needed to stop non-solid *buildings* (garden, statue, lamp, fence) from blocking; the same change also stopped generator-reserved terrain from blocking, contradicting the reservation's documented contract.

## Fix / proposed fix
`buildPathGrid` blocks every cell that is not `Walkability.Open` when the map carries an L0 grid; decor buildings keep their own `BUILDING_CONFIGS[type].decor` exemption. `tests/pathfinding.test.ts` now asserts a reserved cell blocks, a decorative building does not, and a route still exists around the rock.

## Save/migration impact
None. The grid is rebuilt from the existing map and building list; no persisted field changed. Routes on existing saves may now avoid boulders, which is the intended rule.

## Verification result
- `npx vitest run tests/pathfinding.test.ts` — PASS (19 tests).
- Full unit suite (537 files, 3584 tests) — PASS.
- `npx tsc -p tsconfig.app.json --noEmit`, `tsc -p tsconfig.vitest.json --noEmit`, `oxlint --type-aware --type-check` on both changed files — PASS.
