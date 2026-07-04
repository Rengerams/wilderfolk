# Wilderfolk Roadmap — v0.5.0

**Target:** **End of July 2026** · **Prerequisite:** [v0.4.2](ROADMAP.md) shipped (`GAME_VERSION = 0.4.2`)

Living plan for the **consolidated scale & architecture** release.  
**Parent index** → [ROADMAP.md](ROADMAP.md) · Technical → [TECHNICAL.md](TECHNICAL.md) · Changelog → [CHANGELOG.md](CHANGELOG.md)

*Updated: 2026-07-05 — v0.4.2 shipped; **v0.5.0** target **end July 2026**.*

---

## One-line pitch

**v0.5.0 makes Wilderfolk scale and trustworthy** — spatial indexing, lean entity lists, render/UI polish, Web Worker simulation, canvas layers, and a **full bug + logic + simulation audit** so large-map towns at 10× feel smooth *and* correct.

---

## North star (this version)

Players on **large maps** with **100–200+ settlers** should not feel sim hitch, UI freeze, or mystery lag when they zoom out, speed up, or let a decade pass. Performance work must stay **invisible** — same food chain, same raids, same prep-focused combat — just scalable.

**Winning moment:** *"I hit 150 people on a large map, opened every sidebar tab at 10×, and the valley still felt alive — no stutter."*

---

## Why v0.5.0 exists (accelerated)

| v0.4.2 delivered | v0.5.0 closes the gap |
|------------------|----------------------|
| Off-screen throttles, `entityById` / `buildingById`, `wildlifeCounts` | Hot paths still **O(n)** — graze scans, flee loops, UI population scans |
| Headless avg ~1.8 ms/tick @ ~550 entities | **p95** and **large-map / city UI** not gated |
| Partial React memo on a few panels | `App.tsx` still re-renders heavy tabs; assign flows scan all entities |
| Perf work was planned across multiple releases | **Single v0.5.0 ship (end July 2026)** — sim Phase 1 + Phase 2 + Worker/layers |
| ~40-fix bug pass in v0.4.2; headless sims for balance | **No v0.5-wide regression gate** — logic invariants + multi-profile sim battery not yet required to ship |

---

## Scope rule

| Label | Meaning |
|-------|---------|
| **P0** | Must ship in v0.5.0 — blocks version bump |
| **P1** | Should ship — polish that fits the scale milestone |
| **P2** | Stretch — only if P0 is green before **end July 2026** ship |
| **Defer** | Explicitly **post-0.5.0** |

---

## P0 — Must ship (end July 2026)

### Sim & render — Phase 1

| # | Item | Hotspot | Deliverable |
|---|------|---------|-------------|
| 1 | **Spatial grid** | `lifeSimulation.ts` | Cell-based graze/hunt/flee/wolf-pack queries |
| 2 | **Dead-entity compaction** | `gameEngine.ts` | Drop `alive: false` from `state.entities` each tick |
| 3 | **Renderer cache reuse** | `renderer.ts` | Reuse sim `byType`; stop parallel rebuilds every frame |
| 4 | **Settler count denorm** | `WorldState`, `App.tsx` | `workingSettlers` / `idleSettlers` once per tick |
| 5 | **Benchmark gate** | `simulate-30min.ts` | Profiles at **50 / 100 / 200** humans; exit non-zero if p95 &gt; budget |

### Sim & UI — Phase 2

| # | Item | Hotspot | Deliverable |
|---|------|---------|-------------|
| 6 | **Incremental `entityById`** | `gameEngine.ts` | Update on birth/death only |
| 7 | **`buildingActions` scan cleanup** | `buildingActions.ts` | Maps + `villageCounts` instead of entity filters |
| 8 | **`buildingById` go-home** | `lifeSimulation.ts` | Drop `updatedBuildings.find` on commute |
| 9 | **Grass render buckets** | `renderer.ts` `drawGrass` | Spatial cull for large maps |
| 10 | **Partner id map** | `renderer.ts` | O(1) relationship-line lookup |
| 11 | **Particle / float pooling** | `gameEngine.ts` | Reuse death particles + `floatingTexts` |
| 12 | **App tab split / memo** | `App.tsx` | `VillageTab` / `NatureTab` / `ProgressTab` + `React.memo` |

