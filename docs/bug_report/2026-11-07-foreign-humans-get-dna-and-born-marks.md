# Foreign humans receive genomes and born marks

- Bug: Visitors and trade-caravan carriers were created as full genetic settlers, so every foreign human carried a `GenomeV2` plus two born-mark draws and the selection panel showed aptitude chips for them.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (DNA-02)
- Reporter: full-audit DNA/aptitudes pass
- Area: DNA aptitudes and entity creation
- Owner module: `src/game/entityFactory.ts` (`createEntity`); `src/game/saveLoad.ts` (`backfillLegacySettlerDNA`); `src/game/playerHuman.ts` (`isForeignFaction`)
- Related PR/commit: this branch

## Status history
- 2026-11-07 — open: audit traced genome/born-mark creation for every `EntityType.Human`, including foreign factions, contradicting the architecture doc's "dead / foreign: no genome is created or read".
- 2026-11-07 — resolved: creation and the load backfill gate on the faction predicate; the panel chips are player-only.

## Observed behavior
`createEntity` rolled `rollFounderGenome()` and `rollBornMarks()` whenever `type === EntityType.Human`. `groupEvents.createVisitorHuman` and `tradeCaravans` set the foreign faction *after* creation, so a visitor and a caravan carrier each consumed 28 `settlerGenetics` draws and two `settlerMarks` draws. `backfillLegacySettlerDNA` then filled a genome for any alive Human/Werewolf, foreign or not, and `SelectedEntityPanel` rendered three aptitude chips for any Human holding `genomeV2`.

## Expected behavior
The architecture doc (`docs/DNA_APTITUDES_ARCHITECTURE.md` §4) says a dead or foreign subject has no genome and falls back to neutral behaviour, and the remediation plan records the player-only contract. Foreign humans must be created without DNA and marks, and no UI must present their aptitudes.

## Reproduction steps
1. `createEntity(EntityType.Human, 0, 0, 4, 100, false, { faction: 'visitor' })`.
2. Observe `genomeV2` and `marks` on the returned entity before the fix.
3. Select a visitor in the entity panel and observe the aptitude chips.

## Evidence
Audit `dna-aptitudes.md` §3 DNA-02; `entityFactory.ts` pre-fix genome/marks lines; `groupEvents.ts` visitor creation; `tradeCaravans.ts` carrier creation; `saveLoad.ts` backfill loop.

## Root cause
The genome and born-mark draw were gated on entity type only, and the faction was assigned by the caller after `createEntity`, so no creation-time caller could avoid the draw. The load backfill and the panel chips repeated the same "any Human" assumption.

## Fix / proposed fix
`isForeignFaction` is now the one faction classification in `playerHuman.ts`, used by `isPlayerHuman` and `isPlayerHumanShiftOwner`. `createEntity` accepts an optional `faction`, sets it on the entity, and skips the genome and born-mark draw for a foreign faction; visitors and caravan carriers pass their faction at creation. `backfillLegacySettlerDNA` strips `genomeV2` and `marks` from a saved foreign human and never backfills one, the load marks pass skips foreign humans, and `SelectedEntityPanel` shows aptitude chips only for `isPlayerHuman`.

## Save/migration impact
Existing saves keep working. A saved foreign human loses the unused genome and marks on load; a player settler keeps its genome and validated marks. Because visitors and carriers no longer consume genetics/marks draws, a new colony's RNG stream diverges from pre-fix runs after the first foreign spawn; saves store the RNG state, so an in-flight colony is unaffected.

## Verification result
- `npx vitest run tests/settlerTraits.test.ts tests/personalMarks.test.ts tests/personality.legacyDNA.test.ts` — PASS (50 tests).
- `npx vitest run tests/tradeCaravan.carrierRetention.test.ts tests/visitorSpawn.gridSync.test.ts tests/visitorTrade.foodLedger.test.ts tests/visitorTradePanel.eligibility.test.ts tests/dialogue.visitorPerformer.test.ts tests/simDelta.entityProfile.test.ts tests/simDelta.storyRoundtrip.test.ts` — PASS (22 tests).
- `npx vitest run tests/personality*.test.ts tests/saveLoad.*.test.ts` — PASS (188 tests).
- `npm run test:types`, `npm run lint` — PASS.
- NOT RUN: the entity panel's chip gate has no component test and was not exercised in the browser this turn.
