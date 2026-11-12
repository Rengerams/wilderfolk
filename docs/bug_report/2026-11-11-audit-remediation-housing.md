# Housing, genetics and identity defects — audit remediation (2026-11-11)

- Bug: the housing pipeline could still split a custodian household, the invariant audit was unobserved, capacity was not enforced at the writer, the architecture doc claimed contracts the code did not keep, and a welcomed refugee reached citizenship without a genome or born marks.
- Status: resolved
- Severity: high (W-70/W-71), medium (W-72/W-74/W-75), medium (W-77)
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1, development target 0.6.5.2
- Reporter: full-code audit §4.5/§5.1 and the round-2 verification
- Area: housing pipeline, population report, refugee citizenship
- Owner module: `housingPipeline.ts`, `populationGrowth.ts`, `tickLayerAssign.ts`, `settlerTraits.ts`, `groupEvents.ts`

## Status history
- 2026-11-11 — resolved: split repair fixed at the repair owner, invariant audit observed weekly, capacity enforced in `writeResidence`, doc corrected, citizen identity established at citizenship.

## Observed behavior

- **W-70** With no destination available, the capacity pass unhoused the custodian group and the adult fallback then seated the father alone in the emptied home: mother + six children homeless beside five free beds.
- **W-71** `collectHousingInvariantViolations` skipped a minor with no home and resolved custodians only over movable residents, so the manor household was never audited; no production caller read `report.violations`.
- **W-72** The growth report counted reserved manor beds as open and could report "good" with homeless settlers.
- **W-73** Same-tick newborns/arrivals could miss the housing pulse because the movable list came from a tick-start snapshot.
- **W-74** `moveResident`/`writeResidence` did not enforce capacity; only current callers checked first.
- **W-75** `docs/HOUSING_ARCHITECTURE.md` claimed "no homeless while beds exist — DONE", "never evicts a whole family" and that `syncResidenceOccupants` was the only roster writer.
- **W-77** A welcomed refugee became a player settler with no genome and no born marks; the load backfill later gave a seeded genome, so the same settler's DNA changed by reloading.

## Expected behavior

A custodian household is seated together whenever a residence can hold it; with no destination it leaves together rather than splitting. Assignable capacity is the reported capacity. No writer can overfill a home. Citizenship establishes permanent identity before the settler acts.

## Reproduction steps

1. Build two houses, place a widow with six children plus a spare adult, and remove a destination: pre-fix, the father is seated alone and the widow's group is homeless.
2. Save/load a welcomed refugee: pre-fix, its genome changes after the reload backfill.
3. `npx vitest run tests/housing* tests/residency*`: pre-fix W-70 case produced two home states.

## Evidence

Audit traces (`housingPipeline.ts:653-681/760-778`, `:999/1017-1030`, `:518-564`; `populationGrowth.ts:220-235/255/287`; `groupEvents.ts:832-838`; `saveLoad.ts:118-133`) and the new regressions in `tests/housing.custodianSplit.test.ts`, `tests/residencyCapacity.writers.test.ts`, `tests/housingPulse.audit.test.ts`.

## Root cause

The over-capacity repair had a fallback that re-seated the other adult, the invariant collector's coverage was narrower than its name, the report used inclusive capacity, and citizenship never ran the identity owner.

## Fix / proposed fix

- `rebalanceOvercrowdedResidences` unhouses the dependent household together when no destination exists; `assignFamilyToResidence` refuses to seat other adults while a custodian group is unseated.
- `collectHousingInvariantViolations` resolves custodians over every resident (Moon Howler/prison guards) and reports a housed custodian with a homeless minor; `tickLayerAssign` reads `report.violations` on the weekly audit and records it in the chronicle.
- Growth report uses assignable beds, names the Leader's House reservation and warns on homeless.
- `tickLayerAssign` builds the movable list from `allHumans` (byType + `ctx.newEntities`).
- `writeResidence` enforces the bed capacity (manor hold exempt, legal-split check first).
- Doc corrected to the real contract; stale prisoner test rewritten to the real arrest rule.
- `settlerTraits.establishCitizenIdentity` rolls the founder genome and born marks through `grantMark`; the prisoner-recruitment and refugee-admission owners call it.

## Save/migration impact

None required. The load backfill remains for genuinely legacy settlements that predate genomes; new citizens no longer depend on it.

## Verification result

- `npx vitest run` over housing/residency/prisonerHousing/leaderHouse/guardianship/moonHowler files: **31 files, 207 passed**.
- `npx tsc -p tsconfig.app.json --noEmit` and `tsconfig.vitest.json`: **PASS**.
- oxlint on the three source files: **0 errors**; comment and docs checks: **PASS**; cycle gate: **PASS**.
- Full `standard`/`colony-integration`: run after integration (see remediation log).
