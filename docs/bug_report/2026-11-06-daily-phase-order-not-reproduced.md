# Daily ecology/event ordering claim does not reproduce

- Bug: Review claimed world events and ecology metrics run before daily building production at the shared 18:00 phase.
- Status: resolved
- Severity: none — the reported ordering does not exist in the current tree
- Date discovered: 2026-11-06
- Version/build: 0.6.5.1
- Reporter: Independent code review (user-supplied finding), verified against the current tree
- Area: Daily simulation schedule
- Owner module: `tickLayerDaily.ts` (schedule), `dailyBuildingEconomy.ts` (production), `dailyWorldEvents.ts` (world events/ecology)
- Related PR/commit: none

## Status history
- 2026-11-06 — open: review reported the inversion.
- 2026-11-06 — investigating: source order in the current tree is production before the world-event tail; no reproduction found. No production change made.
- 2026-11-06 — resolved as not a defect: the audit appears to have mistaken the earlier 18:00 election/chronicle block for the ecology/event pass. Closed with no code change.

## Observed behavior
`DAILY_PHASE_HOURS.production` and `DAILY_PHASE_HOURS.worldEvents` are both 18. The schedule in `tickLayerDaily` is:

1. `tickElectionPromises` + valley chronicle (an 18:00 block that contains no ecology),
2. `tickDailyBuildingEconomy` at 18:00,
3. the world-event tail: counts, population, `tickDailyWorldEvents`, challenges.

`tickEcosystemMetrics` and `tickValleyEcologyStage` are inside `tickDailyWorldEvents`, so they run after production, not before it. The code comment in `dailyWorldEvents` says the valley multipliers land one day late, which is the opposite direction from the review's proposed reorder.

## Expected behavior
If the review's premise were correct, production would need to move before the world-event/ecology calls. If the existing one-day-lag is the intended design, no reorder is needed.

## Reproduction steps
1. Read `tickLayerDaily.ts` hour gates and call order at 18:00.
2. Read `tickDailyWorldEvents` call to `tickEcosystemMetrics` / `tickValleyEcologyStage`.
3. Observe production is invoked first.

## Evidence
Current `tickLayerDaily`: production block at the 18:00 gate precedes the 18:00 world-event tail that invokes `tickDailyWorldEvents`. The earlier 18:00 block only evaluates election promises and unlocks chronicle chapters.

## Root cause
Not established as a defect. The likely explanation is a misread of the two separate 18:00 blocks; the first one is not the world-event/ecology pass.

## Fix / proposed fix
None applied. If same-day ecology multipliers are desired, the change would be to move the ecology evaluation before production, not after it. That is a gameplay design decision and needs an owner decision.

## Save/migration impact
None.

## Verification result
NOT APPLICABLE as a fix. Source inspection only; no failing behavior found. TypeScript, lint and build pass after the other fixes.
