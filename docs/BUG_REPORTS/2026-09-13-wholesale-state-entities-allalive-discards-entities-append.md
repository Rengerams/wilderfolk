# Wholesale `state.entities = allAlive` discards entities appended to state.entities during the tick (trade-caravan carrier)

- **Bug:** Wholesale `state.entities = allAlive` discards entities appended to state.entities during the tick (trade-caravan carrier)
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent X2-cadence; adversarially verified) — audit id H5
- **Area:** Truth
- **Owner module:** `src/game/gameTick.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

`state.entities = allAlive` silently deletes the carrier at the end of the departure tick, so `hasActiveCarrier` (tradeCaravans.ts:256-259, `state.entities.some(...)`) is false on the very next systems pulse; because `spawnCaravan` returned true, `route.nextDepartureTick` was cleared (tradeCaravans.ts:275-277), so the route re-schedules a fresh departure ~8 days later (`scheduleTradeRouteDeparture`, EVENT_INTERVAL.tradeRoute). Every departure first calls `deductExports(state, route)` (tradeCaravans.ts:231) after `canAffordExports`, so the colony loses the route's wood/stone/food/gold every 8 days forever: no carrier ever walks, `applyImports` (tradeCaravans.ts:336) never runs, `caravansCompleted`/`tradeCaravansCompleted`/`goldFromTradeRoutes` never increase, and no refund is possible. `getCaravanMoveTarget`/`tryAdvanceCaravanLeg` (humanTick.ts:445) are dead code as a result.

## Expected behavior

Spawn the carrier through the documented tick-layer contract: give `tickTradeCaravans(state, ctx)` and `spawnCaravan(state, ctx, route)` the TickContext and replace `state.entities.push(carrier); indexLivingEntity(state, carrier);` with `pushNewEntity(state, ctx, carrier);` (simulationEntities.ts:17-27 already registers entityById/grids; keep `indexLivingEntity` if the persistent index is still needed). Alternatively, make gameTick preserve untracked in-tick spawns, but the ctx.newEntities path is the one every other spawner uses (simulationEntities.ts:26, dailyPopulation.ts:112-114, tickLayerSystems.ts:133).

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/gameTick.ts` at lines 233-234 (with src/game/tradeCaravans.ts:224) | 206-234 (entity commit at 234; offending spawn write at src/game/tradeCaravans.ts:246).
2. Note the offending code: `gameTick.ts:105 `const aliveEntities = state.entities.filter((e) => e.alive);` then 206-212 build `allAlive` from that pre-tick snapshot plus `newEntities`, and 234 `state.entities = allAlive;`. `spawnCaravan` (called from the systems layer via tickLayerSystems.ts:142 -> tickTradeCaravans -> spawnCaravan) instead does tradeCaravans.ts:246 `state.entities.push(carrier);` (plus `indexLivingEntity`), which is in neither list. gameTick.ts:224-226 documents the contract: 'Daily systems may append authoritative entities through ctx.newEntities'.`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> Reproduced by driving real gameTick() ticks with an active route: on the systems tick spawnCaravan ran (wood 500→499) but `state.entities.filter(e => e.faction === 'trade_caravan')` was empty at the end of that same tick, and on the next systems tick hasActiveCarrier (tradeCaravans.ts:236) was false so the route reset with nextDepartureTick +576 — exports burned, applyImports (line 314) unreachable. gameTick.ts:234 replaces state.entities with `allAlive`, built only from the line-105 pre-systems snapshot plus ctx.newEntities; spawnCaravan pushes straight into state.entities, unlike dailyPopulation.ts:102-114, which pushes into state.entities, allAlive AND ctx.newEntities. Minimal fix: pass ctx into spawnCaravan and create the carrier through pushNewEntity(state, ctx, carrier) (matching the migration.ts BUG-12 comment), or merge in-tick appends into allAlive before line 234.

## Root cause

Reproduced by driving real gameTick() ticks with an active route: on the systems tick spawnCaravan ran (wood 500→499) but `state.entities.filter(e => e.faction === 'trade_caravan')` was empty at the end of that same tick, and on the next systems tick hasActiveCarrier (tradeCaravans.ts:236) was false so the route reset with nextDepartureTick +576 — exports burned, applyImports (line 314) unreachable. gameTick.ts:234 replaces state.entities with `allAlive`, built only from the line-105 pre-systems snapshot plus ctx.newEntities; spawnCaravan pushes straight into state.entities, unlike dailyPopulation.ts:102-114, which pushes into state.entities, allAlive AND ctx.newEntities. Minimal fix: pass ctx into spawnCaravan and create the carrier through pushNewEntity(state, ctx, carrier) (matching the migration.ts BUG-12 comment), or merge in-tick appends into allAlive before line 234.

## Fix

`spawnCaravan` registers the carrier through the canonical mid-tick spawn path, `pushNewEntity(state, ctx, carrier)`, instead of `state.entities.push` + `indexLivingEntity`. The carrier is therefore in `ctx.newEntities`, is indexed by id, and enters the mobile spatial grid; `tickTradeCaravans` and its `tickLayerSystems` call site now take `ctx`.

## Regression test

`tests/tradeCaravan.carrierRetention.test.ts` (2) — the spawned carrier is in `ctx.newEntities` with `caravanCarrierId` set, and after a full `gameTick` the carrier is still alive in `state.entities` with `caravanLeg === 'outbound'` (it was dropped in the same tick before the fix).

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` passes; the full-tick case fails on the pre-fix code (`state.entities` has no carrier).

## Related commits or files

- `src/game/gameTick.ts` (lines 233-234 (with src/game/tradeCaravans.ts:224) | 206-234 (entity commit at 234; offending spawn write at src/game/tradeCaravans.ts:246))
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H5)