### Architecture — Web Worker & canvas layers

| # | Item | Hotspot | Deliverable |
|---|------|---------|-------------|
| 13 | **Web Worker `gameTick`** | `gameEngine.ts`, `gameLoop.ts` | Serializable state contract; sim off main thread |
| 14 | **OffscreenCanvas layers** | `renderer.ts` | Split terrain (static) vs entities (dynamic) |
| 15 | **Version bump** | `version.ts`, `saveLoad.ts` | `GAME_VERSION = '0.5.0'`; migrate from `0.4.2` |

### Benchmark budgets

| Profile | Humans (approx.) | p95 budget |
|---------|------------------|------------|
| Village | 50 | &lt; 16 ms/tick |
| Town | 100 | &lt; 16 ms/tick |
| City stress | 200 | &lt; 20 ms/tick (document if missed) |

Run: `npm run simulate:30min` with `SIM_PROFILE=village|town|city`.

### Quality — bug audit, logic checks & simulation gates (P0)

*v0.5.0 is not perf-only — ship only after a deliberate correctness pass, same spirit as the July 4 v0.4.2 comprehensive bug-fix rounds.*

| # | Item | Deliverable |
|---|------|-------------|
| 16 | **Big bug checkup** | Full-code audit: frontier/diplomacy, save/load, raids, forge, prison, visitors, eco streaks, UI dead-ends; fix + document in CHANGELOG |
| 17 | **Logical invariant checks** | Assert or test: entity lifecycle (birth/death/compaction), `entityById`/`buildingById` consistency, peace vs active raids, migration round-trip `0.4.2`→`0.5.0`, no ghost workers/prisoners |
| 18 | **20-year simulation gatekeeper** | **`npm run simulate:20year`** (town profile) — **primary v0.5 ship blocker**; exit 0 required to tag. 172800 ticks, 20 winters, Y20 pop gate |
| 19 | **Headless simulation battery** | All green before tag: `npm run build` · `npm run lint` · `npm run simulate` · `npm run simulate:30min` (village/town/city) · **`npm run simulate:20year`** · `npm run simulate:10year` (regression) · `npm run balance:militia` |
| 20 | **Simulation regression gate** | Headless scripts exit non-zero on invariant fail (pop negative, food NaN, orphaned raids, challenge regressions); document env vars in TECHNICAL.md |
| 21 | **Manual matrix playtest** | Large map + 10× + save/reload + raid respond + forge queue + peace treaty + year-10/20 spot-check; notes in playtest doc or [TECHNICAL.md](TECHNICAL.md#dev-log) |

**Reference:** v0.4.2 pass fixed welcomed-refugee deaths, peace vs raids, diplomacy event loss, eco streak 24×/year — v0.5 must re-verify these paths after perf refactors.

---

## P1 — Should ship

| # | Item | Notes |
|---|------|-------|
| 1 | **Counter-raid militia march** | Line + sprites to rival camp; abstract resolve stays |
| 2 | **Large-map playtests** | 5–10 sessions at 10× after benchmark gate green |
| 3 | **Reputation arc UI** | Milestones beyond ⭐ tooltip |
| 4 | **Footstep / work SFX by surface** | Juice deferred since v0.4.2 |
| 5 | **One visitor quest chain** | Scholars or Nomads multi-step |
| 6 | **`npm run benchmark:gate`** | CI-friendly wrapper |

---

## P2 — Stretch (only if P0 green before end July 2026)

| Item | Notes |
|------|-------|
| Adaptive catch-up / sim decimation at 10× | `gameLoop.ts` |
| Canvas LOD (trees, animals, sprites) | `renderer.ts` |
| Save-size report in Game menu | Heads-up before export |

---

## Defer — post-0.5.0

| Item | Reason |
|------|--------|
| Real-time tactical map battles | Abstract raids stay |
| Installer / Steam release | Separate distribution milestone |
| Full tribal wars, sieges, embassies, player caravans | Content track |
| Fog of war / map expansion scouts | Content track |
| Hospital disease loop, wardogs | Content track |
| Multiplayer | post-1.0 |

---

## 🟡 Half-done registry (v0.5.0)

| Feature | What works today | What's missing | Target |
|---------|------------------|----------------|--------|
| **Perf at 500+ entities** | v0.4.2 throttles + maps | Grid + compaction + gate + Worker | **FINISH** v0.5.0 P0 |
| **UI at 150+ pop** | Partial memo | Tab split + denorm counts | **FINISH** v0.5.0 P0 |
| **Frontier counter-raid visuals** | `flashMilitia` + float text | March line to rival camp | **FINISH** v0.5.0 P1 |
| **Reputation arc** | ⭐ + Village explainer | Milestone beats UI | **FINISH** v0.5.0 P1 |

---

## Exit criteria (ship v0.5.0)

- [ ] All **P0** items merged; `npm run build` + `npm run lint` clean
- [ ] **Bug checkup closed** — no known P0/P1 regressions; fixes logged in CHANGELOG `[0.5.0]`
- [ ] **`npm run simulate:20year` PASS** — town profile, all applicable gates (primary ship gatekeeper)
- [ ] **Logic + sim battery green** — `simulate`, `simulate:30min` (all profiles), `simulate:10year` (regression), `balance:militia` pass; invariants documented
- [ ] Benchmark gate passes **village** and **town** profiles
- [ ] Manual: large map, 60+ humans, 30 min at 5× — no sustained frame drops
- [ ] Manual: all 6 sidebar tabs @ 150 humans — no &gt; 100 ms blocking feel
- [ ] Save migration `0.4.2` → `0.5.0` tested
- [ ] CHANGELOG + [TECHNICAL.md](TECHNICAL.md#dev-log) + `roadmapContent.ts` (`ROADMAP_TARGET_VERSION = '0.5.0'`)
- [ ] Git tag `v0.5.0`

---

## Timeline (v0.4.2 shipped 2026-07-05 → v0.5.0 end July 2026)

| When | Milestone |
|------|-----------|
| **2026-07-06 – 2026-07-13** | Sim Phase 1 — spatial grid + compaction |
| **2026-07-14 – 2026-07-21** | Sim Phase 2 + UI — renderer denorm, App tab split, benchmark profiles |
| **2026-07-22 – 2026-07-31** | Architecture — Web Worker + OffscreenCanvas; bug audit + sim battery; P1 polish; **ship v0.5.0** |

---

## Next actions (ordered)

1. [ ] Add `spatialGrid.ts` + wire flee/hunt (`USE_SPATIAL_GRID`)
2. [ ] Dead-entity compaction in `gameTick`
3. [ ] `simulate-30min.ts` profiles + p95 exit code
4. [ ] Renderer cache + `villageCounts` denorm
5. [ ] Incremental `entityById`; `buildingActions` + go-home cleanup
6. [ ] Grass buckets + partner map + pooling
7. [ ] Extract Village / Nature / Progress tabs from `App.tsx`
8. [ ] Web Worker `gameTick` contract + OffscreenCanvas split
9. [ ] Counter-raid march line (P1)
10. [ ] **Big bug checkup** — audit frontier, save, raids, forge, eco, UI; fix regressions from perf refactors
11. [ ] **Logic checks** — entity maps, migration round-trip, peace/raid invariants
12. [ ] **`npm run simulate:20year` PASS** — town profile; log to `scripts/logs/sim-20year-town-*.txt`
13. [ ] **Simulation battery** — remaining headless scripts + exit codes; manual large-map matrix
14. [ ] Bump `GAME_VERSION` to `0.5.0` + migration + docs + tag (only after step 12 green)

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