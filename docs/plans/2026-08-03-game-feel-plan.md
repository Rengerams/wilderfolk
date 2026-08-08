# Wilderfolk — Game Feel & Depth Plan

**Date:** 2026-08-03 · **Branch:** `main` · **Status:** Phase 0 + 1 done · Phase 2 done · Phase 3 in progress (3.1 done)
**Companion docs:** [continuation plan (archived)](../archive/2026-08-02-continuation-plan.md) (agent handoff + what's already done) · [landscape looks research](../private/landscape-looks-research.md) (private)

---

## 1. Summary

The micro-bug-fix wave is done. This plan turns the product analysis into ordered work: **fix what makes the sim feel broken → make the map pretty → make the economy readable → add depth → polish → engineering hygiene**. Every phase is shippable on its own; each task has a verification step. **Keep this file updated**: mark `[x]` when a task lands, move it into the continuation plan's "already done" list, and only start the next phase when the current one is verified.

### ✅ Completed (2026-08-03 — Phase 0 + Phase 1)

| Task | Commit |
|------|--------|
| 0.1 Notifications click-to-focus | `f44a22a` (+build fix `fc7cfb2`) |
| 0.2 Zoom-5 terrain LOD (2× bake) | `96bbeb9` |
| 0.3 Water shimmer + season juice | `763239b` |
| 1.1 Grid pathfinding (A*, 5 tests) | `8b8129b` |
| 1.2 Terrain atlas polish (variation, bevels, coasts) | `79b9a8f` |
| 1.3 Economy ledger ("Food this day") | `53709fa` |
| 2.2 Reputation consequences (prices + raids) | `284c465` |
| 2.3 Real visitor trade (group purses, no minted gold) | `284c465` |
| 2.1 Visitor quest chain (traveling smith) | `c825859` |
| 2.4 Building level visuals (gold trim / pennant) | `208f5f7` |
| 2.5 Election promises | `db9e8eb` |

**Next up:** Phase 3 — QoL & polish (multi-select workers, decorations/beauty, SFX, weather consequences). Playtest Phase 2 first (trade prices at your reputation, the smith quest, upgraded building look) and file what feels off.

### ✅ Phase 3 (in progress)

| Task | Commit |
|------|--------|
| 3.1 Multi-select workers (shift-click select + assign all at once) | `e572b6a` |

**Priority logic (impact ÷ effort):**
- Pathfinding first: it is a real bug (stuck citizens at map edges) *and* the single biggest sim/controls upgrade.
- Looks second: "the map reads like colored blocks" is the #1 visual complaint, plan already exists, ~1 day of sessions.
- Economy ledger third: best "I understand my game now" win for the player, low effort.
- Then content depth (quests, reputation, trade), then QoL/juice, then hygiene.

---

## 2. Phase 0 — Quick wins (each ≤ 1 session, do anytime)

| Task | What | Files | Verify |
|------|------|-------|--------|
| **Notification → focus** | Every toast clickable to jump the camera (alert-strip `Go →` actions already exist — reuse them for all notifications) | `App.tsx` (notification stack), `focusHints.ts` | Click any notification → camera moves to the subject |
| **Zoom-5 terrain LOD** | `terrainLayer` bakes at 2× resolution when zoom ≥ 3 so max zoom stops looking blocky | `terrainLayer.ts`, `renderer.ts` | Zoom to 5: ground still readable, no perf hitch |
| **Water + season juice** | River shimmer (2 alternating sprites), falling leaves in autumn, snow on roofs in winter, lit windows at night | `renderer.ts`, `terrainLayer.ts` | Each shows only in its season/condition |

## 3. Phase 1 — Core (the big three)

### 1.1 Pathfinding (top priority)

**Problem:** settlers/visitors move in straight lines and get stuck on rivers/mountains (linked to the player-reported "citizens standing at the map edge"). No pathfinding exists anywhere in the sim.

**Approach:**
- Build a **passability grid** once per world (land vs water/mountain from existing terrain data; reuse `isFootprintOnBuildableTerrain`/terrain helpers rather than inventing a new terrain source).
- Implement **A\*** (octile heuristic, small grid — maps are ~100–200 tiles, A* is cheap per request) with a per-tick memo so repeated requests to the same destination reuse the path.
- Integrate into the movement paths: `commuteHumanToBuilding`, `steerTo`, `steerVisitorToHotel`, construction-worker commute. Fall back to direct movement when no path exists (short hop) so nothing ever deadlocks.
- Entities walk waypoints; keep the existing speed/animation code.

**Verify:** a settler with a workplace across a river walks around it; the map-edge standing report is gone; `npm test` still green; playtest at 1× and 10× speed.

**Acceptance:** no citizen idles against water/mountain for more than a few ticks; no new per-tick cost visible at 200+ pop (memoized).

### 1.2 Landscape looks — Phase A (terrain atlas)

Follow `docs/private/landscape-looks-research.md` exactly: seamless grass/dirt/water tileset stamped in `bakeTerrainLayer`, autotile transitions for grass↔dirt and land↔water, keep the current stack (no engine switch). Art-first: generate/author 2–3 grass + dirt + sand + water tiles, then wire the baker.

**Verify:** new game looks "painted" not "blocky" at zoom 1–3; `npm run build` passes.

### 1.3 Economy ledger ("why is my food low?")

**Problem:** players can't tell where food comes from or goes; the Nature tab does this well for ecology, the economy has nothing.

**Approach:** a per-day sample (reuse the `STATS_SAMPLE_INTERVAL_TICKS` pattern in `tickLayerRealtime`) counting production vs consumption per category (farms, hunting/grazing, forage, forge/workshop use, settler meals, birth/death deltas). Display a compact "Food — produced vs eaten this day" breakdown in the **Village tab** (and a tooltip row for wood/stone/gold where cheap).

**Verify:** numbers sum to the actual daily resource delta (± rounding); playtest shows a clear "we eat X, we make Y" read.

## 4. Phase 2 — Depth (after Phase 1 is verified)

| Task | What | Files | Verify |
|------|------|-------|--------|
| **2.1 Visitor quest chain** | One small chain (e.g., traveling smith: 20 wood → free upgrade; or hunter: 3 wolf pelts → gold) with a visible quest card and completion reward | `groupEvents.ts` (new quest state), `App.tsx` (quest card), `tickLayerDaily.ts` | Quest spawns, completes, rewards; no spam |
| **2.2 Reputation consequences** | Tiered effects: ≥80 cheaper visitor trade + small rep gifts; ≤30 higher raid chance + trade penalties | `groupEvents.ts`, `frontierCombat.ts`, `uiSimSummary.ts` | Reputation UI explains the tier |
| **2.3 Real visitor trade** | Visitors buy/sell goods from storage (price list per kind; `Entity.gold` already exists — seed a purse at spawn, deduct on purchase) | `groupEvents.ts`, `buildingActions.ts`, `App.tsx` (trade panel) | Trade transfers gold both ways; no minted gold |
| **2.4 Building variety** | 2–3 sprite variants per building type, level-based (Lv.1 vs Lv.3 look different) | `public/sprites/`, `renderer.ts` | Upgraded buildings visibly change |
| **2.5 Election depth** *(optional)* | Officials make a campaign promise; fulfilling it grants reputation, breaking it a scandal | `villageLeadership.ts` | Election cycle shows promise + outcome |

## 5. Phase 3 — QoL & polish

| Task | What | Files | Verify |
|------|------|-------|--------|
| **3.1 Multi-select workers** | Shift-click to select multiple settlers; assign them to a building in one action | `App.tsx`, `useCanvasInteractions.ts`, `SelectedBuildingPanel.tsx` | Select 3 idle settlers → assign → all assigned |
| **3.2 Decorations / beauty** | Fences, gardens, statues, lamps; per-neighborhood "beauty" that nudges free-time destinations and small mood | `gameTypes.ts`, `buildCatalog.ts`, `lifeSimulation.ts` | Placed decor changes the map + a small happiness readout |
| **3.3 SFX** | Footstep/work/ambient work sounds by surface | `audio/` | Toggleable, unobtrusive |
| **3.4 Weather consequences** | Storm damages buildings slightly, drought hits farms harder (not just info) | `tickLayerDaily.ts`, `lifeSimulation.ts` | Weather has a visible, recoverable effect |

## 6. Phase 4 — Engineering hygiene (do not block phases 1–3 on this)

- **App.tsx split** (from continuation plan P1 #2) — extract `VisitorCampPanel`, `SelectedEntityPanel`, `BigNewsBanner`, `ActiveEventBanner`, `ShortcutsOverlay`; re-check chunk size after each move.
- **`structuredClone` delta pattern** in `buildingActions.ts` — only if actions hitch at 300+ pop (measure first with `scripts/perf-*.ts`).
- **Renames:** `homeBuildingId` → `workplaceBuildingId`; `entity.age` dual-use → `lifeYears`/`lifeDays` (combine with the werewolf age-drift fix in `gameTick.ts`).

---

## 7. Conventions & keeping this plan honest

- One task = one commit; message per repo convention (`feat:`/`fix:`/`docs:`), bug IDs when relevant.
- **When a task is done:** tick its checkbox here, add a one-line note to the continuation plan's "already done" list (with commit hash), and update `docs/README.md` only if the docs layout changes.
- **Before each commit:** `npm run lint` (0 errors), `npm run build` (passes, chunk warning is pre-existing), `npm test` (89 pass).
- Player-tested features get a playtest note in the continuation plan's P4 section; do not mark "verified" without the player having seen it.
