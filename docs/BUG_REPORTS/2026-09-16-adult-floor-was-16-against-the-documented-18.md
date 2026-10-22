# The adult floor was 16 while the documented age ladder says 18

- **Bug:** `HUMAN_ADULT_MIN_AGE` (`dayCycleConstants.ts`) was **16**, but every document that states the age ladder says **18**: `docs/archive/FERTILITY_AGE14_F1.md` ("The adult marriage threshold remains **18**"), `docs/archive/YOUTH_LOVE_FEATURE.md` ("**18** = Adult transition … if both linked settlers are 18, the pair transfer once into adult courtship"), the CHANGELOG ("age rules now describe one relationship route per age band … affairs 18+"), and `HUMAN_MOVE_OUT_MIN_AGE` (18) in `residencyOccupancy.ts`. Because that one constant is the shared floor, a 16–17 year old was treated as an adult by courtship, leadership, adoption guardianship, the recruit/immigrant age rolls and the legacy age clamp
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** owner, while reviewing the new immigration age bands ("human aduult min_age is 18")
- **Area:** Truth (age ladder / relationship gates)
- **Owner module:** `src/game/dayCycleConstants.ts` (the constant), with consumers in `humanRelationships.ts`, `villageLeadership.ts`, `residencySelection.ts`, `moonHowler.ts`, `entityFactory.ts`, `settlerInteractionActions.ts`, `groupEvents.ts`, `dayCycle.ts`
- **Cadence:** checked at each consumer's own cadence (courtship daily/staggered, leadership election, housing assignment, immigration roll)

## Status history

- 2026-09-16 — open (owner correction while reviewing the immigration change; confirmed against the three archived design documents and the CHANGELOG)
- 2026-09-16 — resolved (`HUMAN_ADULT_MIN_AGE = 18` with the ladder documented beside it; regression test `tests/adultFloor.age18.test.ts`)

## Observed behavior

```ts
// src/game/dayCycleConstants.ts (before)
/**
 * Social-adult floor (courtship, adoption singles, recruit ages, etc.).
 * Full age ladder lives next to related constants in `dayCycle.ts` (EK-E4).
 */
export const HUMAN_ADULT_MIN_AGE = 16;
```

A 16–17 year old therefore passed every `age >= HUMAN_ADULT_MIN_AGE` gate:

- `humanRelationships.isEligibleToCourt` — a 16 year old could enter adult courtship, which the youth-love design reserves for the age-18 handoff, while marriage still needed `HUMAN_MOVE_OUT_MIN_AGE` (18): a two-year window of courtship without a possible marriage;
- `villageLeadership.isEligibleForLeadership` — a 16 year old could be elected village head;
- `residencySelection.listVillageSingleAdults` — a 16–17 year old counted as a "single adult" for solo housing and as an **adoptive guardian** for orphans (the 2026-09-13 EK-E3 fix moved this gate onto the constant, so with the constant at 16 that fix still let 16–17 year olds adopt);
- `moonHowler` curse eligibility, the `humanTick` affair-encounter gate, the daily illness roll, `entityFactory`/`groupEvents`/`settlerInteractionActions` age rolls (recruits, faction humans and debug spawns arrived 16+), and the legacy age clamp in `dayCycle.computeHumanAgeYears` (`Math.max(isJuvenile ? 0 : 16, computed)`).

## Expected behavior

18 is the adult floor, as the ladder documents: childhood under `HUMAN_CHILDHOOD_DAYS` (12), youth 12–17 (works, youth love, fertility, **no** courtship handoff, no marriage, no office), adult 18+ (courtship, marriage, affairs, leadership, adoptions, recruit ages).

## Reproduction steps

1. Before the fix: `isEligibleToCourt(human(1, 17))` → `true`; `isEligibleForLeadership(human(1, 17))` → `true`; `ensureOrphanAdoption` with only a 17 year old available records that 17 year old as the adoptive parent.
2. `npx vitest run tests/adultFloor.age18.test.ts` — all five cases fail against the 16 floor (the constant pin, courtship, leadership, the orphan guardian, and the ladder relation to `HUMAN_MOVE_OUT_MIN_AGE` / `Relationship.AFFAIR_MIN_AGE`).

## Evidence

