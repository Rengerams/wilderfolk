# Wilderfolk — full-code audit and remediation plan

- **Date:** 2026-11-11
- **Build inspected:** 0.6.5.1 (`GAME_VERSION`), development target 0.6.5.2
- **Revision:** `f4564527` on `main` (working tree also carried a pre-existing `AGENTS.md` edit)
- **Scope:** the whole `src/` tree — 398 TypeScript/TSX files, ~96,400 lines — plus the test, script and CI contracts that are supposed to guard it
- **Method:** read-only. 20 independent audits (9 simulation slices, 8 whole-code areas, 3 closure batches for the remaining screens and utilities), 5 adversarial verification passes that tried to refute the high findings, and a parent review of every critical/high claim. No source, test or doc file was modified.
- **Status of this document:** findings + plan. Nothing below is fixed yet.
- **How to read:** owner/PM → §0 and §9; engineer picking up work → §3, §4, §5, §5.1; QA/CI → §4.6 and §4.7; reviewer → §10. Every finding has an ID (`S-…` simulation, `W-…` whole-code), evidence with `file:line`, impact, and a fix owner.

---

## 0. TL;DR — what needs to happen

**Four defects should block the next build:**

1. **Forge orders never progress.** A player pays iron/wood/gold and watches 0% forever. One-line cadence bug.
2. **A Wildkin becomes NaN-energy and immortal.** Its diet was changed to meat but the grazer branch still feeds it grass; the missing key makes `energy = NaN`.
3. **Leaving the colony loses everything since the last manual save.** “Save on exit” is on by default but its cleanup is ordered into a no-op and there is no `pagehide` handler; “Return to main menu”/“Start new game” stop the session without saving, and the next new game unconditionally deletes the quick-save.
4. **A malformed imported save can brick the session or hang/OOM the tab.** Transient arrays are cast without element validation (a `null` particle makes every tick throw), and save-supplied map/footprint dimensions are not clamped (a tiny crafted file can request billions of loop iterations or a multi-GB grid).

**Then, in order:** the simulation hand-off set (election fields, beauty/scent grids, faction wander), the off-screen movement throttle, the terrain-patch drop, the frozen build-placement markers, the food-ledger gap that blocks immigration, the grass regrowth clamp, the hospital ward geometry, the construction pacing for zero-crew buildings, the inverted Defense staffing preset, and the verification gaps that let all of this pass.

**Findings total (verified):** **2 blockers, 9 high, ~30 medium, ~90 low.** The initial pass listed 18 high; the independent round in §11 re-rated eight to Medium and corrected/refuted four. Sections 3–4.5 keep the audit evidence; **§11 is the authoritative ranked list**.
**Plan:** 6 phases, roughly 14–19 focused engineering days; Phase 0 is 1–2 days. Every phase has a concrete “done when” test (section 9).

```text
P0  correctness + data-loss hotfix ..... 1-2 days (forge, Wildkin, leave/save, malformed import)
P1  hand-off + determinism ............. 3-4 days (rollback set, election fields, off-screen, seeds)
P2  rendering + shell integrity ........ 2-3 days (build ghost, load state, audio teardown, SoA fields)
P3  economy/ecology/services ........... 3-4 days (ledger, grass, harvest, hospital, commute)
P4  auto-staff + world systems ......... 3-4 days (defense preset, jailed/swap, herd, shelter, caravans)
P5  contracts + gates .................. 2-3 days (invariants, registry, harness assertions, CI scripts)
```

### Start here — the first five working days

| Day | Work | Files | Proof it is done |
|---|---|---|---|
| 1 | Forge cadence (S-01) | `forge.ts`, `dailyBuildingEconomy.ts` | New test: queue an order, run **real `gameTick`** 2 days, order completes. Fails before the fix |
| 1 | Wildkin: remove the four grazer leftovers + safe energy access (S-02) | `tickLayerSystems.ts`, `grassEcology.ts`, `speciesConfig.ts`, `scentGrid.ts` | Wildlife-layer test: finite energy, it hunts, it can die; no `energyGain['grass']` access |
| 2 | Leave/save lifecycle (S-03 + W-01) | `App.tsx`, `useGamePersistence.ts`, `useGameSession.ts`, `MapSetupScreen.tsx` | `pagehide` test writes the slot; menu/new-game persists once; no `deleteSave()` before a replacement exists |
| 2–3 | Malformed-import hardening (W-02/03/04) | `viewState.ts`, `saveLoad.ts` | Fixtures: `null` particle dropped; `1e9` footprint refused; non-compact 60k map refused; no tick-loop crash |
| 3–5 | Rollback/hand-off set (B1) | `worldRuntimeCaches.ts`, `simPrep.ts`, `simDelta.ts`, `humanLeisureBehavior.ts` | 7-day same-seed world equal across main-thread, worker, save/reload and one forced rollback; election fields present |

Each day ends with `node scripts/test.mjs standard` plus the new focused test. Do not start Phase 3 before the Phase 1 parity day is green.

---

## 0.1 Fix status — Phase 0 (2026-11-11)

**11 defects fixed.** One consolidated report: [audit remediation Phase 0](../bug_report/2026-11-11-audit-remediation-phase0.md); live status: [remediation log](audit-remediation-log-2026-11-11.md).

| ID | Severity | Solution | Verification |
|---|---|---|---|
| S-01 | Blocker | Forge gates on the caller-owned `productionDayTick` with the advertised two-day interval instead of the midnight-only current-tick test | `tests/forge.cadence.test.ts` (red→green), pacing 5 |
| S-03/W-01 | Blocker | Session stop saves before `loopRef` clears; synchronous pagehide slot write; new-game delete waits for the pending save; setup confirm arms on a running colony | leave 4, persistence 10 |
| S-02 | High | Wildkin removed from grazer metabolism/ease/scent/grass; added to the predator roster, hunter index and deer/rabbit hunt; config spawn energy | apexRole 12, ecosystem 2 |
| W-02 | High | Transient save pools filtered element-wise; `disasters:[null]` loads as `[]` | saveBoundary 7 |
| W-145 | Medium | `entityFieldRules` rejects present non-finite energy/maxEnergy, allows legacy absence | saveBoundary |
| W-03 | Medium | Building width/height bounded to the map before footprint sampling | saveBoundary |
| W-04 | Medium | Non-compact `worldMap` tile dimensions validated with the existing map-size owner | saveBoundary |
| W-111 | High | One `clearColonySessionState` boundary cancels the pending strip demolition on load/new/leave | leave 4 |
| W-112/W-113 | Medium | Same boundary clears the family-tree target and battle report | leave 4 |
| W-07 | Medium | Same boundary calls the existing `stopAllAudio`; audio restarts on session/setup transitions | leave 4 |

**Fixed-pace note:** the forge is two days per step by design (`FORGE_PROGRESS_PER_TWO_DAY_TICK`); the fix restores that pace, not a new balance.

**Verification:** `npm run test:standard` **PASS** — 515 files / 3,347 passed / 2 skipped / 10 steps / 301.7 s, after both the Phase 0 and Phase 1 integrations. Owners, semantic-duplicate, import-cycle, all three TypeScript projects and lint also pass.

### 0.2 Phase 1 fixed (verified)

| ID | Solution | Verification |
|---|---|---|
| S-06 + W-136 | Out-of-focus settlers keep their commanded walk and integrate it every throttled tick (decisions still 1-in-24); `getWorkdayAttendance` makes a positive rota/presence tick the sample, so zero presence pays 0 and the old fail-open is gone | `tests/production.attendancePacing.test.ts` 14, off-screen throttle/parity batches |
| S-18 | `isPassiveBuild = House || maxOccupants === 0`; uncrewed passive pace 1.0, so crewless Wall/Barn/Mill finish on their advertised days; staffable-but-empty stays 0.22× | same production test, crewless per-class cases |
| W-09 | Defense order is Barracks, Prison, then trades | same production test, real 09:00 assignment |
| S-17 / W-70 | Custodian groups seat whole or legally split (custodian + youngest together), never unhousing a seated adult; over-capacity repair uses the legal split first | `tests/housing.custodianSplit.test.ts` 7 + 197 housing |
| W-64 + W-123–W-125 | `tickPendingStoryEvents` dispatches each expired card to its story owner; explicit fates for deer/theatre/wedding/rumour/winter/children/wolf/ranger; lapsed ranger gives the traveller howler variant, not the false returning-ranger beat | `tests/story.expiryResolvers.test.ts` 10 + story/campaign 82 |
| W-05 | Terrain patches coalesce per tile in a Map; nothing is evicted | `tests/terrain.patchQueue.test.ts` (400-patch clear) |
| W-118–W-122 | `getBuildingCenter`/`isAtHall`/`isLegalCampSite`; canonical anchor, town-hall reach, faction/venue centres, validated visitor camps | `tests/geometry.footprintCentre.test.ts` 4 + 153 affected |
| Pregnancy duplication | Dedicated `src/game/pregnancy.ts` owns start, due roll, invalid-due rule, validity and fraction; `entityFactory` and `humanRelationships` delegate; A22 scans all of `src/game` | `tests/humanLifecycle.test.ts`, `dupA` 16, cycle gate |

**Still open:** S-10 hospital corner geometry; faction camp/hotel/march off-screen paths (player-human walk is fixed); S-08/S-09, W-104, W-107/W-108 and the rest of §11.1. Accepted trade-offs: pagehide can write the worker display shadow (flagged non-authoritative, no slot marker), and the transient walk target is lost across a reload for at most one throttle interval.

## 1. How the audit was done, and what “full code” means

Every source file is owned by exactly one audit slice. The columns below are the actual coverage; “parent” means I read the file directly during consolidation.

| Area | Files | Auditor | Result |
|---|---|---|---|
| Tick orchestration, calendar, layers, loop | 12 | simulation audit + verifier | covered |
| Human needs/physiology/movement/lifecycle/schedule | 25 | simulation audit + verifier | covered |
| Economy, housing, workforce, production | 22 | simulation audit + verifier | covered |
| Animals, ecology, raids, rivals, events, moon | 20 | simulation audit + verifier | covered |
| Save/load, worker, delta, rollback | 18 | simulation audit + verifier | covered |
| Invariants, decision registry, simulation tests | 10 | simulation audit + verifier | covered |
| `virtualPlayer.ts` + autoplay harness | 6 | dedicated audit | covered |
| Auto workplace assignment | 5 | dedicated audit | covered |
| App shell, 12 hooks, shell/menu components | 30 | whole-code audit | covered |
| Building/citizen/frontier/leadership panels | 35 | whole-code audit | covered |
| Renderer, canvas, SoA, snapshots, sprites | 42 | whole-code audit | covered |
| Terrain, worldgen, placement, spatial grids | 31 | whole-code audit | covered |
| Leadership, elections, family, dialogue, story, stats | 37 | whole-code audit + closure batch | covered |
| Buildings, justice, trade, frontier, services | 41 | whole-code audit | covered |
| Game-root screens (Intro, MapSetup, EventLog, Population, Statistics, Leadership, CombatPreview, Focus) | 8 | closure batch | covered |
| Spotlight overlay/choreography, map keyboard cursor, portrait, small utilities | 12 | parent | covered |
| Audio (22) + scripts/CI/tests/config | 35 + scripts | whole-code audit | covered |
| Robustness, untrusted input, lifecycle, perf | whole repo | cross-cutting audit | covered |
| Misc core (`gameEngine`, constants, queries, effects, profiler, ids, ownership) | 17 | parent | covered |

**Gates actually executed (not repeated from CI logs):**

| Command | Result |
|---|---|
| `node scripts/test.mjs standard` | **PASS** — 507 files, 3,289 tests passed, 2 skipped, 441 s; tsc (app/scripts/vitest), oxlint, strict cycles, duplication, ownership and call-graph all green |
| `node scripts/test.mjs colony-integration` | **PASS** — real 90-day bot-driven colony, seed 12345, 405 s |
| `node scripts/test.mjs calendar-scheduler` | **PASS** — 2 files / 17 tests, real `gameTick` day/year boundaries, 29 s |
| CI contract review | `node.js.yml` runs the standard gate + build on PR/main; `calendar-scheduler.yml` runs the boundary/registry gate plus a Year-2 invariant run; `120days.yml` runs a 120-day producer colony |

**What the gates do *not* prove:** several findings below are invisible to them because the tests call an owner at the wrong time of day, assert configuration instead of behaviour, or hardcode “no invariant errors”. Section 6 lists those gaps explicitly.

**Status legend:** `NEW` = not previously reported; `KNOWN-OPEN` = documented before and still open; `FIXED-BEFORE` = regression of a previously fixed defect.

---

## 2. Release blockers (P0)

### S-01 — Village forge orders can never progress — **CRITICAL — NEW**

- **Where:** [forge.ts:334](../../src/game/forge.ts) `isProductionTick(state.tick, FORGE_PACE_INTERVAL_TICKS)`; the only caller is the 18:00 production phase ([tickLayerDaily.ts:107](../../src/game/tickLayerDaily.ts) → [dailyBuildingEconomy.ts:961](../../src/game/dailyBuildingEconomy.ts)).
- **Why it is wrong:** `isProductionTick` requires `tickOfDay === 0` ([dayCycleClock.ts:111](../../src/game/dayCycleClock.ts)). The 18:00 tick has `tickOfDay = 216`, so the guard is never true. Every other producer in the same function uses the midnight-anchored `productionDayTick` ([dailyBuildingEconomy.ts:349](../../src/game/dailyBuildingEconomy.ts)); forge is the sole exception.
- **Impact:** `queueForgeOrder` consumes the inputs and sets progress 0; no iron spear/shield/sword/halberd/wall-plate/ballista is ever completed. The armament ladder is dead content.
- **Why tests miss it:** `tests/mapScale.pacing.test.ts` calls `tickVillageForge` directly at a midnight tick, so the gate passes in isolation.
- **Fix:** pass `productionDayTick` to `tickVillageForge` (or move the progress step to the midnight daily phase). Add a regression that queues an order and runs **real `gameTick`** for two in-game days.
- **Verification:** static proof only (read-only audit). No runtime test was added.

