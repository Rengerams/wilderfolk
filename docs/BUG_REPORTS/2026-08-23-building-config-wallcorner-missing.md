# Bug: BuildingConfig is missing WallCorner

- Unique ID: 2026-08-23-building-config-wallcorner-missing
- Status: resolved
- Date discovered: 2026-08-23
- Version/build: v0.6.3 working tree
- Reporter: Manus AI
- Area: Truth | build
- Owner module: `src/game/buildings.ts`
- Cadence: build-time/type validation

## Status history

- 2026-08-23 — open (full TypeScript validation reported TS2741)
- 2026-08-23 — resolved (WallCorner catalog entry restored; TypeScript, ESLint, and diff checks passed)

## Observed behavior

`BUILDING_CONFIGS` is declared as `Record<BuildingType, BuildingConfig>`, but it has no `[BuildingType.WallCorner]` entry. TypeScript reports that the required `wallCorner` property is missing.

## Expected behavior

Every value in `BuildingType` must have one authoritative `BuildingConfig`. WallCorner must retain its existing logical corner role and use the existing wall-corner renderer/topology path.

## Reproduction steps

1. Open `src/game/buildings.ts`.
2. Run `npx tsc --noEmit`.
3. Observe TS2741 at the `BUILDING_CONFIGS` declaration for missing `wallCorner`.

## Evidence

`src/game/buildings.ts:143` reports: `Property 'wallCorner' is missing in type ... but required in type 'Record<BuildingType, BuildingConfig>'`.

## Root cause

`BuildingType.WallCorner` exists at the vocabulary level, and wall-corner code exists in `buildingRotation.ts` and `stripJunction.ts`, but the catalog entry was omitted from `BUILDING_CONFIGS`.

## Fix

Add a non-staffed WallCorner configuration using its established 48 × 48 logical footprint, wall-corner cost/build values, defensive unlock, and existing procedural wall-corner rendering contract. Do not add a new gameplay effect or change wall topology.

## Regression test

Run TypeScript validation and the existing building/strip placement tests. Add a catalog completeness assertion if the project’s building-test conventions support it.

## Invariants checked

- `BUILDING_CONFIGS` covers every `BuildingType`.
- WallCorner remains non-staffed with zero occupants.
- WallCorner continues through the existing wall topology and rotation logic.
- No save schema or simulation cadence changes.

## Save/migration impact

None. This restores a missing static catalog record and does not change serialized building identity or state.

## Verification result

Resolved. `npx tsc --noEmit --pretty false` passed, `npm run lint` passed with 0 errors and 0 warnings, and `git diff --check` passed.

## Related commits or files

- `src/game/buildings.ts`
- `src/game/buildingRotation.ts`
- `src/game/stripJunction.ts`
- `src/game/stripRender.ts`
