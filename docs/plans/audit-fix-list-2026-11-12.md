# Audit fix list — only findings with a fix (2026-11-12)

One row per finding that has an actual code fix. `S-` = simulation, `W-` = whole-code.
Not-fixed / not-a-fix items are listed separately at the bottom.

| ID | Fix | Test |
|---|---|---|
| S-01 | forge.tickVillageForge on the production-day anchor | tests/forge.cadence.test.ts |
| S-02 | tickWildlife apex path, grazer leftovers removed | tests/wildkin.apexRole.test.ts, tests/ecosystemPressure.winterDemand.test.ts |
| S-03 | session stop saves before loop clear; pagehide write | tests/leaveColony.save.test.ts |
| S-04 | delta/prep carry election fields | tests/workerHandoff.state.test.ts |
| S-05 | beauty rebuilt at every hand-off; unconditional draws | tests/workerHandoff.state.test.ts |
| S-06 | resume+integrate walked route; faction/hotel walk recorded | tests/factionTravel.offscreen.test.ts, tests/production.attendancePacing.test.ts |
| S-07 | harvest cleared at the year boundary before the roll | tests/dailyEconomy.ledgerEcology.test.ts |
| S-08 | stored food inflows recorded through the ledger owner | tests/dailyEconomy.ledgerEcology.test.ts |
| S-09 | one day of grass growth; pressure prices the same rule | tests/dailyEconomy.ledgerEcology.test.ts |
| S-10 | hospital ward uses centre + shared reach | tests/hospital.howler.geometry.test.ts |
| S-11 | invariants throw in dev/test; harnesses collect per tick | tests/invariants.collectorCanFail.test.ts, tests/longRunColony.integration.test.ts |
| S-12 | worker reset clears faction wander | tests/workerHandoff.state.test.ts |
| S-13 | paused shipped one-way on the tick delta | tests/workerHandoff.state.test.ts |
| S-14 | commute window opens at shift-lead; no commute damping | tests/workCommute.leadHour.test.ts, tests/production.attendancePacing.test.ts |
| S-15 | herd records placed count and recovers one per unharmed year | tests/invariants.commute.herd.test.ts, tests/migration.herds.test.ts |
| S-16 | indoor settler is not howler prey | tests/hospital.howler.geometry.test.ts |
| S-17 | custodian group seated whole or legally split | tests/housing.custodianSplit.test.ts |
| S-18 | zero-crew types advance at passive pace | tests/production.attendancePacing.test.ts |
| W-01 | one leaveColony path persists before stop | tests/leaveColony.save.test.ts |
| W-02 | transient save pools filtered element-wise | tests/saveBoundary.malformed.test.ts |
| W-03 | footprint bounded before water sampling | tests/saveBoundary.malformed.test.ts |
| W-04 | non-compact map dimensions validated | tests/saveBoundary.malformed.test.ts |
| W-05 | terrain patches coalesce per tile, never evicted | tests/terrain.patchQueue.test.ts |
| W-06 | ghost verdict cloud drawn per frame | tests/visualsAudit.renderWiring.test.ts |
| W-07 | session leave stops all audio | tests/leaveColony.save.test.ts |
| W-08 | session swap clears transient build view | tests/leaveColony.save.test.ts |
| W-09 | defense preset order Barracks/Prison first | tests/production.attendancePacing.test.ts |
| W-10 | year harness asserts living player humans | scripts/run-full-year.mts (harness assertion) |
| W-11 | vacuous benchmark gate deleted | file removed; no references remain |
| W-12 | vacuous scratch tests removed; the five vacuous frontier probes replaced by real assertions | tests/frontier.legacyEvents.test.ts |
| W-13 | final export goes through exportAuthoritativeWorld | tests/leaveColony.save.test.ts |
| W-14 | import size refused before reading | tests/useGamePersistence.test.ts |
| W-15 | manual save queues behind a background save | tests/useGamePersistence.test.ts |
| W-16 | world adopted only after worker ack | tests/gameWorker.uploadWatchdog.test.ts |
| W-17 | error boundary reload action | tests/gameErrorBoundary.test.ts |
| W-18 | key repeat guarded | tests/keyboardGuards.contract.test.ts |
| W-19 | menu uses canonical focus utility and aria-modal | tests/ui-a11y.contract.test.ts |
| W-20 | strip release state reset per gesture | tests/uxBatch.interactionWindows.test.ts |
| W-21 | render SoA carries real energy | tests/visualsAudit.renderWiring.test.ts |
| W-22 | kinematics patch stops writing sim fields | tests/renderer.soaPositionOwnership.test.ts |
| W-23 | logistics memo keyed on exact inputs | tests/audit.hotPathScans.equivalence.test.ts |
| W-24 | static layer key drops hour; progress-keyed rebake | tests/visualsAudit.renderWiring.test.ts |
| W-25 | terrain key carries material readiness | tests/groundChunk.rebake.test.ts |
| W-26 | walk animation moved to the tick owner | tests/humanMovement.test.ts |
| W-28 | repair button uses the repair owner | tests/selectedBuildingPanel.perBuildingState.test.ts |
| W-29 | recipe affordability uses the workshop owner | tests/buildingPanel.staffingRule.test.ts |
| W-30 | frozen panels: memo dropped, live reads | tests/uiPanelFixes.render.test.ts |
| W-31 | refusal rendered for completed workplaces too | tests/buildingPanel.staffingRule.test.ts |
| W-32 | family-tree subtitle counts visible rows | tests/familyTree.test.ts |
| W-33 | graveyard capacity constant single-sourced | tests/uiPanelFixes.render.test.ts |
| W-34 | valid Tailwind arbitrary widths | tests/uiPanelFixes.render.test.ts |
| W-35 | unstaffed hotel lodges nobody | tests/hotelSettlerLodging.night.test.ts |
| W-36 | caravan trip deadline + refund | tests/tradeCaravan.carrierRetention.test.ts |
| W-37 | player-owned maintenance gate | tests/demolish.roundtrip.test.ts |
| W-38 | getBuildingConfig replaces raw lookups | tests/buildings.lookup.test.ts |
| W-39 | provisions expiry day >= | tests/villageRequests.test.ts |
| W-40 | occupancy acceptance before automatic-job | tests/buildingPanel.staffingRule.test.ts |
| W-41 | lifetime totals carry previous + latest | tests/lifetimeRecords.wiring.test.ts |
| W-42 | longest-life scan filters player humans | tests/stats.largestPopulation.test.ts |
| W-43 | player houses only in the shelter nudge | tests/priorityAlerts.housing.test.ts |
| W-44 | credited-ballot tally | tests/villageLeadership.test.ts |
| W-45 | family tree uses canonical custodian | tests/familyTree.test.ts |
| W-46 | scene owner keeps live pairs on re-open | tests/dialogue.pipeline.integration.test.ts |
| W-47 | one friendship hit per landed famine bite | tests/famineDesperation.test.ts |
| W-48 | intro resumes instead of rewinding | tests/audio.introResume.test.ts |
| W-49 | one music-path gain for both players | tests/renderBatch.audioVolume.test.ts |
| W-50 | docs check real paths and fails on missing docs | scripts/check-docs.mjs (gate can fail) |
| W-51 | unit-all alias added | node scripts/test.mjs unit-all |
| W-52 | storm gate asserted instead of skipped | tests/weatherConsequences.test.ts |
| W-53 | comment check resolves a CI base | scripts/check-comments.mjs (gate can fail) |
| W-54 | ownership coverage floors | node scripts/build-call-graph.mjs --verify-owners |
| W-55 | types includes tsconfig.node | node scripts/test.mjs types |
| W-57 | log filter resyncs on handover | tests/eventLogPanel.filters.test.ts |
| W-58 | match count equals drawn rows | tests/uiPanelFixes.render.test.ts |
| W-59 | voter eligibility from the election owner | tests/villageLeadership.test.ts |
| W-60 | life age printed in years | tests/uiPanelFixes.render.test.ts |
| W-61 | intro particles mount once per beat | tests/uiPanelFixes.render.test.ts |
| W-62 | log downloads the full stored set | tests/eventLogPanel.filters.test.ts |
| W-63 | intro CTA inert until ready | tests/ui-a11y.contract.test.ts |
| W-64 | story expiry dispatches per-story resolvers | tests/story.expiryResolvers.test.ts |
| W-65 | wedding rival bound by stable id | tests/weddingDiplomacy.rivalId.test.ts |
| W-66 | dead campaign-choice mechanic removed | tests/guidedCampaign.test.ts |
| W-67 | civic petition uses the food-alert owner | tests/civicPetition.cadence.test.ts |
| W-68 | sighting flag persisted per entity id | tests/wildkin.apexRole.test.ts |
| W-69 | tutorial milestones at canonical onset/day 360 | tests/tutorialCampaign.test.ts |
| W-70 | over-capacity repair never splits the household | tests/housing.custodianSplit.test.ts |
| W-71 | housing audit covers minor/manor and is observed weekly | tests/housingPulse.audit.test.ts |
| W-72 | growth report counts assignable beds only | tests/housingPulse.audit.test.ts |
| W-73 | same-tick arrivals join the housing pulse | tests/residency.dayBoundary.budget.test.ts |
| W-74 | writer enforces residence capacity | tests/residencyCapacity.writers.test.ts |
| W-75 | housing doc and prisoner test corrected | tests/prisonerHousing.assign.test.ts |
| W-77 | citizen identity established at welcome (genome + born mark at citizenship) | tests/frontier.legacyEvents.test.ts |
| W-78 | affair conception applies the activity factor | tests/personality.romanceContext.test.ts |
| W-79 | barricades use a DNA-free total | tests/personality.defenseIntegration.test.ts |
| W-80 | inspector reads the registry cost flag | tests/personalityCareer.inspector.test.ts |
| W-81 | yearly spawns delegate to worldGen/worldEventSites point owners | tests/frontier.legacyEvents.test.ts |
| W-82 | poaching owned by simulationEntities.killWildGameForPoach (rival copy deleted) | tests/frontier.legacyEvents.test.ts |
| W-83 | camp keys visitor-only (string ids); rival keys dropped; rival focus opens the strategic map | tests/campKey.contract.test.ts |
| W-84 | visitor camp imports getPlayerCampCenter from villageAnchor directly | tests/visitorSpawn.gridSync.test.ts |
| W-86 | one canOfferVisitorCamp gate for event flags, mid-year and first-week | tests/frontier.legacyEvents.test.ts |
| W-87 | legacy rival `campLabel` and the unreachable rival-building inspector + duplicate raid card removed; single-owner guards now target the live App raid card | tests/saveMigration.roundtrip.test.ts, tests/uiSingleOwner.test.ts, tests/raidDeadline.owner.test.ts |
| W-88 | unique rule counts player structures | tests/buildGhost.failureReason.test.ts |
| W-89 | one placement decision + label owner | tests/buildGhost.failureReason.test.ts, tests/placementOverlapIndex.equivalence.test.ts |
| W-90 | construction reads a living crew | tests/demolish.roundtrip.test.ts |
| W-91 | building access memo per grid revision | tests/buildingAccess.routeAround.test.ts |
| W-92 | config owner for rotation/labels | tests/buildings.lookup.test.ts |
| W-93 | restored camp key must name a live camp | tests/viewState.coverZoom.test.ts |
| W-94 | dead follow helper removed | removed; App owns the clamping camera follow |
| W-97 | candidate ranking in travel hours | tests/careers.workerFit.test.ts |
| W-98 | staffingCapFor reports counted workers | tests/buildingPanel.staffingRule.test.ts |
| W-99 | visible attendance checked before illness | tests/workAbsence.reasons.test.ts |
| W-100 | work schedule cached by raw window | tests/workSchedule.bounds.test.ts |
| W-101 | dialogue roll validated at the boundary | tests/dialogue.eventRouting.test.ts |
| W-102 | dead disk path removed; line history bounded | tests/dialogue.pipeline.integration.test.ts |
| W-103 | rain/storm map to bad-weather contexts | tests/dialogue.eventRouting.test.ts |
| W-105 | inspector uses the real social inputs | tests/socialCadence.oneScenePerDay.test.ts |
| W-106 | one shared stagger/greeting predicate | tests/socialCadence.oneScenePerDay.test.ts |
| W-107 | hung command fails inside the stall ceiling | tests/gameWorker.uploadWatchdog.test.ts |
| W-108 | bounded recovery budget; main thread keeps ticking | tests/gameWorker.uploadWatchdog.test.ts |
| W-109 | pipeline depth aligned; worker react plugin removed | npx vite build + tests/gameWorker.transport.test.ts |
| W-110 | worker timing constants pinned | tests/gameWorker.uploadWatchdog.test.ts |
| W-111 | stale strip demolition cleared on session swap | tests/leaveColony.save.test.ts |
| W-112 | family-tree target cleared on session swap | tests/leaveColony.save.test.ts |
| W-113 | battle report cleared on session swap | tests/leaveColony.save.test.ts |
| W-114 | save hint matches real behaviour | tests/uiPanelFixes.render.test.ts |
| W-115 | inspector regions have roles | tests/ui-a11y.contract.test.ts |
| W-116 | worker resets dialogue sessions | tests/workerBoundary.closure.test.ts |
| W-117 | export uses one deadline | tests/gameLoop.test.ts |
| W-118 | camp anchor uses footprint centre | tests/geometry.footprintCentre.test.ts |
| W-119 | town-hall service uses centre + reach | tests/geometry.footprintCentre.test.ts |
| W-120 | faction POIs use centre | tests/geometry.footprintCentre.test.ts |
| W-121 | venue standoff half-height | tests/geometry.footprintCentre.test.ts |
| W-122 | camp sites validated on buildable ground | tests/geometry.footprintCentre.test.ts |
| W-123 | winter-prep expiry resolver | tests/story.expiryResolvers.test.ts |
| W-124 | children-shelter expiry resolver | tests/story.expiryResolvers.test.ts |
| W-125 | ranger expiry gives the traveller variant | tests/story.expiryResolvers.test.ts |
| W-126 | terrain patches re-offered after a failed post | tests/terrain.patchQueue.test.ts |
| W-127 | mark writers bump the profile revision | tests/simDelta.entityProfile.test.ts |
| W-128 | rollback deep-copies dialogue history | tests/simPrep.relationshipCopyOnWrite.test.ts |
| W-129 | migration scales every elapsed tick counter | tests/saveLoad.tickResolution.test.ts |
| W-130 | edit-hours window above the overview | tests/uxBatch.interactionWindows.test.ts |
| W-131 | POW dialog re-reads live state | tests/uiPanelFixes.render.test.ts |
| W-132 | forge warning uses the forge staffing owner | tests/buildingPanel.staffingRule.test.ts |
| W-133 | generation selector matches the owner bound | tests/uiPanelFixes.render.test.ts |
| W-134 | event card names its content | tests/ui-a11y.contract.test.ts |
| W-135 | work ratio uses one workforce count | tests/dashboardAggregates.owner.test.ts |
| W-136 | attendance pays only witnessed presence | tests/production.attendancePacing.test.ts |
| W-137 | herd remembers placed deer | tests/migration.herds.test.ts |
| W-138 | immigrant arrives at the doorway | tests/dailyImmigration.gridSync.test.ts |
| W-139 | hunt float uses accepted food; kill fully bookkept | tests/humanHunting.ledger.test.ts |
| W-140 | refusal text at the footprint centre | tests/geometry.footprintCentre.test.ts |
| W-141 | hotkeys survive a checkbox, not text entry | tests/keyboardGuards.contract.test.ts |
| W-142 | static layer revision cached per world | tests/visualsAudit.renderWiring.test.ts |
| W-143 | boot uses a cheap Medium placeholder | tests/uiPanelFixes.render.test.ts |
| W-144 | per-colony window/campaign state reset | tests/leaveColony.save.test.ts |
| W-145 | save rejects non-finite energy | tests/saveBoundary.malformed.test.ts |
| W-146 | legacy rival death fully bookkept | tests/rivalGhosts.test.ts |
| W-147 | Wildkin spawn energy from the species config | tests/humanLifecycle.test.ts |

