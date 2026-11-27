# Nighttime spouse chasing blocks recovery sleep

- Bug: Married women can abandon an urgent nighttime home commute to walk after a distant spouse at slow leisure pace, leaving their rest and stamina at zero.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Version/build: 0.6.5.1 save inspected against 0.6.5.2 development source
- Reporter: player's Year-1 Day-304 colony save and follow-up analysis
- Area: human movement priorities, household leisure, physiology
- Owner module: `src/game/humanTick.ts` (`tickHumans`), using existing `humanMovement.commuteHumanToBuilding` and `humanPhysiology.advanceHumanNeeds`
- Related PR/commit: [PR #225](https://github.com/Rengerams/wilderfolk/pull/225)

## Status history
- 2026-11-27 — open: the owner reported that everyone appeared ill and supplied a save for diagnosis.
- 2026-11-27 — investigating: the sleep-home override was traced to the nighttime spouse-following branch; code and targeted test added to PR #225, CI pending.

## Observed behavior
At tick 87838 (23:50), a locally inspected Year-1 Day-304 save held 347 living humans. Of these, 71 had stamina below 15/100 and 46 had rest exactly zero. All 46 were outside their own residence and all had a partner; 43 were women. Forty-one exhausted women had velocity magnitude 2.4 pixels per tick, matching the `config.speed * 0.3` spouse-follow movement. Mean nutrition was 73.3/100 and the food stock exceeded 54,000, so starvation is not the cause. The full save is not included in this repository.

## Expected behavior
During nighttime recovery or while already commuting to a home or hotel, an assigned sleep destination and critical-rest needs break outrank optional free-time partner chasing. Genuine leisure with no schedule or sleep intent can still seek a spouse.

## Reproduction steps
1. Place an adult married woman outside her assigned home, with her spouse further away, `rest: 0`, `stamina: 0`, a recovery deadline, and `breakUntilRecovered: true`.
2. Run `tickHumans` at 23:00 using the existing `NIGHT_START` constant, as in `tests/low-8-humans.test.ts`.
3. Before the fix, the home commute selects fast movement toward the residence but the subsequent female spouse-follow branch overwrites it with 0.3× pace toward her partner. After the fix, the urgent home commute retains velocity and approaches the home.

## Evidence
The sleep gate observes verified indoor arrival, not a nighttime timer alone. `humanTick` sets `onSchedule` during the home commute but its female married-spouse branch checked only `!onJobShift && socialTime`, both true for many exhausted women at night. It therefore overwrote the existing commanded home movement after the commute was chosen. The save's 41 matching slow movements and exclusively adult low-rest cluster corroborate this trace.

## Root cause
A later optional spouse-follow steering decision ignored the earlier home/hotel commute, active schedule and critical-needs pause. No alternative medical disease field caused the cluster.

## Fix / proposed fix
Require genuine free time before partner-follow steering: no active schedule, commute, home-stay intent or needs break. Keep the existing spouse approach, the single movement/physiology owners, and save data unchanged.

## Save/migration impact
No fields added or changed. Affected adults can resume home commuting after the corrected code loads, then regain stamina/rest through ordinary verified sleep; depleted reserves are not reset artificially.

## Verification result
- PASS (data analysis): locally inspected the Year-1 Day-304 uploaded save; the counts above are actual values.
- NOT RUN: original save simulated end-to-end after the proposed code change.
- PENDING: updated `low-8-humans.test.ts` regression and GitHub CI.
