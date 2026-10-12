# Wolf attacks too frequent — one wolf hunt in three bit a hunter, ~1,080 attacks a year in the owner's colony: 2026-10-09

- Bug: the Hunting Spot fight-back fires on 35 % of wolf hunts, and it fires whether or not the hunter ever reached the animal — so a 40-spot colony reads ~3 wolf bites a day, every one with no decision attached, and the hunter's own trade skill does not change the odds at all
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0 (working tree)
- Reporter: owner, from play — *"the many wolf attacks are bit much"*, then *"a hunter with 100 skill should also get less change to get killed"*
- Area: Play
- Owner module: `src/game/huntingSpot.ts` (the fight-back odds and the fate bands), `src/game/dailyBuildingEconomy.ts` (the daily hunt that rolls them), `src/game/skills.ts` (the skill ceiling)
- Cadence: once per completed, staffed Hunting Spot per **production day** — the `isProductionTick(state.tick, PRODUCTION_INTERVAL.huntingSpot)` gate, which also skips rest days

## Status history

- 2026-10-09 — open (owner report; measured at 2.18 attacks/day across the exported chronicle and 3.00/day in their own save)
- 2026-10-09 — investigating (the naive `38 staffed spots × 0.35` predicted 13 attacks/day, 4× the measurement; instrumented the real denominator to find out which was wrong)
- 2026-10-09 — resolved (the fight-back chance 0.35 → 0.10, and the fatal band now narrows with the hunter's own hunting skill; both re-measured on the same save, same 12 days)

## Observed behavior

The owner's chronicle export (`wilderfolk-New-Frontier-chronicle (10).txt`, 8,038 events, settlement New Frontier, game year 3 day 183, population 1,643) holds **1,162 wolf-attack lines**: 1,049 `A wild wolf fought back at the Hunting Spot and bit <name>` and 113 `A wild wolf mauled <name> at the Hunting Spot`. They are 14 % of the whole chronicle and effectively all of its `[combat]` lines:

| Basis | Days | Attacks | Per day | Per 100 days |
| :--- | ---: | ---: | ---: | ---: |
| Chronicle Y2 (full year, days 0–359) | 360 | 682 | 1.89 | 189 |
| Chronicle Y3 (days 0–183) | 184 | 503 | 2.73 | 273 |
| Chronicle, both years | 544 | 1,185 | 2.18 | 218 |
| Owner save `Y3-D183`, run forward 12 days (before) | 12 | 36 | 3.00 | 300 |

The same chronicle holds only **20 wolf kills a year** and 13 `Hunting Spot bagged a wolf` lines in 544 days, while the owner's save stands at **40 completed Hunting Spots (38–40 staffed) against 4–9 wild wolves**.

## Expected behavior

A wolf that takes a hunter should be a rare, costly event, and the hunter's trade should be the thing that protects them. One hunt in ten turning on the hunter, with a trained hunter's fatal band a fifth of a novice's, is the cadence this report settles on: ~300 attacks a year in that colony instead of ~1,080, still with the owner's own 5 % fatal / 11 % injury bands underneath.

## Reproduction steps

1. Load the owner's save `wilderfolk-New-Frontier-Y3-D183.TXT` in-process (`parseSaveJson` → `loadGameFromParsed`), clear the restored `paused`, and tick 12 in-game days (`TICKS_PER_DAY` = 72).
2. Filter the new `eventLog` entries for `fought back at the Hunting Spot`, `mauled … at the Hunting Spot` and `was killed by a wolf`.
3. Before the change: 36 attacks in 12 days (31 bitten, 5 mauled, 3 killed). After: 10 (7 bitten, 3 mauled, 2 killed).
4. For the denominator, at each production tick evaluate the owner's own selection for every completed staffed spot — `findLiveAssignedWorker` + `huntingSpotTarget` — and count how many have a **wolf** as their target.

## Evidence

**The 4× expected-vs-observed gap, reconciled.** `38 staffed spots × 0.35 = 13 attacks/day` assumes every spot targets a wolf every day. The roll is per staffed spot per production day, but it only happens when `huntingSpotTarget` returns a Wolf (`dailyBuildingEconomy.ts:535,544`), and the instrumented denominator shows how rare that is:

- 360 staffed spot-days over the 12 days — 40 spots × 9 production days, not 12: `isProductionTick` also requires `isWorkDay` (`dayCycleClock.ts:109`).
- 100 of those 360 (27.8 %) had a wolf as the selected target — 4–9 wolves alive on the map, `HUNTING_SPOT_SEARCH_RADIUS_PX` 350 px of eyes and a **+160 px score penalty against a wolf** (`huntingSpot.ts:93-117`).
- 100 × 0.35 = 35 expected vs **36 observed** → implied chance **0.360**. The chronicle records every roll it produces (8,038 entries held, under the 20,000 `EVENT_LOG_MAX_ENTRIES` cap), so the count was never a partial log.

**Every wolf hunt in the window was out of kill reach:** `wolfTargetInReach = 0` of 100 before and 0 of 96 after. `foughtBack` is rolled at `dailyBuildingEconomy.ts:577` and never tests `inReach` (only the shot at `:592` does), so the wolf bites from up to the 700 px commitment radius while the hunter is still walking — which is also why the chronicle's 1.5 years contain 13 bagged wolves against 1,162 bites. Reported, not changed (this task's scope is the cadence and the skill mitigation).

