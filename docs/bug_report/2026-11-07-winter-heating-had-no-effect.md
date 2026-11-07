# Winter heating spent wood and changed nothing

- Bug: An unheated winter day burned no extra calories: `villageCanHeat` was computed, persisted and read only for a one-tick flash, while the save schema claimed a 1.5x cold penalty.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (SIM-19)
- Reporter: full-audit simulation review
- Area: simulation / human needs
- Owner module: `src/game/simulation/humanPhysiology.ts` (`advanceHumanNeeds`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit traced the daily wood spend to a flag with no consumer outside the UI.
- 2026-11-07 — resolved: the needs owner applies the cold multiplier.

## Observed behavior
`tickWinterHeating` charged `ceil(humans / 5)` wood per winter day and stored `villageCanHeat`. The only gameplay reader set `entity.flash = 5` at 08:00, so a colony that could not pay heated exactly as well as one that could.

## Expected behavior
Cold has a cost. A settler outside a heated village burns 1.5x nutrition, so the daily wood purchase protects the larder.

## Reproduction steps
1. Advance one working hour for two identical settlers.
2. Pass `unheatedWinter: true` to one.
3. Compare nutrition: the cold settler is lower by half the hourly base loss.

## Evidence
- `tests/humanNeeds.unheatedWinter.test.ts` — after one worked hour the heated settler sits at 78.64 nutrition and the cold one at 77.96 (a 0.68 gap).
- `src/game/humanTick.ts` — passes `unheatedWinter: isWinter && !canHeat`.

## Root cause
The flag existed as presentation only; no simulation consumer priced the cold.

## Fix / proposed fix
`HumanNeedsObservation` gained `unheatedWinter`; `advanceHumanNeeds` multiplies the nutrition loss by `UNHEATED_WINTER_NUTRITION_MULTIPLIER` (1.5). Human tick supplies the season and the stored heating result.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/humanNeeds.unheatedWinter.test.ts` — PASS (1/1).
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
- 7/30/360-day balance re-measurement — NOT RUN in this change.
