# Bug: Immigrant pregnancy missing pregnancyDueProgress

- Status: resolved
- Date discovered: 2026-08-20
- Version/build: 0.6.1-line (working tree, uncommitted)
- Reporter: Deep Code (coding agent session 2026-08-20)
- Area: Truth
- Owner module: entityFactory.ts (entity construction state init) — pregnancy decisions remain in humanRelationships.ts
- Cadence: entity construction (world-gen / immigration spawn), not a tick-layer decision

## Status history

- 2026-08-20 — open (flaky full-suite failure in tests/demolish.roundtrip.test.ts; deterministic probe proved the root cause)
- 2026-08-20 — fixed (entityFactory now sets pregnancyDueProgress at construction; regression tests added)

## Observed behavior

A full-suite run fails intermittently:

```
FAIL tests/demolish.roundtrip.test.ts > demolition round trip > does not reappear after subsequent sim ticks (no stale state)
AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "human 101 is pregnant without a valid pregnancyDueProgress" ]
```

The failure is flaky (passes 5/5 in isolation) because it depends on the RNG-gated immigration roll in `tickLayerDaily.tickImmigration`: every 2 days it may spawn an expecting couple (`worldGen.createImmigrantSettler`, 12% couple chance), and the wife is created via `createEntity({ pregnant: true, pregnancyProgress: 10–60 })`.

A deterministic probe of the constructor alone reproduces the invalid state:

```
pregnant: true
pregnancyProgress: 10
pregnancyDueProgress: undefined
INVARIANT HOLDS: false
```

## Expected behavior

Per SIMULATION_AUTHORITY.md §5 pregnancy invariants: *A pregnant human has a valid `pregnancyDueProgress`.* Any entity created with `pregnant: true` must carry a positive, finite `pregnancyDueProgress` so the invariant collector stays clean after any spawn path.

## Reproduction steps

1. Run `npx vitest run tests/demolish.roundtrip.test.ts` — passes (RNG did not roll a couple).
2. Run the full suite (`npm test`) until the immigration couple roll fires — invariant violation appears. (Flaky; see probe below for determinism.)
3. Deterministic: call `createEntity(EntityType.Human, 0, 0, 101, 100, false, { gender: 'female', pregnant: true, pregnancyProgress: 10, pregnantById: 100, partnerId: 100 })` and inspect `pregnancyDueProgress` — it is `undefined`.

## Evidence

- Probe run (tsx): `pregnancyDueProgress: undefined`, `INVARIANT HOLDS: false`.
- Full-suite log: `human 101 is pregnant without a valid pregnancyDueProgress` in `demolish.roundtrip.test.ts` at line 195 (`collectSimulationInvariantErrors(ticked)`).
- `src/game/entityFactory.ts` lines 118–126: the `opts.pregnant` branch sets `pregnant`, `pregnancyProgress`, `pregnantById`, `relationshipStatus` — never `pregnancyDueProgress`.
- `src/game/worldGen.ts` `createImmigrantSettler` (around line 315): passes `pregnant: true` and `pregnancyProgress` but no `pregnancyDueProgress`.
- `src/game/simulation/humanLifecycle.ts` line 46: `entity.pregnancyDueProgress ?? PREGNANCY_TICKS` masks the missing field at birth, which is why the game plays normally while the invariant is broken.

## Root cause

`entityFactory.createEntity` is the single leaf constructor for all spawned entities, but its pregnant branch does not initialize `pregnancyDueProgress`. The conception owner (`humanRelationships.startMarriedPregnancy` / `startAffairPregnancy`) always sets it, so in-union pregnancies are fine; only constructor-based spawns (immigrants, and any future world-gen pregnancy) create pregnant humans without due progress. The lifecycle owner's `?? PREGNANCY_TICKS` fallback converts the missing field into a silent default term, hiding the violation from gameplay while the invariant collector still reports it.

## Fix

In `src/game/entityFactory.ts`, in the `if (opts?.pregnant && entGender === 'female')` branch, set `pregnancyDueProgress` to a valid value using the same term formula as the conception owner (`PREGNANCY_TICKS * (0.85 + Math.random() * 0.3)`, rounded). `PREGNANCY_TICKS` is already exported from `dayCycle.ts`, which `entityFactory` already imports from.

