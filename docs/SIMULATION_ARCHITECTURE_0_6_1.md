# Wilderfolk 0.6.1: Lightweight Simulation Architecture

## Design principle

Do not build a new framework. Keep the current worker and tick layers, but enforce three rules:

1. **One authoritative state:** the worker-owned `WorldState` is the only simulation truth while the worker is active.
2. **One owner per decision:** each gameplay rule has one module that may create or change that state.
3. **One mutation boundary:** player commands and simulation transitions enter through named functions, not arbitrary field writes.

This is enough to stop the recurring regressions without introducing a large event bus, ECS rewrite, or state-management library.

## Current 0.6.1 ownership map

| Current area | Current files | Proposed single owner | Allowed responsibilities |
|---|---|---|---|
| Worker authority | `gameLoop.ts`, `GameWorkerHost.ts`, `gameWorker.ts` | `GameWorkerHost` + `GameLoop` boundary | Transport, ordering, delta application; never gameplay decisions |
| Tick orchestration | `gameTick.ts`, `tickLayerRealtime.ts`, `tickLayerSystems.ts`, `tickLayerDaily.ts`, `tickLayerAssign.ts` | `gameTick.ts` | Calls layers in a fixed order; does not duplicate rules |
| Movement | `tickLayerRealtime.ts`, movement helpers | `movementSystem.ts` or current realtime layer | Position, pathfinding, target following |
| Workforce | `workforce.ts`, `buildingActions.ts` | `workforce.ts` | Assignment, reassignment, auto-staff policy, worker invariants |
| Buildings | `buildingActions.ts` | `buildingActions.ts` | Player building commands, construction, demolition, upgrades |
| Relationships | `humanRelationships.ts`, social sections of `humanTick.ts` | `humanRelationships.ts` | Courtship, affairs, conception, scandal decisions |
| Social feel | social section of `humanTick.ts` | `humanSocial.ts` | Cheap nearby dialogue, flirt feedback, heart-line state, small progress |
| Pregnancy/birth | `humanLifecycle.ts` | `humanLifecycle.ts` | Existing pregnancy progress and birth only |
| Moon Howler | `moonHowler.ts` | `moonHowler.ts` | Survivor return, rare replacement event, Church outcomes |
| Leader residence | `leaderHouse.ts`, daily call site | `leaderHouse.ts` | Idempotent leader/family residency reconciliation |
| UI | React panels and `App.tsx` | UI only | Sends typed commands, displays authoritative results |
| Diagnostics | `relationshipDiagnostics.ts` | Diagnostics recorder | Counts attempts, gates, successes, active state, completed events |

## What must not happen

The following patterns are prohibited after this plan is adopted:

| Prohibited pattern | Replacement |
|---|---|
| UI directly edits `WorldState.entities` or `buildings` | UI sends a typed `WorkerCommand` |
| `humanTick.ts` starts pregnancies directly | It calls the one conception transition in `humanRelationships.ts` |
| `humanLifecycle.ts` creates a second pregnancy path | It only progresses existing pregnancies and creates births |
| Generic auto-staff fills Church, Prison, Barracks, School, or Town Hall | Manual buildings accept explicit assignment only |
| Moon Howler spawn is decided in multiple layers | Only `moonHowler.ts` owns it |
| A performance change silently changes cadence | Cadence is declared and protected by a test |
| A counter uses one name for several meanings | Use interval, active, and lifetime/completed names |

## Minimal mutation boundary

Create one small transition module rather than a large architecture:

```text
src/game/simulation/transitions.ts
```

It should initially contain only high-risk decisions:

```ts
export type SimulationTransition =
  | { type: 'assign_worker'; buildingId: number; humanId: number }
  | { type: 'remove_worker'; buildingId: number; humanId: number }
  | { type: 'start_pregnancy'; motherId: number; fatherId?: number; kind: 'married' | 'affair' }
  | { type: 'complete_birth'; motherId: number }
  | { type: 'establish_affair'; aId: number; bId: number }
  | { type: 'spawn_moon_howler'; humanId: number }
  | { type: 'cure_moon_howler'; humanId: number };
```

