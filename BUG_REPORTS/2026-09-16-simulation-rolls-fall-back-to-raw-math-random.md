# Simulation rolls silently fell back to raw `Math.random`, so a seeded run stopped reproducing

- **Bug:** ten simulation rules declared `rng: () => number = Math.random`, and every production caller omitted the argument, so a rival's daily action, a rival's answer to a raid, schoolyard gossip and bonds, youth love, and the daily **amicable divorce** drew from the global `Math.random` instead of a `simRng.ts` owner stream — outside the per-domain streams that `snapshotSimRng`/`restoreSimRng` persist, and native (irreproducible) whenever the seeded global override is missing or has backed off
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** owner directive (“math random should be replaced with rng from simrng.ts”), found while reading the no-scandal divorce path the owner asked about
- **Area:** Truth (simulation determinism, save/restore of RNG position)
- **Owner module:** `src/game/simRng.ts` (owner streams); call sites in `src/game/simulation/humanRelationships.ts`, `src/game/moonHowler.ts`, `src/game/rivalProfiles.ts`, `src/game/frontierCombat.ts`
- **Cadence:** per tick (schoolyard rules, youth love), per colony day (amicable divorce, rival daily action), per moon cycle (`tickMoonHowlerCycle` callers already inject a stream)

## Status history

- 2026-09-16 — open (reading `tryDailyAmicableDivorce` for the owner's “is there an option that they divorce without a scandal?” question showed the caller at `humanTick.ts:385` passes no `rng`, so the function's `= Math.random` default was the live stream; a repository-wide scan found nine more)
- 2026-09-16 — resolved (every default now resolves to its owner stream; a source guard pins `Math.random(` out of `src/`; suite, type, lint, build and the 360-day seeded gate green)

## Observed behavior

Ten rules drew from the global `Math.random` rather than from their domain's owner stream. Which RNG that actually was depended on the host:

- in a normal game or headless run, `worldGen.ts:521-522` has already run `setSimSeed(mapSeed)` + `enableSeededGlobalRandom()`, so the draws came from the single shared `__global__` Mulberry32 stream — seeded, but order-coupled with every other global draw and not part of any domain's stream;
- in any context where that override is absent or refused, they were **native**: `enableSeededGlobalRandom()` returns early when `Math.random !== NATIVE_MATH_RANDOM` (`simRng.ts:242`) so it never clobbers a test spy or a patched host, and before a world exists the override is not installed at all.

Concretely, for the two rules the owner was looking at:

- `humanTick.ts:385` calls `tryDailyAmicableDivorce(state, entity, entityById, updatedBuildings, playerHumans)` with no `rng`, so the “one roll per couple per day” happened on the global RNG.
- `rivalEvents.ts:232` calls `selectRivalDailyAction(profile, rival.relationship)` with no `rng`, and `frontierCombat.ts:1285` calls `rollRivalOutgoingRaidResponse(attackerStrength, rivalDefense, rival)` with no `rng`.

## Expected behavior

Every simulation roll comes from a named owner stream in `simRng.ts` (`humanRelationships`, `moonHowler`, `rivalProfiles`, `frontierCombat`, …), so the same seed reproduces the same world, `snapshotSimRng` captures the position of the stream the rule actually uses, `restoreSimRng` resumes it, and a replaced or spied-on `Math.random` cannot change a simulation outcome. The injectable `rng` parameter stays, so a test can still force an outcome.

## Reproduction steps

1. `npx vitest run tests/simRng.seededDefaults.test.ts` against the old code: the first two cases fail because the `rivalProfiles` / `humanRelationships` owner stream is never created (`snapshotSimRng().owners` has no such entry), and the source guard reports the ten offending `Math.random(` lines.
2. Deterministic render of the native case: replace `Math.random` (as a test spy or a patched host does), then call a defaulted rule `selectRivalDailyAction(profile, 'neutral')` — before the fix the outcome follows the patch and no owner stream is created; after the fix the rule is unaffected (pinned by the fourth test case).

## Evidence

