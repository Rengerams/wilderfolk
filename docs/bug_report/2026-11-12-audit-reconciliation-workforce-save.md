# Audit reconciliation — workforce, economy and save batch (2026-11-12)

**Status:** fixed on `main` working tree, each with a named regression.

This report covers the 13 findings that the audit's §4.3/§4.4/§5 lists without `S-`/`W-` ids.
They were verified present, fixed, and re-tested on the final tree.

| Finding | Fix | Test |
|---|---|---|
| Save accepts any `speed` (0/NaN freezes the colony) | `saveLoad.worldScalarRules` validates against the shared `PLAYABLE_SPEEDS`; absent speed defaults to 1 | `tests/saveBoundary.elementRules.test.ts` |
| Worker ignores `simVersion` in the handshake | `isWorkerSimVersion` / `workerSimVersionMismatch`; init rejects a mismatched worker | `tests/gameWorker.uploadWatchdog.test.ts` |
| Main-thread fallback runs at most one tick/frame | fallback drains `catchUpBudgetFor(speed)` ticks | `tests/gameLoop.fallbackTickRollback.test.ts` |
| `hasMill` counts rival Mills for the player farm bonus | `isCompletedPlayerBuilding` gate | `tests/economyWorkforce.auditRemediation.test.ts` |
| Fresh colony starts at 0.03 spoilage while the daily owner writes 0.02 | `worldGen` calls `updateStorageCaps`; legacy payloads take the owner's rate | `tests/economyAudit.storageCaps.test.ts`, `tests/low-4-save-worldgen.test.ts` |
| Workshop preview uses yesterday's hours while production uses today's presence | both read `getWorkdayAttendance` | `tests/workshopEconomy.test.ts` |
| `workforce.barracksAutoFill` asserts `> 1` and leaves a barracks short | asserts the full post count and a legal donor floor | `tests/workforce.barracksAutoFill.test.ts` |
| Jailed worker's post counts as filled | `countActiveWorkersAtBuilding` excludes jailed holders; an idle hand backfills | `tests/economyWorkforce.auditRemediation.test.ts` |
| Taming Post exposes slots with no job type | `staffingCapFor` returns `{cap: 0, staffed: 0}` for a completed building with no job type | `tests/economyWorkforce.auditRemediation.test.ts` |
| Full 2-post food building can never donate to a newly completed food site | food seeding is the last-resort donor branch | `tests/workforce.autoTransferCooldown.test.ts` |
| Construction consumes the idle pool before non-food jobs | non-survival presets seed each empty job building with one hand before construction | `tests/virtualPlayerHealthVerdict.test.ts` |
| No swap pass for a vacancy paired with an unreachable idle settler | bounded swap moves a reachable worker and backfills the donor from a reachable idle replacement | `tests/economyWorkforce.auditRemediation.test.ts` |
| Enemy war captives are dropped from `prison.occupants` every assignment pass | `syncJobBuildingOccupants` accepts the full roster | `tests/economyWorkforce.auditRemediation.test.ts` |

**Also corrected on the same tree:** the `staffFoodJobsBeforeConstruction` name in the decision
registry (the function was renamed `staffJobsBeforeConstruction`), the duplicated playback-speed
ladder (one `PLAYABLE_SPEEDS` imported by save validation and App), and the `campLabel` legacy
fixture.

**Known follow-up (not a defect in this batch):** backfilling a jailed post keeps the reserved
`workerBuildingId`, so a 2-post workplace whose two holders are jailed can show 4 assignments until
release; the panel's fill count should be capped or the substitute evicted on release.
