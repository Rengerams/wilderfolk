# Why the 0.5.1 Play/Truth Plan Keeps Regressing

The 0.5.1 plan was completed as a product plan, but it was not enforced as a software contract. Later versions could improve performance or add features without having to prove that the original behavior still existed. The result is repeated semantic drift: the code remains present, tests compile, benchmarks improve, but the player-facing behavior changes.

## The actual failure pattern

| Failure | Example in the current 0.6.x line | Why the old plan did not prevent it |
|---|---|---|
| Cadence changed without a gameplay test | 24 ticks/day temporarily replaced the production 72-tick cadence | No test asserted the production cadence as a protected behavior |
| Rules duplicated in different layers | Conception, affair progress, gossip, and social movement are split between `humanTick.ts` and relationship helpers | No owner registry or forbidden-duplicate rule existed |
| Performance gates changed semantics | Narrower proximity, energy, and daily gates made pregnancy and affairs rare | Benchmarks measured milliseconds, not events per colony day |
| Legacy state was preserved incorrectly | Churches already auto-filled remained full after manual staffing was introduced | No migration invariant described what old occupant data meant |
| Worker optimization changed interaction behavior | Commands waited for or collided with the worker pipeline | No command round-trip tests covered UI actions such as assignment and demolition |
| Diagnostics were too ambiguous | `pregnanciesStarted: 0` was interpreted as “no pregnancy exists” | Counters did not distinguish interval events, active state, and completed outcomes |

The core problem is that the plan existed in documentation, while the code had no mechanism that could reject a violating change.

## The enforcement model

The Play/Truth plan needs three executable layers.

### 1. Golden behavior contracts

A golden behavior contract states what must remain true from the player’s perspective. It is not a unit test of a particular helper. It is a deterministic simulation fixture.

Examples:

```text
A staffed Church does not acquire priests unless a manual assign command is sent.
A living cursed Moon Howler returns on the next full moon.
After the Howler is killed, the next full moon may be quiet.
A married couple sharing a residence has a non-zero conception opportunity.
A successful conception creates pregnancyDueProgress.
A birth creates a child with both parents and increments birthsCompleted.
A demolition command removes the building and clears the selected building.
A worker cannot be assigned to two buildings.
```

These tests should run against the transition layer, not the React panel.

### 2. Invariants

Invariants detect impossible state regardless of which feature introduced it.

```ts
export function assertSimulationInvariants(state: WorldState): void {
  const assignedTo = new Map<number, number>();

  for (const building of state.buildings) {
    for (const humanId of building.occupants) {
      if (assignedTo.has(humanId)) {
        throw new Error(`Duplicate workplace assignment: human ${humanId}`);
      }
      assignedTo.set(humanId, building.id);
    }
  }

  const livingHowlers = state.entities.filter(
    (e) => e.alive && e.moonHowlerCursed,
  );
  if (livingHowlers.length > 1) {
    throw new Error(`Multiple active Moon Howlers: ${livingHowlers.length}`);
  }

  for (const human of state.entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    if (assignedTo.get(human.id) !== human.homeBuildingId) {
      throw new Error(`Work assignment mismatch for human ${human.id}`);
    }
    if (human.pregnant && human.pregnancyDueProgress == null) {
      throw new Error(`Pregnancy without due progress for human ${human.id}`);
    }
  }
}
```

Run these assertions after a command result and after each daily layer in development and deterministic tests.

### 3. Change gates

Any change to a simulation hot path must answer three questions before it is accepted:

| Question | Required evidence |
|---|---|
| Did the runtime cost change? | p50/p95 tick benchmark at the agreed population tiers |
| Did the behavior change? | Golden behavior fixtures and event-rate comparison |
| Did the state contract remain valid? | Invariant test suite and full regression suite |

A performance improvement is not accepted if it reduces relationship events, pregnancy opportunities, Church behavior, or event frequency below the declared range without an explicit design decision.

## The ownership registry

Keep a small machine-readable registry near the simulation code. Every gameplay decision must have one owner and one cadence.

