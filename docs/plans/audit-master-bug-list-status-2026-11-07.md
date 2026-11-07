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
| DNA-02 | fixed | Player-only DNA: `createEntity`, the load backfill and the selection panel gate on `isForeignFaction`; visitors and caravan carriers are created neutral and lose a saved foreign genome/marks on load. `tests/settlerTraits.test.ts` (6), `tests/personality.legacyDNA.test.ts` (9). [Report](../bug_report/2026-11-07-foreign-humans-get-dna-and-born-marks.md) |
| DNA-03 | fixed | One per-mark allowed-source table validates provenance in `grantMark` and `normalizeMarks`. `tests/personalMarks.test.ts` (21). [Report](../bug_report/2026-11-07-mark-provenance-unvalidated.md) |

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
| Static entity layer | fixed | Keyed on a static-world revision instead of `state.tick`; the tick joins it only while a building is under construction, and the marriage links moved to the per-frame pass. Preview run: new colony rendered, wheel zoom rebaked cleanly. `tests/renderSnapshot.staticLayerKey.test.ts` (4). [Report](../bug_report/2026-11-07-static-entity-layer-repaints-every-tick.md) |
| COV-I-02, SIM-18 | fixed | The chunk key carries seed, terrain seed, generation version and map size plus the region revision; the path grid keys on that revision. `tests/terrain.regionRevision.test.ts` (4), `tests/pathfinding.terrainRevision.test.ts` (1). [Report](../bug_report/2026-11-07-terrain-cache-keys-omit-runtime-identity.md) |

## Phase A7 — performance hot paths

| ID | Status | Evidence |
|---|---|---|
| Audio death scan (Phase 6) | fixed | Deaths resolve through an id map instead of a roster search per corpse: 2,009,004 → under 12,006 roster reads at 2,001 entities. `tests/audio.interactionDetect.test.ts` (4). [Report](../bug_report/2026-11-07-audio-death-scan-quadratic.md) |
| PERF-04, RED-05 | fixed | Camp, incoming-raid, performer, festival-square and hotel answers are built once per tick; `buildIncomingRaidIndex` is the one read model for “is this rival marching”. 20→80 festival goers: 1,638→4,368 building reads before, 798→1,008 after. `tests/humanTick.hotPathIndexes.test.ts` (3). [Report](../bug_report/2026-11-07-per-settler-building-and-camp-scans.md) |
| RED-01 | fixed | The final population scan is reused unless the daily layer ran or the dedupe dropped an entity. `tests/gameTick.dedupe.test.ts`, `tests/workerMainThread.parity.test.ts`. [Report](../bug_report/2026-11-07-population-counted-twice-per-tick.md) |
| Render sleeper cull and status context | fixed | `drawHumans` builds one id → building map per tick and the status-icon inputs are memoised per snapshot. 20→80 sleepers: 1,730→8,600 building reads per frame before, 320→560 after; a repeated repaint of one unchanged state read 1,650 → 0. `tests/renderer.humanHotPaths.test.ts` (2). [Report](../bug_report/2026-11-07-per-frame-human-rescans.md) |
| COV-I-04 | fixed | Height-mesh lattice vertices are sampled once per map instead of per mover per frame; 200 movers inside one 32-px cell now read 0 elevation entries after the cell is warm. `tests/terrainAtlas.riseCache.test.ts` (4). [Report](../bug_report/2026-11-07-per-frame-human-rescans.md) |

## Phase A4 (continued) — death, needs and ecology

| ID | Status | Evidence |
|---|---|---|
| SIM-05 | fixed | The per-tick death tally (`tallyTickDeaths`, the single owner in `stats.ts`) asks `isPlayerHumanShiftOwner` before the visual type, so a cursed settler dying in wolf form counts as a human death; trees, grass and foreign humans stay out of both tallies. `tests/stats.deathAccounting.test.ts` (5). [Report](../bug_report/2026-11-07-werewolf-form-death-counted-as-animal.md) |
| SIM-16 | fixed | `recordHumanDeath` writes the age when the death commits, called by the tick tally and the raid casualty path, so a mid-year elder death reaches the record. `tests/stats.deathAccounting.test.ts` (5). [Report](../bug_report/2026-11-07-longest-life-missed-midyear-deaths.md) |
| SIM-19 | fixed | `advanceHumanNeeds` takes `unheatedWinter` and multiplies nutrition loss by 1.5; human tick supplies the season and the stored heating result. One worked hour: 78.64 heated vs 77.96 cold. `tests/humanNeeds.unheatedWinter.test.ts` (1). [Report](../bug_report/2026-11-07-winter-heating-had-no-effect.md) |
| SIM-22 | fixed | The population term is one point per 25 settlers and each Wildlife Preserve damps the score by 5% (50% floor): 300/1,000/2,500 read 12/40/100 instead of a flat 100. `tests/dailyEcology.pollutionGrading.test.ts` (2). [Report](../bug_report/2026-11-07-pollution-pinned-at-cap.md) |
| COV-G-08 | fixed | `hasProductiveFoodProducer` requires a crew for a completed producer and still counts a site under construction; rivals never count. `tests/virtualPlayer.foodProducer.test.ts` (4). [Report](../bug_report/2026-11-07-unstaffed-farm-satisfied-food-step.md) |
| GAME-15 (dead config half) | verified | `Human.energyLossPerTick` is already absent from the source tree; only the species energy model declares that field. The romance-gate retune is a balance decision, listed under deferred items. |
| GAME-14 | open (info) | Documented only: wildlife refill and offscreen metabolism remain as described; no code change in this pass. |

