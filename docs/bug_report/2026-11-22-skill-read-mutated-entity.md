# Reading skill state could mutate saved entity data

- Bug: Reading skill state could mutate saved entity data.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: 0.6.5.1; PR #166 targeting 0.6.5.2
- Reporter: Codex review / PR #166 owner audit
- Area: Skill owner and entity revisions
- Owner module: `src/game/skills.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/166

## Status history
- 2026-11-22 — investigating: source trace reviewed; correction prepared in PR #166; CI verification pending.

## Observed behavior
`readSkill` could populate missing skill data as a side effect of reading it. A no-op skill credit or decay could also mark the profile as changed without a genuine skill-value change.

## Expected behavior
Read-only queries must not mutate an entity; the canonical writer changes skill data and bumps its revision only when the value changes.

## Reproduction steps
1. Create a settler without an initialized skills object.
2. Read a job with the previous `readSkill` implementation and compare the entity before/after.
3. Apply a zero/no-op credit or decay and inspect `profileRevision`.

## Evidence
PR #166 changes `readSkill`, `increaseEntitySkill`, `gainSkill` and `decayIdleSkills`; `tests/skills.attendanceOwner.test.ts` covers pure reads, no-ops and revision behavior.

## Root cause
The read path reused lazy initialization/writer behavior and revision updates were not contingent on real value changes.

## Fix / proposed fix
Make `readSkill` pure; route credit through the single skill writer and guard revisions on actual skill-value differences.

## Save/migration impact
None. Existing attendance and skill fields are retained; no new persisted construction ledger or scheduler is added.

## Verification result
NOT RUN locally for this revision; targeted pure-read and revision regressions are present in PR #166.
