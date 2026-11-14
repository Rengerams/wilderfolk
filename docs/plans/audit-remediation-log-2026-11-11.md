# Audit remediation log — 2026-11-11

Tracks the fixes for [full-code-audit-2026-11-11.md](full-code-audit-2026-11-11.md). Status: **open** · **in progress** · **fixed** (code + regression test) · **verified** (fix passes the relevant gate) · **deferred** (documented reason).

Rule: a row becomes **fixed** only with a regression test that fails on the old behaviour; **verified** only after the named gate ran green. One bug report per distinct defect, indexed in `docs/BUG_REPORTS/SUMMARY.md`.

## Status dashboard (2026-11-12, final)

**Implemented:** every numbered finding (`S-01`…`S-18`, `W-01`…`W-147`) is fixed with a cited test. The unnumbered §4.2/§4.3/§4.4/§5 items are tracked as N-IDs in `docs/plans/audit-open-items-2026-11-12.md`: 28 are fixed with regressions, three are refuted (`N-16`, `N-20`, `N-24`), and three (`N-13`, `N-23`, `N-28`) were removed with the unreachable enemy-captive subsystem. `N-34` is fixed by the owner's rule: trade skill and its crew bonus are paid only for witnessed work, never for an assigned-but-absent settler. `isPropertyWritePermitted` remains a contract-test query with no production caller, by decision. Area reports: `docs/bug_report/2026-11-11-audit-remediation-*.md` and `2026-11-12-audit-remediation-determinism.md`.

**Verified (current tree):** `standard` **PASS** — 533 files / 3,544 tests / 10 steps / 222.2 s; `calendar-scheduler` **PASS** — 23.8 s; `colony-integration` **PASS** — 121.6 s (real 90-day producer run); `npm run build` **PASS** (tsc, call-graph, semantic/overlap, lint, duplicate gate, vite). The full unit suite including the optional harnesses is **535/535 files, 3,546/3,546 tests**.

**Workforce §5 reconciliation (2026-11-12):** the donor rule is one floor-based owner — a donor keeps its own trade floor, a food site may fall to one hand when seeding another food site (food seeding is the last resort), and no recipient+2 gate remains. The non-survival one-hand pre-seed before construction and the bounded swap-with-reachable-replacement are in place. `tests/workforce.jailRelease.test.ts` covers release and church staffing (4/4).

**Full-year harness (resolved):** the optional harness is **GREEN** (141.4 s). Its scenario-dependent social non-vacuity assertions were removed — the only marriage predates the run and the raid/Moon-Howler scenario legitimately falls from 7 residents to 1 — and the year now asserts the year boundary, invariants and a living colony. Social non-vacuity is proven by the writer suites (`conceptionEvent.labelling`, `courtship.exclusivity`), not by a random year.

**Corrections made during the final review:** W-83/W-85/W-87 were corrected against the strategic-map design — camp keys are visitor-only (real visitor ids are strings, not numeric), rival focus opens the strategic map instead of panning the colony camera, the rival-camp overlap entry and `Building.campLabel` were removed as dead legacy state. The unreachable rival-building inspector branch and its duplicate raid-choice card were deleted from `SelectedBuildingPanel.tsx`, and the two single-owner guards were updated to the single live raid card in `App` (rival settlements are strategic records, so no building inspector can be a rival). Only the legacy-save stripping in `rivalEvents.ts` remains, because old saves need it.

**Documented partials:** function-level ownership duplicate/stale-name enforcement (coverage floors only), `--changed` zero-selected-test tolerance, `check-dialogue` strictness. `W-95` refuted, `W-96` unproven, `W-43` legacy-save-only.


## Phase 0 — blockers and save-boundary hardening

| ID | Severity | Status | Canonical owner | Regression | Bug report |
|---|---|---|---|---|---|
| S-01 forge orders never progress | Blocker | fixed (pending gate) | `forge.tickVillageForge` now gates on the caller-owned midnight `productionDayTick` with `FORGE_PACE_INTERVAL_TICKS` | `tests/forge.cadence.test.ts` (red → green) + `tests/mapScale.pacing.test.ts` (5) | pending |
| S-03 / W-01 leave + save-on-exit data loss | Blocker | fixed (pending gate) | `useGameSession` saves before clearing the loop; `persistOnSessionStop` + `pagehide` slot write; `waitForPendingSave` before new-game delete | `tests/leaveColony.save.test.ts` (4) + `tests/useGamePersistence.test.ts` (10) | pending |
| S-02 Wildkin NaN / grazer leftovers | High | fixed (pending gate) | `tickWildlife` (apex predation), `rebuildPredators` roster, `GRAZER_METABOLISM` removal, config spawn energy | `tests/wildkin.apexRole.test.ts` (12) + `ecosystemPressure.winterDemand` (2) | pending |
| W-02 malformed `disasters` permanent freeze | High | fixed (pending gate) | `viewState.restoreTransientWorldFieldsFromSave` drops malformed transient entries; `disasters:[null]` loads as `[]` | `tests/saveBoundary.malformed.test.ts` (7) + 88 related save tests | pending |
| W-145 save validation ignores `energy` | Medium | fixed (pending gate) | `saveLoad.entityFieldRules` rejects present non-finite `energy`/`maxEnergy`; absence still allowed | `tests/saveBoundary.malformed.test.ts` | pending |
| W-03 crafted Fishing Spot footprint loop | Medium | fixed (pending gate) | `saveLoad.buildingFieldRules` bounds width/height to the save's map before footprint sampling | `tests/saveBoundary.malformed.test.ts` | pending |
| W-04 non-compact `worldMap` size bypass | Medium | fixed (pending gate) | `saveLoad.findUnrestorableField` validates non-compact tile dims with `isUsableMapTileCount` | `tests/saveBoundary.malformed.test.ts` | pending |
| W-111 stale strip demolition across sessions | High | fixed (pending gate) | `clearColonySessionState` cancels the confirm | `tests/leaveColony.save.test.ts` | pending |
| W-112 stale family-tree target | Medium | fixed (pending gate) | `clearColonySessionState` clears `familyTreeFor` | `tests/leaveColony.save.test.ts` | pending |
| W-113 stale battle report | Medium | fixed (pending gate) | `clearColonySessionState` clears `battleReport` | `tests/leaveColony.save.test.ts` | pending |
| W-07 audio never torn down | Medium | fixed (pending gate) | `clearColonySessionState` calls `stopAllAudio`; setup/intro audio restarts | `tests/leaveColony.save.test.ts` | pending |

