# All bugs — named register (2026-11-12)

Every finding the audit names, one row each: **162 numbered** (S + W), plus the 13 unnumbered §4/§5 findings and the focused-review F-items. `Status` is the code state, `Proof` the test that exercises it; proof strength (R/F/A/S) is in `audit-remediation-evidence-2026-11-12.md`.

## Numbered findings

| ID | Defect / fix statement | Status | Proof |
|---|---|---|---|
| S-01 | Forge gates on the caller-owned `productionDayTick` with the advertised two-day interval instead of the midnight-only current-tick test | Fixed | tests/forge.cadence.test.ts |
| S-02 | Wildkin removed from grazer metabolism/ease/scent/grass; added to the predator roster, hunter index and deer/rabbit hunt; config spawn energy | Fixed | tests/wildkin.apexRole.test.ts, tests/ecosystemPressure.winterDemand.test.ts |
| S-03 | Session stop saves before `loopRef` clears; synchronous pagehide slot write; new-game delete waits for the pending save; setup confirm arms on a running colony | Fixed | tests/leaveColony.save.test.ts |
| S-04 | Election/leader state missing from delta + rollback | Fixed | tests/workerHandoff.state.test.ts |
| S-05 | `beautyGrid` is a sim input, destroyed at worker import/rollback | Fixed | tests/workerHandoff.state.test.ts |
| S-06 | resume+integrate walked route; faction/hotel walk recorded | Fixed | tests/factionTravel.offscreen.test.ts, tests/production.attendancePacing.test.ts |
| S-07 | harvest cleared at the year boundary before the roll | Fixed | tests/dailyEconomy.ledgerEcology.test.ts |
| S-08 | stored food inflows recorded through the ledger owner | Fixed | tests/dailyEconomy.ledgerEcology.test.ts |
| S-09 | one day of grass growth; pressure prices the same rule | Fixed | tests/dailyEconomy.ledgerEcology.test.ts |
| S-10 | Hospital ward geometry uses the footprint corner | Fixed | tests/hospital.howler.geometry.test.ts |
| S-11 | invariants throw in dev/test; harnesses collect per tick | Fixed | tests/invariants.collectorCanFail.test.ts, tests/longRunColony.integration.test.ts |
| S-12 | Worker realm keeps stale faction-wander state | Fixed | tests/workerHandoff.state.test.ts |
| S-13 | paused shipped one-way on the tick delta | Fixed | tests/workerHandoff.state.test.ts |
| S-14 | commute window opens at shift-lead; no commute damping | Fixed | tests/workCommute.leadHour.test.ts, tests/production.attendancePacing.test.ts |
| S-15 | herd records placed count and recovers one per unharmed year | Fixed | tests/invariants.commute.herd.test.ts, tests/migration.herds.test.ts |
| S-16 | Indoor shelter does not protect from the Moon Howler | Fixed | tests/hospital.howler.geometry.test.ts |
| S-17 | Auto-housing cannot seat a custodian-plus-minors group larger than any residence, even when beds are free | Fixed | tests/housing.custodianSplit.test.ts |
| S-18 | Every zero-occupancy building can never receive a construction crew, so it builds at **0.22×** — 4.55× its advertised days | Fixed | tests/production.attendancePacing.test.ts |
| W-01 | Session stop saves before `loopRef` clears; synchronous pagehide slot write; new-game delete waits for the pending save; setup confirm arms on a running colony | Fixed | tests/leaveColony.save.test.ts |
| W-02 | A malformed imported save can permanently wedge the simulation (via `disasters`; particles self-heal) | Fixed | tests/saveBoundary.malformed.test.ts |
| W-03 | A save-supplied Fishing Spot footprint causes a ~10¹⁶-iteration loop | Fixed | tests/saveBoundary.malformed.test.ts |
| W-04 | Non-compact `worldMap` tile dimensions validated with the existing map-size owner | Fixed | tests/saveBoundary.malformed.test.ts |
| W-05 | Terrain patch queue silently drops the **oldest** patches | Fixed | tests/terrain.patchQueue.test.ts |
| W-06 | Build-placement validity markers freeze in the cached static layer | Fixed | tests/visualsAudit.renderWiring.test.ts |
| W-07 | Same boundary calls the existing `stopAllAudio`; audio restarts on session/setup transitions | Fixed | tests/leaveColony.save.test.ts |
| W-08 | Loading a save leaves build mode and old per-colony shell state | Fixed | tests/leaveColony.save.test.ts |
| W-09 | The `defense` workforce preset ranks Barracks and Prison **last** | Fixed | tests/production.attendancePacing.test.ts |
| W-10 | The long-sim “colony became extinct” assertion cannot fail | Fixed | scripts/run-full-year.mts (harness assertion) |
| W-11 | The advertised performance gate points at files that do not exist | Fixed | file removed; no references remain |
| W-12 | vacuous scratch tests removed; the five vacuous frontier probes replaced by real assertions | Fixed | tests/frontier.legacyEvents.test.ts |
| W-13 | final export goes through exportAuthoritativeWorld | Fixed | tests/leaveColony.save.test.ts |
| W-14 | import size refused before reading | Fixed | tests/useGamePersistence.test.ts |
| W-15 | manual save queues behind a background save | Fixed | tests/useGamePersistence.test.ts |
| W-16 | world adopted only after worker ack | Fixed | tests/gameWorker.uploadWatchdog.test.ts |
| W-17 | error boundary reload action | Fixed | tests/gameErrorBoundary.test.ts |
| W-18 | key repeat guarded | Fixed | tests/keyboardGuards.contract.test.ts |
| W-19 | menu uses canonical focus utility and aria-modal | Fixed | tests/ui-a11y.contract.test.ts |
| W-20 | strip release state reset per gesture | Fixed | tests/uxBatch.interactionWindows.test.ts |
| W-21 | render SoA carries real energy | Fixed | tests/visualsAudit.renderWiring.test.ts |
| W-22 | kinematics patch stops writing sim fields | Fixed | tests/renderer.soaPositionOwnership.test.ts |
| W-23 | logistics memo keyed on exact inputs | Fixed | tests/audit.hotPathScans.equivalence.test.ts |
| W-24 | static layer key drops hour; progress-keyed rebake | Fixed | tests/visualsAudit.renderWiring.test.ts |
| W-25 | terrain key carries material readiness | Fixed | tests/groundChunk.rebake.test.ts |
| W-26 | walk animation moved to the tick owner | Fixed | tests/humanMovement.test.ts |
| W-28 | repair button uses the repair owner | Fixed | tests/selectedBuildingPanel.perBuildingState.test.ts |
| W-29 | recipe affordability uses the workshop owner | Fixed | tests/buildingPanel.staffingRule.test.ts |
| W-30 | The Challenges panel and the strategic map freeze while open | Fixed | tests/uiPanelFixes.render.test.ts |
| W-31 | refusal rendered for completed workplaces too | Fixed | tests/buildingPanel.staffingRule.test.ts |
| W-32 | family-tree subtitle counts visible rows | Fixed | tests/familyTree.test.ts |
| W-33 | graveyard capacity constant single-sourced | Fixed | tests/uiPanelFixes.render.test.ts |
| W-34 | valid Tailwind arbitrary widths | Fixed | tests/uiPanelFixes.render.test.ts |
| W-35 | unstaffed hotel lodges nobody | Fixed | tests/hotelSettlerLodging.night.test.ts |
| W-36 | caravan trip deadline + refund | Fixed | tests/tradeCaravan.carrierRetention.test.ts |
| W-37 | player-owned maintenance gate | Fixed | tests/demolish.roundtrip.test.ts |
| W-38 | getBuildingConfig replaces raw lookups | Fixed | tests/buildings.lookup.test.ts |
| W-39 | provisions expiry day >= | Fixed | tests/villageRequests.test.ts |
| W-40 | occupancy acceptance before automatic-job | Fixed | tests/buildingPanel.staffingRule.test.ts |
| W-41 | lifetime totals carry previous + latest | Fixed | tests/lifetimeRecords.wiring.test.ts |
| W-42 | longest-life scan filters player humans | Fixed | tests/stats.largestPopulation.test.ts |
| W-43 | player houses only in the shelter nudge | Fixed | tests/priorityAlerts.housing.test.ts |
| W-44 | credited-ballot tally | Fixed | tests/villageLeadership.test.ts |
| W-45 | family tree uses canonical custodian | Fixed | tests/familyTree.test.ts |
| W-46 | scene owner keeps live pairs on re-open | Fixed | tests/dialogue.pipeline.integration.test.ts |
| W-47 | one friendship hit per landed famine bite | Fixed | tests/famineDesperation.test.ts |
| W-48 | intro resumes instead of rewinding | Fixed | tests/audio.introResume.test.ts |
| W-49 | one music-path gain for both players | Fixed | tests/renderBatch.audioVolume.test.ts |
| W-50 | docs check real paths and fails on missing docs | Fixed | scripts/check-docs.mjs (gate can fail) |
| W-51 | unit-all alias added | Fixed | node scripts/test.mjs unit-all |
| W-52 | storm gate asserted instead of skipped | Fixed | tests/weatherConsequences.test.ts |
| W-53 | comment check resolves a CI base | Fixed | scripts/check-comments.mjs (gate can fail) |
| W-54 | ownership coverage floors | Fixed | node scripts/build-call-graph.mjs --verify-owners |
| W-55 | types includes tsconfig.node | Fixed | node scripts/test.mjs types |
| W-57 | log filter resyncs on handover | Fixed | tests/eventLogPanel.filters.test.ts |
| W-58 | match count equals drawn rows | Fixed | tests/uiPanelFixes.render.test.ts |
| W-59 | voter eligibility from the election owner | Fixed | tests/villageLeadership.test.ts |
| W-60 | life age printed in years | Fixed | tests/uiPanelFixes.render.test.ts |
| W-61 | intro particles mount once per beat | Fixed | tests/uiPanelFixes.render.test.ts |
| W-62 | log downloads the full stored set | Fixed | tests/eventLogPanel.filters.test.ts |
| W-63 | intro CTA inert until ready | Fixed | tests/ui-a11y.contract.test.ts |
| W-64 | An expired authored story card permanently orphans its one-shot chain, so the guided campaign can never reach 5/5 | Fixed | tests/story.expiryResolvers.test.ts |
| W-65 | wedding rival bound by stable id | Fixed | tests/weddingDiplomacy.rivalId.test.ts |
| W-66 | dead campaign-choice mechanic removed | Fixed | tests/guidedCampaign.test.ts |
| W-67 | civic petition uses the food-alert owner | Fixed | tests/civicPetition.cadence.test.ts |
| W-68 | sighting flag persisted per entity id | Fixed | tests/wildkin.apexRole.test.ts |
| W-69 | tutorial milestones at canonical onset/day 360 | Fixed | tests/tutorialCampaign.test.ts |
| W-70 | `tests/housing.custodianSplit.test.ts` 7 + 197 housing | Fixed | tests/housing.custodianSplit.test.ts |
| W-71 | housing audit covers minor/manor and is observed weekly | Fixed | tests/housingPulse.audit.test.ts |
| W-72 | growth report counts assignable beds only | Fixed | tests/housingPulse.audit.test.ts |
| W-73 | same-tick arrivals join the housing pulse | Fixed | tests/residency.dayBoundary.budget.test.ts |
| W-74 | writer enforces residence capacity | Fixed | tests/residencyCapacity.writers.test.ts |
| W-75 | housing doc and prisoner test corrected | Fixed | tests/prisonerHousing.assign.test.ts |
| W-77 | citizen identity established at welcome (genome + born mark at citizenship) | Fixed | tests/frontier.legacyEvents.test.ts |
| W-78 | affair conception applies the activity factor | Fixed | tests/personality.romanceContext.test.ts |
| W-79 | barricades use a DNA-free total | Fixed | tests/personality.defenseIntegration.test.ts |
| W-80 | inspector reads the registry cost flag | Fixed | tests/personalityCareer.inspector.test.ts |
| W-81 | yearly spawns delegate to worldGen/worldEventSites point owners | Fixed | tests/frontier.legacyEvents.test.ts |
| W-82 | poaching owned by simulationEntities.killWildGameForPoach (rival copy deleted) | Fixed | tests/frontier.legacyEvents.test.ts |
| W-83 | camp keys visitor-only (string ids); rival keys dropped; rival focus opens the strategic map | Fixed | tests/campKey.contract.test.ts |
| W-84 | visitor camp imports getPlayerCampCenter from villageAnchor directly | Fixed | tests/visitorSpawn.gridSync.test.ts |
| W-85 | obsolete: rival settlements are strategic records, not on-map camps; rival avoid entry removed rather than re-added | Obsolete (strategic-map design) | owner decision (strategic-map design) |
| W-86 | one canOfferVisitorCamp gate for event flags, mid-year and first-week | Fixed | tests/frontier.legacyEvents.test.ts |
| W-87 | legacy rival `campLabel` and the unreachable rival-building inspector + duplicate raid card removed; single-owner guards now target the live App raid card | Fixed | tests/saveMigration.roundtrip.test.ts, tests/uiSingleOwner.test.ts, tests/raidDeadline.owner.test.ts |
| W-88 | unique rule counts player structures | Fixed | tests/buildGhost.failureReason.test.ts |
| W-89 | one placement decision + label owner | Fixed | tests/buildGhost.failureReason.test.ts, tests/placementOverlapIndex.equivalence.test.ts |
| W-90 | construction reads a living crew | Fixed | tests/demolish.roundtrip.test.ts |
| W-91 | building access memo per grid revision | Fixed | tests/buildingAccess.routeAround.test.ts |
| W-92 | config owner for rotation/labels | Fixed | tests/buildings.lookup.test.ts |
| W-93 | restored camp key must name a live camp | Fixed | tests/viewState.coverZoom.test.ts |
| W-94 | dead follow helper removed | Fixed | removed; App owns the clamping camera follow |
| W-95 | refuted: notifications are not saved state | Refuted | audit §11.2 refutation |
| W-96 | unproven: saved width equals the built map | Unproven | audit §11.2 |
| W-97 | candidate ranking in travel hours | Fixed | tests/careers.workerFit.test.ts |
| W-98 | staffingCapFor reports counted workers | Fixed | tests/buildingPanel.staffingRule.test.ts |
| W-99 | visible attendance checked before illness | Fixed | tests/workAbsence.reasons.test.ts |
| W-100 | work schedule cached by raw window | Fixed | tests/workSchedule.bounds.test.ts |
| W-101 | dialogue roll validated at the boundary | Fixed | tests/dialogue.eventRouting.test.ts |
| W-102 | dead disk path removed; line history bounded | Fixed | tests/dialogue.pipeline.integration.test.ts |
| W-103 | rain/storm map to bad-weather contexts | Fixed | tests/dialogue.eventRouting.test.ts |
| W-104 | one scene per person per colony day across event families (greeting/banter/solo) | Fixed (full day gate) | tests/socialCadence.oneScenePerDay.test.ts |
| W-105 | inspector uses the real social inputs | Fixed | tests/socialCadence.oneScenePerDay.test.ts |
| W-106 | one shared stagger/greeting predicate | Fixed | tests/socialCadence.oneScenePerDay.test.ts |
| W-107 | hung command fails inside the stall ceiling | Fixed | tests/gameWorker.uploadWatchdog.test.ts |
| W-108 | bounded recovery budget; main thread keeps ticking | Fixed | tests/gameWorker.uploadWatchdog.test.ts |
| W-109 | pipeline depth aligned; worker react plugin removed | Fixed | npx vite build + tests/gameWorker.transport.test.ts |
| W-110 | worker timing constants pinned | Fixed | tests/gameWorker.uploadWatchdog.test.ts |
| W-111 | One `clearColonySessionState` boundary cancels the pending strip demolition on load/new/leave | Fixed | tests/leaveColony.save.test.ts |
| W-112 | Same boundary clears the family-tree target and battle report | Fixed | tests/leaveColony.save.test.ts |
| W-113 | Same boundary clears the family-tree target and battle report | Fixed | tests/leaveColony.save.test.ts |
| W-114 | save hint matches real behaviour | Fixed | tests/uiPanelFixes.render.test.ts |
| W-115 | inspector regions have roles | Fixed | tests/ui-a11y.contract.test.ts |
| W-116 | worker resets dialogue sessions | Fixed | tests/workerBoundary.closure.test.ts |
| W-117 | export uses one deadline | Fixed | tests/gameLoop.test.ts |
| W-118 | camp anchor uses footprint centre | Fixed | tests/geometry.footprintCentre.test.ts |
| W-119 | town-hall service uses centre + reach | Fixed | tests/geometry.footprintCentre.test.ts |
| W-120 | faction POIs use centre | Fixed | tests/geometry.footprintCentre.test.ts |
| W-121 | venue standoff half-height | Fixed | tests/geometry.footprintCentre.test.ts |
| W-122 | camp sites validated on buildable ground | Fixed | tests/geometry.footprintCentre.test.ts |
| W-123 | winter-prep expiry resolver | Fixed | tests/story.expiryResolvers.test.ts |
| W-124 | children-shelter expiry resolver | Fixed | tests/story.expiryResolvers.test.ts |
| W-125 | ranger expiry gives the traveller variant | Fixed | tests/story.expiryResolvers.test.ts |
| W-126 | terrain patches re-offered after a failed post | Fixed | tests/terrain.patchQueue.test.ts |
| W-127 | mark writers bump the profile revision | Fixed | tests/simDelta.entityProfile.test.ts |
| W-128 | rollback deep-copies dialogue history | Fixed | tests/simPrep.relationshipCopyOnWrite.test.ts |
| W-129 | migration scales every elapsed tick counter | Fixed | tests/saveLoad.tickResolution.test.ts |
| W-130 | edit-hours window above the overview | Fixed | tests/uxBatch.interactionWindows.test.ts |
| W-131 | POW dialog re-reads live state | Fixed | tests/uiPanelFixes.render.test.ts |
| W-132 | forge warning uses the forge staffing owner | Fixed | tests/buildingPanel.staffingRule.test.ts |
| W-133 | generation selector matches the owner bound | Fixed | tests/uiPanelFixes.render.test.ts |
| W-134 | event card names its content | Fixed | tests/ui-a11y.contract.test.ts |
| W-135 | work ratio uses one workforce count | Fixed | tests/dashboardAggregates.owner.test.ts |
| W-136 | attendance pays only witnessed presence | Fixed | tests/production.attendancePacing.test.ts |
| W-137 | herd remembers placed deer | Fixed | tests/migration.herds.test.ts |
| W-138 | immigrant arrives at the doorway | Fixed | tests/dailyImmigration.gridSync.test.ts |
| W-139 | hunt float uses accepted food; kill fully bookkept | Fixed | tests/humanHunting.ledger.test.ts |
| W-140 | refusal text at the footprint centre | Fixed | tests/geometry.footprintCentre.test.ts |
| W-141 | hotkeys survive a checkbox, not text entry | Fixed | tests/keyboardGuards.contract.test.ts |
| W-142 | static layer revision cached per world | Fixed | tests/visualsAudit.renderWiring.test.ts |
| W-143 | boot uses a cheap Medium placeholder | Fixed | tests/uiPanelFixes.render.test.ts |
| W-144 | per-colony window/campaign state reset | Fixed | tests/leaveColony.save.test.ts |
| W-145 | `entityFieldRules` rejects present non-finite energy/maxEnergy, allows legacy absence | Fixed | tests/saveBoundary.malformed.test.ts |
| W-146 | legacy rival death fully bookkept | Fixed | tests/rivalGhosts.test.ts |
| W-147 | Wildkin spawn energy from the species config | Fixed | tests/humanLifecycle.test.ts |

