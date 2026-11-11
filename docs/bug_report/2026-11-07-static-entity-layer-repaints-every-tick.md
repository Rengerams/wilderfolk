# Static entity layer repainted every simulation tick

- Bug: The cached static world layer (grass, trees, buildings, camps) is keyed on `state.tick`, so a settled colony re-rasterises every static sprite once per tick.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 working tree
- Reporter: A6 audit review (master bug list)
- Area: renderer cache invalidation
- Owner module: `renderSnapshot.ts` (revision) + `entityLayer.ts` (cache key)
- Related PR/commit: none

## Status history
- 2026-11-07 — open: `buildEntityLayerKey` starts its key with `state.tick`; review of `entityComposite.ts` showed the whole static pass rebaking on every tick.
- 2026-11-07 — resolved: key carries a static-world revision, and the one moving-entity painter was moved out of the static pass. `tests/renderSnapshot.staticLayerKey.test.ts` (4).

## Observed behavior
`buildEntityLayerKey` pushed `state.tick` as the first key part. Any tick advance — including a paused camera or an idle colony at 1× — changed the key, so `compositeCachedEntityLayer` cleared the padded offscreen surface and repainted every visible grass tuft, tree, building, groundwork strip and camp marker. The work per frame scaled with visible static content, not with what changed.

A second defect blocked the fix: `paintWorldEntityLayer` called `drawEcoConnections`, which reads `_cachedHumans` positions. Those move every tick, so a static-revision key would have frozen the marriage links.

## Expected behavior
The audit's A6 contract: "Static entity layer keys on a static-world revision, not `state.tick`." A settled world must reuse the bitmap until something static actually changes; a live construction site must still animate its progress.

## Reproduction steps
1. Open a colony with a house and several trees in view, pause the camera and leave the speed at 1×.
2. Instrument `beginEntityLayerPaint` (or watch `entityLayer.key`).
3. Observe a new key and a full repaint on each tick although no building, tree, grass tuft, camp or preference changed.

## Evidence
`buildEntityLayerKey` (`src/game/entityLayer.ts`) began: `parts.push(state.tick, cw, ch, ...)`. `paintWorldEntityLayer` painted scent, build zone, grid, grass, groundwork, static occluders, camp markers and eco connections; `drawEcoConnections` reads `_cachedHumans`.

## Root cause
Cache identity was the simulation clock instead of the content the painters read, and one painter in the static pass depended on moving entities.

## Fix / proposed fix
- `renderSnapshot.ts` derives `staticLayerRevision` from the static painters' real inputs: map size, season, year, day, entity count, and per-building id/type/level/scale/rotation/faction/completed/gate/health/occupants, plus each visitor camp's id, position and remaining days. The tick joins the revision only while a building is still under construction, so a build's progress ramp keeps animating.
- `entityLayer.ts` keys on `state.staticLayerRevision` instead of `state.tick`.
- `entityComposite.ts` draws `drawEcoConnections` in `paintMovingEntities`, where the settlers it follows already redraw per frame.

## Save/migration impact
None — render-only identity, nothing persisted.

## Verification result
- `npx vitest run tests/renderSnapshot.staticLayerKey.test.ts tests/renderSnapshot.dirtyKey.test.ts tests/renderer.entityLayerDpr.test.ts` — PASS (4 + 2 + 3).
- Old key reintroduced temporarily: the same test file FAILED (3 of 4), so the regression is guarded.
- Preview run: new colony rendered terrain, trees, settlers and buildings; a wheel zoom rebaked the layer without artifacts (520 → 508 colour buckets sampled, no error-boundary screen); console errors 0.
- `npm run test:types`, `npm run lint`, `npm run check:source` — PASS.
