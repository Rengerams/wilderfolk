# Audit verification — all-bugs register (2026-11-12)

Independent verification of every finding in [audit-all-bugs-2026-11-12.md](./audit-all-bugs-2026-11-12.md), performed 2026-11-14 against commit `b6f4a01a` (branch `main`). The appendix also assesses the 529-file test suite, which was measured and run (3,478 passed, 0 failed).

> **Concurrent working-tree change:** while this check was running, 12 files under `src/` were edited in the working tree (uncommitted, timestamps 03:38-03:43) with fixes matching W-34, W-67, W-104, W-146, N-08, N-32, N-25, W-74 and the unlimited-range hospital finding. Those edits are not part of this audit and were not made or reverted here. The verdict table below is the `b6f4a01a` snapshot; those rows may already be addressed in the working tree. The edit also adds `hasSocialSceneOnDay` and `isSocialSceneKey` to `dialogueTrees.ts`, neither of which is registered by name in `OWNERSHIP_OVERVIEW.md`.

## Answer

**No — not all listed bugs are fixed as claimed.** 177 of 203 rows are verified fixed in production code, but 11 rows are only partial: the named path is fixed while another reachable path still produces the defect. A further 2 rows remain unproven (W-11, W-96), and 7 rows are test/document/process claims that production code cannot prove.

The most important survivors are:

- **W-104 / F-4 — one social scene per person per day is not enforced across all scene sources.** The gate is applied to greeting and banter only. Solo impulse scenes (`humanLeisureBehavior.ts:281-287`), child-play scenes (`:141`) and ambient chat (`humanTick.ts:434` → `humanSocial.ts:33` → `dialogueTrees.ts:803`) still request scenes without consulting `hasDialogueSceneOnDay`.
- **W-67 — the civic food rule still has two owners.** `socialLife.ts:313-326` uses `isFoodAlert`, but `townHall.ts:168-171` keeps its own `Math.max(40, population*2)` food band.
- **W-146 — a dead rival corpse in a legacy save survives load.** `pruneOrphanRivalEntities` skips `!entity.alive` (`rivalEvents.ts:91`) and the load filter only drops `departedAlive` rows (`saveLoad.ts:1683`). The register also cites `tests/rivalGhosts.test.ts`, which does not exist.
- **N-32 — jail-release overfill is fixed only for normal release.** Prison demolition / prison retirement / a dangling save reference clears `prisonBuildingId` without trimming the reserved post, and `syncJobBuildingOccupants` then rebuilds the roster from every pointer with no cap (`workforce.ts:663-703`). The register's own N-08 proof bakes the over-cap total in as expected (`tests/economyWorkforce.auditRemediation.test.ts:101-106`).
- **N-08 — jailed holders still count in several coverage decisions.** Active counts exclude them, but `buildWorkforceAssignmentIndex` and `staffingCapFor` still treat a jail-reserved post as covered (`workforce.ts:225-231`, `:114-118`), and the virtual player counts with the jailed-inclusive `countWorkersAtBuilding` (`virtualPlayer.ts:468`).
- **W-45 — the custodian fix lives in a dead builder.** `getChildCustodian` is used only by `buildFamilyTree`, which has no production caller; the live `FamilyTreeWindow` uses `buildFullFamilyTree`, which never applies it.
- **W-74 — one production caller bypasses the residence bed gate.** `writeResidence` enforces capacity only when it is given `buildings`; `moonHowlerForm.ts:113` restores a cursed settler to their saved bed without that context, so a retaken bed can be overfilled on revert.
- **W-38 — the config-lookup migration is incomplete.** 26 `getBuildingConfig` call sites coexist with 102 raw `BUILDING_CONFIGS[...]` reads.
- **W-34 — one invalid Tailwind arbitrary width survives** at `VillageRequestCard.tsx:20` (`w-[min(100%-1.5rem,24rem)]`, no escaped space).
- **N-25 — live camp-site selection still uses `Math.cos/sin`** (`worldEventSites.ts:50-51`), despite the row claiming camp positions are deterministic.

W-96 remains unproven rather than fixed: production regenerates a compact map from the save-supplied pixel width/height, bounded by the largest preset, but there is no check that those dimensions equal the map the colony was actually built on.

