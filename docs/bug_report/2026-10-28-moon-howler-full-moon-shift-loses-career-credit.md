# Moon Howler full-moon night discards a genuine daytime career shift

- Bug: A player settler who works during the day and transforms at full-moon nightfall loses yesterday's attended shift at the midnight fatigue boundary, and the overnight re-staffing can prevent the career day from being credited at noon.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 development, PR #99
- Reporter: PR-D Moon Howler / career integration audit
- Area: settled work attendance and career-history credit across Moon Howler form changes
- Owner module: `src/game/dailyScheduleFatigue.ts` (existing midnight attendance settlement), `src/game/careers/careerHistory.ts` (sole credited-day writer), `src/game/dailyBuildingEconomy.ts` (existing per-worker integration)
- Related PR/commit: PR #99; fix starts at `535e29b3` and `3f1a819d`

## Status history
- 2026-10-28 — investigating: traced deterministic 23:00 form change, 00:00 fatigue phase, 03:00 staffing, 06:00 revert and 12:00 production phases; committed a targeted code and regression repair. CI verification pending.

## Observed behavior
`transformToWerewolfForm` replaces the person's type with `Werewolf` and vacates their `workerBuildingId` and building occupant slot at 23:00, but keeps the existing accumulated `scheduleWorkedTicksToday`. The midnight fatigue pass only receives `ctx.playerHumans`, which excludes the transformed person, so it neither snapshots nor clears yesterday's attended hours. The staffing pulse may fill the vacant seat at 03:00, and the human may return at 06:00 without the former job. The previous career writer also required today's current job and occupant membership, even when the verified work happened yesterday.

## Expected behavior
A Moon Howler is the same person as yesterday's worker, not a new career or a new job type. Real human attendance already recorded before transformation must settle at midnight and may yield **at most one** career credit for the exact attended workplace, profession and calendar day, regardless of the person's subsequent form or today's staffing. Hunting in werewolf form, missing attendance, and mixed-site or mixed-job attendance must never fabricate career credit. Normal job restoration/assignment logic must remain unchanged.

## Reproduction steps
1. Set up an adult player Farmer, assigned to a completed Farm, with six recorded hours and matching site and job provenance; mark cursed.
2. At 23:00 transform into Moon Howler, vacating the workplace.
3. Resolve the 00:00 fatigue phase while still transformed, and revert at 06:00; simulate the original seat becoming unavailable.
4. Run the normal 12:00 building economy production pass. Before the fix yesterday's shift was not settled and yielded no career history; after it the same person must receive one Farmer credited day even if the current job is unset or different.
5. Repeat noon resolution to confirm same-job/same-day idempotency.

## Evidence
- `src/game/tickLayerRealtime.ts` updates the human/type buckets before the midnight daily phase.
- `src/game/tickLayerDaily.ts` previously passed only `ctx.playerHumans` into `resolveDailyVillageScheduleFatigue`.
- `src/game/moonHowler.ts` vacates the job at transformation; `src/game/moonHowlerForm.ts` restores it only if a seat is available.
- `tests/careers.history.test.ts` now contains a regression that exercises form change, midnight settlement, dawn return, lost job, actual noon economy and duplicate noon call.

## Root cause
An attendance aggregator filtered by the person's **current species form** rather than their recorded human shift; later credit was tied to their **current** staffing instead of the prior observed site and profession.

## Fix / proposed fix
At the existing midnight fatigue event, include only already-bucketed, alive, player-owned Moon Howlers retaining a human-form snapshot; no whole-colony scan. On the existing noon `playerWorkers` pass, validate the last settled attendance's own site and profession against the indexed completed building, and pass that evidence to the sole career-day writer before handling the current staffing aggregate. No changes to Moon Howler transformations, worker assignment, skill progression, RNG, DNA or the normal production calculations. A post-shift job change is no longer incorrectly interpreted as a change to yesterday's work.

## Save/migration impact
No new fields, records or format changes. Existing optional career and schedule-provenance fields are preserved by the PR-D save/load and worker transport changes. Older saves with no witnessed shift evidence continue to earn no backfilled work history.

## Verification result
- Source phase and ownership trace: **PASS**.
- New focused regression: **COMMITTED, CI NOT YET VERIFIED**.
- Full standard suite, types, build, 90-day and 360-day runs on this change: **PENDING**.