### S-02 — A Wildkin becomes NaN-energy, immortal and inert — **HIGH — NEW**

- **Where (four leftovers, one bug):**
  1. **Diet vs. grazing:** the grazing branch includes `EntityType.Wildkin` ([tickLayerSystems.ts:574-581](../../src/game/tickLayerSystems.ts)) and the bite adds `config.energyGain['grass']` ([tickLayerSystems.ts:610](../../src/game/tickLayerSystems.ts)), but Wildkin's diet has only `deer`/`rabbit` ([speciesConfig.ts:189-209](../../src/game/speciesConfig.ts)).
  2. **Metabolism:** `grazerEase = 0.82` still gives Wildkin the grazer energy discount ([tickLayerSystems.ts:282-288](../../src/game/tickLayerSystems.ts)).
  3. **Evasion:** `isGrazer` includes Wildkin ([tickLayerSystems.ts:314-317](../../src/game/tickLayerSystems.ts)), so it runs the grazer scent-flee path with `WILDKIN_SCENT_SENSITIVITY = 0.55` ([scentGrid.ts:34](../../src/game/scentGrid.ts)) even though `speciesConfig.fleeRange = 0` and it is meant to be an apex predator.
  4. **Stale grazer table:** `GRAZER_METABOLISM.wildkin = { …, grassEnergyGain: 45 }` still exists and `GrazerType` includes it ([grassEcology.ts:80-87](../../src/game/grassEcology.ts)). It is **not used in production** — `getGrazingPressureReport` only asks for deer and rabbit ([ecosystemPressure.ts:66-68](../../src/game/ecosystemPressure.ts)) — but two tests still call it as a “would-be” comparison (`ecosystemPressure.winterDemand.test.ts:40`, `wildkin.apexRole.test.ts:109`), which keeps the stale entry alive.
- **Why it is wrong:** the missing key is `undefined`; `Math.min(maxEnergy, energy + undefined)` is `NaN`. No clamp or guard catches it. Death (`energy <= 0`), reproduction (`energy > threshold`) and hunger (`energy < 0.78 * max`) are all false for `NaN`.
- **Impact:** the creature wanders until its 40-year max age, never breeds, never starves, and cannot be hunted (it is in no prey list). It serialises as `null`; after reload the arithmetic coerces and it dies. It spawns on 3 % of births near deer.
- **Context:** the meat-diet change is intentional and documented (`docs/bug_report/2026-10-09-wildkin-apex-role-and-chronicle.md`), and that report explicitly deferred hunting AI. What is new is that the leftover grazer branches turn the intended starvation into `NaN` and leave contradictory behaviour.
- **Fix:** remove Wildkin from all four grazer paths (bite, `grazerEase`, `isGrazer`, `GRAZER_METABOLISM`), delete the `wildkin` grazer entry and update the two tests to compare against zero, add Wildkin to `HUNT_PREY_TYPES`/`huntPreyKind` and the predator list (the deferred follow-up), and use the safe accessor (`getPreyEnergyGain`, `?? 0`) so a missing diet key can never poison state.
- **Test to replace:** `tests/wildkin.apexRole.test.ts:80` asserts `energyGain.grass` is absent but never runs the wildlife layer; add a behaviour test at the wildlife tick.

### S-03 — “Save on exit” never writes a save — **BLOCKER (same root as W-01)**

- **Where:** the only implementation is the unmount cleanup in [useGamePersistence.ts:244](../../src/hooks/useGamePersistence.ts), which reads `loopRef.current`; the earlier-registered cleanup in [useGameSession.ts:88](../../src/hooks/useGameSession.ts) has already set it to `null`. React 19 runs same-component cleanups in definition order (verified in the bundled React source). There is no `pagehide`/`beforeunload` listener anywhere.
- **Impact:** the toggle is on by default ([preferences.ts](../../src/game/preferences.ts)) and the menu promises “Keeps the browser quick-save slot fresh when you leave the colony” ([GameMenu.tsx:450](../../src/components/GameMenu.tsx)). Closing the tab loses everything since the last manual save. There is no periodic autosave either.
- **Same root, different trigger:** leaving via “Return to main menu”/“Start new game” never unmounts `App`, so even a fixed unmount cleanup would not fire; the next new game then calls `deleteSave()` unconditionally (`App.tsx:1101`). Fix both at the session boundary — see W-01 in section 4.5.
- **Fix:** save on `pagehide` (the localStorage write is synchronous), and remove the ordering dependency by letting `GameLoop.stop()`/session teardown own the final save. Add a test that fires `pagehide` with a live loop and asserts the slot write.
- **Note:** this supersedes the older autosave interval; the changelog’s “auto-save” fix refers to that removed timer.

---

## 3. High-priority defects (P1)

> **Severity note:** the labels in this section are the **initial audit ratings**. Section 11 re-rates every item after independent verification: 8 of these are confirmed High, several (W-06/W-07/W-08/W-30) are Medium, and W-43/W-44/W-45/W-46 are downgraded or refuted. Use §11 as the authoritative size list; this section keeps the evidence.

| ID | Sev | Defect | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| S-04 | Med-High | Election/leader state missing from delta + rollback | [simDelta.ts:148](../../src/game/simBuffers/simDelta.ts) ships `electionCeremony` only; `lastElectionResult`, `nextElectionId`, `pendingLeaderHouseResidentIds` are absent from delta and `SimPrepKeys` but written in-tick ([villageLeadership.ts:773](../../src/game/villageLeadership.ts), `:1004`, `:1138`) | Worker mode: the leadership panel freezes at the loaded “last vote” forever. A rollback can **skip** an election id (it cannot repeat ballots — the ceremony carries its salt) and leaves `lastElectionResult` stale for the next record. Normal saves are exported from the worker, so files stay correct; crash recovery is the exception (it uses the replica and is labelled best-effort) | Add the three fields to `SimTickDelta` + `SimPrepKeys`; extend `workerBoundary.closure` to run an election; have crash recovery export the worker world when it is alive |
| S-05 | Med | `beautyGrid` is a sim input, destroyed at worker import/rollback | [worldRuntimeCaches.ts:19](../../src/game/worldRuntimeCaches.ts), `:32-40`, `:62-70` preserve only `scentGrid`; [humanLeisureBehavior.ts:484](../../src/game/humanLeisureBehavior.ts) draws `getSimRng('humanTick')()` only when the grid exists. The load path itself rebuilds it (`saveLoad.ts:1686`); the worker import (`gameWorker.ts:198`), rollback (`simPrep.ts:437`) and per-tick replica hydrate drop it | Worker/fallback runs lose decor attraction until the next 18:00 `tickBeauty` (≤288 ticks), and the skipped draw is a permanent `humanTick` stream offset; main-thread runs diverge | Rebuild the grid at hand-off (like scent) or ship it; make the draw unconditional |
| S-06 | Med-High | Off-screen humans move 24× slower | [humanTick.ts:755-766](../../src/game/humanTick.ts) skips the movement block on 23 of 24 ticks; `applyHumanWalkStep` at `:1696` has no elapsed-time scaling; needs still advance correctly | Zooming in freezes distant travel: school attendance, hunting arrivals, caravans, marching raids and patrols can stall. The throttle is intentional; the unscaled step is not | Scale the step by elapsed ticks for out-of-focus entities, or exempt arrival-gated/faction entities. Add a focus-on/off parity day |
| S-07 | Med | Bountiful Harvest is erased in odd years | [dailyWorldEvents.ts:224](../../src/game/dailyWorldEvents.ts) sets the flag, `:251-254` clears it in the **same** call — and that call runs at the end of **every** odd-year 18:00 pass, not once at the year boundary | The notification promises doubled farm output for a year; only even years deliver it, and an even-year grant survives one extra day into the next odd year | Clear the previous year’s flag before the roll, or key it to the granted year |
| S-08 | Med | Trade/gift/raid food never reaches the daily ledger | `applyImports` adds food directly ([tradeCaravans.ts:115-131](../../src/game/tradeCaravans.ts)); same for visitor gifts, Forest Bounty, raid spoils, tribute. `addResource` records lifetime stats only | `isMeasuredFoodDeficit` sees 0 produced vs meals consumed, so `canSupportImmigration` refuses before the stored-food runway check ([dailyPopulation.ts:38-49](../../src/game/dailyPopulation.ts)); a trade-fed colony stops growing with a full larder, and the dashboard “net today” is wrong | Record every stored food gain through `recordFoodProduced` with a source, or base the gate on real stock movement |
| S-09 | Med | Daily grass regrowth is ~7× the grass cap | `2.5 × mult × 288` = 720 clamped to `maxEnergy = 100` ([dailyGrassEcology.ts:27](../../src/game/dailyGrassEcology.ts), [grassEcology.ts:8](../../src/game/grassEcology.ts), [speciesConfig.ts:53](../../src/game/speciesConfig.ts)) | Winter 0.35 and drought 0.3 still refill every blade at midnight, so pasture never thins; `ecosystemPressure` reports recovery the sim cannot deliver (7.2×), and overgrazing warnings are unreachable | Divide growth by the day (or cap at a fraction of `maxEnergy`) and recompute the pressure estimate from the same rule |
| S-10 | Med | Hospital ward geometry uses the footprint corner | [hospitalCare.ts:238-241](../../src/game/hospitalCare.ts), `:274-284` compute `x + width/2`, `y + height*0.9`; the canonical `building.x/y` is the **centre** ([buildingGeometry.ts:7](../../src/game/buildingGeometry.ts)) | The “doctor on site” gate is shifted ~35 px south-east: a doctor at the north/west door refuses to treat; a patient ~105 px away on the SE side is treated | Use `getBuildingCenter` + `isAtBuildingReach` (as `humanHospitalBehavior` already does) |
| S-11 | Med | Invariants cannot fail anything | [gameTick.ts:387-399](../../src/game/gameTick.ts) runs only in DEV and only `console.warn`s; `assertSimulationInvariants` has no production/harness caller; the 90-day gate passes `[]` ([longRunColony.integration.test.ts:65/76](../../tests/longRunColony.integration.test.ts)); `assessColonyStall` never reads the field | “Invariants clean” is true by construction for duplicates, caches, wildlife counts and orphan bonds; the occupancy/leader invariants that caught earlier bugs are advisory | Fail in dev/tests, collect per tick in the year/colony harnesses, feed real errors to `colonyHealth` |
| S-12 | Low | Worker realm keeps stale faction-wander state | [factionWander.ts:23](../../src/game/factionWander.ts) module map; `clearAllFactionWanderStates` is called by main-thread load/stop but not by [gameWorker.ts:194](../../src/game/simWorker/gameWorker.ts) `resetWorkerSession` | Loading while a worker session runs can freeze visitors/rivals on a reused id until they wander again, or send them to old-map coordinates; entries are pruned daily, so it is transient, not corrupting | Clear the state in `resetWorkerSession` |
| S-13 | Low | `paused` is missing from the tick delta | [simDelta.ts](../../src/game/simBuffers/simDelta.ts) has no `paused`; `raidAftermath.ts:74` pauses the world on settlement destruction. The fallen-settlement UI is driven by the shipped `raidRecovery`, not by `paused` | The pause overlay and diagnostics badge can disagree with the worker, and the loop keeps posting no-op ticks; no gameplay effect | Ship `paused`/`speed` or carry presentation controls on every tick result |
| S-14 | Med | Ordinary work-commute lead is effectively dead | The lead is recomputed from the remaining distance ([humanTick.ts:968](../../src/game/humanTick.ts), `:1244-1250`), but the work-walk branch only opens on `goWorkTime || onWorkCommuteHours` (`:1237`), i.e. the last hour; the lead only clears `stayIn` (`:982`), and the walk runs at the 0.85 damped pace (`:1266`) | Long-commute workers idle/wander, then walk in the final hour and arrive late; the prison guard has a sticky path, ordinary jobs have no effective lead at all | Give every job a real commute window (start walking at `shift - commuteLead`) and drop the extra damping for commuters |
| S-15 | Med | Autumn herd size only ratchets down | [migration.ts:159-162](../../src/game/migration.ts): `nextHerdSize = max(4, base - lost)` and nothing restores it. `lost` counts wolves, old age and hunting alike | After 2–3 autumns the “herds arrive” event is a permanent 4-deer trickle; the README promise “let them pass and they come back fat as ever” is false after any prior loss | Add a recovery path (e.g. `+1` per unharmed year, capped at base) or reword the promise; count only player-hunted losses if that is the intent |
| S-16 | Med | Indoor shelter does not protect from the Moon Howler | The prey filter has no indoor test ([tickLayerSystems.ts:407-440](../../src/game/tickLayerSystems.ts)); sleeping settlers stand on the porch ([humanMovement.ts:33-39](../../src/game/simulation/humanMovement.ts), `:137-152`); the banner says “Keep settlers indoors” ([moonHowler.ts:706](../../src/game/moonHowler.ts)) | The one instruction the game gives for the full moon is not honoured; a sleeper is killed at their own doorstep | Either make `indoorBuildingId` prey-ineligible for the howler, or change the copy and the shelter model |
| S-17 | High | Auto-housing cannot seat a custodian-plus-minors group larger than any residence, even when beds are free | `familyFitsInResidence` requires the whole group to fit ([housingPipeline.ts:1574-1585](../../src/game/housingPipeline.ts)); `assignFamilyToResidence` moves the group all-or-nothing and then seats non-custodian adults alone ([housingPipeline.ts:739-785](../../src/game/housingPipeline.ts)); `unitNeedsMove` keeps the shortage stable instead of splitting | A widow with 6 children stays homeless next to an empty 6-bed House; with a father present he is seated alone (5 free beds) and the couple is split. Stable until a larger home exists; the “no homeless while beds exist” claim is false | Split the custodian group when no residence fits (bounded and logged), or make “needs a bigger home” an explicit state and never seat the other adult alone |
| S-18 | High | Every zero-occupancy building can never receive a construction crew, so it builds at **0.22×** — 4.55× its advertised days | `isPassiveBuild` covers only House/Road/Well; everything else with no workers uses 0.22 ([dailyBuildingEconomy.ts:168-226](../../src/game/dailyBuildingEconomy.ts)); `staffConstructionCrews` admits only `maxOccupants > 0` ([workforce.ts:795-798](../../src/game/workforce.ts)), so Wall/Gate/Watchtower/Barn/Silo/Storehouse/Mill/Square/Bridge/Preserve/decor can never be crewed | A Wall segment advertised as 1 day takes ~4.5; Wall Gate 2→9.1; Watchtower/Barn/Storehouse 4→18.2; Mill/Preserve 5→22.7; the placement float prints the advertised number. Defence and decor are the worst affected; staffed sites are also 26 % faster than advertised (1.35×) | Give every buildable type a builder-slot cap separate from `maxOccupants`, or move the zero-cap types into the passive set and correct `buildTime`; then one pacing test per class |

