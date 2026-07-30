# Wilderfolk Roadmap — v0.5.0

**Target:** **End of July 2026** · **Prerequisite:** [v0.4.2](ROADMAP.md) shipped (`GAME_VERSION = 0.4.2`)

**Developer-only** checklist for the **consolidated scale & architecture** release — not shown in-game.  
**Player-facing shipped list** → [ROADMAP.md](ROADMAP.md) · Technical → [TECHNICAL.md](TECHNICAL.md) · Changelog → [CHANGELOG.md](CHANGELOG.md)

*Updated: 2026-07-12 — post-refactor stabilization; **settler denorm + partner map + outgoing raid march lines** landed; `npm run lint` / `npm run build` green; **v0.5.0** tag **end July 2026**.*

---

## One-line pitch

**v0.5.0 makes Wilderfolk scale and trustworthy** — spatial indexing, lean entity lists, render/UI polish, Web Worker simulation, canvas layers, and a **full bug + logic + simulation audit** so large-map towns at 10× feel smooth *and* correct.

---

## North star (this version)

Players on **large maps** with **100–300 settlers** should not feel sim hitch, UI freeze, or mystery lag when they zoom out, speed up, or let a decade pass. Performance work must stay **invisible** — same food chain, same raids, same prep-focused combat — just scalable.

**Winning moment:** *"I hit 300 people on a large map, opened every sidebar tab at 10×, and the valley still felt alive — no stutter."*

---

## Why v0.5.0 exists (accelerated)

| v0.4.2 delivered | v0.5.0 closes the gap |
|------------------|----------------------|
| Off-screen throttles, `entityById` / `buildingById`, `wildlifeCounts` | Spatial grid ✅ for graze/hunt/flee; remaining per-tick work is linear (UI scans, assign flows) |
| Headless avg ~1.8 ms/tick @ ~550 entities | **v0.5 target: 300 player + neighbor humans / ~1250 alive** — benchmarks and gates still tuned low |
| Partial React memo on a few panels | `App.tsx` still re-renders heavy tabs; assign flows scan all entities |
| Perf work was planned across multiple releases | **Single v0.5.0 ship (end July 2026)** — sim Phase 1 + Phase 2 + Worker/layers |
| ~40-fix bug pass in v0.4.2 | v0.5 correctness via **manual play + Vitest**, not long headless runs |

---

## Scope rule

| Label | Meaning |
|-------|---------|
| **P0** | Must ship in v0.5.0 — blocks version bump |
| **P1** | Should ship — polish that fits the scale milestone |
| **P2** | Stretch — only if P0 is green before **end July 2026** ship |
| **Defer** | Explicitly **post-0.5.0** |

---

## Code audit (2026-07-05 vs `GAME_VERSION = 0.4.2`)

Compared repo plan to code (July 12). **~7 P0 done, ~5 partial, ~8 P0 open.** Settler denorm, partner map, outgoing raid march lines, and TDZ/runtime fixes landed since July 8 audit.

| Status | Count (P0) | Meaning |
|--------|------------|---------|
| ✅ Done | 7 | Shippable as-is (compaction, spatial grid, worker sim opt-in, bug checkup, settler denorm, partner map, incremental entityById) |
| 🟡 Partial | 5 | Started — **finish these first** |
| ❌ Open | 2 | Not started |

---

## P0 — Must ship (end July 2026)

### Sim & render — Phase 1

