# Audit master bug-list status — 2026-11-07

**Source:** `MASTER-BUG-LIST.md` shipped with the 2026-11-07 audit archive. **Master plan:** [full-audit-remediation-2026-11-07.md](full-audit-remediation-2026-11-07.md). This is the tracked status ledger; the archive itself stays read-only.

**Status legend:** `fixed` = implementation in this branch and verified; `verified` = existing fix proved by a runtime test; `open` = no fix yet; `deferred` = deliberately outside the current phase.

## Phase A1/A2 — calendar and gate

| ID | Status | Evidence |
|---|---|---|
| SIM-01, SIM-02, TEST-16 | fixed | PR #129; midnight owners and `gameTick` boundary regressions |
| TEST-01..05, TEST-08, TEST-11, TEST-12, TQ-01..03, TQ-06..08, TQ-14 | fixed | PR #130 required fast calendar gate and coverage floors |
| CB-04, TQ-05 (time-model drift) | fixed | Active README no longer claims a 72-tick day; the day-cadence suite header and the display-year fixture use the 24-hour day. The remaining 72 references are legacy-save migration code and a dated plan. |

## Phase A3 — save, schema and data integrity

| ID | Status | Evidence |
|---|---|---|
| SIM-15, Q-03 | fixed | Typed tick-field table scales every persisted group; event-log tick shares the festival repair time base. `tests/saveLoad.tickResolution.test.ts` |
| SIM-08 | fixed | Monotonic command id, worker echo and filtered replay. `tests/gameLoop.test.ts` |
| SIM-10 | fixed | `electionPromiseRecords` ships in the tick delta and the prep rollback. `tests/simDelta.storyRoundtrip.test.ts`, `tests/simPrep.rollbackFields.test.ts` |
| GAME-09 | verified | Compact-save terrain-seed round-trip and fishing-dock witness pass at runtime. `tests/saveWorldMap.terrainSeed.test.ts`, `tests/terrain.saveGenerationVersion.test.ts` |
| COV-G-03 | fixed | Gazette week 0 reports colony days 0–6. `tests/weeklyGazette.test.ts` |
| COV-G-04 | fixed | Birth genome uses a stream derived from the birth key. `tests/humanLifecycle.test.ts` replays one birth and compares a second tick. |
| COV-G-05 | fixed | Rival growth cadence hashes the stable rival id. `tests/rivalProfiles.test.ts` |
| COV-I-03 | fixed | One hex parser; short colours no longer produce NaN. `tests/renderer.shared.hex.test.ts` |
| DNA-01 | fixed | A valid flat genome loads unchanged. `tests/settlerTraits.test.ts` |

## Phase A4 — lifecycle, data loss and modal safety

| ID | Status | Evidence |
|---|---|---|
| CB-01 | fixed | `GameLoop.frame` reschedules only while running; `tests/gameLoop.raf.test.ts` proves stop schedules none and restart one chain. |
| CB-02 | fixed | Top-level `AppErrorBoundary` exports the live colony or stored quick-save; build passes, forced-throw browser check not run. |
| CB-13 | fixed | Tauri shell plugin, `shell:default` and unused direct `serde` deps removed; Rust build not run here. |
| UX-01 | fixed | Both load paths arm `ConfirmActionDialog`; a file load no longer writes the browser quick-save. |
| UX-02 | fixed | Execution confirmation states the kill is permanent and cannot be undone. |
| UX-03, UX-04 | fixed | Raid report and both warfare dialogs use `useModalFocus` and `useOverlayKeyboard`; contract test covers both files. |
| UX-13 | fixed | Alt+drag strip demolition arms a counted confirmation before `demolishStripBuildings`. |
| UX-14 | fixed | The load confirmation guards re-entry with an in-flight ref; other command buttons still rely on owner-side id guards. |
| COV-B-02 | verified | `tests/useGamePersistence.test.ts` coalesces a second save onto the in-flight save. |

## Phase A6 — render cache and invalidation

| ID | Status | Evidence |
|---|---|---|
| GFX-11 | fixed | Terrain chunks re-bake only their dirty 256-world-px region. `tests/terrain.regionRevision.test.ts` (4). [Report](../bug_report/2026-11-07-terrain-change-rebakes-every-chunk.md) |
| GFX-01 | fixed | Trees and buildings share one depth-sorted static pass. [Report](../bug_report/2026-11-07-trees-lost-behind-southern-buildings.md) |
| GFX-02, GFX-03 | fixed | `renderSnapshotDirtyKey` carries the F4 logistics and juice preferences, so a paused view rebuilds. Preview run: overlay pixels 76 → 122 → 76 while paused. `tests/renderSnapshot.dirtyKey.test.ts` (2). [Report](../bug_report/2026-11-07-paused-snapshot-ignores-overlay-toggles.md) |
| COV-I-02, SIM-18 | fixed | The chunk key carries seed, terrain seed, generation version and map size plus the region revision; the path grid keys on that revision. `tests/terrain.regionRevision.test.ts` (4), `tests/pathfinding.terrainRevision.test.ts` (1). [Report](../bug_report/2026-11-07-terrain-cache-keys-omit-runtime-identity.md) |

## Phase A7 — performance hot paths

| ID | Status | Evidence |
|---|---|---|
| Audio death scan (Phase 6) | fixed | Deaths resolve through an id map instead of a roster search per corpse: 2,009,004 → under 12,006 roster reads at 2,001 entities. `tests/audio.interactionDetect.test.ts` (4). [Report](../bug_report/2026-11-07-audio-death-scan-quadratic.md) |
| PERF-04, RED-05 | fixed | Camp, incoming-raid, performer, festival-square and hotel answers are built once per tick; `buildIncomingRaidIndex` is the one read model for “is this rival marching”. 20→80 festival goers: 1,638→4,368 building reads before, 798→1,008 after. `tests/humanTick.hotPathIndexes.test.ts` (3). [Report](../bug_report/2026-11-07-per-settler-building-and-camp-scans.md) |
| RED-01 | fixed | The final population scan is reused unless the daily layer ran or the dedupe dropped an entity. `tests/gameTick.dedupe.test.ts`, `tests/workerMainThread.parity.test.ts`. [Report](../bug_report/2026-11-07-population-counted-twice-per-tick.md) |

## Remaining verification debt

- GAME-05 was re-checked and needs no change: the negative founding-year sentinel is already in source.
- CB-02's boundary screen was not forced open in the preview; the export path is covered by typecheck and build only.
- CB-13's Rust build was not run in this environment.
- A6's tree/building draw order and the road/build dark flash have no screenshot matrix; only the paused-overlay pixel run is recorded.
- The 720-day continuous simulation stays out of scope by instruction and plan decision; only the fast boundary gate runs.
- SIM-03/SIM-04 and the rest of Plan Phase 1 beyond SIM-01/SIM-02/TEST-16 have no description in this repository: the audit archive (`MASTER-BUG-LIST.md`) is not checked in, so they cannot be actioned here.