---

## 4. Medium defects and low-priority nits (P2/P3)

### 4.1 Auto-staffing (details in section 5)

- **Greedy nearest-first allocation with no swap pass** can permanently pair a vacancy with an idle settler who cannot reach it.
- **A jailed worker's post is counted as filled**, so the workplace reads N/N, produces nothing, and is never backfilled.
- **Full 2-post food buildings can never donate**, so a newly completed second Farm/Greenhouse/Hunting/Fishing Spot may stay empty.
- **Construction consumes the entire idle pool before non-food jobs** under growth/defense/comfort.
- **Taming Post exposes 2 worker slots with no job type**; no mechanism can fill them.
- **Enemy war captives are dropped from `prison.occupants`** every assignment pass; the branch that should keep them is unreachable.

### 4.2 Contracts, determinism and dead state

- **Decision registry drift:** `construction.owner` names `tickLayerDaily.tickBuildingProgress`, which does not exist (private in `dailyBuildingEconomy`, 18:00); the whole 06:00 social layer has no entry; `human.indoorBuildingId` is attributed only to leisure; `isPropertyWritePermitted` has no caller outside its test. The registry test checks key presence and file existence only.
- **Two seed authorities:** stories/elections/omen seed from `worldMap.seed`, sim streams from `getSimSeed()`. They can disagree after a seed adoption.
- **Combat rolls outside `simRng`:** `rollPredatorBlock`/`rollCounterAttack` use a bespoke LCG ([combat.ts:110-134](../../src/game/combat.ts)); save-stable, but not snapshot/rollback replayable.
- **Leisure choice is not seeded:** [humanLeisureBehavior.ts:355](../../src/game/humanLeisureBehavior.ts) computes the 12-way activity from id/day arithmetic; `setSimSeed` barely changes free time.
- **Duplicate `personDayRoll` salt 812** (live): scarce-hunt dialogue and the “go home” leisure branch are perfectly correlated. Salt 201 is latent dead code.
- **`scentGrid`** (AI input) is never persisted and is stripped at hand-off, so a reload starts prey-flee from a cold field.
- **Child-playmate cache** holds live entity references across rollback ([humanLeisureBehavior.ts:32](../../src/game/humanLeisureBehavior.ts)).
- **`huntVisuals`** reads `Date.now()` inside the tick; arrow lifetime depends on real time.
- **UI-authored floating text** (“Game Saved”) is erased by the next worker delta.
- **`PROFILE_REVISION` bypass** in `warPrisoners.ts` leaves a recruited prisoner's genome/marks stale on the replica for ≤240 ticks.
- **Seeded global `Math.random`** is installed in production and its cursor is persisted and rewound per delta (latent).
- **`Math.sin/cos`** drive patrol/gather positions, so browser vs headless coordinates can differ by an ulp.

### 4.3 Economy / services / world

- **W-136 (Med-High) Production fails open on attendance:** trade skill is paid with `presenceShare = 1` ([dailyBuildingEconomy.ts:448](../../src/game/dailyBuildingEconomy.ts)) **and output also fails open** — when no presence samples exist it falls back to `scheduleWorkedTicksToday` ([dailyBuildingEconomy.ts:379-387](../../src/game/dailyBuildingEconomy.ts)), which `recordScheduleWorkTick` credits on schedule alone before the at-post test ([humanTick.ts:748-751](../../src/game/humanTick.ts)); presence then reads 1.0, so a crew that never reaches the post produces 100 % while a crew present 5/108 ticks produces ~4.6 % (`scheduleFatigue.ts:114-127`). This **refutes the earlier “output requires attendance” premise** and masks S-06’s production loss.
- **Workshop preview** uses yesterday’s worked hours while production uses today’s presence (one-day divergence after jailing/resting).
- **`hasMill` counts rival Mills** for the player’s +25 % farm bonus ([dailyBuildingEconomy.ts:351](../../src/game/dailyBuildingEconomy.ts)).
- **Fresh colonies start at 0.03 spoilage** ([worldGen.ts:634](../../src/game/worldGen.ts)) while the daily owner writes 0.02.
- **Enemy prisoner capture is unreachable:** no rival-faction humans or `rival.entityIds` are ever created; README lists it as 0.6.5.2.
- **Hospital “N treated” floating text** can never fire (`tick % 864 === 0` reached only at 18:00).
- **Leadership invariant is skipped** exactly when `villageLeaderId` is null.

### 4.4 Small robustness items

Save accepts any `speed` (0/NaN freezes the colony); worker handshake ignores `simVersion`; main-thread fallback runs at most one tick/frame; housing-relocation counters persist across sessions; `humanPopulation` dips by one on Moon Howler nights; `tests/tmp-gate.test.ts` is committed scratch whose first test only logs; `tests/workforce.barracksAutoFill.test.ts` asserts `> 1` while leaving a barracks short.

---

## 4.5 Whole-code findings (UI, rendering, terrain, tooling, robustness)

These come from the eight whole-code audits. They are real code facts, but only the top group changes the release decision; the rest is a prioritized register.

### Critical / high

| ID | Sev | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| W-01 | **Critical** | Leaving the colony saves nothing, and the next new game deletes the quick-save | `App.tsx:2134` menu/new-game transitions only `setShowIntro(true)`; `useGameSession.ts:63-66` stops the loop; the only save is the dead unmount cleanup; `App.tsx:1101` calls `deleteSave()` unconditionally in `beginNewGameSession`. Second trigger: header → “New settlement” → “Settle the valley” discards a **running** colony; `MapSetupScreen.tsx:196` arms the confirm only when `hasSave`, so a colony without a save is discarded on one click | Return to menu / replay intro / start new game discards the whole unsaved colony; starting the next colony destroys the last good quick-save; a no-save colony has no protection at all | One `leaveColony()` that persists through `persistGame` before `stop()`, stops audio and resets shell state; pass “a colony is running” to `MapSetupScreen` instead of inferring safety from `hasSave`; delete the slot only after an explicit confirm and after the new session exists |
| W-02 | High | A malformed imported save can permanently wedge the simulation (via `disasters`; particles self-heal) | `viewState.ts:346-360` casts `deathParticles`/`floatingTexts`/`disasters` without validating elements. `deathParticles` **self-heals** — the rollback rebuilds elements with `{...particle}` (`simPrep.ts:185`), so `null` becomes `{}` and is dropped. `disasters` does not: `structuredClone` preserves `null`, `updateDisasters` dereferences before rebuilding (`worldEvents.ts:213-220`), it runs every systems tick, and the rollback restores the same array | `"disasters":[null]` loads clean, then every systems tick throws and rolls back to the same array, so the tick never advances and the colony is frozen; only a new game or an edited file recovers | Normalize/drop malformed transient elements at the save boundary, `disasters` included; regression with `disasters:[null]` |
| W-03 | Med | A save-supplied Fishing Spot footprint causes a ~10¹⁶-iteration loop | `saveLoad.ts:552-567` accepts any finite `width/height > 0`; `fishingSpotFootprintHasWater` steps 7.5 px over the footprint (`:570-584`), and `terrainHasWaterAt` returns false off-map, so there is no early exit. Reachable only for a `_compact` save **without** `_terrainSeed` plus a completed Fishing Spot | A tiny crafted/hand-edited save freezes the tab during load | Clamp geometry to map dimensions before sampling; refuse footprints larger than the map |
| W-04 | Med | A non-compact `worldMap` bypasses the map-size guard | `saveLoad.ts:486-490` returns the raw payload object; `pathfinding.ts:160-165` allocates `Uint8Array`/`Float32Array` grids from `worldMap.width/height`. A `RangeError` surfaces as a clean load refusal; the risk is memory pressure/freeze just below that point | A crafted save can request a multi-GB allocation and freeze or kill the tab before refusal | Validate `worldMap` dimensions on every path (or require `_compact` and refuse the rest) |
| W-05 | High | Terrain patch queue silently drops the **oldest** patches | `terrainGrid.ts:320-337` keeps at most 256 and `shift()`s the oldest; a long strip clear can emit 400+ patches (`MAX_STRIP_SEGMENTS=72` × up to 6 tiles) | Worker clears forest, the replica keeps canopy; the dropped tiles never bump the terrain revision, so the ground stays stale until reload and the save disagrees with what was seen | Coalesce patches by tile key in a Map (or never drop in a flush); add a long-stroke regression |
| W-06 | High | Build-placement validity markers freeze in the cached static layer | `drawGrid` is painted into `paintWorldEntityLayer` (`entityComposite.ts:63-73`) and computes cells from `state.buildGhost` (`grid.ts:198`), but `buildEntityLayerKey` (`entityLayer.ts:52-78`) has no `buildGhost` term | The green/red diamonds stay around the tile where the layer was baked while the ghost moves — fully frozen while paused, the normal way to build | Add `buildGhost` (and strip preview) to the cache key, or move the validity overlay to the per-frame pass |
| W-07 | High | Audio is never torn down; the intro theme can never play again after the first colony | Only `beginIntroAudio`/`stopIntroSong` are called (`App.tsx:321-328`); `stopAllAudio` (`audio/index.ts:73`) has zero callers; `director.ts:51-74` keeps `gameplayActive=true` | Colony music keeps playing over the intro screen, and the cinematic is silent for the rest of the session | Call the director's `stopAll()` on session leave and reset its flags; add a test that a second intro starts clean |
| W-08 | High | Loading a save leaves build mode and old per-colony shell state | `App.tsx:1159-1173` does not reset `selectedBuildingType`/`hasPlacedHouse`, unlike the new-game path at `:1119`; `selectedBuildingType` is a second source for `view.buildMode` and drives real placement | First click in the loaded colony places the previous colony's building type (possibly locked); the first-night shelter warning never fires for the new colony | Reset all per-colony shell state in the session-replacement owner |
| W-09 | High | The `defense` workforce preset ranks Barracks and Prison **last** | `workforcePolicy.ts:26-28` promises “barracks and watch first”; the order array puts them after tavern/hotel/church (`:146-152`) and `jobBuildingPriorityForPolicy` is `indexOf` | Choosing Defense raises the army only after pubs and inns; the preset inverts its headline | Reorder the array (owner) or reword the copy |
| W-10 | High | The long-sim “colony became extinct” assertion cannot fail | `scripts/run-full-year.mts:549` asserts `world.entities.length > 0`, but that array also holds trees, grass and wildlife | A run where every settler dies still exits 0 from the invariants gate | Assert living player humans (`isPlayerHuman`/`humanPopulation`), as the full-year test already does |
| W-11 | High | The advertised performance gate points at files that do not exist | `scripts/benchmark-gate.mjs:1-22` runs `run-sim.mjs` and `benchmark-city.ts`; neither exists, and no npm script or test step references the file | There is no perf gate despite the claim; wiring it would exit 1 with MODULE_NOT_FOUND | Delete it or re-point it at a real harness, fail loudly on missing files, and add it to a gate |
| W-12 | High | Two committed tests are green with the feature deleted | `tests/tmp-gate.test.ts:36-51` has no `expect` (logs only); `:53-63` uses `expect(decision?.command).not.toMatchObject(...)`, which passes when `decision` is `undefined` | The virtual-player food gating it claims to guard is untested | Delete or rewrite with `expect(decision).not.toBeNull()` first; move scratch out of `tests/` |
| W-64 | High | An expired authored story card permanently orphans its one-shot chain, so the guided campaign can never reach 5/5 | `tickPendingStoryEvents` drops a card at `expiresAtTick` without notifying its owner ([storyEvents.ts:146-150](../../src/game/storyEvents.ts)); the owners gate re-offers on `FLAG_OFFERED > 0` and resolve only from `STATUS.responded` ([rumourLedger.ts:105](../../src/game/rumourLedger.ts), `:221`; same shape in `deerParliament.ts:62`, `weddingDiplomacy.ts:89/253`, `travelingTheatre.ts:99/243`); `guidedCampaign` completes a chapter only from the `_resolved` flag | A card unread for 4–5 days (or repeatedly refused for affordability) can never be offered or resolved again; that chapter stays incomplete, `tickGuidedCampaign` never reaches 5/5, and the panel points forever at a chapter that cannot fire | Give each story an expiry resolver (the newer Invention Fair already does: `endModernInventionFair(..., 'offer expired')` sets resolved), or have `tickPendingStoryEvents` notify the owning story module before dropping the card |
| W-30 | High | The Challenges panel and the strategic map freeze while open | `memo(ChallengesPanel)` and `memo(StrategicWorldMap)` receive a world object that is reused every tick (the worker applies deltas into the same `worldRef`, `GameWorkerHost.ts:887/902`; fallback mutates in place, `gameLoop.ts:1170`), so React bails on the same reference (`ChallengesPanel.tsx:65`, `StrategicWorldMap.tsx:181`) | Challenge progress, camp/soldier counts and marching raids never update until the panel is closed/reopened; FrontierPanel itself re-renders because it gets fresh inline callbacks | Drop `memo` or pass a tick/revision prop |

