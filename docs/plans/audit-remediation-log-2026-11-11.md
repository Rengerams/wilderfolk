# Audit remediation log — 2026-11-11

Tracks the fixes for [full-code-audit-2026-11-11.md](full-code-audit-2026-11-11.md). Status: **open** · **in progress** · **fixed** (code + regression test) · **verified** (fix passes the relevant gate) · **deferred** (documented reason).

Rule: a row becomes **fixed** only with a regression test that fails on the old behaviour; **verified** only after the named gate ran green. One bug report per distinct defect, indexed in `docs/BUG_REPORTS/SUMMARY.md`.

## Status dashboard (2026-11-11)

**Resolved and verified (22):** S-01 forge, S-03/W-01 leave/save, S-02 Wildkin, W-02 malformed disasters, W-145 energy validation, W-03 fishing footprint, W-04 worldMap bounds, W-111 stale demolition, W-112 family-tree target, W-113 battle report, W-07 audio teardown, S-17 custodian housing, S-18 zero-crew build pace, W-64 + W-123–W-125 story expiry, W-05 terrain patches, W-118–W-122 geometry/camp sites, pregnancy term/start ownership, S-10 hospital geometry, S-16 indoor howler shelter, S-07 harvest, S-08 food ledger, S-09 grass regrowth.

**Resolved with an accepted residual (1):** S-06 (player-human travel fixed; faction camp/hotel/march and reload target remain open).

**In progress (7):**
- Worker hand-off: S-04 election fields, S-05 beauty grid, S-12 worker wander reset, S-13 paused in delta.
- Invariants/commute/herd: S-11 invariants, S-14 commute lead, S-15 herd recovery.

**Not started (rest of the audit):** the remaining medium/low register (W-06, W-08, W-30, W-104, W-107/W-108, W-130–W-144 and the rest of audit §11).

**Last full gate:** `npm run test:standard` PASS — 515 files / 3,347 passed / 2 skipped / 301.7 s. The final registry-only `humanWalk` addition has targeted + typecheck coverage; a full rerun is pending.


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

## Bug-report protocol

Each distinct fixed defect gets `docs/bug_report/2026-11-11-<slug>.md` with the required template, plus one entry in `docs/BUG_REPORTS/SUMMARY.md`. Existing historical reports for Wildkin diet/herd are updated, not duplicated.
