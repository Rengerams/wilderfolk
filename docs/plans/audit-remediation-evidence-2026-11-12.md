# Audit remediation — per-finding evidence (2026-11-12)

One row per finding in `full-code-audit-2026-11-11.md` (162 IDs). `Proof` names the test that
actually exercises the fixed behaviour; `Kind` is the strength of that proof:

- **R** — dedicated regression whose assertion targets the defect: the assertion encodes the
  pre-fix behaviour, so the test fails if the fix is reverted.
- **F** — focused behavioural test added or extended for this fix; passes now, but was not
  necessarily observed red on the pre-fix revision.
- **A** — area/regression suite or a gate command proves the contract; no defect-specific case.
- **S** — static-only, obsolete or refuted, with the reason in the row.

A test passing at the fixed revision does **not** by itself prove a bug existed. Only a test that
fails on the pre-fix revision and passes after does. **R** rows use an assertion that encodes the
pre-fix behaviour, so reverting the fix turns them red; **F/A** rows are passing checks at the
fixed revision and are weaker evidence. The demos at the end were actually performed in this
session (fix reverted, test observed red, fix restored, test green).

Proof-kind totals across the 162 findings: **R 70**, **F 78**, **A 9**, **S 5**. Final gates on the
tree this document describes: `standard` PASS (528 files / 3,495 tests / 230.8 s),
`calendar-scheduler` PASS (17 tests / 13.0 s), `colony-integration` PASS (264.0 s), `vite build`
PASS. The optional full-year harness is **RED** on its birth non-vacuity assertion and is not
claimed as verified (see the remediation log).

## Simulation audit (S)

