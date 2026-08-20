# Bug: Leader cannot hold a workplace — job stripped at office-taking, on load, and by auto-staff exclusion

- Status: fixed
- Date discovered: 2026-08-20
- Version/build: 0.6.1-line (working tree, uncommitted)
- Reporter: Developer report ("the leader doesn't take a job") + Deep Code session 2026-08-20
- Area: Truth
- Owner module: leaderHouse.ts (applyLeaderOccupation) — workforce.ts (auto-staff candidates) — villageLeadership.ts (load-time reconcile)
- Cadence: daily/idempotent (office reconcile) + assignment (auto-staff pulses 4×/day) + player-command (manual assign)

## Status history

- 2026-08-20 — open (developer report; deterministic probe reproduced the full chain)
- 2026-08-20 — fixed (developer direction: leader works like any other settler when nothing special is ongoing; office preserves valid workplace, auto-staff may assign the leader, load keeps the assignment)

## Observed behavior

The leader never holds a workplace:

1. At office-taking (`appointFoundingLeader`, decennial election winner, save-load
   reconcile) `leaderHouse.applyLeaderOccupation` **unconditionally strips** the
   leader from every workplace and construction crew, clears `homeBuildingId`,
   and forces `job = Settler` — even when the workplace is valid.
2. `villageLeadership.validateVillageLeaderOnLoad` calls `applyLeaderOccupation`
   on **every save load** (comment: "Reconcile legacy saves"), so even a
   manually assigned leader job is wiped after reload.
3. Auto-staff excludes the leader from every candidate pool
   (`assignWorkerInPlace`, `assignBuilderInPlace`, `pickWorkerToTransfer`,
   `assignWorkerTransition` default, `addToConstructionCrew`), so an idle
   leader is never assigned a job automatically.

Deterministic probe:

```
before office: homeBuildingId = 2 | occupation = Farmer | job = farmer
after office:  homeBuildingId = undefined | occupation = leader | job = settler   ← applyLeaderOccupation strips the job
manual assign: homeBuildingId = 2 | occupation = leader | job = farmer            ← allowLeader path works
after load:    homeBuildingId = undefined | occupation = leader | job = settler   ← validateVillageLeaderOnLoad strips it again
```

## Expected behavior

Per SIMULATION_AUTHORITY.md §5: "The leader may work in a normal workplace while
retaining leader status and manor residency." Per developer direction (2026-08-20):
**the leader works like any other settler when nothing special is ongoing** —
the office preserves a valid workplace, auto-staff may assign the leader, and
save-load keeps the assignment. During special events (election ceremony) the
existing movement layer already pulls settlers to the ceremony; no job-level
gate is required.

## Reproduction steps

1. Elect a settler who holds a job (or found a colony with a working settler).
2. Observe the leader's job is removed at office-taking.
3. Manually assign the leader to a workplace via the assign command — works.
4. Save and reload — the leader's job is gone again.
5. Leave the leader idle — auto-staff never fills them.

## Evidence

- Probe output above (`scripts/_probe_leader2.mts`, deleted after run).
- `src/game/leaderHouse.ts` lines 87–95 (`applyLeaderOccupation` unconditional strip).
- `src/game/villageLeadership.ts` line 929 (`validateVillageLeaderOnLoad` → `applyLeaderOccupation(state, null)` on every load).
- `src/game/workforce.ts` lines 131, 171, 209, 293, 326 (leader excluded from all auto-staff candidate pools and transitions).
- Authority rows: SIMULATION_AUTHORITY.md §5 line 131; §3 leaderHouse row line 73 ("Leader household residence; preserve valid work assignment"); Step 2 line 364 ("Route manual assignment, reassignment, demolition cleanup, and leader work through named workforce transitions").
- Existing tests that assert the stripping/exclusion behavior: `tests/leaderHouse.workforce.test.ts` lines 78–98; `tests/workforce.transitions.test.ts` line 146.

## Root cause

`leaderHouse.applyLeaderOccupation` treats "leader" as an exclusive occupation
that releases the leader from ALL work, ignoring the authority rule that the
leader may work. The workforce owner already implements the correct contract
(`assignWorkerTransition({ allowLeader: true })` keeps `occupation =
LEADER_OCCUPATION`; `prepareWorkforce` repairs only stale leader assignments),
so the stripping in `applyLeaderOccupation` — plus the load-time call and the
auto-staff exclusions — is what makes the leader permanently jobless.

## Fix

1. `leaderHouse.applyLeaderOccupation`: preserve a valid workplace — only clear
   `homeBuildingId`/occupants when the workplace is stale (missing, demolished,
   incomplete, rival, or not a job building), mirroring `prepareWorkforce`.
   Keep `occupation = LEADER_OCCUPATION`; keep `job` when a workplace exists.
   Removed the now-unused `removeHumanFromBuildingOccupants` helper.
