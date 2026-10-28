# Career old-save RNG test misidentifies normal Moon Howler load activity

- Bug: PR-D old-save migration regression incorrectly treated a legitimately initialized Moon Howler RNG stream as evidence of extra career RNG draws.
- Status: investigating
- Severity: low
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 development, PR #99 commit `68e841f3`
- Reporter: GitHub Actions Node.js CI (run 40763701831)
- Area: old-save migration regression test
- Owner module: `tests/personalityCareer.oldSaveMigration.test.ts`
- Related PR/commit: PR #99; test correction `f801f30d`

## Status history
- 2026-10-28 — investigating: CI reproduced one false-positive test failure (2,720 tests passed, one failed, two skipped); fixed the assertion to compare equivalent save-load paths with and without career fields. New CI verification pending.

## Observed behavior
The test compared `snapshotSimRng().owners` after a full save restoration to `payload.simRng.owners` before restoration, asserting complete equality. The loader can legitimately add the `moonHowler` stream while synchronizing Moon Howler forms. Its appearance triggered the test failure even though the career migration did not draw from a random stream.

## Expected behavior
The test must detect only RNG changes introduced by absence of career fields, not pre-existing legitimate save restoration. Both control and legacy loading must execute identical normal Moon Howler reconciliation.

## Reproduction steps
1. Run `tests/personalityCareer.oldSaveMigration.test.ts` as part of standard Node CI on PR #99 commit `68e841f3`.
2. Restore the deterministic `oldPayload()` fixture and compare its pre-load RNG snapshot to `snapshotSimRng()` post-load.
3. Observe `AssertionError`: the post-load owners have an extra `moonHowler` entry.

## Evidence
- GitHub Actions run 40763701831, job 123082231272: the only failed test was the old-save RNG assertion at line 116.
- `src/game/saveLoad.ts` restores the RNG snapshot before `migrateLegacyMoonHowler` and `syncMoonHowlerForms`, and documents the expected live stream use in Moon Howler synchronization.
- No gameplay fault or additional career RNG draw was observed.

## Root cause
The regression treated the full load path as RNG-neutral, rather than isolating the effect of the newly optional career fields.

## Fix / proposed fix
Create a control copy of the same deterministic save with explicit empty career objects, then compare **complete post-load RNG snapshots** between control and legacy saves. Both pathways execute the same Moon Howler load behavior; differences now isolate career migration. No changes to simulation RNG, world generation or game rules.

## Save/migration impact
None. Only the new test's assertion and fixture comparison changed.

## Verification result
- Previous Node.js CI: **FAIL**, exactly one false-positive test, 2,720 passed.
- Updated regression committed in `f801f30d`: **NOT YET VERIFIED** by completed CI.
- 90-day and 360-day simulation workflows on preceding source commit: **PASS**.
