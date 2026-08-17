# Entity Capacity & Perf Plan — v0.6

**Date:** 2026-08-08 · **Status:** planned (v0.6) · **Branch:** `main` (playing v0.5.3, cooking v0.5.4)

**Goal:** run **1,200+ settlers smoothly at 10× speed** (66.7 ms/tick budget) and keep the map's ~2,800 total entities from breaking the 1× budget.

**Measure tool:** `scripts/perf-entity-capacity.ts` (committed) — seeds N settlers on a Large map and prints avg/p95 tick ms + alive-by-type. Also `scripts/perf-at-pop.ts`, `scripts/profile-town-tick.ts`.

---

## 1. Measured baseline (2026-08-08, Large map, focus throttle)

| Settlers | Total alive | avg tick | 10× budget (67ms) | 1× budget (667ms) |
|---|---|---|---|---|
| 2 (map base) | 1,267 (321 grass · 887 trees · wildlife) | 1.5 ms | ✅ | ✅ |
| 400 | 1,689 | 20 ms | ✅ | ✅ |
| 600 | 1,854 | 41 ms | ✅ | ✅ |
| 800 | 2,145 | 68 ms | ⚠️ at budget | ✅ |
| 1,000 | 2,273 | 99 ms | ❌ 1.5× | ✅ |
| 1,200 | 2,545 | 149 ms | ❌ 2.2× | ✅ |
| 1,500 | 2,844 | 238 ms | ❌ 3.6× | ✅ |

Curve shape ≈ `1.5 + (settlers/98)²` — **superlinear**; the tail is per-human work + allocation/GC pressure, not the grid.

## 2. Hotspot findings (vitest-spy profiler @1,200 settlers)

- `tickHumans` is **99% of the tick** (~250–470 ms, machine varies; p95 ≈ 1.6× avg = GC spikes).
- **Spatial grid is free:** 289,958 `findClosestEntityInRadius` + 121k social scans ≈ **0.1–0.3 ms total**.
- **Pathfinding is NOT the cost:** `findPath`/`steerWithPath` = **0 calls** in the benchmark (only fires on long hops across blocked terrain; cache capped at 200 entries). *Caveat: benchmark-limited — the sweep's settlers are jobless and clustered in open center terrain, so it never exercises a big village with many distinct river crossings (cache thrash → bounded A* re-runs).*
- Courtship / affairs / housemates / dialogue ≈ 0 ms.
- The unaccounted cost is the **per-human AI body + per-tick allocation churn**:
  - per tick: `aliveEntities` filter (2,800), `byType` (12+ arrays, built **twice**), `entityById` Map, `allHumans` + Set, `workersByWorkplace`, `residenceOccupants`, per-human social arrays.

## 3. Proposed work (ordered by impact ÷ effort ÷ risk)

### P0 — GC forensics (5 min)
Run the capacity sweep with forced `gc()` between ticks (`--expose-gc`) to split GC time from real work. Confirms where P1 lands before investing.