- Scan of the working tree before the fix (outside `simRng.ts` itself): `humanRelationships.ts` ×4 (lines 380 `trySchoolyardGossip`, 415 `tryFormSchoolyardBond`, 560 `advanceYouthLove`, 893 `tryDailyAmicableDivorce`), `moonHowler.ts` ×4 (123 `rollMoonHowlerRiteOutcome`, 150 `shouldApplyNewMoonHowlerCurse`, 569 `tryMoonHowlerChurchCures`, 838 `tickMoonHowlerCycle`), `rivalProfiles.ts` ×1 (`selectRivalDailyAction`), `frontierCombat.ts` ×1 (`rollRivalOutgoingRaidResponse`).
- Caller audit: the four `humanRelationships` sites are called from `humanTick.ts:385/400/401` and `tickLayerDaily.ts:45` without an `rng`; `selectRivalDailyAction` from `rivalEvents.ts:232`; `rollRivalOutgoingRaidResponse` from `frontierCombat.ts:1285`; the Moon Howler production path (`tickLayerRealtime.ts:98-107`) *does* pass `getSimRng('moonHowler')`, so those four defaults were latent.
- The global override is not a substitute: `worldGen.ts:520-522` installs it per world (`enableSeededGlobalRandom`), `simRng.ts:241-246` installs one shared `__global__` stream and refuses to install it over an already-replaced `Math.random`, and `snapshotSimRng`/`restoreSimRng` only carry `streams` entries plus that one optional global — so a native draw is outside both.
- Precedent for the fix in the same tree: `nameLoader.ts:263` (“Seeded rather than `Math.random`: a settler's name is part of the world state … roadmap T3's remaining site”) and `dailyPopulation.ts` (`rng: RngStream = getSimRng('dailyPopulation')`).

## Root cause

`rng: () => number = Math.random` is a defensible signature for a testable helper, but as a *production* default it silently substitutes the global RNG for the seeded owner stream at every call site that omits the argument — and every call site did. The refactor that moved these systems onto `simRng.ts` owner streams converted the inline `Math.random()` calls inside the function bodies but left the default parameters behind, so those rules leaned on the shared `__global__` stream (`worldGen`) or on the host's native RNG when that override was absent or declined.

## Regression test

`tests/simRng.seededDefaults.test.ts` (4 tests):
- `selectRivalDailyAction(profile, 'neutral')` creates and advances the `rivalProfiles` owner stream when no `rng` is passed (two calls advance it twice);
- `tryDailyAmicableDivorce(world, husband, …)` on a married couple creates the `humanRelationships` owner stream when no `rng` is passed;
- the same seed reproduces the same divorce decision on a fresh world;
- a replaced global `Math.random` (the native case above) does not steer the rule — the owner stream is still the source;
- repository guard: no `.ts`/`.tsx` file under `src/` other than `simRng.ts` contains `Math.random(` — the guard reports the offending paths and lines.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant assertions satisfied, and two consecutive runs finished with identical totals (births 35, conceptions 29, marriages 53, divorces 36, affairs established 53, scandal exposures 100, scandal events 200, caught scandals 21, imprisonments 14, settlers 77). `npm run audit:deps:cycles` — no new edge (only `rivalProfiles → simRng` was added).

## Save/migration impact

None. No save key, field, format or version changed. A loaded colony is slightly better off: the owner streams these rules now use are the ones `snapshotSimRng` already persists per owner, so a resumed run continues those draws from the saved position instead of leaning on the single `__global__` counter.

## Verification result

- `npx vitest run tests/simRng.seededDefaults.test.ts` — passed (5 tests).
- Targeted set (17 files / 113 tests: rival profiles, combat ecology, school bonds/gossip, amicable divorce, low-8 humans, Moon Howler cure/exorcism/rare/by-type/lifecycle, persistence, human lifecycle, affair cadence, relationship diagnostics, phase-7 social) — passed.
- `npx tsc -p tsconfig.app.json --noEmit`, `npm run test:types` — passed.
- `npm run lint` — passed (0 warnings / 0 errors on 321 files).
- `npm run build` — passed (exit 0).
- `npm test` — passed: 152 files / 839 tests, 0 failures.
- `npm run test:full-year` — passed twice (exit 0) with identical totals.
- `npm run test:browser` — passed (verdict pass, 0 console errors, 0 page exceptions, only the known benign aborted `Media` request).

## Related commits or files

- `src/game/simulation/humanRelationships.ts` — four `rng` defaults → `getSimRng('humanRelationships')`
- `src/game/moonHowler.ts` — four `rng` defaults → `getSimRng('moonHowler')`
- `src/game/rivalProfiles.ts` — `selectRivalDailyAction` default → `getSimRng('rivalProfiles')`, plus the `simRng` import
- `src/game/frontierCombat.ts` — `rollRivalOutgoingRaidResponse` default → `getSimRng('frontierCombat')`
- `tests/simRng.seededDefaults.test.ts` — new

## Fix

Each default parameter resolves to the owner stream for its domain: `rng: () => number = getSimRng('humanRelationships' | 'moonHowler' | 'rivalProfiles' | 'frontierCombat')`. The parameter list, signature and injectability are unchanged, so `tryDailyAmicableDivorce(…, () => 0)` in tests behaves exactly as before. `simRng.ts` is untouched — its own `Math.random` uses are the seeded global override it installs on purpose, and `worldGen` keeps `nativeRandom()` for choosing a map seed when the player gives none.
