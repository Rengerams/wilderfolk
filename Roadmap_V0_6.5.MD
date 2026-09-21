# Wilderfolk Roadmap — v0.6.5

Status: planning opened 2026-09-20 · Baseline: **v0.6.4.1** (working tree)

This is the forward plan for the version **after** 0.6.4.1. It is the counterpart to `Roadmap_V0_6.4.1.MD`, which closed out: everything in that table is now either delivered or dropped, so this file starts clean rather than carrying a completed checklist forward.

It is the **feature and change record** — what is coming, why, and what it gives the player. Per-defect records live in `BUG_REPORTS/`, the per-change narrative in `CHANGELOG.md`, and audit row status in `docs/private/audits/`.

## Where v0.6.5 starts from

v0.6.4.1 shipped the strongest readability pass the game has had: the **Village Dashboard** (valley concerns with severity, "what changed?" against a real previous day, 30-day food-by-produced-source, the Daily Council Report, and a per-settler "why?"), the **Infrastructure & Logistics overlay** (hotkey **X**, including blocked paths), **Workforce Policy Presets**, **legacy goals** in the Chronicle, and inspector explanations for staffing and movement. Gameplay gained family and youth immigration, the adoption rules, 24-hour prison guard duty, schedule-aware evenings, readable zoom, the school roster, and a 72-second day at 1×.

The load-bearing engineering facts it left behind, which every item below must respect:

- **One mutable `WorldState`**, mutated only in the four fixed tick layers and their named domain owners. No new tick layer.
- **Determinism** from `simRng` owner streams — same seed, same world, across save/load and worker hand-off.
- **`RenderSnapshot` is read-only**; the renderer draws, it never decides.
- **UI is a projection.** Players act through typed `WorkerCommand`s; panels read read-only projections.
- **The save gate is exact.** `GAME_VERSION` is `0.6.4.1`, so only 0.6.4.1 saves load. A save-shape change is a policy decision, not a cleanup.

---

## Theme 1 — The terrain overhaul (Teraforge) — the headline project

The single largest piece of work on the table: replace the current world generation **and** pathfinding with the four-layer landscape described in `TERAFORGE.md` — real relief with clustered mountain ranges, gradient-walker rivers that carve gorges, waterfalls, lakes and floodplains, **15 biomes** blended by temperature × moisture × elevation with no tile seams, per-pixel rendering with hillshading, and much larger maps (Teraforge *Medium* = today's *Huge*; Teraforge *Huge* is ~5.8× today's area).

**What blocks it today is the terrain data model, not the language or the renderer.** `WorldMap.tiles: TerrainTile[][]` is a single grid of objects at one resolution (`TERRAIN_TILE_SIZE = 10`). Teraforge needs **four layers at three resolutions**: `L0` path 10 px · `L1` build 20 px · `L2` terrain 64 px biome cells · `L3` decor.

Three rules the integration must follow, each established by reading the current owners:

1. **A flat, typed-array `WorldMapV2`** (one typed array per layer, with a `tileAt()` adapter for the ~62 existing `.tiles`/`TerrainTile` references across 15 files). This is the change that unlocks the model *and* improves cache locality at 5.8× the map size.
2. **Worldgen is offline; pathfinding is not.** Generation is a one-time bake — it can come from a separate tool or service and be **baked into the save**. Pathfinding runs per tick (~104 spatial queries/tick), so it must stay **in-process**. Both halves must not be wired the same way.
3. **Do not re-attempt PixiJS for the new visuals.** It has been introduced and withdrawn twice in this repo (`CHANGELOG.md:1045`, row N36, and two `BUG_REPORTS/2026-09-17-pixi-*.md`). The canvas2D ground is the shipping path.

**First slice:** the representation swap behind a switch, with the old generator still available, gated by the existing deterministic 360-day oracle (`scripts/run-full-year.mts --scenario=producers --seed=12345`) diffed checkpoint by checkpoint.

---

## Theme 2 — Presentation: finish the graphics roadmap, then decide the renderer

`docs/archive/GRAPHICS_UPGRADE_ROADMAP.md` already defines seven stages. **Stage 1 (contact shadows) shipped**; Stages 2–6 are specified and not built:

- **Stage 2 — terrain materials:** grass/dirt/riverbank/rock/beach/mountain identity, baked into the existing caches.
- **Stage 3 — animated water and weather layers:** rivers flow, shores shimmer, rain and snow affect the scene.
- **Stage 4 — settlement readability:** road aprons, crops, smoke, lanterns, work cues.
- **Stage 5 — sprite consistency:** one lighting direction, palette, outline and scale across people, animals, trees and buildings.
- **Stage 6 — camera and atmosphere:** softer dawn/dusk, restrained fog, biome tint, event lighting.

