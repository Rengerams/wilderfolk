# Architecture — how the Godot port is shaped

This is the design plan. [`ROADMAP.md`](ROADMAP.md) is the phase order; [`AGENTS.md`](AGENTS.md) is the protocol;
[`MCP.md`](MCP.md) is the tool reference. This file decides **what is allowed to change**.

---

## 1. The one rule: the simulation is sacred

The simulation is where the bugs were, and where some still are. Every one of them cost real time. So:

> **The simulation is ported, never rewritten.** A difference from the oracle is a bug by definition. It is
> parity-locked down to the tick order and the seeded derivations.

The freedom to rewrite applies to **terrain and presentation** — the parts where Godot is genuinely better and
where being different cannot corrupt a game state. The two halves are governed by opposite rules, and the whole
architecture exists to keep them apart.

That is not a style preference, it is the lesson of this project: the oracle's simulation grew a large test
suite and an invariant collector *because* hand-tended rules kept breaking. Rewriting it in a new language
throws that away and re-earns the same bugs.

## 2. The wall

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  SACRED — src/sim/          │  seam   │  FREE — src/world/ + scenes/     │
│  rules · tick layers        │ <─────> │  terrain · rendering · UI · audio│
│  save format · invariants   │         │  rewritten with Godot's tools    │
│  pure data + functions      │         │  Node-based, scene-driven        │
└─────────────────────────────┘         └──────────────────────────────────┘
```

### The seam, measured

The simulation touches terrain through **eleven** entry points and nothing else. Freeze this list; it is the
contract that lets both sides evolve:

| Direction | Call | Meaning |
|---|---|---|
| read | `tileAt(x, y)` | the tile record at a world position |
| read | `tileTypeAt(x, y)` | the tile's type, for rules and rendering |
| read | `isTileWalkable(x, y)` | pathfinding's only terrain question |
| read | `sampleElev(x, y)` | elevation, for slope/temperature rules |
| read | `biomeAt(x, y)` / `biomeIndexAt(x, y)` | biome, for ecology rules |
| write | `patchTile(x, y, …)` | a building or road changes the ground |
| write | `rebakeTerrainGrids()` | after patching, the derived grids are rebuilt |
| rule | `isWaterTerrainType(t)` / `isUnbuildableTerrainType(t)` | pure predicates over a tile type |
| flags | `TERRAIN_CELL · WATER_CELL · BUILD_CELL · PATH_CELL` | the cell bitmask the sim reads and writes |

Nothing else crosses. **Verify this stays true** — if a new sim rule needs a new terrain query, that is a
deliberate addition to the seam, not an import.

## 3. What the wall saves

Measured in the oracle, and none of it needs porting:

| Category | Size | Why it disappears |
|---|---|---|
| **Web Worker plumbing** | **2 483 lines** | `simDelta` 612 · `GameWorkerHost` 671 · `gameWorker` 427 · `simPrep` 423 · `protocol` 142 · `renderSoAEntities` 166 · `entityTypeCodes` 42. Every one exists to ship state diffs across a browser Worker boundary. Godot runs the simulation in-process. |
| **Presentation** | **15 114 lines** | `src/game/renderer` 5 838 + `src/components` 9 276. Deleted, not ported — this is a rewrite in Godot, not a translation. |
| **Hand-rolled primitives** | **~2 100 lines** | `pathfinding.ts` 582 → `AStarGrid2D`; `terrainLayer.ts` 793 + `terrainAtlas.ts` 294 + `renderer/grid.ts` 443 → `TileMapLayer` + TileSet terrain sets. |

**Estimated parity surface: the remaining ~57 000 lines of `src/game`.** That is the sacred half, and it is the
real work. The number is an estimate; the categories are measured.

## 4. How "sacred" is enforced, not just stated

A rule in a document is obeyed until someone is in a hurry. Three mechanisms, in order of strength:

### 4.1 Purity: the sacred half may not depend on the free half

`src/sim/**` must be **pure GDScript over data**: no `Node`, no scene access, no input, no rendering. This is
what makes it testable headlessly by `test_run` (no scene tree to build), feedable from a snapshot
`WorldState`, and comparable tick for tick.

Mechanically checkable — a source scan over `src/sim/**/*.gd` that fails on:

```
extends Node / Node2D / Control / Node3D     get_node · find_child · %Unique
get_tree · SceneTree · get_viewport          Input · InputEvent
RenderingServer · CanvasItem · draw_*        preload("res://scenes/…")
autoload singletons                          OS · Time (except a passed-in tick)
```

If a sim rule needs one of these, the answer is to pass the value in — never to reach out. The oracle already
proved the value of this: its rules are pure functions over `WorldState` and that is exactly why 1495 tests can
run without a screen.

### 4.2 Parity: a rule without its test is unverified

When you port a rule, port its test in the same change. The suite is `test_run`; the fixtures come from the
oracle (`ROADMAP.md` §5). This is the gate, and it is not something a human remembers to invoke.

### 4.3 The invariant collector: the definition of a valid world

`simulationInvariants` (294 lines) is ported **early** — phase 2 of the roadmap — because it converts a silent
divergence into a failing assertion. Over a 360-day run the oracle reports zero violations; that number is the
port's own acceptance criterion.

## 5. The free half: terrain, done properly

Terrain is where this port should be visibly *better*, and Godot has the primitives.

### 5.1 The layers

- **`TileMapLayer`** — one layer per concern (ground · water · roads · buildings · decor). Godot 4.3+ replaced
  the multi-layer `TileMap` with one node per layer, which is also the right modelling.
- **TileSet terrain sets (autotiling)** — Godot's built-in neighbour-matching. Three modes: **Match Sides**,
  **Match Corners**, **Match Corners and Sides**; plus probabilities for several tiles sharing a bitmask,
  alternative tiles for one tile with several bitmasks, and animating terrain tiles. This replaces the oracle's
  hand-rolled atlas-neighbour logic and its 443-line grid renderer. The feature is under-documented upstream —
  a community write-up with a starter project exists at
  [dandeliondino/godot-4-tileset-terrains-docs](https://github.com/dandeliondino/godot-4-tileset-terrains-docs).
- **`FastNoiseLite`** — the field generator. The oracle's `noise.ts` (`hash2`, `valueNoise`, `fbm`, `ridged`,
  `warp`) exists only because the browser had no noise library. Because worldgen is free, nothing here needs
  bit-parity, so use the engine's types rather than transliterating them.
- **`AStarGrid2D`** — the pathfinding. Verified live from the running editor (Godot 4.7.2): it carries
  `cell_shape` (Square / IsometricRight / IsometricDown), `cell_size`, `offset`, `region`, `size`,
  `jumping_enabled`, a `diagonal_mode` of *Always / Never / At Least One Walkable / Only If No Obstacles*, and
  four heuristics (Euclidean / Manhattan / Octile / Chebyshev). That is a richer model than the 582-line module
  it replaces.
- **`MultiMeshInstance2D`** — mass decor. Trees, grass and rocks as instanced draws instead of per-tile work.
- **Shaders** — water, weather, and the terrain shading the oracle's canvas2D imitates.

### 5.2 What terrain should do better than the oracle

Not aspirations — these are the things the browser constrained:

1. **Chunked, streamed generation** so the world size stops being a load-time cost.
2. **A real elevation field** behind the tiles, so slope, temperature, rain shadow and lighting are one
   continuous truth instead of per-tile approximations.
3. **Water that reads as water** — flow, width by discharge, and animation, from a hydrology pass rather than
   painted tiles.
4. **Biome transitions** through TileSet terrains instead of hand-matched corners.
5. **Authorable in the editor** — a designer can paint and inspect a map, which the browser build never allowed.

## 6. Plugins: what fits, and what does not

**A plugin may never enter the sacred half.** Anything on the sim side must be plain GDScript in this
repository, because a third-party dependency inside a parity-locked rule cannot be verified, pinned to a
behaviour, or replaced later.

### The distinction that actually decides it

Both candidate terrain plugins are **3D heightmap tools**, and both are **editors first**. This world is
**generated from a seed**, so an editor is only useful if it can also *consume a heightmap produced by code*.

- **[Terrain3D](https://store.godotengine.org/asset/tokisangames/terrain3d/)** — a C++ GDExtension doing
  GPU-driven clipmap mesh terrain: sculpting, holes, texture painting, heights from 64×64 m to 65.5×65.5 km.
  Its feature list includes **importing heightmaps from other tools**, which is the property that matters here.
  Stated builds are Godot **4.3–4.6+**; this editor is **4.7.2**, so the support matrix is the risk.
- **[TerraBrush](https://github.com/spimort/TerraBrush)** — a GDExtension heightmap editor for Godot **4.5+**,
  **MIT**. Sculpt (raise/lower/smooth/flatten/set-height/set-angle), colour and texture painting with automatic
  slope-based texturing, foliage that follows the camera, packed-scene scattering, water that lowers the terrain
  with a paintable **flow direction**, configurable snow, **holes** for caves, and LOD. Its README is candid
  that it was "made mainly for my own project". One Terrain3D review reports it failing on 4.7 — unverified, and
  the README says 4.5+, so **test it before depending on it**.

**Neither touches `src/sim/`, and neither needs to** — the simulation only requires the eleven-entry seam in §2.

### The cheaper path, which needs no dependency at all

`elevation` is a `Float32Array` over the grid. That **is** a heightmap, and a heightmap is exactly the input a
mesh needs. Building the far-field terrain mesh from that data in GDScript is a small amount of code, ships no
binary extension, carries no version risk, and stays inside the free half where it belongs.

Adopt a plugin only for the thing it is genuinely better at — **editor authoring** — and only if the world is
still reproducible from a seed.

### Rule for anything else

It must be replaceable, must not touch `src/sim/`, and must be recorded with its version and licence the way
`THIRD_PARTY_NOTICES` does for the oracle. Evaluate before adopting: **a plugin that renders the world is a
candidate; a plugin that owns the rules is not.**

## 7. Proposed layout

The wall becomes physical, so a misplaced import is visible in a path:

```
src/sim/        SACRED  pure GDScript, parity-locked, no Node
                rng/ · rules/ · tick layers · save · invariants
