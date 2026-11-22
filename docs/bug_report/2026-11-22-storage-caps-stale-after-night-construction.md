# New storage building stays capped until the next production pass

- Bug: A newly completed storage building's extra capacity and Silo spoilage reduction are not applied at its 23:00 completion, so resource gains can be rejected overnight.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.1, PR #166 (after moving construction to 23:00)
- Reporter: Codex P2 review `#discussion_r4658145577`; code trace and documented Barn reproduction
- Area: Construction completion, storage caps and overnight resource acceptance
- Owner module: `src/game/dailyBuildingEconomy.ts` (completion trigger), `src/game/economy.ts` (`updateStorageCaps` and `computeStorageMax` sole capacity/spoilage rule)
- Related PR: https://github.com/Rengerams/wilderfolk/pull/166

## Status history
- 2026-11-22 — investigating: after the construction pass moved from 18:00 to 23:00, a completed Barn could keep the previous 18:00 storageMax value; a fix and focused regression have been prepared. Verification of this revision is pending.

## Observed behavior
`tickStaticDaily` calculates `storageMax` during production at 18:00, when the site is incomplete. `tickBuildingProgress` finishes the site at 23:00 without recalculating storage. Until the next 18:00, a Barn may have `computeStorageMax(state.buildings).wood === 1100` while `state.storageMax.wood === 800`. A wood gain of 100 into a store holding 800 then accepts zero. Silo food capacity and spoilage rates can similarly remain stale.

## Expected behavior
As soon as a Barn, Silo, Storehouse or another capacity-affecting building completes, the cached storage caps and spoilage settings must match the one canonical economy calculation. This must not grant production or XP to the newly completed site before its next eligible production pass.

## Reproduction steps
1. Prepare an incomplete Barn at 99% build progress and a full base wood store (800/800); let the established 18:00 economy pass establish the old cap.
2. Run the real `gameTick` at the 23:00 construction phase so the Barn completes.
3. Before this fix, `state.storageMax.wood` remains 800 despite the completed Barn, and `addResource(state, 'wood', 100)` accepts zero.
4. After the fix, cap is refreshed at completion and the same resource gain fits.

## Evidence
Codex review `4658145577` reports Barn 23:00 reproduction. Code trace: `dailyBuildingEconomy.tickStaticDaily` calls `updateStorageCaps` at 18:00, while `tickBuildingProgress` closes sites at 23:00. This is a new cadence regression of the historical resolved 2026-09-13 storage-cap wiring issue, not an overwrite of its archived report.

## Root cause
Moving construction to 23:00 separated it from the earlier 18:00 call to the only storage-cap owner, leaving a one-day delay in the cached capacity and Silo spoilage values.

## Fix / proposed fix
When `tickBuildingProgress` completes at least one building, call the existing `economy.updateStorageCaps(state)` exactly once before leaving the completion block. No copy of the capacity formula or second scheduler is introduced. Targeted `tests/production.attendancePacing.test.ts` cases cover Barn wood, Silo food/spoilage and Storehouse iron capacity through `gameTick` and accepted `addResource` gains.

## Save/migration impact
None. `storageMax` and `foodSpoilageRate` already exist; both are derived from completed structures by the existing economy function.

## Verification result
NOT RUN for this new revision yet. The preceding PR #166 head `797247f` passed Node.js CI (3,139/3,139 tests) and seven workflows, but those results do not verify this newly added completion-time refresh. Await CI on the updated head.
