# Wilderfolk Roadmap — v0.4.3

**Target:** September 2026 · **Prerequisite:** [v0.4.2](ROADMAP.md) shipped (`GAME_VERSION = 0.4.2`)

Living plan for the **performance & scale** release.  
**Parent index** → [ROADMAP.md](ROADMAP.md) (version chain & phases) · **Next** → [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) · Open work → [app/TODO.md](app/TODO.md) · Technical → [TECHNICAL.md](TECHNICAL.md)

*Created: July 4, 2026 · **v0.4.3** not started — design doc only*

---

## One-line pitch

**v0.4.3 makes large valleys playable** — spatial indexing, leaner entity lists, shared sim/render caches, and a benchmark gate so 100+ settlers and 500+ entities stay under budget.

---

## North star (this version)

Players on **large maps** with **growing villages** should not feel the sim hitch when they zoom out, speed up to 5–10×, or let a decade pass. Performance work must be **invisible** — same food chain, same raids, same UI — just smoother.

**Winning moment for a returning player:** *"I hit 80 people on a large map, ran 10× for a season, and the valley still felt alive — no stutter, no mystery lag."*

---

## Why v0.4.3 exists

| v0.4.2 delivered | v0.4.3 closes the gap |
|------------------|----------------------|
| Off-screen throttles, `entityById` / `buildingById`, `wildlifeCounts` | Hot paths still **O(n)** per tick (graze scans, flee loops, full entity filters) |
| Headless avg ~1.8 ms/tick @ ~550 entities | **p95** and **large-map** cases not gated; population milestones untested |
| UI memo on a few panels | `App.tsx` still re-renders heavy tabs on every tick |
| "Perf at 500+ entities" marked **partial** | Phase 1 perf was always scoped to **v0.4.3** |

v0.4.2 throttles bought time. v0.4.3 **changes data structures** so throttles are a safety net, not the main strategy.

---

## Scope rule

| Label | Meaning |
|-------|---------|
| **P0** | Must ship in v0.4.3 — blocks version bump |
| **P1** | Should ship — gameplay polish that fits the perf milestone |
| **P2** | Stretch — only if P0 is green by mid-August 2026 |
| **Defer** | Explicitly **v0.4.4** or later — do not slip into v0.4.3 |

**Do not ship new 🟡 partial features** without a row in the half-done table below.

---

## P0 — Performance Phase 1 (must ship)

*Finish by: **September 2026** · Informal budget: **p95 &lt; 16 ms/tick**, **avg &lt; 8 ms/tick** @ ~700 alive entities (headless).*

| # | Item | Hotspot | Deliverable |
|---|------|---------|-------------|
| 1 | **Spatial grid** | `lifeSimulation.ts` — graze, hunt, flee, wolf pack | Cell-based neighbor queries; no full-map grass/prey scans per entity |
| 2 | **Dead-entity compaction** | `gameEngine.ts` | Remove `alive: false` from `state.entities` each tick (or on death batch); stable ids via `entityById` refresh |
| 3 | **Renderer cache reuse** | `renderer.ts` `updateCachedEntities()` | Reuse sim `byType` buckets; stop rebuilding parallel entity lists every frame |
| 4 | **Settler count denorm** | `WorldState`, `entityCounts.ts`, `App.tsx` | `workingSettlers` / `idleSettlers` (or `villageCounts`) updated once per tick — no population scans in UI |
| 5 | **Benchmark gate** | `app/scripts/simulate-30min.ts` | Milestone runs at **50 / 100 / 200** humans; exit non-zero if p95 &gt; budget; document env vars in TECHNICAL.md |
| 6 | **Version bump** | `version.ts`, `saveLoad.ts` | `GAME_VERSION = '0.4.3'`; migrate from `0.4.2`; add to `COMPATIBLE_SAVE_VERSIONS` |

### Spatial grid — implementation notes

```
Suggested module: app/src/game/spatialGrid.ts
- Fixed cell size (e.g. 64–128 world units)
- insert / remove / queryRadius / queryCell
- Rebuild or incrementally update each tick from alive entities + grass patches
Consumers (order):
  1. Prey flee (nearest predator in radius)
  2. Predator hunt target pick
  3. Wolf pack bonus neighbor count
  4. Grass graze pressure (deer/rabbit → grass in cell)
```

