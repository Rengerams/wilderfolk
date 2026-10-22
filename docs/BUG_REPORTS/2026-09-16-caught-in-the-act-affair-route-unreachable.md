# The caught-in-the-act affair path was unreachable by construction, so no scandal ever turned into a feud

- **Bug:** the only route that exposes an affair with certainty — a spouse walking in on the pair at their own marital home — could never fire. `isValidAffairTrystSite` refused the cheater's marital home, which is the only place `wouldWalkInOnMaritalAffair` can be true, and `humanTick`'s encounter guards skipped any pair standing at that home, so the "caught" reason could only ever arrive through the probabilistic daily catch roll. The same predicate also treated "the spouse *should* be home" as a walk-in, so had the site been selectable, every home tryst would have been an automatic 100 % divorce with no spouse anywhere near.
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** found while analysing the owner's 194-day chronicle (“there almost no divorces, alot of friendships but not like people hate each other?”); the owner chose **“Fix the caught-in-the-act path”** over the alternatives
- **Area:** Truth (relationship simulation), with a player-visible consequence in the Chronicle
- **Owner module:** `src/game/simulation/humanRelationships.ts` (tryst-site rule, walk-in rule, exposure), `src/game/humanTick.ts` (the two daily encounter guards)
- **Cadence:** both branches run on the daily boundary (`tryDailyAffairEncounter`, `tryDailyAffairGossip`)

## Status history

- 2026-09-16 — open (log analysis: 788 friendships and 182 scandal/rumour lines against 0 feuds; code reading showed `startFeud` has exactly one caller, `tryDivorceOnCaughtCheater`, reached only from the caught-in-the-act path)
- 2026-09-16 — investigating (the two halves proved to be mutually exclusive by construction: the tryst site banned the home, the walk-in required the home; `shouldBeAtHome` inside the walk-in also made the catch unconditional rather than witnessed)
- 2026-09-16 — resolved (empty marital home accepted as a tryst site, walk-in requires the spouse to be physically there, both `humanTick` guards use the new occupancy predicate; 8 regression tests; suite and the 360-day gate green)

## Observed behavior

A same-seed year on seed 12345 produced **0 feuds** and only probabilistic "caught" exposures. Isolating the path confirmed it was dead code: an affair could start, progress, and be exposed by the daily catch roll, but the 100 %-certain walk-in could not be reached, because the site where it can happen was refused by the site validator. The owner's settlement showed the shape of it — 788 friendships, 182 scandal/rumour lines, 0 feuds, and 3 divorces that were all the amicable (no-scandal) kind.

## Expected behavior

An affair may use the cheater's own house while the spouse is away: the empty marital home is a legitimate tryst site, refused only when the spouse is right there (the same `AFFAIR_SPOUSE_BLOCK_RADIUS = 22` px the other affair gates use). When the spouse is physically at that home — or arrives within the 55 px arrival window — the pair is caught **in the act**: the exposure is certain (`chance = 1`), it is logged as a caught scandal, it can end in divorce, and that divorce is the one place a feud between the wronged and the wrongdoer starts.

## Reproduction steps

1. `npx vitest run tests/affairCaught.reachability.test.ts` against the old code: the walk-in case (“a walk-in now catches them: scandal, divorce, and a feud on both sides”) and the tick-level case (“produces the scandal, the divorce and the feud from one tick”) fail, because the tryst site is refused before the exposure can be evaluated.
2. In a run: from a fixed seed, no caught-in-the-act exposure is ever recorded, and `startFeud` — whose only production caller is the caught-cheater divorce — is never reached.

## Evidence

- `humanRelationships.ts:254-298` — `isValidAffairTrystSite`'s cheater branch only accepted a home tryst while… refusing it: the branch used to require the spouse **not** to be near the marital home *and* the pair to be at the marital home, while `humanTick.ts:997` skipped the encounter entirely for a cheater at the marital home. The tryst site and the walk-in site were the same place, and both sides excluded it.
- `humanRelationships.ts:214-226` — `wouldWalkInOnMaritalAffair` returned true when the spouse merely *should* be home (`shouldBeAtHome(hourOfDay)`), and `humanRelationships.ts:1105-1106` sets `chance = 1` whenever that flag is true — so the old predicate would have made any home tryst an unconditional divorce, witnessed or not.
- `humanRelationships.ts:60` — `AFFAIR_SPOUSE_BLOCK_RADIUS = 22` (the "beside them" radius the affair gates use) versus the 55 px arrival window `isSpouseNearby`/`isSpouseAtSharedHome` use for the walk-in: the two radii must differ, which is what the fix encodes.
- `humanTick.ts:994-997` and `:1079` — both daily guards now read `!isMaritalHomeOccupiedBySpouse(entity, entityById, buildingById, AFFAIR_SPOUSE_BLOCK_RADIUS)` instead of `!isAtMaritalHome(...)`; an affair can therefore progress at an empty marital home.
- `relationships.ts:219` — `startFeud` had exactly one caller (`tryDivorceOnCaughtCheater`), which is why a dead caught-in-the-act route meant **zero** feuds in the whole settlement.
- Same-seed A/B on seed 12345 (fix off → on): caught scandals 21 → 21, divorces 38 → 39, affairs established 54 → 39, scandal exposures 89 → 91, settlers 73 → 74. The rule is coherent; the absence of a bigger effect is itself evidence for the still-open rendezvous gap below.