## Not fixed / not a fix

| ID | Why |
|---|---|
| W-104 | Fixed: the day gate is now per person across every event family, and `tests/socialCadence.oneScenePerDay.test.ts` proves a greeting blocks same-day banter. |
| W-85 | Obsolete: rival settlements are strategic records, not on-map camps; the rival `avoid` entry was removed rather than re-added. |
| W-95 | Refuted: `notifications` are not saved state, so there was no bug to fix. |
| W-96 | Unproven: saved width equals the built map for any save this build writes; no fix was made. |

## Unnumbered findings (NOT in the 162-ID matrix)

The audit also contains findings without `S-`/`W-` IDs in §4.2, §4.3, §4.4 and §5.
The remediation log claims these are fixed; the verification subagent found several still
present in the worktree before touching them. **These are not in the 158 fixed rows above.**

| Finding | Section | Status |
|---|---|---|
| Save accepts any `speed` (0/NaN freezes the colony) | §4.4 | **Fixed** — `PLAYABLE_SPEEDS` validation, `tests/saveBoundary.elementRules.test.ts` |
| Worker ignores `simVersion` in the handshake | §4.4 | **Fixed** — `isWorkerSimVersion`/`workerSimVersionMismatch`, `tests/gameWorker.uploadWatchdog.test.ts` |
| Main-thread fallback runs at most one tick/frame | §4.4 | **Fixed** — `catchUpBudgetFor(speed)`, `tests/gameLoop.fallbackTickRollback.test.ts` |
| `hasMill` counts rival Mills for the player farm bonus | §4.3 | **Fixed** — `isCompletedPlayerBuilding`, `tests/economyWorkforce.auditRemediation.test.ts` |
| Fresh colony starts at 0.03 spoilage while the daily owner writes 0.02 | §4.3 | **Fixed** — `worldGen` calls `updateStorageCaps`, `tests/economyAudit.storageCaps.test.ts` |
| Workshop preview uses yesterday's hours while production uses today's presence | §4.3 | **Fixed** — both read `getWorkdayAttendance`, `tests/workshopEconomy.test.ts` |
| `workforce.barracksAutoFill` asserts `> 1` and leaves a barracks short | §4.4 | **Fixed** — asserts the full post count, `tests/workforce.barracksAutoFill.test.ts` |
| Jailed worker's post counts as filled | §5 | **Fixed** — `countActiveWorkersAtBuilding` excludes jailed holders, `tests/economyWorkforce.auditRemediation.test.ts` |
| Taming Post exposes slots with no job type | §5 | **Fixed** — `staffingCapFor` returns no slots, `tests/economyWorkforce.auditRemediation.test.ts` |
| Full 2-post food building can never donate to a newly completed food site | §5 | **Fixed** — food-seed last resort, `tests/workforce.autoTransferCooldown.test.ts` |
| Construction consumes the idle pool before non-food jobs | §5 | **Fixed** — non-survival pre-seed, `tests/economyWorkforce.auditRemediation.test.ts` |
| No swap pass for a vacancy paired with an unreachable idle settler | §5 | **Fixed** — bounded swap with replacement, `tests/economyWorkforce.auditRemediation.test.ts` |
| Enemy war captives are dropped from `prison.occupants` every assignment pass | §5 | **Obsolete** — enemy war-captive subsystem removed |

**Count:** these 13 are outside the 158 numbered fixes. Treat “158 fixed” as the numbered subset, not the whole audit.
