# Deployed war-band workers earn phantom village production and conceptions

- Bug: Off-map deployed citizens keep village job/home coordinates and prior work records that can falsely generate local output or conception.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Version/build: 0.6.5.2 development, PR #225
- Reporter: source trace and Codex review of deployment fix
- Area: raid deployment, work attendance, relationships
- Owner module: `src/game/scheduleFatigue.ts` (attendance projection); `src/game/simulation/humanRelationships.ts` (conception eligibility); `src/game/humanTick.ts` (per-tick attendance)
- Related PR/commit: [PR #225](https://github.com/Rengerams/wilderfolk/pull/225)

## Status history
- 2026-11-27 — investigating: initial fix skipped local attendance and rejected deployed conception, but review found last-day schedule fallback could still pay a deployed leader.
- 2026-11-27 — investigating: `getWorkdayAttendance` now explicitly returns zero for deployed workers ahead of historical fallback; targeted production regression added, CI pending.

## Observed behavior
Deployed humans retain their last village `x,y` and `workerBuildingId`. Previous conception routes could mistake them for nearby partners. Even after `humanTick` stopped recording local attendance, `scheduleFatigue.getWorkdayAttendance` treated zero present and zero worked ticks as unsampled and used `scheduleLastWorkedHours` and `scheduleLastWorkedSiteId`. At 18:00/23:00, `dailyBuildingEconomy` could therefore credit a leader's *yesterday* farm work as today's food and trade XP despite an active `raidDeploymentId`. No original player-save production measurement was provided.

## Expected behavior
Absence on campaign is never evidence of a village shift, even when saved last-work records are nonzero. Any production, construction, or trade credit must use verified local attendance. Physical conception requires both participants to be available, not merely to have cached adjacent village coordinates.

## Reproduction steps
1. Prepare an elected leader assigned to a completed Farm with `scheduleLastWorkedHours: 9` and `scheduleLastWorkedSiteId` equal to the farm, and both current-day attendance counters at 0.
2. Assign `raidDeploymentId` before the evening production pass and run `gameTick` at that boundary, as in `tests/production.attendancePacing.test.ts`.
3. Before the correction, the legacy fallback reports 108 ticks and can produce food/skill despite absence. After the correction, both output and skill credit must remain zero; a corresponding non-deployed control still produces.
4. For conception, use a fertile daily seed with both partners at identical cached village coordinates, then deploy the mother or the partner. The regression in `tests/humanLifecycle.test.ts` requires no conception.

## Evidence
Source trace of `humanTick`, `scheduleFatigue.getWorkdayAttendance`, `dailyBuildingEconomy.tickBuildingProduction` and `tryDailyConception` plus Codex P2 review comment on PR #225. The legacy fallback is required for older saves but must never override an explicit deployment flag.

## Root cause
A deployed person is off-map but retains the last village position and historic work metadata. Generic physical proximity and unsampled attendance fallback were not checking that explicit absence state.

## Fix / proposed fix
Use the existing schedule-fatigue attendance owner to return zero for active deployment before fixed-post and mobile-shift logic. Keep `humanTick` from recording village duty during deployment. Exclude deployed mothers, partners, youth contacts and affair partners at the existing conception owner. No shadow scheduling or independent production filters.

## Save/migration impact
No new fields, migration or change to saved work history. The guard reads the existing `raidDeploymentId` and preserves legacy fallback for settlers who are not deployed.

## Verification result
- PASS (old head): `humanLifecycle.test.ts` and the old no-local-barracks test passed in PR #225's affected test run; that run had one unrelated timing failure in the new sleep test.
- NOT RUN: pre-fix full production reproduction in an original player save.
- PENDING: updated production integration regression, CI and original player-save confirmation.
