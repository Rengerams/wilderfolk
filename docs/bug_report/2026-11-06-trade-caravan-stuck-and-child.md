# Trade caravan merchants can stand stuck at a river and appear as children

- Bug: A trade-route caravan carrier can walk straight into blocked ground and never reach its partner, and it spawns at age zero so the calendar can mark the merchant as a child.
- Status: resolved (source; runtime unverified)
- Severity: high
- Date discovered: 2026-11-06
- Version/build: V.0.6.5.2 development tree after merge `81c22131`
- Reporter: user screenshot and source trace
- Area: trade caravan spawning and movement; save-load age migration
- Owner module: `tradeCaravans.ts` (spawn and route), `humanTick.ts` (movement branch), `pathfinding.ts` / `movement` (steering)
- Related PR/commit: local follow-up to `81c22131`

## Status history
- 2026-11-06 — reported from a live screenshot showing “Greenfields Traders trader Poland - child” stopped at a river bank; source trace found direct steering, a blocked hub spawn and age zero. Source fix applied; runtime reproduction not supplied.

## Observed behavior
The trade caravan merchant stands at the river edge and does not continue along the trade route. The name plate marks the merchant as a child even though the route belongs to an adult merchant role. The caravan can remain permanently outbound because its arrival check never succeeds.

## Expected behavior
A trade caravan carrier is an adult merchant. It starts outside the solid hub footprint and follows the path owner around water and completed buildings to its partner anchor. Existing saves with a child merchant are repaired on load.

## Reproduction steps
1. Load or generate a colony with an active trade route and a completed Market or Store.
2. Let the route depart and observe the merchant walking toward its partner across a river or past completed buildings.
3. The merchant is pushed against blocked ground and stops; the overhead name plate also gains `· child` after the next calendar day.

Runtime reproduction with the reporter’s save: NOT RUN — no save was supplied. The source trace below is the available evidence.

## Evidence
- The user screenshot shows `Greenfields Traders trader Poland - child` beside a river, with the trade-route line crossing the water.
- `tradeCaravans.spawnCaravan` created the carrier at the old `getTradeHubCenter` value, which used a completed hub building's centre/corner form. Completed buildings are solid footprints after the merged pathfinding change.
- The `humanTick` trade-caravan branch used `steerEntityToward`, which does not route around obstacles; `applyHumanWalkStep` then refuses the blocked step.
- `createEntity` gives a human age zero unless `ageYears` is supplied. On a new calendar day `syncHumanAgeFromCalendar` sets `isJuvenile = age < HUMAN_ADULT_MIN_AGE`, adding the child tag.
- Existing save migration skipped faction entities in `migrateHumanAges`, so a saved child carrier stayed a child.

## Root cause
Three separate owner gaps in the same entity: the caravan steered with the direct-line movement helper instead of the path owner, spawned at a blocked hub centre, and was created without an adult calendar age.

## Fix / proposed fix
- `getTradeHubCenter` now returns `homeEntryPosition(hub, hub.x, hub.y)`, a walkable hub door.
- The caravan branch now calls `steerHumanToward` with a per-carrier `caravan_<id>` route key and then applies the normal walk step.
- `spawnCaravan` calls `finalizeSettlerAge` so the merchant is an adult.
- `loadGameFromParsedOutcome` promotes an existing trade-caravan carrier below `HUMAN_ADULT_MIN_AGE` to an adult.

## Save/migration impact
No schema change. Existing saves are repaired on load by the adult-age migration; a currently stuck carrier resumes path-aware movement on its next active tick.

## Verification result
- `npx vitest run tests/tradeCaravan.carrierRetention.test.ts` — PASS (adult assertion added).
- `npx vitest run tests/tradeCaravan.carrierRetention.test.ts tests/humanMovement.test.ts tests/humanLeisureBehavior.test.ts tests/hospitalWalk.regression.test.ts tests/affairTrystSite.walkIn.test.ts` — PASS, 33 tests.
- `npm run test:types` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm test -- unit` — PASS, 475 files, 3053 tests passed, 2 skipped.
- Live runtime reproduction with the reporter’s save: NOT RUN.
