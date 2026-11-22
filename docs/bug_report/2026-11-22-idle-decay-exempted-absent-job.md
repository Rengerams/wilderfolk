# Idle skill decay exempted the assigned job without work

- Bug: Idle skill decay exempted the assigned job without work.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: 0.6.5.1; PR #166 targeting 0.6.5.2
- Reporter: Codex review / PR #166 owner audit
- Area: Skills, daily schedule and career attribution
- Owner module: `src/game/skills.ts` (decay), `src/game/scheduleFatigue.ts` (practiced-job witness), `src/game/tickLayerDaily.ts` (00:00 caller)
- Related PR: https://github.com/Rengerams/wilderfolk/pull/166

## Status history
- 2026-11-22 — investigating: source trace reviewed; correction prepared in PR #166; CI verification pending.

## Observed behavior
An adult with a job assignment but no witnessed work could retain that job's skill through the 00:00 idle-decay pass. An intra-day job transfer risked exempting the currently assigned rather than actually practiced trade.

## Expected behavior
Only the verified, site-attributed trade worked during the completed day is exempt. An idle or absent worker's job skill still decays.

## Reproduction steps
1. Assign an adult to a trade but leave them away from the workplace for the whole day.
2. Seed their job skill and another trade skill, advance `gameTick` across midnight.
3. Under the old behavior, the assigned job may be protected even without site attendance.

## Evidence
PR #166 `getPracticedJobForCompletedDay`, `tickLayerDaily` and `skills.attendanceOwner.test.ts`; separate from the previously resolved 2026-11-07 defect where the decay scheduler never executed at all.

## Root cause
The decay exemption was based on job title or stale historical attendance rather than the just-finished day's witnessed site/job.

## Fix / proposed fix
At 00:00 query the existing attendance owner for the just-completed day's site-matched job before the midnight resolver clears its counters; pass only that result to the sole `decayIdleSkills` writer.

## Save/migration impact
None. Existing attendance and skill fields are retained; no new persisted construction ledger or scheduler is added.

## Verification result
NOT RUN locally for this revision; absent-job regression is in `tests/skills.attendanceOwner.test.ts`.
