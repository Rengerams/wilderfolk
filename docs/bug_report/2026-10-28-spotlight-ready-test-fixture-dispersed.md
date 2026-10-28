# Spotlight ready-phase movement regression starts with a dispersed cast

- Bug: CI rejected the real-tick `ready` home-commute regression because its synthetic stage was physically invalid.
- Status: fixed in test fixture on PR #91; CI rerun pending.
- Severity: low — test-only defect, not evidence of a production-game regression.
- Date discovered: 2026-10-28
- Target version: 0.6.5.2
- Owner: `tests/spotlightLore.test.ts`; runtime stage guard remains owned by `src/game/spotlightLore.ts`.
- PR: https://github.com/Rengerams/wilderfolk/pull/91

## Evidence

Node.js CI run https://github.com/Rengerams/wilderfolk/actions/runs/40718090045 failed one case: `keeps a ready actor walking toward the spotlight, not their house`, line 263, `expected undefined to be 'ready'`. The remaining 2,660 tests passed; 2 were skipped. The 360-day simulation and human-needs workflows passed on the same head (`8cce5af6`).

## Root cause

The parameterized test reused `gathering` destinations for `ready`: the selected actor stood around x=500, but its target was x=425; other singers were likewise far from their slots. In real gameplay, `ready` is reached only after every actor and the heroine are within the 11-unit arrival radius. `tickSpotlightGathering` therefore correctly called `finishSpotlightLore(..., 'aborted')` after `gameTick`, making `world.spotlightLore?.phase` undefined. This is distinct from the earlier stale entity-ID cache fixture bug.

## Fix

Use phase-appropriate physical placement in the same parameterized regression. `gathering` still uses distant targets. For `ready`, all other singers stand at their slots, the heroine remains at her center, and the selected home-preferring actor stands exactly 10 units from its slot. That is *within* the runtime 11-unit validity radius but *outside* `humanTick`'s 9-unit stopping threshold, so it must still walk toward the stage rather than its house.

Keep the runtime abort guard unchanged; an emergency that really scatters a ready cast must continue to abort the performance.

## Verification

- CI baseline: 1 failed / 2,660 passed / 2 skipped on commit `8cce5af6`.
- Source-level fixture correction and regression intent: completed on this PR.
- Focused and full tests on corrected head: pending CI result.
- Browser worker/camera/skip/load verification: not run.
- Gameplay balance, save schema, and worker contracts: unchanged.
