# Legacy fishing crews used Hunter behavior and lost proficiency on conversion

- Bug: Fishing Spot crews were employed as Hunters, and the new Fisher conversion initially dropped their effective work-skill bonus.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23
- Version/build: 0.6.5.2 development, PR #190 (`3ac1a7de` initial head)
- Reporter: gameplay investigation and Codex review of PR #190
- Area: fishing jobs, workforce reconciliation, skill-based production
- Owner module: `src/game/workforce.ts` (assignment/reconciliation); `src/game/skills.ts` (skill writer and production multiplier)
- Related PR: https://github.com/Rengerams/wilderfolk/pull/190

## Status history
- 2026-11-23 — investigating: the legacy Hunter job and zero-Fisher proficiency on conversion were established by source trace; proficiency preservation and a focused regression were committed to PR #190, with new CI verification pending.

## Observed behavior
Fishing Spots used `JobType.Hunter`. Existing fishing crews consequently entered hunter behavior even while assigned to fishing posts. The initial Fisher-job fix in PR #190 migrated the job and kept `skills.hunter`, but `assignWorkerTransition` initialized `skills.fisher` from the absent Fisher key (zero). `getWorkerSkillMultiplier` now reads Fisher at a Fishing Spot, so a fishing veteran with Hunter 12 and no Fisher key received no 24% trade-skill bonus (before the independent aptitude factor).

## Expected behavior
Existing crews keep their fishing posts and attendance, stop pursuing hunt targets, use Fisher job behavior, and keep their accrued trade proficiency in the new profession. A higher existing Fisher value must never be reduced, and the old Hunter skill must remain intact.

## Reproduction steps
1. Create/load an adult player settler assigned to a completed Fishing Spot, with `job: hunter`, `skills: { hunter: 12 }`, and a roster entry at that post.
2. Under the initial PR #190 implementation, call `prepareWorkforce`.
3. Inspect `job`, `skills.fisher`, and `getWorkerSkillMultiplier`: the job becomes Fisher, but effective Fisher proficiency remains zero. Repeat with `skills.fisher: 23` to check non-destructive conversion.

## Evidence
The original `BUILDING_JOB_TYPES[FishingSpot]` mapped to Hunter. In PR #190, `prepareWorkforce` calls `assignWorkerTransition` when a legacy Hunter holds a fishing post; the transition previously read the uninitialized Fisher skill. `getWorkerSkillMultiplier` derives the skill key from the building's new Fisher job. `tests/prisonFestivalWorkContinuity.test.ts` now checks both effective production multiplier and the pre-existing larger-Fisher case.

## Root cause
Fishing and hunting shared the Hunter profession and skill key. The first reconciliation changed the profession without transferring the historical value used to calculate fishing output.

## Fix / proposed fix
Keep the existing `prepareWorkforce` → `assignWorkerTransition` flow. On successful legacy Fishing Spot reconciliation, copy the Hunter value into Fisher only when greater than the existing Fisher value, using `writableEntitySkills` so the profile revision updates. Preserve Hunter proficiency and clear the stale hunt target. No independent migration scheduler or separate skill formula.

## Save/migration impact
No new save fields or format version. Existing loaded fishing crews migrate on workforce reconciliation; Hunter skill remains available for hunting, and Fisher starts at the higher of the two stored values. Because old saves did not track fishing and hunting separately, legacy Hunter skill is the only available approximation of fishing experience.

## Verification result
NOT RUN locally for this revision (repository checkout and internet unavailable in the execution environment). The new focused regression asserts Fisher skill 12, retained Hunter 12, a 1.24× production-skill factor relative to the pre-conversion Fisher-zero case, idempotency, and preservation of an existing Fisher 23. The previous PR head's six CI workflows passed, but they did not test this additional correction; new-head CI is pending.