**Stage 7 is a decision, not a build:** profile the canvas2D path at target density, then choose between **raw WebGL/WebGPU for the terrain and decor layers only** (contained, keeps the simulation, UI and saves) or an **engine** — with the honest note that Godot would mean re-implementing ~72k lines of TypeScript and rebuilding ~80% of the test suite. Console/Steam distribution is the only driver that clearly justifies the engine.

---

## Theme 3 — Game feel

The measured gap between "fun in a browser tab" and "a real game" is mostly **shell and input**, not graphics — and it is cheap:

- **Gamepad support** — there are currently **zero** gamepad references in the codebase.
- **Fullscreen, pointer lock, and cursor hiding** — also zero references today. This is the single biggest "this is a web page" tell.
- **HUD redesign** — the React/Tailwind panels read as a dashboard. This is design work, and no engine swap substitutes for it.
- **Audio depth** — the bus structure already exists (`master`/`music`/`sfx`/`ambient` + a music filter); missing are spatial panning, reverb, and a compressor.

---

## Theme 4 — Scale and performance (only the measured hot paths)

A full 360-day Huge run is **healthy**: tick p50 3.21 / p95 16.76 ms against a 500 ms preferred budget, **0 stalled ticks**, **0 invariant violations**, worker 72/72 with 0 fallbacks. And **pathfinding is not a hot path** — 11,656 A\* calls over 25,920 ticks (**0.53/tick**) against **104.5 spatial queries/tick**, with 1 grid rebuild per map and a 71.2% waypoint-cache hit rate.

So the work is targeted, in measured order:

1. **`road_near`: 1,407,361 queries a year returning 0 candidates.** Find why it queries at all.
2. **`hunt`: 63,784 queries → 3,800,088 candidate checks** (~60 per query). The hunt adaptive config is already specified and on hold.
3. **Delta serialization:** p50 10.79 / **p95 45.40** / max 120.36 ms with **14 spikes past 50 ms**. This is the worker-boundary cost.
4. **Memory growth:** heap trended **+106 MB over one year** in the latest run and +224 MB in an earlier one. This is the real long-run risk and bigger maps will amplify it.
5. **Then** raise the documented **2,600-settler** ceiling — only after the above, measured at the new map sizes.

---

## Theme 5 — Readability and depth

- **Complete the Operations Center (F1).** It shipped as a dashboard *slice* and is the one row in the last roadmap that qualified its own status. Decide what full means: alerts that resolve, links to the exact person/building/action, and a "what should I do now" that survives a reload.
- **Deepen the Daily Council Report** into a planning rhythm rather than a summary.
- **Extend the "Why?" layer** from settlers to buildings, resources and warnings.
- **Authored content on the existing state** — more stories, festival outcomes, ecology signals — built on the current relationships, ecology, workforce, diplomacy and defense rather than beside them.

---

## Carried-over work

- **The resource desync** (owner-reported, 2026-09-20): the resource tabs can show enough while a build is refused. Localized to the display path — `rebuildOptimisticDisplay` = authoritative snapshot + replayed pending commands, replaced on each worker result, with a 250 ms UI throttle and pipeline depth 4 — but **not reproduced**, so not patched. Needs a browser reproduction with a save id.
- **Faction / affair drama re-measurement** — the tryst-site rule is fixed and caught-in-the-act demonstrably fires (4 in 100 days), but no like-for-like A/B exists.
- **Famine-bite tuning** — current values are playtest-flavoured.
- **Mountain peak overlay art** — four directional PNGs (45/135/225/315); optional polish **on top of** the working `terrain/mountain.jpg` ground art, and they must be re-added to the preload list to be used at all.

## Not in scope (owner rulings, standing)

- **Weather, disaster and crisis work** — parked permanently (2026-09-17). Do not re-propose.
- **Console/Steam** — the only trigger that reopens the engine question.

## Engineering contract for every item above

Each item states its owner, cadence, exact state writes, save impact, invalid-input behaviour, invariant coverage, and a player-visible acceptance check **before** implementation. No new tick layer for convenience. Diagnostics stay read-only and opt-in. Any new durable field needs the full contract: save allow-list, `simDelta` extract/apply, and `simPrep` rollback.

## References

- `Roadmap_V0_6.4.1.MD` — the completed prior plan
- `TERAFORGE.md` — the terrain overhaul specification
- `docs/archive/GRAPHICS_UPGRADE_ROADMAP.md` — stages 1–7
- `CHANGELOG.md` — the per-change record
- `BUG_REPORTS/` and `docs/private/audits/2026-09-16/LIVE-FINDINGS-STATUS.md` — defect and audit records
- `OWNERSHIP_OVERVIEW.md` — the ownership contract
