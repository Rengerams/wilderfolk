# Settlers walked straight into a building wall instead of routing around it

- Bug: Free-time walks toward a building's frontage and a prisoner's walk to the cell used a raw straight-line velocity, so a settler whose destination was on the far side of the building pressed into the wall and slid along it instead of walking around and arriving.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-08
- Version/build: 0.6.5.2
- Reporter: player observation ("settler keeps walking against a building")
- Area: free-time/building approaches, prison movement, path-based arrival
- Owner module: `src/game/pathfinding.ts` (route owner) + `src/game/humanTick.ts` (callers)
- Related PR/commit: none

## Status history
- 2026-11-08 — open: player reported settlers walking into a building; source trace found raw steering on building frontage and prison approaches.
- 2026-11-08 — resolved: every building-named walk goes through the path owner; arrival around a building and around a wall is covered by regression tests.

## Observed behavior
In the free-time block, `steerTo` set `idleVx`/`idleVy` straight at the destination and never consulted the path owner, even when a building was named as the destination. A settler north of their house walking to the south porch therefore drove into the north wall; `applyHumanWalkStep` refused the blocked step and slid along the facade, which looks like walking against the building. The prisoner walk to the cell door used the same raw velocity.

## Expected behavior
A settler walking from A to B follows the path owner's route around every completed building and arrives at the destination. A blocked direct line is rerouted, never ground into.

## Reproduction steps
1. Place a completed House with a resident and put the resident north of it.
2. Let the free-time home fallback run (`steerTo(homeStandPosition(home, id), …, home)`); with a path grid the direct line crosses the footprint.
3. Before the fix the settler gained no ground and kept sliding on the north wall; after the fix they walk around the house to the porch.

## Evidence
`humanTick.ts` built `steerTo` as `idleVx = (dx / dist) * speed` with no `steerWithPath` call, while the hospital, hotel and affair owners already routed through the path owner. `tests/buildingAccess.routeAround.test.ts` now drives the same helper used by the idle walk and measures arrival.

## Root cause
The path owner was optional at the call site: any caller that did not use `steerWithPath` could walk straight at a solid footprint, and the step guard only converts that into wall-sliding, not arrival.

## Fix / proposed fix
`steerTo` routes through `steerHumanToward` whenever it names a destination building and marks the tick as routed so the idle damping does not overwrite the route. The prisoner walk uses the same owner. The route regression covers arrival from all four sides, around a wall, and the free-time porch walk. A destination with no route now holds still instead of pressing into the wall.

## Save/migration impact
None; no persisted field changes.

## Verification result
- `npx vitest run tests/buildingAccess.routeAround.test.ts` — PASS, 6 tests.
- `npx vitest run` over the entrance-dependent suites — PASS (the one panel failure is the pre-existing soldier-label failure below).
- `npx tsc -p tsconfig.app.json --noEmit` — PASS.
- `npm run lint` — PASS.
- Pre-existing, not caused by this change: `tests/buildingPanel.staffingRule.test.ts` expects "Walking to work" for a distant soldier but the panel renders "Absent"; the test reads no function changed here.