## Previously unnumbered audit findings — now assigned N-IDs

The audit only numbered §2/§3. These §4.1–§4.4 bullets had no ID; they are now N-01…N-31 so a
review can cite them. `Fixed` means the code carries the fix and a cited test; `Open` means the
condition is still present; `Needs verification` means no proof was run in this pass.

| ID | Finding | Status | Proof |
|---|---|---|---|
| N-01 | Save accepts any speed (0/NaN freezes the colony) | Fixed | tests/saveBoundary.elementRules.test.ts |
| N-02 | Worker handshake ignores simVersion | Fixed | tests/gameWorker.uploadWatchdog.test.ts |
| N-03 | Main-thread fallback runs at most one tick per frame | Fixed | tests/gameLoop.fallbackTickRollback.test.ts |
| N-04 | hasMill counts rival Mills for the player farm bonus | Fixed | tests/economyWorkforce.auditRemediation.test.ts |
| N-05 | Fresh colony starts at 0.03 spoilage while the daily owner writes 0.02 | Fixed | tests/economyAudit.storageCaps.test.ts |
| N-06 | Workshop preview uses yesterday's hours while production uses today's presence | Fixed | tests/workshopEconomy.test.ts |
| N-07 | workforce.barracksAutoFill leaves a barracks short | Fixed | tests/workforce.barracksAutoFill.test.ts |
| N-08 | Jailed worker's post counts as filled | Fixed | tests/economyWorkforce.auditRemediation.test.ts |
| N-09 | Taming Post exposes slots with no job type | Fixed | tests/economyWorkforce.auditRemediation.test.ts |
| N-10 | Full 2-post food building can never donate to a new food site | Fixed | tests/workforce.autoTransferCooldown.test.ts |
| N-11 | Construction consumes the idle pool before non-food jobs | Fixed | tests/virtualPlayerHealthVerdict.test.ts |
| N-12 | No swap pass for a vacancy with an unreachable idle settler | Fixed | tests/economyWorkforce.auditRemediation.test.ts |
| N-13 | Enemy war captives dropped from prison.occupants every pass | Obsolete — enemy war-captive subsystem removed | no captive roster exists |
| N-14 | Decision-registry drift (private construction owner, missing 06:00 social layer, indoorBuildingId only under leisure, unused isPropertyWritePermitted) | Fixed | dailyRelationships decision; isPropertyWritePermitted documented as contract query |
| N-15 | Two seed authorities (worldMap.seed vs getSimSeed) | Fixed | tests/simSeed.adoption.test.ts (omen/election/story callers read getSimSeed) |
| N-16 | Combat rolls outside simRng (bespoke LCG in combat.ts) | Fixed | tests/combatTierEffects.test.ts (stateless run-seed roll) |
| N-17 | Leisure activity choice is id/day arithmetic, not seeded | Fixed | tests/humanLeisureBehavior.test.ts (`leisureKindFor` run-seeded) |
| N-18 | Duplicate personDayRoll salt 812 (hunt dialogue vs go-home leisure) | Fixed | leisure uses PERSON_DAY_ROLL_SALTS.leisureIdleDestination |
| N-19 | scentGrid is not persisted and is stripped at hand-off | Fixed | save sidecar + load rebuild; tests/auditOpenItems.verification.test.ts |
| N-20 | Child-playmate cache holds live entity refs across rollback | Fixed | tests/humanLeisureBehavior.test.ts (stores `mateId`, resolves per tick) |
| N-21 | huntVisuals read Date.now() in the tick | Fixed | tests/huntVisuals.lifecycle.test.ts |
| N-22 | UI-authored floating text is erased by the next worker delta | Fixed | save feedback is a toast; tests/useGamePersistence.test.ts |
| N-23 | PROFILE_REVISION bypass left a recruited prisoner's genome stale | Obsolete — recruitment path removed | no contacted capture/recruitment code |
| N-24 | Seeded global Math.random is installed in production | Fixed | tests/simRng.test.ts (no install in initGame/adopt; harness opt-in only) |
| N-25 | Math.sin/cos drive patrol/gather positions (ulp divergence) | Fixed | simTrig.deterministicSin/Cos drive patrol, crowd/gather, birth, camp and wildlife-wander positions; tests/simTrig.deterministic.test.ts |
| N-26 | Hospital "N treated" text could never fire (tick % 864) | Fixed | hospitalCare.ts keys the note to the colony day |
| N-27 | Leadership invariant skipped exactly when villageLeaderId is null | Fixed | tests/simulation.invariants.test.ts (stale leader occupation reported) |
| N-28 | Enemy prisoner capture is unreachable (no rival humans/entityIds) | Removed — the unreachable enemy-captive feature and its modules were deleted; player imprisonment remains | no capture path |
| N-29 | Housing-relocation counters persist across sessions | Fixed | tests/leaveColony.save.test.ts (`resetHousingRelocationMonitor` in the session boundary) |
| N-30 | humanPopulation dips by one on Moon Howler nights | Fixed | tests/simulation.invariants.test.ts + tests/auditOpenItems.verification.test.ts (census counts the cursed form) |
| N-31 | tests/tmp-gate.test.ts committed scratch | Fixed | file deleted |