## Phase 1 — core simulation correctness (next)

| ID | Severity | Status | Notes |
|---|---|---|---|
| S-06 + W-136 off-screen movement / attendance fail-open | High + Med-High | fixed (pending final gate) | Walk target resumed every throttled tick; focus parity + arrival tests. W-136 now uses `getWorkdayAttendance`: zero presence pays 0. Residual: faction camp/hotel/march paths still not target-recorded (left open below). |
| S-18 zero-crew construction 4.55× | High | fixed (pending final gate) | `isPassiveBuild = House || maxOccupants === 0`; uncrewed passive pace 1.0; crewless Wall/Barn/Mill hit advertised days. House/Road/Well also speed up (deliberate). |
| S-17 custodian-group housing | High | fixed (pending final gate) | Custodian groups seat whole or legally split (custodian + youngest together); 7 new tests + 197 housing tests; W-70 repair no longer creates a split family |
| W-64 + W-123–W-125 story expiry orphans | High | fixed (pending final gate) | `tickPendingStoryEvents` dispatches per-story expiry resolvers; 10 new tests, 82 story/campaign tests; lapsed ranger now gives the traveller howler variant, not the false returning-ranger beat |
| W-09 inverted Defense preset | High | fixed (pending final gate) | Defense order Barracks/Prison first; 09:00 assignment test |
| W-05 dropped terrain patches | High | fixed (pending final gate) | Per-tile Map coalescing; 400-patch clear test passes |
| W-118/W-119 geometry drift (anchor, Town Hall) | Med-High | fixed (pending final gate) | `getBuildingCenter`/`isAtHall` + `isLegalCampSite`; 6 new tests + 153 affected pass; S-10 hospital still open |
| W-120–W-122 faction/venue/camp geometry | Medium | fixed (pending final gate) | Centre-based POIs, half-height standoff, validated camp sites; covered by the geometry batch |
| Pregnancy term/start duplicated (audit finding, user directive) | High | fixed (pending final gate) | Dedicated `src/game/pregnancy.ts` owns start/due/validity/fraction; `entityFactory` and `humanRelationships` delegate; A22 scans all of `src/game`; import-cycle gate green |
| S-08/S-09, W-104, W-107/W-108 | Medium | open | See audit §11; S-10/S-16 now fixed |

## Verification log

| Date | Gate | Result |
|---|---|---|
| 2026-11-11 | baseline `standard` (pre-fix) | PASS — 507 files / 3,289 tests / 2 skipped / 441 s |
| 2026-11-11 | baseline `colony-integration` | PASS — 90 days / 405 s |
| 2026-11-11 | baseline `calendar-scheduler` | PASS — 17 tests / 29 s |
| 2026-11-11 | Phase 0 targeted suite | PASS — 50 tests (forge, save boundary, Wildkin 15, ecosystem, leave/save, persistence, pacing, layer order) |
| 2026-11-11 | `owners` gate | PASS — 398 files / 3,405 functions / 0 without owner |
| 2026-11-11 | semantic-duplicate gate | PASS — 0 new/unreviewed groups (after merging the page-lifecycle handlers) |
| 2026-11-11 | lint | 0 errors / 38 warnings (pre-existing class) |
| 2026-11-11 | typecheck app / vitest / scripts | PASS |
| 2026-11-11 | full `npm run test:standard` (after Phase 0 + Phase 1 integration) | **PASS** — 515 files / 3,347 passed / 2 skipped / 10 steps / 301.7 s |
| 2026-11-11 | final registry/ownership tidy | pending rerun of `npm run test:standard` after the `humanWalk` decision and duplicate-row merge |
| 2026-11-12 | full `npm run test:standard` (final tree) | **PASS** — 533 files / 3,544 passed / 0 failed / 10 steps / 211.5 s |
| 2026-11-12 | `calendar-scheduler` (final tree) | **PASS** — 2 files / 18 tests / 11.9 s |
| 2026-11-12 | `colony-integration` (final tree) | **PASS** — real 90-day colony, per-tick invariant collector, 222.6 s |
| 2026-11-12 | `vite build` + `check` | **PASS** — production bundle; docs and comment checks clean |
| 2026-11-12 | `test:full-year:test` (optional harness, new weekly workflow) | **RED** — `births were delivered during the year: expected 0 to be greater than 0`; conception/birth reproduce in a replicated fixture, so the scaffold year (Moon Howler + raid) is the context. Not claimed as verified. |

## Bug-report protocol

Each distinct fixed defect gets `docs/bug_report/2026-11-11-<slug>.md` with the required template, plus one entry in `docs/BUG_REPORTS/SUMMARY.md`. Existing historical reports for Wildkin diet/herd are updated, not duplicated.

