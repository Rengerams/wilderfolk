# A church accelerated courtship — the opposite of its role everywhere else: 2026-09-17

- Bug: a stronger church made courtship *faster* (`4 + churchStrength * 2`, up to +50 %), so the one
  institution that restrains romance everywhere else in the simulation sped it up here
- Status: resolved
- Date discovered: 2026-09-17
- Version/build: 0.6.4
- Reporter: owner, from design review ("church is against courting")
- Area: Truth (simulation rule)
- Owner module: `src/game/simulation/humanRelationships.ts` (courtship), `src/game/gameConstants.ts`
- Cadence: per-tick (courtship advance), daily (cooldown)

## Status history

- 2026-09-17 — open (owner ruling during the balance review of the courtship findings)
- 2026-09-17 — resolved (church removed from the courtship rate entirely; work-shift rate cut; a
  1-day post-courtship cooldown added from the courtship system itself)

## Observed behavior

`humanTick.ts` computed the per-tick courtship advance as:

```ts
const courtRate = (4 + churchStrength * 2) * <festival/performers/cohabitation/traits> * PER_TICK_RATE_SCALE;
```

with `churchStrength ∈ [0, 1]` (`workforce.getChurchStrength`). A full-strength church therefore raised
the base from 4 to 6 per in-game hour, i.e. **96 → 144 progress per 72-tick day** against the 100
needed to marry — courtship completed *faster* in a pious village.

That contradicts every other church effect in the same subsystem, where the church restrains:

| system | church effect | source |
|---|---|---|
| affair tryst chance | `0.07` with vs `0.1` without | `gameConstants.ts` `AFFAIR_DAILY_TRYST_CHANCE_*` |
| affair chance factor | full church leaves `0.72` of base | `AFFAIR_CHURCH_FLOOR_FACTOR` |
| affair caught chance | `0.14` with vs `0.08` without | `humanRelationships.ts` `caughtAffairRollChance` |

## Expected behavior

A church has no part in courtship pace. Courtship should be full rate during the settlers' social life,
much lower while they are working, and a courtship or marriage that ends should leave a short cooldown
so a settler cannot divorce and remarry inside two days.

## Reproduction steps

1. Build a village with a staffed Church (`churchStrength` 1) and two eligible single settlers.
2. Let them court: progression reaches 100 in ~17 in-game hours instead of ~25 (144 vs 96 per day).
3. Compare with the same village and no church.

## Evidence

- `humanTick.ts` — `(4 + churchStrength * 2) * … * PER_TICK_RATE_SCALE`, with
  `PER_TICK_RATE_SCALE = 1 / TICKS_PER_HOUR = 1/3` (`dayCycleClock.ts`) and `TICKS_PER_DAY = 72`.
- `humanRelationships.ts` — the affair-side church maths reduces, never increases, the relevant chances.
- Owner ruling 2026-09-17: "church is against courting"; "keep the church outside the courting".

## Root cause

The courtship coefficient was written with the same shape as the affair coefficients but with the wrong
sign: the affair system multiplies *down* toward a floor when a church is strong, while courtship added
the church strength. Nothing tested the sign, because no test covered courtship pace at all.

## Regression test

`tests/courtship.churchRestraint.test.ts` (4, behavioural on the owner's pure rate function):
`courtshipRatePerHour(true)` is the full base rate; `(false)` is the work-shift factor; the base is
4/hour and 0.6/hour on shift (96 and 14.4 per day); `PER_TICK_RATE_SCALE` is `1 / TICKS_PER_HOUR`.
The rate function takes only `socialTime`, so a church cannot re-enter the formula without changing the
signature the test pins.

## Invariants checked

Simulation behaviour changed deliberately; the 360-day gate still passes and
`audit:deps:cycles:strict` is green (323 modules), so no owner or cadence rule was broken.

## Save/migration impact

None. `courtshipCooldownDays` is a new optional entity field, carried in `simDelta`'s catalog patch keys
and scaled like the other tick/day fields; an old save without it reads `undefined` → no cooldown, which
is the previous behaviour.

## Verification result

`test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 · `npm test` 171 files / 919 tests
passed · `audit:deps:cycles:strict` exit 0 · `npm run test:full-year` exit 0 (360 days, seed 12345).

## Related commits or files

- `src/game/humanTick.ts` — the courtship block (rate, work window, chase guard)
- `src/game/simulation/humanRelationships.ts` — `courtshipRatePerHour`, `startCourtshipCooldown`,
  `isEligibleToCourt`, `reconcileCourtships`
- `src/game/gameConstants.ts` — the `Relationship.COURTSHIP_*` constants

## Fix

- The church is **removed from the courtship rate**: the base is the flat
  `Relationship.COURTSHIP_BASE_RATE_PER_HOUR = 4` (4/hour = 96/day), and the church's moral role stays
  where it belongs, in the affair constants.
- **Work-shift courting** is allowed but cut by `COURTSHIP_WORK_RATE_FACTOR = 0.15` (0.6/hour = 14.4/day
  at best), and a working settler never walks off the shift to close the distance — at work a pair only
  advances when already beside each other.
- **A 1-day cooldown** (`COURTSHIP_COOLDOWN_DAYS`) is applied by the courtship system itself when a
  courtship dissolves (`reconcileCourtships`) or a marriage ends (all three `dissolveMarriage` sites),
  and counted down once per colony day. `isEligibleToCourt` gained one gate for it, with no tick
  parameter and no caller changes.

Balance measured on the 360-day gate (seed 12345), marriages/divorces/caught scandals:
cooldown **0 → 65/50/25**, **1 day → 69/58/29**, **3 days → 54/39/19**. A single seed cannot attribute
those differences (behaviour changes shift every later RNG draw — the 1-day row out-churning the 0-day
row is that drift), so 1 day was chosen on structure rather than on totals: it is the shortest cooldown
that still forces a clear day between a divorce and a remarriage, and it shrinks the dating pool least,
which is the fun-over-realism direction the owner asked for.