2. `workforce.ts`: include the leader in auto-staff candidate pools and
   transitions (removed the `occupation !== LEADER_OCCUPATION` exclusions from
   `assignWorkerInPlace`, `assignBuilderInPlace`, `pickWorkerToTransfer`,
   `assignWorkerTransition`, `addToConstructionCrew`) so an idle leader is
   assigned like any settler. The `allowLeader` option is gone — the leader is
   a normal workforce candidate. `countWorkingAndIdleSettlers` no longer counts
   an idle leader as working (office alone is not a job).
3. `buildingActions.ts`: removed the same leader exclusions from the manual
   assign candidate pools and `canAssignWorkerToBuilding` / builder assignment.
4. `villageLeadership.validateVillageLeaderOnLoad`: keeps calling
   `applyLeaderOccupation` on load — it now preserves valid assignments, so the
   load-time strip is gone. Verified via regression test.
5. SIMULATION_AUTHORITY.md §5 + decision registry: recorded the approved
   behavior (leader participates in normal workforce assignment; special events
   — the election ceremony — are handled at the movement layer).

## Regression test

- `tests/leaderHouse.workforce.test.ts`: office-taking preserves the incoming
  leader's valid workplace and crews; a STALE workplace is repaired; the
  load-time reconcile (applyLeaderOccupation on load) preserves a valid
  assignment.
- `tests/workforce.transitions.test.ts`: "never auto-staffs the leader" → "auto-staffs
  an idle leader like any other settler" (office survives auto-staff).

## Invariants checked

- The leader participates in normal workforce assignment while retaining leader status and manor residency (§5, 2026-08-20).
- A living human appears in at most one workplace occupants list (unchanged).
- `homeBuildingId` ↔ workplace occupants agree (unchanged).
- The leader retains `occupation = LEADER_OCCUPATION` while holding a workplace.

## Save/migration impact

None. This is a behavior change, not a schema change. Legacy saves where the
leader was jobless simply keep their office; new runs let the leader work.
`pregnancyDueProgress`/occupation fields are unchanged in the schema.

## Verification result

- Focused tests green (leaderHouse 5, workforce transitions 15, invariants, demolish, church).
- Full suite green (49 files / 324+ tests).
- TypeScript (`tsc -p tsconfig.vitest.json --noEmit`) clean; ESLint clean.
- Deterministic probe: office preserves `homeBuildingId = 2 / occupation = leader / job = farmer`; load keeps it; auto-staff assigns an idle leader.
- Status: fixed (awaiting developer review before verified).

## Related commits or files

- `src/game/leaderHouse.ts` (fix — preserve valid workplace, stale-only repair)
- `src/game/workforce.ts` (fix — leader in auto-staff candidates; allowLeader removed; idle count truthful)
- `src/game/buildingActions.ts` (fix — manual assign candidate pools include the leader)
- `src/game/villageLeadership.ts` (load path now safe via applyLeaderOccupation fix)
- `SIMULATION_AUTHORITY.md` §5 (record approved behavior) + `src/game/simulation/decisionRegistry.ts` (leadership row)
- `tests/leaderHouse.workforce.test.ts`, `tests/workforce.transitions.test.ts` (updated)
- `BUG REPORTS/2026-08-20-leader-cannot-hold-workplace.md` (this report)

## Simulation Change Record

- Owner module: leaderHouse.ts (office/occupation) + workforce.ts (assignment) — the leader-workforce decision now follows the workforce owner; leaderHouse only reconciles office/residency
- Decision changed: the leader participates in normal workforce assignment like any other settler (developer-approved 2026-08-20) — office-taking preserves a valid workplace, auto-staff may assign the leader, load keeps the assignment; special events (election ceremony) are handled by the movement layer
- Cadence: assignment (auto-staff 4×/day) + player-command + daily/idempotent office reconcile — no tick-layer change
- State fields written: `homeBuildingId`, workplace `occupants`, `job` (assignment owner), `occupation` (office), stale-repair only from leaderHouse
- Why the change is needed: leader was permanently jobless — job stripped at office-taking and on every save-load, and auto-staff excluded them
- Player-visible behavior before: leader never held a workplace
- Player-visible behavior after: leader works like any settler when nothing special is ongoing; a manually assigned job survives save-load
- Performance impact: none (removed exclusions are cheap filter predicates; no new scans)
- New or updated tests: leaderHouse.workforce.test.ts (+2, 1 updated), workforce.transitions.test.ts (1 updated)
- Invariants checked: leader works while retaining office + manor residency; ≤1 workplace per human; homeBuildingId ↔ occupants agree; church manual staffing unaffected
- Save/migration impact: none (no schema change)
- Rollback plan: revert the three src/game changes and the authority §5 line; restore the two tests

I have read SIMULATION_AUTHORITY.md. I identified the owner and cadence of the decision I am changing, preserved the authoritative worker-state boundary, and will not introduce a second mutation path.