| ID | Fix (canonical owner) | Proof | Kind |
|---|---|---|---|
| S-01 | forge.tickVillageForge on the production-day anchor | tests/forge.cadence.test.ts | R |
| S-02 | tickWildlife apex path, grazer leftovers removed | tests/wildkin.apexRole.test.ts<br>tests/ecosystemPressure.winterDemand.test.ts | R |
| S-03 | session stop saves before loop clear; pagehide write | tests/leaveColony.save.test.ts | R |
| S-04 | delta/prep carry election fields | tests/workerHandoff.state.test.ts | R |
| S-05 | beauty rebuilt at every hand-off; unconditional draws | tests/workerHandoff.state.test.ts | R |
| S-06 | resume+integrate walked route; faction/hotel walk recorded | tests/factionTravel.offscreen.test.ts<br>tests/production.attendancePacing.test.ts | R |
| S-07 | harvest cleared at the year boundary before the roll | tests/dailyEconomy.ledgerEcology.test.ts | R |
| S-08 | stored food inflows recorded through the ledger owner | tests/dailyEconomy.ledgerEcology.test.ts | R |
| S-09 | one day of grass growth; pressure prices the same rule | tests/dailyEconomy.ledgerEcology.test.ts | R |
| S-10 | hospital ward uses centre + shared reach | tests/hospital.howler.geometry.test.ts | R |
| S-11 | invariants throw in dev/test; harnesses collect per tick | tests/invariants.collectorCanFail.test.ts<br>tests/longRunColony.integration.test.ts | R |
| S-12 | worker reset clears faction wander | tests/workerHandoff.state.test.ts | R |
| S-13 | paused shipped one-way on the tick delta | tests/workerHandoff.state.test.ts | R |
| S-14 | commute window opens at shift-lead; no commute damping | tests/workCommute.leadHour.test.ts<br>tests/production.attendancePacing.test.ts | F |
| S-15 | herd records placed count and recovers one per unharmed year | tests/invariants.commute.herd.test.ts<br>tests/migration.herds.test.ts | R |
| S-16 | indoor settler is not howler prey | tests/hospital.howler.geometry.test.ts | R |
| S-17 | custodian group seated whole or legally split | tests/housing.custodianSplit.test.ts | R |
| S-18 | zero-crew types advance at passive pace | tests/production.attendancePacing.test.ts | R |
| W-01 | one leaveColony path persists before stop | tests/leaveColony.save.test.ts | R |
| W-02 | transient save pools filtered element-wise | tests/saveBoundary.malformed.test.ts | R |
| W-03 | footprint bounded before water sampling | tests/saveBoundary.malformed.test.ts | R |
| W-04 | non-compact map dimensions validated | tests/saveBoundary.malformed.test.ts | R |
| W-05 | terrain patches coalesce per tile, never evicted | tests/terrain.patchQueue.test.ts | R |
| W-06 | ghost verdict cloud drawn per frame | tests/visualsAudit.renderWiring.test.ts | R |
| W-07 | session leave stops all audio | tests/leaveColony.save.test.ts | R |
| W-08 | session swap clears transient build view | tests/leaveColony.save.test.ts | F |
| W-09 | defense preset order Barracks/Prison first | tests/production.attendancePacing.test.ts | R |
| W-10 | year harness asserts living player humans | scripts/run-full-year.mts (harness assertion) | A |
| W-11 | vacuous benchmark gate deleted | file removed; no references remain | S |
| W-12 | vacuous scratch tests removed; the five vacuous frontier probes replaced by real assertions | tests/frontier.legacyEvents.test.ts | R |
| W-13 | final export goes through exportAuthoritativeWorld | tests/leaveColony.save.test.ts | F |
| W-14 | import size refused before reading | tests/useGamePersistence.test.ts | F |
| W-15 | manual save queues behind a background save | tests/useGamePersistence.test.ts | F |
| W-16 | world adopted only after worker ack | tests/gameWorker.uploadWatchdog.test.ts | R |
| W-17 | error boundary reload action | tests/gameErrorBoundary.test.ts | F |
| W-18 | key repeat guarded | tests/keyboardGuards.contract.test.ts | F |
| W-19 | menu uses canonical focus utility and aria-modal | tests/ui-a11y.contract.test.ts | F |
| W-20 | strip release state reset per gesture | tests/uxBatch.interactionWindows.test.ts | F |
| W-21 | render SoA carries real energy | tests/visualsAudit.renderWiring.test.ts | R |
| W-22 | kinematics patch stops writing sim fields | tests/renderer.soaPositionOwnership.test.ts | R |
| W-23 | logistics memo keyed on exact inputs | tests/audit.hotPathScans.equivalence.test.ts | F |
| W-24 | static layer key drops hour; progress-keyed rebake | tests/visualsAudit.renderWiring.test.ts | R |
| W-25 | terrain key carries material readiness | tests/groundChunk.rebake.test.ts | F |
| W-26 | walk animation moved to the tick owner | tests/humanMovement.test.ts | F |
| W-28 | repair button uses the repair owner | tests/selectedBuildingPanel.perBuildingState.test.ts | F |
| W-29 | recipe affordability uses the workshop owner | tests/buildingPanel.staffingRule.test.ts | F |
| W-30 | frozen panels: memo dropped, live reads | tests/uiPanelFixes.render.test.ts | R |
| W-31 | refusal rendered for completed workplaces too | tests/buildingPanel.staffingRule.test.ts | F |
| W-32 | family-tree subtitle counts visible rows | tests/familyTree.test.ts | F |
| W-33 | graveyard capacity constant single-sourced | tests/uiPanelFixes.render.test.ts | F |
| W-34 | valid Tailwind arbitrary widths | tests/uiPanelFixes.render.test.ts | F |
| W-35 | unstaffed hotel lodges nobody | tests/hotelSettlerLodging.night.test.ts | R |
| W-36 | caravan trip deadline + refund | tests/tradeCaravan.carrierRetention.test.ts | R |
| W-37 | player-owned maintenance gate | tests/demolish.roundtrip.test.ts | F |
| W-38 | getBuildingConfig replaces raw lookups | tests/buildings.lookup.test.ts | F |
| W-39 | provisions expiry day >= | tests/villageRequests.test.ts | F |
| W-40 | occupancy acceptance before automatic-job | tests/buildingPanel.staffingRule.test.ts | F |
| W-41 | lifetime totals carry previous + latest | tests/lifetimeRecords.wiring.test.ts | F |
| W-42 | longest-life scan filters player humans | tests/stats.largestPopulation.test.ts | F |
| W-43 | player houses only in the shelter nudge | tests/priorityAlerts.housing.test.ts | A |
| W-44 | credited-ballot tally | tests/villageLeadership.test.ts | F |
| W-45 | family tree uses canonical custodian | tests/familyTree.test.ts | F |
| W-46 | scene owner keeps live pairs on re-open | tests/dialogue.pipeline.integration.test.ts | F |
| W-47 | one friendship hit per landed famine bite | tests/famineDesperation.test.ts | F |
| W-48 | intro resumes instead of rewinding | tests/audio.introResume.test.ts | R |
| W-49 | one music-path gain for both players | tests/renderBatch.audioVolume.test.ts | F |
| W-50 | docs check real paths and fails on missing docs | scripts/check-docs.mjs (gate can fail) | A |
| W-51 | unit-all alias added | node scripts/test.mjs unit-all | A |
| W-52 | storm gate asserted instead of skipped | tests/weatherConsequences.test.ts | F |
| W-53 | comment check resolves a CI base | scripts/check-comments.mjs (gate can fail) | A |
| W-54 | ownership coverage floors | node scripts/build-call-graph.mjs --verify-owners | A |
| W-55 | types includes tsconfig.node | node scripts/test.mjs types | A |
| W-57 | log filter resyncs on handover | tests/eventLogPanel.filters.test.ts | R |
| W-58 | match count equals drawn rows | tests/uiPanelFixes.render.test.ts | F |
| W-59 | voter eligibility from the election owner | tests/villageLeadership.test.ts | F |
| W-60 | life age printed in years | tests/uiPanelFixes.render.test.ts | F |
| W-61 | intro particles mount once per beat | tests/uiPanelFixes.render.test.ts | F |
| W-62 | log downloads the full stored set | tests/eventLogPanel.filters.test.ts | F |
| W-63 | intro CTA inert until ready | tests/ui-a11y.contract.test.ts | F |
| W-64 | story expiry dispatches per-story resolvers | tests/story.expiryResolvers.test.ts | R |
| W-65 | wedding rival bound by stable id | tests/weddingDiplomacy.rivalId.test.ts | R |
| W-66 | dead campaign-choice mechanic removed | tests/guidedCampaign.test.ts | F |
| W-67 | civic petition uses the food-alert owner | tests/civicPetition.cadence.test.ts | F |
| W-68 | sighting flag persisted per entity id | tests/wildkin.apexRole.test.ts | F |
| W-69 | tutorial milestones at canonical onset/day 360 | tests/tutorialCampaign.test.ts | F |
| W-70 | over-capacity repair never splits the household | tests/housing.custodianSplit.test.ts | R |
| W-71 | housing audit covers minor/manor and is observed weekly | tests/housingPulse.audit.test.ts | R |
| W-72 | growth report counts assignable beds only | tests/housingPulse.audit.test.ts | F |
| W-73 | same-tick arrivals join the housing pulse | tests/residency.dayBoundary.budget.test.ts | F |
| W-74 | writer enforces residence capacity | tests/residencyCapacity.writers.test.ts | R |
| W-75 | housing doc and prisoner test corrected | tests/prisonerHousing.assign.test.ts | F |
| W-77 | citizen identity established at welcome (genome + born mark at citizenship) | tests/frontier.legacyEvents.test.ts | R |
| W-78 | affair conception applies the activity factor | tests/personality.romanceContext.test.ts | F |
| W-79 | barricades use a DNA-free total | tests/personality.defenseIntegration.test.ts | F |
| W-80 | inspector reads the registry cost flag | tests/personalityCareer.inspector.test.ts | F |
| W-81 | yearly spawns delegate to worldGen/worldEventSites point owners | tests/frontier.legacyEvents.test.ts | R |
| W-82 | poaching owned by simulationEntities.killWildGameForPoach (rival copy deleted) | tests/frontier.legacyEvents.test.ts | R |
| W-83 | camp keys visitor-only (string ids); rival keys dropped; rival focus opens the strategic map | tests/campKey.contract.test.ts | R |
| W-84 | visitor camp imports getPlayerCampCenter from villageAnchor directly | tests/visitorSpawn.gridSync.test.ts | A |
| W-85 | obsolete: rival settlements are strategic records, not on-map camps; rival avoid entry removed rather than re-added | owner decision (strategic-map design) | S |
| W-86 | one canOfferVisitorCamp gate for event flags, mid-year and first-week | tests/frontier.legacyEvents.test.ts | R |
| W-87 | legacy rival `campLabel` and the unreachable rival-building inspector + duplicate raid card removed; single-owner guards now target the live App raid card | tests/saveMigration.roundtrip.test.ts<br>tests/uiSingleOwner.test.ts<br>tests/raidDeadline.owner.test.ts | R |
| W-88 | unique rule counts player structures | tests/buildGhost.failureReason.test.ts | R |
| W-89 | one placement decision + label owner | tests/buildGhost.failureReason.test.ts<br>tests/placementOverlapIndex.equivalence.test.ts | R |
| W-90 | construction reads a living crew | tests/demolish.roundtrip.test.ts | F |
| W-91 | building access memo per grid revision | tests/buildingAccess.routeAround.test.ts | F |
| W-92 | config owner for rotation/labels | tests/buildings.lookup.test.ts | F |
| W-93 | restored camp key must name a live camp | tests/viewState.coverZoom.test.ts | F |
| W-94 | dead follow helper removed | removed; App owns the clamping camera follow | S |
| W-95 | refuted: notifications are not saved state | audit §11.2 refutation | S |
| W-96 | unproven: saved width equals the built map | audit §11.2 | S |
| W-97 | candidate ranking in travel hours | tests/careers.workerFit.test.ts | R |
| W-98 | staffingCapFor reports counted workers | tests/buildingPanel.staffingRule.test.ts | F |
| W-99 | visible attendance checked before illness | tests/workAbsence.reasons.test.ts | R |
| W-100 | work schedule cached by raw window | tests/workSchedule.bounds.test.ts | F |
| W-101 | dialogue roll validated at the boundary | tests/dialogue.eventRouting.test.ts | F |
| W-102 | dead disk path removed; line history bounded | tests/dialogue.pipeline.integration.test.ts | F |
| W-103 | rain/storm map to bad-weather contexts | tests/dialogue.eventRouting.test.ts | F |
| W-104 | one scene per person per colony day across event families (greeting/banter/solo) | tests/socialCadence.oneScenePerDay.test.ts | R |
| W-105 | inspector uses the real social inputs | tests/socialCadence.oneScenePerDay.test.ts | F |
| W-106 | one shared stagger/greeting predicate | tests/socialCadence.oneScenePerDay.test.ts | F |
| W-107 | hung command fails inside the stall ceiling | tests/gameWorker.uploadWatchdog.test.ts | R |
| W-108 | bounded recovery budget; main thread keeps ticking | tests/gameWorker.uploadWatchdog.test.ts | R |
| W-109 | pipeline depth aligned; worker react plugin removed | npx vite build + tests/gameWorker.transport.test.ts | A |
| W-110 | worker timing constants pinned | tests/gameWorker.uploadWatchdog.test.ts | R |
| W-111 | stale strip demolition cleared on session swap | tests/leaveColony.save.test.ts | R |
| W-112 | family-tree target cleared on session swap | tests/leaveColony.save.test.ts | R |
| W-113 | battle report cleared on session swap | tests/leaveColony.save.test.ts | R |
| W-114 | save hint matches real behaviour | tests/uiPanelFixes.render.test.ts | F |
| W-115 | inspector regions have roles | tests/ui-a11y.contract.test.ts | F |
| W-116 | worker resets dialogue sessions | tests/workerBoundary.closure.test.ts | F |
| W-117 | export uses one deadline | tests/gameLoop.test.ts | F |
| W-118 | camp anchor uses footprint centre | tests/geometry.footprintCentre.test.ts | R |
| W-119 | town-hall service uses centre + reach | tests/geometry.footprintCentre.test.ts | R |
| W-120 | faction POIs use centre | tests/geometry.footprintCentre.test.ts | F |
| W-121 | venue standoff half-height | tests/geometry.footprintCentre.test.ts | F |
| W-122 | camp sites validated on buildable ground | tests/geometry.footprintCentre.test.ts | F |
| W-123 | winter-prep expiry resolver | tests/story.expiryResolvers.test.ts | R |
| W-124 | children-shelter expiry resolver | tests/story.expiryResolvers.test.ts | R |
| W-125 | ranger expiry gives the traveller variant | tests/story.expiryResolvers.test.ts | R |
| W-126 | terrain patches re-offered after a failed post | tests/terrain.patchQueue.test.ts | F |
| W-127 | mark writers bump the profile revision | tests/simDelta.entityProfile.test.ts | R |
| W-128 | rollback deep-copies dialogue history | tests/simPrep.relationshipCopyOnWrite.test.ts | R |
| W-129 | migration scales every elapsed tick counter | tests/saveLoad.tickResolution.test.ts | R |
| W-130 | edit-hours window above the overview | tests/uxBatch.interactionWindows.test.ts | F |
| W-131 | POW dialog re-reads live state | tests/uiPanelFixes.render.test.ts | F |
| W-132 | forge warning uses the forge staffing owner | tests/buildingPanel.staffingRule.test.ts | F |
| W-133 | generation selector matches the owner bound | tests/uiPanelFixes.render.test.ts | F |
| W-134 | event card names its content | tests/ui-a11y.contract.test.ts | F |
| W-135 | work ratio uses one workforce count | tests/dashboardAggregates.owner.test.ts | F |
| W-136 | attendance pays only witnessed presence | tests/production.attendancePacing.test.ts | R |
| W-137 | herd remembers placed deer | tests/migration.herds.test.ts | F |
| W-138 | immigrant arrives at the doorway | tests/dailyImmigration.gridSync.test.ts | R |
| W-139 | hunt float uses accepted food; kill fully bookkept | tests/humanHunting.ledger.test.ts | R |
| W-140 | refusal text at the footprint centre | tests/geometry.footprintCentre.test.ts | F |
| W-141 | hotkeys survive a checkbox, not text entry | tests/keyboardGuards.contract.test.ts | F |
| W-142 | static layer revision cached per world | tests/visualsAudit.renderWiring.test.ts | F |
| W-143 | boot uses a cheap Medium placeholder | tests/uiPanelFixes.render.test.ts | F |
| W-144 | per-colony window/campaign state reset | tests/leaveColony.save.test.ts | F |
| W-145 | save rejects non-finite energy | tests/saveBoundary.malformed.test.ts | R |
| W-146 | legacy rival death fully bookkept | tests/rivalGhosts.test.ts | R |
| W-147 | Wildkin spawn energy from the species config | tests/humanLifecycle.test.ts | F |