```ts
export const SIMULATION_DECISIONS = {
  conception: {
    owner: 'humanRelationships.tryDailyConception',
    cadence: 'new-calendar-day',
    writes: ['pregnant', 'pregnantById', 'pregnancyProgress', 'pregnancyDueProgress'],
  },
  birth: {
    owner: 'humanLifecycle.tickPregnancyAndBirth',
    cadence: 'pregnancy-progress',
    writes: ['entities', 'eventLog', 'birth diagnostics'],
  },
  churchStaffing: {
    owner: 'buildingActions.assignIdleWorkerToBuilding',
    cadence: 'player-command',
    writes: ['building.occupants', 'human.homeBuildingId', 'human.job'],
  },
  moonHowler: {
    owner: 'moonHowler.tickMoonHowlerCycle',
    cadence: 'full-moon-event',
    writes: ['moonHowlerCursed', 'entity.type', 'Moon Howler events'],
  },
} as const;
```

The owner registry is useful because a future developer can search for the decision name instead of searching every file for a field assignment.

## The first safe implementation milestone

Do not begin by rewriting `humanTick.ts`. Start with the following small milestone:

1. Add `simulationInvariants.ts`.
2. Add `tests/simulation.invariants.test.ts`.
3. Add one Church manual-staffing golden test.
4. Add one conception golden test with a married couple sharing a home.
5. Add one Moon Howler quiet-full-moon test using an injectable RNG.
6. Add one worker-command round-trip test for demolition.
7. Run these tests after every simulation performance change.

This milestone does not change gameplay. It creates the safety net that the 0.5.1 plan lacked.

## Specific golden fixtures

### Church

```ts
it('does not auto-fill a Church', () => {
  const state = fixtureWithCompletedChurchAndFourIdleAdults();
  const next = runDailyAssignment(state);
  expect(next.buildings.find(isChurch)?.occupants).toEqual([]);

  const assigned = applyWorkerCommand(next, {
    proto: 1,
    op: 'assignWorker',
    buildingId: church.id,
    humanId: adults[0].id,
  });
  expect(assigned.buildings.find(isChurch)?.occupants).toEqual([adults[0].id]);
});
```

### Conception

```ts
it('allows a married couple sharing a home to reach a conception roll', () => {
  const state = fixtureWithMarriedCoupleAtHome({
    energy: 500,
    reproductionCooldown: 0,
  });
  const random = () => 0.001;
  const next = tryDailyConception(state, context, mother, random);
  expect(next).toBe(true);
  expect(mother.pregnant).toBe(true);
  expect(mother.pregnancyDueProgress).toBeGreaterThan(0);
});
```

### Moon Howler

```ts
it('allows a quiet full moon after the previous Howler is gone', () => {
  const state = fixtureWithNoLivingHowler();
  const next = tickMoonHowlerCycle(state, { random: () => 0.99 });
  expect(countActiveMoonHowlerCurses(next.entities)).toBe(0);
});

it('returns the same surviving Howler without selecting another human', () => {
  const state = fixtureWithLivingCursedHowler();
  const next = tickMoonHowlerCycle(state, { random: () => 0.001 });
  expect(countActiveMoonHowlerCurses(next.entities)).toBe(1);
  expect(findCursedEntity(next).id).toBe(originalHowler.id);
});
```

## Event-rate budgets

The benchmark must measure gameplay behavior as well as CPU time.

| Metric | Required observation |
|---|---|
| Social feedback | At least some visible social events per colony day when eligible adults are present |
| Conception opportunities | Non-zero for a healthy married couple sharing a home |
| Pregnancies | Measured over 30–60 colony days, not one daily diagnostic snapshot |
| Births | Counted separately from new conceptions |
| Scandals | Measured over many established-affair days |
| Moon Howler | Rare replacement events; no guaranteed new curse on every full moon |
| Church | Zero occupants until manual assignment; one priest activates the normal bonus |
| Commands | Assignment and demolition round-trip without waiting for worker idle |

## Why this will stop the cycle

The old plan failed repeatedly because it described desired outcomes but did not make violations impossible to miss. This plan adds three enforcement mechanisms:

1. **Ownership:** one named function is responsible for each decision.
2. **Invariants:** impossible states fail immediately instead of becoming UI mysteries.
3. **Golden behavior tests:** performance changes must preserve the player-visible contract.

Only after these are in place should relationship pacing or Moon Howler probabilities be tuned again.