**What the bite costs, and which constants decide it** — all in `src/game/huntingSpot.ts`:

| Constant | Value | Effect |
| :--- | ---: | :--- |
| `HUNTING_FIGHT_BACK_CHANCE` | 0.35 → **0.10** | the roll that decides whether the wolf turns at all |
| `HUNTING_FIGHT_BACK_BITE_ENERGY` | 140 | 28 % of a settler's 500-point bar |
| `HUNTING_FIGHT_BACK_MAUL_ENERGY` | 260 | a mauling costs 400 total, 80 % of the bar |
| `HUNTING_FIGHT_BACK_KILL_CHANCE` | 0.05 (owner's number, kept) | fatal band, now skill-scaled |
| `HUNTING_FIGHT_BACK_INJURY_CHANCE` | 0.11 (owner's number, kept) | maul band above the kill band |
| `HUNTING_FIGHT_BACK_SKILL_FLOOR` | **0.2** (new) | what skill 100 keeps of the fatal band |

Nothing else applies: the fight-back never reads settler combat strength, armour or the `predator_block` research — `combat.ts`'s `rollPredatorBlock` is used by the wildlife catch path in `tickLayerSystems`, not by the Hunting Spot — so before this change a hunter's gear and tech could not move the odds by a single point. The skill is now the lever the owner asked for: `huntingFightBackKillChance(skill)` is **linear from 0.05 at skill 0 to 0.01 at skill 100** (base × (1 − skill/100 × 0.8), floor 0.2). The injury band keeps its 11-point width above the kill band, so a roll the skill saves becomes a **mauling**, never a free pass.

**Consequence per year, before and after** (owner save basis: 30 staffed spot-days a day × 360 days = 10,800 spot-days and ~3,000 wolf-target spot-days a year):

| Per 360-day year | Before (0.35) | After (0.10) |
| :--- | ---: | ---: |
| Wolf attacks (hunter bitten) | ~1,080 | ~300 |
| Fatal bites, untrained hunter | ~52 | ~15 |
| Fatal bites, skill-100 hunter | ~11 | ~3 |
| Maulings | ~115 | ~33 |
| Ordinary bites (energy only) | ~880 | ~250 |
| Spot-days whose hunt the bite cancelled | ~1,080 of 10,800 (10.0 %) | ~300 (2.8 %) |

**The mitigation will barely show yet.** The owner's census of their own save — 106 hunters, mean hunting skill **2.0**, none above 90 — puts the fatal band at 0.0492 against 0.05 today, a 1.6 % relative change. It becomes visible only once hunters actually accrue trade skill (being fixed elsewhere); the curve is deliberately not tuned to compensate for that.

**Hunting spots deplete nothing today** — the loop that would give 40 spots a real cost does not exist. A catch removes one animal (`markWildlifeDead`), and that is the only depletion: breeding is density-dependent and *pro-natalist* (`capacityFactor = 1 − count/maxPop` with a 1.55× `scarcityBoost` below 25 % of the cap and 1.25× below 45 % — deer cap 60, rabbit 120, wolf 25, `tickLayerSystems.ts:759-773`), so culling raises the birth rate; refills also arrive free from random events (`deer_migration`, +4 deer, weight 8 — `groupEvents.ts:1629,1751`). No carrying capacity, spawn rate or penalty is tied to the harvest.

## Root cause

The fight-back is a flat per-hunt roll with no reference to the hunter: `HUNTING_FIGHT_BACK_CHANCE = 0.35` was carried over from the pre-2026-09-30 branch (which took 12 health off the *building*) and never revisited when the bite moved to the hunter, while the colony's Hunting Spot count is what multiplies it — 40 spots × ~28 % of production days with a wolf in range × 0.35 ≈ 3 attacks a day, in a colony of 1,643. The consequence was also fire-and-forget: 84 % of bites cost only energy the settler regenerates, and the 5 % fatal band was identical for a day-one hunter and a master.

## Regression test

`tests/huntingFightBack.fate.test.ts` — the cadence test replays the call site's own shot key (`hunt:<building>:<tick>:<prey>:fight`, 10,000 keys) through the production roll and asserts the bite share is 5–15 %, so the old one-in-three fails and a zeroed constant fails too; three further cases pin the skill curve (`huntingFightBackKillChance(0)` = 0.05, `(100)` = 0.01, master / novice < ⅓), the downgrade (`skill: 100` turns a killing roll into a mauling and never past a bite) and the measured fatal share at each end of the range. Proven red before the change: with the constant temporarily back at 0.35 and the fate band flat again, 3 of the 9 tests fail (`turns on the hunter in about one wolf hunt in ten`, `downgrades a killing roll…`, `measures the fatal odds…`); restored, 9 of 9 pass. One pre-existing line needed a lambda — `rolls.map(huntingFightBackFate)` would have fed the array *index* in as the skill, so the fate function takes a named `{ skill }` context and the compiler rejects the bare callback.

## Invariants checked

- Band ordering holds for every skill: `killChance(skill) < killChance(skill) + 0.11 ≤ 0.16`, and all three fates stay reachable at both ends.
- The fatal band is monotone non-increasing in skill, bounded below by the 0.01 floor.
- A more skilled hunter is never worse off on the same roll (a kill can only become a mauling or a bite).
- The hunt still resolves exactly one fate per fight-back, on the same stateless per-shot key.

## Save/migration impact

None. `HUNTING_FIGHT_BACK_CHANCE`, the fatal band and the skill curve are rules, not saved values; no save field is added or written. `WorldState` is untouched, so existing saves load and behave under the new odds.

## Verification result

- `npm run test:types` — **PASS** (tsc, `tsconfig.vitest.json`, 1 step, 8.9 s).
- `node scripts/check-comments.mjs` — my comments clean (the one remaining failure is `tests/workSkillAttribution.accrual.test.ts:4`, another agent's concurrent edit, untouched).
- `npx vitest run tests/huntingFightBack.fate.test.ts tests/huntingSpot.cleanup.test.ts tests/huntLogic.test.ts tests/huntVisuals.origin.test.ts tests/huntVisuals.lifecycle.test.ts tests/foodLedger.acceptedCatch.test.ts tests/valleyChronicle.foodLedger.test.ts tests/singleOwner.predicates.test.ts tests/combatTierEffects.test.ts tests/low-5-combat-ecology.test.ts tests/low-9-simdata.test.ts tests/moonHowler.test.ts` — **PASS** 12 files / 95 tests.
- `npm run lint` — **PASS**, 0 warnings 0 errors.
- `npm run audit:deps` — **PASS**, import-cycle gate OK (the one pre-existing cycle does not involve the new `huntingSpot → skills` edge).
- Re-measured on the same save, same 12 days, same probe: **36 → 10 attacks**, 3.00 → **0.83/day** (−72 %), with the denominator essentially unchanged (100 → 96 wolf-target spot-days of 360 staffed spot-days) and the implied chance landing on the new constant: **0.104** against 0.10.
- `npx tsx scripts/run-full-year.mts --scenario=producers --days=200` — **PASS**, `colony=healthy`, 0 invariant violations, 421 event-log entries and **0 wolf lines**; the scenario's plan raises no Hunting Spot at all, so it cannot exercise this rule (harness coverage gap — the evidence here is the owner's own save).

## Related commits or files

- `src/game/huntingSpot.ts` — `HUNTING_FIGHT_BACK_CHANCE` 0.35 → 0.1; new `HUNTING_FIGHT_BACK_SKILL_FLOOR` and `huntingFightBackKillChance`; `huntingFightBackFate` takes a `{ skill }` context
- `src/game/dailyBuildingEconomy.ts` — the daily hunt passes `readSkill(hunter, JobType.Hunter)` to the fate roll
- `src/game/skills.ts` — `MAX_SKILL = 100`, now the one definition of the skill ceiling (`gainSkill` uses it)
- `tests/huntingFightBack.fate.test.ts` — the cadence and skill guards
- [2026-10-06 register](../BUG_REPORTS/SUMMARY.md) — the owner's 5 % / 11 % bands this build keeps

## Fix

`HUNTING_FIGHT_BACK_CHANCE` is 0.1 — one wolf hunt in ten turns on the hunter instead of one in three — and the fatal band now scales with the hunter's own trade: `huntingFightBackKillChance(skill)` runs linearly from the owner's 5 % at skill 0 down to 1 % at skill 100, with the injury band unchanged above it so a saving roll becomes a mauling. Measured on the owner's save over the same 12 days: 3.00 → 0.83 attacks/day (36 → 10), implied fight-back chance 0.360 → 0.104.