**Non-goals for grid in v0.4.3:** road pathfinding, building placement overlap (keep existing footprint checks).

### Benchmark gate — acceptance

| Milestone | Humans (approx.) | Entities (approx.) | p95 budget |
|-----------|------------------|--------------------|------------|
| Village | 50 | ~350 | &lt; 16 ms |
| Town | 100 | ~500 | &lt; 16 ms |
| City stress | 200 | ~700+ | &lt; 20 ms (stretch; document if missed) |

Run: `npm run simulate:30min` with seeded configs per milestone (add `SIM_PROFILE=village|town|city`).

---

## P1 — Gameplay & polish (should ship)

| # | Item | Rationale | Target files |
|---|------|-----------|--------------|
| 1 | ~~**10-year balance pass**~~ | **Done in v0.4.2** (2026-07-04 town PASS — `simulate-10year.ts`, 9/9 gates) | `app/scripts/simulate-10year.ts` |
| 2 | **External playtests (5–10)** | Run on **large map + 10×** builds after benchmark gate is green | Chronicle `.txt` feedback |
| 3 | **Counter-raid militia march** | Frontier combat gap — player sees militia move toward rival camp before abstract resolve | `lifeSimulation.ts`, `renderer.ts`, `frontierCombat.ts` |
| 4 | **Spear tier balance review** | Iron replaces stone (not stacked) — validate militia preview matches 10-year sims | `frontierCombat.ts`, `CombatPreviewPanel.tsx` |
| 5 | **Perf UX** | Show optional debug overlay (dev flag): ms/tick, entity count, grid rebuild time | `gameLoop.ts`, `App.tsx` (dev only) |

---

## P2 — Stretch (if P0 done early)

| Item | Notes |
|------|-------|
| Footstep / work SFX by surface | Deferred from v0.4.2 juice pass |
| One visitor kind quest depth | e.g. Traders — repeat visit bonus or escort mini-event |
| `npm run benchmark:gate` script | Thin wrapper CI can call (profiles + exit codes) |
| Large-map grass render LOD | Light version of v0.4.4 grass buckets — only if renderer still hot after cache reuse |

---

## Defer — not v0.4.3

| Item | Target version | Reason |
|------|----------------|--------|
| Incremental `entityById` (birth/death only) | v0.4.4 | Phase 2 — needs compaction stable first |
| `buildingActions.ts` entity scan cleanup | v0.4.4 | Assign/recruit paths |
| `buildingById` for human go-home | v0.4.4 | `lifeSimulation.ts` |
| Grass render spatial buckets (full) | v0.4.4 | Renderer pass 2 |
| Partner id map for relationship lines | v0.4.4 | `renderer.ts` |
| Particle / floating-text pooling | v0.4.4 | `gameEngine.ts` |
| Memoize Village / Nature / Progress tab bodies | v0.4.4 | `App.tsx` split |
| Web Worker `gameTick` | v0.5.0 | Architecture change |
| OffscreenCanvas terrain/entity layers | v0.5.0 | Canvas layers |
| Real-time tactical map battles | post-0.4.x | Abstract raids stay |
| Hospital disease loop, wardogs, fog of war | post-0.4.x | Content tracks |

---

## 🟡 Half-done registry (v0.4.3)

| Feature | What works today | What's missing | Decision | Target |
|---------|------------------|----------------|----------|--------|
| **Perf at 500+ entities** | v0.4.2 throttles + maps | Spatial grid + compaction + gate | **FINISH** | v0.4.3 |
| **Frontier counter-raid visuals** | `flashMilitia` + float text | March line + sprites to rival camp | **FINISH** | v0.4.3 P1 |
| **10-year balance** | Scripted 10-year sim + winter/raid gates | Town PASS 2026-07-04 | **Done** | v0.4.2 |
| **Reputation arc UI** | ⭐ badge + Village explainer | Story beats / milestones UI | **DEFER** | v0.4.4 |

---

## Exit criteria (ship v0.4.3)