### Medium register (one line each)

**Shell / persistence**
- W-13 The fallen-settlement “Export final save” writes the main-thread shadow directly, bypassing `exportAuthoritativeWorld` and the degraded check (`App.tsx:2132`; `saveLoad.ts:780`).
- W-14 Save-file import has no size cap and doubles memory before validation (`GameMenu.tsx:369`, `MapSetupScreen.tsx:431`, `saveLoad.ts:227/1378`).
- W-15 A manual save during an in-flight background save is coalesced into it: no file download and no toast (`useGamePersistence.ts:81`).
- W-16 Worker world upload assigns `worldRef` before the ack and only warns on failure (`GameWorkerHost.ts:417-453`).
- W-17 The error boundary offers only “download recovery snapshot” — no reload/retry, while `lazyWithRetry` documents one (`GameErrorBoundary.tsx:58-78`).
- W-18 Holding Space (pause) or B (build) has no `e.repeat` guard, so the sim flickers pause and the rail strobes (`useKeyboardControls.ts:129-135`, `:193-200`).
- W-19 `GameMenu` re-implements the focusable query (missing `select`/`textarea`/`[href]`) and sets `aria-modal="false"` on a pointer-blocking dialog (`GameMenu.tsx:263-293` vs `useModalFocus.ts:7-8`).
- W-20 A strip gesture released outside the canvas swallows the next map click (`useCanvasInteractions.ts:142-146`, `:580`, `:639`).

**Renderer / presentation**
- W-21 The SoA shim hardcodes `energy: 0`, so grass always renders depleted on the worker path (`entityRenderMeta.ts:179`, `grass.ts:51`).
- W-22 `applyKinematics` writes simulation fields (`size`, `huntTargetId`, `chatTicks`, `chatPhrase`) back onto display entities (`applyKinematics.ts:20-41`).
- W-23 The F4 logistics overlay scans every prop and builds a map-sized path grid per tick (`logisticsOverlayData.ts:447-454`).
- W-24 The static entity layer repaints every tick whenever one construction site exists or the hour changes (`renderSnapshot.ts:186`, `entityLayer.ts:56`).
- W-25 The legacy terrain chunk cache key omits atlas/overlay readiness, so the painted atlas can never replace a cached procedural fallback (`terrain.ts:531-539`, `terrainLayer.ts:427`).
- W-26 A renderer-named module owns a simulation write (`humanSprites.advanceHumanWalkAnim` mutates `animFrame`, called from `humanTick.ts:1700`).

**UI panels**
- W-28 The Repair button ignores the repair owner's eligibility/cost, so it is enabled on an unaffordable building (`SelectedBuildingPanel.tsx:1005`).
- W-57 The log window reads `initialFilter` once into state and never re-syncs, so a shell-driven “Log →” handover opens the old filter (`EventLogPanel.tsx:91`).
- W-58 The population search says “N matches” by summing household sizes while showing only matching members (`PopulationPanel.tsx:156`).
- W-59 The leadership panel re-implements voter eligibility instead of calling the election owner, so turnout copy can diverge from `lastElectionResult` (`VillageLeadershipPanel.tsx:32` vs `villageLeadership.ts:1009`).
- W-60 The statistics panel prints a life age in “days” although `entity.age` is years (`StatisticsPanel.tsx:62`).
- W-61 The intro particle field doubles when the aurora beat flips, because the effect re-runs and appends another 60 particles (`IntroScreen.tsx:288-322`).
- W-62 The log download exports only the active category while the footer claims it carries the full stored set (`EventLogPanel.tsx:344` vs `:133-146`).
- W-63 The intro CTA stays tab-focusable/activatable inside an `aria-hidden`, zero-height wrapper (`IntroScreen.tsx:617-633`) — an accessibility trap (focusable in aria-hidden), not a bypass: a visible “Skip intro →” already exists before the ready delay.- W-29 Recipe affordability is re-implemented locally instead of `canAffordWorkshopRecipe` (`SelectedBuildingPanel.tsx:154-160`).
- W-130 “Edit hours”/Shortcuts opened from the citizen overview render **underneath** the still-open overview (equal z-index, later portal), so the click looks dead and focus stays trapped in the overview (`WorkHoursWindow.tsx:53`, `CitizenOverviewScreen.tsx:295`, `GameWindow.tsx:67/99-101`, `App.tsx:2242-2284`).
- W-131 The POW dialog memoises its list, count and bed gate on a world object that is mutated in place, so after Keep/Release/Offer/Execute the row and buttons persist and a second action is sendable (`WarfareStatus.tsx:25-27`, `:108-127`).
- W-132 The forge “pauses when unstaffed” warning tests only the selected Blacksmith, while the forge owner treats the village as staffed if **any** completed Blacksmith has occupants (`BlacksmithForgePanel.tsx:21-23/95-96` vs `forge.ts:178-185`).
- W-133 The family-tree generation selector is mostly dead: the owner caps the walk at 2 ancestor/2 descendant generations, so the default 3 and options 3–6 cannot add a row (`FamilyTreeWindow.tsx:66/94-99/158-162` vs `familyTree.ts:622-623`).
- W-134 The active-event card is a single `<button aria-label="Dismiss event">`, so the event title/description/effect are not in its accessible name (`ActiveEventBanner.tsx:19-32`).
- W-135 The overview “Work: working/adults” ratio mixes working/idle (prisoners excluded) with adults (prisoners included), so it can never reach 100 % with a jail sentence (`CitizenOverviewScreen.tsx:230` vs `uiSimSummary.ts:69-85`).
- W-31 The staffing-refusal explanation is computed for completed workplaces but only rendered for construction (`SelectedBuildingPanel.tsx:429` vs `:978`).
- W-32 Family tree subtitle counts all members, not the filtered rows (`FamilyTreeWindow.tsx:142`).
- W-33 Graveyard capacity is a magic 50 in the panel; the “enemy” branch is unreachable (`SelectedBuildingPanel.tsx:442-449`).
- W-34 Invalid Tailwind widths (`w-[min(100%-1.5rem,24rem)]`) fall back to auto width on banners (`BigNewsBanner.tsx:52`, `ActiveEventBanner.tsx:26`).

**Buildings / frontier / services**
- W-35 An unstaffed Hotel still lodges settlers for free (`hotelStay.ts:95-99` vs `:419`, `:654`).
- W-36 A blocked trade caravan stalls forever after its exports were deducted (`tradeCaravans.ts:250-348`).
- W-37 Repair/upgrade/demolish accept rival-owned buildings while five sibling mutators reject them (`buildingMaintenanceActions.ts:38-57`, `:305`).
- W-38 Raw `BUILDING_CONFIGS[type]` lookups throw for an unknown type instead of using `getBuildingConfig` (`buildingStaffingActions.ts:108/187/276/307`).
- W-39 Caravan provisions offer outlives its configured expiry by one day (`groupEvents.ts:88/118/157`).
- W-40 Staffing refusal for a correctly assigned worker reports a refusal (check order, `buildingStaffingActions.ts:303-304`).

**Leadership / family / stats**
- W-41 Lifetime births/deaths are re-derived from the 50-year window, so they go **down** after year 50 (`stats.ts:262-265`, `gameTick.ts:101`).
- W-42 “Longest living human” can credit a rival/foreign human (`stats.ts:276-280` lacks `isPlayerHuman`).
- W-43 **Legacy saves only:** the shelter alert counts rival Houses/Mansions (`priorityAlerts.ts:50-52`), but no current spawner creates rival buildings (rival camps are strategic records since Oct 24), so fresh games are safe; only pre-Oct-24 saves that still carry a rival House can suppress the first-night card. Verifier refuted the “current play” framing.
- W-44 **Residual only:** `refreshCeremonyPendingLeader` reassigns a dead/ineligible nominee to the highest-ballot eligible finalist before the reveal, so dead ballots are not credited to the fallback. The remaining case is *all* finalists ineligible: the winner has its own (usually 0) votes while dead ballots inflate `totalVotes` → “0 of N ballots”, a minority winner (`villageLeadership.ts:846-857/997-1000`).
- W-45 **Narrow:** the family window prefers the birth parent, but adoption is written only when no birth parent is free and is cleared when one frees; both-present needs a borrowed-custody prison case or a legacy save (`familyTree.ts:358-359`).
- W-46 **Reworded:** the renderer clears the dialogue **scene** on colony re-open/stop (`renderer.ts:29` via `gameLoop.ts:197/599/948`), not on a per-tick cache sweep; live pairs can lose their scene when a colony is reopened from the menu.
- W-47 A famine bite charges the friendship hit twice (explicit + `startFeud`, `famineDesperation.ts:68/77`, `relationships.ts:497`).

**Construction / placement**
- W-88 The `unique` building rule counts rival-owned (and unfinished) structures, so a legacy rival Town Hall/Church/Square blocks the player's only copy (`buildingPlacementActions.ts:70-74`).
- W-89 Placement is decided twice — `getPlaceBuildingFailureReason` and the renderer's `canPlaceBuildingSnapshot` repeat the same sequence — and `startBuilding` hardcodes its own refusal strings instead of using `buildingPlacementLabels` (the declared wording owner), so preview and commit can drift (`buildingPlacementActions.ts:76-98/160-170`, `placementUtils.ts:276-301`).
- W-90 Construction counts `building.occupants.length` including dead ids, while repair filters `alive`; a corpse still adds 35 % build speed and earns skill attempts (`dailyBuildingEconomy.ts:215` vs `:287-292`).
- W-91 `isAtBuildingReach` can probe ~30–64 path-grid cells per call and runs per settler per tick (`buildingAccess.ts:40-125`); a per-building/grid-revision memo would remove the churn.
- W-92 Raw `BUILDING_CONFIGS[...]` lookups also bypass `getBuildingConfig` in `buildingRotation.getBuildingFootprintForType` and `buildingPlacementLabels.getPlaceBuildingFailureLabel`, widening W-38's crash surface.

**Housing**
- W-70 The over-capacity repair can evict a whole custodian group and then re-seat the other adult alone, converting an over-full home into a split family plus free beds — reachable through legacy saves (`housingPipeline.ts:653-681`, `:760-778`).
- W-71 The housing invariant audit is test-only: no production caller reads `ledger.report.violations`, and the audit skips a minor with no home and skips the manor (`housingPipeline.ts:999`, `:1017-1030`).
- W-72 Reserved beds (up to 4 prison + 20 manor) make “not overcrowded” coexist with homeless settlers; the growth report counts manor beds while immigration may not use them (`populationGrowth.ts:220-235` vs `:255/287`).
- W-73 New arrivals and same-tick newborns miss the first housing pulse (≤6 h); births usually self-seat (`tickLayerAssign.ts:56-70/133`).
- W-74 `moveResident`/`writeResidence` do not enforce capacity; every current writer checks it first, but a future writer can overfill with no guard (`housingPipeline.ts:518-564`).
- W-75 `docs/HOUSING_ARCHITECTURE.md` claims “no homeless while beds exist — DONE”, “never evicts a whole family” and “syncResidenceOccupants is the only roster writer”; all three are contradicted by the code (F1/F2 and `writeResidence`/two direct pushes). `tests/prisonerHousing.assign.test.ts` also asserts a stale premise (arrest clears the bed, which it does not).

**Genetics**
- W-77 A welcomed refugee becomes a player settler with **no genome and no born marks**; the load backfill then grants a seeded genome, so the same settler's DNA changes purely by reloading. `admitRefugees` only flips citizenship (`groupEvents.ts:832-838`), visitors are created neutral (`entityFactory.ts:93-98`), and `backfillLegacySettlerDNA` fills any non-foreign human on load (`saveLoad.ts:118-133`). Until then the settler runs at factor 1 for every activity and children inherit a neutral 50 allele. Fix by establishing DNA at the citizenship owner (the `warPrisoners.ts:139-147` pattern), not at load.
- W-78 The **affair** conception roll ignores the `conception` activity factor while the married and youth routes apply it (`humanRelationships.ts:843` vs `:776`/`:820`), so the `lucky` mark has no effect on affair fertility and the owner file applies its one modifier inconsistently.
- W-79 Per-soldier `defense` DNA leaks into barricade strength (`militiaBalance.ts:156-159` → `:210-215`), contradicting the written contract that soldier DNA must not price barricades, walls or towers.
- W-80 The personality-career inspector hardcodes `const cost = result.activity === 'conflict'` instead of exposing the registry's `cost` flag (`PersonalityCareerDetails.tsx:96` vs `activityAptitudes.ts:46`), so a future cost activity would invert the good/bad sign.