## Red→green demonstrations performed in this session

Each demo reverted the committed fix to the pre-audit file, ran the row test, observed the failure,
then restored the fixed file and re-ran it. Commands and observed output:

| ID | Reverted owner | Test | Observed with the fix reverted | After restore |
|---|---|---|---|---|
| S-15 | `src/game/migration.ts` (pre-audit) | `tests/invariants.commute.herd.test.ts` — "recovers one deer per unharmed autumn" | `FAIL: AssertionError: expected 6 to be 7` | PASS |
| W-140 | `src/game/buildingMaintenanceActions.ts` (pre-audit) | `tests/geometry.footprintCentre.test.ts` — "floats repair and upgrade costs at the centre" | `FAIL: expected { x: 420 } to match { x: 400, y: 400 }` | PASS |
| W-81 | `src/game/groupEvents.ts` (before the prop-site rule) | `tests/frontier.legacyEvents.test.ts` — "yearly wildlife and flora spawn only on legal ground" | `FAIL: tree/grass spawned on an illegal prop site` | PASS |
| W-82 | `src/game/rivalEvents.ts` (before clearing hunter targets) | `tests/frontier.legacyEvents.test.ts` — "a poached deer is retired through the wildlife-death owner" | `FAIL: the hunter still targets the dead deer: expected 446 to be undefined` | PASS |

