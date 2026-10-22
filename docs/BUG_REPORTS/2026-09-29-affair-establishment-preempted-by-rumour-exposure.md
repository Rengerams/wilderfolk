# 2026-09-29-affair-establishment-preempted-by-rumour-exposure

- Bug: An affair could never be established in a village with a church — a rumour exposed the pair at 45 % progress and `clearAffairPair` reset the progress it interrupted, so the whole drama chain downstream of establishment was dead
- Status: resolved
- Date discovered: 2026-09-29
- Version/build: 0.6.5.0 (owner save `wilderfolk-New-Frontier-chronicle.txt`, game v0.6.5.0)
- Reporter: owner play report ("things are not balanced and some are totally missing like affairs"), diagnosed from the owner's exported chronicle
- Area: Play | Truth
- Owner module: `src/game/simulation/humanRelationships.ts` (`tryDailyAffairGossip`, `findAffairLover`)
- Cadence: daily — the new-calendar-day gate in `humanTick.ts`

## Status history

- 2026-09-29 — open (owner reported missing affairs; the exported chronicle was read and counted)
- 2026-09-29 — resolved (gate added; regression test proved red-before/green-after; full suite re-run)

## Observed behavior

The owner's New Frontier chronicle (2000 entries, Y0 D198–D279) contains:

| Line in the chronicle | Count |
|---|---|
| `Whispers spread about X and Y` (a rumour) | **145** |
| `X began a secret affair with Y` (establishment) | **0** |
| `X was caught with Y` (caught in the act) | **0** |
| `X was imprisoned for scandal` | **0** |
| `A feud is brewing between …` | **0** |

Affairs were happening — 145 of them were rumoured — but **not one ever completed**. Every consequence the mechanic advertises was absent from 82 days of play.

## Expected behavior

A pair's tryst progress accumulates to `AFFAIR_PROGRESS_MAX` (100) and the affair is established (`affairPartnerId` set both ways, *"began a secret affair"* logged). Only an **established** affair can be exposed, per the two written contracts:

- `src/game/gameConstants.ts` — *"an affair is established only when both partners reach AFFAIR_PROGRESS_MAX — only establishment can produce a scandal"*
- `tests/affair.cadence.test.ts` — *"No scandal artifacts either — exposure requires an established affair."*

Once established, a rumour or a walk-in ends it: scandal, arrest, imprisonment, the forced divorce, and the feud that `startFeud` has no other caller for.

## Reproduction steps

1. Load a village that has a completed Church (`churchStrength > 0`).
2. Let two married/eligible settlers build tryst progress past 45.
3. On any later daily gate, `tryDailyAffairGossip` rolls 0.12–0.22 and calls `exposeAffair(..., 'rumor')`.
4. `exposeAffair` → `clearAffairPair` sets **both** partners' `affairProgress` to 0. The climb restarts and is wiped again; 100 is never reached.

## Evidence

Owner chronicle counts above. Confirmed by **A/B on the real engine** — same seeded colony, same 360 days of shipped `gameTick`, **60 completed houses placed first** (see the housing note below), a completed staffed church as the other difference, the whole run repeated against the pre-fix source (`humanRelationships.ts` + `humanTick.ts` restored from HEAD):

| | before, no church | before, **church** | after, no church | after, **church** |
|---|---|---|---|---|
| population | 103 | 144 | 130 | 104 |
| `affairsEstablished` | 50 | **17** | 130 | **81** |
| `"Whispers spread"` | 291 | **414** | 10 | **21** |
| `"was caught with"` | 38 | 8 | 105 | 49 |
| `"imprisoned for scandal"` | 29 | 6 | 65 | 35 |
| `"A feud is brewing"` | 36 | 8 | 97 | 44 |
| forced-divorce lines | 71 | 16 | 190 | 82 |
| **rumours per establishment** | 5.82 | **24.35** | 0.08 | **0.26** |

The church column is the owner's configuration, and it is the defect in one number: **24.35 rumours per completed affair** before, **0.26** after.

**Housing is the variable that decides this bug, and my first A/B did not control it.** That run used the shipped `prepareColonyWorld`, which puts 8 houses under 21–70 people, so most settlers were homeless — and a homeless settler passes the encounter's gates *for the wrong reason*, because `isAtMaritalHome` is false when there is no home. The under-housed church column read 7.56 rumours per establishment; housed, the same seed reads **24.35**. This is also why the owner's save could show a flat 0 while a gate colony showed dozens: New Frontier is well housed.

**Three measurement errors in my own probes, each of which produced a false reading — all the same class as the gate counter below.** (1) The first harvested only `type === 'scandal'`, but `"X was imprisoned for scandal"` is logged as `'event'` by `arrestForScandal`, so imprisonments always read 0. (2) Its "staff the church" step picked the first adult founder — exactly the starter **Prison Guard** that `prepareColonyWorld` assigns — so the church arm had no guard and `arrestForScandal` (`countGuardsAtPrison > 0`) could never fire. (3) It was under-housed, i.e. measuring a different regime. Corrected, the church column imprisons **6 → 35**. This answers the owner's *"the church doesn't imprison"*: the church never blocked imprisonment — **nobody was ever caught, because no affair ever established**, and `arrestForScandal` is reachable only from the `'caught'` path.

## Root cause

**Two independent defects, and fixing only the first still leaves a housed village with no affairs.**

