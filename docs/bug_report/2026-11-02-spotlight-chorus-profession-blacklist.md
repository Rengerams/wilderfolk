# Spotlight chorus blacklisted professions instead of checking current duty

- Bug: the rare village spotlight refused whole professions (doctor, prison guard, soldier, innkeeper, hotelier, priest) even when they were off duty, and never asked whether a candidate was actually working at 19:00.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1 code base, merged PR #91 (`2a9f1a72dce8e112c5e8e6adc53e7c0e62bf5397`)
- Reporter: PR #91 implementation review, corrected by the owner ("no exclusions, just select men that are not working at that moment")
- Area: rare village spotlight — chorus selection
- Owner module: `src/game/spotlightLore.ts` (`eligibleChorus`, `maybeStartSpotlightLore`)
- Related PR/commit: [#91](https://github.com/Rengerams/wilderfolk/pull/91)

## Status history

- 2026-11-02 — open: review of the merged PR found the job-type blacklist in `eligibleChorus`.
- 2026-11-02 — resolved: selection now asks the existing work-reason owner whether each candidate is on duty; targeted regressions pass.

## Observed behavior

`eligibleChorus` returned false for every member of six professions regardless of the clock, while `maybeStartSpotlightLore` started only on a weekend at 19:00 with at least six eligible adult men within 100 units. Consequences:

- Six off-duty soldiers, priests, doctors or venue workers beside the stage produced no scene at all — the 7.5% evening opportunity was silently lost.
- A player who closes the tavern before 19:00 still lost the innkeeper from the pool; a weekend day schedule could never make a day job "working" either. The exclusion followed the job label, not the duty.
- The list also quietly failed its real purpose for any duty-bearing profession not named in it.

## Expected behavior

The owner's rule: no profession exclusions; select men who are not working at that moment. Duty is owned by the existing `getSettlerWorkReason` composition (`src/game/workAbsence.ts`), whose `working` / `walking-to-work` codes are the settlement's own definition of being on duty. A man of any profession may join off duty; an innkeeper serving, a doctor on a hospital shift or a guard on a prison shift may not.

## Reproduction steps

1. Seed fixture of `tests/spotlightLore.test.ts`: one 14-year-old heroine and eight adult men, six of them given doctor, prison-guard, soldier, innkeeper, hotelier and priest jobs with no workplace — every one therefore off duty.
2. Move to a deterministic weekend 19:00 after the 90-day cooldown and call `maybeStartSpotlightLore`.
3. Before the fix the six job holders were rejected and only two candidates remained, so the function returned false and no scene started. The committed regression `selects off-duty specialists whatever their profession instead of blacklisting jobs` fails on the old predicate.
4. Second regression: a healthy innkeeper on a completed tavern roster at the default 17:00–23:00 venue window is `walking-to-work`/`working` at 19:00 and is excluded, while the seven free men still start the scene.

## Evidence

- `src/game/workAbsence.ts:173` (`getSettlerWorkReason`) composes the day, venue, hospital, prison and moon-priest shift owners; `workplaceDutyLabel` maps every code except `working` and `walking-to-work` to "Off duty".
- `src/game/spotlightLore.ts` before the fix: the `eligibleChorus` predicate ended with `entity.job !== JobType.Doctor && ... !== JobType.Priest`.
- `npx vitest run tests/spotlightLore.test.ts` before the fix would reject the new off-duty-specialists case; after the fix the file passes 23/23.

## Root cause

Selection used a static profession blacklist copied into the scene owner instead of the existing read-only duty projection. It conflated "has a profession that may work evenings" with "is working now", so availability was wrong in both directions and duplicated shift knowledge outside the shift owners.

## Fix / proposed fix

`eligibleChorus` now checks only identity and physical availability (shared with the heroine through the new `availableSpotlightActor` helper): alive player human, adult male, not imprisoned/deployed/captive/hunted/indoors. `maybeStartSpotlightLore` filters candidates with the live `getSettlerWorkReason(state, human).code`, rejecting only `working` and `walking-to-work`. No profession rule and no duplicated shift logic remain.

## Save/migration impact

None. No saved field, schema version or scene shape changed; the rule applies when a new scene is selected.

## Verification result

- `npm test -- unit spotlight` — PASS, 40 tests / 6 files (23 in `spotlightLore.test.ts`, including the two new regressions).
- `npm run test:types` — PASS.
- `npx tsc -p tsconfig.app.json --noEmit` — PASS (exit 0).
- `node scripts/test.mjs lint` — PASS, 0 errors (14 warnings elsewhere).
- `node scripts/test.mjs cycles --strict` — PASS, no runtime import cycles (the new read edge to `workAbsence.ts` adds none).
- `node scripts/test.mjs owners` — PASS, 0 functions without a recorded owner.
- `node scripts/check-function-overlap.mjs` — PASS, 0 unresolved matches; the shared helper replaced a 0.89 similarity between the two eligibility predicates instead of waiving it.
- `npm run build` — PASS (tsc app + call graph + overlap + lint + dup + tsc node + Vite).
- Standard/full gates, browser acceptance and CI — NOT RUN in this change; another agent was mid-merge in the same working tree.
