# Career work credited to the wrong profession after a same-site job change

- Bug: The initial PR-D attendance projection could credit a mixed-profession workday entirely to the current job when the building id stayed the same.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 development, PR #99 initial branch implementation
- Reporter: PR-D ownership and acceptance audit
- Area: career shift provenance, daily fatigue and job experience
- Owner module: `src/game/scheduleFatigue.ts` (attendance provenance), `src/game/careers/careerHistory.ts` (sole career-credit writer)
- Related PR/commit: PR #99; original implementation `6700eaaf`, proposed correction `c59ed99d`

## Status history
- 2026-10-28 — investigating: static trace confirmed that site-only provenance did not disambiguate a changed profession; a focused regression and the correction were committed. CI pending.

## Observed behavior
The first PR-D version tracked `scheduleWorkedSiteIdToday` but not a corresponding trade. If a worker remained assigned to workplace 10, accrued a Farmer hour, then switched to Hunter for another recorded hour and returned to Farmer before the daily economy event, `recordCareerWork` saw matched site 10, current Farmer job and positive total hours. It could grant a Farmer career day although the credited shift mixed professions.

## Expected behavior
The career writer credits an attributed job only if the already recorded attendance identifies **both** one stable workplace and one stable profession for the entire settled shift. A mixed workday may still affect the canonical fatigue and production owners, but it must not fabricate career history.

## Reproduction steps
1. Start from a living adult player settler assigned to completed farm 10.
2. Record one hour of Farmer attendance, change the current job to Hunter without changing workplace, record one additional hour, then restore the Farmer job.
3. Resolve daily schedule fatigue, then attempt to credit Farmer for the recorded two hours.
4. Before the correction the site-only provenance admitted credit; the new regression requires `scheduleLastWorkedJob === null` and rejected credit.

## Evidence
- Original PR-D `scheduleFatigue.recordScheduleWorkTick` recorded the building id but no attended job.
- Original PR-D `careerHistory.recordCareerWork` validated the *current* worker job, not the job during all credited work hours.
- Regression added in `tests/careers.history.test.ts` for the same-site profession change.

## Root cause
A mutable current job assignment was treated as proof of the profession of previously accumulated attendance hours.

## Fix / proposed fix
The existing attendance owner now carries two additional optional scalar job-provenance fields, marks mixed trades as null, and snapshots them during its existing fatigue resolution. The career writer requires verified matching job provenance. Normalization and persistence are handled through the same existing Entity, save schema, save load and full-entity worker transport. No independent attendance pass or secondary writer.

## Save/migration impact
Existing saves without provenance fields load safely; unverified older attendance is not retroactively credited. Existing valid DNA, skills and current assignments remain intact.

## Verification result
- Static code trace and diff: verified.
- `tests/careers.history.test.ts`: added regression; GitHub CI in progress, **NOT YET VERIFIED**.
- Node.js CI, build, seeded colony and 360-day gate on corrected commit: **PENDING**.
