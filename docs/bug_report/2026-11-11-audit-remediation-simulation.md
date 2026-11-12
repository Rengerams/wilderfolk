# Simulation hand-off, invariants and schedule defects — audit remediation (2026-11-11)

- Bug: worker hand-off dropped election state and the beauty field, a paused simulation never reached the replica, the invariant gate could not fail, the work-commute lead was effectively dead, grass regrowth and the food ledger hid real state, the harvest banner fired without its effect, the herd could only shrink, and indoor shelter did not protect from the Moon Howler.
- Status: resolved
- Severity: medium-high
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §2/§3 and the round-2 verification
- Area: worker delta/prep, invariants, daily economy/ecology, human schedule, migration, wildlife prey
- Owner module: `simBuffers/simDelta.ts`, `simWorker/simPrep.ts`, `simWorker/gameWorker.ts`, `worldRuntimeCaches.ts`, `gameTick.ts`, `simulation/simulationInvariants.ts`, `humanTick.ts`, `scheduleFatigue.ts`, `dailyWorldEvents.ts`, `economyLedger.ts`, `dailyGrassEcology.ts`, `grassEcology.ts`, `ecosystemPressure.ts`, `migration.ts`, `simulation/simulationEntities.ts`, `hospitalCare.ts`

## Status history
- 2026-11-11 — resolved: each defect fixed at its owner; invariants now fail in dev/tests and are collected per tick by both long-run harnesses; the orchestration layer additionally fixed a real orphaned-marriage gap the new invariant exposed.

## Observed behavior

- **S-04/S-13** The delta shipped `electionCeremony` but not `lastElectionResult`, `nextElectionId` or `pendingLeaderHouseResidentIds`, and no `paused`; the leadership panel could freeze on the loaded vote and a rollback could skip an election id.
- **S-05** `beautyGrid` was stripped at worker import/rollback while the leisure companion branch drew a `humanTick` roll only when the grid existed — losing decor attraction and permanently offsetting the RNG stream.
- **S-12** `resetWorkerSession` did not clear faction-wander state, so a reused visitor/rival id could inherit the previous session's camp target.
- **S-11** Invariants ran only in DEV and only `console.warn`ed; the 90-day gate passed `[]` and the health verdict ignored violations.
- **S-14** The work-walk branch only opened in the last hour before a shift and punished commuters with a 0.85 damping, so long-commute workers arrived late.
- **S-07** Bountiful Harvest was set and cleared in the same odd-year call, so only even years delivered it.
- **S-08** Trade/gift/raid food reached the stores but not the daily ledger, so immigration saw "0 produced" with a full larder.
- **S-09** Daily grass growth was 2.5 × 288 clamped to 100, refilling every blade at midnight in winter and drought.
- **S-15** Herd size only ratcheted down; an unharmed autumn never recovered it.
- **S-16** Indoor settlers were still valid Moon Howler prey although the banner promised shelter.
- **S-10** Hospital gates used a shifted footprint corner instead of the centre/reach rule.

## Expected behavior

A hand-off must preserve every simulation input the receiving realm cannot rebuild; derived caches must be rebuilt or deliberately re-derived; a decision must pay only witnessed attendance; the invariants must be able to fail; the advertised rules (harvest, herd recovery, shelter) must match behaviour.

## Reproduction steps

1. Run an election, force a rollback: pre-fix `nextElectionId` was reused/skipped and the panel kept the old result.
2. Import a worker world with decor: pre-fix the companion beat drew one fewer `humanTick` value.
3. Trade food into a full larder and wait for immigration: pre-fix it refused while `produced` was 0.
4. Winter with grazing: pre-fix every blade refilled at midnight.
5. Sleep indoors on a full moon: pre-fix the howler could kill the settler at the door.

## Evidence

Audit traces (`simDelta.ts:148`, `simPrep.ts:437`, `worldRuntimeCaches.ts:19-70`, `humanLeisureBehavior.ts:484`, `gameWorker.ts:194`, `gameTick.ts:387-399`, `humanTick.ts:968/1237-1266`, `dailyWorldEvents.ts:224/251-254`, `tradeCaravans.ts:115-131`, `dailyGrassEcology.ts:27`, `migration.ts:159-162`, `tickLayerSystems.ts:407-440`, `hospitalCare.ts:238-241`), plus the regressions listed below.

## Root cause

Incomplete hand-off key sets, a warn-only diagnostic, two decision gates written against the wrong clock/branch, a second (nominal) food counter, a growth constant applied with the wrong day multiplier, a shrink-only memory, a missing indoor predicate, and a corner-based geometry assumption.

## Fix / proposed fix

- Delta proto 7 adds `paused` (one-way: only the simulation may pause the replica; the host owns resume) and the three election fields; prep preserves/restores them; worker reset clears faction wander and rebuilds beauty at every hand-off.
- `gameTick` throws on invariant violations in DEV/test; both long-run harnesses collect per tick, the 90-day gate asserts zero, and `assessColonyStall` gains an `invariant-violation` reason.
- `getWorkdayAttendance` pays witnessed presence only (a scheduled crew that never reached the post earns nothing); the commute walk opens at `shift − lead` from the settler's own distance and commuters skip the damping.
- Bountiful Harvest is cleared at the year boundary before the roll; every stored food inflow records through `recordFoodProduced` with its source; grass grows `GRASS_GROWTH_PER_DAY × mult` and the pressure report prices the same rule.
- Herds record the placed count and recover one deer per unharmed autumn, capped at base.
- `isValidHuntPrey` refuses an indoor human; hospital gates use `getBuildingCenter` + `isAtBuildingReach`.
- `reconcileOrphanedMarriages` (fixed during integration) clears any spouse id naming a pruned entity and repairs a stale status, which is the invariant the new gate immediately exposed.

## Save/migration impact

None required. The delta proto bump is internal; both realms share the bundle. Legacy saves keep their election state through the prep path.

## Verification result

- `tests/workerHandoff.state.test.ts` (5), `tests/invariants.commute.herd.test.ts` (15), `tests/dailyEconomy.ledgerEcology.test.ts` (9) pass; the invariant regression fails on the pre-fix code by construction.
- Targeted save/worker/leadership/hospital suites pass; `reconcileOrphanedMarriages` fix verified by `tests/courtship.exclusivity.test.ts` and `tests/residency.dayBoundary.budget.test.ts` (27 tests).
- Full `standard` + `calendar-scheduler` + `colony-integration`: run after integration (see remediation log).
