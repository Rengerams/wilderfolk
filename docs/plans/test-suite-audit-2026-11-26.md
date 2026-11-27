# Test-suite audit — 2026-11-26, migration 2026-11-27

Audit of `tests/` against the engineering standard in `AGENTS.md` §1.11 ("tests are evidence, not a
productivity metric: guard real behavior, do not mirror implementation details"), followed by the
first migration step the owner approved. Behavioral coverage was not reduced: every rule that left
the unit tier now runs in `scripts/check-source-guards.mjs` on every gate.

## Verdict

- **Up to date: yes.** 3,687 executed cases pass, 0 failed, 0 skipped, no test imports a module that
  no longer exists, and the great majority of files were touched in November 2026. The suite was not
  stale.
- **Not redundant.** No two files share half of their assertion/title set, no literal pin is repeated
  across files, and the unused-code audit reports nothing.
- **Over-composed.** The growth from 390 files (2026-10-28) to 542 came from audit batches and
  source-text guards, not from new behavioral coverage.
- **Meaningful core:** the files that test runtime behavior at a canonical owner. Those are the
  suite's value and are untouched.

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
| Behavioral owner tests | ~466 | Keep — this is the suite |
| Source-text guards still in the test tier | 69 | Next migration increment |
| Audit-batch files (`audit*`, `low-*`, `medium-*`, `phase*`, `*Batch`, `duplication*`) | 51 | Merge into their subject owner |
| Single-case files | ~40 | Keep, but each costs a vitest process |
| Assertion-light files (≥ 40 % `toBeTruthy`/`toBeDefined`) | 11 | Strengthen or fold into a stronger file |

Rows overlap — an audit-batch file can also read source text — so they do not sum to 535.

## What moved in the migration (2026-11-27)

`scripts/check-source-guards.mjs` now owns the single-owner source-text rules as 14 named rules, run
from the `check` step of every gate (`npm test -- check`). `--self-test` replays each rule against an
overlay source tree and fails if the rule no longer reports a violation, so a rule cannot silently
stop guarding. 44 cases left the unit tier; `introTimeline.cta` kept the data half of its third case and
moved only the source assertion.

Files removed (their cases now run as rules):

- `stripPreview.emptyGuard.test.ts` → `strip-preview-never-empty`
- `workplaceReference.singleOwner.test.ts` → `workplace-reference-single-owner`
- `strategicWorldMap.windowLayout.test.ts` → `frontier-window-layout`
- `ux2.introPrompt.test.ts` → `intro-ready-prompt`
- `selectedBuildingPanel.perBuildingState.test.ts` → `selected-building-panel-keyed`
- `debugGate.guide.test.ts` → `debug-mode-gate`
- `ticksPerDay.literals.test.ts` → `test-tier-day-length-literals` (22 guarded test files)

Files trimmed to their behavioral half: `dayLength.owner`, `copyAndDayIndex.owners`,
`foodThresholds.owner`, `hospitalReputation.owner`, `buildingFocus.centre`, `introTimeline.cta`,
`diagnosticsQuietness`.

`compatFacadeMigration.test.ts` was **not** migrated: it runs the compatibility-facade tool against a
temporary fixture, so it is a behavioral test of a script, not a source scan. An earlier draft of
this audit listed it as source-only; that was wrong.

## Remaining source-text guards — 69 files

The largest, in order: `uiSingleOwner` (38 of 45 cases), `keyboardGuards.contract` (18 of 31),
`visualsAudit.renderWiring` (16 of 27), `duplicationA.remaining` (10 of 16), `uxBatch.onboardingAndLogs`
(8 of 15), `uiRefinement.residuals` (8 of 9), `ux2.doorNames` (8 of 9), `uxBatch.interactionWindows`
(6 of 10), `ui-a11y.contract` (6 of 12), `low-2-events-defense` (20 source reads), plus `uiRefinement.owners`,
`councilNotices.row`, `dashboardData.suggestionLabels`, `onMapVisitors.retired`, `rpgArt.integration`,
`spotlightApplause`.

These are lint rules in the test tier: they break on behavior-preserving refactors, cannot fail for a
behavioral reason, and each pays a vitest process. They belong in the same script, next to the 14
rules already there. Porting them is mechanical — copy the regex and the file list into a `GUARDS`
entry, add a `sample` for the self-test, then delete the case.

## Absence / retirement guards — 288 cases

`not.toMatch`, `not.toContain`, `not.toThrow` on source text, and files such as
`onMapVisitors.retired`, `hostileWeather.disabled`, `frontier.legacyEvents`. They guard against
reintroducing removed code. Worth keeping where the removal was a real defect (`A17 manual job
assignment retired`); pure archaeology belongs with the static checks.

## Audit-batch files — 51

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

## Remaining consolidation, in order

1. **Port the 69 remaining source-text files' scan cases into `scripts/check-source-guards.mjs`**
   (or delete the ones a behavioral case in the same file already covers). Highest value, lowest risk.
2. **Merge the 51 audit-batch files into their subject owners.** Keep every case that names a rule;
   drop the ones that only restate a now-canonical implementation.
3. **Strengthen the 11 assertion-light files** to assert values, or fold them into the stronger file
   that already covers the owner.
4. **Leave the behavioral files alone.** They are the suite's evidence.

## Bug report count

New: 0. Updated existing: 0. No gameplay defect was found; the migration changed no production
behavior. The one regression it caused was found and fixed inside the same pass: the decision
registry's `testFile` field must name existing files, so the script path is listed without a rule
suffix.
