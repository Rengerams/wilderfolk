# Determinism and state-residue defects — audit remediation (2026-11-12)

- Bug: two seed authorities could disagree after a seed adoption, combat and leisure rolls bypassed the seeded streams, a day-stable roll was reused with the same salt for two unrelated decisions, a playmate cache held live entity references across rollback, a hunt visual's lifetime depended on the wall clock, and the population census lost a cursed settler during the Moon Howler form.
- Status: resolved
- Severity: medium/low
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.2/§4.4
- Area: simulation RNG, story/election seeding, presentation-state retention, population census
- Owner module: `simRng.ts`, `combat.ts`, `humanLeisureBehavior.ts`, `migration.ts`, `storyEvents` owners, `entityCounts.ts`, `housingRelocationMonitor.ts`

## Status history
- 2026-11-12 — resolved: one run seed, named streams for combat and leisure, tick-based visual retention, rollback-safe caches, census includes the cursed form.

## Observed behavior

- **Two seed authorities.** Stories, elections and omens derived their roll seed from `worldMap.seed` while simulation streams used `getSimSeed()`; after a seed adoption they could disagree, so the same day rolled differently in the two systems.
- **Combat outside `simRng`.** Predator-block and counter-attack rolled on a bespoke LCG, so a snapshot/restore or rollback replay could not reproduce them.
- **Unseeded leisure.** The 12-way leisure activity came from id/day arithmetic, so `setSimSeed` barely changed free time.
- **Salt collision.** One `personDayRoll` salt was reused by the scarce-hunt dialogue and the "go home" leisure branch, making them perfectly correlated; another salt was dead.
- **Playmate cache.** The child-playmate cache stored live entity references, so a rollback could keep a playmate from a discarded tick.
- **Wall clock in the tick.** `huntVisuals` read `Date.now()` inside the tick, so arrow lifetime depended on real time rather than game time.
- **Population dip.** The census counted only `Human`-typed entities, so a cursed settler transformed into a Werewolf dropped out of `humanPopulation` for the night.
- **Session residue.** Housing-relocation counters survived a colony replacement.

## Expected behavior

One run seed feeds every deterministic roll; every gameplay roll comes from a named seeded stream; derived caches never carry entity references across a rollback; the tick never reads a wall clock; the population census counts the colony's people through a temporary form.

## Reproduction steps

1. Adopt a new seed, then compare a story roll with a simulation roll: pre-fix they used different seeds.
2. Snapshot, tick, restore, tick again: pre-fix predator-block results diverged.
3. `setSimSeed(x)` then inspect free-time venues: pre-fix the activity barely changed.
4. Correlate the scarce-hunt line and the go-home branch: pre-fix they fired together.
5. Save/restore mid-child-play: pre-fix the cached mate survived the rollback.
6. Full moon: pre-fix `humanPopulation` dropped by one.

## Evidence

Audit traces (§4.2, §4.4) and the code paths: `simRng.ts`, `combat.ts` (`combatRoll` on `seededRandomForRun`), `humanLeisureBehavior.ts` (`PERSON_DAY_ROLL_SALTS`, id-keyed playmate cache), `migration.ts` (`getSimSeed`), `entityCounts.ts` (`isPlayerHumanShiftOwner`), `housingRelocationMonitor.ts` (`resetHousingRelocationMonitor`).

## Root cause

Two sources for one seed, two hand-written rolls outside the stream owner, a reused salt, reference-keyed caches, a wall-clock read in the tick and a census predicate that excluded the temporary form.

## Fix / proposed fix

- `getSimSeed` is the single run seed; story, election, omen and migration owners read it, and the two herd tests now derive the arrival day from it.
- `combatRoll` draws predator-block and counter-attack from `seededRandomForRun` with a per-entity/tick salt.
- Leisure kind and destination use named run-seeded rolls; `PERSON_DAY_ROLL_SALTS` publishes the live salts (`leisureIdleDestination`, `leisureWeekendKind`) and the duplicated salt is gone.
- The child-playmate cache is keyed by entity id per world, so a rollback cannot inherit a mate reference.
- Hunt-visual retention is measured in ticks; only the renderer's animation progress reads the render clock (`HUNT_ANIM_LIFETIME_TICKS`, `isHuntVisualActive`).
- The census counts `isPlayerHumanShiftOwner` entities as settlers, so the Moon Howler night keeps the population stable.
- The session boundary resets the housing-relocation monitor.
- A vacant office can now fail the invariant: a living settler may not keep the leader label without `villageLeaderId` (the vacancy test now clears the label when it synthesises a vacancy).

## Save/migration impact

None. The run seed is adopted from the saved world; the seeded global `Math.random` override is documented as a harness-only hook and is never installed by a payload.

## Verification result

- `tests/deterministicSeed.test.ts`, `tests/simRng.test.ts`, `tests/personDayRoll.simRng.test.ts`, `tests/humanLeisureBehavior.test.ts`, `tests/huntVisuals.lifecycle.test.ts`, `tests/invariants.commute.herd.test.ts`, `tests/dailySpawn.gridSync.test.ts`, `tests/vacancyElection.dueDate.test.ts`: pass.
- Combined `standard` gate result: see the remediation log.