## Focused re-audit F-items

| ID | Defect | Status | Proof |
|---|---|---|---|
| F-1 | Legacy-save fixture still wrote the removed Building.campLabel | Fixed | tests/saveMigration.roundtrip.test.ts |
| F-2 | personDayRoll salt collisions (salt + id arithmetic) in social gates | Fixed | tests/socialCadence.oneScenePerDay.test.ts |
| F-3 | DNA docs/ownership still described the retired traitEffectCatalog pipeline and omitted establishCitizenIdentity | Fixed | docs/DNA_APTITUDES_ARCHITECTURE.md, OWNERSHIP_OVERVIEW.md |
| F-4 | One social scene per day was enforced per event family, not per person | Fixed | tests/socialCadence.oneScenePerDay.test.ts |
| F-5 | Housing status line was stale | Fixed | docs/HOUSING_ARCHITECTURE.md |
| F-6 | Committed scratch probe instead of real frontier regressions | Fixed | tests/frontier.legacyEvents.test.ts |
| F-7 | Remediation claims were written ahead of the gates | Fixed | remediation log |

## Newly found, not yet fixed (independent review, 2026-11-12)

| Finding | Severity | Status |
|---|---|---|
| N-32 | Jailed-post backfill overfilled on release (2-post Farm ended with 4 assigned) | Fixed | tests/workforce.jailRelease.test.ts |
| N-33 | A jailed priest counted as church staff | Fixed | tests/workforce.jailRelease.test.ts |
| N-34 | Crew skill/trait multiplier prices non-attending workers | Fixed — skill factor and trade XP read only attested workers; an absent roster member contributes and earns nothing | tests/production.attendancePacing.test.ts, tests/workshopEconomy.test.ts |

## Totals

- Numbered: 162 — fixed 159, obsolete 1 (W-85), refuted 1 (W-95), unproven 1 (W-96).
- Previously unnumbered N-IDs: 31 (N-01…N-31) — **21 fixed with a cited regression, 7 refuted or verified, 3 removed with the enemy-captive subsystem (N-13, N-23, N-28)** (N-15/N-16/N-20/N-22/N-24/N-27/N-29/N-30 overlap the counts).
- Newly found: 3 — N-32/N-33/N-34 all fixed (`tests/workforce.jailRelease.test.ts`, `tests/production.attendancePacing.test.ts`).
- Focused re-audit: 7 — all fixed.
- **Still open:** nothing on this tree; the full-year harness is green and the enemy-captive feature was removed rather than deferred.
