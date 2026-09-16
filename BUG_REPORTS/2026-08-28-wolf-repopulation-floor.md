# Bug: Wolf repopulation floor is bypassed when prey and grass are healthy

- Status: resolved
- Date discovered: 2026-08-28 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer-assisted deterministic annual diagnostic
- Area: Truth | simulation | ecology
- Owner module: `src/game/worldGen.ts` (`replenishDepletedWildlife`)
- Cadence: every 3 in-game days (`dailyWorldEvents.tickDailyWorldEvents`), not daily

## Status history

- 2026-08-28 — investigating: the full-year diagnostic showed zero wolves throughout the run, even after adding a baseline wolf pair.
- 2026-09-13 — resolved (audit-corrected): the defect is fixed, but not at the site
  this report originally named. `replenishDepletedWildlife` is invoked only from
  `dailyWorldEvents.ts:141-142` inside `tickDailyWorldEvents`, gated to every
  **3 in-game days** — not from `tickLayerDaily()` daily after
  `tickDailyChallenges`. What stopped the never-repopulated behaviour is
  `worldGen.ts:418-420`, where `needsWolves` (`MIN_WOLVES = 5`) now feeds
  `needsWildlife`, so a healthy-prey valley still tops wolves up. No test
  references the symbol yet.


## Observed behavior

The normal world begins without wolves. The new baseline pair can die before the first annual checkpoint, while the later `replenishDepletedWildlife()` wolf top-up does not run if rabbits, deer, and grass are healthy. The early return only considers depleted prey or grass, even though the function contains a later wolf-floor branch.

## Expected behavior

A normal valley has a small baseline wolf presence. When prey is healthy, the ecology may restore a missing wolf through the declared daily replenishment owner rather than depending exclusively on a 10% 21-day migration roll. The system must remain bounded and must not overpopulate predators.

## Reproduction steps




## Related files

`
- `src/game/tickLayerSystems.ts`
- `src/game/speciesConfig.ts`
`


## Fix

As shipped (corrected 2026-09-13 — the original text below this line named the
wrong call site):

- `worldGen.ts` defines `replenishDepletedWildlife`; its early return now counts
  wolves as depleted wildlife (`needsWolves` → `needsWildlife`, `MIN_WOLVES = 5`,
  `TARGET_WOLVES = 6`), which is the actual repair: before it, a valley with
  healthy rabbits/deer/foxes never reached the wolf floor branch.
- The function is invoked from `dailyWorldEvents.ts:141-142`
  (`tickDailyWorldEvents`, every 3 in-game days), **not** from `tickLayerDaily()`
  daily after `tickDailyChallenges` as originally written here.

## Verification

- [x] `needsWildlife` includes wolves; the wolf floor branch is reachable
- [x] The function is invoked (every 3-day world-events pass), so it is no longer dead code
- [ ] No regression test references `replenishDepletedWildlife` / `MIN_WOLVES` (gap)
