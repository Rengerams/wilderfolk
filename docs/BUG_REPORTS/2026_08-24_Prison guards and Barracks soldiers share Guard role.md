# Prison guards and Barracks soldiers share the Guard role

- Status: resolved — role split in source; full suite 96 files / 568 tests
- **Date discovered:** 2026-08-22
- **Version/build:** 0.6.3 Unreleased
- **Reporter:** Simulation-role audit
- **Area:** Play | Simulation Authority | Truth
- **Owner modules:** `src/game/gameTypes.ts`, `src/game/workforce.ts`, `src/game/defenseStructures.ts`, `src/game/simulation/humanRelationships.ts`
- **Cadence:** Assignment, daily staffing, scandal arrest, and defense calculations

## Observed behavior

The Prison and Barracks both map to the same `JobType.Guard`. A human assigned to a completed Prison therefore receives the same profession identity as a soldier assigned to a Barracks. The building assignment distinguishes the workplace in some code paths, but the job type does not distinguish prison security from settlement defense.

The Prison also has mixed occupants: prison guards are represented through `homeBuildingId`, while prisoners are represented through `prisonBuildingId`. This is supported by the simulation invariants, but it makes role checks easy to confuse.

`defenseStructures.ts` correctly counts only live, non-imprisoned `JobType.Guard` workers assigned to completed Barracks for the defense bonus. The Prison guard is not intended to contribute to that Barracks bonus. However, the shared job label and shared job type make the distinction unclear to the workforce, UI, diagnostics, and future systems.

## Expected behavior

The game should expose two distinct security roles:

- **Soldier / Barracks Guard:** assigned to a Barracks and counted for settlement defense, militia strength, guard bonuses, and defensive events.
- **Prison Guard:** assigned to a Prison and counted only for prisoner supervision, prison staffing, and prison-related events.

A Prison Guard must never increase Barracks defense. A Barracks Soldier must not automatically satisfy the Prison’s staffing requirement unless explicitly assigned to the Prison. A prisoner must never be counted as either role.

## Reproduction steps

1. Build and complete a Barracks and a Prison.
2. Assign one adult settler to the Barracks and another adult settler to the Prison.
3. Inspect both settlers’ job labels and `job` fields.
4. Observe that both are represented as `JobType.Guard` / `Guard` even though their responsibilities differ.
5. Inspect the defense and prison helpers. The building assignment is used to separate some effects, but the profession identity remains shared.

## Evidence

Current job map in `src/game/gameTypes.ts`:

```ts
[BuildingType.Prison]: JobType.Guard,
[BuildingType.Barracks]: JobType.Guard,
```

Current role labels contain only one security label:

```ts
[JobType.Guard]: 'Guard',
```

The Prison arrest path requires a staffed Prison and places the offender in the Prison’s mixed `occupants` list. The Barracks defense path checks for a completed Barracks, `JobType.Guard`, and a non-imprisoned human.

## Root cause

The original workforce model used one `Guard` profession for two different building roles. Building assignment currently carries the missing distinction, but no first-class role exists for Prison security.

## Desired fix

Introduce separate authoritative roles, for example:

- `JobType.Soldier` or `JobType.BarracksGuard` for Barracks workers;
- `JobType.PrisonGuard` for Prison workers.

Update the building-to-job map, occupation labels, workforce assignment, defense counters, Prison staffing checks, UI projections, diagnostics, and save/load migration together. Existing saves containing `JobType.Guard` must be migrated based on the assigned workplace: Barracks assignments become Soldiers; Prison assignments become Prison Guards.

The fix must retain the existing prisoner fields and release flow. It must also preserve the rule that prisoners are removed from work and residence while serving a sentence and are released when their sentence expires.

## Regression tests

Add focused tests covering:

1. Barracks assignment creates a Soldier/Barracks Guard and contributes to defense.
2. Prison assignment creates a Prison Guard and does not contribute to defense.
3. A Prison Guard satisfies Prison staffing but not Barracks defense.
4. A Barracks Soldier does not satisfy Prison staffing unless assigned to the Prison.
5. Imprisoned humans contribute to neither role.
6. Prison occupants and prisoner entity fields remain synchronized.
7. Sentence expiry releases the prisoner without creating a security worker.
8. Legacy saves migrate the old shared `Guard` role deterministically from workplace assignment.

## Invariants

- One simulation owner writes job and workplace assignment state.
- Defense strength counts only eligible Barracks Soldiers.
- Prison staffing counts only eligible Prison Guards.
- Prisoners never hold a worker assignment while imprisoned.
- UI displays worker state received from the simulation and does not infer roles locally.
- Rival settlement workers remain excluded from player defense and Prison staffing.

## Save/migration impact

Yes. The new role values require backward-compatible migration for existing entities with `JobType.Guard`. Migration must use `homeBuildingId` and the corresponding building type. Ambiguous or unassigned legacy guards should be handled deterministically and recorded in the migration tests.

## Verification result

- Source audit: confirmed.
- Focused split-role tests: 5/5 files and 5/5 role-specific tests passed.
- Existing workforce, invariant, and Moon Howler tests: 51/51 passed.
- TypeScript validation after the split: passed.
- Full regression suite: 79/80 files passed; 441/443 tests passed. The two failures are pre-existing/missing `public/sprites/tileset_grass.png` asset failures in `terrainAtlas.waterColor.test.ts`, unrelated to the role split.
- Live visual/UI verification: pending.

## Related files

- `src/game/gameTypes.ts`
- `src/game/workforce.ts`
- `src/game/defenseStructures.ts`
- `src/game/simulation/humanRelationships.ts`
- `src/game/simulation/simulationInvariants.ts`
- `src/game/saveLoad.ts`
- `tests/church.manualStaffing.test.ts`

## Unique ID

`2026-08-22-prison-guards-and-barracks-soldiers-share-role`

## Audit change references

- Change 6: resolve guard-slot versus prisoner-slot capacity and role semantics.
- Change 10: strengthen prison and security invariants.
- Change 18: reuse venue shift concepts only through an appropriate security schedule contract.

## Report filename note

The historical filename is preserved for repository compatibility. The unique report code above is the canonical identifier for cross-report references.

## End of unique-ID supplement

