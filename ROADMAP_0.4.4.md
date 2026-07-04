# Wilderfolk Roadmap — v0.4.4

**Target:** November 2026 · **Prerequisite:** [v0.4.3](ROADMAP_0.4.3.md) shipped (`GAME_VERSION = 0.4.3`)

Living plan for **perf Phase 2 & UI maintainability**.  
**Parent index** → [ROADMAP.md](ROADMAP.md) (version chain & phases) · **Prior** → [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) · Open work → [app/TODO.md](app/TODO.md)

*Created: July 4, 2026 · **v0.4.4** not started — design doc only*

---

## One-line pitch

**v0.4.4 polishes the hot paths v0.4.3 left behind** — incremental maps, fewer UI scans, render buckets, object pooling, and a slimmer `App.tsx` so 10× speed and 200+ humans feel crisp on large maps.

---

## North star (this version)

v0.4.3 fixed the **worst O(n) sim loops**. v0.4.4 fixes **death-by-a-thousand scans** — assign flows, go-home lookups, grass draw, relationship lines, and React re-renders that still spike when the village is big.

**Winning moment:** *"I opened every sidebar tab at 150 population and the UI didn't freeze — the map still ran smooth at 10×."*

---

## Why v0.4.4 exists

| v0.4.3 delivers | v0.4.4 closes the gap |
|-----------------|----------------------|
| Spatial grid + compaction + benchmark gate | Per-tick **full** `entityById` rebuild still costly at high churn |
| Renderer reuses sim `byType` | `drawGrass` still draws all patches; partner lines still `.find()` humans |
| `villageCounts` denorm | `buildingActions` still filters all entities on assign/recruit |
| Counter-raid march (P1) | Reputation arc, visitor depth still shallow |

Phase 1 made the sim **correct at scale**. Phase 2 makes **every touch point** scale-aware.

---

## Scope rule

| Label | Meaning |
|-------|---------|
| **P0** | Must ship in v0.4.4 — blocks version bump |
| **P1** | Should ship — UX / content that fits maintainability milestone |
| **P2** | Stretch — only if P0 green by mid-October 2026 |
| **Defer** | Explicitly **v0.5.0** or later |

---

## P0 — Performance Phase 2 (must ship)

*Finish by: **November 2026** · Budget: hold v0.4.3 gate; **UI tab open** &lt; 50 ms @ 150 humans (manual profile).*

| # | Item | Hotspot | Deliverable |
|---|------|---------|-------------|
| 1 | **Incremental `entityById`** | `gameEngine.ts` | Update map on birth/death only; no full rebuild each tick |
| 2 | **`buildingActions` scan cleanup** | `buildingActions.ts` | Replace ~20 `filter`/`find` over `entities` with `entityById`, `buildingById`, `villageCounts` |
| 3 | **`buildingById` go-home** | `lifeSimulation.ts` | Drop `updatedBuildings.find` on commute / sleep paths |
| 4 | **Grass render buckets** | `renderer.ts` `drawGrass` | Spatial buckets; cull off-screen / low-zoom patches |
| 5 | **Partner id map** | `renderer.ts` ~L1290 | O(1) partner lookup for relationship lines |
| 6 | **Particle / float pooling** | `gameEngine.ts` | Reuse death particles + `floatingTexts` slots |
| 7 | **App tab split / memo** | `App.tsx` | Extract Village / Nature / Progress bodies; `React.memo` + stable props |
| 8 | **Version bump** | `version.ts`, `saveLoad.ts` | `GAME_VERSION = '0.4.4'`; migrate from `0.4.3` |

### App.tsx split — suggested modules

```
app/src/components/tabs/
  VillageTab.tsx      — focus, population, leadership, armament
  NatureTab.tsx       — ecosystem, wildlife, grazing pressure
  ProgressTab.tsx     — research / trade / goals shell + subnav
```

Keep raid/diplomacy in existing `FrontierPanel`; Log/Guide unchanged.

### Benchmark — Phase 2 additions

Extend `simulate-30min.ts`:

| Profile | Extra check |
|---------|-------------|
| `city` (200 humans) | p95 &lt; 20 ms (same as v0.4.3 stretch) |
| `churn` | High birth/death rate 5 in-game years — incremental map must not regress |

---

## P1 — UX & content (should ship)

| # | Item | Rationale | Target files |
|---|------|-----------|--------------|
| 1 | **Reputation arc UI** | Deferred from v0.4.3 — milestones beyond ⭐ tooltip | `App.tsx`, `focusHints.ts`, new `ReputationPanel.tsx` |
| 2 | **Footstep / work SFX by surface** | Juice deferred since v0.4.2 | `src/audio/`, `lifeSimulation.ts` |
| 3 | **One visitor quest chain** | Second visitor kind depth (e.g. Scholars or Nomads) | `groupEvents.ts` |
| 4 | **`npm run benchmark:gate`** | CI-friendly wrapper if not shipped in v0.4.3 | root `package.json`, `app/scripts/` |
| 5 | **Perf overlay polish** | Dev overlay: pool stats, bucket rebuild ms | `gameLoop.ts` |