Outside the register, the pass also surfaced a separate set of confirmed issues — unlimited-range hospital treatment for urgent patients, a load/exit-save race, cross-domain `personDayRoll` salt collisions, footprint-centre offsets, a dead CI path filter, and others — listed under [Additional code findings outside the register](#additional-code-findings-outside-the-register).

## Method and evidence rules

- The register was treated as the claim list; **the only accepted evidence was production code** in `src/` (and `scripts/` for tooling rows).
- A cited test existing or passing was **not** accepted as proof. Some cited tests do not exercise the claim at all, and one cited file no longer exists. Tests were read only to identify doc/test mismatches, never to decide a verdict.
- Other documents (remediation log, ownership overview, changelog, handovers) were deliberately not read, per the task.
- Each row was checked by tracing the authoritative path and searching for other writers/callers. Where a second path still produces the defect, the row is `PARTIAL`.
- Read-only: no source, test or existing document was modified by this audit. Only this new document and scratch files under `tmp/` were produced.

Verdict vocabulary:

- `FIXED` — the production code prevents the defect.
- `PARTIAL` — the main path is fixed but a reachable path still has the defect.
- `NOT FIXED` — the defect is still present.
- `TEST-ONLY` — the claim concerns tests/process; production behaviour is not the subject.
- `DOC-ONLY` — the claim concerns other documents; not code-verifiable.
- `UNVERIFIABLE` — code inspection could not establish or refute the claim.
- `OBSOLETE-VERIFIED` — the named subsystem/feature is genuinely gone or the refutation/obsolete status is correct.

## Tally

| Verdict | Rows |
|---|---:|
| FIXED | 177 |
| PARTIAL | 11 |
| TEST-ONLY | 4 |
| DOC-ONLY | 3 |
| UNVERIFIABLE | 2 |
| OBSOLETE-VERIFIED | 6 |
| **Total** | **203** |

Register self-status for comparison: 197 rows marked fixed (195 exact `Fixed`, one `Fixed (full day gate)`, one long `Fixed — …`), 4 obsolete/removed, 1 refuted, 1 unproven = 203 rows. The W-112/W-113 duplicate is a duplicate content pair, not an extra count.

## What the register itself gets wrong

These are defects in the audit register, independent of whether the code is fixed:

- **Duplicate row:** W-112 and W-113 are byte-identical. There are 203 findings, not 204; the second duplicate inflates the count.
- **Missing row:** the W numbering skips W-27 and W-56; `W-76` is also absent from the table even though the range runs W-75 → W-77.
- **Missing proof file:** W-146 cites `tests/rivalGhosts.test.ts`, which does not exist in the tree.
- **Proof pointers that do not test the claim:** W-58 (no match-count assertion in `uiPanelFixes.render.test.ts`), W-67 (cadence test, not the food rule), W-92 (`buildings.lookup.test.ts` tests `findCompletedBuilding`), W-120/W-121 (not covered by `geometry.footprintCentre.test.ts`), W-131 (asserts absence of `useMemo` in a file with no prisoner content), W-133/W-134/W-141/W-142/W-143 (actual guards live in different test files, or no test exists).
- **A proof can enshrine the defect:** N-08 cites `tests/economyWorkforce.auditRemediation.test.ts`, whose assertion expects a 2-post farm to hold `maxOccupants + jailed.length` posted links (`:101-106`) rather than asserting working coverage. The test proves backfill while accepting the over-cap roster.
- **N totals line is arithmetically wrong:** it says “21 fixed with a cited regression, 7 refuted or verified, 3 removed”, but the N table marks 28 rows `Fixed` and only 3 removed/obsolete.
- **Stale heading:** “Newly found, not yet fixed” still says not fixed although all three rows are marked `Fixed`.
- **Wording reversed in places:** S-01 and S-13 are written as fix statements rather than defects. S-11 says harnesses collect “per tick”; they collect per checkpoint/day, and dev/test asserts on daily-layer passes.
- **Overstated claims even where the main fix is real:** S-06 says the faction walk is “recorded” (it is maintained by velocity continuity, not a remembered route); N-25 says camp positions are deterministic while `worldEventSites.pickSite` still uses `Math.cos/sin`; W-129 says “every elapsed tick counter” while `weatherTimer` and invention-fair tick stamps are not scaled.

## Additional code findings outside the register

These were noticed while verifying the listed rows. They are not part of the 203 rows and were not exhaustively verified, but they are real code inconsistencies worth a bug report:

- **Load does not wait for a pending exit save.** New-game awaits `waitForPendingSave()` before deleting the slot (`App.tsx:1180`), but `confirmPendingLoad` (`App.tsx:1295-1339`) is synchronous and reads/adopts the slot without waiting. An async exit save that resolves afterwards can write the departed colony back over the newly loaded slot.
- **Dead CI path filters.** `.github/workflows/housing-90-day-targeted.yml:22-24` lists `src/game/residencySelection.ts`, `residencyReconciliation.ts` and `residencyOccupancy.ts`, none of which exist, and omits the consolidated `housingPipeline.ts`, so housing changes can bypass that gate. Same class as W-11, different workflow.
- **Footprint-centre convention violated at several sites.** `building.x/y` is the footprint centre (`buildingGeometry.ts:8-10`), yet `settlerInteractionActions.ts:47` spawns a recruit at `anchor.x + width/2, anchor.y + height/2` (bottom-right corner), `hotelStay.ts:67-71` measures distance from the same corner offset, and `tickLayerRealtime.ts:98` focuses the election notification there.
- **Hospital ward treats urgent patients at unlimited range.** `tickHospitalDailyCare` skips the proximity gate when `medicalUrgency >= 0.7` (`hospitalCare.ts:291-296`), and `treatPatientAtHospital` never checks the patient's distance (`:185-230`). A staffed hospital can heal a settler anywhere on the map, contradicting its own docstring "teleport-free: only those already close" (`:273-275`); the remote heal still pays medicine, reputation and doctor XP.
- **Hostile weather is hard-disabled.** `worldEvents.ts:32` sets `HOSTILE_WEATHER_ENABLED = false`; `applyDailyWeatherEffects` returns at `:173` and no disaster can spawn. The W-02 disaster-save hardening and the ledger's `disaster` label therefore guard a feature that cannot fire in production. This looks intentional, but it should be an explicit design decision rather than a silent constant.
- **`personDayRoll` salt arithmetic still collides across domains.** `hospitalCare.ts:265` uses `901 + best.id`; with a patient id of 5 the treatment gate becomes salt 906, the same roll as the doctor-dialogue gate at `:268`, so that dialogue fires at ~86% instead of 30%. `townHall.ts:205` uses `821 + day`, colliding with the fixed branch salts 822-826 on days 1-5. `humanLeisureBehavior.ts:106` uses `718 + tickBucket`, which reaches 719/720/812 (child dialogue, banter, hunt). `PERSON_DAY_ROLL_SALTS` is adopted at only a handful of the ~80 call sites, and its comment claims one entry per decision with no reuse.
- **Forge ownership predicates omit the rival filter.** `forge.ts:9-11,171-185` and `queueForgeOrder` (:272-275) accept a completed Blacksmith without checking faction, unlike `isCompletedPlayerBuilding` elsewhere. Legacy rival structures are retired at load, so normal play is shielded, but the ownership rule is inconsistent.
- **Two definitions of a filled post, mixed at call sites.** `countWorkersAtBuilding` includes jailed holders (`workforce.ts:66`) while `countActiveWorkersAtBuilding` excludes them (`:81`); `staffingCapFor` reports the jailed-inclusive number (`:114-118`), the hire path uses the active one (`:721`), and the rebalance index counts jailed (`:225-231`).
- **The jailed-holder ambiguity leaks into the bot.** `virtualPlayer.ts:468`, `:555`, `:835`, `:1928` use the jailed-inclusive count, so a site whose only posted worker is imprisoned can read as staffed/at-cap to the decision layer.
- **`staffJobBuildings` can build an over-cap link roster.** It fills to cap by active workers (`workforce.ts:1057-1062`) while jailed pointers remain, so a 2-post farm with two jailed holders ends with four `workerBuildingId` links and two active occupants.
- **Worker trade identity survives a lost post.** When `restoreWorkerRosterAfterCustody` finds the post already full, it clears `workerBuildingId` but leaves the old `job`, `occupation` and skills in place (`workforce.ts:455-463`), so the settler reads as idle for assignment but keeps a stale trade label.
- **Workshop preview duplicates the production pricing stack.** `workshopEconomy.ts:22-26,103-119` re-declares `WORKER_SCALING_PER_HEAD: 0.5` and re-implements the multiplier chain, while production hardcodes `1 + workers * 0.5` at `dailyBuildingEconomy.ts:898`; only the skill/attendance inputs are genuinely shared.
- **Forge staffing predicate is duplicated inside its own owner:** `forge.ts:178-185` defines `isBlacksmithStaffed`, but `getForgeBlockReason` re-implements the same predicate at `forge.ts:250-253`.
- **Full-larder hunts diverge:** free-roam hunting kills and books the prey, then records only accepted food (`+0` at full storage, `humanHuntingBehavior.ts:126-178`), while the Hunting Spot only kills when food was actually accepted (`dailyBuildingEconomy.ts:627-654`).
- **Immigration marker points at a random completed home’s door**, not the home the newcomer is later assigned (`dailyPopulation.ts:114-155`).
- **Static-layer cache is a single global slot** guarded by world/tick/array identity (`renderSnapshot.ts:197-222`); in-place mutation without a tick advance could keep a stale layer. Safety currently rests on a comment, not enforcement.
- **`scheduleLastWorkedHours` stores rota hours but is the fallback payment source** when no rota/present sample exists (`scheduleFatigue.ts:88-90,146-149`), which can pay an absent worker on a custom shift starting after the 18:00 pass.
- **W-145 lead not confirmed:** an absent `energy`/`maxEnergy` is accepted (`saveLoad.ts:1310-1314`); whether the restore defaults it before the invariant check was not established.

## Per-row verification

### Numbered findings (S-01…S-18, W-01…W-147)

| ID | Verdict | Code evidence | Notes |
|---|---|---|---|
| S-01 | FIXED | dailyBuildingEconomy.ts:360 computes the midnight productionDayTick and :981 passes it to forge.tickVillageForge, which gates on isProductionTick(productionDayTick, FORGE_PACE_INTERVAL_TICKS) (forge.ts:338; dayCycleClock.ts:111-120). The 18:00 pass is the only forge clock; midnight cannot advance the order. | Row text is phrased as the fix, not the original defect. |
| S-02 | FIXED | speciesConfig.ts:189-209 gives Wildkin deer/rabbit energyGain and no grass; grazer metabolism/ease/bite sets are deer+rabbit only (grassEcology.ts:85-88, tickLayerSystems.ts:286-290,577-583); Wildkin is in isWildlifePredator and HUNT_PREY_TYPES (tickLayerSystems.ts:83-113); spawn energy comes from the species config (humanLifecycle.ts:152-158). | Wildkin still reuses the deer sprite, unrelated to the defect. |
| S-03 | FIXED | useGameSession.ts:157-171 awaits onBeforeStop before clearing loopRef and stopping; persistGameOnPageHide uses synchronous saveGameToSlot (useGamePersistence.ts:135-148); App.tsx:1180 awaits waitForPendingSave before deleteSave; MapSetupScreen.tsx:198-209 arms confirm on hasRunningColony. | All four sub-claims present. |
| S-04 | FIXED | simDelta.ts:144-152,399-409,743-752 carries election/leader fields and electionPromiseRecords; simPrep.ts:84-92,260-272,396-404 round-trips the same fields for rollback. |  |
| S-05 | FIXED | worldRuntimeCaches.ts:46-48 rebuilds beautyGrid from buildings whenever it is absent; gameWorker.ts:204 hydrates caches on init/import; simPrep.ts:451 rebuilds after rollback. beautyGrid is a pure function of buildings (beautyGrid.ts:40-52), so rebuild equals the pre-tick value. | Not carried in the rollback payload; reconstructed instead. |
| S-06 | FIXED | humanTick.ts:894-903 uses resumeHumanWalk (same target/route/pace from humanMovement.ts:68-83) rather than re-deciding; hotelStay.ts:581-585 records its walk. Faction walk keeps its velocity through the throttle because the faction branch follows after the throttle block (factionWander.ts:338-400, integrateHumanWalk applies vx/vy). | 'Recorded' is exact for hotel; faction travel is preserved by velocity continuity rather than a remembered route, so the row wording overstates. |
| S-07 | FIXED | dailyWorldEvents.ts:272-279 clears bountifulHarvest at the year boundary (dayInYear 0, year > 0, not the first game day) before the 18:00 production pass and the yearly roll; gameTick.ts:92-121 advances the calendar before layers. |  |
| S-08 | FIXED | economyLedger.ts:75-82 owns recordFoodProduced; groupEvents, tradeCaravans, frontierCombat, rivalDiplomacy, valleyChronicle, dailyChallenges, blueberryForaging, humanHuntingBehavior and dailyBuildingEconomy all record through it (e.g. groupEvents.ts:184,362,698,1002; dailyBuildingEconomy.ts:499,630,704,839). No direct food inflow assignment remains. |  |
| S-09 | FIXED | grassEcology.ts:9 GRASS_GROWTH_PER_DAY is a per-day rate; dailyGrassEcology.ts:29 applies it once per day without multiplying by TICKS_PER_DAY; ecosystemPressure.ts:55,61,69 reads the same constant/rule. |  |
| S-10 | FIXED | hospitalCare.ts:91,247,285,314 measures from getBuildingCenter (buildingGeometry.ts:8-10: x/y is the centre) and isAtBuildingReach (buildingAccess.ts:140-152); no footprint-corner offset remains in the ward geometry. | Row is phrased as the defect; current code is the corrected form. |
| S-11 | FIXED | simulationInvariants.ts:278-282 collects all errors and throws once; gameTick.ts:376-386 runs the dev/test assertion and throws; harnesses collect via collectSimulationInvariantErrors and assert per checkpoint (colonyHealth.ts:979, run-full-year.mts:430-508). | Not literally every tick: dev/test asserts on daily-layer passes, harnesses per checkpoint/day. Notification of a real defect still fails the run. |
| S-12 | FIXED | gameWorker.ts:196-201 resetWorkerSession calls clearAllFactionWanderStates on init and importSave/syncWorld; factionWander.ts:409-411 owns the map, also cleared on main-thread adopt/stop (gameLoop.ts:641,988) and load (saveLoad.ts:1760). |  |
| S-13 | FIXED | simDelta.ts:661-663 applies paused one-way: if (delta.paused) world.paused = true, so a stale unpaused delta cannot undo a host pause; pause is still extracted in both payloads (:349, :81). | Row is phrased as the fix. |
| S-14 | FIXED | humanTick.ts:990-997 opens the commute window via isWithinWorkCommuteLead with a distance-priced lead (commuteReach.ts:86-93) and tick-precise hour bounds (workSchedule.ts:146-151); humanTick.ts:1278-1283 applies 0.85 damping only when !commuting. | The 0.85 still applies to non-commute on-schedule walks and some soldier/patrol branches by design. |
| S-15 | FIXED | migration.ts:90-128 counts actually placed deer (placed++, including the ring fallback); :188-189 stores that count as activeMigration.spawned; :164-179 computes lost from the placed count and recovers exactly +1 per unharmed year, capped at HERD_BASE_SIZE. |  |
| S-16 | FIXED | simulationEntities.ts:77-83 isValidHuntPrey rejects Human prey with indoorBuildingId != null; Moon Howler prey set includes Human (tickLayerSystems.ts:106) but the prey filter uses isValidHuntPrey (:413-415) and the kill path only receives validated prey (:488-499). |  |
| S-17 | FIXED | housingPipeline.ts:755-808 planCustodianGroupPlacement seats an oversized custodian group by keeping the youngest children with the custodian and overflowing older children to other beds (:842-877 relocateHousehold); reachable from auto-housing via assignFamilyToResidence:1017-1043 and capacity rebalance :937-940. | A legal split needs a home with at least two free beds; that is a genuine capacity limit, not the defect. |
| S-18 | FIXED | workforce.ts:940-992 staffConstructionCrews fills empty staffable sites via assignMissingWorkers (called before progress in dailyBuildingEconomy.ts:207); the progress multiplier (dailyBuildingEconomy.ts:232-233) is 1+0.35*crew when crewed, 1 for passive builds, and 0.22 only for a staffable site that no hand can reach. |  |
| W-01 | FIXED | useGameSession.ts:157-171 awaits the pre-stop save before clearing loopRef; useGamePersistence.ts:135-149 writes the slot synchronously on pagehide; App.tsx:1180-1184 awaits waitForPendingSave before deleteSave; MapSetupScreen.tsx:198-209 arms confirm for a running colony. |  |
| W-02 | FIXED | viewState.ts:388-399 filters saved disasters (string type; finite x/y/radius/duration/progress) and :357-386 filters particles; saveLoad.ts:1474 applies the transient restore on every load path. |  |
| W-03 | FIXED | saveLoad.ts:1233-1244 requires every building width/height to be isFiniteWithin the world axes (themselves bounded to MAP_SIZE_DIMENSIONS at :1265-1266) before restore; the Fishing Spot sampler (saveLoad.ts:574-588) cannot see a 1e16 footprint. |  |
| W-04 | FIXED | saveLoad.ts:950-958 validates non-compact worldMap.width/height with isUsableMapTileCount, bounded by maxSavedMapTiles() derived from MAP_SIZE_DIMENSIONS (:428-452). |  |
| W-05 | FIXED | terrainGrid.ts:349-358 stores pending patches in a Map keyed by tile (repeat write replaces, no cap and no oldest-drop); takeTerrainPatches (:328-346) merges the previous batch with the fresh one. |  |
| W-06 | FIXED | grid.ts:194-260 draws live validity/snap markers in drawBuildSnapOverlay every frame (called from overlay.ts:38-40); entityLayer.ts:71-72 includes buildMode/rotation in the layer key. | Residual: the coarse baked grid plates (grid.ts:270-297) depend on canPlaceBuilding, and the static revision omits research, so a tech unlock can leave those plates stale until the next building/day change. Not the frozen ghost itself. |
| W-07 | FIXED | clearColonySessionState calls stopAllAudio (useGameSession.ts:70-81) on both leave and enter (App.tsx:1125-1173); MapSetupScreen.tsx:171-177 calls ensureIntroAudio on mount and gesture. | The gameplay-music restart call site was not traced end to end. |
| W-08 | FIXED | useGameSession.ts:87-95 clearTransientBuildView nulls buildMode/ghost/strip preview/rotation on every replaceSession; App.tsx:1151-1173 clears battle report, campaign, family tree, placed-house flag and selected type on colony entry; applyLoadedSession is the single load path. |  |
| W-09 | FIXED | workforcePolicy.ts:131-153 ranks barracks and prison first in the defense order; workforce.ts:63/1006 consumes it via jobBuildingPriorityForPolicy. |  |
| W-10 | FIXED | run-full-year.mts:559-562 asserts some alive player human; assert throws (:165-166) and sets exit code 1. The assertion can fail and is not vacuous. | Harness script, not shipped simulation. |
| W-11 | UNVERIFIABLE | No performance gate remains in package.json or scripts/test.mjs; current perf workflows reference existing scripts (perf-population-colony.mts, compare-population-colony.mjs). The specific removed file named by the row can no longer be identified from code. | Weakly consistent with 'file removed; no references remain', but not provable. Found stale workflow path filters naming missing residency*.ts files. |
| W-12 | TEST-ONLY | No production path can establish whether tests are vacuous. Current tests/frontier.legacyEvents.test.ts does contain real assertions, but test quality is not production-code evidence. | Not code-verifiable; register claim concerns the test suite. |
| W-13 | FIXED | useGamePersistence.ts:162-174 awaits exportAuthoritativeWorld and refuses to write when lastExportWasDegraded(); gameLoop.ts:875-918 returns the worker export only after ack. | pagehide and crash-recovery exports intentionally bypass as best-effort paths. |
| W-14 | FIXED | App.tsx:1277-1283 checks saveImportSizeRefusal(file.size) before file.text(); the 64 MiB cap and refusal live in useGamePersistence.ts:80-91. |  |
| W-15 | FIXED | useGamePersistence.ts:102-116 makes a background save join saveInFlight while a manual save chains on the previous promise and writes its own download; the guard clears only for the newest run. |  |
| W-16 | FIXED | GameWorkerHost.ts:427-467 stages the upload in uploadedWorld and assigns worldRef only after pendingUpload resolves, restoring the previous ref on failure/timeout; the worker posts worldUploaded after adoption. |  |
| W-17 | FIXED | GameErrorBoundary.tsx:22-26 reloadGamePage calls window.location.reload, wired to the Reload button at :86-89. |  |
| W-18 | FIXED | useKeyboardControls.ts:106-117,140-141 gates Ctrl+S, hotkeys and window toggles on !e.repeat; useMapKeyboardCursor.ts:103-106 drops repeated activation while allowing movement repeat. |  |
| W-19 | FIXED | GameMenu.tsx:16,238,267 uses getFocusableElements for the trap; the panel is role=dialog with aria-modal=true (:291-295), focus moves inside on open and Tab wraps. |  |
| W-20 | FIXED | useCanvasInteractions.ts:496-499 resets pointer/strip gesture refs on every mousedown; click consumption resets both (:143-145); mouseup ends the drag/stroke (:550-551); cancel resets all (:635-642). |  |
| W-21 | FIXED | simBuffers/schema.ts:29-30 allocates a real energy slot; packRenderSoA.ts:224 writes safeF32(entity.energy); renderSoAReader.ts:180-182 reads it; entityRenderMeta.ts:179 exposes it. |  |
| W-22 | FIXED | applyKinematics.ts:15-28 writes only spriteAngle, animFrame and flash; position, velocity, size, huntTargetId, chatTicks and chatPhrase are explicitly excluded and remain tick-owned. | animFrame is also advanced by the sim (humanMovement.ts:355); the patch only mirrors it onto the display catalogue. |
| W-23 | FIXED | logisticsOverlayData.ts:503-551 keys the memo on exact inputs (worldMap identity, building id/type/position/size/rotation/completed/faction, settler home/work/speed, terrain revision) and recomputes on change (:554-562). |  |
| W-24 | FIXED | renderSnapshot.ts:157-189 drops the hour from the static revision and keys construction progress (b.completed ? 0 : constructionProgress); entityLayer.ts:49-93 uses it without an hour. |  |
| W-25 | FIXED | terrainLayer.ts:251-269 appends material readiness (m{fills}{atlas}{overlay}) plus terrainRegionRevision to the cache key; renderer/terrain.ts:531-537 uses it. | Residual: v4 Whittaker chunks key on terrainRegionRevision only; preloaded sprites make the first bake normally correct. |
| W-26 | FIXED | humanTick.ts:212-221 integrateHumanWalk calls advanceHumanWalkAnim; humanMovement.ts:351-370 is the sole sim phase writer; the renderer only reads/derives presentation (humans.ts:817-820). | The visible walk frame is still sampled from the render clock for smoothness; the stored animFrame is tick-owned. |
| W-28 | FIXED | SelectedBuildingPanel.tsx:159 asks getRepairBuildingEligibility, disables the button at :763 from it, and buildingMaintenanceActions.ts:50-78 owns the gate; no local repair rule remains. |  |
| W-29 | FIXED | SelectedBuildingPanel.tsx:603,621 use canAffordWorkshopRecipe (workshops.ts:94), the same owner the simulation path uses (dailyBuildingEconomy.ts:900). |  |
| W-30 | FIXED | ChallengesPanel.tsx:6-9 and StrategicWorldMap.tsx:31-35 are deliberately not memoised and read live state, so reuse of the same world object cannot freeze counts. | FrontierPanel itself is still memo() at :322, but re-created inline callbacks currently defeat it; latent fragility, not a current freeze. |
| W-31 | FIXED | SelectedBuildingPanel.tsx:181-188 computes owner refusals only for a completed workplace with a job type, and :732-753 renders them; the 'No idle settlers' line is now gated on !building.completed (:734). |  |
| W-32 | FIXED | FamilyTreeWindow.tsx:99-106 derives visibleMemberCount from visibleRows after depth/mode filtering; the subtitle at :149 uses that count. |  |
| W-33 | FIXED | eventLog.ts:14 single GRAVEYARD_CAPACITY_PER_YARD, used by logic at :104 and imported by the UI at SelectedBuildingPanel.tsx:10,197,199. | Residual literal 'up to 50' remains in a buildings.ts:511 description. |
| W-34 | PARTIAL | ActiveEventBanner.tsx:26 and BigNewsBanner.tsx:52 use the valid escaped form w-[min(100%_-_1.5rem,...)], but VillageRequestCard.tsx:20 still has w-[min(100%-1.5rem,24rem)] with no escaped space, which is invalid CSS math. | One invalid arbitrary width survives. |
| W-35 | FIXED | hotelStay.ts:106-111 isStaffedHotel (occupants.length > 0) gates lodgingHotelsFor (:128), findStaffedHotels (:397) and checkInVisitor (:425). | An already-reserved bed is retained without re-checking staffing (:218-256); that is an existing guest, not new lodging. |
| W-36 | FIXED | tradeCaravans.ts:137-147 defines the trip deadline; :359 stamps departure; :421-425 abandons at the deadline; :186-213 refunds exports and removes the carrier; unload deadline at :461-464. |  |
| W-37 | FIXED | buildingMaintenanceActions.ts:42-44 isPlayerOwnedBuilding is the shared gate for repair (:63), upgrade (:151,175), gate toggle (:301), demolish batch (:319) and strip (:360). |  |
| W-38 | PARTIAL | getBuildingConfig exists with a safe fallback (buildingConfig.ts:18-20) and has 26 call sites, but production still has 102 raw BUILDING_CONFIGS[...] index reads (e.g. BuildCatalogPanel.tsx:108, renderer/buildings.ts:167,311, simulationInvariants.ts:23, beautyGrid.ts:48). The replacement is not complete. | The cited proof (buildings.lookup.test.ts) tests findCompletedBuilding, not config lookup. |
| W-39 | FIXED | groupEvents.ts:91 uses day >= active.expiresDay on resolution and :160 the same comparison on the expired branch. |  |
| W-40 | FIXED | buildingStaffingActions.ts:303-307 checks occupants.includes(entity.id) and returns null before the automatic-job refusal. |  |
| W-41 | FIXED | stats.ts:264-271 carries previous + latest for lifetime totals (Math.max(window, stats.totalHumansBorn + latestYear.births.humans)), with marriages/upgrades at :274-277. |  |
| W-42 | FIXED | stats.ts:281 filters the longest-life scan with isPlayerHumanShiftOwner; only the player death path records it (:146-148,160). |  |
| W-43 | FIXED | priorityAlerts.ts:51-53 restricts the housing nudge to completed player Houses/Mansions; both nudges (:112,:126) read that same houses set. |  |
| W-44 | FIXED | villageLeadership.ts:971-993 creditedCeremonyBallot drops non-eligible nominees and sums only credited votes; the ceremony result uses it (:1039-1050). |  |
| W-45 | PARTIAL | getChildCustodian is used only by buildFamilyTree (familyTree.ts:359-371), which has no production caller. The live window (FamilyTreeWindow.tsx:87) calls buildFullFamilyTree (familyTree.ts:870-1187), which labels birth/adoptive parents separately (:803-810) and never applies the custodian rule. | The cited test targets the dead builder. The live tree does not use the canonical custodian. |
| W-46 | FIXED | humanChat.ts:89-97 retainDialogueSessionsForWorld keeps sessions for the same world and clears only when the world is replaced; gameLoop.ts:207,643 call it. |  |
| W-47 | FIXED | famineDesperation.ts:68-78 starts the feud only on a landed bite, and relationships.ts:497 performs the single hurtFriendship. | Dead constant BITE_FRIENDSHIP_HIT_SUCCESS remains in gameConstants.ts:87 with no reader. |
| W-48 | FIXED | director.ts:31-43 resumes the intro when already running; introMusic.ts:131-150 resumes without resetting currentTime to 0. |  |
| W-49 | FIXED | graph.ts:102-109 computes one musicPathGain from effective master/music gains; WebAudio samples and the HTML audio path both use it (htmlAudioSync.ts:19-20). |  |
| W-50 | FIXED | check-docs.mjs:34-52 requires every LINK_DOCS file and resolves relative markdown links; :91-96 exits 1 on problems; wired into test.mjs:26. |  |
| W-51 | FIXED | scripts/test.mjs:29 defines unitAll as vitest run, :92 aliases unit-all, and the menu lists it (:113). |  |
| W-52 | TEST-ONLY | The production gate exists and is deliberately off: worldEvents.ts:32 HOSTILE_WEATHER_ENABLED=false and an early return at :173. The row's fix is a test-assertion change, not a production defect. | Not code-verifiable; production behaviour is the disabled gate. |
| W-53 | FIXED | check-comments.mjs:16-28 resolves COMMENTS_BASE_REF/PR_BASE_SHA/GITHUB_EVENT_PATH; :56-83 uses merge-base and exits 1 when CI supplies no base; :86-115 checks added lines and fails on findings. |  |
| W-54 | FIXED | build-call-graph.mjs:743-767 --verify-owners fails on unregistered functions and when floors (380 files / 3200 functions / 1400 explicit entries) are not met. |  |
| W-55 | FIXED | scripts/test.mjs:36 runs tsc for the vitest, scripts, app and tsconfig.node.json projects. |  |
| W-57 | FIXED | EventLogPanel.tsx:97-100 compares filterChoice.handedOver with initialFilter, so a shell handover wins; useGameShellState.ts:250-257 writes the handover via setLogFilter. | An identical repeated handover value cannot be distinguished from the stored one (edge case). |
| W-58 | FIXED | PopulationPanel.tsx:120-126 counts matches with the same matchesCitizenSearch predicate used to draw visibleRows (:201-206), so count equals drawn rows. | The cited uiPanelFixes test contains no match-count assertion. |
| W-59 | FIXED | VillageLeadershipPanel.tsx:32 calls countEligibleVoters (villageLeadership.ts:264-268), the same owner used to record eligibleVoters at :1051. | electionVotes.ts:50-52 duplicates the predicate verbatim today; latent drift. |
| W-60 | FIXED | stats.ts:146-148 stores entity.age in years; StatisticsPanel.tsx:62 prints the value with 'years'. |  |
| W-61 | FIXED | IntroScreen.tsx:271-330 mounts the particle effect once (deps []); aurora visibility is read through auroraVisibleRef (:172,266-268) and seeding runs only on mount (:295-301). |  |
| W-62 | FIXED | EventLogPanel.tsx:144-158 download handlers pass the full stored events array, not the filtered view; eventLogExport.ts:14-31 serialises every given event. |  |
| W-63 | FIXED | IntroScreen.tsx:625-637 keeps the CTA inert and aria-hidden with opacity/maxHeight zero until readyVisible. | Skip and global click remain available by design. |
| W-64 | FIXED | storyEvents.ts:155-175 dispatches STORY_EXPIRY_RESOLVERS from tickPendingStoryEvents; deerParliament.ts:164-169 and inventionFair.ts:369-377,420-430 resolve their chains on expiry. | invention_fair is absent from the resolver map but resolves through its own daily tick. |
| W-65 | FIXED | weddingDiplomacy.ts:68-78 stores the rival as hashSalt('wedding-rival:'+id) in a story flag and resolves by id match; a removed camp yields undefined instead of retargeting rivalSettlements[0]. |  |
| W-66 | FIXED | guidedCampaign.ts has no choices field or recordGuidedCampaignChoice, and the campaign panel has no choice UI. | Old saves may carry the harmless extra key; it is not validated. |
| W-67 | PARTIAL | socialLife.ts:313-326 correctly uses isFoodAlert (resourceUtils.ts:30-36) for the civic petition, but townHall.ts:168-171 wantsCivicAudience still derives its own food band Math.max(40, humanPopulation*2) instead of the owner's rule. | The cited civicPetition test covers cadence, not the food-alert rule. |
| W-68 | FIXED | wildkinChronicle.ts:85-97 persists the wildkin_sighted_{id} story flag before announcing; the flag survives through storyFlags. |  |
| W-69 | FIXED | tutorialCampaign.ts:67 uses getSeason(w.dayInYear)===Winter; 360-day year/90-day seasons place winter at day 270 and year_two at day 360, matching the copy. |  |
| W-70 | FIXED | housingPipeline.ts:755-808 plans a custodian split (custodian plus youngest in the primary home, older children overflow) and :842-877 seats it via relocateHousehold; reached from auto-housing (:1017-1043). | The register row text is mangled ('tests/... 7 + 197 housing'). |
| W-71 | FIXED | housingPipeline.ts:1268-1327 audits every resident including the manor check and minor/custodian separation; tickLayerAssign.ts:112-134 runs it weekly and logs violations. |  |
| W-72 | FIXED | populationGrowth.ts:265-267 uses getOpenPlayerBeds, which excludes the Leader's House (:232-247), for the empty-beds reason at :308-309. |  |
| W-73 | FIXED | tickLayerAssign.ts:63-72 merges ctx.newEntities into allHumans for the same pulse; :103-108 feeds them to eligibleForHousing. |  |
| W-74 | PARTIAL | housingPipeline.ts:543-554 residenceCapacityRefused is checked inside writeResidence (:557-588, gate :572), and most moveResident callers pass buildings. But the gate returns allow when context.buildings is absent (:550-551), and moonHowlerForm.ts:113 restores a cursed settler to their saved residence via moveResident(were, saved.residenceBuildingId, 'moon-form') with no buildings, so that path seats without the bed cap or roster update. | The writer is the gate, but one production caller bypasses its context. If every bed is retaken while the settler is in wolf form, the revert can overfill the residence. |
| W-75 | TEST-ONLY | No production defect to verify: the claim is that the housing document and a prisoner test were corrected. The production prisoner-bed rule exists (housingPipeline.ts:892,1107-1111; getChildCustodian ignores imprisoned parents). | Docs/tests are excluded from this code audit. |
| W-77 | FIXED | groupEvents.ts:835-842 calls establishCitizenIdentity at the citizenship boundary; settlerTraits.ts:186-193 rolls a missing genome and grantMark (personalMarks.ts:77-91) is idempotent. Visitors are created neutral. |  |
| W-78 | FIXED | humanRelationships.ts:827-831 multiplies the affair conception route by evaluateAptitudeInfluence(entity,'conception').factor, matching the married (:762) and youth (:805) routes. |  |
| W-79 | FIXED | militiaBalance.ts:214-221 computes barricades from plainTotal (DNA-free) times the barricade factor; frontierCombat.ts:269-270 delegates to it. | The >0 gate still reads the DNA-priced militia strength, but only as a zero check. |
| W-80 | FIXED | PersonalityCareerDetails.tsx:98 reads APTITUDE_ACTIVITIES[result.activity].cost, the same registry flag traitEvaluation.ts:71 uses for the signed factor. |  |
| W-81 | FIXED | groupEvents.ts:1015-1023 delegates props to worldEventSites.randomLegalPropPoint (:20-32, buildable and no overlap) and fauna to worldGen.randomPassableWildlifePoint (:100-112); all yearly cases use it. |  |
| W-82 | FIXED | simulationEntities.ts:136-149 killWildGameForPoach is the poach-death owner; groupEvents.ts:401 and rivalEvents.ts:166 call it, with rivalWorldTick.ts:16 binding the ctx. |  |
| W-83 | FIXED | viewState.ts:62 limits CAMP_KEY_PATTERN to visitor keys and :141-145 requires a live group; groupEvents.ts:851-863 hit-tests visitor camps only; markers.ts:44-47 ignores other keys; App.tsx:728-732 opens the strategic tab for rival focus. | Dead rival-key expressions remain in useCanvasInteractions.ts:321-328 but no on-map rival exists to match them. |
| W-84 | FIXED | groupEvents.ts:29 imports getPlayerCampCenter from villageAnchor directly and uses it at :265-268. | factionWander.ts:6 and rivalSettlements.ts:5 still import it through frontierCombat's re-export. |
| W-85 | OBSOLETE-VERIFIED | The strategic-only design is present: hitTestCamp returns visitor camps only (groupEvents.ts:851-863), markers skip rival keys (markers.ts:44-47), and rival camp entities/buildings are retired/pruned (rivalEvents.ts:47,87-110; saveLoad.ts:1660-1683). groupEvents.ts:268 states rivals have no footprint. | Row is a design decision, not a fix; obsolete status is accurate. |
| W-86 | FIXED | groupEvents.ts:1025-1028 canOfferVisitorCamp is the single gate; the yearly pool (:925), mid-year (:1036) and first-week (:1051) paths all use it. |  |
| W-87 | FIXED | campLabel is absent from source; components contain no rival-building inspector branch; the rival-on-map camp entities/structures are retired; raid UI is the FrontierPanel/App owner rather than a duplicate inspector card. | Verified by source search after the batch was time-boxed. |
| W-88 | FIXED | placementUtils.ts:290-300 isUniqueBuildingAlreadyBuilt counts only same-type, non-rival buildings; the catalog uses the same gate (BuildCatalogPanel.tsx:122). |  |
| W-89 | FIXED | placementUtils.ts:306-331 getPlaceBuildingFailureReason is the single decision; preview (useCanvasInteractions.ts:461), commit (buildingPlacementActions.ts:110) and wording (buildingPlacementLabels.ts:35-53) all use it. |  |
| W-90 | FIXED | dailyBuildingEconomy.ts:220-225 builds livingCrew from entityById entries and uses it for the crew count and XP (:242-249). | skills.ts:126-149 still averages the full construction roster; stale dead ids are normally removed on save/cleanup. |
| W-91 | FIXED | buildingAccess.ts:74-120 memoises the route around a building on grid identity, terrainRevision and footprint string. |  |
| W-92 | FIXED | buildingRotation.ts:74 and buildingPlacementLabels.ts:44,51 call getBuildingConfig and do not import raw BUILDING_CONFIGS. | The cited buildings.lookup test exercises findCompletedBuilding, not rotation/labels. |
| W-93 | FIXED | viewState.ts:136-145 resolves a restored camp key against world.visitorGroups and returns null for a vanished camp. |  |
| W-94 | FIXED | No followFavoriteEntity helper remains in src; the live follow is App.tsx:796-818 and clamps through clampCameraTarget. |  |
| W-95 | OBSOLETE-VERIFIED | The refutation holds: notifications are not in WORLD_STATE_SAVE_KEYS (saveSchema.ts:7-53), and restore writes notifications: [] (viewState.ts:387). They are not saved state. | dismissedNotificationIds is saved separately; the notification list is not. |
| W-96 | UNVERIFIABLE | No production check requires saved width/height to equal worldMap dimensions; saveLoad.ts:502-506 regenerates from parsed.width/height bounded only by the largest preset, so a hand-edited mismatch remains possible. | The register already marks this Unproven; code does not close it. |
| W-97 | FIXED | workforce.ts:757-763 compares candidates on priced route travel hours, with a single hypot/speed fallback; commuteReach.ts:385-386 rejects unpriced routes whenever a grid exists. | pickWorkerToTransfer has a mixed hours/pixels fallback at :386-389, currently unreachable on priced routes. |
| W-98 | FIXED | workforce.ts:102-120 staffed is min(cap, countWorkersAtBuilding); there is no max(roster,count). Panel and dashboard call this owner. |  |
| W-99 | FIXED | workAbsence.ts:243-246 checks visible attendance (onShift and atWork) before assigning an illness reason. |  |
| W-100 | FIXED | workSchedule.ts:80-93 keys the cache on raw startHour/endHour via Object.is and re-normalises only when they change. |  |
| W-101 | FIXED | dialogueTrees.ts:585-589 accepts selectionRoll only when finite and clamps the chosen pool index. |  |
| W-102 | FIXED | dialogueTrees.ts:1-2,151-153 loads dialogue from static JSON imports (no disk path); recent-line history is capped at 48 and trimmed oldest-first (:512-524). |  |
| W-103 | FIXED | dialogueTrees.ts:750 maps rain/storm to bad_weather; :670-676 selects storm/rain/snow/drought variants, and matching event keys exist in the ambient data. |  |
| W-104 | PARTIAL | hasDialogueSceneOnDay is enforced only in socialLife.ts:429,436,467 (greeting/banter). The solo social impulse requests a scene ungated at humanLeisureBehavior.ts:281-287, child play requests one at :141, and ambient maybeDialogueChat is ungated at humanTick.ts:434, humanSocial.ts:33 and dialogueTrees.ts:803. | The register's 'Fixed (full day gate)' is not true across all scene families; a settler can still get a solo/impulse scene plus a greeting/banter scene on one colony day. |
| W-105 | FIXED | dashboardData.ts:946-958 builds nearbyAdults from real state/entity/grid inputs and passes them to pickSocialImpulse, matching the sim's inputs. | The grid is passed as undefined, so the same predicate falls back to a linear scan over state.entities. |
| W-106 | FIXED | One isSocialStaggerTick (socialLife.ts:27-29) is used by humanTick.ts:875,1636, humanLeisureBehavior.ts:224 and humanSocial.ts:53; one isGreetingHour (:32-34) is used by humanTick.ts:1635 and socialLife.ts:465. |  |
| W-107 | FIXED | gameLoop.ts:920-925 computes the stall threshold min(15s,max(10s,latency*4)); :1112-1124 adds commandStalled and falls back; GameWorkerHost.ts:93,584-590 enforces a 15s host deadline. |  |
| W-108 | FIXED | gameLoop.ts:71-75 defines the recovery budget; :1084-1089 abandons after 20s; :1149-1176 keeps bounded main-thread ticks while the worker is disabled; recovery disables after three failures (:374-377). | Ticks pause during a full-world import, which the budget bounds. |
| W-109 | FIXED | GameWorkerHost.ts:74 sets MAX_PIPELINE_DEPTH=1, aligned with canPipelineTick (:336-340); vite.config.ts:25-27 configures only ES worker format, with no React worker plugin. |  |
| W-110 | FIXED | Named constants cover the timings: WORKER_STALL_TIMEOUT_MS/WORKER_STALL_CEILING_MS/WORKER_RECOVERY_BUDGET_MS (gameLoop.ts:68-75) and COMMAND_REPLY_DEADLINE_MS (GameWorkerHost.ts:89-93). | The init handshake still uses a literal 15000 at GameWorkerHost.ts:177. |
| W-111 | FIXED | useGameSession.ts:70-81 clearColonySessionState calls cancelStripDemolition and is invoked on both leave and enter (App.tsx:1125-1145,1151-1173). |  |
| W-112 | FIXED | The same boundary clears the battle report via setBattleReport(null) (useGameSession.ts:72). | Row is byte-identical to W-113. |
| W-113 | FIXED | The same boundary clears the family-tree target via setFamilyTreeFor(null) (useGameSession.ts:74). | Duplicate of W-112 in the register. |
| W-114 | FIXED | GameMenu.tsx:440-441 labels the option 'Save on exit' with a hint about the browser slot; useGamePersistence.ts:281-290 gates only the session-stop save, so no periodic save is promised or run. |  |
| W-115 | FIXED | GameInspector.tsx:27,55,62 makes all three render branches role=region with distinct aria labels; the selected branch also sets aria-labelledby (:64-66). |  |
| W-116 | FIXED | gameWorker.ts:196-217 resetWorkerSession calls resetDialogueSessions on init and on importSave/syncWorld (:281,294-296); the main realm clears through retainDialogueSessionsForWorld. |  |
| W-117 | FIXED | gameLoop.ts:888-914 creates one deadline timer before the idle wait, races it against both the idle/command chain and the export reply, and clears it once in finally. |  |
| W-118 | FIXED | villageAnchor.ts:20-29 returns getBuildingCenter for the Town Hall or House anchor, and every camp-anchor caller reads this owner. |  |
| W-119 | FIXED | townHall.ts:187-189 isAtHall is indoor or isAtBuildingReach, which tests the footprint rect plus BUILDING_REACH_RADIUS_PX (buildingAccess.ts:22,140-145). |  |
| W-120 | FIXED | factionWander.ts:52-57 derives visitor POIs from getBuildingCenter, with hunter spots at :86-88. | Cited geometry test does not cover this row. |
| W-121 | FIXED | humanMovement.ts:181-187 venue slots use building.width/2 for the radius and building.y+height/2+standoff for y; all leisure venues call that one function. | Cited geometry test does not cover this row. |
| W-122 | FIXED | worldEventSites.ts:10-13 isLegalCampSite requires buildable ground and no building overlap; pickSite rejects illegal draws (:52,68) and widens to legal ground (:61-72). |  |
| W-123 | FIXED | storyEvents.ts:155-164 registers winter_prep; expireWinterPrep (:570-576) writes winter_prep_lapsed and the day-270/588 check reads it. |  |
| W-124 | FIXED | storyEvents.ts:342-347 expireChildrenShelter calls resolveChildrenShelter(state,'refuse'), which starts the same five-day chain (:314-318) that tickChildrenShelter resolves. |  |
| W-125 | FIXED | storyEvents.ts:535-540 expireRangerVisit sets ranger_visit_lapsed; the howler offer (:664-681) selects HOWLER_VARIANT_TRAVELLER when the visit did not resolve. |  |
| W-126 | FIXED | terrainGrid.ts:320-346 keeps the last batch in previousTerrainPatches and merges it into the next extraction; patchTile keeps one entry per tile (:354-358); simDelta ships and applies it idempotently. |  |
| W-127 | FIXED | personalMarks.ts:77-91 grantMark is the only marks writer and bumps PROFILE_REVISION right after the write (:89). |  |
| W-128 | FIXED | simPrep.ts:170-173 clones dialogueRecentScenes entries and dialogueRecentLines in the rollback snapshot; applySimPrep replaces world.entities with the snapshot (:336). |  |
| W-129 | FIXED | saveLoad.ts:689-832 migrateTickTimeline scales world.tick, world tick fields, entity elapsed counters, tick-keyed records and event stamps. | weatherTimer and InventionFair tick stamps are not scaled; the row's 'every elapsed tick counter' is literally overstated. |
| W-130 | FIXED | WorkHoursWindow.tsx:55 renders GameWindow with centered; GameWindow.tsx:99-116 portals a fixed z-50 modal to body, and App renders it after CitizenOverviewScreen. |  |
| W-131 | OBSOLETE-VERIFIED | No POW/captive dialog exists in current source: WarfareStatus.tsx contains only raid recovery and the terminal report, with no prisoner rows. The feature was removed, so the stale-row defect cannot occur. | The cited proof only asserts that WarfareStatus.tsx has no useMemo; that file no longer contains prisoner content, so the test is vacuous as proof. |
| W-132 | FIXED | BlacksmithForgePanel.tsx:22 uses isBlacksmithStaffed; forge.ts:178-185 returns true when any completed player Blacksmith has occupants, so a second staffed smith silences the warning. | The warning is also gated on !anyReady, and getForgeBlockReason reimplements the same predicate locally. |
| W-133 | FIXED | FamilyTreeWindow.tsx:94-97 bounds shownGenerations by the maximum absolute row delta, and the selector at :165-169 offers only 1..maxGenerations. | The actual guard is tested in uxBatch.interactionWindows.test.ts, not the cited uiPanelFixes file. |
| W-134 | FIXED | ActiveEventBanner.tsx:32-44 uses an sr-only 'Dismiss event:' prefix plus the real title/description/effect as the accessible name, with no overriding aria-label. | The cited a11y test does not contain the banner assertion. |
| W-135 | FIXED | CitizenOverviewScreen.tsx:230 renders working/workforce from uiSimSummary.ts:19-23,82-93, where workforce is adults minus imprisoned and working/idle partition the same count. | Residual same-class drift: the card's warn tone calls hasManyAdultsIdle(overview) (citizenOverview.ts:25-26), which divides idle by adults including prisoners, while the displayed denominator excludes them. |
| W-136 | FIXED | scheduleFatigue.ts:128-150 returns zero ticks for a positive rota with no present ticks; dailyBuildingEconomy.ts:400-445,468-471 prices and teaches only attested workers. | Hunters and the all-zero-day/legacy fallback are documented exceptions that use schedule hours. |
| W-137 | FIXED | migration.ts:90-128 counts actually placed deer including the ring fallback, and :188-189 stores that placed count for the loss/recovery rule (:164-179). |  |
| W-138 | FIXED | dailyPopulation.ts:114-120 spawns the immigrant at buildingAccessPoint(home) (the doorway, buildingAccess.ts:127-134) and focuses the announcement there (:161-163). |  |
| W-139 | FIXED | humanHuntingBehavior.ts:126-129 books the kill (mark dead, clear hunters, particles, sync grids), then :158-178 records only accepted food and floats +addedFood. |  |
| W-140 | FIXED | buildingMaintenanceActions.ts:85-92 and :187-194 put repair/upgrade refusal text at getBuildingCenter(building), not x+width/2. |  |
| W-141 | FIXED | hotkeys.ts:74-96 isEditableTarget returns true only for textarea/contenteditable and text-like inputs, so a focused checkbox no longer swallows hotkeys (useKeyboardControls.ts:100-114). |  |
| W-142 | FIXED | renderSnapshot.ts:197-222 caches the static revision only while the same world, tick, buildings and entities identities hold; a new/loaded world misses and recomputes. | The actual guard is in renderSnapshot.staticLayerKey.test.ts, not the cited visualsAudit test. |
| W-143 | FIXED | App.tsx:199-205 boots the placeholder with initGame({size:Medium,skipTerrain:true}); the real terrain path runs at session start (:1181). | No direct boot-placeholder test was located. |
| W-144 | FIXED | useGameSession.ts:70-81 clears strip demolition, battle report, campaign, family tree, placed-house flag, selected build type, work-hours window, relocation counters and audio on both leave and entry; every replaceSession goes through enterColony. |  |
| W-145 | FIXED | saveLoad.ts:1217-1231 adds finite rules for energy/maxEnergy; :1310-1314 skips absent fields but rejects a present NaN/Infinity/null. |  |
| W-146 | PARTIAL | Alive legacy rivals are fully retired (rivalEvents.ts:81-85,88-97), but pruneOrphanRivalEntities skips !alive (:91) and the load filter drops only departedAlive (saveLoad.ts:1683), so an already-dead rival-faction corpse in a legacy save survives in state.entities. | The cited tests/rivalGhosts.test.ts does not exist. If 'death' meant only settlement destruction, the raze path is complete; as written, the corpse row is not bookkept. |
| W-147 | FIXED | humanLifecycle.ts:152-158 creates Wildkin with SPECIES_CONFIG[EntityType.Wildkin].spawnEnergy (speciesConfig.ts:189-201); entityFactory.ts:123 also uses the config when none is passed. |  |

### N-01…N-31

| ID | Verdict | Code evidence | Notes |
|---|---|---|---|
| N-01 | FIXED | saveLoad.ts:1257-1261 requires a present speed to be a member of PLAYABLE_SPEED_VALUES (gameConstants.ts:221); an absent speed defaults to 1 at saveLoad.ts:1497-1498, and every load path funnels through loadGameFromParsedOutcome. |  |
| N-02 | FIXED | gameWorker.ts:284-290 sends simVersion: GAME_VERSION (version.ts:1); GameWorkerHost.ts:209-216 refuses a mismatch by name (protocol.ts:26-33). The host is the only production spawn path and must receive ready first (:161). |  |
| N-03 | FIXED | gameLoop.ts:1156-1172 loops while the accumulator covers a tick and the catch-up budget allows (budget 12..240, :47-52); the accumulator is capped at 4 ticks (:1098), so the fallback is no longer one tick per frame. |  |
| N-04 | FIXED | dailyBuildingEconomy.ts:362-366 computes hasMill with isCompletedPlayerBuilding(b) (buildings.ts:187-189 requires completed and non-rival); the mill bonus is applied only there. |  |
| N-05 | FIXED | worldGen.ts:651 starts at 0 but :717-718 calls updateStorageCaps, whose sole writer sets Math.max(0, 0.02 - silos*0.012) (economy.ts:68-77); saveLoad.ts:1651-1652 recomputes on an old save. |  |
| N-06 | FIXED | workshopEconomy.ts:56-61,91-99 estimates from getWorkdayAttendance(worker).ticks, the same presence owner production uses (dailyBuildingEconomy.ts:400-401,440-445). |  |
| N-07 | FIXED | barracksAutoFill no longer exists; generic staffing fills every job building to capacity through assignWorkerInPlace (workforce.ts:575-581,721-724,1034-1062), with Barracks capacity 4. |  |
| N-08 | PARTIAL | Idle-hire and job-building counts use countActiveWorkersAtBuilding, which excludes isImprisoned (workforce.ts:81-90,721,1044-1050). But buildWorkforceAssignmentIndex still counts every worker including jailed holders (:225-231), fillFromDonors starts from index.counts (:535,544), staffingCapFor reports the jailed holder as staffed (:114-118), and the bot's firstUnstaffedFoodProducer also uses the jailed-inclusive countWorkersAtBuilding (virtualPlayer.ts:468). A post whose only worker is jailed therefore still reads as covered in the rebalance index and in bot decisions. | The cited proof actually asserts an over-cap pointer roster: tests/economyWorkforce.auditRemediation.test.ts:101-106 expects active=cap and total=cap+jailed.length. It proves backfill, not that a jailed post stops counting as filled. |
| N-09 | FIXED | staffingCapFor returns {cap:0,staffed:0} when BUILDING_JOB_TYPES has no entry (workforce.ts:107-109); TamingPost has no job mapping (gameTypes.ts:170-188), and assignment returns building-has-no-job (buildingStaffingActions.ts:306-317). |  |
| N-10 | FIXED | workforce.ts:258-262 donationFloor keeps at least one worker in a food donor (max(1,maxOccupants-1)); pickOverstaffedDonor (:283-286) and the food-seed path (:280-294) allow lending, and fillFromDonors bypasses the donor-ahead break for food/barracks/prison (:541-547). |  |
| N-11 | FIXED | workforce.ts:1158-1165 orders staffJobsBeforeConstruction, then staffConstructionCrews, then staffJobBuildings; seeding at :999-1032 fills job buildings first. Construction no longer consumes the idle pool first. |  |
| N-12 | FIXED | workforce.ts:583,595-658 swapReachableWorkersIntoVacancies finds a donor who can commute to the vacancy, then assigns a reachable idle settler; bounded to two swaps/eight donor checks and only skipped when route pricing was deferred. |  |
| N-13 | OBSOLETE-VERIFIED | No war-captive field or path exists; prison.occupants is guards plus jailed player offenders only (workforce.ts:674-703), arrest comes from the player scandal path, and legacy rival camp structures are retired (rivalEvents.ts:46-74). | The only 'captive' string is an unrelated aptitude label. |
| N-14 | FIXED | decisionRegistry.ts:414-432 matches the 06:00 social layer in tickLayerDaily.ts:67-88; construction names its real owner/entry (:319-329), indoorBuildingId appears in leisure, walk and spotlight paths, and isPropertyWritePermitted is documented as a contract query (:739,755-768). | Residual drift: tickBuildingProgress is still module-private; the :334 note still says the crew skill multiplier reads building.occupants only (skills.ts:126-128 now filters by workedIds); the :521 scene note omits the ambient path; direct clears in affairs/hospital are not in those write arrays. |
| N-15 | FIXED | Election/omen/story callers read getSimSeed (electionPromises.ts:101; deerParliament.ts:65; weddingDiplomacy.ts:100; travelingTheatre.ts:102; rumourLedger.ts:109; inventionFair.ts:90; renffrStar.ts:55; migration.ts:186). Remaining worldMap.seed reads are terrain generation/rendering or the single adoption bridge in simRng.ts. | Verified by symbol/caller search; simRng.ts was not read line by line. |
| N-16 | FIXED | combat.ts:111-141 combatRoll derives each roll from seededRandomForRun('combat:...') with the entity/tick seed; there is no bespoke LCG left in combat.ts. |  |
| N-17 | FIXED | humanLeisureBehavior.ts:59-63 leisureKindFor picks the kind with seededRandomForRun(`leisure-kind:${entityId}:${slot}`), not id/day arithmetic. |  |
| N-18 | FIXED | simRng.ts:85 assigns leisureIdleDestination salt 839, used at humanLeisureBehavior.ts:183; the hunt dialogue keeps salt 812 (humanHuntingBehavior.ts:203), so the two decisions no longer coincide. | socialLife.ts:385 still uses the literal 716 for a different single-person roll; not the 812 collision. |
| N-19 | FIXED | saveLoad.ts:312-313 serialises the scent sidecar; :624-644 restores it only when cell layout and finite 0..255 values match, capped at 65,536 cells; :1766 rebuilds the runtime grid on load. |  |
| N-20 | FIXED | humanLeisureBehavior.ts:96-129 caches only tickBucket and mateId, then resolves a living entity by id each tick; no live Entity reference is held across rollback. |  |
| N-21 | FIXED | huntVisuals.ts:8-29 retains visuals by startedAtTick; Date.now() only stamps presentation fields (humanHuntingBehavior.ts:141, dailyBuildingEconomy.ts:557) and is never read by a decision. |  |
| N-22 | FIXED | Save feedback is the SaveToast path through callbacks.showToast (useGamePersistence.ts:168-193); the UI no longer writes a floating world text that the next worker delta would erase. |  |
| N-23 | OBSOLETE-VERIFIED | No contacted-capture/recruitment path exists; recruitSettler only admits a new settler from the population pool (settlerInteractionActions.ts:52-85). With the path removed, a recruited prisoner's stale genome cannot occur. |  |
| N-24 | FIXED | enableSeededGlobalRandom remains an exported harness helper (simRng.ts:347-352) but has no production caller; initGame/adopt never install it, and the only native override is the opt-in function. |  |
| N-25 | PARTIAL | simTrig drives the named patrol/gather/birth/camp/wildlife paths (humanTick.ts:1126,1171; humanMovement.ts:158-161; villageLeadership.ts:614-616; humanLifecycle.ts:114; factionWander.ts:127; tickLayerSystems.ts:625). But other runtime simulation position writers still use Math.cos/sin: dailyGrassEcology.ts:59-62 (grass reproduction writes new saved x/y) and worldEventSites.ts:48-51 pickSite (used by runtime visitor-camp spawning, groupEvents.ts:270). | The named paths are migrated, but the same ulp-divergence class survives in two runtime position writers; 'camp' is not fully deterministic. |
| N-26 | FIXED | hospitalCare.ts:310-322 keys the ward note to getAbsoluteCalendarDay(state.tick) % 3, replacing the impossible tick % 864 test. |  |
| N-27 | FIXED | simulationInvariants.ts:252-261 runs the vacant-office branch when villageLeaderId is null and reports any living player still holding LEADER_OCCUPATION. |  |
| N-28 | OBSOLETE-VERIFIED | No rival-human capture path or enemy-captive modules remain; player imprisonment still runs through prison.occupants/releasePrisoners (workforce.ts:1254-1271). |  |
| N-29 | FIXED | clearColonySessionState calls resetHousingRelocationMonitor (useGameSession.ts:70-81), so process-wide relocation counters do not cross a colony boundary. |  |
| N-30 | FIXED | entityCounts.ts:84-103 counts isPlayerHumanShiftOwner (a cursed settler in werewolf form) into counts.humans, and the census runs through computePopulationCounts. |  |
| N-31 | FIXED | tests/tmp-gate.test.ts does not exist; no tmp-gate file remains under tests. |  |

### Focused re-audit F-items (F-1…F-7)

| ID | Verdict | Code evidence | Notes |
|---|---|---|---|
| F-1 | FIXED | Building.campLabel is absent from source (no reference in src, scripts or tests), so the removed field cannot be written by a fixture or production code. | The row is a test-fixture claim; the production type supports the fix. |
| F-2 | FIXED | personPairDayRoll uses separate lanes for both ids (simRng.ts:113-119), and the social decisions use PERSON_DAY_ROLL_SALTS (82-92; socialLife.ts:383,469), removing the old salt+id arithmetic collision in the social gates. | Same class survives outside those gates: hospitalCare.ts:265 uses 901 + best.id (colliding with 902-907 salts), hotelStay.ts:628 uses 913 + hour, humanLeisureBehavior.ts:106,403,510,520 use dynamic salts; ~80 calls still use bare literals. |
| F-3 | DOC-ONLY | Claim concerns DNA documentation and ownership text, not production code. | Cannot be verified without reading other documents, which this audit excludes. |
| F-4 | PARTIAL | The full-day scene gate is enforced only for greeting/banter (socialLife.ts:429,436,467); solo impulse (humanLeisureBehavior.ts:281-287), child play (:141) and ambient chat (dialogueTrees.ts:803 via humanTick.ts:434/humanSocial.ts:33) request scenes ungated. | Same surviving defect as W-104; 'per person per day' is not true across every event family. |
| F-5 | DOC-ONLY | Claim concerns the housing architecture document, not production code. | Cannot be verified without reading other documents, which this audit excludes. |
| F-6 | TEST-ONLY | Claim concerns committed scratch probes versus real frontier regressions; production behaviour is not at stake. | Not code-verifiable. |
| F-7 | DOC-ONLY | Claim concerns remediation claims being written ahead of gates; there is no production behaviour to inspect. | Process/document claim; not code-verifiable. |

### Newly found N-32…N-34

| ID | Verdict | Code evidence | Notes |
|---|---|---|---|
| N-32 | PARTIAL | Normal sentence release and escape are capped: restoreWorkerRosterAfterCustody refuses to re-post past postCap (workforce.ts:455-462), used by releasePrisoners (:1271) and escape (prisonGuardDuty.ts:161). But custody-ending paths that remove the prison itself (buildingMaintenanceActions.ts:244-250, rivalEvents.ts:70-74, saveLoad.ts:1384-1385) only clear prisonBuildingId; syncJobBuildingOccupants then rebuilds occupants from every pointer with no cap (workforce.ts:663-703), and staffJobBuildings fills by active workers while jailed pointers remain (:1044-1062). A 2-post Farm with two jailed reserved pointers plus two substitutes can still rebuild to four pointers, the reported symptom. | staffingCapFor clamps the displayed post to the configured cap (:118), so the overfill is invisible in the panel, and no job-building over-cap invariant exists (housingDiagnostics checks residences only). The cited jail-release test covers normal release only. |
| N-33 | FIXED | Arrest strips the priest from the completed Church roster (humanRelationships.ts:1181-1186); roster sync also excludes jailed holders (workforce.ts:683-688); church strength counts only active workers (:81-90,122-130,146-153). | Latent hole: isEligiblePriest (moonHowler.ts:337-342) does not itself test prisonBuildingId; current safety depends on the arrest/roster cleanup. |
| N-34 | FIXED | getWorkerSkillMultiplier filters participants by workedIds when supplied (skills.ts:123-128), and production passes stats.workedIds (dailyBuildingEconomy.ts:432-433); absent workers contribute no skill factor and earn no XP (:430-433,468-471). |  |

## Appendix — test suite assessment

A separate question was asked after the bug audit: are the 529 test files good, and are they really needed? This appendix measures the suite, samples its style, and reports a judgement. It is not evidence for the bug verdicts above; passing tests were deliberately excluded from those.

### Measured state

| Metric | Value |
|---|---:|
| Test files on disk | 529 |
| Files executed by the unit gate | 527 (full-year and long-run colony are excluded) |
| Test-file lines | 72,667 (source: 398 files, 98,247 lines; ratio 0.74) |
| Test cases / suites | 3,478 / 1,608 |
| Result of the run | 3,478 passed, 0 failed, 0 pending |
| Wall time | 406 s (~6.8 min), 1,450 s summed across files |
| Slow tail | 99 files over 5 s; slowest file 68 s |
| Files with <= 2 tests | 124 (median 4 tests per file) |
| Files importing simulation/world modules | 281; 250 use `initGame`, 58 drive ticks |
| Files rendering components | 6 (SSR `renderToStaticMarkup`) |
| Files mocking modules with `vi.mock` | 17 |
| Files reading source text | 85 (109 source-text assertions) |
| Files casting partial objects to `WorldState` | 115 |
| Skipped/only/todo/snapshot tests | 0 / 0 / 0 / 0 |
| Assertionless tests | 0 |
| `Date.now` in tests / `Math.random` occurrences | 0 / 5 |

### What is good

- The suite is green and deterministic in aggregate: 3,478 tests pass with no skips, no `.only`, no snapshots, and almost no type escapes.
- Most tests exercise the real simulation rather than mocks: 281 files import world/simulation modules, 250 build a real world with `initGame`, and 58 drive real ticks. `vi.mock` appears in only 17 files.
- The heavy year/colony integrations are correctly separated from the unit gate (`unit` excludes them; `unit-all` and the dedicated gates include them).
- There are real asset and wiring checks (shipped PNG/MP3 bytes, save round-trips, worker/main-thread parity) rather than only string assertions.
- Naming is behaviour-oriented and many tests document the defect they pin.

### What is weak

1. **Over-fragmentation.** 529 files for 3,478 tests (median 4 tests/file; 124 files have at most two). 70 pairs of files share an identical import set — eight housing files import the same four modules, five persistence files the same five. Setup is repeated and selective runs are noisy.
2. **Source-text coupling.** 85 files read `src/` and assert identifiers, JSX, class strings or copy (109 assertions). Examples: `strategicWorldMap.windowLayout.test.ts` pins exact Tailwind class strings; `selectedBuildingPanel.perBuildingState.test.ts` has one test for a JSX `key`; `dayLength.owner.test.ts` greps for declarations. These fail on behaviour-preserving refactors and duplicate the existing `scripts/check-*` architecture gates.
3. **A historical audit layer.** 24 files cite audit IDs; 33 files carry audit/regression/low-number names. Much of it overlaps newer per-behaviour tests. Worse, some proofs certify the wrong thing: the N-08 test expects the over-cap jailed roster; the W-45 test targets the dead `buildFamilyTree`; the W-131 test asserts a file with no prisoner content has no `useMemo`; and the W-104 test covers only greeting/banter, never the solo/ambient scenes that still violate the rule.
4. **Partial-world mocks.** 115 files cast partial objects `as unknown as WorldState`. This is acceptable for narrow pure functions, but it lets contract changes pass silently in stateful tests.
5. **Thin UI tier.** Only 6 files render a component. Keyboard ownership, focus traps and several panel rules are asserted by reading source, not by interacting with a DOM. The real-browser gate exists but is separate and narrow.
6. **Timing waits.** `gameLoop.test.ts` uses five real `setTimeout` waits; the project rule prefers real signals. This is a flake and runtime risk.
7. **Slow tail in the unit gate.** 99 files take over 5 s; the slowest (zero-stone quarry autoplay) takes 68 s, followed by map-variety and ground-bake tests at 48-60 s. The changed-only PR gate mitigates this, but the main-branch standard gate is heavy.
8. **The coverage gate measures almost nothing.** Only three calendar owners are instrumented, with 70/65/60/45 thresholds. The rest of the 98k-line source base has no coverage signal from this gate.

### Are they really needed?

- **Behaviour and regression tests: yes.** They are the only executable specification for a deterministic simulation with many interacting rules. The valuable core is roughly half the files (the 281 that import the simulation, plus the render/save/worker checks).
- **Architecture/source guards: the rules are needed, the 85-file home is not.** These belong in the existing `scripts/check-*` gates (`check-function-overlap`, `check-semantic-duplicates`, `check-import-cycles`, `check-ownership-changed`), which already run once in the standard gate. Keeping them as tests makes them slower to run, harder to discover, and brittle against renames.
- **Audit/dated one-offs: mostly no longer needed as separate files.** Keep the regression that covers the behaviour; merge or delete the rest once the newer test is confirmed to cover it.
- **Tiny files: merge by module.** A 16-line file with one source regex costs more in navigation and setup than it returns.
- **Tests that certify a defect or a dead path: not needed at all.** They are worse than absent because they make the dashboard green while the bug survives.

### Suggested disposition

| Category | Files (overlapping) | Disposition |
|---|---:|---|
| Core simulation, save, worker, renderer behaviour | ~281 | Keep; prune tests now covered by a stronger sibling |
| SSR/UI behaviour | 6 | Keep and expand; replace source-text UI guards with render/interaction assertions |
| Source-text / architecture guards | 85 | Move the rules into `scripts/check-*`; keep only the few that cannot be expressed there |
| Audit/dated/one-off regression files | 33 | Review, merge into the owning behaviour file, delete duplicates |
| Files with <= 2 tests | 124 | Merge by module; keep the assertion if it guards real behaviour |
| Tests that certify a defect or dead code | >= 3 | Rewrite or delete (N-08, W-45, W-131) |

Concrete first fixes: rewrite `socialCadence.oneScenePerDay.test.ts` to cover the solo and ambient request paths (it should fail today); change the N-08 assertion from `maxOccupants + jailed.length` to working coverage; point the family-tree custodian test at `buildFullFamilyTree`; delete the W-131 proof; and add a job-building over-cap invariant, since only residences have one.

**Bottom line:** the suite is healthy and mostly valuable — it is not a pile of useless tests. But it is structurally over-fragmented and over-coupled to source text, and a small number of tests certify the wrong behaviour. It is needed; a substantial fraction (source guards, tiny fragments, historical duplicates) does not uniquely verify behaviour and should be consolidated.

## Ownership register check (OWNERSHIP_OVERVIEW.md)

The previous audit asked for the ownership register to be filled in. This pass checked it mechanically and by name.

| Check | Result |
|---|---|
| `node scripts/build-call-graph.mjs --verify-owners` | exit 0 |
| Source files / named functions | 398 / 3,470 |
| Functions with a recorded owner | 3,470 (0 without) |
| Explicit entry functions | 1,581 |
| Functions covered only by a module owner | 1,889 |
| Decision-registry entries | 480 |
| Source modules present by basename | 398 / 398 |
| Functions added by the 2026-11-12 audit remediation commit (`a946d5be..5c368648`) that are named | 18 / 18 |
| Placeholders (`TODO`, `TBD`, `FIXME`, `???`) | 0 |
| Removed subsystems still registered (`warPrisonerCustody`, `warPrisoners`, `campLabel`) | 0 |

**Mechanically, it is complete:** the project’s own gate reports no unregistered function and no missing module, and the new audit functions are all registered. The file was updated on 2026-11-14 02:26 (`5c368648`), after the remediation, and the removed enemy-captive era entries are gone.

**By name, it is not fully filled.** 1,283 of the 3,470 function names do not literally appear in the document; 588 of those are exported. They are covered by module-owner entries such as “Village happiness and beauty” or “Audio graph, scheduling and SFX” rather than by their own named row. Two examples on paths this audit touched: `pruneOrphanRivalEntities` (`rivalEvents.ts`, exported, used by load and the daily rival tick) and `isProductionTick` (`dayCycleClock.ts`, exported, used by forge and every interval producer) — both absent by name, both accepted by the gate as module-owned.

This is a policy gap rather than a broken gate: the ownership file’s header allows module ownership, while `AGENTS.md` rule 5 requires every named function to be accounted for **by name**. If the previous request meant the gate’s standard, it is done. If it meant the rule’s standard, about a third of the names are still implicit, including a large number of exported API functions.

The concurrent working-tree edit adds two more names that are not in the file: `hasSocialSceneOnDay` (exported from `dialogueTrees.ts`) and its private helper `isSocialSceneKey`. They would be accepted by the gate as module-owned, but they are exactly the kind of new named function rule 5 requires to be registered. The ownership file has not been touched by that edit, so it is now one change behind the working tree.

## Component directory check (src/components)

The directory contains **64 files** (58 `.tsx`, 6 `.ts`; 10,831 lines). I checked usage by building the production import graph from `src/main.tsx`, then confirmed with knip and a scoped clone scan.

| Check | Result |
|---|---|
| Files imported by production code | 64 / 64 |
| Files reachable from `src/main.tsx` (static + lazy imports) | 64 / 64 |
| Files imported only by tests or scripts | 0 |
| Files imported by nothing | 0 |
| Knip unused component files | 0 |
| Knip unused component exports | 0 (the only unused export project-wide is `scheduleLastWorkedHours`) |
| Exact normalized duplicate files | 0 |
| jscpd clones at the project threshold (8 lines / 80 tokens) | 0 |
| jscpd clones at a lower threshold (5 lines / 50 tokens) | 2 (a 6-line prop-interface overlap and the 9-line subject-button markup) |
| Component pairs with >= 55% shingle overlap | 0 |

**No component file is unused, and there is no duplicate component file.** Every file is reachable from the app entry, including the lazy-loaded panels; the apparent “pairs” are parent/child or wrapper relationships, not copies: `GameWindow` → `SubjectWindow`/`WorkHoursWindow`, `GameWindow` plus `CollapsibleSection` in the inspectors, `FrontierPanel` → `StrategicWorldMap`, `ChallengesPanel` → `ProgressTabPanel`, `CombatLogPanel` → `LogTabPanel`, `SelectedBuildingPanel`/`SelectedEntityPanel` (different domains), and `GameDashboard`/`CitizenOverviewScreen` (council window vs citizen overview).

There is duplicated **UI pattern code** worth extracting, even though no file is a clone:

- **24-hour picker:** `WorkSchedulePanel.tsx:21-45` defines an `HourSelect`; `VenueSchedulePanel.tsx:42-53` re-implements the same `HOURS_PER_DAY` option list and `HH:00` formatting twice (Opens/Closes). This is the same control and format in two panels.
- **Subject-index list:** the same button markup (`aria-current`, amber/emerald ring classes, icon + label + hint + arrow) appears in `ProgressTabPanel.tsx:335-357`, `VillageTabPanel.tsx:205-230` and, with a different accent, `WorkHoursWindow.tsx:55-74`. A shared `SubjectIndex` would keep the index one implementation.
- **Overlay banner chrome:** `ActiveEventBanner.tsx` and `BigNewsBanner.tsx` repeat the fixed card, dismiss ×, pointer handling, type-colour palette and title/body layout. They serve different data (single active event vs news queue) but the shell could be shared.
- **Hour formatting:** the `String(hour).padStart(2, '0') + ':00'` idiom is repeated in `GameHeader.tsx:33`, `WorkSchedulePanel.tsx:40`, `VenueSchedulePanel.tsx:48`, `SelectedBuildingPanel.tsx:521`, and the domain owners (`venueSchedule.ts:154`, `workAbsence.ts:93`, `workSchedule.ts:170`). There is no single clock-format helper for the UI; `humanSchedule.formatHour` exists but uses a different `am/pm` format and is not used by these panels.
- **Minor:** `CitizenOverviewScreen` and `VillageTabPanel` duplicate a six-line prop-interface block; `GameHeader` declares a local `formatHour` that shadows the canonical function name with a different output format.

Recommended disposition: keep every file, extract `HourSelect` and `SubjectIndex` into shared components, extract a `BannerCard` shell for the two banners, and add one `formatClockHour` helper (or make the canonical `humanSchedule.formatHour` the one formatter if its output is acceptable). No deletion is justified by this pass.

## Limits of this pass

- Verification is static, by code reading and targeted searches. No runtime reproduction of the audited defects and no browser session were performed; a fixed verdict means the defect condition is not reachable on the inspected paths.
- The unit suite was run for the test-suite appendix only (3,478 passed, 0 failed). That run is not used as proof for any bug verdict.
- Several rows have very wide blast radii (save/worker cadence, UI panels, story chains). Those were traced through the primary owner and its callers, not exhaustively through every historical save shape.
- `TEST-ONLY` and `DOC-ONLY` rows intentionally carry no production verdict; they are claims about tests, process or other documents.
- Rows time-boxed by a batch were completed in a follow-up batch (N-16…N-31, F/N-32…N-34) or by direct inspection (W-87, W-111, W-112, W-113).
