# Test-suite audit — 2026-11-26

Audit of `tests/` against the engineering standard in `AGENTS.md` §1.11 ("tests are evidence, not a
productivity metric: guard real behavior, do not mirror implementation details"). No test was changed
by this audit; the consolidation steps below are recommendations, each still requiring the
equivalence check that `docs/plans/test-suite-optimization-2026-10-28.md` deferred.

## Verdict

- **Up to date: yes.** All 540 unit files pass (3,732 cases, 0 failed, 0 skipped, 0 empty files), no
  test imports a module that no longer exists, and 487 of 542 files were touched in November 2026.
  The suite is not stale.
- **Not redundant.** No two files share half of their assertion/title set, no literal pin is repeated
  across files, and the unused-code audit reports nothing.
- **Over-composed.** The growth from 390 files (2026-10-28) to 542 comes from audit batches and
  source-text guards, not from new behavioral coverage. 226 cases (6.3 %) assert the *text* of `src`
  rather than its behavior, 288 cases (8.0 %) assert that something is absent, and 51 files are named
  after the audit that produced them instead of their subject.
- **Meaningful core:** 458 files test runtime behavior at a canonical owner and never read source
  text. Those are the suite's value and should stay.

## How this was measured

| Check | Result |
| --- | --- |
| `vitest run` (unit tier, JSON reporter) | 540 files, 3,732 cases, 0 failed, 0 skipped |
| Wall / summed file time | 210 s wall, 471 s summed |
| Imports resolved against the tree | 0 test files importing a missing module |
| Module coverage | 296 distinct `src` modules imported (test factories included) |
| Case and assertion volume | 3,592 declared cases, 11,942 `expect`, 85,372 lines |
| File-pair similarity (titles + assertions, Jaccard ≥ 0.5) | 0 pairs |
| Repeated literal pins (`expect(CONST).toBe(...)` 3+ times) | none |
| `scripts/check-knip.mjs` | no unused files or exports reported |
| Last-change month per file | Nov 2026: 487, Oct 2026: 49, Sep 2026: 6 |

## Inventory by category

| Category | Files | Cases | Judgment |
| --- | --- | --- | --- |
| Behavioral owner tests (no source-text scan) | 458 | ~3,000 | Keep — this is the suite |
| Source-text guards (any regex read of `src`) | 83 | 226 | Consolidate into the static `check` step |
| Absence / retirement guards (subset of the above) | 126 | 288 | Keep the ones that protect a rule; drop the archaeology |
| Audit-batch files (`audit*`, `low-*`, `medium-*`, `phase*`, `*Batch`, `duplication*`) | 51 | — | Merge into their subject owner |
| Single-case files | 43 | 43 | Keep, but each costs a vitest process |
| Assertion-light files (≥ 40 % `toBeTruthy`/`toBeDefined`) | 11 | — | Strengthen or fold into a stronger file |

Rows overlap — an audit-batch file can also contain absence guards — so they do not sum to 542. The
first row is the complement: 542 files minus the 83 that read source text.

### Source-text guards — 83 files, 226 cases

These read `src` with `readFileSync` and assert on a regex. They are lint rules living in the test
tier: they break on every refactor, they cannot fail for a behavioral reason, and each pays a full
vitest process. Four files are *entirely* source scans:

- `compatFacadeMigration.test.ts` (3 cases)
- `stripPreview.emptyGuard.test.ts` (3 cases)
- `workplaceReference.singleOwner.test.ts` (3 cases)
- `strategicWorldMap.windowLayout.test.ts` (2 cases)

Nineteen more are half or more source scans, led by `uiSingleOwner.test.ts` (38 of 45 cases),
`duplicationA.remaining.test.ts` (10 of 16), `visualsAudit.renderWiring.test.ts` (16 of 27) and
`keyboardGuards.contract.test.ts` (18 of 31).

The correct home for a "this expression appears exactly once" rule is `scripts/check-*.mjs`, which
already owns overlap, semantic-duplicate, import-cycle and call-graph review. Moving them there runs
them once, in milliseconds, in the `check` step that every gate already executes.

### Absence / retirement guards — 288 cases

`not.toMatch`, `not.toContain`, `not.toThrow` on source text, and files such as
`onMapVisitors.retired.test.ts`, `hostileWeather.disabled.test.ts`, `frontier.legacyEvents.test.ts`.
They guard against reintroducing removed code. Worth keeping where the removal was a real defect
(`A17 manual job assignment retired`); pure archaeology belongs with the static checks.

### Audit-batch files — 51

`audit2026-09-21.regression` (34 cases), `auditOpenItems.verification`, `audit.hotPathScans.equivalence`,
`calendarPhase.auditRegressions`, `economyAudit.*`, `entityAudit.*`, `housingPulse.audit`,
`loopWorker.auditRemediation`, `economyWorkforce.auditRemediation`, `duplicationA.remaining`,
`personality.legacyConsumerAudit`, `dialogue.legacyElectionsAudit`, `low-1` … `low-9`,
`medium-A/B/C/N`, `phase7.social`, `renderBatch.*`, `simBatch.*`, `uxBatch.*`, `persistenceBatch.*`,
`visualsAudit.renderWiring`, `uiRefinement.*`, `virtualPlayer.*Batch`.

They contain real regressions, but the name records the audit that found the bug, not the rule that
must not regress. Several exercise owners that already have a dedicated file — `low-1-worker-persistence`
imports `simPrep`/`simDelta` (which have their own files), `medium-C1-economy` imports
`dailyEconomy` (`dailyEconomy.ledgerEcology`), `audit2026-09-21.regression` imports the housing
pipeline (`housingPipeline.*`). Their assertions are not literal duplicates of those files, so each
case still needs the equivalence check; the gain is that a failure would name its subject. Merging
keeps the coverage and removes the index problem — today a reviewer cannot tell from the filename
what a failure means.

### Runtime

395 files finish under 1 s, 80 take over 2 s, and 12 take over 5 s. The top 20 files account for
148 s of the 471 s summed time (31 %): `groundLook.bands` 17.6 s, `quarry.zeroStoneRecovery` 17.0 s,
`terrain.mapVariety` 16.8 s, `residency.dayBoundary.budget` 10.4 s, `terragen.riverGeneration` 7.4 s,
`saveWorldMap.terrainSeed` 7.2 s, `terrain.presetIdentity` 7.0 s, `audit2026-09-21.regression` 6.1 s,
`simPrep.rollbackFields` 5.6 s, `medium-C1-economy` 5.5 s, `tradeCaravan.carrierRetention` 5.4 s,
`saveWorldMap.compact` 5.1 s. Time is not the problem; composition is.

### Assertion-light files

`quarry.zeroStoneRecovery` (8/12 truthy), `dialogueBusy.forcedLineGates` (4/6),
`saveMigration.birthdatesPreserved` (5/9), `pregnancyHospitalWork` (4/8), `terrain.campGround` (2/4),
`frontier.legacyEvents` (2/4), `relationships.sharedHomeFriendship` (5/11),
`foodLedger.acceptedCatch` (3/7), `medium-C1-economy` (6/15), `colonyProducerCommute` (4/10),
`stats.largestPopulation` (2/5). These pass on a partially broken implementation; they should assert
the value, not its presence.

## Recommended consolidation, in order

1. **Move the 83 source-text files' scan cases into `scripts/check-*.mjs`** (or delete the ones a
   behavioral case in the same file already covers). Expected: −20 files, −226 cases in the unit tier,
   no lost guard. Highest value, lowest risk.
2. **Merge the 51 audit-batch files into their subject owners.** Expected: −36 files. Keep every case
   that names a rule; drop the ones that only restate a now-canonical implementation.
3. **Strengthen the 11 assertion-light files** to assert values, or fold them into the stronger file
   that already covers the owner.
4. **Leave the ~430 behavioral files alone.** They are the suite's evidence.

Target after 1–3: roughly 470 files guarding behavior, with the lint-style rules running in the
`check` step where they belong. That is a reduction of composition, not of coverage.

## Bug report count

New: 0. Updated existing: 0. No gameplay defect was found; this audit changed no production code and
no test.
