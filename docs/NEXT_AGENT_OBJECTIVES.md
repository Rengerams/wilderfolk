# Wilderfolk 0.6.1 — Next Agent Handoff

## Mandatory first action

Before touching code, read:

1. `SIMULATION_AUTHORITY.md`
2. `BUG_REPORTS/README.md`
3. This handoff document

The next agent must not create a new tick layer, add a second owner for an existing decision, or silently patch a bug without a bug report and regression test.

## Working rules

The worker-owned `WorldState` is authoritative. The existing tick layers are fixed: `tickLayerRealtime.ts`, `tickLayerSystems.ts`, `tickLayerDaily.ts`, `tickLayerAssign.ts`, and `gameTick.ts`. Domain modules own decisions; tick layers schedule them. Every bug requires a report under `BUG_REPORTS/`. Every objective must end with focused tests, TypeScript validation, and a clear verification result.

---

## Objective 1 — Establish the invariant checker

**Owner:** `src/game/simulation/simulationInvariants.ts`  
**Priority:** Blocking foundation  

Create `collectSimulationInvariantErrors(state)` and a development assertion wrapper. Check duplicate workplace assignments, worker/building mismatches, pregnancy state without due progress, multiple living Moon Howlers, invalid leader residency, and stale references to demolished buildings.

**Acceptance criteria:** The checker reports errors without repairing state. Tests cover at least one valid state and one invalid state for each invariant. It can run after worker command results and after daily transitions without changing gameplay state.

**Validation:** Add `tests/simulation.invariants.test.ts`; run focused tests and TypeScript.

## Objective 2 — Create the simulation decision registry

**Owner:** `src/game/simulation/decisionRegistry.ts`  
**Priority:** Blocking foundation  

Record one owner, cadence, written fields, and test file for each major decision: workforce, construction, production, social feedback, courtship, affairs, conception, pregnancy/birth, Moon Howler, leadership, and commands.

**Acceptance criteria:** Every decision has exactly one owner row. The registry documents the current tick-layer boundary and does not introduce a manager or event bus.

**Validation:** Review every listed decision against the current code. Create a test that asserts the registry contains all required decision keys.

## Objective 3 — Document and lock the tick-layer schedule

**Owner:** `gameTick.ts` and the existing layer modules  
**Priority:** High  

Verify the order and responsibilities of `tickLayerRealtime.ts`, `tickLayerSystems.ts`, `tickLayerDaily.ts`, `tickLayerAssign.ts`, and `gameTick.ts`. Do not create `tickLayerSocial.ts`, `tickLayerPregnancy.ts`, `tickLayerMoonHowler.ts`, or another new layer.

**Acceptance criteria:** The existing layers call domain owners rather than implementing duplicate rules. The production cadence remains 72 ticks per day. A comment or test protects the layer order.

**Validation:** Add an ordering test or deterministic trace fixture; run calendar and migration tests.

## Objective 4 — Make workforce state authoritative and consistent

**Owner:** `workforce.ts`  
**Priority:** High  

Route assignment, reassignment, removal, leader work, and manual-building rules through named workforce transitions. Remove direct occupant/job writes from unrelated modules where practical.

**Acceptance criteria:** A living human can occupy at most one workplace. `homeBuildingId`, building occupants, occupation, and job agree after every assignment. The leader can work without losing office status or manor residency.

**Validation:** Tests cover duplicate assignment prevention, leader assignment, reassignment, removal, and idle-worker counts.

## Objective 5 — Repair Church manual staffing and legacy saves

**Owner:** `workforce.ts`, `buildingActions.ts`, save/migration owner  
**Priority:** High player-facing bug  

Church capacity remains four, but only a player-selected priest is required. Generic auto-staffing and rebalancing must never fill the Church. Add a one-time migration for legacy Churches that were automatically filled without manual-assignment metadata.

**Acceptance criteria:** A new or migrated Church starts with zero priests until explicitly assigned. Selecting one priest works while the worker pipeline is active. The Church does not refill itself on daily ticks.

**Validation:** Create `BUG_REPORTS/church-auto-staffing.md`; add new-save, legacy-save, manual-assignment, and daily-reconciliation tests.

## Objective 6 — Repair worker command round trips

**Owner:** `GameWorkerHost.ts`, `gameLoop.ts`, `commands.ts`, domain owners  
**Priority:** Blocking UI reliability  