## Root cause

Two rules that must meet were written to exclude each other. `wouldWalkInOnMaritalAffair` could only be true at the cheater's marital home, while `isValidAffairTrystSite` — and the `humanTick` encounter guard — treated that home as off limits whenever the spouse was due back. The "due back" test (`shouldBeAtHome`) then supplied the second defect: because it is true for the whole night window, the walk-in would have been an automatic divorce rather than a witnessed catch. The reminder in `relationships.ts:7` that feuds also arise from "incompatible pairs" describes a mechanic that does not exist; until it does, this path is the only feud source in the game.

## Regression test

`tests/affairCaught.reachability.test.ts` (8 tests), all driving the real functions and the real tick:
- an empty marital home is a valid tryst site while the spouse is out, and is refused while they are home;
- the home is blocked only by a spouse who is actually there, not one across the village;
- a walk-in produces the scandal, the divorce **and** a feud on both sides;
- nothing is caught when the spouse is nowhere near the home (the control that pins proximity as the cause);
- the divorce-caught helper stays inside 0..1;
- through `humanTick`: an affair can start at the empty marital home and build progress there;
- an established affair is still caught when the encounter branch cannot run;
- one tick can produce the scandal, the divorce and the feud together.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant assertions satisfied, and the affair change moved no aggregate by more than the run-to-run noise band of the change itself (A/B above). `npx vitest run tests/affairCaught.reachability.test.ts tests/phase7.social.test.ts` — 17 passed together, so the existing social-tier contracts still hold.

## Save/migration impact

None. No field, key, format or version changed. The fix is rule-level: `isMaritalHomeOccupiedBySpouse` is derived from `residenceBuildingId`, building geometry and entity positions, and `tryExposeCaughtAffair` / `tryExposeCaughtAffairForPair` simply lost their `hourOfDay` parameter (all callers updated) because the walk-in is now about where the spouse is, not what time it is. Nothing an existing save stores changes meaning.

## Verification result

- `npx vitest run tests/affairCaught.reachability.test.ts tests/phase7.social.test.ts` — passed (17 tests: 8 + 9).
- `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` — passed (0 warnings / 0 errors).
- `npm test` — passed after the change; the current tree runs 152 files / 840 tests with 0 failures.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks, invariants satisfied).

## Related commits or files

- `src/game/simulation/humanRelationships.ts` — new `isMaritalHomeOccupiedBySpouse`; `isValidAffairTrystSite` accepts the empty marital home; `wouldWalkInOnMaritalAffair` requires the spouse to be present (55 px) instead of "due home"; `tryExposeCaughtAffair` / `tryExposeCaughtAffairForPair` no longer take `hourOfDay`
- `src/game/humanTick.ts` — both daily encounter guards use `isMaritalHomeOccupiedBySpouse` (22 px block radius); the leisure "sneaking" guard at `:1241` intentionally keeps `!isAtMaritalHome`
- `tests/affairCaught.reachability.test.ts` — new

## Fix

The cheater's marital home is now a tryst site exactly like the married paramour's home already was: refused when the spouse is within `intimateDist` or at the shared home, otherwise accepted when both partners are within `intimateDist` of it. `wouldWalkInOnMaritalAffair` returns true only when the spouse is physically within 55 px or at the shared home, and the exposure roll keeps `chance = 1` for that witnessed case, so a walk-in is a certain catch rather than a certain divorce-by-calendar. `humanTick`'s two guards moved to the new `isMaritalHomeOccupiedBySpouse`, which is what lets a pair build an affair at the empty home in the first place.

**Still open (recorded in `Roadmap_V0_6.4.1.MD`, N24):** `getAffairTrystBuilding` still sends a pair to the **paramour's** residence, so in a normal run the tryst rendezvous rarely lands on the cheater's home and the walk-in branch stays mostly unexercised — which is why the A/B above shows no drama gain yet. The fix direction is to let a willing pair use an empty marital home as a rendezvous, then re-measure.