**Legacy frontier leftovers**
- W-81 Yearly world events still spawn wolves/deer/trees/grass at **raw random coordinates** with no terrain, water, footprint or margin test (`groupEvents.ts:1006-1044`, used by the yearly roll). Live every year: animals can be stranded in deep water or mountains. The canonical owner is `worldGen.spawnWildlifeAtRandomPassable`/`spawnWildlifeRing`.
- W-82 Visitor poaching goes through the **rival** module's `killWildGameForPoach` (`groupEvents.ts:342` → `rivalEvents.ts:29-36`), which only sets `alive=false` + unindexes and sweeps every entity to clear `huntTargetId`, skipping `markWildlifeDead` (no `byType` cleanup, no wildlife-death count). Ownership drift plus an O(entities) sweep per poached deer.
- W-83 `CampHit` is already `kind: 'visitor'`-only; the leftover is the **view-state contract**: `CAMP_KEY_PATTERN` still accepts a `rival:` key nothing can produce, while the marker ring resolves only `visitor:` (`groupEvents.ts:844`, `viewState.ts:62`, `markers.ts:44`).
- W-84 The visitor module reaches `getPlayerCampCenter` through the `frontierCombat` re-export instead of the canonical `villageAnchor`.
- W-85 Visitor camp placement avoids only other visitor camps, so a trader camp can overlap a strategic rival camp (`groupEvents.ts:265-268` vs `rivalSettlements.ts:44-48`).
- W-86 “Only one visitor camp at a time” is restated in three places (event flags, `tryMidYearVisitorEvent`, `tryFirstWeekVisitor`), with no single gate.
- W-87 `Building.campLabel` (a rival-camp field) survives in the delta fingerprint but is read only as a blacksmith-name fallback (`buildings.ts:160`, `forge.ts:293`).

**Social cadence (`socialLife.ts` / `humanSocial.ts`)**
- W-104 A **day-stable** `personDayRoll` is used as a **per-tick** gate in `tryWorkplaceBanter` and `tryNeighborGreeting` (`socialLife.ts:426`, `:459`). Once it passes, every non-busy tick in the 11:00–13:00 / 06:00–09:00 window requests another scene (each lasts 4 ticks), so a pair plays the whole 4-variant pool back-to-back, then all its lines are in the 3-day cooldown and the pair goes silent. Net effect is the inverse of the intended odds. A 2026-09-13 bug report already ruled this pattern a bug (“per-day rolls used as per-tick gates”); the fix is one scene per person per colony day, keeping the day odds.
- W-105 The movement inspector re-evaluates `pickSocialImpulse` with empty `nearbyAdults` and the default picker (`dashboardData.ts:948`), so it can name a venue the settler is not walking to (partner-care/comfort motives and the injected picker are invisible to it).
- W-106 The social-stagger predicate and the greeting window are duplicated across `humanTick`, `humanSocial` and `humanLeisureBehavior` (this exact pair drifted once before), and `humanTick.ts:1587` passes the literal `true` for `onDayShift`; one shared predicate/owner should expose both.

**Session residue (shell)**
- W-111 A stale strip-demolition confirmation survives session replacement: `pendingStripDemolition` is component state ([useCanvasInteractions.ts:110](../../src/hooks/useCanvasInteractions.ts)/`:559`), the dialog is rendered by App, and `applyLoadedSession`/`beginNewGameSession` never clear it. Starting an Alt-drag, loading another save, then confirming demolishes whatever buildings now use those ids — no undo.
- W-112 `familyTreeFor` (a React entity id, not ViewState) is not reset on load, so selecting a settler can open the family-tree window for whichever entity now owns that id ([App.tsx:271](../../src/App.tsx), `:2059-2080`).
- W-113 `battleReport` is not reset on load: a stale report can sit over the new colony, and `onFate` resolves the matching `pendingRaidVictories` id from the **loaded** war ([App.tsx:200](../../src/App.tsx), `:2300-2341`).
- W-114 The menu says “Download .json — your saves live outside the browser”, but the Save action also overwrites the browser slot (`GameMenu.tsx:330` vs `saveLoad.ts:780`).
- W-115 The collapsed/empty inspector puts `aria-label` on roleless `<div>`s, so assistive tech drops the region labels (`GameInspector.tsx:27/55/62`).

**Worker configuration**
- W-107 A pending command blocks every tick (`canPipelineTick` requires `pendingCommand == null`), so the tick-stall watchdog cannot fire while a command hangs; the command deadline is **30 s** versus a 15 s stall ceiling — the colony can freeze up to twice as long as the watchdog threshold before fallback. A dedicated command watchdog at ~stall duration fixes it.
- W-108 Recovery freezes simulation: `workerBooting`/`workerRecoveryInFlight`/`workerRecoveryTimer` block both the worker tick path and the fallback loop, and fallback only starts after three failed inits. With hanging inits the worst case is ~74 s of frozen game (15 + 17 + 19 + 23 s); add an overall recovery budget and/or run main-thread ticks during recovery with a generation guard.
- W-109 `MAX_PIPELINE_DEPTH` is pool-size minus one (4) but `canPipelineTick` hard-caps to `Math.min(1, …)`, so the 5-slot render pool (~192 KB/slot) is oversized and the constant misleading; `worker.plugins: () => [react()]` is unnecessary for a non-React worker bundle.
- W-110 No test pins any worker timeout, watchdog or recovery value; `tests/gameWorker.transport.test.ts` only checks proto/feature text.
- W-116 The worker realm never resets `humanChat.dialogueSessions`: the module-level map holds direct entity references and `resetWorkerSession` does not call `resetDialogueSessions` (only the main-thread `resetRendererCaches` does). After an in-game load, a stale `solo:<id>`/pair key blocks a new scripted dialogue that reuses the id (`humanChat.ts:84/245-249`).
- W-117 `exportAuthoritativeWorld` wraps the export in two sequential races with the same budget and does not clear the losing timer, so a degraded save can take ~2× the budget and leave a pending timer (`gameLoop.ts:830-846`).

**Dialogue content owner (`dialogueTrees.ts`)**
- W-101 `requestDialogue` trusts a caller-supplied `selectionRoll`; a non-finite value produces a `NaN` pool index, `selected` becomes `undefined`, and the first `selected.lines` access throws mid-tick. Current callers pass finite seeded rolls, so this is a public-boundary guard, not a live bug.
- W-102 `loadDialogueFromDisk` is effectively unreachable: the canonical bundle is installed eagerly at module load (`ensureDialogueBankFromBundle()` at the bottom), so the disk fallback can only run after a state that already makes it fail. `dialogueRecentLines` keys are pruned only when that settler speaks again, so a long-lived settler who stops talking keeps stale entries in the save (bounded by lines spoken).
- W-103 `pickRandomChatContext` maps rain/storm to the `winter` ambient context, although dedicated `social.impulse.bad_weather.rain/storm` keys exist — ambient rain can therefore draw winter/snow lines.
- Clean: the bank validates version/category/event key/roles/lines/duplicate ids and freezes content; all 19 contexts and 92 ambient keys have data; every contextual role set exists; role-swap binding is correct; duration semantics are pinned by `humanChat.duration.test.ts`; no `Math.random`, all selection through `seededRandomForRun`; history fields are persisted and travel with the entity.

**Late low-severity cleanup (confirmed in the consolidated re-read)**
- W-93 Camp selection keys are restored by regex only and never resolved against `visitorGroups` (`viewState.ts:136-139/282-283/291-336/380-381`). App resolves the key to `null`, so nothing opens and the highlight no-ops — the defect is **dead state written into every save**, not an empty panel.
- W-94 `followFavoriteEntity` has zero callers; the real camera-follow lives in `App.tsx:773-795` and is the copy that clamps — two owners for one behaviour (`viewState.ts:546-563`).
- W-95 **Refuted as a defect:** `notifications` is not in `WORLD_STATE_SAVE_KEYS`, so `notifications: []` on restore discards nothing; it is a wall-clock toast queue.
- W-96 **Unproven:** the saved `width` is the same field the world was built from for any save this build writes; only a hand-edited mismatched save differs, and the camera clamps.
- W-97 Workforce candidate ranking mixes units — travel-hours when the route is priced, squared pixels otherwise — so budget exhaustion can prefer a farther settler (`workforce.ts:611-617`).
- W-98 `staffingCapFor` reports `max(roster, counted)` while the hiring path uses the counted value, so the panel can disagree with the pass (`workforce.ts:85-98`).
- W-99 `workAbsence` returns “ill — exhausted” before the `onShift && atWork` test, so a settler visibly at their post is reported absent while production still credits the shift (`workAbsence.ts:233-235` vs `:262-265`).
- W-100 `getWorkSchedule` re-validates and allocates a fresh object on a per-settler/per-tick path (`workSchedule.ts:69-82`).

**Rollback / migration edges (found in round 2)**
- W-126 Terrain patches are drained before the delta is posted (`simDelta.ts:474`, `terrainGrid.ts:323-327`); if packing/posting throws, the worker rolls back the world but not `worldMap`, so the tile overrides are lost while the replica never receives them — permanent display/walkability divergence until reload (`simPrep` has no `worldMap` key).
- W-127 `grantMark` writes `marks` without bumping `PROFILE_REVISION` (`personalMarks.ts:85`), so a raid-survival or windfall mark does not reach the replica for up to 240 ticks; same class as the `warPrisoners` bypass.
- W-128 The rollback snapshot shares `dialogueRecentScenes`/`dialogueRecentLines` containers (`simPrep.ts:149-175` only shallow-copies entities), so a cooldown recorded in a rolled-back tick survives the rollback and suppresses a line the player never saw.
- W-129 `migrateTickTimeline` scales pregnancy/job timers but not `needs.severeHungerTicks`, `combatTicks`, `chatTicks` or `huntingSpotInReachTick` (`saveLoad.ts:648-663`), so a legacy 24-/72-tick save can delay one starvation death or keep a hunting-spot strike “recent” for hours.

**Geometry drift (footprint centre) — found in round 2**
- W-118 `villageAnchor.getPlayerCampCenter` adds half the footprint to `building.x/y`, although those are already the centre (`villageAnchor.ts:19-30` vs `buildingGeometry.ts:7-10`). The camp anchor sits ~41 px SE of a 63×53 Town Hall; camp founding, visitor camps, raid distance/loot, march target/patrol ring and the strategic map all inherit it. Existing regression tests lock the old convention (`audit2026-09-21:362-386`, `medium-N4-campAnchor:31-52`).
- W-119 Town Hall civic service repeats the corner bug: `x+width/2, y+0.9h` with 52/48 px gates (`townHall.ts:191-193/287-289`), so a settler at the hall’s true centre fails — no food aid, comfort, leader audience, stipend or reputation, and `tickTownHallAudiences` counts only petitions that pass. Fix together with S-10 via `getBuildingCenter` + `isAtBuildingReach`.
- W-120 `factionWander.buildingCenter` uses `x+w/2, y+0.85h`, so visitor “market/church/hall” destinations sit outside the footprint (`factionWander.ts:33-35`).
- W-121 `venueGatherPosition` uses `building.y + height + 18` instead of a half-height standoff, so festival/venue crowds gather ~half a building below the wall (`humanMovement.ts:111-127`, `humanLeisureBehavior.ts:646-647`).
- W-122 Visitor camp placement has no terrain/water/building validation (`groupEvents.ts:264-268`, `worldEventSites.ts:20-23`), so a camp can land in a lake or on a house; combined with W-85 it can also overlap a rival camp.

**Story-expiry orphans (extends W-64)**
- W-123 Winter Prep sets its offered flag at offer; if the 10-day card expires, re-offer is blocked and the day-270 branch logs nothing — the quest vanishes with no pass/fail (`storyEvents.ts:475-513`).
- W-124 Children Shelter sets `children_shelter_offered` at offer; expiry leaves `children_shelter_started` unset forever, so neither the 5-day quest nor its rival friend/war consequence can resolve (`storyEvents.ts:270-288`, `:73-77`).
- W-125 Howler Rumor gates on `ranger_visit`, stamped at the **offer** rather than resolution, so an expired Ranger card still produces “the ranger returns” and its reputation beat (`storyEvents.ts:438/564-575`).

- W-145 Save validation never checks `energy`/`maxEnergy`: `entityFieldRules` covers id/type/x/y/age/job/element ids only, so a `NaN` energy serialises as `null` and loads back as `null`; the next metabolism coercing it to 0 kills the animal silently instead of rejecting the file (`saveLoad.ts:1160-1169/783/1461-1495`). This is what lets S-02’s `NaN` survive a save/load round-trip undetected.
- W-146 The legacy rival-roster kill path sets only `alive = false` — no `unindexEntityFromState`, no `killHuman`, no death log, no splice (`rivalEvents.ts:119`), unlike the sibling `pruneOrphanRivalEntities`. Legacy saves only; those people vanish as unindexed dead entries.
- W-147 The Wildkin birth passes `250` energy while `SPECIES_CONFIG[Wildkin].spawnEnergy` is `200` (`humanLifecycle.ts:162` vs `speciesConfig.ts:201`) — two sources for the starting value.

**Round-2 low findings (shell / migration / economy)**
- W-137 The herd’s remembered size records the **requested** count, not the number actually placed (`migration.ts:179` vs `:96-124`), so an edge/blocked spawn can shrink next year’s herd for deer that never existed.
- W-138 Immigration spawns the newcomer at `home.x + width/2, home.y + height/2` although `x/y` is the centre (`dailyPopulation.ts:115-116`), then ring-nudges them, so the arrival/pin lands half a footprint SE.
- W-139 Free-roam hunting floats the nominal `foodGain` while the ledger records the storage-accepted amount, and calls `markWildlifeDead` without `state`/`wildlifeDeathsThisTick` (`humanHuntingBehavior.ts:126/158-177`), so the reward text can overstate and the kill misses the tick’s death tally.
- W-140 Repair/upgrade refusal text is placed at `building.x + width/2` although `x/y` is the centre (`buildingMaintenanceActions.ts:73/173`), so “Need 10w 5s” points half a footprint east.
- W-141 Game hotkeys (Space/Escape/`?`/`b`) are dead while any form control, including a checkbox, holds focus (`useKeyboardControls.ts:100-113`; `hotkeys.ts:74-82`), so pressing Escape after clicking the log checkbox does nothing.
- W-142 `staticEntityLayerRevision` is rebuilt per snapshot (every camera move/frame) although it only depends on the world (`renderSnapshot.ts:156-188/253`) — O(buildings) churn and a large string per frame.
- W-143 Boot generates a default **Huge** world (`initGame()` at `App.tsx:195`, 6144×4608 incl. the tree scatter) and `structuredClone`s it on the intro screen (`App.tsx:402-411`), although the real game defaults to Medium — unconditional startup cost and doubled peak memory.
- W-144 `workHoursOpen` and `campaignActive` (like `familyTreeFor`, W-112) are not reset on session replacement (`App.tsx:2271/1125`), so a window/campaign state can survive into another colony.