- [ ] All **P0** items merged; `npm run build` + `npm run lint` clean
- [ ] Benchmark gate passes **village** and **town** profiles (p95 &lt; 16 ms)
- [ ] Manual playtest: **large map**, 60+ humans, 30 min at 5× — no sustained frame drops
- [ ] Save migration `0.4.2` → `0.4.3` tested (load old save, one tick, save, reload)
- [ ] [CHANGELOG.md](app/CHANGELOG.md) + [SESSION_SUMMARY.md](SESSION_SUMMARY.md) updated
- [ ] In-game roadmap slice updated (`roadmapContent.ts` — `ROADMAP_TARGET_VERSION = '0.4.3'`)

**Exit narrative:** A player can grow a **large-map** town through **multiple seasons** without performance becoming the reason they quit.

---

## Timeline (solo, part-time)

| When | Milestone |
|------|-----------|
| **Jul 2026** | Ship **v0.4.2** (balance, playtests, version bump) |
| **Aug 2026** | Spatial grid + compaction land; benchmark profiles added |
| **Sep 2026** | Renderer cache + UI denorm; gate green; P1 polish; ship **v0.4.3** |
| **Nov 2026** | Ship **[v0.4.4](ROADMAP_0.4.4.md)** — Phase 2 perf + App tab split |

---

## What ships in v0.4.4 (after this release)

Full plan → **[ROADMAP_0.4.4.md](ROADMAP_0.4.4.md)** · Index → [ROADMAP.md](ROADMAP.md)

| Track | v0.4.4 P0 highlights |
|-------|---------------------|
| **Sim polish** | Incremental `entityById`; `buildingById` go-home; `buildingActions` scan cleanup |
| **Render** | Grass spatial buckets; partner id map; particle / float pooling |
| **UI** | Split `App.tsx` tabs (Village / Nature / Progress) + memo |
| **Content P1** | Reputation arc UI; footstep SFX; one visitor quest chain |

Items listed under **Defer — not v0.4.3** below are the v0.4.4 P0 backlog — do not pull them into v0.4.3 unless the benchmark gate is green early **and** v0.4.2/0.4.3 ship dates slip.

---

## Next actions (ordered)

1. [x] Ship v0.4.2 and tag baseline for perf comparison
2. [ ] Add `spatialGrid.ts` + unit-style sanity test (query radius correctness)
3. [ ] Wire grid into flee/hunt in `lifeSimulation.ts` (feature flag `USE_SPATIAL_GRID`)
4. [ ] Dead-entity compaction in `gameTick` with `entityById` rebuild
5. [ ] `simulate-30min.ts` profiles: `village` / `town` / `city` + exit code on p95 fail
6. [ ] Renderer: consume sim `byType` in `updateCachedEntities`
7. [ ] `villageCounts` on `WorldState` — working/idle adults per tick
8. [ ] Counter-raid march line (P1)
9. [x] 10-year balance script (`simulate-10year.ts` — town PASS 2026-07-04)
10. [ ] Bump `GAME_VERSION` to `0.4.3` + migration + docs

---

## Metrics (v0.4.3 exit)

| Metric | Target |
|--------|--------|
| Headless p95 @ town profile (~100 humans) | &lt; 16 ms/tick |
| Headless avg @ town profile | &lt; 8 ms/tick |
| Large-map session @ 5×, 30 min | No user-reported "unplayable lag" in playtests |
| Playtest session length | 60+ minutes (perf no longer caps session) |
| Crashes per 10h | 0 |

---

## Version lineage

| Version | Theme | Status |
|---------|-------|--------|
| 0.4.1 | Tribes, raids, victories, leadership | ✅ Shipped |
| 0.4.2 | Craft, walls/guards, juice, UI/UX | ✅ Shipped Jul 2026 |
| **0.4.3** | **Scale & perf Phase 1** | 📋 This document |
| **0.4.4** | **Perf Phase 2 + UI split** | 📋 [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) |
| 0.5.0 | Web Worker + canvas layers | Planned Q1 2027 |

---

<p align="center">
  <em>v0.4.2 makes the frontier defensible — v0.4.3 makes the valley scalable.</em>
</p>