## Phase A8 — main-thread frame cost

| ID | Status | Evidence |
|---|---|---|
| PERF-16 | fixed | The unpaused frame builds its simulation focus from the `ResizeObserver` layout size instead of reading `offsetWidth`/`offsetHeight` every frame. `npm run test:types`, `npm run lint`, `npm run build`. [Report](../bug_report/2026-11-07-per-frame-layout-read-and-position-allocation.md) |
| PERF-09 | fixed | `presentationPosition` compares coordinates without copying the entity and returns the entity itself for a stationary or teleporting mover, so an unsmeared entity allocates nothing; a blended position still allocates one object because callers hold two positions at once. `tests/renderer.motionAndHover.test.ts` (10). |
| COV-A-02 | fixed | The interaction pass is the single death-sound owner and gates on `isPlayerHumanShiftOwner`; the duplicate population-drop cue was removed from the audio hook, so a settler death plays once and a visitor or rival death is silent. `tests/audio.interactionDetect.test.ts` (6). [Report](../bug_report/2026-11-07-player-death-sound-doubled.md) |

## Deferred with reasons

- **PERF-01, PERF-03 (P1, worker rollback clone and full entity roster).** Replacing the every-tick deep clone with an inverse-operation journal or periodic snapshot/replay, and shipping incremental entity deltas, changes the worker's rollback contract. It needs its own phase with the parity/seed/pool-stress suites as the gate and a before/after measurement; not attempted in this pass.
- **GAME-08 (P1, 1,800-settler freeze).** Reproducing it needs the owner's 2,027-settler save or the large population fixture; neither is present in this environment, and the audit's own rule forbids a speculative fix before the freeze is reproduced.
- **SIM-20, GAME-13 (captive needs).** Giving captives a starvation-capable needs record contradicts the decision registry's written contract that prisoners do not work or roam and that the 08:00 ration creates no stamina or energy needs; it needs an explicit gameplay decision (and a decision-registry rewrite) before code.
- **SIM-21, GAME-16 (exhaustion price and scale gate).** Both depend on the 2,500-settler tier's 18:00 stamina and food distribution; choose the tuning only after that measurement exists.
- **GAME-15 (romance gates).** Retuning the 22–27 stamina thresholds changes romance pacing; it is a balance decision, not a correctness fix.
- **PERF-15, RED-07 (SoA bucket shims, repeated sorts, construction-worker membership).** Neither has a recorded profile to prove the change; the audit requires measured before/after for renderer work.

## Remaining verification debt

- GAME-05 was re-checked and needs no change: the negative founding-year sentinel is already in source.
- CB-02's boundary screen was not forced open in the preview; the export path is covered by typecheck and build only.
- CB-13's Rust build was not run in this environment.
- A6's road-through-forest dark frame and the tree/building depth order have no screenshot matrix; the paused-overlay pixel run and the static-layer preview run (new colony, zoom rebake, 0 console errors) are what is recorded.
- The visitor/caravan aptitude-chip gate has no component test and was not exercised in the browser; only the creation and load contracts are covered by tests. The preview run confirmed the app boots with zero console errors.
- The 720-day continuous simulation stays out of scope by instruction and plan decision; only the fast boundary gate runs.
- The A4 needs/ecology changes (unheated winter, graded pollution) have unit regressions but no 7/30/360-day balance re-measurement.
- The A8 frame changes have no `SpeedDiag` before/after profile; the loop and interpolation regressions cover the contract, not the frame time.
- The death-sound change has no live audio capture; only the cue-count contract is covered.
- SIM-03/SIM-04 and the rest of Plan Phase 1 beyond SIM-01/SIM-02/TEST-16 have no description in this repository: the audit archive (`MASTER-BUG-LIST.md`) is not checked in, so they cannot be actioned here.