**Story / campaign / chronicle**
- W-65 `weddingDiplomacy` stores the rival by array index and falls back to `state.rivalSettlements[0]`, so exterminating that camp retargets the outcome (relationship, reputation, name) to another rival (`weddingDiplomacy.ts:68-98`).
- W-66 `recordGuidedCampaignChoice` has no caller, the persisted `choices` array is never written, and its unlock gate is therefore dead; a later chapter can show “Remembered” while an earlier one says “Locked” (`guidedCampaign.ts:120-147`, `GuidedCampaignPanel.tsx:23/60`).
- W-67 `socialLife.needsFoodAid` is a second food-shortage rule with different numbers (`max(50, pop*2.5)`) from the canonical `resourceUtils` thresholds (`max(15, pop*1.5)` / low 20), so a settler can petition for food while no food alert fires (`socialLife.ts:158-163`).
- W-68 `wildkinChronicle`'s “announced once” guard is a `WeakMap` keyed on the world object, so every story command's `structuredClone` loses it and the sighting line can repeat (`wildkinChronicle.ts:84-88`).
- W-69 `tutorialCampaign`'s `year_two` predicate (`year >= 2`) and its “You made it through the first year” copy disagree, and `winter_watch` completes at day 250 — congratulating the player ~110 days early (`tutorialCampaign.ts:66-73`).

**Audio / tooling / tests**
- W-48 Intro pad restarts from 0:00 on every click/keypress (`introMusic.ts:133-144`, `director.ts:38-40`).
- W-49 HTML audio and Web Audio paths differ ~4.3× in loudness (≈13 dB) for the same track (`htmlAudioSync.ts:21-23` vs `graph.ts:179-205`).
- W-50 `check-docs.mjs` silently skips two missing docs and still prints “7 documents checked” (`check-docs.mjs:13-21/35/82`).
- W-51 `npm test -- unit-all` is documented but unknown, so it exits 1 (`scripts/test.mjs:108`; no alias).
- W-52 The only storm-notification/FX tests are permanently skipped (`worldEvents.ts:32` flag false; `weatherConsequences.test.ts:100/121`).
- W-53 `check-comments.mjs` diffs `HEAD`, so on a clean CI checkout it inspects nothing and passes (`check-comments.mjs:39`).
- W-54 The ownership gate has no coverage floor (0 indexed functions would pass); it fails only on `!ownerKey`, and the module fallback makes that zero for any function in a file named by a parsed table row. `worker-boundary-audit` also blanket-excuses `entities`/a fixed key list (`build-call-graph.mjs:743`; `worker-boundary-audit.mts:685-696`). See section 4.6 for the measured register coverage.
- W-55 `types` does not typecheck the Node tsconfig (worker-node entry/vite config); `tauri:dev:log` points at a missing script (`scripts/test.mjs:36`, `package.json:27`).

---

### 4.6 Ownership register coverage (measured)

`OWNERSHIP_OVERVIEW.md` is 698 lines / 167 KB. It is **complete at file level and incomplete at function level**, and the owner gate cannot see the difference.

| Measure | Result |
|---|---|
| Source files mentioned by path or basename | **398 / 398** |
| Files named in a *parsed* owner cell | **397** (`buildingAccess.ts` is covered via the decision registry) |
| Table rows in the document | 602 |
| Rows with ≥6 split cells | **371**, of which 19 are header/separator rows → **352 owner data rows** (+48 registry = 400 decisions) |
| Rows the gate skips | **231** — 190 three-column and 41 two-column tables (e.g. the harness-owner block, lines 11–30); `parseOwnershipOverview` requires ≥6 split cells |
| Distinct names in parsed entry cells | ≈1,538 backticked identifiers, of which **1,393** are declared function names |
| Functions resolved to an explicit entry | **1,376 / 3,400 (40.5 %)** |
| Functions with only a **module** owner | **2,024 / 3,400 (59.5 %)** |
| Declared functions not named anywhere in the document | **1,089 / 2,886 (37.7 %)** |
| Exported functions not named anywhere | **656 / 1,986 (33.0 %)** |
| Function names claimed by more than one row | **44** distinct backticked identifiers (**37** declared functions; 95 if any owner/entry token counts) — e.g. `GameErrorBoundary` ×3, `useOverlayKeyboard` ×3, `addResource` ×2, `isPlayerHuman` ×2, `humanTick` ×2 |
| Registered names that no longer exist in `src/`, `tests/` or `scripts/` | **12** |

