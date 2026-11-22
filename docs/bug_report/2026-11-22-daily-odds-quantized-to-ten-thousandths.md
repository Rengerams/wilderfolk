# Daily event odds are quantized to 1/10,000, inflating small mortality and divorce rates

- Bug: `personDayRoll` reduces every daily decision to a 10,000-bucket grid, so probabilities below ~1% per day round up to the next bucket — illness death runs at 1.66× its documented rate, amicable divorce at 1.51×, and old-age mortality starts 83% above its documented annual rate.
- Status: open
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: V.0.6.5.1 / `audit-simulation-logic` @ `5722a330`
- Reporter: simulation-logic audit 2026-11-22 (`docs/plans/simulation-logic-audit-2026-11-22.md`, F-02)
- Area: Simulation RNG / daily life events
- Owner module: `src/game/simRng.ts` (`mixDayRoll`), consumed by `src/game/simulation/humanRelationships.ts` and `src/game/ecologyStage.ts`
- Related PR/commit: none yet

## Status history
- 2026-11-22 — open: measured over 7.2 M draws against the closed form `ceil(p · 10⁴) / 10⁴`; not yet fixed.

## Observed behavior

`personDayRoll` returns `(hash % 10000) / 10000` (`src/game/simRng.ts:99-111`), so a roll can only
take the values `0.0000, 0.0001, … 0.9999`. A decision that compares `roll < p` therefore fires with
probability `ceil(p · 10⁴) / 10⁴`, not `p`.

Measured over 20,000 entity ids × 360 days per decision:

| Decision | Documented daily | Effective daily | Documented annual | Effective annual |
|---|---|---|---|---|
| Illness / accident death | 0.00012 | 0.000199 | 4.32% | **7.15%** |
| Amicable divorce | 0.000208 | 0.000315 | 7.50% | **11.34%** |
| Old-age death, age 60 | 0.0000556 | 0.000101 | 2.00% | **3.65%** |
| Old-age death, age 61 | 0.000146 | 0.000200 | 5.27% | **7.22%** |
| Old-age death, age 65 | 0.000509 | 0.000611 | 18.33% | **21.99%** |

The old-age curve is documented as a smooth ramp (`src/game/dayCycle.ts:243-255`: 2% at 60 scaling to
100% at 90) but each additional bucket is worth 3.6 percentage points a year, so the shipped curve is
a staircase that starts 83% above its documented rate.

Visible gameplay consequence: `getValleyIllnessChanceBonus` (`src/game/ecologyStage.ts:336-345`) adds
0.00008 in the `damaged` valley stage, taking the daily chance from 0.00012 to 0.00020 — which is
**the same bucket**, so the penalty is exactly inert. The illness rate only moves at `collapse`
(0.00032 → 0.0004).

## Expected behavior

A decision documented at `p` per day should fire at approximately `p`. Hand-authored thresholds that
are already multiples of 0.0001 (conception 0.18/0.0045/0.14, gossip 0.06/0.12/0.22, tryst
0.10/0.07, youth love 0.0015/0.0004, hospital 0.2, leisure 0.34/0.55, town hall 0.18–0.55, hunting
0.012/0.02) are unaffected, which is why the defect was not noticed: it only hits rates that are
*derived* — divided by the 360-day year or composed with a bonus.

## Reproduction steps

1. Replicate `mixDayRoll`/`personDayRoll` from `src/game/simRng.ts:99-111` (three lanes, `SINGLE_DAY_PRIMES`, `hash % 10000 / 10000`).
2. Count `roll(id, day, salt) < 0.00012` over 20,000 ids × 360 days.
3. Observe ≈ 0.0002 (7.15% a year) instead of 0.00012 (4.32% a year).

## Evidence

- `src/game/simRng.ts:99-105` — `return (hash % 10000) / 10000;`.
- `src/game/dayCycle.ts:249-257` — `getOldAgeDeathChance` divides an annual rate by `DAYS_PER_YEAR`
  (360) and `HUMAN_DAILY_ILLNESS_CHANCE = 0.00012`.
- `src/game/simulation/humanRelationships.ts:891-892` — `MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE = 0.075`
  divided by `DAYS_PER_YEAR`.
- `src/game/simulation/humanRelationships.ts:860-876` — the mortality comparisons against salts 606
  and 607.
- `src/game/ecologyStage.ts:336-345` — the valley illness bonus that lands on the same bucket.
- Measurement: 7.2 M draws, 10,000 distinct roll values, min 0, max 0.9999; effective rates above.

## Root cause

The day-roll's integer reduction is fine-grained enough for large chances and too coarse for small
ones. No caller compensates for the grid, and no test measures an effective rate — the existing tests
assert the threshold or the presence of a distinct salt, not the probability the roll produces.

## Fix / proposed fix

Raise the resolution in `mixDayRoll` — `hash / 2 ** 32` (full 32-bit resolution) or
`% 1_000_000 / 1_000_000` — and add one test that measures an effective sub-bucket rate (the illness
constant is sufficient) instead of restating the threshold. Trade-off to accept deliberately: every
seeded run re-rolls, because each roll's value changes. This belongs in a release that accepts a new
deterministic baseline, not in a hotfix.

Secondary, optional: the amicable-divorce and youth-love passes still draw from the sequential
`getSimRng('humanRelationships')` stream, so their rolls depend on iteration order and on how many
draws earlier settlers consumed. Moving them to a salted `personDayRoll` would give every settler a
stable lane.

## Save/migration impact

None for stored state — no saved field changes. Only future rolls change, which alters the
deterministic outcome of a given seed from the fix onward.

## Verification result

- Reproduction: PASS — measured rates match `ceil(p · 10⁴) / 10⁴` within sampling noise.
- Fix: NOT IMPLEMENTED.
- Regression coverage: NOT RUN (no fix). A test that measures the effective illness rate over a
  fixed id/day range would fail on the current resolution and pass after the change.
