# Raid gold spoils bypass the configured storage cap

- Bug: Gold awarded by a raid was added directly to `state.resources.gold`, so it could exceed `storageMax.gold` and skipped the common resource-accounting path.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding)
- Area: Frontier combat / economy
- Owner module: `frontierCombat.ts` (`grantRaidSpoils`); storage math in `economy.ts` / `resourceUtils.ts`
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review found the gold branch adding loot directly after `clampRaidGoldGain`.
- 2026-11-06 — resolved: spoils now pass through `addCappedResource`, with a type check, lint, build and targeted regression run.

## Observed behavior
`grantRaidSpoils` capped food, wood and stone with `addCappedResource` but computed gold with the per-raid soft cap and then wrote `state.resources.gold += gained.gold`. Gold could pass `storageMax.gold`, and the gain was absent from the shared gathering/accounting path used by the other resources.

## Expected behavior
Every resource gain respects the configured storage maximum and is recorded once by the shared resource owner. The per-raid soft cap may remain as an additional raid-specific ceiling.

## Reproduction steps
1. Give a colony `storageMax.gold` near its current gold and resolve a raid whose spoils include gold.
2. Observe `state.resources.gold` rising past `storageMax.gold`.
3. Compare with food/wood/stone, which stop at their caps.

## Evidence
Before: `gained.gold = clampRaidGoldGain(...)` followed by a direct `+=`. Food, wood and stone in the same function called `addCappedResource`.

## Root cause
The gold branch predated, or was written outside, the shared capped-resource helper.

## Fix / proposed fix
Run the soft-capped gold through `addCappedResource(state, 'gold', capped)` and use its return value as the actual gain.

## Save/migration impact
None: amounts are clamped in memory; no save schema change.

## Verification result
PASS: `npm run test:types`, `npm run lint`, targeted `vitest` suites including the raid-gold clamping tests. Full build run during the change. The host-level cap path itself is covered by the shared `addCappedResource` tests and `tests/storageCap.test.ts`.
