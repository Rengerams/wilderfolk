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