**(1) Exposure pre-empted establishment.** `tryDailyAffairGossip` used exposure floors of **45** (church) and **85** (no church) while establishment requires **100**, and `exposeAffair` ends the pair by zeroing both partners' progress. Exposure therefore beat establishment to the punch, and the 2026-09 rebalance that halved the daily tryst chance (0.14 → 0.07 with a church, 0.20 → 0.10 without) widened the window in which exposure could win. Because `hasAffairPartner` is set only at establishment, every downstream gate — `tryExposeCaughtAffairForPair` (both call sites), `arrestForScandal`, the imprisonment line, `tryDivorceOnCaughtCheater(..., caughtInAct = true)` and the game's only `startFeud` caller — was unreachable. The church did not suppress affairs as intended; it deleted them.

**(2) Establishment was only ever evaluated at midnight, for the whole settlement at once.** `tryDailyAffairEncounter` is the sole writer of `affairPartnerId`, and it ran on the global `isNewCalendarDayTick` gate — `getTickOfDay(tick) === 0`. At 00:00 it cannot pass its own gates: `canPursueSecretAffair` returns false on `isSpouseNearby` (22 px), which is true for a housed couple asleep in the same room, and `isAtMaritalHome` is true besides. So the single daily sample was taken at the one hour of the 24 that a housed married settler is guaranteed to fail — worst precisely in the well-housed village the mechanic is about. This half is independent of (1): with the gossip gate fixed, a housed church village still produced 0.

## Fix

`tryDailyAffairGossip` now returns unless `hasAffairPartner(entity, entityById)` — an established affair — before rolling, and `findAffairLover` resolves only an established mutual lover (its progress ≥ 45 scan is deleted with the floors). The church branch keeps its own roll and salt (602; 0.12/0.22) and the no-church branch its own (601; 0.06), so seeding does not move which days already gossiped.

## Regression test

**None ships, deliberately.** Two attempts were written and both were deleted rather than left in the tree:

- A `tryDailyAffairGossip` fixture test (cheater and paramour at 95 progress, church, a passing gossip day). It *did* prove red-before — against the pre-fix source it failed with `expected [ { id: 2, tick: 1254, …(6) } ] to have a length of +0 but got 1` — but it **hand-set `affairProgress = 95`**, i.e. it manufactured the very precondition this report is about. That is the same defect as the guard it was replacing: it can only test the code against a world the test itself invented. Owner ruling: no fake tests.
- A bot-played integration test (real `initGame`, real `gameTick`, `shouldVirtualPlayerAct` → `decideVirtualPlayerAction` → `applyWorkerCommand`). It was the right *shape* but the wrong *tier*: it hand-placed the starter world, took **214 s** for a single assertion, and failed because the bot never builds the church the branch needs.

The honest replacement is bot play in the browser/auto-play tier (`scripts/autoplay-*.mjs`, which do play the real game) over enough in-game days to reach an establishment, with the church question settled first — see the coverage gap report. Until then this fix is guarded by the A/B above and by nothing automated, and that is stated rather than papered over with a fixture.

## Verification result

- **A/B on the real engine, housed** (the substantive evidence): church column **24.35 → 0.26** rumours per establishment; establishments **17 → 81**; rumours **414 → 21**; caught **8 → 49**; imprisoned **6 → 35**; feuds **8 → 44**; forced divorces **16 → 82**. The "before" arm is the HEAD source; the "after" arm is this change and nothing else.
- `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.vitest.json --noEmit` — exit 0
- `npm run lint` — 0 warnings / 0 errors
- `npm run test:standard` — **242 files / 1477 passed, 2 skipped, 0 failed** (the cadence, exposure, age-floor, tryst-site and virtual-player suites all still green; `tests/affair.cadence.test.ts` needed no edit because its fixture has no buildings, so the tryst-site validator already refused a tryst — verified by running it against the changed call site)
- `npx vitest run tests/fullYear.integration.test.ts` — passes (360 days / 25,920 ticks, no invariant violations)
- **Not verified:** a replay of the owner's own village. Only the chronicle `.txt` export was supplied, not the save JSON, so the exact New Frontier world could not be loaded and re-run.

## Cadence note

The encounter's call site moved from the `isNewCalendarDay` gate to a per-settler hour, but the **decision is still once per settler per day at the same chance** — `personDayRoll` is keyed on `(entity, colony day, salt)`, so staggering changes only *when* the conditions are sampled, not how often or how likely. `decisionRegistry.ts` already declared `affairs` as *"staggered/daily"*; the implementation was the part that was not staggered. No save field was added, so there is no schema, `simDelta` or invariant change.

## Related commits or files

- `src/game/simulation/humanRelationships.ts` — exposure gate added; `findAffairLover` narrowed (its 45-progress scan deleted with the floors it served); `affairEncounterHourOfDay` added (06:00–19:00, derived from `NIGHT_END`/`NIGHT_START`)
- `src/game/humanTick.ts` — the gossip call site updated; the encounter moved off the `isNewCalendarDay` gate to the per-settler hour
- `src/game/virtualPlayer.ts` — comment only: records why a Church is **not** in `CIVIC_BUILD_ORDER` and that adding it was tried and reverted (it broke 36 of 68 bot cases)
- `tests/affairEstablishment.reachability.test.ts` — written, then **deleted**: a fixture test that hand-set `affairProgress`, i.e. the same manufactured precondition this report criticises
- `tests/affair.churchVillage.integration.test.ts` — written, then **deleted**: right shape (real `initGame` + real bot + real `gameTick`) but 214 s for one assertion and the bot never builds the church it needs
- `tests/affairCaught.reachability.test.ts` — **deleted** at the owner's instruction; it claimed to be this chain's reachability guard while hand-setting `affairPartnerId` / `affairProgress = 60`, so it could not fail for the reason it named. Untracked (`tests/**` gitignored); verbatim copy at `tmp/deleted-tests/affairCaught.reachability.test.ts`
- `BUG_REPORTS/2026-09-29-automated-runs-never-build-a-church.md` — why no automated gate could see this
