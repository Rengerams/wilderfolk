# Bug: Housing/residence assignment has no declared owner row

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 2 full-code ownership audit)
- Area: Truth
- Owner module: dayCycle.ts (residence functions) — now declared in SIMULATION_AUTHORITY.md §3
- Cadence: assignment (tickLayerAssign, ~4×/day) + immediate on place/recruit/death

## Status history
- 2026-08-20 — open (discovered in the Objective 2 full-code ownership audit)
- 2026-08-20 — investigating (authority-doc gap: no declared owner row for residence assignment; awaiting authority resolution — §13 requires the doc to be updated before declaring an owner)
- 2026-08-20 — fixed (authority doc §3 housing row + decision registry `housing` key declared)
- 2026-08-20 — verified (registry tests + full suite green)

## Observed behavior

Residence assignment — writing `human.residenceBuildingId` and syncing house
`occupants` — is performed by `dayCycle.assignMissingResidences` /
`syncResidenceOccupants` (30 write sites in dayCycle.ts), scheduled from
`tickLayerAssign.ts`. Neither SIMULATION_AUTHORITY.md §3 (ownership table) nor
`src/game/simulation/decisionRegistry.ts` (11 decision rows) names housing or
residence assignment as a decision with an owner.

## Expected behavior

SIMULATION_AUTHORITY.md §3: "Every important gameplay decision has exactly one
owner. Other modules may read the result but may not recreate or overwrite the
decision." Housing is an important decision (where every settler lives) and
must have an owner row so future changes cannot add a second housing balancer.

## Reproduction steps

1. Open SIMULATION_AUTHORITY.md §3 ownership table — no housing/residence row.
2. Open `src/game/simulation/decisionRegistry.ts` — no housing key.
3. Grep `residenceBuildingId =` in `src/game` — dayCycle.ts is the writer.

## Evidence

- `src/game/dayCycle.ts` — 30 `residenceBuildingId` write sites
  (assignMissingResidences, syncPartnerResidence, syncResidenceOccupants,
  death cleanup)
- `src/game/tickLayerAssign.ts:41–42` — `syncResidenceOccupants` +
  `assignMissingResidences` scheduled on the assignment pulse
- Writers outside dayCycle are documented delegation: leaderHouse.ts
  (leadership row), humanLifecycle.ts (child inherits mother's home at birth),
  moonHowler.ts (transform/restore snapshot), buildingActions.ts
  (assignResidentToBuilding command), tradeCaravans.ts (caravan duty release),
  simBuffers/applyKinematics.ts (worker authoritative apply)

## Root cause

The authority document's ownership table lists workforce/assignment but does
not separate "residence" (housing balancer) from "workplace" (job staffing).
They share the `occupants` field but are different decisions with different
state fields (`residenceBuildingId` vs `homeBuildingId`), and only workforce
got a row.

## Fix

Documentation change only — no behavior change (2026-08-20, authority-doc
first per §13):

1. `SIMULATION_AUTHORITY.md` §3 gained a row: **Housing and residence
   assignment** — owner `dayCycle.ts` residence functions
   (`assignMissingResidences`, `syncResidenceOccupants`, `syncPartnerResidence`,
   death cleanup) scheduled from `tickLayerAssign.ts`, with the immediate player
   entry `buildingActions.assignResidentToBuilding`; cadence assignment +
   immediate on place/recruit/death/divorce/arrest; writes
   `residenceBuildingId`, residence `occupants`, household membership.
2. `src/game/simulation/decisionRegistry.ts` gained the `housing` key with the
   same owner/cadence/writes/scheduling/test coverage, and the delegation list
   (divorce/arrest → humanRelationships, demolish → buildingActions, birth →
   humanLifecycle, leader move → leaderHouse, moon transform/restore →
   moonHowler, worker authoritative apply → simBuffers/applyKinematics).

## Regression test

`tests/simulation.decisionRegistry.test.ts` — `REQUIRED_DECISIONS` extended
with `housing`; the exact-key-set test now pins 12 decisions including housing
(owner, cadence, writes, scheduling, distinct owners all asserted).

## Invariants checked

- Every decision has exactly one owner (violated: housing has none declared).
- `residenceBuildingId` ↔ residence occupants consistency (checked by
  `simulationInvariants.ts`, Objective 1).

## Save/migration impact

None.

## Verification result

Focused registry tests pass (4/4, now pinning 12 decisions); full suite green.

## Related commits or files

- `SIMULATION_AUTHORITY.md` §3 (housing row added)
- `src/game/simulation/decisionRegistry.ts` (`housing` key added)
- `tests/simulation.decisionRegistry.test.ts` (required set extended)
