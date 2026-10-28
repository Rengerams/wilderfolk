# Nurturing's village-wide maturation boost is dead code

- Bug: the Nurturing trait is described as making children mature faster, but its only maturation rule lives in `getSchoolAgeMultiplier`, which nothing calls, so the trait has no maturation effect.
- Status: open
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` (personality/career 0.6.5.2, PR B)
- Reporter: trait integration audit while wiring `evaluateTraitInfluence` into Phase B owners
- Area: education / settler traits
- Owner module: `src/game/education.ts` — `getSchoolAgeMultiplier`; trait label in `src/game/settlerTraits.ts` (`TRAIT_DEFS.nurturing`)
- Related PR/commit: PR B (branch `codebot-tasks`), no fix applied there

## Status history
- 2026-10-28 — open: grep over `src/`, `tests/`, `scripts/` and the components finds no caller of `getSchoolAgeMultiplier`; the trait's only live read is the captive-fate empathy count in `warPrisoners.ts`.

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
The maturation helper is exported but was never wired to the child-aging owner; the description was written against that intended behaviour. The Phase B audit deliberately did not wire it, because doing so would change maturation gameplay.

## Fix / proposed fix
Not fixed here. The minimal correct fix is one call from the existing child-aging path in `dayCycle.ts`, passing the colony's Nurturing count from the existing entity list, and keeping `getSchoolAgeMultiplier` the single owner. Until then the description should name the captive-fate effect it really has. Do not add a second maturation formula.

## Save/migration impact
None. No persisted field is involved.

## Verification result
- PASS: static trace above (no caller).
- NOT RUN: gameplay maturation comparison; no fix is in this PR.