Do not move all code into this file. The transition function should delegate to existing owners first:

```ts
export function applySimulationTransition(
  state: WorldState,
  transition: SimulationTransition,
): WorldState {
  switch (transition.type) {
    case 'assign_worker':
      return assignIdleWorkerToBuilding(state, transition.buildingId, transition.humanId);
    case 'remove_worker':
      return removeWorkerFromBuilding(state, transition.buildingId, transition.humanId);
    case 'start_pregnancy':
      return startPregnancyTransition(state, transition);
    default:
      return state;
  }
}
```

This gives the project one boundary now, while allowing implementation extraction later.

## Cadence contract

Every owner must state its cadence in a comment and in tests.

| Cadence | Allowed work |
|---|---|
| `realtime` | Movement, animation, cached target following |
| `staggered-social` | Nearby dialogue, flirting, heart feedback, small progress |
| `new-calendar-day` | Conception attempt, affair establishment, gossip/scandal roll, daily economy |
| `full-moon-event` | Existing Howler return and rare replacement roll |
| `player-command` | Assignment, demolition, repair, upgrade, recipe/mode changes |
| `pregnancy-progress` | Existing pregnancy advancement and birth |

The rule is: **a performance optimization may reduce how much work happens inside a cadence, but it may not move a decision to another cadence without a deliberate design change and a test update.**

## Strict pre-merge checklist

A simulation or performance change is not ready to merge until every applicable item is answered.

### Ownership

- [ ] Which single module owns the decision after this change?
- [ ] Did the change add a second write path for the same state field?
- [ ] If a helper writes a field, is that helper called only by the owner?
- [ ] Is the UI only sending a command or displaying a result?

### Cadence

- [ ] What cadence does this rule use: realtime, staggered social, daily, full moon, pregnancy progress, or command?
- [ ] Did the cadence change?
- [ ] If yes, is the change intentional and covered by a golden behavior test?
- [ ] Does the rule run zero, one, or many times per entity per cadence window as intended?

### State invariants

- [ ] No human appears in two building occupant lists.
- [ ] `human.homeBuildingId` matches the building occupant list.
- [ ] A pregnant human has `pregnancyDueProgress`.
- [ ] A non-pregnant human does not retain pregnancy progress or pregnancy parent state.
- [ ] There is at most one living cursed Moon Howler.
- [ ] A living Moon Howler is either a cursed human or cursed werewolf, not a duplicate entity.
- [ ] A manual building is never filled by generic auto-staffing.
- [ ] A leader’s office status and workplace assignment do not overwrite each other.
- [ ] A removed building is absent from the authoritative building array and selection is cleared.
- [ ] Worker command results cannot be overwritten by an older tick delta.

### Relationship behavior

- [ ] A healthy married couple sharing a home reaches a conception attempt.
- [ ] Conception diagnostics distinguish eligibility rejection, proximity failure, energy failure, and random-roll failure.
- [ ] `pregnanciesStartedThisInterval` is not used as an active-pregnancy count.
- [ ] Births are counted separately from conceptions.
- [ ] Affair progress can begin before scandal exposure.
- [ ] Scandals require an established affair and do not occur merely because a flirt happened.
- [ ] Frequent social feedback does not run expensive global scans.

### Workforce/UI behavior

- [ ] Church begins with zero priests unless a player assignment exists.
- [ ] Church capacity four is displayed as capacity, not as a required staffing target.
- [ ] Explicit priest selection works while the worker is already assigned elsewhere.
- [ ] Demolish removes the building and clears the selected panel.
- [ ] Auto-staff excludes manual buildings.
- [ ] The leader can be assigned to work without losing leader status or manor residency.

### Performance

