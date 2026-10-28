# Strategic map moves existing rival markers whenever another camp is founded

- Bug: The former strategic map recalculated its entire map scale and offsets from the current camps every render.
- Status: resolved (source change; runtime checks pending)
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 development branch, source review of `src/components/StrategicWorldMap.tsx`
- Reporter: implementation audit of the illustrated New Frontier map
- Area: Frontier presentation
- Owner module: `src/game/strategicMapProjection.ts` (stable read-only projection)
- Related PR/commit: `feat/new-frontier-strategic-map`

## Status history
- 2026-10-28 — investigating: old `StrategicWorldMap` computed `minX/maxX/minY/maxY` over the player and all discovered rivals, changing scale and center when the set changed.
- 2026-10-28 — resolved in source: replaced dynamic bounds fitting with a world-dimension-based reference projection that does not depend on the number of camps; tests added but not executed in connector-only environment.

## Observed behavior
A new rival at a more extreme world coordinate expands the `points` min/max bounds and changes `scale`, `offsetX` and `offsetY`; existing rivals consequently shift even if their `campX/campY` has not changed.

## Expected behavior
The displayed location of an existing camp stays stable when a different camp is founded. Selection and the canonical raid distances must continue to refer to the actual settlement IDs and world coordinates.

## Reproduction steps
1. Review the old `StrategicWorldMap` bounding-box projection (`minX`, `maxX`, `spanX`, `scale` and offsets).
2. Project the same existing camp with a set of one or two rivals, then add a farther rival to the `points` array.
3. Observe that the prior camp's coordinates change despite unchanged canonical coordinates.

## Evidence
The previous implementation derived each camp's rendered point from extrema of `[origin, ...settlements]`. The change is mathematically reproducible from that expression and does not depend on simulation timing.

## Root cause
The renderer treated live settlement extents as the scale of a persistent geographic map.

## Fix / proposed fix
`projectStrategicCamp` derives its scale from the persistent world dimensions and an illustrated village anchor, clamps to the interior of the parchment and is independent of the currently spawned rival list. `StrategicWorldMap` uses the same projection for markers and raid routes.

## Save/migration impact
None. No gameplay data, rival positions or save fields changed.

## Verification result
- Source trace: confirmed before/after.
- Added `tests/strategicWorldMap.projection.test.ts` to assert stable, directional, bounded and immutable projection.
- `npm run test:types`, `npm run lint`, `npm run build`, Vitest: NOT RUN (GitHub-only connector access; no checked-out game and installed dependencies available).