**Why the gate still says “0 unowned”:** `ownerForFunction` in [build-call-graph.mjs:641-660](../../scripts/build-call-graph.mjs#L641) first tries an explicit entry, then falls back to “any decision whose owner cell mentions this file”. Because 397/398 files are mentioned, every function in them receives an owner. The reported `withoutRecordedOwner: 0` is therefore **structural**, not evidence of one-to-one registration. `--verify-owners` fails only when that field is non-zero ([build-call-graph.mjs:743](../../scripts/build-call-graph.mjs#L743)).

**Stale registrations (12):** `routeCommuteHours`, `startMarriedPregnancy`, `startAffairPregnancy`, `startYouthPregnancy`, `markRelationshipsChanged`, `relationshipRevisionOf`, `stampMountainPeaks`, `mountainSpritesReady`, `humanRenderDetail`, `completedDepthSortedBuildings`, `downloadSaveFile`, `stripCoveredFields`.

**Duplicates:** the first matching decision in document order wins silently; there is no duplicate-owner diagnostic. Most are cross-references in entry cells rather than real conflicts, but the format does not distinguish them, so a genuine conflicting claim would also be silent.

**Consequence:** AGENTS rule 5 (“every named function is accounted for by name under its sole owner”) is not true at function granularity and is not enforced. A new function in an already-registered file always passes.

**Recommended gate (Phase 5):**
1. Require every **exported** function (1,926) to appear explicitly; allow private helpers to stay grouped, but list the group.
2. Fail on duplicate explicit names, on registered names absent from the sources, and on ignored table rows (or parse 3-column tables explicitly).
3. Add a coverage floor (e.g. fail below 95 % explicit exported coverage or below 3,000 parsed functions), so a parser regression cannot pass as “0 unowned”.

---

## 4.7 Gates and tests — what they actually prove

**Suite size and shape (measured):** 509 test files, 3,289 tests passed / 2 skipped in the standard run. `unit` excludes `tests/fullYear.integration.test.ts` and `tests/longRunColony.integration.test.ts`. Mechanically the suite is healthier than most: **no test file has zero `expect`**, only 14 files use `vi.mock`, 13 use `vi.spyOn`, none read `Date.now`, and the `Math.random` hits are one test id plus one comment/title (3 files total). Promise pumping appears as 5 `setTimeout(0)` calls in `gameLoop.test.ts`. But 151 `toBeDefined` and 45 `toBeTruthy` assertions exist, and 40 `expect` blocks sit behind an `if`/early-return guard.

**What is not run, or not able to fail:**

| Gap | Evidence | Consequence |
|---|---|---|
| **The year-long integration test never runs in CI** | `tests/fullYear.integration.test.ts` is excluded from `unit`; no workflow contains `fullYear`, `invariant-test` or `test:full` | The 504-line real-year test is local/manual only. The 90-day test runs only in a path-filtered workflow |
| **The 90-day gate is path-filtered and never runs on main** | `housing-90-day-targeted.yml` triggers only on 13 paths (`gameTick`, `dailyBuildingEconomy`, `virtualPlayer`, `colonyHealth`, housing files) and only on `pull_request` — no `push:` trigger | Changes to `humanTick`, `workforce`, `saveLoad`, `simRng`, `tickLayerDaily` never run it, and main is never gated by it |
| **The 90-day gate hardcodes zero invariant errors** | `longRunColony.integration.test.ts:65/76` passes `[]`; `assessColonyStall` ignores `invariants.violations` | “Healthy colony” can coexist with broken occupancy/leader state (S-11) |
| **`--changed` passes with zero tests** | `scripts/test.mjs` builds `vitest run --changed=<sha> --passWithNoTests` | A PR touching only untested code can pass the unit step vacuously |
| **`fullYear` checks invariants only at 90-day checkpoints** | `CHECKPOINT_DAYS`, `if (!checkpoints.has(tick)) continue` | Short-lived corruption between checkpoints is invisible |
| **`tmp-gate` is vacuous and committed** | Case 1 has no `expect`; case 2 passes when `decideVirtualPlayerAction` returns `null` | W-12 |
| **46 game modules are never directly imported by a test** | Includes `dailyGrassEcology.ts` (the grass bug), `tickLayerDaily.ts`, `humanVenueBehavior.ts`, `buildingResidencyActions.ts`, `renffrStar.ts`, `spatialQueryMetrics.ts`, renderer pieces and all 8 game-root screens | They can only be covered indirectly, if at all |
| **Coverage is instrumented for 3 files only** | `vitest.config.ts` coverage `include` = `dayCycleClock`, `tickLayerDaily`, `dailyWorldEvents`; only `calendar-scheduler` passes `--coverage` | There is no suite-wide coverage signal or ratchet |

**Gate routing defects (all verified in `scripts/test.mjs` / workflows):**

| Gate | Defect |
|---|---|
| `unit-all` | Documented in the menu but has no `ALIAS`/`GATE` entry, so `npm test -- unit-all` exits 1 |
| `all` | Menu says “same steps as standard” but `GATE.all` omits `scriptsTypes`; coverage is unaffected because `STEP.types` already typechecks the scripts project — the menu is simply wrong |
| `full` | Runs `dup` **three** times (two explicit + the `build` step’s own `dup`) and repeats lint, call-graph and app-tsc; not used by any workflow |
| `knip` | Local-only; an OOM (`RangeError: Array buffer allocation failed`) exits 1 and is reported as a finding — a false red |
| `check-docs` | Lists `command.md` and `BUG_REPORTS/Readme.md` (wrong paths), silently skips missing files, still prints “7 documents checked” (W-50) |
| `check-comments` | Diffs `git diff HEAD`, so on a clean CI checkout it inspects nothing and passes (W-53) |
| `check-dialogue-circumstances` | Runs without `--strict`, so its 31 cue warnings can never fail the gate |
| `owners` | No coverage floor; module fallback makes `withoutRecordedOwner: 0` structural (4.6, W-54). The step also **rewrites tracked `docs/tools/call-graph.json` on every run**, and the committed artifact is stale (399 files/3,396 functions vs current 398/3,400) |
| `worker-boundary-audit` | Not in any gate, and its `classify` blanket-excuses all `entities` delta findings and a fixed save-key list |
| `benchmark-gate` | Points at two files that do not exist and is not wired to any script (W-11) |
| `semantic`/`semanticDup` | Baseline-based; only new/unreviewed groups fail, so legacy duplicates are permanent |
| `perf-population-*` | PR benchmarks with fixed seeds; they verify recorded workdays, not gameplay correctness |

**Tests that assert the wrong thing (the pattern behind the bugs):**

- `tests/wildkin.apexRole.test.ts` asserts the *diet configuration* and the demand exclusion, never the wildlife tick — so the `NaN` branch is untested (S-02).
- `tests/mapScale.pacing.test.ts` calls `tickVillageForge` at a **midnight** tick, so the 18:00 cadence bug cannot fail (S-01).
- `tests/workerBoundary.closure.test.ts` compares key unions but its 3-day fixture never runs an election, so the missing election fields are invisible (S-04).
- `tests/workforce.barracksAutoFill.test.ts` asserts `> 1` and leaves a barracks below capacity while its title implies full staffing.
- `tests/tmp-gate.test.ts` is green if the bot is deleted.

**Verdict:** the suite is broad and fast enough (standard 441 s; calendar 29 s), and most tests assert real world state rather than mocks. The problem is **gate reach**: the year-long integration test is absent from CI, the 90-day test is path-filtered and never runs on main, `--changed` can pass with zero tests, and the invariant collector cannot fail the long runs. Note the nuance: `120days.yml` runs the producer **script** on every PR (its header claims a path filter that does not exist), so some long-run coverage exists — just not the integration test or the invariant assertions. Phase 5 should wire the year test and an invariant-failing fixture into CI, remove `--passWithNoTests` (or require a minimum selected-test count), and delete the vacuous scratch test.

---

## 5. Auto workplace assignment — the direct answer

**(a) Does it fill each building to full capacity?**
**Yes when the workers come from the idle pool.** Every eligible building loops `while (assignWorkerInPlace(...))` until `workerCount >= BUILDING_CONFIGS[type].maxOccupants` ([workforce.ts:897-902](../../src/game/workforce.ts), `:578-581`). Prison capacity is correctly 4 guard posts, not 8 occupants. **No when the extra hands must come from redistribution:** donors only give when they keep ≥2 above the recipient and never drop a critical food/guard building below its floor (`:216-224`, `:480-483`), and a **60-day cooldown is stamped even on the initial hire** (`:164`).

**(b) Does it staff all eligible buildings?**
**It attempts every eligible building every sweep — there is no early `break`.** A building can still end empty because:

1. no idle adult is within the **2-hour commute** cap ([commuteReach.ts:26](../../src/game/commuteReach.ts));
2. all idle adults are on construction crews, which are staffed first (`:1000-1005`);
3. no legal donor (2-post food buildings can never donate; donor must be +2);
4. the 60-day cooldown;
5. the route-search budget ran out (retries next pulse);
6. the signature cache skipped the sweep — it omits a completed building's `occupants`, the path grid and `staffingMode` (`:920-968`);
7. a jailed worker's reserved post counts as filled (`:64-73`, `:200-213`);
8. Taming Post has slots but no job type;
9. **the greedy trap:** a higher-priority building takes the only settler who could reach a later one, and the rebalance refuses to take that last worker — vacancy + idle settler can persist forever;
10. newly arrived settlers miss the first pulse.

**What the tests prove:** per-building fill from idle adults, and the conservative donor rules (two tests actually assert *under*-capacity outcomes while their titles suggest guarantees). They do **not** prove “every building filled”.

### 5.1 Automatic housing — the same question

**(a) Does it fill each house to capacity?** **No, by design.** Placement prefers an empty home for a lone settler (`HOUSING_SCORES.EMPTY_HOUSE_BONUS`) and a home without unrelated residents for a family, so a 6-bed House with one adult is a normal outcome. Those beds still count as “open” for immigration.

**(b) Does it house every eligible settler?** **No — one case is structural.** A custodian plus dependent minors is placed all-or-nothing (`familyFitsInResidence` requires the whole group). If that group is larger than every residence, it stays homeless while beds sit free, and any other adult in the household is seated alone in the emptied home (F1/S-17). This is stable, not churn. Everything else is retried every sweep; the post-eviction homeless fill is global on every call, not bucket-limited.

Other real limits: prisoners keep a reserved bed and are never moved; the manor’s 20 beds are never assignable; new arrivals/newborns miss the first pulse (≤6 h); the sweep only runs when the housing fingerprint changes or on the weekly audit; and the housing invariant audit is test-only, so the two worst states are invisible in play. The owner’s own architecture doc claims “no homeless while beds exist — DONE”, which the code and `tests/housingArchitecture.completion.test.ts` contradict (that test passes with the mother and six children homeless).

---

## 6. What the gates do not catch (verification gaps)

1. **Invariants are advisory and partly vacuous** (S-11). The 90-day gate hardcodes `[]`; the year gate asserts only at 90-day checkpoints; checks 3–6 of `simInvariants` compare lists the tick just rebuilt.
2. **`calendar-scheduler`** is a real required workflow, but it is not in the local `scripts/test.mjs` gate lists — running `npm test` locally does not run the boundary gate.
3. **Tests that call owners out of schedule** hide the forge bug; **tests that assert configuration** hide the Wildkin bug (`wildkin.apexRole`) and the worker-boundary omission (3-day fixture never runs an election).
4. **The health verdict never reads `invariants.violations`**, so a colony can be “healthy” with broken occupancy/leader state.
5. **No test asserts `pagehide`/exit persistence**, and the persistence test exercises the function, not the hook lifecycle.

---

## 7. What was verified clean

**Simulation:** one tick path (`gameTick` from the loop or the worker only); 288 ticks/day / 12 per hour; year rollover and `lastProcessedCalendarDay`; layer order and cadences; needs/physiology scale by elapsed ticks and guard double-advance; starvation is reachable and lethal; age/birthdate math is self-inverse; no `Math.random()` in gameplay; RNG snapshot/restore is sorted and presentation streams are excluded; save allow-list is complete and validates ids/tick/resources; delta ordering and event-log ids are consistent; no runtime import cycles; raid/combat ratio math is divide-safe; wildlife has population floors and caps; weather disasters are intentionally gated off; the 90-day colony gate passes with births and production; the call graph parses 3,400 functions and every file is represented, although only 40 % have explicit function entries (section 4.6); `entity.generation` **is** inherited at birth (`babyGen = parent + 1`), so dynasty/election family data is sound.

**Shell and UI:** no XSS sinks (`dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` all absent); modal focus trap and overlay keyboard claims are symmetric and cleaned up; canvas, keyboard, blur and visibility listeners are all removed; intervals/timeouts in the profiler, diagnostics and transient feedback are cleared; the session/loop teardown is generation-guarded and StrictMode-safe; the worker command transport is typed and shape-validated; save shape validation covers resources, ids, tick, allocators and RNG; challenge rewards are paid once; research has one gate; the event log is monotonic and capped; family-tree walks are cycle-guarded and bounded; terrain hydrology, noise and height generation are deterministic; sprites degrade to null rather than crashing.

**Audio:** one shared `AudioContext`/graph, never recreated per session; mute/volume round-trip through one owner; every sample has a procedural fallback; spotlight hand-off is generation-guarded and restores once.

**Story / chronicle / screens:** `weeklyGazette` covers all 17 event types and its week range is correct; `guideHelp` is data-only; `valleyChronicle` rewards once and round-trips through save/delta; `visitorQuest` is saved, prepped and delta-shipped with one reward; `spotlightLore` adds no new defect beyond its existing reports (pause is restored on finish); `contextualTutorial` reuses `isFoodCritical`/`getEcosystemHealth`; the modern Invention Fair lifecycle expires and refunds correctly; the 8 game-root screens do not mutate `WorldState` (Population/Statistics/CombatPreview/Focus read owners), and `IntroScreen`’s timers/listeners are all cleaned up.

**Genetics:** genome allocation/band/spread, one-allele inheritance with a neutral fallback, bounded mutation, `normalizeGenome` validation, deterministic legacy backfill, founder/mark neutrality, save and worker transport, and all 18 activity directions and owners are sound; the only defects are the refugee citizenship gap (W-77) and the affair-factor/barricade/inspector asymmetries (W-78–W-80).

---

## 8. Known and intentionally open (not counted as new defects)

- **Wildkin hunting AI** was explicitly deferred in the 2026-10-09 report; S-02 is the new `NaN` consequence, not the missing AI itself.
- **Autumn herd shrink-only** was a deliberate 2026-09-16 fix (unharmed herds must not grow); S-15 asks for a recovery path, not a revert.
- **The 24-tick off-screen throttle** is an intentional performance choice; S-06 is about the unscaled movement step.
- **Hostile weather** is deliberately disabled (`HOSTILE_WEATHER_ENABLED = false`).
- **Rival prisoners** are documented as 0.6.5.2 roadmap, not shipped 0.6.5.1.

---

## 9. Remediation plan

### Phase 0 — correctness and data-loss hotfix (≈1–2 days)

| Work | Owner file(s) | Done when |
|---|---|---|
| Forge cadence | `forge.ts`, `dailyBuildingEconomy.ts` | Queue an order, run real `gameTick` 2 days, order completes; test fails before the fix |
| Wildkin grazing/NaN + hunt | `tickLayerSystems.ts`, `speciesConfig.ts`, `simulationEntities.ts` | Wildlife-layer test: energy finite, it hunts, it can die; `energyGain` access is guarded |
| Leave/save lifecycle (S-03 + W-01) | `useGamePersistence.ts`, `useGameSession.ts`, `App.tsx` | A `pagehide` test writes the slot; leaving to menu/new game persists once; the new game never deletes a save it did not replace |
| Malformed-import hardening (W-02/03/04) | `viewState.ts`, `saveLoad.ts` | Fuzzed/edited saves: `null` particles dropped, huge footprints refused, non-compact maps size-checked; no tick loop crash |

### Phase 1 — hand-off, rollback and determinism (≈3–4 days)

1. **Derived-state set:** rebuild `beautyGrid` and `scentGrid` at hand-off, clear the child-playmate cache, add a same-seed rollback-replay test.
2. **Election/leader fields** in `SimTickDelta` + `SimPrepKeys`; extend the worker fixture to run an election.
3. **Off-screen movement** elapsed-tick scaling; focus-on/off parity day.
4. **One run-seed accessor** in `simRng.ts`; route stories/elections/omen/combat through it; named salt registry; seed the leisure activity.
5. **`paused`/`speed` transport** and `factionWander` reset.
**Done when:** the same seed produces the same 7-day world through main-thread, worker, save/reload and one forced rollback.

### Phase 2 — rendering and shell integrity (≈2–3 days)

Build-ghost cache key (W-06), per-colony shell reset on load (W-08), audio teardown (W-07), **command watchdog and recovery budget (W-107/W-108)**, SoA grass energy (W-21), stop renderer writes to sim fields (W-22), static-layer repaint key (W-24), terrain atlas key (W-25), logistics overlay cost (W-23), error boundary actions (W-17), hotkey repeat guards (W-18).
**Done when:** placement markers track the ghost while paused; a loaded colony has no carried build mode; a second intro plays; worker and main grass look alike; no sim field is written by render code; a hung command falls back within the stall threshold and recovery never freezes the game for more than a few seconds.

### Phase 3 — economy, ecology, services (≈3–4 days)

Food ledger for trade/gifts/spoils; immigration gate reads real supply; grass regrowth clamp + pressure estimate; bountiful-harvest ordering; hospital ward centre; sticky commute; skill-credit/presence and workshop preview consistency; spoilage/hasMill cleanups; hotel staffing; caravan timeout; rival-building ownership gate.
**Done when:** a trade-fed colony still admits immigrants; a winter pasture thins; a doctor treats from every facade; a long-commute worker arrives on time; a blocked caravan resolves instead of leaking goods.

### Phase 4 — auto-staff and world systems (≈3–4 days)

Defense preset order (W-09); **construction pacing for zero-crew types (S-18)** and the rival-owned `unique` block (W-88); jailed-post backfill; Taming Post slots or no slots; bounded swap pass; **social cadence latch (W-104)**; **custodian-group housing split (S-17)** and the over-capacity repair (W-70); **DNA at refugee citizenship (W-77)**; herd recovery; indoor shelter rule; yearly spawn through passable placement (W-81) and poaching through the wildlife-death owner (W-82); rival-prisoner branch either wired or deleted; enemy-captive roster contract.
**Done when:** a Wall/Barn/Mill finishes within its catalogued days without a crew; a banter/greeting pair plays at most one scene per day and keeps its day odds; a 60-day colony has every completed workplace staffed or a logged reason; Defense actually raises guards first; a 7-person custodian group is housed when beds exist or receives a named “needs a larger home” state; a welcomed refugee has the same genome before and after a reload; no yearly event spawns an animal in water or a mountain; no invariant violations in a real 360-day run.

### Phase 5 — contracts, tests and gates (≈2–3 days)

Make invariants fail in dev/tests; feed them to `colonyHealth`; validate registry owners/cadence/writes; fix the extinction assertion (W-10); delete/rewrite `tmp-gate` (W-12); fix `check-docs` (W-50), `unit-all` (W-51), `check-comments` (W-53), the ownership floor and worker-boundary audit (W-54), the missing perf gate (W-11), and the Node tsconfig gap (W-55); add every Phase 0–4 regression.
**Done when:** `npm test -- full` is green **and** a deliberately broken fixture fails the invariant collector, an extinct colony fails the year harness, and the docs/ownership gates fail when their input is missing.

### Order and risk

Phase 0 is independent and should land first. Phase 1 items 1–2 are the highest correctness value; the seed work can follow. Phase 2 is player-visible but locally contained. Phase 3 is mostly tuning plus one gate fix. Phase 4 needs design decisions (swap policy, herd recovery, shelter rule) before code. Phase 5 must come last so it can encode the new contracts. Do not bundle Phase 5 test harness changes with gameplay fixes: a green suite that cannot fail is exactly how the current defects survived.

### Definition of done (this audit)

Remediation is complete only when all of these hold; otherwise report it as partial:

- [ ] Every Phase 0–4 item has a regression test that **fails on the pre-fix code** (or a documented static-only exception).
- [ ] `node scripts/test.mjs standard` green.
- [ ] `node scripts/test.mjs calendar-scheduler` green.
- [ ] `node scripts/test.mjs colony-integration` green **with real invariant errors** (no `[]` escape hatch).
- [ ] The new 7-day parity test is green across main-thread, worker, save/reload and one forced rollback.
- [ ] A deliberately broken fixture **fails** the invariant collector (proves the gate can fail).
- [ ] The year-long test runs in CI (or a documented required schedule) and is green.
- [ ] No new wall-clock/RNG use in simulation; `decisionRegistry.ts` and `OWNERSHIP_OVERVIEW.md` are updated for every added/moved function.
- [ ] One `docs/bug_report/` file per fixed defect plus the index entry; changelog entry; exact PR bug-report counts.
- [ ] The false housing-architecture claims are corrected or made true.

### How each phase is verified

| Phase | Commands / new tests |
|---|---|
| 0 | `standard` + forge, Wildkin, save-on-exit and malformed-import tests |
| 1 | `calendar-scheduler`, `colony-integration`, new parity/rollback test |
| 2 | `standard` + placement-marker, load-state, audio-teardown, SoA-grass tests |
| 3 | `colony-integration` + trade-fed immigration, winter pasture, hospital-facade, commute-arrival tests |
| 4 | 60-day staffing/housing scenario + 360-day invariants (including a passable-spawn assertion) |
| 5 | `standard` + a negative fixture that must fail the invariant/owner/docs gates |

### Bug-report protocol

This audit created **0 bug reports** (`New: 0` / `Updated existing: 0`) because it changed no code. When Phase 0 starts, each confirmed defect gets one `docs/bug_report/YYYY-MM-DD-*.md` plus an entry in `docs/BUG_REPORTS/SUMMARY.md`, per `docs/bug_report/readme.md`. Re-check the tracker first: the Wildkin diet and herd behavior already have historical reports that must be updated, not duplicated.

---

## 11. Round-2 verified list (the new list)

**Method:** five independent verification teams re-read the cited code, tried to refute each claim, assigned an independent size, and dug for missed defects. **All five have reported.** Sizes below are the verified sizes, not the original column; where a verifier disagreed with the report, the report was corrected in place. Result: the initial pass listed 18 high; verification confirms **2 blockers + 9 high**, re-rates eight items to Medium, and refutes or downgrades four (W-43, W-44, W-45, W-46).

### 11.1 What survives, ranked by verified size

| # | ID | Verified size | Finding | Verified by | What it costs the player |
|---|---|---|---|---|---|
| 1 | **S-01** | **BLOCKER** | Forge orders can never progress | team 1 (confirmed) | Every forged order is paid for and never finishes — armament progression is dead |
| 2 | **W-01 / S-03** | **BLOCKER** | Leaving the colony (menu/new game/tab close) saves nothing; the next new game deletes the quicksave | team 4 + parent | Loses the whole session since the last manual save; destroys the last backup |
| 3 | **W-02** | **HIGH** | A crafted save with `disasters:[null]` wedges every systems tick forever (particles self-heal; disasters do not) | team 1 (corrected) | Imported save permanently freezes the colony; only a new game recovers |
| 4 | **S-02** | **HIGH** | Wildkin grazing on a missing diet key → `NaN` energy → inert and effectively unkillable until old age | team 2 (confirmed) | A creature becomes non-breeding/unhuntable, never starves, and poisons the save |
| 5 | **S-18** | **HIGH** | Zero-occupancy buildings can never be crewed → 0.22× speed (4.55× advertised days) | parent + audit | Walls/Barn/Mill/Silo/Watchtower/decor take up to 22 days instead of 5 |
| 6 | **S-17** | **HIGH** | A custodian+minors group larger than any home is never split, even with free beds | audit + verifier | A widow with 6 children sleeps rough beside an empty house; the father is seated alone |
| 7 | **W-64 (+W-123–W-125)** | **HIGH** | Expired authored story cards orphan their one-shot chain → guided campaign 5/5 unreachable | team 3 (confirmed) | A story (and possibly the campaign finale) becomes impossible on that save |
| 8 | **W-111** | **HIGH** | A pending strip-demolition confirm survives a load/new game and demolishes the loaded colony’s buildings by reused ids | shell re-read | Unrelated buildings destroyed with no undo |
| 9 | **W-30** | **MEDIUM** | `memo(ChallengesPanel)`, `memo(StrategicWorldMap)` and three village panels never see the reused world object | teams 4+5 (corrected) | Challenge progress, the strategic map and some village figures are frozen while open — normal worker mode and all fallback |
| 10 | **S-06** | **HIGH** | Off-screen humans move 1/24 speed while needs run every tick | team 2 (confirmed) | At the default zoom ~17 % of a Medium map is in focus; most travel runs throttled |
| 11 | **W-05** | **HIGH** | Terrain patch queue drops the oldest 256 patches | parent + audit | Worker/replica terrain diverges after a long strip clear; save disagrees with the screen |
| 12 | **W-06** | **MEDIUM** | Build-validity snap markers/strip hint are baked into the cached layer without the ghost key; the ghost plate itself is per-frame. Masked whenever W-24 repaints per tick | team 5 (overstated) | Secondary validity markers freeze; the primary ghost feedback stays correct |
| 13 | **W-07** | **MEDIUM** | Audio is never torn down; intro theme cannot play after the first colony | team 5 (confirmed) | Colony music over the menu; silent intro for the session |
| 14 | **W-08** | **MEDIUM** | Loading a save keeps the old build mode and per-colony shell state | team 5 (confirmed) | First click places the previous colony’s building type; first-night card cannot fire |
| 15 | **W-09** | **HIGH** | Defense preset ranks Barracks/Prison last despite “barracks first” | audit (confirmed in consolidated) | Choosing Defense raises the army after pubs and inns |
| 16 | **W-118** | **MED-HIGH** | `getPlayerCampCenter` double-counts the footprint half-size | team 3 (new) | Camp anchor, raid distance/loot, march target and patrol ring are ~2–3 tiles off |
| 17 | **W-119** | **MED-HIGH** | Town Hall service uses the corner + 0.9h, so a settler at the true centre fails the gate | team 3 (new) | No food aid/audience/stipend/reputation when standing at the hall |
| 18 | **W-104** | **MEDIUM** | A day-stable roll is used as a per-tick social gate (4-tick scenes) | team 2 (confirmed) | Whole banter pool plays back-to-back one day, then 3 days of silence |
| 19 | **S-08** | **MEDIUM** | Trade/gift/raid food never reaches the daily ledger | team 2 (confirmed) | A trade-fed colony stops admitting immigrants with a full larder |
| 20 | **S-09** | **MEDIUM** | Daily grass regrowth is ~7× the cap | team 2 (confirmed) | Winter/drought never thin pasture; ecology pressure lies |
| 21 | **S-10** | **MEDIUM** | Hospital ward gates use the footprint corner | team 3 (confirmed) | A doctor at the north/west door refuses to treat |
| 22 | **W-03/W-04** | **MEDIUM** | Crafted-save footprint loop / unvalidated non-compact map size | team 1 (confirmed/downgraded) | Imported malicious file can hang or OOM the tab |
| 23 | **W-107/W-108** | **MEDIUM** | Hung command freezes 30 s (watchdog cannot fire); recovery freezes up to ~74 s | team 1 (confirmed) | Long unresponsive stretches after a worker fault |
| 24 | **S-07** | **MEDIUM** | Bountiful Harvest is cleared in the same odd-year call | team 3 (confirmed) | Zero days of doubled output; the banner still promises it |
| 25 | **W-69** | **MEDIUM** | Tutorial “first year” completes ~110 days early; “year two” a year late | team 3 (confirmed) | Every new player sees a wrong celebration |
| 26 | **W-48** | **MEDIUM** | Intro pad restarts from 0:00 on every click/key | team 3 (confirmed) | The intro theme stutters on every interaction |
| 27 | **W-130** | **MEDIUM** | Edit-hours/Shortcuts open under the still-open overview | panels follow-up | Click appears dead; focus trapped |
| 28 | **W-131** | **MEDIUM** | POW dialog memoised on a mutated world | panels follow-up | Stale prisoner row/count; repeat actions |
| 29 | **W-132** | **MEDIUM** | Forge warning tests one Blacksmith while the owner checks any | panels follow-up | False “forge pauses” warning |
| 30 | **S-14/S-16** | **MEDIUM** | Dead commute lead (work branch opens 1 h before shift); indoor shelter does not protect from the howler | team 2 (confirmed) | Late arrivals; the full-moon advice is false |
| 31 | **W-110** | **LOW** | No test pins timeouts/watchdog/recovery | team 1 (partial) | A regression in worker timing cannot fail CI |
| 32 | **S-12/S-13** | **LOW** | Stale worker wander state; `paused` not in delta | team 1 (downgraded) | Transient wrong visitor paths; diagnostics badge disagrees |
| 33 | **W-43/W-44/W-45/W-46** | **LOW** | Rival houses (legacy-only), election tally residual, adoptive parent, dialogue-scene reset | team 3 (refuted/downgraded/reworded) | Rare or cosmetic |
| 34 | **W-41/W-42/W-47/W-49** | **LOW** | Lifetime stats shrink after year 50; rival “longest lived”; double famine friendship hit; audio path loudness | team 3 (confirmed) | Rare/statistical/cosmetic |
| 35 | **W-65–W-68, W-78–W-80, W-83–W-87, W-93–W-103** | **LOW** | Story/wedding index, dead campaign choice, food threshold, WeakMap chronicle, affair factor, barricade DNA, legacy camp surface, dialogue lows | teams 3 + parent | Latent/cosmetic or legacy-only |
| 36 | **W-136** | **MED-HIGH** | Production **fails open** on attendance: zero presence samples fall back to schedule ticks, so a crew that never reaches the post produces 100 % | team 2 (new) | Attendance does not gate output; combined with S-06 it hides the lost production |
| 37 | **W-137–W-144** | **LOW** | Phantom herd losses, immigrant spawn corner, free-hunt nominal food/death tally, refusal text corner, hotkeys dead in form fields, per-frame static key, boot Huge world, surviving window state | team 5 + team 2 (new) | Small or perf-only |
| 38 | **W-145** | **MEDIUM** | Save validation omits `energy`, so a `NaN` survives as `null` and the animal dies silently on reload | team 1 (new) | Corruption is masked instead of rejected; S-02’s `NaN` escapes the save boundary |
| 39 | **W-146/W-147** | **LOW** | Legacy rival kill skips death bookkeeping; Wildkin spawn-energy mismatch | team 1 (new) | Legacy/cosmetic |

### 11.2 Corrections the verifiers forced

- **S-03 upgraded to BLOCKER** and merged with W-01 — the report’s “High” under-rated a data-loss path.
- **W-02 rewritten:** particles self-heal via `{...null}`; the permanent wedge is `disasters`, which `structuredClone` preserves.
- **W-03/W-04 downgraded to Medium:** crafted-import only; a `RangeError` is a clean refusal, the risk is memory pressure.
- **S-12/S-13 downgraded to Low:** transient wander state; the fallen-settlement UI is driven by `raidRecovery`, not `paused`.
- **W-30 re-scoped and rated Medium, not High:** the world object is reused in the worker path too, and the frozen set is ChallengesPanel + StrategicWorldMap + three VillageTabPanel sections; the effect is a frozen panel, not lost play.
- **W-06/W-07/W-08 re-rated Medium:** the ghost plate and failure label are per-frame (only the secondary marker cloud freezes); audio and load-state bleed are recoverable by leaving/reloading.
- **S-14 root cause corrected:** the lead is not merely non-sticky — the work-walk branch only opens one hour before the shift, so the lead is effectively dead for ordinary jobs; the fix is a real commute window, not just stickiness.
- **W-104 corrected:** each scene lasts **4 ticks**, not 8.
- **W-136 new and important:** the report’s “output requires attendance” premise was **backwards**. `presentTicks ?? scheduleWorkedTicksToday` falls back to schedule ticks (credited before the at-post test), so a crew that never reaches the post produces 100 % while a crew present 5/108 ticks produces ~4.6 %. This also masks S-06’s production loss.
- **W-95 refuted:** notifications are not in `WORLD_STATE_SAVE_KEYS`; forcing `[]` discards nothing. **W-96 unproven:** the saved width is the same field the world was built from for any save this build writes.
- **W-93 impact refuted:** the stale camp key is dead saved state; App resolves it to `null`, so no panel opens and no ring draws.
- **W-59 divergence unproven:** the panel predicate and `isPlayerHuman` are identical for every legal faction value; it is ownership duplication, not a turnout bug.
- **W-37/W-70 unreachable or legacy-only:** no code creates rival buildings (save load strips legacy ones); over-capacity non-manor homes are not reachable through normal writers.
- **S-02 nuance:** not literally immortal — it dies of old age; but it never starves, breeds or is hunted, and persists for up to 40 in-game years.
- **Ownership numbers corrected:** 352 owner data rows (not 371), 1,089/2,886 declared functions missing (37.7 %), 656/1,986 exported (33.0 %), 44 duplicate identifiers, 46 untested modules, 8 screens.
- **Gate claims corrected:** `scriptsTypes` *is* in the standard gate and CI; `full` runs `dup` three times; `120days` is not path-filtered; `check-dialogue` is not strict; the `owners` step rewrites a tracked file; `knip` OOM is a false red.

### 11.3 New findings produced by round 2

Geometry drift (W-118 anchor, W-119 town hall, W-120 faction wander, W-121 venue standoff, W-122 visitor camp placement), story-expiry orphans (W-123–W-125), rollback/migration edges (W-126 terrain patches, W-127 mark revision, W-128 dialogue history, W-129 tick counters), session residue (W-111–W-115), worker config (W-116/W-117), UI residue (W-130–W-135), the attendance fail-open (W-136), and the herd/immigration/hunt/migration/window lows (W-137–W-144).

### 11.4 What to do first (verified order)

1. **Phase 0:** forge (S-01), leave/save (W-01/S-03), Wildkin (S-02), malformed import (W-02 + W-03/W-04).
2. **Phase 1:** hand-off/rollback set, off-screen movement (S-06) **together with attendance (W-136)** — fixing one without the other hides the loss in the other direction — plus the geometry sweep (`getBuildingCenter` in villageAnchor/townHall/factionWander/hospital/immigration) and story-expiry resolvers.
3. **Phase 2–4:** the verified Medium/Low register per §9; W-30/W-06/W-07/W-08 are panel/feedback work, not blockers.

---

## 12. Appendix — verification log and open questions

- **Commands run:** `node scripts/test.mjs standard` (PASS, 3,289 tests), `node scripts/test.mjs colony-integration` (PASS, 90 days), `node scripts/test.mjs calendar-scheduler` (PASS, 17 tests), plus static `git`/grep checks. No test was skipped, weakened or added.
- **Not run:** the full-year 360-day invariant harness, the browser gate, and the population-performance workflows. Their CI claims were reviewed, not reproduced.
- **Unconfirmed at audit time:** the conception funnel looked unusually quiet in the 90-day diagnostics (22 courtships, ~1 marriage, 0 sampled pregnancies); no defect was proven. The ecology “predator” driver and visitor-stay off-by-one need a targeted run. One economy verifier was timeboxed before replying; its claims were verified directly in code by the parent.
- **Refuted during verification:** a reported “combat log shows the oldest 500” was withdrawn — `logEvent` is newest-first (`unshift`, cap pops the tail), so `slice(0, 500)` is correct. A reported “`entity.generation` is never written” was also withdrawn: birth sets `parent + 1` (`humanLifecycle.ts:197-211`). Both are recorded here so the register is not trusted blindly.
- **Cleanup:** no source/test changes; `docs/tools/call-graph.json` was regenerated by the gate and restored; all audit agents stopped.