| # | Item | Status | Hotspot | Deliverable |
|---|------|--------|---------|-------------|
| 1 | **Spatial grid** | ✅ Done | `spatialGrid.ts`, `lifeSimulation.ts` | Dual-layer: **grass 56px** (graze) + **mobile 80px** (flee/hunt/social); `RoadAvoidanceIndex` 128px; correct grid per hot path — [TECHNICAL.md](TECHNICAL.md#dual-layer-spatial-grid); `USE_SPATIAL_GRID` on by default |
| 2 | **Dead-entity compaction** | ✅ Done | `gameEngine.ts` | `state.entities = allAlive` each tick — alive only |
| 3 | **Renderer cache reuse** | ✅ Done | `renderer.ts` | `world.entityByType` per tick → `updateCachedEntities()`; viewport grass culling |
| 4 | **Settler count denorm** | ✅ Done | `WorldState`, `gameTick.ts`, `PopulationPanel.tsx` | `workingSettlers` / `idleSettlers` computed once per tick; used in UI |


### Sim & UI — Phase 2

| # | Item | Status | Hotspot | Deliverable |
|---|------|--------|---------|-------------|
| 6 | **Incremental `entityById`** | ✅ Done | `entityIndex.ts`, `gameEngine.ts` | `indexEntity` on birth, `unindexEntity` on death; `ensureEntityByIdMap` rebuilds only after load/init |
| 7 | **`buildingActions` scan cleanup** | ❌ Open | `buildingActions.ts` | Maps + `villageCounts` instead of entity filters |
| 8 | **`buildingById` go-home** | 🟡 Partial | `lifeSimulation.ts` | `buildingById` in ctx; commute still uses `updatedBuildings.find` |
| 9 | **Grass render buckets** | ✅ Done | `renderer.ts` `collectGrassInViewport` | `byType[Grass]` only; `buildGrassGrid` + `forEachInRect` viewport cull; `_cachedGrass` invalidates on tick + viewport key; SoA path slot scan (no grid rebuild) |
| 10 | **Partner id map** | ✅ Done | `renderer.ts` | `state.partnerById` Map built per tick → O(1) relationship-line lookup |
| 11 | **Particle / float pooling** | ❌ Open | `gameEngine.ts` | Reuse death particles + `floatingTexts` |
| 12 | **App tab split / memo** | 🟡 Partial | `App.tsx` | `memo` on 4 panels; no tab extract; `App.tsx` still monolithic |

### Architecture — Web Worker & canvas layers

| # | Item | Status | Hotspot | Deliverable |
|---|------|--------|---------|-------------|
| 13 | **Web Worker `gameTick`** | ✅ Done | `simWorker/`, `simBuffers/` | Opt-in (`VITE_USE_GAME_WORKER=1`); render SoA ping-pong, `WORKER_PROTO`, headless ticks; main-thread fallback unchanged |
| 14 | **OffscreenCanvas layers** | ✅ Done | `canvasLayer.ts`, `terrainLayer.ts`, `entityLayer.ts`, `renderer.ts` | Terrain tiles + decor (rivers/border) baked offscreen; dynamic entity bitmap cache; time-based flash overlay on main canvas; `resetRendererCaches()` on new game/load |
| 15 | **Version bump** | ❌ Open | `version.ts`, `saveLoad.ts` | `GAME_VERSION = '0.5.0'`; migrate from `0.4.2` |

### Scale target

**Design target:** **300 player humans** plus neighbors (~**1250** alive). Real play already smooth @ 200+; ship confidence comes from **manual play + Vitest**.

| Profile | Player humans | Alive entities (approx.) | How we judge |
|---------|---------------|---------------------------|--------------|
| Village | 50 | ~600 | Live play |
| Town | 100 | ~800 | Live play |
| City | **300** | **~1250** | Live play @ 5–10× + tabs open |

### Quality — bug audit, logic checks & playtest (P0)

*v0.5.0 is not perf-only — ship after correctness + **player-felt** scale, same spirit as the July 4 v0.4.2 bug-fix rounds.*

| # | Item | Status | Deliverable |
|---|------|--------|-------------|
| 16 | **Big bug checkup** | ✅ Done | Tracker closed for gameplay; focused Vitest; lint/build clean |
| 16b | **Dialogue-tree settler chat** | ✅ Done | `sim_dialogue_trees.json` (95 trees); `dialogueTrees.ts` + `humanChat.ts` |
| 16c | **Raid XP → elections** | ✅ Done | `rewardRaidParticipants`; Guard XP + leader rep |
| 16d | **Victory balance + Harmony fix** | ✅ Done | `VICTORY_TARGETS` raised; wild wolves only; Goals tab |
| 16e | **Walking trade caravans** | ✅ Done | `tradeCaravans.ts`; 7 routes; map lines |
| 17 | **Logical invariant checks** | ❌ Open | Focused tests / play checklist — entity maps, peace vs raids, migrate `0.4.2`→`0.5.0`, no ghost workers |
| 18 | **Manual matrix playtest** | ❌ Open | Large map + 10× matrix for v0.5 (**primary ship confidence**) |

**Reference:** v0.4.2 pass fixed welcomed-refugee deaths, peace vs raids, diplomacy event loss, eco streak — v0.5 re-verifies via **play + unit tests**.

---

## P1 — Should ship

*From [ROADMAP.md](ROADMAP.md) Top 10 audit — finishable gaps only; full content tracks stay post-0.5.0.*

| # | Item | Top 10 track | Notes |
|---|------|--------------|-------|
| 1 | **Outgoing raid march visuals** | #1 Defense | March line ✅ (orange raids / amber counter-raids in `renderer.ts`); **still open:** militia sprites to rival camp |
| 2 | **One visitor quest chain** | #6 Diplomacy | Scholars or Nomads multi-step |
| 3 | **Election Year 10/20 playtest** | #9 Culture | Ceremony shipped in code — verify live |
| 4 | **Reputation arc UI** | Village UX | Milestones beyond ⭐ tooltip |
| 5 | **Large-map playtests** | Infrastructure | 5–10 sessions at 10× (primary scale signal) |
| 6 | **Footstep / work SFX by surface** | Juice | Deferred since v0.4.2 |

#### Housing assignment (P1 — v0.5.0) ✅ Shipped in code

**Hotspot: `dayCycle.ts`, `populationGrowth.ts`, `buildingActions.ts`** — beds vs cap UI; `buildHousingUnits`, `getChildCustodian`, `ensureOrphanAdoption`, singles/orphan/shortage rules. Re-verify after perf refactors (item 17 logical invariants).

#### Election day ceremony (P1 — v0.5.0) ✅ Shipped in code

**Hotspot: `villageLeadership.ts`** — extended merit election (do not duplicate).

| Step | Status |
|------|--------|
| 0. One year before — notify + buildup gossip (`tickElectionBuildup`, `tickElectionGossip`) | ✅ |
| 1. Election year — hints/panel + ramped gossip | ✅ |
| 2. Gather at Town Hall (else map center) | ✅ |
| 3. Gossip phase (~1 game day) | ✅ |
| 4. Tension phase | ✅ |
| 5. Reveal — merit election + announcement | ✅ |
| 6. **3-day** *Election Revelry* festival | ✅ |
| Sitting head always in race (`getElectionRaceCandidates`) | ✅ |
| Incumbent record score — economy, scandals, village health; +8 positive cap | ✅ |
| Live playtest at Year 10/20 | ⏳ |

**Rules:** founding **first male** until Year 10; decennial merit elections; vacancy → election in **2 years** (no instant succession). Challengers can still win on personal merit.

---

## P2 — Stretch (only if P0 green before end July 2026)

| Item | Notes |
|------|-------|
| Adaptive catch-up / sim decimation at 10× | `gameLoop.ts` |
| Canvas LOD (trees, animals, sprites) | `renderer.ts` |
| Save-size report in Game menu | Heads-up before export |

---

## 🟡 Half-done registry (v0.5.0)

Open/partial rows also listed on public [ROADMAP.md](ROADMAP.md) v0.5.0 table.

| Feature | What works today | What's missing | Target |
|---------|------------------|----------------|--------|
| **Perf at ~1250 entities** | v0.4.2 throttles + maps + compaction + **spatial grid** ✅ — **200+ player humans plays well today** | Confirm feel @ ~300 in **manual** play | **v0.5.0** (P0) |
| **UI at 300 pop** | Partial memo | Tab split + denorm counts | **v0.5.0** (P0) |
| **Frontier outgoing raid** | *(v0.4.2 shipped)* incoming lines, forge, walls/guards, combat log | Tribute offer + accept/decline ✅ · **Outgoing** march line + militia sprites still **v0.5.0** (P1) |
| **Reputation arc** | *(v0.4.2 shipped)* ⭐ + Village explainer | Milestone beats UI | **v0.5.0** (P1) |
| **Visitor quest depth** | *(v0.4.1 shipped)* 7 kinds, leader talk, camp trade | **One** multi-step chain (Scholars or Nomads) | **v0.5.0** (P1) |
| **Election ceremony** | Buildup → revelry; incumbent record; gossip + winner chat tested ✅ in code | Live playtest Year 10/20 | **v0.5.0** (P1) ⏳ |
| **Settler dialogue** | JSON trees (95); 3-beat paired bubbles; legacy lines migrated ✅ | More trees / voice polish | **v0.5.0** ✅ |

---

## Exit criteria (ship v0.5.0)

- [ ] Remaining **P0** code polish merged; `npm run build` + `npm run lint` + `npm test` clean
- [x] **Bug checkup closed** for gameplay (import-cycle EI debt only)
- [ ] Focused **logical invariants** (tests or short checklist) + save migrate `0.4.2` → `0.5.0`
- [ ] Manual: large map, 60+ humans, 30 min at 5× — no sustained frame drops
- [ ] Manual: all 6 sidebar tabs @ **~300 player humans + rivals/visitors** — no &gt; 100 ms blocking feel
- [ ] CHANGELOG + `roadmapContent.ts` (`ROADMAP_TARGET_VERSION = '0.5.0'`) + Git tag `v0.5.0`

---

## Timeline (v0.4.2 shipped 2026-07-05 → v0.5.0 end July 2026)

| When | Milestone |
|------|-----------|
| **2026-07-06 – 2026-07-13** | **Finish partial** — renderer `byType`, go-home `buildingById`, grass buckets, benchmark gate; then spatial grid |
| **2026-07-14 – 2026-07-21** | Sim Phase 2 + UI — settler denorm, App tab split, partner map, pooling |
| **2026-07-22 – 2026-07-31** | Architecture — Web Worker + OffscreenCanvas; bug audit; playtest; P1 polish; **ship v0.5.0** |

---

## Next actions (ordered — **finish partial first**)

### 🟡 Finish partial (closest to done)

1. [x] **Renderer cache** — pass sim `byType` into render snapshot; stop `updateCachedEntities` full scan ✅
2. [ ] **`buildingById` go-home** — replace `updatedBuildings.find` in `lifeSimulation.ts` commute paths
3. [x] **Grass buckets** — spatial buckets in `drawGrass` (viewport cull via `buildGrassGrid`) ✅
4. [ ] **App tab split** — extend existing `memo` panels; extract Village / Nature / Progress from `App.tsx`
5. [x] **Dead-entity compaction** — `state.entities = allAlive` each tick ✅

### Remaining before tag

6. [x] Settler denorm · incremental `entityById` · partner map · spatial grid · worker · OffscreenCanvas · big bug checkup
7. [ ] **`buildingActions` scan cleanup** — maps instead of entity filters
8. [ ] **Particle / float pooling** (if still hot in play)
9. [ ] **Logic invariant checks** (focused tests / checklist)
10. [ ] **Manual matrix playtest** — large map, 10×, save/reload, raid/forge/peace, ecology, hotel, elections
11. [ ] Counter-raid militia sprites (P1)
12. [ ] Bump `GAME_VERSION` to `0.5.0` + migration + docs + tag (after playtest + invariants)

### When closing an item

1. Mark done in this file (or delete the row).
2. Add a bullet under [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` or the shipping version section.
3. Update [ROADMAP.md](ROADMAP.md) half-done registry + `roadmapContent.ts` if player-facing.

---

## Version lineage

| Version | Theme | Status |
|---------|-------|--------|
| 0.4.1 | Tribes, raids, victories, leadership | ✅ Shipped |
| 0.4.2 | Craft, walls/guards, juice, UI/UX | ✅ Shipped 2026-07-05 |
| **0.5.0** | **Scale + architecture** | 📋 **In progress — ship end July 2026** |

---

<p align="center">
  <em>v0.4.2 made the frontier defensible — v0.5.0 makes the whole valley playable at city scale.</em>
</p>