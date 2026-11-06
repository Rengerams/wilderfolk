# Settlers meeting friends at a building press into its wall

- Bug: A settler whose leisure impulse gathers them with a friend at a building steers to a point derived from the footprint’s corner form, which can sit inside the newly solid building; repeated blocked steps make them bump against the wall.
- Status: resolved (source; runtime unverified)
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: V.0.6.5.2 development tree after merge `81c22131`
- Reporter: user screenshot and source trace
- Area: leisure/social steering; path cache ownership
- Owner module: `humanLeisureBehavior.ts` (target), `humanMovement.ts` / `pathfinding.ts` (route), `humanHospitalBehavior.ts` (route key)
- Related PR/commit: local follow-up to `81c22131`

## Status history
- 2026-11-06 — reported from a live screenshot showing a group beside a house with a “Greetings!” bubble and repeated wall-facing movement; source trace found a blocked target point and shared cache keys. Source fix applied; runtime reproduction not supplied.

## Observed behavior
Several settlers cluster at a building front and repeatedly step toward its wall instead of settling into a conversation. The same route-cache key is used for every settler at that building, so one settler’s cached route can be reused for another and the target is not guaranteed to be walkable.

## Expected behavior
A social meeting point is on walkable ground outside the footprint, and each settler owns its own route cache entry.

## Reproduction steps
1. Let a village produce a leisure impulse where a settler has a living friend and a social building.
2. Place the friend and building close together so the midpoint target falls inside the completed footprint.
3. Observe the settler walking into the wall and sliding/bumping instead of reaching the friendship radius.

Runtime reproduction with the reporter’s save: NOT RUN — no save was supplied. The source trace below is the available evidence.

## Evidence
- The screenshot shows several settlers beside a house/farm frontage with a “Greetings!” speech bubble and repeated wall-facing motion.
- `humanLeisureBehavior` computed the meeting point as `(company + b.x + b.width / 2, company + b.y + b.height * 0.92) / 2`. `Building.x/y` is the footprint centre, so the added half-width is the corner-form mistake; the midpoint can be inside the footprint.
- Completed buildings became solid in `pathfinding.isWalkingObstacle`; `applyHumanWalkStep` therefore refuses the step.
- The same file passed `leisure_company_<building>` / `leisure_venue_<building>` and the hospital passed `hospital_<building>` as path cache keys, so different settlers shared one cached route.

## Root cause
A view-side corner-form point survived in the leisure target after the movement owner moved to footprint-centre semantics and solid completed structures. Per-entity path route keys were also shared at building scope.

## Fix / proposed fix
- The company meeting point now uses `venueGatherPosition(building, entity.id)`, a walkable frontage slot, and takes the midpoint with the friend.
- A friend across a blocked line is approached with `steerHumanToward`; a clear line keeps the cheaper direct steering.
- Leisure company, leisure venue and hospital route keys now include the settler id.

## Save/migration impact
None; no persisted field changes.

## Verification result
- `npx vitest run tests/buildingPanel.staffingRule.test.ts tests/tradeCaravan.carrierRetention.test.ts tests/humanLeisureBehavior.test.ts tests/humanMovement.test.ts` — PASS, 24 tests.
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm test -- unit` — PASS, 475 files, 3053 tests passed, 2 skipped.
- Live runtime reproduction with the reporter’s save: NOT RUN.