- [ ] Benchmark p50 and p95 were recorded at the agreed population tiers.
- [ ] The worker watchdog was tested under slow first tick and high-load conditions.
- [ ] Event rates were compared, not only milliseconds.
- [ ] No new full-population scan was added to a per-tick path.
- [ ] New spatial queries use the spatial grid or a documented cheap fallback.

### Validation

- [ ] Focused tests pass.
- [ ] TypeScript passes.
- [ ] Full regression suite passes.
- [ ] A seeded 30–60 day simulation was run for relationship changes.
- [ ] The change is documented in the changelog with behavior impact, not only implementation details.

## Invariant implementation

Add:

```text
src/game/simulation/simulationInvariants.ts
tests/simulation.invariants.test.ts
```

Start with a function that returns errors rather than throwing in production:

```ts
export function collectSimulationInvariantErrors(state: WorldState): string[] {
  const errors: string[] = [];
  const assignedTo = new Map<number, number>();

  for (const building of state.buildings) {
    for (const humanId of building.occupants) {
      if (assignedTo.has(humanId)) {
        errors.push(`human ${humanId} assigned to multiple buildings`);
      }
      assignedTo.set(humanId, building.id);
    }
  }

  for (const human of state.entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    if (assignedTo.get(human.id) !== human.homeBuildingId) {
      errors.push(`human ${human.id} workplace mismatch`);
    }
    if (human.pregnant && human.pregnancyDueProgress == null) {
      errors.push(`human ${human.id} pregnant without due progress`);
    }
  }

  const livingHowlers = state.entities.filter(
    (entity) => entity.alive && entity.moonHowlerCursed,
  );
  if (livingHowlers.length > 1) {
    errors.push(`multiple living Moon Howlers: ${livingHowlers.length}`);
  }

  return errors;
}
```

Use `assertSimulationInvariants()` in development after worker command results and after daily transitions. Keep the collector available in tests and diagnostics.

## Refactor sequence from the current codebase

### Step 1: No behavior change

Add the registry, cadence comments, invariant collector, and a test command. Run it against the current save fixtures. Fix only states that are already invalid.

### Step 2: Workforce first

Keep `workforce.ts` as the single owner. Make `buildingActions.ts` delegate assignment to it. Remove any remaining direct occupant/job writes outside workforce transitions. Add Church, leader, reassignment, and demolition tests.

### Step 3: Pregnancy and birth

Keep `humanRelationships.ts` as the only owner of new conception. Keep `humanLifecycle.ts` as the only owner of pregnancy progression and birth. Add explicit diagnostics for active pregnancies and births.

### Step 4: Moon Howler

Keep all spawn, return, cure, and death interpretation in `moonHowler.ts`. Add an injectable RNG. Test three cases: survivor returns, killed Howler followed by quiet full moon, and rare replacement event.

### Step 5: Relationship feel

Extract the cheap social layer from `humanTick.ts` into `humanSocial.ts`. It may write only dialogue/visual feedback and small progress. Daily relationship outcomes remain in `humanRelationships.ts`.

### Step 6: Worker commands

Keep `GameWorkerHost` responsible for transport and ordering only. Keep command semantics in `commands.ts` and domain owners. Add round-trip tests for assignment, Church selection, and demolition.

### Step 7: Performance gate

Re-run the capacity benchmark. Report both:

```text
p50/p95 tick time
social events per day
conception attempts per day
pregnancies per 30 days
births per 30 days
scandals per 30 days
Moon Howler events per in-game year
```

A faster build that violates the behavior budget is not an acceptable optimization.

## First milestone to implement

The least risky first milestone is:

1. Add `simulationInvariants.ts`.
2. Add `tests/simulation.invariants.test.ts`.
3. Add a Church manual-staffing golden test.
4. Add a married-at-home conception eligibility test.
5. Add a quiet-full-moon Moon Howler test.
6. Add a demolition command round-trip test.
7. Run these tests before and after the next performance change.

This is deliberately small. It gives the project an enforceable source of truth before we move code between files or tune probabilities again.
