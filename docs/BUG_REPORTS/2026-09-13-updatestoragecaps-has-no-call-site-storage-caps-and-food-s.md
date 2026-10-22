# updateStorageCaps has no call site: storage caps and food spoilage never update in a running game

- **Bug:** updateStorageCaps has no call site: storage caps and food spoilage never update in a running game
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent X6-duplication-deadcode; adversarially verified) — audit id H3
- **Area:** Truth
- **Owner module:** `src/game/economy.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

As §6 forbids duplicate rules and the decision registry lists `storageMax`/`foodSpoilageRate` as daily production writes, the game runs on frozen world-gen values: Barns (`src/game/buildings.ts:205 '... extends wood storage +300'`), Siloes (`buildings.ts:218 'Passive food storage bonus.'`) and Wood Storehouses (`buildings.ts:231 '+800 wood storage'`) add no storage at all, spoilage stays 3% instead of the audited 2% (and never drops to 0.8% with a Silo), and gold stays capped at 2000 (shown in `src/components/GameHeader.tsx:315`) instead of 20000 — exactly the numbers the passing test asserts but nothing produces.

## Expected behavior

Call `updateStorageCaps(state)` from the daily economy owner — first statement of `tickStaticDaily` (src/game/dailyBuildingEconomy.ts:238-242, beside `applyFoodSpoilage`) — which `decisionRegistry.ts:113` already documents as `scheduledFrom: 'tickLayerDaily'`.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/economy.ts` at lines 8-21.
2. Note the offending code: `src/game/economy.ts:8 `export function updateStorageCaps(state: WorldState) {` — its only other mention in all of src is a doc string (`src/game/simulation/decisionRegistry.ts:103 ... economy.ts — addResource, applyFoodSpoilage, updateStorageCaps`), and its only caller anywhere is `tests/economyAudit.storageCaps.test.ts:44 updateStorageCaps(w);`. Live caps therefore come from `src/game/worldGen.ts:577 const storageMax = { wood: 1000, stone: 500, food: 1000, gold: 2000, iron: 500 };` and `src/game/worldGen.ts:618 foodSpoilageRate: 0.03,` (only saves/simPrep/simDelta carry these fields afterwards).`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> updateStorageCaps (economy.ts:8-21) has no caller in src — only its declaration and a doc string in decisionRegistry.ts:103 — and every other storageMax assignment is init/load/worker-copy (worldGen.ts:577/622, saveLoad.ts:371, simPrep.ts:117, simDelta.ts:267). resourceUtils.addResource clamps to state.storageMax, so for the whole game Barn (+300 wood/+400 food), Silo (+600 food, lower spoilage), Wood Storehouse (+800 wood) and Store/Market confer nothing and foodSpoilageRate stays at the worldGen 0.03 instead of the audited 0.02; tests/economyAudit.storageCaps.test.ts only passes because it invokes the function by hand. Minimal fix: call updateStorageCaps(state) from the daily economy production step (and after a building completes) so caps/spoilage are recomputed.

## Root cause

updateStorageCaps (economy.ts:8-21) has no caller in src — only its declaration and a doc string in decisionRegistry.ts:103 — and every other storageMax assignment is init/load/worker-copy (worldGen.ts:577/622, saveLoad.ts:371, simPrep.ts:117, simDelta.ts:267). resourceUtils.addResource clamps to state.storageMax, so for the whole game Barn (+300 wood/+400 food), Silo (+600 food, lower spoilage), Wood Storehouse (+800 wood) and Store/Market confer nothing and foodSpoilageRate stays at the worldGen 0.03 instead of the audited 0.02; tests/economyAudit.storageCaps.test.ts only passes because it invokes the function by hand. Minimal fix: call updateStorageCaps(state) from the daily economy production step (and after a building completes) so caps/spoilage are recomputed.

## Fix

`updateStorageCaps(state)` is now called as the first statement of `tickStaticDaily` in `dailyBuildingEconomy.ts`, before spoilage is applied. `tickBuildingProgress` runs earlier in the same daily pass, so a Barn/Silo completed that day counts that day. Barn (+300 wood/+400 food), Silo (+600 food, spoilage 0.02 → 0.008 for one), Wood Storehouse (+800 wood), Store/Market (+200 wood/stone, +100 iron) and the audited gold cap of 20 000 now reach play.

## Regression test

`tests/storageCaps.dailyWiring.test.ts` (2) — a real `gameTick` day boundary applies the Barn+Silo bonuses and the Silo spoilage cut, and the ticked result equals the pure formula for a storehouse+store world.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass. Note the intentional balance consequence: caps follow the audited formula (base wood/food 800, gold 20 000) rather than the world-gen literals (1000/1000/2000); resources above a new cap are not confiscated, they simply stop growing.

## Related commits or files

- `src/game/economy.ts` (lines 8-21)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H3)
