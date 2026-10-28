# A stale occupant id halves a production crew's trait factor

- Bug: `getWorkerSkillMultiplier` summed trait factors only for occupants it could resolve but divided by every occupant id, so an unresolved id turned a neutral crew's DNA factor into ×0.5.
- Status: resolved
- Severity: high
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` at `971b23c6` (personality/career 0.6.5.2, PR #90)
- Reporter: independent review of PR #90 (production-multiplier finding)
- Area: building production / settler traits
- Owner module: `src/game/skills.ts` — `getWorkerSkillMultiplier`
- Related PR/commit: PR #90, fixed on the same branch

## Status history
- 2026-10-28 — open: review traced the new trait term and found the numerator/denominator mismatch; no existing test covered an occupant list with a missing id.
- 2026-10-28 — resolved: an unresolved occupant now contributes a neutral ×1, and `tests/personality.workIntegration.test.ts` pins both the neutral case and the averaged case.

## Observed behavior
The trait term was built as `traitFactorSum += evaluateTraitInfluence(h, workContext).factor` inside `if (h)`, then divided by `building.occupants.length`. A building whose `occupants` array still names a settler who is no longer in the world therefore averaged in a zero for that slot:

- two occupants, one resolvable, both with irrelevant DNA → factor `1 / 2 = 0.5`;
- one Greenthumb farmer plus one stale id → `1.06 / 2 = 0.53` instead of the intended average.

The building's whole output then multiplied by that value, so a single stale id could halve a farm's harvest until the occupant list was repaired.

## Expected behavior
An occupant id that resolves to nobody has no DNA and must be neutral: it contributes ×1 to the crew average, so a crew with no relevant traits never falls below 1 and a known settler's DNA is diluted only by genuine crewmates. This also matches how the surrounding code already treats an unresolved id for skill (`readSkill` is skipped, not counted as zero-rated).

## Reproduction steps
1. `getWorkerSkillMultiplier(bare, building(30_000, BuildingType.Farm, { occupants: [1, 99] }), new Map([[1, plainFarmer]]))` with a settler carrying no traits.
2. On `971b23c6` the result is `1 + 0 × 0.02` multiplied by `0.5`.
3. The same building with `occupants: [1]` returns `1`.

## Evidence
- `src/game/skills.ts`: `if (h) { … traitFactorSum += … }` followed by `const traitMult = traitFactorSum / building.occupants.length;`.
- The new regression test fails on that code (`× treats an unresolved occupant id as neutral instead of diluting the crew factor`) and passes after the fix.

## Root cause
The trait term was added to an existing loop that already skipped unresolved ids, but the new divisor used the raw occupant count. `rewardBuildingWork` and the skill average keep their pre-existing behaviour, so only the new DNA term was affected.

## Fix / proposed fix
The loop now adds a neutral `1` for an unresolved occupant when a work context is active, and `total`/`resourceful` continue to count only resolved settlers exactly as before. The skill average is untouched.

## Save/migration impact
None. The multiplier is derived each production day from live entities and building occupants; no stored value changes.

## Verification result
- `npm run test:types` — **PASS**
- `npx vitest run tests/personality.workIntegration.test.ts` — **PASS** (7 tests), including the new case; the same test **FAILS** with the fix reverted.
- Production-day integration assertions in the same file (Greenthumb crew out-produces a plain crew, storage-full shift still credits skill) — **PASS**.
