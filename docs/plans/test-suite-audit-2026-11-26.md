# Test-suite audit — 2026-11-26, migration 2026-11-27

Audit of `tests/` against the engineering standard in `AGENTS.md` §1.11 ("tests are evidence, not a
productivity metric: guard real behavior, do not mirror implementation details"), followed by the
migration the owner approved. Behavioral coverage was not reduced: every rule that left the unit tier
runs in `scripts/check-source-guards.mjs` on every gate.

## Verdict

- **Up to date: yes.** 3,594 executed cases pass, 0 failed, 0 skipped, no test imports a module that no
  longer exists, and the great majority of files were touched in November 2026. The suite was not stale.
- **Not redundant.** No two files share half of their assertion/title set, no literal pin is repeated
  across files, and the unused-code audit reports nothing.
- **Over-composed.** The growth from 390 files (2026-10-28) to 542 came from audit batches and
  source-text guards, not from new behavioral coverage.
- **Meaningful core:** the files that test runtime behavior at a canonical owner. Those are the suite's
  value and are untouched.

## How this was measured

| Check | Result |
| --- | --- |
| `vitest run` (unit tier, JSON reporter, before the migration) | 540 files, 3,732 cases, 0 failed, 0 skipped |
| Wall / summed file time | 210 s wall, 471 s summed |
| Imports resolved against the tree | 0 test files importing a missing module |
| Case and assertion volume | 3,592 declared cases, 11,942 `expect`, 85,372 lines |
| File-pair similarity (titles + assertions, Jaccard ≥ 0.5) | 0 pairs |
| Repeated literal pins (`expect(CONST).toBe(...)` 3+ times) | none |
| `scripts/check-knip.mjs` | no unused files or exports reported |
| Last-change month per file | Nov 2026: 487, Oct 2026: 49, Sep 2026: 6 |

## Inventory after the migration

| Category | Files | Judgment |
| --- | --- | --- |
| Behavioral owner tests | ~470 | Keep — this is the suite |
| Files that still read source text | 56 | Next migration increment |
| Audit-batch files (`audit*`, `low-*`, `medium-*`, `phase*`, `*Batch`, `duplication*`) | 50 | Merge into their subject owner |
| Assertion-light files (≥ 40 % `toBeTruthy`/`toBeDefined`) | 11 | Strengthen or fold into a stronger file |

Rows overlap, so they do not sum to the unit-tier file count. Unit tier now: 532 files / 3,594 cases.

## What moved (two passes, 2026-11-27)

`scripts/check-source-guards.mjs` owns the single-owner source rules: **117 rules**, of which 14 are
hand-written scanners and 103 are declarative rows (`contains` / `notContains` / `matches` /
`notMatches` / `counts` / `order` / `region` / `scan` / `absent`). It runs from the `check` step of
the standard and full gates (standalone unit modes do not invoke it). `--self-test` synthesizes a violation for every rule — injecting the bad spelling, deleting
the needle, swapping the order, removing a region anchor, adding a probe file — and fails if the rule
stops reporting it. Declarative checks also mutate each file and clause separately and require the specific diagnostic. The handwritten guards retain their original per-rule samples.

**138 cases left the unit tier. Eight files were removed:**

- `keyboardGuards.contract` (31 — the file was source contracts throughout)
- `ticksPerDay.literals` (23 — 22 guarded test files plus the table floor)
- `stripPreview.emptyGuard` (3), `workplaceReference.singleOwner` (3), `debugGate.guide` (3)
- `strategicWorldMap.windowLayout` (2), `ux2.introPrompt` (2)
- `selectedBuildingPanel.perBuildingState` (1)

**Twenty-two files were trimmed to their behavioral half:** `uiSingleOwner` (36 of 45), `uiRefinement.residuals`
(8 of 9), `ux2.doorNames` (7 of 9), `actionOutcome` (2), `alertStrip.criticalVisibility` (2),
`buildGhost.failureReason`, `councilNotices.row`, `conceptionEvent.labelling`, `dashboard.foodBalance`,
`dashboardData.suggestionLabels`, `dialogue.workerSaveParity`, `foodSpend.ledger`, `militiaArmament.label`,
`onMapVisitors.retired`, `rpgArt.integration`, `dayLength.owner`, `copyAndDayIndex.owners`,
`foodThresholds.owner`, `hospitalReputation.owner`, `buildingFocus.centre`, `introTimeline.cta`,
`diagnosticsQuietness`.

`compatFacadeMigration` was **not** migrated: it runs the compatibility-facade tool against a temporary
fixture, so it is a behavioral test of a script, not a source scan. An earlier draft of this audit
listed it as source-only; that was wrong.

**Correction to the first inventory.** The first pass counted 208 source-scan cases with a per-case
regex. That undercounted: a file that hoists `const source = readFileSync(...)` into the `describe`
block (e.g. `alertStrip`, `keyboardGuards`) has cases that never name the helper. The real figure is
closer to 250. The migrated 138 are the ones whose only evidence was source text; the cases left behind
are behavioral tests that also assert the view reads its owner, which is legitimate.

## Remaining source-text guards — 56 files

Largest first: `visualsAudit.renderWiring` (16), `duplicationA.remaining` (10), `audit2026-09-21.regression`
(8), `uxBatch.onboardingAndLogs` (8), `ui-a11y.contract` (6), `uiRefinement.owners` (6),
`uxBatch.interactionWindows` (6), `uiPanelFixes.render` (5), `singleOwner.predicates` (4),
`workforce.transitions`, `gameLoop`, `simRng`, `simulation.decisionRegistry`, `personality.*` (5 files),
`renderer.*` (4), `renderBatch.*` (2), `storageCap`, `storageCapped.productionAnnounced`,
`tradeRouteRewards.copy`, `tradeRoutes.eligibility`, `schooling.explains`, `saveLoad.outcomeReasons`,
`saveVersionExperience`, `simTrig.deterministic`, `socialCadence.oneScenePerDay`, `spotlightApplause`,
`taming.candidatesAndPost`, `raidDeadline.owner`, `residenceBestFit.owner`, `reputation.singleOwner`,
`researchEffect.singleOwner`, `renderTransform.owner`, `logisticsOverlay.projection`,
`low-2-events-defense`, `militiaBalance.prisoners`, `persistenceBatch.loadContract`,
`dashboardAggregates.owner`, `buildingPanel.staffingRule`, `dailyEvents.chronicleCopy`,
`dialogue.schema13`, `eventLogPanel.filters`, `footprintBounds.owner`, `humanSprites`,
`simDelta.buildingFingerprintFields`, `ux2.researchBlockReason`, `auditOpenItems.verification`,
`blueberryForaging`.

Porting one is mechanical: copy the file list and the patterns into a row, give every `notContains` /
`notMatches` its `example`, delete the case. `blueberryForaging` and `humanSprites` read assets rather
than source, so they are fixture reads, not guards — check before porting.

## Absence / retirement guards

`not.toMatch`, `not.toContain`, `not.toThrow` on source text, and files such as `hostileWeather.disabled`,
`frontier.legacyEvents`. They guard against reintroducing removed code. Worth keeping where the removal
was a real defect (`A17 manual job assignment retired`); pure archaeology belongs with the static checks.

## Audit-batch files — 50

`audit2026-09-21.regression` (34 cases), `auditOpenItems.verification`, `audit.hotPathScans.equivalence`,
`calendarPhase.auditRegressions`, `economyAudit.*`, `entityAudit.*`, `housingPulse.audit`,
`loopWorker.auditRemediation`, `economyWorkforce.auditRemediation`, `duplicationA.remaining`,
`personality.legacyConsumerAudit`, `dialogue.legacyElectionsAudit`, `low-1` … `low-9`,
`medium-A/B/C/N`, `phase7.social`, `renderBatch.*`, `simBatch.*`, `uxBatch.*`, `persistenceBatch.*`,
`visualsAudit.renderWiring`, `uiRefinement.*`, `virtualPlayer.*Batch`.

They contain real regressions, but the name records the audit that found the bug, not the rule that
must not regress. Several exercise owners that already have a dedicated file — `low-1-worker-persistence`
imports `simPrep`/`simDelta`, `medium-C1-economy` imports `dailyEconomy`, `audit2026-09-21.regression`
imports the housing pipeline. Their assertions are not literal duplicates of those files, so each case
still needs the equivalence check; the gain is that a failure would name its subject.

## Runtime

395 files finished under 1 s before the migration, 80 took over 2 s, 12 over 5 s; the top 20 files
accounted for 148 s of the 471 s summed time. Time was never the problem; composition is.

## Assertion-light files

`quarry.zeroStoneRecovery` (8/12 truthy), `dialogueBusy.forcedLineGates` (4/6),
`saveMigration.birthdatesPreserved` (5/9), `pregnancyHospitalWork` (4/8), `terrain.campGround` (2/4),
`frontier.legacyEvents` (2/4), `relationships.sharedHomeFriendship` (5/11),
`foodLedger.acceptedCatch` (3/7), `medium-C1-economy` (6/15), `colonyProducerCommute` (4/10),
`stats.largestPopulation` (2/5). These pass on a partially broken implementation; they should assert
the value, not its presence.

## Second consolidation increment — 2026-11-27

Nine source-only cases in eight mixed test files were moved to nine declarative rules: research-effect ownership, render transforms, trade reward copy, schooling and trade-block summaries, save loading and compatibility copy, residence relocation, and the obsolete building-actions facade. All runtime cases remain in Vitest. The registry now contains 126 rules (14 handwritten, 112 declarative). The original 56-file inventory is historical, not a fresh count. Also removed the retired corner rotation helper found by Knip. These changes have not yet been verified by the full CI gate.

## Behavioral assertion increment — 2026-11-27

Strengthened saved-birthday tests to compare complete settler ID sets and exact dates across two round trips; the legacy age test can no longer pass when settlers disappear. Forced dialogue checks preserve the live session and visible-line duration and prove that the control actually speaks. The commute fixture must contain both completed homes and farms, the peak-population record includes its year, and catch notifications assert the accepted count in the displayed text. Positive/non-empty premises are retained where they prevent vacuous tests. Full CI verification is pending.

## First owner-file consolidation — 2026-11-27

Moved all ten storage-cap, spoilage, upgrade and catalogue cases from `economyAudit.storageCaps.test.ts` into `storageCap.test.ts`. Reused its existing `makeWorld` and `addBuilding` fixtures rather than duplicating them; no behavioral case was deleted. Updated the decision registry and active audit references. This reduces the file count by one, not the case count. Verification is pending.

## Third source-guard increment — 2026-11-27

Ten source-only cases from four mixed files now run as ten declarative guards: ready trade labels, defence ratio display, election delay, recruitment costs, population aggregates, capped production, trade eligibility/counts, and Chronicle handover/export. All behavioral tests remain. The registry now contains 136 rules (14 handwritten, 122 declarative). Each new clause was checked against the branch source before committing. Full CI is pending.

## Fourth source-guard increment — 2026-11-27

Migrated the reputation single-writer scan, storage gain clamp scan and deterministic tick-position trigonometry rule. The original owner exceptions, eight position modules, both TypeScript extensions and minimum 301-file coverage are preserved. The shared scanner now checks multiple extensions with a single rule and self-tests each extension and the minimum-file floor. The registry contains 139 rules (14 handwritten, 125 declarative). Three mixed test files retain all runtime cases. CI verification is pending.

## Second owner-file consolidation — 2026-11-27

Moved all three unguarded-hour escape and workplace-restoration cases into `prisonShifts.test.ts`, which already covers the roster and its uncovered hours. The escape fixtures and RNG reset are preserved; the reset is scoped to the escape suite so the existing roster tests are unchanged. Updated the two active human-needs architecture references and named fixture ownership. No behavioral case was deleted. CI verification is pending.

## Five grouped source-guard batches — 2026-11-27

Moved thirteen source-only cases across nine mixed files (including the logistics guard's synthetic proof) and extracted one source assertion from a retained social-cadence behavior test. The five groups are UI ownership (3), raid/Chronicle/social cadence (2 cases plus the social assertion), logistics (3 cases into 2 guards), dashboard aggregations (2), and shared predicates (3). All runtime cases remain in Vitest. The 13 new rules bring the registry to 152 (14 handwritten, 138 declarative). Source clauses were checked against the branch before migration; the obsolete raid wrapper is checked by the existing absent-file mechanism. The five batches are pushed together to avoid cancelling intermediate CI runs. Full CI verification is pending.

## Build repair — 2026-11-27

The five-group migration left one source-only faction-union test calling its retired source helper. Moved that final type-level contract into the registry (153 rules), preserving runtime faction and election cases. This resolves the TS2304 reported by the build; the new CI run must verify it.

## Remaining six assertion-light files reviewed — 2026-11-27

Strengthened quarry worker role, exclusive construction assignment and elapsed simulation; hospital work-site attribution and duty accrual; camp coordinates and override-key bounds; independent prop terrain/overlap checks plus scoped RNG cleanup; reciprocal coworker/stranger relationships and positive tail bonds; and greenhouse ledger shape, irrigation prerequisite state and herd identity/coordinates. The six remaining audit-listed files now have targeted stronger assertions, while useful positive production/spawn premises remain. All eleven listed files have been addressed across the two increments. CI must validate the new assertions.

## Five additional owner-file consolidations — 2026-11-27

- `medium-N5-electionGatherSlot.test.ts` → `villageLeadership.test.ts` (5 cases)
- `medium-B1-replacementCounter.test.ts` → `stripPlacement.crossings.test.ts` (3 cases)
- `renderBatch.nameLabelGender.test.ts` → `renderer.overheadBadgeAndAssets.test.ts` (2 cases)
- `persistenceBatch.valueNormalization.test.ts` → `saveLoad.valueIntegrity.test.ts` (15 cases)
- `persistenceBatch.dismissedLists.test.ts` → `saveLoad.elementShape.test.ts` (2 cases)

All test cases were retained. The value-normalization suite shares the existing seeded save payload and load helper; the dismissed-event list tests use the element-shape suite's real payload and scoped RNG reset. The original election oracle, placement fixtures and name-label cases remain intact. Decision-registry and ownership links are updated; historical bug reports retain their original test paths as historical evidence. CI verification is pending.

## Three additional owner-file consolidations — 2026-11-27

- `housingPulse.audit.test.ts` → `housingPipeline.invariants.test.ts` (5 cases).
- `virtualPlayer.staffingAndRepairBatch.test.ts` → `workforce.transitions.test.ts` (3 cases) and `workerCommand.roundtrip.test.ts` (2 cases).
- `renderBatch.reducedMotion.test.ts` → `renderer.motionAndHover.test.ts` (5 cases, with mock cleanup scoped to the reduced-motion suite).

All 15 cases are preserved. The staffing fixture keeps its original factory semantics. Updated active owner references. Full CI verification remains pending.

## Semantic review reference repair — 2026-11-27

CI passed all 153 source guards and 513 declarative mutations, but the overlap gate rejected a deleted staffing test path in its reviewed approval. Updated that path to its workforce owner and replaced the retired keyboard-contract reference in the semantic-duplicate review with the surviving overlay-keyboard behavior test, documenting the static guard separately. The review fingerprints and approval thresholds are unchanged. Full CI verification is pending.

## Renderer owner consolidation — 2026-11-27

Moved six frame-cache cases into `renderer.frameOwnership.test.ts` and two missing-sprite fallback cases into `renderer.motionAndHover.test.ts`. The two frame-ownership source-only cases now run as static guards, including mutation proofs; registry total 155 rules. Fallback module and global cleanup is scoped to its suite. All eight moved behavior cases and existing runtime cases remain. CI verification is pending.

## Dialogue, persistence and simulation owner consolidation — 2026-11-27

- `dialogue.legacyElectionsAudit.test.ts` → `dialogue.bankIntegrity.test.ts` (1 case).
- `persistenceBatch.loadContract.test.ts` → `saveLoad.outcomeReasons.test.ts` (14 runtime cases, shared slot fixture and scoped RNG/storage cleanup).
- `simBatch.offscreenThrottle.test.ts` → `humanTick.hotPathIndexes.test.ts` (5 cases, original fixture semantics preserved).

Moved the load index ordering source test into the central registry with all six ordering pairs. Registry total: 156 rules. Retained all 20 moved runtime cases. Verified active registry file references against the planned tree. Full CI verification pending.

## Audio output consolidation — 2026-11-27

Merged the two render-batch audio suites into `audio.output.test.ts`. Four cases share one recording Web Audio fixture for limiter routing, preset changes and element output levels.

## Owner-suite verification — 2026-11-27

Moved 12 cases from five mixed suites. Beauty and theatre checks now live with their respective simulation owners, chronicle labels with event-log filters, frame catch-up with GameLoop RAF, persistence cleanup with the persistence hook, challenge progress with rewards, and production and herd placement with daily economy and migration. Reused the existing herd selector and challenge fixture. All eight destination suites passed (57 tests).

## Leadership, story and simulation regressions — 2026-11-27

Retired five mixed suites: `medium-batch2`, `medium-B2-leadership`, `medium-C2-story`, `entityAudit.transientGeometry` and `auditOpenItems.verification`. Their 29 cases became 28 runtime cases and one source guard. The seed guard scans the same game modules, excludes the two seed owners and has explicit mutation coverage. The census cases for traders and temporarily transformed settlers now exercise the same owner. Updated calendar guard and decision evidence paths.

## Camp-anchor owner consolidation — 2026-11-28

Moved all three `medium-N4-campAnchor.test.ts` regressions into `humanTick.hotPathIndexes.test.ts`. Reused the existing settler, building and simulation-context fixtures, with optional building overrides and an explicit hour. Retained the independent anchor oracle, branch pins and both moving/fixed-anchor cases. Registered six previously omitted relocated test helpers and the camp-anchor helpers under their actual owners. The previous head's six workflows passed; this increment awaits CI.

## Persistence and Moon Howler owner consolidation — 2026-11-28

Moved all seven cases from `medium-persistence.test.ts` into Moon Howler (2), Big News value integrity (1), save migration round-trip (2), worker prep fields (1), and tick-resolution migration (1). Reused the canonical round-trip fixture; preserved the original six-adult curse setup and RNG sequence. Registered the relocated adult helper and updated the decision evidence path. All cases remain runtime assertions; CI is pending.

## Main integration — 2026-11-28

Merged main through `dee009c6` without restoring retired audit files. Preserved main's new leader-custody, adult-education, ecology persistence, wildlife refuge and staffing regressions. Moved the added ecology round-trip case into the existing save migration suite and applied the updated ecosystem-health expectation to the relocated Nature-tab test. Extended the schooling guard with both new UI assertions. Updated active evidence paths; the combined branch requires a fresh full CI run.

## Worker, staffing and sprite owner consolidation — 2026-11-28

Moved 14 cases from `low-1-worker-persistence`, `medium-B1-staffing` and `renderBatch.sprites` into worker rollback/delta/display-cache, construction staffing, human tick and asset integration owners. Reused the shared building and human factories with the original fixture values and extended the existing tick context with optional focus. Kept the asset manifest's real preload/file checks together with its dynamic source-use check; these are not source-text-only architecture guards. CI pending.

## Calendar, lifecycle and workforce owner consolidation — 2026-11-28

Moved 22 regressions from `calendarPhase.auditRegressions`, `low-3-moon-lifecycle` and `economyWorkforce.auditRemediation` into clock cadence, Moon Howler, birth, family-reference cleanup, daily economy and workforce suites. The required calendar scheduler gate now explicitly runs the destination clock suite; all seven real-gameTick boundary checks remain. Reused the lifecycle's deterministic birth tick and delivery runner, and preserved the original generated-world staffing fixtures. CI pending.

## Save, world generation and simulation data consolidation — 2026-11-28

Moved 19 cases from `low-4-save-worldgen` and `low-9-simdata` to save-version/value/timeline, terrain preset, entity cache, wildlife, immigration, festival, fatigue, daily production, migration, pathfinding and simulation invariant owners. Reused the existing invariant world and herd clock helper. Kept the shared seeded production fixture scoped together. No runtime cases removed; CI pending.

## Social and indexed ownership consolidation — 2026-11-28

Moved 31 cases from `phase7.social` and `audit.hotPathScans.equivalence` to relationship, family, Chronicle, housing and workforce suites plus a dedicated apprenticeship suite (there was no existing primary apprenticeship test file). Relocated the generated social resident fixture into the existing shared factory owner; preserved both independent index oracles and reused the roster suite's existing fixtures. Corrected stale evidence links that attributed unrelated UI/romance tests to the old mixed files. This ten-file increment preserves 86 original regressions; one new owner suite means nine net fewer files. CI pending. Updated the relocated staffing clock-literal guard to scan the destination human-tick suite. Verified all active decision and semantic-review evidence paths against the staged tree.

## Interaction and onboarding source guards — 2026-11-28

Migrated all 26 source-only cases from `uxBatch.interactionWindows` and `uxBatch.onboardingAndLogs` into 15 declarative guard rows, covering all original meaningful source clauses, including the bounded inspector region and three gesture regexes. The old constant-string negative demonstration is superseded by individual clause mutations. Removed obsolete semantic-review references to the onboarding suite; the actual log export behavior suite remains. Verified every new rule against its source baseline. CI pending.

## Geometry and realtime owner consolidation — 2026-11-28

Moved all 11 cases from `low-7-sim-geometry` to prey validity, map bounds, militia, education, housing, family reference cleanup, strip junction, render snapshot and an isolated realtime Moon Howler suite. Reused the shared test fixtures and preserved the original module-mock isolation and direct GameLoop dirty-key probe. No runtime owner changed. CI pending.

## Combat, ecology and economy owner consolidation — 2026-11-28

Moved all 19 cases from `low-5-combat-ecology` to outgoing raid, weather, storage, economy ledger, statistics, story and rival owner suites plus a dedicated `ecologyStage` suite. Kept warning preferences isolated with their original hooks and reused the storage and earthquake fixtures. All original case counts preserved. CI pending.

## Movement owner consolidation — 2026-11-28

Moved all 26 movement cases to the pathfinding, human movement, hotel checkout and hospital walk suites. Reused the canonical path map fixture, existing hospital entity and ward fixtures, and shared building/human factories for direct movement and lodging. Preserved distinct route reuse, blocked start, negative cache, sealed frontage, treatment cadence and final-step assertions; none were removed as duplicates. CI pending.

## Duplication owner evidence — 2026-11-28

Moved six numeric behavior cases from `duplicationA.remaining` to the scent/grid, velocity steering and RNG owner suites. Migrated the other ten source-only cases (including one synthetic scan proof) to 13 declarative guards with individual mutation checks. The exact numerical steering and RNG oracles remain, including uncapped floating-point operation order. No runtime cases removed; CI pending.

## Renderer wiring guard increment — 2026-11-28

Moved three source-only cases (snapped verdict position, bounded progress samples and shared floating-text fade) into three declarative registry rules. All clauses were checked against the branch source; the mixed renderer suite and its runtime cases remain. CI pending.

## Inventory reconciliation and mixed-suite guard migration — 2026-11-28

The original pre-audit tree `ee6f1adc` contains exactly 50 files matching the documented audit categories; head `a745ad9` has 45 retired and five remaining. The previous 51 was an overcount. At that head the tests directory contains 494 `.test.*` files (not a measured Vitest execution count). Moved 10 source-only cases from the September and events/defense suites and 13 renderer cases (including two synthetic proofs), plus one mixed-case source assertion, into 22 declarative rules. Retained all runtime cases, the scoped terrain-fill count and its synthetic proof, the transform example, and the token-aware DNA scanner. No simulation decision changed. CI pending.

## Syntax-aware genetics guard consolidation — 2026-11-28

Moved the legacy DNA inventory and scanner self-tests out of Vitest to `scripts/check-legacy-dna.mts`, retaining all 25 original assertions including alias handling, comment/string exclusions and permitted owner reads. Standard/full source verification invokes the scanner. No gameplay changes; CI pending.

## Renderer audit consolidation — 2026-11-28

Retired `visualsAudit.renderWiring.test.ts`. Seven renderer runtime cases and their historical key proof now run in `renderer.frameOwnership`, `humanSprites` and `terrain.visualCoherence`. The scoped terrain-fill call count is now a declarative region count with both add/remove mutations. Its synthetic proof is superseded; the D21 literal-only example documented a non-defect (identical draw arguments in mutually exclusive transform branches), not a runtime test. No gameplay changes; CI pending.

## September regression suite consolidation — 2026-11-28

Moved all 26 remaining cases from `audit2026-09-21.regression` into their nine existing subject-owner suites (visitor trade, frontier combat, relationship predicates, citizen names, village anchor, rollback, save refusal, persistence, and spatial grid). Preserved each case and its assertions; reused the existing shared human fixture in the anchor suite. Updated the sprite-cache overlap approval to its actual rendering evidence and removed unused export visibility reported by Knip. No gameplay changes; CI pending.

## Event and defense regression consolidation — 2026-11-28

Moved all 18 remaining cases from `low-2-events-defense` into five existing owner suites: yearly/frontier events, visitor trade, diplomacy, militia and prison shifts. Reused the complete shared human and finished-building factories in place of partial duplicate literals; preserved assertions and scoped RNG resets. No gameplay changes; CI pending.

## Human regression suite consolidation — 2026-11-28

Moved all 20 remaining cases from `low-8-humans` into seven owner suites. Shared the existing generated-colony scenario fixtures without changing their initial conditions. All 50 original audit-batch files are now consolidated; the original 51-file headline was an overcount. No runtime cases removed on the basis of presumed overlap. CI pending.

## Canonical npm and CI check routing — 2026-11-28

The existing source check already includes both the declarative guards and the syntax-aware DNA scanner. Standard/all share the same ordered steps; CI adds the production bundle after them, and full adds its existing long-running gates before bundling. The four-project type check already covers scripts. Removed repeated check/owner/overlap/duplicate/lint/type invocations from the CI path; standalone build and type-checked build remain available. The npm duplicate alias now invokes the baseline-aware gate, not a separate raw scan. Changed-test filtering remains limited to the unit step on PRs. CI pending.

## Remaining consolidation, in order

1. **Port the 56 remaining files' source-only cases into `scripts/check-source-guards.mjs`** (or delete
   the ones a behavioral case in the same file already covers). Highest value, lowest risk.
2. **Completed: all 50 audit-batch files consolidated.** Verify the complete gate before recording the final measured inventory and runtime.
3. **Strengthen the 11 assertion-light files** to assert values, or fold them into the stronger file
   that already covers the owner.
4. **Leave the behavioral files alone.** They are the suite's evidence.

## Bug report count

New: 0. Updated existing: 0. No gameplay defect was found; the migration changed no production
behavior. The regressions it caused were found and fixed inside the same pass: the decision registry's
`testFile` field must name existing files (the script is listed without a rule suffix), an emptied
`describe` was removed, and the self-test's overlay builder no longer reads an intentionally absent file.
