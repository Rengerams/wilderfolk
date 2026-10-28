# Nurturing's village-wide maturation boost is dead code

- Bug: the Nurturing trait is described as making children mature faster, but its only maturation rule lives in `getSchoolAgeMultiplier`, which nothing calls, so the trait has no maturation effect.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` (personality/career 0.6.5.2, PR B)
- Reporter: trait integration audit while wiring `evaluateTraitInfluence` into Phase B owners
- Area: education / settler traits
- Owner module: `src/game/education.ts` — `getSchoolAgeMultiplier`; trait label in `src/game/settlerTraits.ts` (`TRAIT_DEFS.nurturing`)
- Related PR/commit: PR B (branch `codebot-tasks`), no fix applied there

## Status history
- 2026-10-28 — open: grep over `src/`, `tests/`, `scripts/` and the components finds no caller of `getSchoolAgeMultiplier`; the trait's only live read is the captive-fate empathy count in `warPrisoners.ts`.
- 2026-10-28 — resolved: the dead maturation helper and its constant are gone, the Nurturing description names the mercy vote it really drives, and the research tip no longer claims schooling accelerates maturation. Typecheck, lint, build and the education/school/needs suites pass.

## Observed behavior
`TRAIT_DEFS.nurturing.description` reads *"Children mature faster while they live in the village."* The rule behind that sentence is the `nurturingCount` parameter of `getSchoolAgeMultiplier(child, buildings, nurturingCount)`, which adds `min(0.2, nurturingCount * 0.04)` to a child's maturation multiplier. The function is exported from `education.ts` and has **zero** call sites in the repository, so `nurturingCount` is always the default `0` and no maturation multiplier is ever applied.

The trait's only reachable live effect today is the empathy count in `src/game/warPrisoners.ts:61`, where `nurturing` or `chivalrous` villagers tilt the settlement's reaction to a captive's fate.

## Expected behavior
A player-facing trait description must describe an effect that actually runs. Either the maturation rule is called from the real child-maturation path, or the description states the effect the code performs.

## Reproduction steps
1. Check out branch `codebot-tasks` at commit `f8c7b792`.
2. `grep -rn "getSchoolAgeMultiplier" src tests scripts src-tauri` — only the definition in `src/game/education.ts` matches.
3. `grep -rn "nurturing" src` — only `warPrisoners.ts`, the trait catalog/label, the new (unconsumed) `family/care` catalog context and the now-dead education parameter match.
4. Observe that no child's maturation rate changes for a colony with or without a Nurturing resident.

## Evidence
- `src/game/education.ts:382-396` defines the multiplier and reads `nurturingCount`.
- No call site exists outside that file.
- `src/game/dayCycle.ts:170` owns the actual maturation rate and never consults the trait.

## Root cause
The maturation helper was written for an earlier design that let schooling and Nurturing residents accelerate a childhood, and a later release deliberately retired that: childhood age now follows calendar days only, so no maturation multiplier can be honoured any more. The helper survived the retirement with its description.

## Fix / proposed fix
Fixed by removing the promise instead of reviving it. Wiring the helper back would contradict the shipped calendar-only aging decision and reopen the abrupt age jumps that decision removed, so `getSchoolAgeMultiplier` and `SCHOOL_MIN_DAYS_FOR_BOOST` are deleted, the Nurturing description now names the community's mercy vote over a captive's fate — its one live effect — and the research tutorial tip says children "attend and graduate schooled" rather than "mature faster". School days, education tiers and physical aging are unchanged.

## Save/migration impact
None. No persisted field is involved.

## Verification result
- PASS: `grep -rn "getSchoolAgeMultiplier\|SCHOOL_MIN_DAYS_FOR_BOOST" src tests scripts` returns no match after the removal.
- PASS: `npm run test:types`, `npm run lint` and `npm run build` on the fixed branch.
- PASS: `npx vitest run` over the education, school, schooling, graduation, needs and trait files (22 files, 191 tests).
- PASS: `tests/personality.physiologyIntegration.test.ts` asserts the Nurturing description no longer claims maturation.
- NOT RUN: a player-visible maturation comparison, because the fix removes the claim rather than changing aging.
