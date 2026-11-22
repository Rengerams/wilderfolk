# Late construction shifts were never applied

- Bug: Late construction shifts were never applied.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.1; PR #166 targeting 0.6.5.2
- Reporter: Codex review / PR #166 owner audit
- Area: Construction attendance and daily phases
- Owner module: `src/game/dailyBuildingEconomy.ts` (progress), `src/game/scheduleFatigue.ts` (attendance); `src/game/tickLayerDaily.ts` (dispatch)
- Related PR: https://github.com/Rengerams/wilderfolk/pull/166

## Status history
- 2026-11-22 — investigating: source trace reviewed; correction prepared in PR #166; CI verification pending.

## Observed behavior
A valid work schedule of 19:00–23:00 yields zero on-site samples at the 18:00 construction pass. The worker attends after the pass, but midnight fatigue settlement erases the present-tick counters before the next 18:00 pass. An evening-only crew therefore builds at the 0.22× unattended rate and receives no construction trade XP.

## Expected behavior
A witnessed work shift at any valid scheduled hour must contribute proportional construction progress and one proportional trade-skill credit. A building completed after production cannot produce retroactively.

## Reproduction steps
1. Start an incomplete Farm with a living adult builder listed as an occupant at its access point.
2. Set `workSchedule = { startHour: 19, endHour: 23 }` and advance `gameTick` across 18:00, the full shift and midnight.
3. On the old implementation, 18:00 yields no attendance credit; midnight clears the shift without construction progress or XP.

## Evidence
Codex review `#discussion_r4657998787`; trace `dailyBuildingEconomy.tickBuildingProgress` at 18:00 versus `resolveDailyVillageScheduleFatigue` clearing `schedulePresentTicksToday` at 00:00. The pre-fix fixture also saturated an expert Farm at 100%, causing the strict helper comparison to fail (`#discussion_r4657998785`).

## Root cause
The fixed 18:00 construction pass ran before late legal shifts; both skill credit and crew speed were paid only there.

## Fix / proposed fix
Keep one construction-progress implementation, but invoke it at 23:00 through the existing `gameTick` → `tickLayerDaily` path. All valid shifts end by 23:00; 00:00 settlement still clears counters exactly once. Production remains at 18:00, before newly completed construction sites exist. The expert regression uses an unsaturated Mine with a partial expert shift.

## Save/migration impact
None. Existing attendance and skill fields are retained; no new persisted construction ledger or scheduler is added.

## Verification result
NOT RUN locally in this connector-only change. `tests/production.attendancePacing.test.ts` includes a real 19:00–23:00 progression/XP test, and an unsaturated expert comparison; GitHub CI must confirm results.
