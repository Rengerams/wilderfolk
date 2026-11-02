# Youth conception used only the mother's age boundary

- Bug: the youth-conception gate checked the mother's band (12–17) but only a lower bound on the father, so a 17-year-old girl with an 18-year-old sweetheart conceived while an 18-year-old girl with a 17-year-old sweetheart could not — eligibility depended on which partner had the birthday.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1, working tree
- Reporter: owner review of the four simulation modules
- Area: conception
- Owner module: src/game/simulation/humanRelationships.ts (`tryDailyConception`)
- Related PR/commit: fixed 2 November 2026

## Status history

- 2026-11-02 — open: found while analysing `humanSocial`, `humanNeeds`, `humanPhysiology` and `humanRelationships`.
- 2026-11-02 — resolved: the retained youth link carries the youth conception route across the first 18th birthday in either direction; both 18 (or an older adult) closes it.

## Observed behavior

With a mutual youth-love pair and a passing day roll: 17-year-old girl + 18-year-old boy conceived; 18-year-old girl + 17-year-old boy did not. The married route needs a marriage and the affair route is 18+ only, so the second pair had no conception route at all until the handoff.

## Expected behavior

The documented handoff keeps the youth link while one partner is 18 and the other is still a minor, so the pair keeps the youth conception route in either direction across that birthday; once both are adults the route closes and the adult (married) path applies.

## Reproduction / evidence

1. `tests/youthConception.ageFloor.test.ts`
2. "keeps the route in either direction while one sweetheart is 18 and the other is a minor" — 17+18 and 18+17 both conceive; 17+18 did anyway before the fix, 18+17 did not.
3. "closes the route once both sweethearts are adults" — 18+18 and 19+17 do not.

## Root cause

The gate expressed the mother's band as `age >= 12 && age < 18` but the father only as `age >= 12`, so eligibility was read from one side of the pair.

## Fix (applied)

The gate now requires both partners in the youth band's span (`age ≤ HUMAN_YOUTH_FERTILITY_END`), at least one of them a minor (`isMinor`), and the mutual youth link — so the retained pair keeps the route in either direction and both-adult pairs wait for the handoff.

## Regression coverage

`tests/youthConception.ageFloor.test.ts`: 17+17, 17+18 and 18+17 conceive; 18+18 and 19+17 do not. `tests/youthLove.handoff.test.ts`: the retained 18/17 link still waits and promotes when both are adults.

## Save compatibility

None: in-memory state only.

## Verification

`npx vitest run tests/youthConception.ageFloor.test.ts tests/youthLove.handoff.test.ts` — 13 passed.
