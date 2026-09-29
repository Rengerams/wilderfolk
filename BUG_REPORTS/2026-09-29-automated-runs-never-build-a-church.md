# 2026-09-29-automated-runs-never-build-a-church

- Bug: No automated run in the repository ever builds a Church — the only year-long gate runs a frozen 18-building skeleton and never constructs anything, so it measures `churchStrength` 0 forever and cannot see any rule that branches on a church
- Status: open
- Date discovered: 2026-09-29
- Version/build: 0.6.5.0
- Reporter: found while diagnosing `2026-09-29-affair-establishment-preempted-by-rumour-exposure.md`
- Area: Truth (gate coverage) — not a gameplay defect
- Owner module: `scripts/colonyHealth.ts` (`prepareColonyWorld`), `scripts/run-full-year.mts`, `src/game/virtualPlayer.ts`
- Cadence: n/a

## Status history

- 2026-09-29 — open (found while proving the affair bug in the real engine; deliberately **not** fixed in that change, because widening the gate's world changes what every existing recorded run means and is the owner's call)

## Observed behavior

A 360-day `run-full-year.mts` run reports the same building count at every checkpoint:

```
day  30  buildings= 18  settlers= 21  food= 4800  wood= 2000
day 180  buildings= 18  settlers= 58  food= 4800  wood= 2000
day 360  buildings= 18  settlers= 70  food= 4800  wood= 2000
```

**Nothing is ever built, and food/wood are pinned at exactly 4800/2000** (the `restocked` scenario refills to `storageMax` at every 30-day checkpoint). The owner's played save, by contrast, logged **80 `building` events** over 82 days.

## Expected behavior

A gate that claims to measure a year of colony health should exercise the decisions a player actually makes — above all **building**, which is the input every other system reads (housing, staffing, production, and every building-gated rule).

## Reproduction steps

1. `npx tsx scripts/run-full-year.mts --years=1 --seed=12345`
2. Read `buildings` at each `full-year-checkpoint` line in `docs/log/full-year-*.jsonl` — it is 18 from the first checkpoint to the last.

## Evidence

- `prepareColonyWorld` places a fixed **completed** skeleton and nothing else: `STARTER_HOUSE_COUNT = 8` houses + Tavern + Prison + `STARTER_STORAGE_COUNT = 8` (Barn/Silo) = **18**, all `createCompletedBuilding`. In the `restocked` scenario not even the producers (4 Farms, Lumber Mill) are placed.
- **The year gate has no player and no bot.** Neither `scripts/run-full-year.mts` nor `scripts/colonyHealth.ts` contains any construction call, `startBuilding` command, or import of the bot (a `grep` for `queueConstruction|buildingQueue|startConstruction|proposeBuild|virtualPlayer` **scoped to those two files** returns nothing).
- **The bot does genuinely play, and it is not the gate.** `scripts/autoplay-probe.mts`, `scripts/autoplay-food-probe.mts` and `scripts/autoplay-rules-probe.mts` drive the real decision engine (`decideVirtualPlayerAction` → `applyWorkerCommand`) against real `initGame`/`gameTick` worlds, and the bot does build. They are short and disposable, though — `autoplay-probe.mts` runs **300 ticks (~4 days)**, `autoplay-food-probe.mts` **30 in-game days**, `autoplay-rules-probe.mts` answers single decisions on synthetic worlds — and all three are headed *"Temporary probe (local-only, gitignored, safe to delete)"*, so none of them is a standing gate.
- **None of them builds a church, and the bot will not ask for one.** `src/game/virtualPlayer.ts:359` says *"(Church, Prison, Barracks, School, Town Hall) — those stay the player's call"*, and `CIVIC_BUILD_ORDER` is `[TownHall, Blacksmith]`. A Church was added to that ladder on 2026-09-29 and **reverted**: because step 6 precedes roads, militia, diplomacy and refugee screening, a church the colony can afford (45 wood / 35 stone / 20 gold) shadowed every later decision and broke **36 of 68** cases in `tests/virtualPlayer.test.ts`. Closing this gap therefore means changing the ladder's *order*, not just its contents.
- Consequence, measured: `getChurchStrength` is **0** in every long automated run, while a played village has a church (`getChurchStrength` returns 0.5 unstaffed, 1 staffed). The affair bug lived entirely in the `churchStrength > 0` branch of `tryDailyAffairGossip`, so no automated run could have detected it. A/B on the real engine over 360 days: the church column produced **7.06 rumours per establishment** pre-fix against **0.32** post-fix, while the no-church column moved 1.89 → 0.13 — the played village is the one that read 145 rumours to 0 establishments.

## Root cause

The gate's world is hand-provisioned rather than played. Building is the player's decision, and the harness has no player and does not use the bot that could act as one, so the year run freezes the built environment at day 0 and the economy is cancelled by restocking. Every rule gated behind a building the player erects (Church, School, Hospital, barracks line) is structurally unmeasured.

## Recommendation (not applied — owner's call)

Pick one, and record which:

1. **Give the gate a church** — add `BuildingType.Church` to `prepareColonyWorld`'s skeleton (staffed and unstaffed variants), so both gossip branches are exercised. Smallest change; immediately makes the affair bug class visible.
2. **Wire the bot into the year run** — drive `decideVirtualPlayerAction` each hour as `scripts/autoplay-*.mts` does, over 360 days, so the run actually builds, staffs and repairs. Closest to a played game; changes every recorded run's numbers and is much slower.
3. **Both**, with the bot extended to build the civic tier it currently leaves to the player.

Two smaller defects found in the same gate and worth folding into whichever route is chosen:

- `scripts/colonyHealth.ts:419` — `if (message.includes('rumor')) totals.rumorScandals += 1;` can never match: the rumour line is `Whispers spread about X and Y` and never contains the word "rumor". The gate's own report therefore printed `rumorScandals: 0` for a year in which 88–115 rumours actually fired. It should test the message the owner writes (or classify by the `exposeAffair` reason rather than by string).
- `scripts/colonyHealth.ts:422` — `if (message.includes('divorc')) totals.divorces += 1;` counts **any** event whose text contains "divorc", including the amicable-divorce and forced-divorce variants, so the total is not the marriage-ended count it reads as.

## Regression test

None — a coverage gap in a harness, not a simulation rule. `tests/affairEstablishment.reachability.test.ts` now pins the rule that the gap hid.

## Verification result

n/a (open)
