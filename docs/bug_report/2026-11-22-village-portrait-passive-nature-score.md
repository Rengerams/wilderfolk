# Untouched starting valley receives a nature-steward identity

- Bug: A stable starting biome and native wildlife earn Nature points before any conservation action.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: 0.6.5.2 (main at 214294c939815df52048bd02f9a269b80423304e)
- Reporter: code review and deterministic score calculation
- Area: Progress → Your path
- Owner module: `src/game/villagePortrait.ts`
- Related PR: [#155](https://github.com/Rengerams/wilderfolk/pull/155)

## Status history
- 2026-11-22 — resolved: all six portrait regressions, the standard Node.js CI gate and calendar scheduler gate passed on commit 9ddd35c; longer simulations remain in progress.

## Observed behavior
For a starting village with ecosystem health 50 and a `stable` valley, the previous Nature formula gave `(50 / 100) * 45 + 25 = 47.5`, rounded to 48, with no player-owned conservation sites. Nature was the strongest identity and the title was “Stewards of the valley.” The “Young pioneers” fallback required a strongest score below 20. Native wolves and Wildkin raised Nature further without any village action.

The War score also counted `WorldState.eventLog`, a rolling Chronicle capped at 20,000 entries. Recorded player raids could drop out merely because unrelated events filled the log.

## Expected behavior
A new village stays “Young pioneers” until its actions establish an identity. Nature reflects dedicated conservation plus sustained health. War reflects offensive engagements recorded in bounded battle reports and live deployments, independently of unrelated Chronicle events. The Progress panel should not recalculate large rosters every simulation tick.

## Reproduction steps
1. Evaluate `computeVillagePortrait` on eight settlers, health 50, no buildings, rivals, raids or trade.
2. The previous implementation returns Nature 48 and the nature-steward title.
3. Add wild wolves and Wildkin without taking a player action; the previous Nature score rises.

## Evidence
The previous `natureScore`, `Young pioneers` condition and rolling combat-log scan in `src/game/villagePortrait.ts`; the log cap in `src/game/eventLog.ts`.

## Root cause
Ambient ecosystem conditions were treated as player achievements. The War identity relied on a bounded presentation log, and the UI memo recalculated whenever the simulation tick changed.

## Fix / proposed fix
Reuse `isCompletedPlayerBuilding`, reward completed wildlife preserves and sustained ecological health, score offensive battle reports and current deployments, active trade and diplomacy, and exclude road/decoration strips from township growth. The read-only panel projection refreshes hourly or when meaningful scalar/count data change. No new simulation decision or state writer is introduced.

## Save/migration impact
None; only existing read-only state fields are used.

## Verification result
PASS — six tests in `tests/villagePortrait.test.ts`, Node.js CI [run 44981084613](https://github.com/Rengerams/wilderfolk/actions/runs/44981084613) and calendar scheduler [run 44981084599](https://github.com/Rengerams/wilderfolk/actions/runs/44981084599) passed at commit 9ddd35c. Long-run and population performance checks were still running at verification.