Verify that player commands dispatch immediately without waiting for a permanently idle worker. Ensure command results cannot be overwritten by older queued tick deltas.

**Acceptance criteria:** Manual assignment, priest selection, reassignment, demolition, repair, upgrade, and building-mode commands update authoritative state and UI selection reliably.

**Validation:** Add command round-trip tests for assignment and demolition. Record the bug report for every command that still fails. Test worker mode and main-thread fallback with the same command fixture.

## Objective 7 — Repair demolition completely

**Owner:** `buildingActions.ts`, `commands.ts`, selection cleanup in `App.tsx`/GameLoop  
**Priority:** High player-facing bug  

Trace the Demolish button through UI callback, worker command, authoritative building removal, assignment cleanup, delta merge, and selected-building clearing.

**Acceptance criteria:** Clicking Demolish removes the building once, cleans every occupant assignment, does not reappear from a stale catalog, and clears the inspector. The command is safe if the building was already removed.

**Validation:** Add `BUG_REPORTS/demolish-command-failure.md` and a deterministic command test.

## Objective 8 — Make relationship diagnostics truthful

**Owner:** `relationshipDiagnostics.ts`, `humanRelationships.ts`, `humanLifecycle.ts`  
**Priority:** High Truth task  

Separate daily interval counters from active and completed state. Use names such as `conceptionCandidates`, `conceptionEligibilityRejected`, `conceptionProximityBlocked`, `conceptionEnergyBlocked`, `conceptionRollFailed`, `pregnanciesStartedThisInterval`, `activePregnancies`, and `birthsCompletedThisInterval`.

**Acceptance criteria:** `pregnanciesStartedThisInterval` is incremented only when a new pregnancy is created. A birth increments a separate birth counter. An existing or seeded pregnancy is visible through `activePregnancies`.

**Validation:** Add a fixture that starts a pregnancy, advances it, and completes a birth. Verify that each counter means exactly what its name says.

## Objective 9 — Restore relationship feel without expensive scans

**Owner:** social-feel code extracted from `humanTick.ts`; daily decisions remain in `humanRelationships.ts`  
**Priority:** High Truth/Play task  

Keep frequent low-cost nearby dialogue, flirt feedback, heart lines, and small progress in the staggered-social cadence. Keep conception, affair establishment, gossip, and scandals in their declared daily owners. Do not add a new tick layer.

**Acceptance criteria:** Eligible nearby settlers can visibly interact more than once per day without a full-population scan. Affair progress can begin before establishment. Pregnancy and scandal decisions are not accidentally moved into the realtime path.

**Validation:** Measure social events per colony day, tick p50/p95, conception candidates, pregnancies over 30–60 days, and scandals over established-affair days. Add a bug report if performance tuning changes behavior.

## Objective 10 — Make Moon Howler a rare event with deterministic survivor return

**Owner:** `moonHowler.ts`  
**Priority:** High Truth task  

Preserve the same surviving Howler on later full moons. If the Howler is cured or killed, allow quiet full moons and use a separate rare replacement RNG roll. Never guarantee a new Howler every two weeks.

**Acceptance criteria:** At most one living cursed Howler exists. A survivor returns. A killed/cured Howler can be followed by a quiet full moon. A later rare roll can create one replacement. The Church’s priest outcome affects cure behavior but not spawn multiplicity.

**Validation:** Inject RNG and test survivor return, quiet full moon, rare replacement, and one-Howler invariant. Record any existing guaranteed-spawn bug under `BUG_REPORTS/` before fixing it.

---

## Completion protocol

The agent must work in objective order unless the developer explicitly changes priorities. After each objective:

1. Write or update the required bug report.
2. Make the smallest owner-local change.
3. Add or update the regression test.
4. Run focused tests and TypeScript.
5. Run the full suite before marking the objective complete.
6. Run the relevant performance and seeded gameplay measurement.
7. Update the Simulation Change Record.

If an objective reveals a conflict with `SIMULATION_AUTHORITY.md`, stop. Do not work around the conflict in code. Update the authority document first, explain why, and add the required tests before continuing.

## Definition of done

The handoff is complete when the ten objectives are either verified or have a written blocker explaining the owner, evidence, attempted fixes, and next decision. “Implemented” without tests and verification does not count as complete.
