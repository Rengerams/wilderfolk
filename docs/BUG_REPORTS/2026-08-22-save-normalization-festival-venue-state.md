# Bug: Save-load normalization does not canonicalize festival and venue state

- Status: resolved
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 unreleased
- Reporter: v0.6.3 Festivals and Venues Implementation Audit
- Area: Truth | save/migration
- Owner module: `src/game/saveLoad.ts`, `src/game/saveSchema.ts`, venue/festival state readers
- Cadence: Save load and initial simulation preparation

## Status history

- 2026-08-22 — open (audit identified inconsistent normalization between preparation and loaded world state)
- 2026-08-23 — resolved (canonical load-boundary normalization added; focused save-migration regression passed)

## Observed behavior

Initial worker preparation uses venue schedule defaults when schedules are absent or invalid. Loaded world reconstruction copies `worldData.festival` directly and does not clearly canonicalize invalid festival or raw venue schedule objects at the load boundary. A malformed festival record with nonnumeric `daysLeft` can therefore survive until expiry arithmetic produces `NaN`, and invalid venue state may remain in memory until a helper reads it.

## Expected behavior

Load boundaries should produce canonical, safe state. Invalid or absent venue schedules should normalize to valid defaults. Invalid, expired, or malformed festival state should be cleared or repaired according to one documented policy. Normalization should be idempotent.

## Reproduction steps

1. Construct or load a save with missing/invalid Tavern or Hotel schedule fields.
2. Construct a save with `festival.daysLeft` missing, nonnumeric, negative, or otherwise malformed.
3. Load the world and advance the daily layer.
4. Inspect schedules, festival expiry, UI state, and serialized output.
5. Observe whether malformed data remains until a later reader or produces `NaN` behavior.

## Evidence

- `src/game/saveLoad.ts` load reconstruction and festival handling.
- `src/game/simWorker/simPrep.ts` default preparation behavior.
- v0.6.3 Festivals and Venues Implementation Audit, P2 save-normalization finding.

## Root cause

Read-time fallback and load-time canonicalization are not consistently separated. Some invalid fields receive defaults only when consumed, while the stored world remains malformed.

## Fix

Add explicit idempotent normalizers at load boundaries for venue schedules and festival state. Store canonical values in the loaded world; tolerate absent legacy fields; safely clear invalid festival records.

## Regression test

Test missing legacy fields, malformed venue schedules, malformed/expired festival records, manual Town Hall festival save/load round-trip, and canonical re-save after normalization.

## Invariants checked

- Loaded venue schedules are valid and bounded.
- Loaded festival state is null or has valid active/name/daysLeft fields.
- Normalization is idempotent.
- Legacy saves remain loadable.
- No invalid state reaches daily expiry arithmetic.

## Save/migration impact

Yes. This is a save-load normalization change. Preserve legacy compatibility and record the canonicalization rules in migration tests.

## Verification result

Resolved. `tests/saveMigration.roundtrip.test.ts` passes 3/3 tests; TypeScript, targeted ESLint for the changed files, and `git diff --check` also pass.

## Related commits or files

- `src/game/saveLoad.ts`
- `src/game/saveSchema.ts`
- `src/game/simWorker/simPrep.ts`
- `src/game/venueSchedule.ts`
- `src/game/tickLayerDaily.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-save-normalization-festival-venue-state`

## Audit change references

- Change 19: verify Statistics and state visibility after load.
- Change 21: add save/migration coverage.
- Change 22: add focused regression validation.

## Practical advice

Normalize once at the load boundary instead of scattering defensive defaults through every reader. Keep normalization pure and idempotent so it can be tested independently from the simulation tick.

