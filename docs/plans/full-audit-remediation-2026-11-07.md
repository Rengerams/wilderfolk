# Full-audit remediation plan — V.0.6.5.2

**Status:** implementation underway (A1: merged PR #129; A2: PR #130; A3: save/schema/data-integrity fixes; A4: lifecycle/data-loss/modal fixes; A6: render cache and invalidation; A7: performance hot paths started — all implemented on `master-approach-buglist`). Per-ID outcomes live in [audit-master-bug-list-status-2026-11-07.md](audit-master-bug-list-status-2026-11-07.md). Calendar-gate scope was revised on 7 November 2026: no 720-day continuous simulation in PR CI. **Source:** `docs/private/audits/2026-11-07/FULL-AUDIT-2026-11-07.md` and its category reports, including `code-quality.md` (Q-01..Q-16) and `dna-aptitudes.md` (DNA-01..04). **Related plans that remain authoritative for their areas:** `worker-sync-and-performance-2026-11-02.md`, `human-needs-issue-61-2026-10-26.md`, `roads-walls-navigation-overhaul.md`, `duplicate-code-elimination-2026-11-02.md`, `test-suite-optimization-2026-10-28.md`.

## 0. Outcome

Ship V.0.6.5.2 with:

- no critical or high correctness/data-loss defect open;
- the calendar and needs foundations explicitly decided and documented, not patched around;
- every audit ID either fixed, deliberately deferred with a reason, or proven not-a-bug;
- a gate that would have caught SIM-01/SIM-02/TEST-16 (fast real-`gameTick` boundary gate) and a separately scheduled 2,500-settler scale tier;
- the user-visible road/build dark flash (GFX-11) and the worst FPS spikes removed or measured;
- dead/alias/duplicate surface reduced without behaviour change;
- docs, ownership registers and decision registry consistent with the code.

**Definition of done:** `npm run test:types`, `npm run lint`, `npm run build`, `npm test`, `npm run audit`, `npm run check:source` all pass; the required Year-2 boundary gate and the separate scheduled 2,500-settler scale gate pass; the audit's `LIVE-FINDINGS-STATUS.md` has no unstatused ID; every PR reports its bug-report counts.

---

## 1. Foundation first — the structural defects behind the bug list

The audit found more than isolated bugs. These are the contracts that produced them; each phase below must settle its foundation item before closing symptoms.

| # | Foundation defect | Symptoms it produced | Decision required | Phase |
|---|---|---|---|---|
| F-1 | **Calendar phase ownership is incoherent.** The daily layer runs four phases (00/06/18; 12 empty), but several branches still gate on midnight inside the 18:00 world-events pass. | SIM-01 term elections, SIM-02 skill decay, TEST-16 visitor groups | Define which work runs at **00:00, 06:00, 12:00, 18:00**; make the phase the single owner, not each caller's private gate | 1 |
| F-2 | **The time model changed 72→288 but only part of the code followed.** Assignment/daily stayed at 72, so daily runs 4×/day; README, ARCHITECTURE and comments still say 72; election intervals were tuned on 7.2-hour years. | CB-04, GAME-01/02/07/11, TEST-06/10/17, TQ-05 | Keep **288** (24 h × 12 ticks/h), state one phase table, recalibrate the election/year claims and all `TICKS_PER_*` consumers | 1 |
| F-3 | **Save migration is field-by-field and incomplete.** Accepted 72-tick saves do not have all tick-valued fields ×4; the terrain seed and register drift separately. | SIM-15, GAME-09, COV-G-03/04/05, GAME-05 | One versioned migration with a **single tick-field matrix**; no ad-hoc field additions | 2 |
| F-4 | **Entity-kind taxonomy is implicit.** Humans have needs, animals have energy, captives have neither; `energy` survives as a stamina mirror; death paths are scattered. | SIM-05/16/19/20/21/22, GAME-13/14/15/16 | One system per kind: **humans = needs, animals = energy, captives = needs**; a single death-path registry; a legacy-energy guard | 3 |
| F-5 | **Cache invalidation is string-keyed and global.** Terrain revision is global (GFX-11); the entity layer keys on `state.tick`; the snapshot key is a hand-enumerated string; the path cache omits terrain overrides. | GFX-01/02/03/11, SIM-18, COV-I-02, the per-tick static repaint/FPS spike | Replace global invalidation with **revision tokens per region/cache domain**; keep old layers until replacements are ready | 5 |
| F-6 | **Worker transport is correct but conservative.** One tick in flight, full rollback clone every tick, full entity roster per tick; `MAX_PIPELINE_DEPTH=4` is dead configuration. | PERF-01/03, FPS tick-boundary spikes, slow 2,000+ sim rate | Keep **one tick in flight** until measured; replace full clone/roster with incremental state; update the constant/docs | 6 |
| F-7 | **Ownership/duplication contracts drift.** Rival relationship ladder is copied, `ChatSpeaker` mirrors entity fields, the registry names a private production function, dead exports hide behind barrels. | DUP-10/11/16/17..23, DEAD-01..26, COV-G-01/02/06 | One owner per contract; delete verified dead surface; shrink knip tolerances to symbols | 8 |
| F-8 | **Test architecture proves owners, not the schedule.** Owner-direct tests pass while the scheduler is dead; two integration tests are excluded; ~90 source-text tests assert file contents. | TEST-01..17, TQ-01..14 | Behavioural real-`gameTick` **boundary-jump gate** on each PR, **2,500-settler** scheduled tier, fewer source-regex tests, scoped coverage thresholds | 9 |

**Rule:** do not "fix SIM-01 by moving one `if`" and leave F-1/F-2 in place. Phase 1 changes the phase contract once, with tests, and then the individual gates become consequences.

---

## 2. Execution model

- **One workstream per branch/PR.** Do not mix a calendar change, a cache change and a dead-code sweep in one diff.
- **Bug reports first.** Before changing a P0/P1 defect, follow `docs/bug_report/readme.md`: de-duplicate against `docs/BUG_REPORTS/`, file the report in `docs/bug_report/`, add it to the single index, and link it in the PR. Every PR reports exact new/updated counts.
- **Baseline before/after.** Record gate results and the `SpeedDiag`/profile numbers before touching the worker, renderer or scheduler. Existing harnesses only: `scripts/autoplay_playwright_probe.py`, `scripts/run-full-year.mts`, `scripts/colonyHealth.ts`, `scripts/perf-at-pop.ts`. No private probes.
- **No behaviour change in cleanup phases.** Dead/duplicate/doc phases must keep the fast calendar-boundary outcomes and the parity tests identical.
- **Decision gates.** F-1..F-8 each needs a written decision (in this plan or an owning doc) before implementation. If a decision changes game balance, record the measured before/after.
- **Concurrent agents:** one owner per file area; re-read immediately before editing; no drive-by refactors.

**Verification ladder per PR:** targeted tests → `npm run test:types` → `npm run lint` → `npm run build` → `npm test` at milestones → `npm run audit` after export/ownership changes → browser probe after rendering/UI changes.

---


**A2 test-duration decision (7 November 2026):** The required PR scheduler job must not replay 720 continuous calendar days. It uses a seeded state positioned immediately before chosen boundaries, then executes genuine `gameTick` calls and assertions through 00:00, 06:00 and 18:00. This protects the integration seam; it does not prove full 720-day survival. The existing 120-day producer workflow and separately scheduled long-scale tests retain that distinct purpose. The required focused gate also enforces measured V8 coverage floors for the calendar owner modules.

## 3. Phases

### Phase 0 — Baseline, decisions, failing tests (no behaviour change)

**Goal:** make the audit executable, not just readable.

- Record the baseline: current gate results, `SpeedDiag` at 1×/10× on the owner's 2,027 save, 47-settler producer colony, targeted calendar-boundary harness and existing 120-day producer run, browser probe.
- Create `docs/private/audits/2026-11-07/LIVE-FINDINGS-STATUS.md`: every ID with `open / in-progress / fixed / deferred / not-a-bug`, owner, phase, PR link.
- File bug reports for the P0/P1 set first: SIM-01, SIM-02, TEST-16, CB-01, UX-01, UX-03, UX-04, PERF-01, PERF-03, COV-A-01, GFX-11.
- Add **failing regressions** (allowed before the fix): fast real-`gameTick` boundary election/decay/visitor tests, synthetic 72→288 save, GFX-11 cache-disposal test, audio death-count test, load-confirmation test.
- Confirm external dirty file `scripts/check-function-overlap.integration.test.mjs` is not ours; do not revert it.
- Exit: baseline recorded; reports filed; failing tests demonstrate the defects; no production behavior changed.

### Phase 1 — Time, calendar and scheduler foundation (P0)

**Issues:** SIM-01, SIM-02, SIM-03, SIM-04, TEST-16, CB-04, GAME-01, GAME-02, GAME-07, GAME-11, TEST-06, TEST-10, TEST-17, TQ-05; verify GAME-05.

**Decision (F-1/F-2):** keep `TICKS_PER_DAY = 288` (24 h × 12). Write the phase table:

| Phase | Work |
|---|---|
| 00:00 | schedule fatigue, grass/weather, calendar + year rollover, term election, skill decay, visitor-group day, daily mortality/aging |
| 06:00 | relationships, youth love, courtships, apprenticeships, leader-house residency |
| 12:00 | no daily world event (kept empty) |
| 18:00 | production/building economy, world events, population/challenges, election promises, chronicle |

**Implementation:**

- Move the year-rollover/term-election block out of the 18:00 `tickDailyWorldEvents` into a 00:00 owner; same for `decayIdleSkills` and `tickVisitorGroups` (or make the visitor gate day-based, like `tickVillageRequests`).
- Derive all year/day constants from `TICKS_PER_DAY × DAYS_PER_YEAR`; remove `72 * 360` hardcodes.
- Recalibrate `ELECTION_INTERVAL_YEARS` and the ceremony duration text to the 28.8-hour year; fix README/ARCHITECTURE/comments and `tests/ticksPerDay.literals.test.ts` header.
- Update `OWNERSHIP_OVERVIEW.md` and `decisionRegistry.ts` cadence/caller/test cells for every moved function.
- Exit: required boundary-jump `gameTick` tests assert Year-2 election, idle-skill decay, visitor gift+departure; `gameTick.layerOrder` still passes; docs no longer say 72/52h; no function called from two phases.

**Risk:** moving work between phases changes economy timing. Compare 7/30/360-day food/skill/population before/after and keep the 360-day invariants.

### Phase 2 — Save, schema and data integrity

**Issues:** SIM-15, GAME-09, SIM-08, SIM-10, COV-G-03, COV-G-04, COV-G-05, COV-I-03; verify GAME-05.

- Build one **typed tick-field table** (Q-03), not a `Record<string, unknown>` cast: every persisted tick-valued field, its ×4 scaling, its owner and its test. Include Moon Howler cooldowns, `lastAutoJobTransferTick`, spotlight ticks, dialogue ticks, grave ticks, `pastPartnerTicks`, festival repair timebase and command ids.
- Decide **DNA-01**: `normalizeGenome` must not silently spread a valid flat genome; either accept it as written (doc contract) or reject/backfill it, and add the flat-genome test.
- Make the migration versioned and idempotent; refuse unknown versions by name; keep the terrain-seed witness fallback.
- Fix Gazette week-0 label, birth `birthKey` determinism, rival growth index; add command monotonic ids/echo for replay faults.
- Add synthetic 0.6.5.0 payload tests (one per field group), not just a happy-path load.
- Exit: old save loads with correct calendar, festival and cooldowns; birth is reproducible from `birthKey`; command replay is detectable; GAME-09 live old-save run recorded.

### Phase 3 — Entity taxonomy, needs, death and balance

**Issues:** SIM-05, SIM-16, SIM-19, SIM-20, SIM-21, SIM-22, GAME-13, GAME-14, GAME-15, GAME-16, COV-G-08.

**Decisions (F-4):** humans = three needs; animals = one energy stomach; captives = needs; visitors may stay simple. Do not add needs to wildlife.

- Give captives `needs`; make the 08:00 ration a real feed-or-starve decision through `spendFood`/`creditHumanNutritionFromFood`; decide the hostile-weather gate.
- Implement SIM-19 (winter rest/stamina/nutrition pressure) or remove the wood cost and correct the schema comment; do not leave both.
- Rescale pollution (SIM-22) so it is not binary at 300; define the intended population coefficient.
- Decide SIM-21/GAME-16: break latch ends shift, soften the drain budget, or add an exhaustion price; add a 2,500-settler food/stamina checkpoint in Phase 6.
- Retune GAME-15 romance gates to stamina bands if fatigue is meant to matter.
- Centralize death classification on the death path's own predicate (SIM-05); fix `longestLivingHuman` mid-year deaths (SIM-16).
- Move wall-clock `startedAtMs`/`createdAt` out of sim-owned records (Q-05); use `state.tick` for anything persisted or replayed.
- Decide **DNA-02**: player-only genome/marks (recommended) or all humans; gate `createEntity`/backfill/chips accordingly and update the architecture doc. Validate mark provenance in `grantMark`/`normalizeMarks` (DNA-03: `lucky` born and `pretty` raid are currently accepted).
- Exit: needs calibration 7/30/360-day still passes; captive upkeep has a consequence; winter and pollution have one defined behaviour; death accounting reconciles.

### Phase 4 — Lifecycle, data-loss and modal safety

**Issues:** CB-01, CB-02, CB-13, UX-01, UX-02, UX-03, UX-04, UX-13, UX-14; COV-B-02.

- Guard the RAF re-schedule with `if (this.running)`; test stop/start has one chain; release the old world.
- Add one top-level React error boundary with export-current-save.
- Require an armed confirmation for load; do not overwrite the quick-save from a file load without confirmation or a separate slot; disable the button while in flight.
- Route BattleReportScreen and both WarfareStatus dialogs through `useOverlayKeyboard` + `useModalFocus`; add permanence copy to execution; add bulk-demolition confirmation.
- Remove the unused Tauri shell plugin/permission after verifying the graph.
- Exit: no data-loss path on load; Escape/focus restore tested; hotkeys do not fire behind modals; no RAF after stop; Tauri capability is minimal.

### Phase 5 — Cache and render-invalidation foundation (GFX-11 first)

**Issues:** GFX-01, GFX-02, GFX-03, GFX-11, SIM-18, COV-I-02, plus the entity-layer tick-key FPS item.

- **GFX-11 (the road/build dark flash):** replace the global `terrainRevision` with a per-region/per-chunk dirty token; keep the old chunk drawn until its replacement preview is baked; invalidate only the tiles the footprint changed. Add a test that a local forest clear disposes zero unrelated chunks.
- Remove `state.tick` from the static entity-layer key; use a **static-world revision** (building geometry, tree/grass generation, selection/juice flags). Movers already draw live.
- Replace the hand-enumerated snapshot string with a typed key/object or explicit invalidation on F4/juice toggles (GFX-02/03).
- Add `terrainSeed`/`generationVersion`/size to the legacy terrain chunk key (COV-I-02); add terrain overrides to the path-grid key (SIM-18).
- Fix the tree-under-building depth case (GFX-01) with merged static occluders; capture a screenshot matrix.
- Exit: building/road placement never flashes the map; F4 and juice update while paused; no stale terrain after a same-session load; the static layer no longer repaints on every tick.

### Phase 6 — Performance and scale

**Issues:** PERF-01..18, RED-01..07, COV-A-01, COV-A-02, COV-I-04, GAME-08, SIM-21 (scale tier), the worker/FPS findings in `worker-fps.md`.

**Do not reopen closed work:** PERF1/2/3/6/7/8 from `worker-sync-and-performance-2026-11-02.md` are implemented/measured. Start from its after-numbers and the remaining items.

- **Worker:** replace the every-tick full rollback clone with an inverse-operation journal or periodic snapshot/replay; ship incremental entity deltas (revisions already exist) and mutate-merge; keep one tick in flight until a measured 2-tick trial proves command ordering and memory safe; fix the `MAX_PIPELINE_DEPTH` constant/docs.
- **Main thread:** replace audio O(n²) death scan with the id map; gate population counts on the daily tick; let UI read shipped counters; pass a building-id Map to the render sleeper cull; tick-key the status context; reuse position scratch; cache `terrainRiseAt` per mover.
- **React:** gate dashboard/village-stat recompute below sim cadence; avoid duplicate nested setState.
- **Scale:** add the 2,500-settler tier to `run-full-year`/`colonyHealth` with 18:00 stamina distribution and food balance; record tick p50/p95/p99, delta bytes, GC, frameMax and `achieved/target` before/after.
- Exit: 2,500-tier survives its defined horizon; 10× `achieved/target` improves; no parity/determinism regression; frameMax drops at equal population; a written before/after table.

**Risk:** journal/replay changes the rollback contract. Keep the existing parity, seed, pool-stress and fallback tests green; do not raise pipeline depth without the published memory/ordering proof.

### Phase 7 — UX, gameplay and visual polish

**Issues:** UX-05..12, UX-15, UX-16, GFX-04..10, GAME-03, GAME-04, GAME-06, GAME-12, GAME-17, GAME-18, COV-A-03, COV-I-05/06/08/09; CB-03, CB-08..11 where docs/tooling.

- `aria-modal`/backdrop/trap consistency, labels, contrasts, font/contrast sweep; self-host fonts to close CB-03.
- **UX-15/UX-16:** replace `FamilyTreeWindow`'s inline kinship walk with `familyTree.ts`'s `buildFullFamilyTree`/`buildFamilyTree` (extend for genealogy history and `pastPartnerTicks`); render the owner's generation `rows` horizontally with `flex-wrap`, align connectors to card centres, use an upward layout/connector for ancestors, and render each spouse once. Surface relation words, adoptive labels and gaps; this also gives the 1,106-line owner a production caller.
- Missing `sand_water_overlay.png`, orphan sprite cleanup, Dirt_03, gradient hoisting, nameplate veil, minimap cache.
- Graveyard tooltip, disabled-disaster copy, workshop gold sink, road/wall elbow art (or remove the unreachable branch), festival window text.
- **GAME-17/GAME-18:** gate `WORK_COMMUTE_RUSH` on actual lateness/urgency (or lower/document it) and reconcile `entity.speed` with human movement so child/adult speed is intentional, not an inert write.
- Exit: keyboard/screen-reader pass on the dialogs; screenshot matrix at 100/125/150% DPR; no unreachable art path left undocumented.

### Phase 8 — Duplication, dead code, ownership and docs

**Issues:** DUP-01..23, DEAD-01..26, COV-G-01/02/06/07, CB-05, CB-11, CB-12; 13 stale `OWNERSHIP_OVERVIEW.md` rows.

- Fix DUP-10 (rival ladder owner), DUP-11 (`ChatSpeaker`), DUP-16 (production owner cell), DUP-15 cooldown constants; then batch the import-and-delete duplicates.
- **Code-quality debt (Q-01..Q-16):** split the worst monoliths by owner (`App`, `tickHumans`, `SelectedBuildingPanel`); write the clone-vs-in-place mutation rule (Q-02); replace silent catches with a `reportFailure(scope, error, { optional })` policy (Q-04); route console diagnostics through one flag/logger (Q-06); shorten narrative comments and fix stale 72/day text (Q-07); move `@tauri-apps/cli` to devDependencies and remove the unused shell plugin (Q-16).
- Delete the 101 verified dead exports, 32 export-only symbols, 13 aliases, 16 dead re-export lines, dead config (`MEAL_*`, `Human.energyLossPerTick`), dead scripts, orphan assets and the `tmp-gate` test.
- Shrink `knip.ts` file-level tolerances to per-symbol `@public`; refresh ownership rows; update README/ARCHITECTURE/CHANGELOG.
- **Ownership coverage:** every function is owned (3,353/3,353), but only 1,285 (38.3%) are individually named; 2,068 are module-only and 55 files have no explicit entry. Prioritize the 880 exported/module-only functions and the zero-explicit clusters (`housingPipeline`, `saveLoad`, `virtualPlayer`, `frontierCombat`, `humanRelationships`, `gameLoop`), not a mechanical 2,068-row fill. See `ownership-coverage.md`.
- Exit: strict knip reports 0 unused exports/files (or a documented allow-list); `npm run audit` green; calendar-boundary outcome unchanged; no behaviour diff.

**Sequencing:** do this after Phases 1–6 so deleted symbols are not still needed by behaviour changes.

### Phase 9 — Tests, CI and gates

**Issues:** TEST-01..17, TQ-01..14, COV-D-01, CB-06, CB-07, CB-08; the must-add tests in §4.

- Add the **fast Year-2 scheduler boundary-jump tests** to the always-required PR/main job (no continuous 720-day run); add the **2,500-settler tier** to the scheduled/nightly performance gate with a fixed time budget (not every PR).
- Add synthetic migration, audio death, load-confirmation/modal, GFX-11 cache, path-cache override, birth-key and Gazette tests.
- Replace owner-direct scheduler tests with boundary tests; shrink ~90 source-regex files to architecture guards; strengthen the `workSkill` floor; delete/relocate `tmp-gate`; make `src/test/setup.ts` real.
- Fix the browser request gate (wait for network idle or classify post-verdict cancellations) and decide the 44/97 aborted requests.
- Add coverage thresholds and a required invariant job; rename/alias `test:unit` correctly.
- Exit: a deliberately broken scheduler fails the required CI gate; real Year-2 `gameTick` boundary tests run on **every PR** (no affected-only filter); the 2,500-tier is a scheduled release gate; no test with zero assertions; source-regex count materially reduced.

### Phase 10 — Release and documentation

- Update README/ARCHITECTURE/OWNERSHIP/decision registry/CHANGELOG/roadmap; mark GAME-09 register resolved; record deferred IDs with reasons.
- Run the full gate, the required fast calendar-boundary checks and the separately scheduled 2,500-settler harness, the browser probe at 100/125/150%, and a clean build.
- Bump V.0.6.5.2; attach the audit status table and before/after performance table.
- Exit: release checklist complete; no open critical/high; no unstatused audit ID.

---

## 4. Must-add tests (gate blockers)

1. **Fast real-`gameTick` calendar-boundary CI:** jump to a tick before Year 2, run real ticks immediately before/at midnight, 06:00 and 18:00; assert one term election, once-daily idle skill decay and visitor gifts/departure using short day jumps. This would have caught SIM-01/02/TEST-16 without executing 720 continuous days. Long-running survival tests remain optional scheduled diagnostics, not required PR checks.
2. **Synthetic 72→288 save migration:** every field group, plus festival/terrain seed; assert the loaded calendar and cooldowns.
3. **2,500-settler tier:** food balance, 18:00 stamina distribution, pollution, no starvation spiral; record p50/p95/p99.
4. **Audio death:** one player death sound, none for visitor/rival; O(n) not O(n²) with a 2,000-entity fixture.
5. **UI safety:** load confirmation, Escape/focus restore, hotkeys behind a modal, execution permanence.
6. **GFX-11:** a local forest clear invalidates zero unrelated ground chunks; no dark frame.
7. **F4/juice while paused:** snapshot updates immediately.
8. **Path cache terrain override:** a tile patch without a building change invalidates the grid.
9. **Birth key / Gazette week / rival index:** small deterministic tests.

---

## 5. All-ID coverage matrix

Every audit ID is assigned a primary phase. Phase 0 creates the per-ID tracker; a range means the whole range is in that phase except IDs called out elsewhere.

| Report | IDs | Primary phase | Exceptions / notes |
|---|---|---|---|
| Codebase | CB-01..13 | 4 | CB-03→7; CB-04→1; CB-05/06/07/08→9/8; CB-09/10/11/12→8/10; CB-13→4 |
| Simulation | SIM-01..04 | 1 |  |
| Simulation | SIM-16 | 3 | mid-year death accounting, not calendar |
| Simulation | SIM-15 | 2 |  |
| Simulation | SIM-05, SIM-19..22 | 3 | SIM-21 scale tier→6 |
| Simulation | SIM-06..14, SIM-17, SIM-18 | 5/6/8 | triage in Phase 0; SIM-18→5, SIM-17→5/6 |
| Duplication | DUP-01..23 | 8 | DUP-10/11/15/16 are contract fixes, not just deletes |
| UX/UI | UX-01..04, UX-13, UX-14 | 4 | UX-02 permanence copy→4 |
| UX/UI | UX-05..12, UX-15, UX-16 | 7 | UX-15/16 family-tree owner + layout→7 |
| Graphics | GFX-01/02/03/11 | 5 | GFX-11 first; GFX-02/03 snapshot keys |
| Graphics | GFX-04..10 | 7 | assets/gradients/minimap/nameplates |
| Performance | PERF-01..18 | 6 | do not reopen implemented PERF1/2/3/6/7/8 from the worker plan |
| Gameplay | GAME-01/02/05/07/11 | 1/10 | docs/election/festival window; GAME-05 verify |
| Gameplay | GAME-09 | 2 | source fix done; live old-save run + register |
| Gameplay | GAME-03/04/06/12/13/14/15/16/17/18 | 3/7 | 13/14/15/16 needs/balance; 17/18 commute/speed; 03/04/06/12 polish |
| Gameplay | GAME-08, GAME-10 | 6/0 | known freezes and "source fixed, runtime unverified" verify |
| Tests | TEST-01..17 | 9 | TEST-03/12/16 are gate blockers; TEST-06→1 |
| Test quality | TQ-01..14 | 9 | TQ-05 stale fixtures→1 |
| Code quality | Q-01..16 | 8 | Q-03→2; Q-05→3; Q-06/07/15/16→8; Q-01 monolith split→8 |
| DNA aptitudes | DNA-01..04 | 2/3/9 | DNA-01→2; DNA-02/03→3; DNA-04→9 |
| Coverage audio/UI | COV-A-01/02, COV-B-01/02, COV-C-01/02 | 6 | COV-B-02 save coalescing→2/6 |
| Coverage audio/UI | COV-A-03, COV-D-01 | 8/9 | dead night path; setup stub |
| Coverage gameplay | COV-G-01/02/06/07 | 8 | dead exports/identity map/aliases |
| Coverage gameplay | COV-G-03/04/05 | 2 | Gazette/birth/rival index |
| Coverage gameplay | COV-G-08 | 3 | food-producer counter |
| Coverage infra | COV-I-02 | 5 | terrain cache key |
| Coverage infra | COV-I-03 | 2 | hex parser divergence |
| Coverage infra | COV-I-04 | 6 | terrainRiseAt per mover |
| Coverage infra | COV-I-01/05/06/07/08/09 | 8/4 | duplicates/scripts/shell/CSS |
| Dead code | DEAD-01..26 | 8 | strict knip + 101 dead exports; ownership rows |
| Redundant compute | RED-01..07 | 6 |  |
| Worker/FPS follow-up | SIM-21 scale, GFX-11, entity-layer key, zoom, audio | 5/6 | `worker-fps.md` |

**Deferred-with-reason is allowed** only for low/info items that cannot be fixed in this release without a feature decision; the tracker must name the owner and the follow-up plan. No critical/high may be deferred.

---

## 6. Order and dependencies

```
Phase 0 baseline + failing tests
  └─ Phase 1 calendar/time ─┬─ Phase 2 save/data
                            ├─ Phase 3 needs/death
                            └─ Phase 4 lifecycle/UI ── Phase 5 cache/GFX-11
                                                          └─ Phase 6 performance/scale
Phase 7 UX/gameplay polish (can start after 5)
Phase 8 dead/duplicate/docs (after 6, to avoid churn)
Phase 9 test/CI hardening (continuous; final gate)
Phase 10 release
```

- **Phase 1 before 2/3:** migration scaling and needs timing depend on the phase contract.
- **Phase 5 before 6:** the per-tick static repaint and GFX-11 are renderer-cache issues; fix the invalidation model before optimizing the worker transport.
- **Phase 8 last:** deleting exports/duplicates while behaviour is still moving creates merge conflicts and false "dead" calls.
- **Phase 9 is continuous:** add the failing tests in Phase 0, promote them to required in Phase 9.

---

## 7. Risks and rollback

| Risk | Mitigation |
|---|---|
| Calendar move changes economy/pacing | 7/30/360-day before/after when measuring balance; preserve fast Year-2 boundary outcomes and the empty 12:00 phase |
| Needs/captive changes alter balance | 7/30/360-day calibration + 2,500 tier; one decision PR per subsystem |
| Cache rewrite causes stale visuals | screenshot matrix at 100/125/150%; a cache-disposal test; feature flag the old path for one release if needed |
| Worker journal changes rollback semantics | parity, seed, pool-stress, fallback tests; no pipeline-depth increase without measured proof |
| Dead-code sweep removes a public ABI | strict consumer grep; `@public` allow-list; delete only after Phase 1–6 |
| Concurrent agent edits | one owner per file area; small PRs; re-read before edit |

**Rollback:** each phase is independently revertable; no phase depends on an unreleased migration. Save migrations must be forward-only with a tested fallback path for unknown versions.

---

## 8. First ten concrete actions

1. Record baseline gates and `SpeedDiag` on the owner's save; create `LIVE-FINDINGS-STATUS.md`.
2. File the P0/P1 bug reports (SIM-01, SIM-02, TEST-16, CB-01, UX-01, UX-03/04, PERF-01/03, COV-A-01, GFX-11).
3. Add fast Year-2 boundary-jump `gameTick` regressions (election + decay + visitor).
4. Add the synthetic 72→288 migration test.
5. Add the GFX-11 cache-disposal test and a screenshot repro of the road dark flash.
6. Write the phase-table decision and move year/decay/visitor work to 00:00; make the fast boundary gate pass.
7. Fix CB-01 and UX-01 (data safety) in parallel with the calendar work.
8. Replace the global terrain revision with per-chunk dirty tokens; remove the dark flash.
9. Remove `state.tick` from the static entity-layer key; measure `frameMax` before/after.
10. Start the 2,500-settler harness and record the first food/pollution/stamina baseline; do not change balance until the number exists.

---

## 9. What this plan deliberately does not do

- It does not rewrite the historical audit, bug reports or narrative docs.
- It does not reopen PERF1/2/3/6/7/8 that the worker plan already implemented and measured.
- It does not add needs to wildlife, raise pipeline depth, or delete "dead" exports that are intentional ABI without a written `@public` decision.
- It does not claim any fix is verified until the named gate and harness actually run.
