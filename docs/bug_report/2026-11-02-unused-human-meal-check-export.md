# Unused meal-hour export blocks Knip audit

- Bug: Knip flags `isMealCheckHour` as an unused public export.
- Status: investigating
- Severity: low
- Date discovered: 2026-11-02
- Version/build: main, version 0.6.5.1
- Reporter: user-supplied `npm run audit` diagnostic
- Area: human meals and static export audit
- Owner module: `src/game/simulation/humanNeeds.ts` (`humanMeals` decision)
- Related PR/commit: fix/docs-check-and-unused-meal-export-20261102 (pending PR)

## Status history
- 2026-11-02 — investigating: code search found no callers; removed unused export and synchronized both active registries; CI not yet verified.

## Observed behavior
`npm run audit` reports unused export `isMealCheckHour` in `src/game/simulation/humanNeeds.ts`.

## Expected behavior
The module exposes only used meal/hunting functions and both active ownership inventories describe the actual exports.

## Reproduction steps
1. Use the recorded main source.
2. Run `npm run audit`.
3. Knip reports the unused export (reported by user; not independently executed here).

## Evidence
Repository-wide code search found only the function declaration and ownership/historical documentation references, with no runtime callers.

## Root cause
An obsolete public scheduling helper remained after real meal intent and hourly gates moved to their present owners.

## Fix / proposed fix
Remove the unused helper and its now-unused `Human` import; remove the helper from `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts`, leaving historical architecture documents unchanged.

## Save/migration impact
None; no call sites or persisted fields change.

## Verification result
Static source/call-site review: PASS. `npm run audit`, CI: NOT RUN at report creation.