This is an entity-construction state-initialization fix, not a second conception implementation: no roll, no daily gate, no diagnostic — it only guarantees the §5 state invariant at construction time.

## Regression test

- Add a test asserting that `createEntity(..., { pregnant: true, pregnancyProgress: N })` yields `pregnancyDueProgress` that is finite and `> 0` (and `> N`).
- Keep the existing demolish round-trip test as the end-to-end guard (its invariant assertion now holds even when immigration rolls a couple).
- Objective B adds a deterministic spawn-path test (expectant immigrant couple → invariants clean, `activePregnancies` counts them).

## Invariants checked

- A pregnant human has a valid `pregnancyDueProgress` (§5).
- A non-pregnant human carries no pregnancy parent/progress state (unchanged).
- New pregnancy is created only by the conception owner (unchanged — this fix does not create pregnancies, it initializes spawned state).
- Birth is created only by the lifecycle owner (unchanged).

## Save/migration impact

None. `pregnancyDueProgress` is already in `saveSchema.ts` (line 36); the fix only ensures constructor-created entities populate the field at creation. No migration needed.

## Verification result

- Focused test green.
- Full suite green on 3 consecutive runs (49 files / 324 tests, includes the 2 new regression tests).
- TypeScript (`tsc -p tsconfig.vitest.json --noEmit`) clean; ESLint clean.
- 60-day seeded relationship-feel measurement (`scripts/measure-relationship-feel.ts`): affairChecks/day 15.4, 27 affairs established, 5 scandals, tick p50 0.4 ms / p95 1.4 ms at 18 colonists — consistent with the pre-fix baseline (20.3 checks/day, 27 established, 8 scandals, p50 0.4 / p95 1.8 ms at 26 colonists); the fix changes pregnancy term variance, not event frequencies.
- Status: resolved by the 2026-08-21 bug-report audit: constructor and immigrant-spawn regressions remain in place and the complete suite passed (55 files / 347 tests).

## Related commits or files

- `src/game/entityFactory.ts` (fix — sets `pregnancyDueProgress` in the `opts.pregnant` branch)
- `tests/simulation.invariants.test.ts` (+2 regression tests: constructor path + `createImmigrantSettler` couple path)
- `BUG REPORTS/2026-08-20-immigrant-pregnancy-missing-due-progress.md` (this report)
- `docs/OBJECTIVE_PLAN_CHANGE_2026-08-20.md` (objective-plan change record)
- `CHANGELOG.md` (Unreleased — post-program fix note)

## Simulation Change Record

- Owner module: `entityFactory.ts` (entity construction state init); pregnancy decisions remain in `humanRelationships.ts`
- Decision changed: leaf constructor now guarantees the §5 invariant "a pregnant human has a valid `pregnancyDueProgress`" for every spawn path
- Cadence: entity construction (world-gen / immigration spawn) — no tick-layer change
- State fields written: `human.pregnancyDueProgress` (initialization only, in the `opts.pregnant` branch)
- Why the change is needed: `createEntity({pregnant:true})` produced pregnant humans without due progress; immigrant expecting couples (12% of immigration rolls) violated the invariant, surfacing as a flaky full-suite failure
- Player-visible behavior before: immigrant wives were pregnant but the lifecycle masked the missing field with `?? PREGNANCY_TICKS`, so births occurred at a fixed 24-day term
- Player-visible behavior after: immigrant pregnancies carry the same 85%–115% term variance as colony pregnancies; event frequencies unchanged (re-measured)
- Performance impact: one multiplication + Math.random per pregnant-spawn — negligible (not on a per-tick path)
- New or updated tests: `tests/simulation.invariants.test.ts` +2 (constructor path, `createImmigrantSettler` couple path)
- Invariants checked: §5 pregnancy invariants; at-most-one-Moon-Howler; workforce/residence/prison roles (full suite green)
- Save/migration impact: none — field already in `saveSchema.ts`
- Rollback plan: revert `entityFactory.ts` pregnant branch and remove the 2 regression tests; suite returns to flaky-but-green-mostly baseline (not recommended)

I have read SIMULATION_AUTHORITY.md. I identified the owner and cadence of the decision I am changing, preserved the authoritative worker-state boundary, and will not introduce a second mutation path.