---

## P2 — Stretch

| Item | Notes |
|------|-------|
| Light **App.tsx** route for inspector sub-panels | Further split `EntityPanel` / building inspectors |
| Grass sim buckets (not just render) | Mirror render grid in graze if still hot |
| Save-size report in Game menu | Heads-up before export; no log cap change |
| Desktop dev build script stub | Prep for post-alpha installer track |

---

## Defer — not v0.4.4

| Item | Target | Reason |
|------|--------|--------|
| Web Worker `gameTick` | v0.5.0 | Requires serializable state contract |
| OffscreenCanvas terrain/entity layers | v0.5.0 | Canvas architecture |
| Adaptive catch-up at 10× | v0.5.0 | `gameLoop.ts` |
| Canvas LOD (trees, animals, sprites) | v0.5.0 | Renderer layers |
| Append-only event log index | v0.5.0 | Only if save size forces it |
| Real-time tactical battles | post-0.4.x | Abstract raids |
| Hospital disease, wardogs, fog of war | post-0.4.x | Content |
| Multiplayer | post-1.0 | |

---

## 🟡 Half-done registry (v0.4.4)

| Feature | What works today | What's missing | Decision | Target |
|---------|------------------|----------------|----------|--------|
| **UI at 150+ pop** | Partial memo on a few panels | Full tab split + memo | **FINISH** | v0.4.4 P0 |
| **Assign / recruit perf** | `buildingById` exists | `buildingActions` still scans entities | **FINISH** | v0.4.4 P0 |
| **Grass on large maps** | Low-zoom skip partial | Full spatial buckets in `drawGrass` | **FINISH** | v0.4.4 P0 |
| **Reputation arc** | ⭐ + Village explainer | Milestone beats / UI | **FINISH** | v0.4.4 P1 |
| **Visitor quest depth** | Leader talk per kind | Multi-step chain | **FINISH** one kind | v0.4.4 P1 |

---

## Exit criteria (ship v0.4.4)

- [ ] All **P0** items merged; `npm run build` + `npm run lint` clean
- [ ] Benchmark **city** profile passes or documented waiver with issue link
- [ ] Manual: open all 6 sidebar tabs @ 150 humans — no &gt; 100 ms blocking feel
- [ ] Assign worker to farm @ 200 humans — no perceptible lag
- [ ] Save migration `0.4.3` → `0.4.4` tested
- [ ] CHANGELOG + SESSION_SUMMARY + `roadmapContent.ts` (`ROADMAP_TARGET_VERSION = '0.4.4'`)

**Exit narrative:** The codebase is **maintainable at city scale** — sim and UI both respect population growth.

---

## Timeline (solo, part-time)

| When | Milestone |
|------|-----------|
| **Sep 2026** | Ship **v0.4.3** |
| **Oct 2026** | Incremental maps + `buildingActions` + go-home paths |
| **Nov 2026** | Grass buckets + App split + pooling; ship **v0.4.4** |
| **Q1 2027** | [v0.5.0](ROADMAP.md) — Web Worker + canvas layers |

---

## Next actions (ordered)

1. [ ] Ship v0.4.3; capture benchmark baseline JSON for comparison
2. [ ] Incremental `entityById` on birth/death hooks in `gameEngine.ts`
3. [ ] Audit `buildingActions.ts` — list every `entities.filter`; replace with maps
4. [ ] `lifeSimulation.ts` — `buildingById.get(residenceBuildingId)` for go-home
5. [ ] `drawGrass` spatial buckets + viewport cull
6. [ ] Partner `Map<humanId, partnerId>` in renderer cache pass
7. [ ] Pool `floatingTexts` + death particles (cap + reuse)
8. [ ] Extract `VillageTab` / `NatureTab` / `ProgressTab` from `App.tsx`
9. [ ] Reputation arc UI (P1)
10. [ ] Bump `GAME_VERSION` to `0.4.4` + migration + docs

---

## Metrics (v0.4.4 exit)

| Metric | Target |
|--------|--------|
| Headless p95 @ city profile (~200 humans) | &lt; 20 ms/tick |
| Sidebar tab switch @ 150 humans | &lt; 50 ms perceived |
| `buildingActions` assign path | 0 full-entity scans |
| Crashes per 10h | 0 |

---

## Version lineage

| Version | Theme | Status |
|---------|-------|--------|
| 0.4.2 | Craft, walls/guards, juice, UI/UX | ✅ Shipped Jul 2026 |
| 0.4.3 | Scale & perf Phase 1 | 📋 [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) |
| **0.4.4** | **Perf Phase 2 + UI split** | 📋 This document |
| 0.5.0 | Web Worker + canvas layers | Planned Q1 2027 |

---

<p align="center">
  <em>v0.4.3 scales the sim — v0.4.4 scales everything that touches it.</em>
</p>