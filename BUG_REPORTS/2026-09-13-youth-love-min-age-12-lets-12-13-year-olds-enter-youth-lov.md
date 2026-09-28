# Youth love begins at 12 — the code was right and the documents were stale

- **Bug:** `YOUTH_LOVE_MIN_AGE = 12` contradicted `SIMULATION_AUTHORITY.md` §5 ("Youth love begins only from age 14 through 17") and the age-14 wording in `YOUTH_LOVE_FEATURE.md` and the README
- **Status:** resolved — withdrawn as a code defect; documents corrected to 12, and the age ladder made coherent in code
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A9-humanRelationships; adversarially verified) — audit id H11
- **Area:** Truth
- **Owner module:** `src/game/simulation/humanRelationships.ts` (youth love), `src/game/dayCycle.ts` (fertility window), `src/game/gameConstants.ts` (affair floor)
- **Cadence:** new-calendar-day (unchanged) — `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit; confirmed by independent adversarial verification; re-verified by the lead against source)
- 2026-09-13 — investigating (owner review: the constant is deliberate — 12 is intended)
- 2026-09-13 — resolved (documents corrected to 12; the same owner decision then aligned the remaining age rules in code — youth conception admitted 12/13 and affairs made adult-only on both sides — with two regression tests)

## Observed behavior

`YOUTH_LOVE_MIN_AGE = 12` (`simulation/humanRelationships.ts:441`) is consumed by `isEligibleForYouthLove` and by the daily age-protection clear in `advanceYouthLove`, which iterates `playerHumans` with no further age gate, so a 12- or 13-year-old could form a mutual youth-love link (and that link then blocks adult courtship). The governing documents said otherwise: `SIMULATION_AUTHORITY.md` §3 ("Youth love (ages 14–17)") and §5 ("Youth love begins only from age 14 through 17"), `YOUTH_LOVE_FEATURE.md` (the 12–13 row read "Not eligible", the start-eligibility age row said "at least 14", the age-protection step said "below age 14") and the README feature table ("From age 14"). No test covered youth-love ages, so the two drifted apart unnoticed.

## Expected behavior

One age rule, stated once and matched by the code. The owner confirmed that **12 is the intended youth-love age**, so the documents were the artifact to correct; and because the youth phase begins at 12, the rest of the age ladder had to agree with it:

- youth love: **12–17** (`YOUTH_LOVE_MIN_AGE` 12, `YOUTH_LOVE_MAX_AGE_EXCLUSIVE` = `HUMAN_MOVE_OUT_MIN_AGE` = 18);
- youth conception: **12–17**, only through an existing mutual youth-love pair (`HUMAN_FERTILITY_START` = 12, `YOUTH_CONCEPTION_MULTIPLIERS` 12: 0.25 · 13: 0.25 · 14: 0.25 · 15: 0.35 · 16: 0.50 · 17: 0.70);
- marriage: **18+** (unchanged, `HUMAN_MOVE_OUT_MIN_AGE`);
- affairs: **18+ on both sides** (`Relationship.AFFAIR_MIN_AGE`), so 12–17 has exactly one relationship route and one conception route.

## Reproduction steps

1. Open `docs/archive/SIMULATION_AUTHORITY.md` §5 and `src/game/simulation/humanRelationships.ts:441` — the invariant said 14, the constant said 12.
2. Open `docs/archive/YOUTH_LOVE_FEATURE.md` (age timeline / start eligibility) and `README.md:158` — both said 14.
3. Before the fix, run `npx vitest run -t "youth"`: no test asserted the youth-love age boundary, which is why the drift was invisible.

## Evidence

Adversarial verification (independent agent re-read the code, the git history and the docs):

> `YOUTH_LOVE_MIN_AGE = 12` (line 441) is consumed by `isEligibleForYouthLove` (473) and `advanceYouthLove` (553), and `advanceYouthLove` iterates `playerHumans` without any juvenile/age-14 gate (541), so a 12-year-old can be matched (`YOUTH_LOVE_MAX_AGE_GAP` 4 at 443/490), gets a mutual `youthLovePartnerId` with progress 1 plus the 'became sweethearts' event (599-611), and that link blocks adult courtship (`isEligibleToCourt`:1229). `SIMULATION_AUTHORITY.md` §5 says 'Youth love begins only from age 14 through 17', `README.md:158` said 'From age 14', and `docs/archive/YOUTH_LOVE_FEATURE.md:29/42` listed 12–13 as not eligible; git shows 14 was changed to 12 in commit 349f49e with no doc update, and no test covers youth-love ages.

## Root cause

A deliberate gameplay change (youth love at 12, commit `349f49e`) updated the constant but not the contract documents, and no test pinned the age boundary — so the authority document and the code disagreed and neither could win. Two further rules still assumed the old boundary: the conception gate still started at 14 (`HUMAN_FERTILITY_START`) while youth love started at 12, and the affair gate used the 16-year *courtship* age for the paramour only (the daily owner already required a married cheater, i.e. 18+), so an adult could conceive with a 16–17-year-old paramour outside the youth gate.

## Fix

Documents corrected to 12 (the code was already intended):

- `docs/archive/SIMULATION_AUTHORITY.md` — §3 ownership row now "Youth love (ages 12–17)"; §5 youth-love invariant "from age 12 through 17"; the §3/§5 conception rows "age-12–17"; §5 adds an **Affair invariants** section (adult-only on both sides; scandals only on establishment).
- `docs/archive/YOUTH_LOVE_FEATURE.md` — age timeline (12–13 can begin), start-eligibility age row (at least 12), daily age-protection step (below age 12), automated-coverage row (age 11 cannot, age 12 can), a new youth-conception note with the multiplier table, and the pregnancy rows/FAQ that wrongly claimed youth love can never lead to pregnancy.
- `README.md` — feature table now reads "From age **12** … Fertility begins at 12 … marriage, homes, work, and affairs remain adult-only (18+)".
- `docs/archive/FERTILITY_AGE14_F1.md` — a "later amendments" note points at the current values while its original v0.6.2.1 table stays as that slice's record.

The rest of the ladder was then aligned in code (same owner decision):

- `src/game/dayCycle.ts` — `HUMAN_FERTILITY_START` 14 → **12**; `YOUTH_CONCEPTION_MULTIPLIERS` gained **12: 0.25** and **13: 0.25** (the base value 14 already used); 14–17 unchanged.
- `src/game/gameConstants.ts` — new `Relationship.AFFAIR_MIN_AGE` = **18**; `src/game/simulation/humanRelationships.ts` applies it to **both** the paramour and the cheater in `isValidAffairTarget` and replaces the 16-year check in `tryDailyAffairEncounter`. Courtship eligibility and every other `HUMAN_ADULT_MIN_AGE` (16) use are unchanged.

## Regression test

- `tests/youthConception.ageFloor.test.ts` (4) — pins the 12 floor (`HUMAN_FERTILITY_START` = 12, `getFemaleFertility(11)` = 0, the 12/13/14 = 0.25 and 17 = 0.70 multipliers), proves conception at 12 and 13 with lineage on a forced passing day, that 11 still cannot conceive, and that a one-sided or absent youth-love link cannot conceive at 12.
- `tests/affairAge.adultOnly.test.ts` (4) — pins `Relationship.AFFAIR_MIN_AGE` = 18 and rejects a 16/17-year-old paramour and a 17-year-old cheater while accepting 18, with the lifespan ceiling intact.
- Existing `tests/conceptionEvent.labelling.test.ts` and `tests/affair.cadence.test.ts` still pass unchanged.

## Invariants checked

`docs/archive/SIMULATION_AUTHORITY.md` §5: youth love 12–17, conception 12–17 only through the mutual youth-love gate, one birth owner, one conception owner, affair invariants. `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` remain clean in the invariant tests; the new tests also assert mutual-link symmetry for the pregnant pair.

## Save/migration impact

None. No field, format, or migration changed: `pregnant`, `pregnantById`, `youthLovePartnerId`, and the affair fields are unchanged, and the age rules are read from constants at runtime. Existing saves keep their relationships; ages are already stored per settler.

## Verification result

- Targeted: `npx vitest run tests/youthConception.ageFloor.test.ts tests/conceptionEvent.labelling.test.ts` — passed (8 tests); `npx vitest run tests/affairAge.adultOnly.test.ts tests/youthConception.ageFloor.test.ts tests/affair.cadence.test.ts` — passed (10 tests).
- Broad: the full standard suite, typecheck and lint, plus the full-year invariant gate, were run after the change (see the consolidated report's post-audit section).
- Outcome: **resolved**; the audit's H11 high finding is withdrawn (the code was intended) and the report records the withdrawal.

## Related commits or files

- `src/game/simulation/humanRelationships.ts` (441, 473, 553, 619-628, 1359), `src/game/dayCycle.ts` (143-166), `src/game/gameConstants.ts` (`Relationship.AFFAIR_MIN_AGE`)
- `docs/archive/SIMULATION_AUTHORITY.md`, `docs/archive/YOUTH_LOVE_FEATURE.md`, `docs/archive/FERTILITY_AGE14_F1.md`, `README.md`, `CHANGELOG.md` (0.6.4.1 entry)
- `tests/youthConception.ageFloor.test.ts`, `tests/affairAge.adultOnly.test.ts`
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H11 — withdrawn after owner review)
