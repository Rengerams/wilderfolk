# Deferred production applied newly warned ecology penalties too early

- Bug: Evening shifts deferred to 23:00 could apply a valley ecology stage penalty announced at 18:00 to the same day's harvest.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23
- Version/build: 0.6.5.2 development, PR #192 (`505439eb` prior head)
- Reporter: Codex review of PR #192
- Area: daily scheduling, ecology warnings, farm/greenhouse and Hunting Spot output
- Owner module: `src/game/tickLayerDaily.ts` (daily ordering), `src/game/dailyBuildingEconomy.ts` (production), `src/game/ecologyStage.ts` (yield multipliers)
- Related PR: https://github.com/Rengerams/wilderfolk/pull/192

## Status history
- 2026-11-23 — investigating: review source trace established the one-day warning-order regression. A pre-warning stage snapshot and game-tick integration regression were added to PR #192; new CI verification pending.

## Observed behavior
The 18:00 world-event phase calls `tickValleyEcologyStage` after refreshing the day's ecology indexes. On ordinary shifts the production pass has already completed, so a newly announced stage takes effect the following day. PR #192 deferred evening-shift production to 23:00. Farm, Greenhouse and Hunting Spot output then read the already-updated `valleyStage`, applying penalties to the same day's completed work.

## Expected behavior
A valley-stage warning comes before the output penalty it announces, irrespective of shift schedule. A 15:00–21:00 workday earns its food output at 23:00 using the stage in force before the 18:00 warning. Free-roam actions and the next day still read the live stage.

## Reproduction steps
1. Start a completed staffed Farm with a 15:00–21:00 shift and a `strained` valley stage.
2. Prepare the third consecutive stress day so the 18:00 ecology pass advances to `damaged`.
3. Run the real `gameTick` through 18:00 and 23:00; compare with an otherwise identical control where the stage remains `strained`.
4. In the original PR #192, production at 23:00 used the damaged-stage penalty; the control did not.

## Evidence
`tickLayerDaily` runs `tickDailyWorldEvents` at 18:00, which calls `tickValleyEcologyStage`. The production pass is delayed until 23:00 for late shifts, and `getValleyFarmYieldMultiplier`/`getValleyHuntYieldMultiplier` previously used the live stage without a production-time override.

## Root cause
The shift-settlement time moved after the ecology-stage transition, but the ecology yield readers had no reference to the stage in force before the warning.

## Fix / proposed fix
Capture `productionValleyStage` only when the 18:00 production pass is deferred. Pass it explicitly to the existing ecology yield readers when production settles at 23:00; clear it immediately afterward. Preserve the existing 18:00 ecology update and all other live-stage readers. The field is included in save/load and worker prep/delta so a mid-evening save or simulation handoff does not change yield.

## Save/migration impact
The new optional `productionValleyStage` string is validated on load and is cleared at production settlement. Older saves without the field remain loadable; a pre-fix, mid-evening save with only `productionDeferred` falls back to the live stage, since the historic pre-warning stage was not persisted.

## Verification result
NOT RUN locally for this revision (no executable repository checkout/network access in this environment). `tests/production.attendancePacing.test.ts` now compares the same deferred Farm harvest with/without a real 18:00 ecology-stage transition and checks the separate farm/hunt yield readers. New-head CI pending.