- `src/game/dayCycleConstants.ts:12` (before) — `export const HUMAN_ADULT_MIN_AGE = 16;`
- `docs/archive/FERTILITY_AGE14_F1.md:32` — "The adult marriage threshold remains **18**."
- `docs/archive/YOUTH_LOVE_FEATURE.md:32,134,205` — "18 = Adult transition"; "If both linked settlers are 18, the pair transfer once into adult courtship."
- `CHANGELOG.md:107` — "**Age rules now describe one relationship route per age band (youth conception from 12, affairs 18+)**".
- `docs/private/BUGS_TRACKER.md:239` — EK-E3 ("Adoptive 'adults' can be age 12–17 | fixed | `listVillageSingleAdults` ≥ `HUMAN_ADULT_MIN_AGE`") — the fix was correct in shape but incomplete while the constant was 16.
- `src/game/residencyOccupancy.ts:5` — `HUMAN_MOVE_OUT_MIN_AGE = 18`; `gameConstants.Relationship.AFFAIR_MIN_AGE = 18`.
- Consumer list: `humanRelationships.ts:867,1253`, `humanTick.ts:990`, `villageLeadership.ts:249,263`, `residencySelection.ts:111`, `moonHowler.ts:228,236`, `entityFactory.ts:190`, `groupEvents.ts:294`, `settlerInteractionActions.ts:88,146`, `dayCycle.ts:381`.

## Root cause

One constant carrying two meanings — "social-adult floor" for the courtship/recruit paths and "adult" for the documented ladder — with the value drifting to the lower, convenience end. Every later fix (affairs at 18, the EK-E3 adoption gate, the youth-love handoff at 18) pinned its *own* floor rather than correcting this one, so the two definitions coexisted and only the local fixes were visible in tests.

## Regression test

`tests/adultFloor.age18.test.ts` (5 tests):
- the constant is 18 and equals both `HUMAN_MOVE_OUT_MIN_AGE` and `Relationship.AFFAIR_MIN_AGE`, and is above `HUMAN_CHILDHOOD_DAYS`;
- `isEligibleToCourt`: 17 refused, 18 accepted;
- `isEligibleForLeadership`: 17 refused, 18 accepted;
- `isValidAffairTarget`: a 17 year old refused as a paramour, 18 accepted;
- `ensureOrphanAdoption`: a 17 year old is never recorded as an adoptive parent (the orphan is still housed — `placeOrphanInHouse` keeps nobody bedless), while an 18 year old is adopted as the parent and gets the child in `childrenIds`.

`tests/immigration.composition.test.ts` additionally pins the new arrival bands *below* this floor (a lone youth is 12–17 and never married).

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant assertions satisfied. The same-seed totals moved, as expected for a deliberate gate change: settlers 77 → 69, births 35 → 27, marriages 53 → 48, divorces 36 → 33, scandals 200 → 183 (with the immigration composition change in the same run — the two changes share the `dailyPopulation` RNG stream, so they cannot be separated by seed alone).

## Save/migration impact

None. The constant is derived at read time; no save field, key or version changed. An existing save that happens to contain a 16–17 year old already in courtship or office keeps its state — the gate only decides future transitions — and `HUMAN_ADULT_MIN_AGE` is not persisted.

## Verification result

- `npx vitest run tests/adultFloor.age18.test.ts tests/immigration.composition.test.ts tests/affairAge.adultOnly.test.ts tests/low-8-humans.test.ts tests/youthConception.ageFloor.test.ts tests/relationshipDiagnostics.test.ts` — passed.
- `npm test` — passed: 162 files / 878 tests before this test file was added, and green again after it.
- `npm run build`, `npm run lint` (0 warnings / 0 errors on 322 files), `npm run test:types` — passed.
- `npm run test:full-year` — passed (exit 0), totals above.
- `npm run test:browser` — passed.

## Related commits or files

- `src/game/dayCycleConstants.ts` — `HUMAN_ADULT_MIN_AGE` 16 → 18, with the ladder and the regression this guards recorded beside it
- `tests/adultFloor.age18.test.ts` — new
- `tests/immigration.composition.test.ts` — new (arrival bands below the floor)
- `tests/affairAge.adultOnly.test.ts` — docstring corrected (it described the old constant)

## Fix

`export const HUMAN_ADULT_MIN_AGE = 18;` — the value the ladder, the marriage floor and the affair floor already used. No consumer code changed: every gate that reads the constant now agrees with the documents, and the youth band (12–17) is uniformly below it.