The remaining **R** rows were reported red→green by the implementing agent during the remediation,
but that observation was not recorded byte-for-byte in this repository; they are listed as **R**
because the assertion targets the pre-fix value, not because this document re-demonstrated each one.


## Focused re-audit (F-items, 2026-11-12)

These are not in the original 162; they were found by the focused DNA/housing/social review and
fixed on the same tree.

| ID | Fix (canonical owner) | Proof | Kind |
|---|---|---|---|
| F-1 | legacy-save fixture casts the removed `campLabel` shape | `tests/saveMigration.roundtrip.test.ts` | R |
| F-2 | `simRng.personPairDayRoll` hashes both ids; no `salt + id` in social gates | `tests/socialCadence.oneScenePerDay.test.ts` (200-id collision scan) | R |
| F-3 | DNA doc + ownership register name `establishCitizenIdentity`; old pipeline plan marked superseded | `OWNERSHIP_OVERVIEW.md`, `docs/DNA_APTITUDES_ARCHITECTURE.md` | S |
| F-4 | `hasDialogueSceneOnDay` counts every event family unless keys are passed | `tests/socialCadence.oneScenePerDay.test.ts` (greeting blocks banter) | R |
| F-5 | housing status line reflects the writer gate and weekly audit | `docs/HOUSING_ARCHITECTURE.md` | S |
| F-6 | real frontier regressions replace the deleted probe | `tests/frontier.legacyEvents.test.ts`, `tests/campKey.contract.test.ts` | R |
| F-7 | remediation claims re-verified against the final gates | `docs/plans/audit-remediation-log-2026-11-11.md` | S |
