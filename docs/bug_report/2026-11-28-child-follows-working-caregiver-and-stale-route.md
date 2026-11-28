# Children follow working caregivers and resume stale off-screen routes

- Bug: Children may follow a caregiver to work during venue-specific evening duty, or continue an old follow route after school or mandatory bedtime begins.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-28
- Version/build: Wilderfolk 0.6.5.2 development, after PR #228; source inspected on `main` at `3c11cbfd`
- Reporter: player observation that children still follow caregivers after the earlier fix
- Area: child leisure, caregiver shift eligibility, off-screen movement throttling
- Owner module: `src/game/humanLeisureBehavior.ts` (single follow decision and cancellation); `src/game/humanTick.ts` supplies resolved schedule and integrates movement; `workAbsence.ts` / `humanMovement.ts` remain their existing duty and movement authorities
- Related PR/commit: [PR #245](https://github.com/Rengerams/wilderfolk/pull/245), after PR #228

## Status history
- 2026-11-28 — open: player reported children continue following after earlier PR #228. Original live-game pair/save not provided for this incident; reviewed the current source.
- 2026-11-28 — investigating: source trace confirmed the old caregiver filter only checks the ordinary village work window and the caregiver's indoor workplace ID, not specialized roster duty or live workplace travel. The off-screen movement throttle can also resume an old `child_follow_*` path before the next leisure decision.
- 2026-11-28 — investigating: PR #245 moves eligibility into one child-leisure predicate using the actual duty resolver and commute evidence, and cancels stale following before throttled movement whenever school, sleep or other mandatory schedules take priority. Focused regression tests committed; latest CI not yet confirmed.

## Observed behavior
At an evening hour outside the default 08:00–16:00 colony window, a child can treat an innkeeper with an active 17:00–23:00 tavern shift as a free caregiver and steer after them. Independently, a previously cached walk can be replayed by the off-screen throttle even after the child has a mandatory school or sleep activity. These are source-confirmed edge cases that account for the reported symptom; an exact recreation of the player's later save has not been performed.

## Expected behavior
A child must not start or continue following a caregiver during the caregiver's actual duty or workplace commute. Mandatory school, bedtime, safety and recovery obligations must preempt following on both focused and off-screen ticks. Following genuinely off-duty caregivers during eligible free time remains allowed.

## Reproduction steps
1. Create a child with an adult `motherId`, give that adult `JobType.Innkeeper`, a completed occupied tavern and the ordinary colony work schedule 08:00–16:00.
2. Execute `tickHumanChildLeisure` at 18:00 on a deterministic day when `personDayRoll(child.id, tick, 601) > 0.22`. Previously, the ordinary roster filter allowed the parent despite the real tavern shift. The new focused test requires no follow intent.
3. For the second defect, set `childLeisureActivity = 'following'`, `childLeisureTargetId`, velocity and the shared `rememberHumanWalkTarget` destination. Advance to school/bedtime (or a caregiver duty transition) and exercise the cancellation before `resumeHumanWalk`. Previously, the cached route survived until a later active decision; the new tests require a cleared target and zero resumed velocity.
4. Also test that mandatory child time cannot begin a fresh follow even without a completed residence.

## Evidence
The pre-fix `tickHumanChildLeisure` only tested `isOnWorkScheduleShift`, `isOnWorkCommuteHours` and `caregiver.indoorBuildingId === caregiver.workerBuildingId`. `workAbsence.resolveShift` separately defines actual tavern, hotel, hospital, guard and priest rosters. In `humanTick`, an inactive off-screen settler calls `resumeHumanWalk` and exits before `tickHumanLeisure`; thus stale follow-route intent can outlive a duty transition. New coverage is in `tests/humanLeisureBehavior.test.ts`.

## Root cause
The earlier fix used a generic village clock instead of the canonical individual work-duty resolver. A separate lifecycle gap let the off-screen movement throttle reuse a previously valid child-follow command without first invalidating it against the current mandatory child schedule.

## Fix / proposed fix
PR #245 implements `canFollowCaregiverDuringLeisure` and `stopSupersededChildLeisure` in the same child-leisure owner. `humanTick` passes its existing school/sleep/emergency priority decisions and invalidates obsolete follow movement before the early off-screen return; the leisure owner uses the actual `resolveShift` and work-commute evidence for every mother, father and custodian candidate. Tests cover a working evening innkeeper, off-screen shift start, mandatory school/bedtime cancellation and prevention of renewed following. Existing steering and collision integration remain unchanged; no second scheduler or special child movement pipeline is introduced.

### Follow-up: destinationless bedtime drift
Codex review identified a related manifestation in the same child-leisure cancellation path: a child without a completed residence could carry prior play velocity through mandatory bedtime because suppressing leisure returned before the normal idle damping. The fix clears residual leisure velocity and route targets only if the schedule owner has not chosen a replacement route; the off-screen guard also covers children without a usable home. New tests assert that a homeless child stops drifting both on eligible decision ticks and cached off-screen ticks, while selected school/emergency motion remains intact. This is a source-backed correction, not an independently replayed player save.

## Save/migration impact
None. Existing optional `childLeisureActivity` and `childLeisureTargetId` fields remain loadable. Invalid current-day follow intents and transient runtime movement targets are cleared on simulation ticks; no save-version bump or batch migration.

## Verification result
- PASS — source trace identified both distinct code paths and the specialized shift owner.
- PASS — new regression fixtures committed to PR #245.
- NOT VERIFIED — latest CI, including Node.js tests, 90-day housing integration and performance comparisons, was running at the last check; earlier PR revisions failed due to a registry-string parse error and an early read of `sleepingForNeeds`, both corrected on later commits.
- NOT RUN — direct replay of the original user's current save and visual follow behavior.