src/world/      FREE    terrain generation, hydrology, biomes, chunking
src/ui/         FREE    Control-tree views, HUD, windows
scenes/         FREE    main scene, world scene, UI scenes
tests/          parity suites (test_*.gd) + fixtures/
tests/fixtures/ golden data extracted from the oracle, UTF-8
addons/godot_ai/         the MCP plugin (vendored, do not edit)
```

`src/game/sim_rng_core.gd` and `sim_rng.gd` move to `src/sim/rng/` when this lands — they are the first sacred
citizens and should be the first to prove the layout works.

## 8. Decisions for the owner

1. **Adopt this layout now**, or port into `src/game/` and reorganise later? Moving two files now is cheap;
   moving a hundred later is not.
2. **The purity guard**: build it in phase 2 alongside `simulationInvariants`, or after the first rules land?
3. **Chunking**: decide the world size and chunk scheme before terrain work, because it shapes the seam.
4. **Render in 2D, 2.5D or 3D?** Deliberately last, because it is the cheapest decision to change: the world
   model is a heightfield on a 2D grid, so **any of the three can render the same simulation**. What would change
   the sacred half is not the camera — it is the **world model** (overhangs, caves, several ground levels).
   Decide 2.5D/3D rendering freely; treat a change to the world model as a different project.
