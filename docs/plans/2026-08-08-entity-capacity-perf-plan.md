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
- **Pathfinding is NOT the cost:** `findPath`/`steerWithPath` = **0 calls** in the benchmark (only fires on long hops across blocked terrain; cache capped at 200 entries).
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