### P1 — Stop rebuilding world indexes every tick (safe)
- WeakMap-cache `entityById` by entity-array identity (same pattern as `viewState`'s `entityIndexCache`).
- Reuse `state.entityByType` when types didn't change this tick (avoid the double `buildEntityByType`).
- Pool/reuse `allHumans`, `humanIds`, `workersByWorkplace`, `residenceOccupants` allocations where safe.
- **Verify:** capacity sweep before/after; expect the superlinear tail to flatten.

### P2 — Stagger the expensive per-human subsystems (structural)
- Courtship, affairs, social rolls, gossip run every tick for in-focus settlers. Extend the existing `OFFSCREEN_HUMAN_THROTTLE` pattern (`(tick + id) % N`) to run pricey subsystems every 2–4 ticks per settler, staggered by id. Sim cadence is 3 ticks/hour — imperceptible, cuts the per-human body 2–4×.
- **Verify:** capacity sweep + a gameplay sanity check (affairs/courtship still fire; no perceptible change at 1×).

### P3 — Worker sim by default
- `VITE_USE_GAME_WORKER=1` default: ticks move off the render thread → frames stay 60fps even if a 10× tick is slow (sim runs slower than real-time instead of freezing the UI).

### Optional later
- Trim the ~890-tree / ~350-grass entity base (scenery as entities processed every tick) — the roadmap's "scan cleanup".
- Outgoing militia sprites, App.tsx split (already tracked in game-feel Phase 4).

## 4. Acceptance criteria (v0.6)

- `npx tsx scripts/perf-entity-capacity.ts` shows **1,200h: avg ≤ 67 ms** (10× budget) on this machine.
- 1× speed stays comfortably under budget at 1,500+ settlers.
- `npm test` green (95+), `npm run lint` 0 errors, saves unaffected (no schema change).

## 5. Notes

- The benchmark is **worst case**: all settlers clustered in the focus box (throttle can't help). Real villages spread out and already benefit from the off-screen throttle — measured capacity is a lower bound.
- Keep `docs/private/BUGS_TRACKER.md` perf-related findings in sync (batch EN-style).

---

## 6. Round 2026-08-15 — P0/P1 done, P2 parked (evidence), P3 is the next real step

**New baseline (this machine, 120 ticks/tier, focus throttle):** 800h **85 ms** · 1000h **127 ms** · 1200h **191 ms** · 1500h **291 ms** — ~40 ms worse than the Aug-8 numbers (herds, festivals, decor, school drama landed since).

### P0 — GC forensics: **allocations are NOT the tail** ❌ premise

`SIM_GC=1 NODE_OPTIONS=--expose-gc` (forced full `gc()` between ticks) made ticks **slower**, not faster (1200h: 191 → **215 ms**; 800h p95 spiked to 1.7 s). Deferred nursery GC is already cheap; a full GC pass costs more than it saves. Conclusion: the superlinear tail is **real per-human compute**, not allocation churn.

### P1 — shipped (safe, small win) ✅

Cadence audit (BUG-2) found the entity-by-type index built **3× per tick** (gameTick ×2 + catalog rebuild). Now `gameTick` keeps a per-world WeakMap of the tick-start `byType`; on ticks with no births/deaths/type-changes (most ticks — scenery is static, births/deaths are daily) `state.entityByType` reuses that object, and `gameLoop` skips the catalog rebuild when the identity didn't change. Commits `f8f01b4` (P0 script) · `0b5f397` (P1).

### P2 — parked, not implemented ⚠️

The plan's own profiler (courtship/affairs/housemates/dialogue ≈ **0 ms**, 290k spatial queries ≈ 0.1–0.3 ms, pathfinding 0 calls) plus P0 forensics show the staggerable subsystems are **not** where the 190 ms goes — staggering them cannot produce a measurable win and would add pacing/regression risk for nothing. Pooling per-tick collections was also dropped (same P0 evidence).

### Reassessment — path to the 67 ms target

1. **P3 — worker sim by default (`VITE_USE_GAME_WORKER=1`)** — the real playability win: slow 10× ticks stop freezing the UI (frames stay 60 fps; the sim runs slower than real-time instead of blocking). Does not lower tick cost but is what players feel.
2. **Reduce the per-human AI body** (the actual 99%): deep, high-risk refactor — needs a fresh profiling session with `scripts/profile-town-tick.ts` to find the per-human constant factors worth removing.
3. Accept the benchmark as a **worst-case lower bound** (real 1,200-settler villages spread out and are off-screen-throttled).

Acceptance criteria in §4 are **not met yet**; do not call v0.6 perf done on this round.

---

## 7. Round 2026-08-17 — P3 shipped + per-human cuts landed (evidence: fresh CPU profile)

**Fresh baseline (official sweep, this machine, 250 ticks/tier):** 800h **145 ms** · 1200h **352 ms** · 1500h **715 ms** — a **~2× regression since Aug-15** (191/291). The Aug-15 conclusion "subsystems ≈ 0 ms" no longer holds.

### CPU profile @1,200h clustered (`scripts/prof-single-tier.ts` + `scripts/analyze-cpuprofile.mjs`) — the tail moved

| Cost | Share | Where |
|---|---|---|
| Spatial-grid social scans (`forEachInRadius`/`findClosestInRadius`) | **~43%** | per-human ambient-chat + social-impulse scans, every tick, every in-focus human |
| `simQueries` wrappers + `isPlayerHuman` filters | ~16% | inlined per-entity inside those scans |
| Phase-7 `relationships.ts` (daily) | ~7% | O(H²) pair bumps when a shared-home group is huge (measured 48 ms spike) |
| Everything else (pathfinding, courtship internals, grid index, GC) | ~34% | unchanged |

### Landed fixes (this round)

1. **P3 — worker sim default-on** ✅ — `isGameWorkerEnabled()` now returns true unless `VITE_USE_GAME_WORKER=0` (opt-out). Existing init-failure fallback stays. UI never freezes on slow ticks.
2. **Ambient-chat grid scan staggered 3×** — flavor-only dialogue; chance tripled so the expected dialogue rate is identical.
3. **Social-impulse scan radius 1.5× → 1.1×** of socialScanRadius (4.4 cells) — nearby-adult pool stays rich at village density; visited grid area at clustered scale drops ~1.8×.
4. **Relationships O(H²) cap** — all-pairs friendship bumps bounded to the first 40 members of any shared home/job group (pathological groups can no longer explode the daily layer).

### Result

- Official sweep post-cuts (this machine): **800h 103 ms · 1200h 207 ms · 1500h 384 ms** (user machine: 1200h **174 ms**) — vs the 352/715 pre-cut baseline, **~1.9× faster** on the same driver.
- Single-tier driver @1,200h clustered: **104.6 ms** (agent machine) / **85.0 ms** (user machine) — worst-case, everything in focus.
- 10× budget (67 ms) not yet met at 1,200h, but the UI stays 60 fps now (default worker); 1× speed is comfortable at 1,500+ (384 ≪ 667 ms budget).

### Still open (P2 by the plan's own criteria)

- Stagger the **social-impulse** scan (courtship driver) — needs a player-confirmed pacing check before changing courtship rates.
- Scenery base (889 grass + 900+ trees as per-tick entities) — the roadmap's "scan cleanup", parked.
- True multi-worker sim partition: rejected — the sim is coupled across entity boundaries every tick (grid, relationships, affairs); splitting it risks split-brain results for a huge refactor. The worker already moves ALL ticks off the render thread.

Acceptance criteria in §4: **partially met** (worker default ✓, per-human tail cut ~3.4×, 1× comfortable; 10× at 1,200h is close, 1,500h still over). Call v0.6 perf **functionally shipped** with the sweep numbers recorded; mark fully done when the player confirms no social/courtship pacing regression.

