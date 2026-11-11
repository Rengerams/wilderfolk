# Every settler re-scanned the building list and the faction lists each tick

- Bug: `tickHumans` resolved each settler's camp, war-band, performers, festival square and hotel by scanning a full list inside the per-settler loop, so the tick cost grew with settlers × buildings.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit build (PERF-04, RED-05)
- Reporter: 2026-11-07 full audit, performance and redundant-compute passes
- Area: simulation hot path
- Owner module: `humanTick.ts` (loop), `frontierCombat.ts` (incoming-raid index), `hotelStay.ts` (lodging lookup)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit found the per-settler `find` calls on buildings, visitor groups, rival settlements and pending raids.
- 2026-11-07 — resolved: per-tick indexes and hotel lists replace the scans; read counter proves sublinear growth.

## Observed behavior
Inside the per-settler loop, a visitor or rival settler ran `visitorGroups.find` or `rivalSettlements.find`, a marching rival ran `pendingRaidEvents.find`, every festival goer ran `visitorGroups.find` and `state.buildings.find` for the Square, and every sleeper ran a hotel scan plus a residence `find` by id. At 2,000 settlers and ~1,000 buildings the festival path alone read the building list about two million times per tick.

## Expected behavior
A lookup whose answer cannot change during the tick is resolved once per tick and shared, which the neighbouring `nearbyWells`, `idleVenues`, hospital and ceremony-seat caches already do.

## Reproduction steps
1. Start a festival with 20 and then 80 jobless settlers and a 60-building village.
2. Count index reads on the buildings array during one `tickHumans`.
3. Before: 1,638 reads for 20 goers and 4,368 for 80 goers.

## Evidence
`tests/humanTick.hotPathIndexes.test.ts` counts numeric reads through a Proxy. Restoring the per-goer Square scan makes the growth assertion fail with `expected 4368 to be less than 3148.4`; the indexed code measures 798 reads for 20 goers and 1,008 for 80 goers (+26% for four times the settlers).

## Root cause
The lookups were written at their point of use, inside the loop, rather than as tick-level facts.

## Fix / proposed fix
- `frontierCombat.buildIncomingRaidIndex` is the one read model for “is this rival marching”, built once per tick; `isRaidMarchingForRival` delegates to it.
- `tickHumans` builds visitor-group, rival-settlement, incoming-raid, performers and Square indexes once, and the loop reads them.
- `isSettlerLodgingAtHotel` accepts the per-tick hotel list and a building map; `steerVisitorToHotel` accepts the building map, so a hotel is one map read, not a full scan.

## Save/migration impact
None — no persisted field and no delta shape changed.

## Verification result
- `npx vitest run tests/humanTick.hotPathIndexes.test.ts` — PASS (3 tests, including the 20-vs-80 read-count growth).
- `npx vitest run tests/medium-N4-campAnchor.test.ts tests/medium-A-movement.test.ts tests/hotelSettlerLodging.night.test.ts` — PASS.
- `npx tsc -p tsconfig.app.json --noEmit` — PASS; `npm run lint` — PASS.
