# Seven-hour village night cannot fully restore depleted needs

- Bug: Seven genuine hours of sleeping restored only 87.5 points rather than 100 to an empty rest or stamina reserve.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-01
- Version/build: Wilderfolk 0.6.5.2 development; main before this branch
- Reporter: Owner, after inspecting the actual nighttime schedule
- Area: Needs / sleep calibration
- Owner module: `src/game/simulation/humanPhysiology.ts`
- Related PR/commit: branch `fix/central-sleep-and-affair-arrival-20261101`

## Status history
- 2026-11-01 — investigating: Source trace confirms seven-hour normal night (23:00–06:00) versus eight-hour recovery coefficients; corrected source and focused test committed, CI pending.

## Observed behavior
`NIGHT_START=23` and `NIGHT_END=6` give seven sleep hours. The old `REST_RECOVERY_SLEEP_PER_SIM_HOUR` and `STAMINA_SLEEP_RECOVERY_PER_SIM_HOUR` were both 12.5; seven hours credited 87.5 points from zero, leaving an exhausted settler unrecovered despite a full night.

## Expected behavior
Seven hours of genuine sleep, regardless of eligible location, returns rest and stamina from zero to approximately 100 (with the normal 0–100 cap). Shorter sleep does not grant a fictional full-night credit. Missing nighttime sleep can still create daytime recovery need.

## Reproduction steps
1. Construct a player resident with `needs.rest=0`, `needs.stamina=0`.
2. Call `advanceHumanNeeds` with `sleeping:true` for `7*TICKS_PER_HOUR` consecutive ticks.
3. Before correction the ending reserves are 87.5, below 100.

## Evidence
`src/game/daycycleconstants.ts` defines 23:00–06:00. `src/game/simulation/humanPhysiology.ts` used 12.5 points per hour, and `tests/humanNeeds.restAndWell.test.ts` asserted eight hours of recovery.

## Root cause
The sleep gain was calibrated to eight hours while the authoritative night lasts seven.

## Fix / proposed fix
One `HUMAN_NEEDS.SLEEP_RECOVERY_PER_SIM_HOUR` derived from the canonical night boundary replaces two identical rates; `advanceHumanNeeds` remains the sole rest/stamina mutator. The regression requires six hours to remain below full recovery and seven to reach full recovery.

## Save/migration impact
None. Existing persisted needs values remain unchanged and recover at the revised rate on subsequent observed sleep ticks.

## Verification result
- Focused regression: committed; execution NOT RUN from this connector-only environment.
- `npm run test:types`, `npm run lint`, `npm run build`: NOT RUN (no full local repository checkout).
- GitHub CI: pending.
