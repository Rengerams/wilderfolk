# Building, workforce and services defects — audit remediation (2026-11-11)

- Bug: an unstaffed Hotel lodged guests for free, a blocked caravan stalled forever after deducting exports, maintenance accepted rival buildings, unknown building types threw instead of being refused, the provisions expiry outlived its window, construction counted dead occupants, placement was decided twice, staffing ranked candidates in mixed units and reported an over-capacity figure, and a visibly present worker was reported absent.
- Status: resolved
- Severity: medium/high (W-35/W-36/W-88/W-90)
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.5 and §5
- Area: hotel lodging, trade caravans, building maintenance/staffing/placement, workforce, work absence
- Owner module: `hotelStay.ts`, `tradeCaravans.ts`, `buildingMaintenanceActions.ts`, `buildingStaffingActions.ts`, `buildingPlacementActions.ts`, `placementUtils.ts`, `buildingRotation.ts`, `buildingPlacementLabels.ts`, `dailyBuildingEconomy.ts`, `buildingAccess.ts`, `workforce.ts`, `workAbsence.ts`, `workSchedule.ts`, `groupEvents.ts`

## Status history
- 2026-11-11 — resolved: every finding fixed at its owner; the placement decision is now one function in `placementUtils` and the duplicate boolean predicates were consolidated during integration.

## Observed behavior

- **W-35** Settler lodging bypassed the staffing gate visitors already had: an unstaffed Hotel still gave beds.
- **W-36** A caravan that had deducted its exports at departure but found its partner storage-full or its route blocked had no lifecycle bound and stalled forever, losing the goods.
- **W-37** Repair/upgrade/demolish accepted rival-owned buildings while five sibling mutators rejected them.
- **W-38/W-92** Raw `BUILDING_CONFIGS[type]` lookups threw for an unknown type in staffing, rotation and labels.
- **W-39** Both provisions-offer expiry comparisons were `day > expiresDay`, so the card outlived its configured window by one day.
- **W-40** A correctly assigned worker was reported as refused because the `automatic-job` branch was checked before "already on this roster".
- **W-88** The `unique` building rule counted rival-owned structures, so a legacy rival Town Hall blocked the player's only copy.
- **W-89** Placement was decided twice (preview vs commit) and `startBuilding` used its own refusal strings.
- **W-90** Construction counted `occupants.length` including dead ids for the 35% crew bonus and skill credit.
- **W-91** `isAtBuildingReach` re-probed ~30–64 path-grid cells per settler per tick.
- **W-97/W-98/W-99/W-100** Candidate ranking mixed travel-hours with squared pixels; `staffingCapFor` reported `max(roster, counted)`; "ill — exhausted" preempted visible attendance; `getWorkSchedule` re-validated and allocated per call.

## Expected behavior

A service requires its staffed building; a committed trade either completes or is refunded on a bounded deadline; maintenance and placement apply one ownership/decision rule; contracts use the configured window; a worker at their post is not reported absent.

## Reproduction steps

1. Remove the hotelier and check a visitor in: pre-fix the bed was assigned.
2. Depart a caravan to a full partner: pre-fix the carrier idled forever and the goods were gone.
3. Repair a rival-owned shop: pre-fix it succeeded.
4. Advance one day past a provisions offer's expiry: pre-fix it was still resolvable.
5. Kill a construction worker and leave the corpse in the roster: pre-fix the site kept the crew bonus.

## Evidence

Audit traces (`hotelStay.ts:95-99/419/654`, `tradeCaravans.ts:250-348`, `buildingMaintenanceActions.ts:38-57/305`, `buildingStaffingActions.ts:108/187/276/303-307`, `groupEvents.ts:88/118/157`, `buildingPlacementActions.ts:70-98/160-170`, `dailyBuildingEconomy.ts:215`, `buildingAccess.ts:40-125`, `workforce.ts:85-98/611-617`, `workAbsence.ts:233-235/262-265`, `workSchedule.ts:69-82`) and the regressions listed below.

## Root cause

Missing ownership/staffing gates, an unbounded caravan lifecycle, mixed-unit ranking, a stale snapshot source in the capacity reporter, and several call sites that re-derived a rule instead of calling its owner.

## Fix / proposed fix

- `hotelStay.isStaffedHotel` (completed, player-owned, hotelier posted) gates `findStaffedHotels`, `checkInVisitor` and the settler candidate list; existing stays keep their bed.
- Caravans get `caravanTripDeadlineTicks` (distance/pace + detour + slack), stored on the route while a carrier exists; `abandonCaravan`/`refundExports` returns the reserved goods through the ledger, despawns the carrier and resumes the departure cadence. Legacy carrier saves get a deadline on the next systems pass.
- `isPlayerOwnedBuilding` + `NOT_PLAYER_OWNED_REASON` gate repair, upgrade, demolish, strip demolition and gate toggles.
- Staffing/rotation/labels use `getBuildingConfig`; unknown types are refused by name.
- The provisions expiry is `day >= expiresDay` at both owner sites.
- Occupancy acceptance is checked before `automatic-job`; a correctly assigned worker returns no refusal.
- `isUniqueBuildingAlreadyBuilt` counts player-owned structures only (a player's own unfinished unique still holds its slot).
- `getPlaceBuildingFailureReason` is the one placement decision in `placementUtils`; `canPlaceBuilding` is its only boolean adapter (the duplicate in `buildingPlacementActions` was removed and importers migrated); `startBuilding` uses `getPlaceBuildingFailureLabel`.
- Construction derives a living crew for both the bonus and skill credit.
- `buildingAccess` memoises facade probes per building on path-grid identity + terrain revision.
- Workforce ranks in travel hours in both branches; `staffingCapFor` returns the counted value; work absence checks visible attendance first; `getWorkSchedule` caches by raw start/end.

## Save/migration impact

Legacy carrier routes gain a deadline on the next systems pass; no file format change. Legacy rival-owned buildings are still refused by maintenance.

## Verification result

- Focused batches: carrier retention 3, hotel lodging 7, staffing panel 11, build ghost 11, demolish round trip 15, building access 11, work absence 31, work schedule 6, ledger/ecology 9, village requests 7, geometry 8; plus placement/hotel/trade 58, workforce 98, ownership guards 83, loop/worker 127, virtual player/acceptance 167, persistence 48, movement 89, mixed 34 — all green.
- `npx tsc -p tsconfig.app.json --noEmit` and `scripts`: **PASS**; oxlint on all edited sources: **0**; strict cycles: **PASS**; comment check: **PASS**.
- Integration re-ran placement tests after consolidating the predicate: **9 files / 178 passed**.
