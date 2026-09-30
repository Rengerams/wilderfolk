# Architecture — how the Godot port is shaped

This is the design plan. [`ROADMAP.md`](ROADMAP.md) is the phase order; [`AGENTS.md`](AGENTS.md) is the protocol;
[`MCP.md`](MCP.md) is the tool reference. This file decides **what is allowed to change**.

---

## 1. The one rule: the simulation is sacred

The simulation is where the bugs were, and where some still are. Every one of them cost real time. So:

> **The observable behaviour is locked. The shape of the code is not.**
>
> Same seed in, same village history out — down to the tick order and the seeded derivations. But a module
> boundary, a data layout, or an interface that exists because the **browser** required it is not behaviour,
> and it does not survive merely because it is already there.

An earlier draft of this file said *"ported, never rewritten"*. That is too strong, and it was already being
applied inconsistently: the Web Worker boundary is deleted here (2 483 lines) **because the browser needed
it**, while the terrain seam was declared frozen — the same kind of thing, treated two ways.

**Locked, because it is behaviour:**

- the RNG streams and every seeded derivation
- **rule outcomes** — the same world state and the same input give the same result
- tick semantics and the fixed layer order (realtime → systems → assign → daily). The order *is* the outcome
- the invariants, which are this project's definition of a valid world
- the **content** of a save

**Free, because it is shape:**

- the worker boundary, the delta protocol, the SoA render buffers
- `WorldState`'s layout. Without a worker boundary it stops being a wire protocol and becomes an internal
  choice, which means it can be shaped for the rules instead of for shipping bytes
- the terrain seam — eleven calls today, a different interface tomorrow
- the save format's *shape* (only its content is behaviour)
- file and module organisation, including the four tick files

**The test for any shape change:** run the same seed through both and compare the history. A shape change that
survives that is not a rewrite — it is a port done properly. One that fails it is a bug, however clean it
looks.

That distinction is not licence to redesign the rules. It is the reason a change of shape is *allowed at all*:
because it can be checked.

That is not a style preference, it is the lesson of this project: the oracle's simulation grew a large test
suite and an invariant collector *because* hand-tended rules kept breaking. Discarding that safety net is what
re-earns the same bugs — not changing a layout.

## 2. The wall

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  BEHAVIOUR-LOCKED — src/sim/│  seam   │  FREE — src/world/ + scenes/     │
│  rules · tick order · RNG   │ <─────> │  terrain · rendering · UI · audio│
│  invariants · save content  │         │  rewritten with Godot's tools    │
│  its shape may still change │         │  Node-based, scene-driven        │
└─────────────────────────────┘         └──────────────────────────────────┘
```

The left box is locked by its **behaviour**, not by its silhouette. Its internal shape is fair game (§1); what
it may not do is answer differently.

### The seam, measured

The simulation touches terrain today through **eleven** entry points. The *job* of this seam is locked — the
rules must reach the same answers over the same terrain — but its *form* is not (§1). What follows is the
current shape, read out of the oracle; a better one is a legitimate outcome of this port, provided the history
comparison above still passes.

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

### 5.3 How the data is shaped: one grid, parallel arrays

Terrain is the engine's. The simulation reads a **projection** of it: terrain is sampled into the arrays the
seam already expects, so terrain stays terrain — mesh, shader, water, foliage, sculpting — and the grid is the
simulation's *view* of it, not the terrain's storage.

This holds **whether the world is generated or authored**, and that question is still open. What is settled is
the shape of the projection, because it is not a design question: **every mature terrain system in this
ecosystem already uses it, and so does the oracle.**

| | Heights | Gameplay / material layers |
|---|---|---|
| the oracle | `elevation`, `moisture`, `temperature`, `riverDist` — five parallel `Float32Array`s over one `cols × rows` grid (`terrainGrid.ts`) | the cell flags (`WATER_CELL`, `BUILD_CELL`, `PATH_CELL`) over the same grid |
| LowPolyTerrainBuilder | the height matrix | **four bytes per grid vertex** in a `PackedByteArray` **alongside the heights** |
| Terrain3D | one file per region in a data directory | a control map over the same regions |

So gameplay layers live **on the terrain as a parallel array over the same grid** — not as a second scene
layer. A separate layer is two sources for one fact, and two sources drift; that failure has already cost real
time in the oracle twice. There is nothing to invent here, which is the point.

Two consequences worth stating:

- **Water is the one genuine special case.** TerraBrush paints it *into* the height field (the terrain goes
  lower where water is painted) while the shader draws the surface. So water has both a data face (the flag
  the simulation reads) and a visual face (the shader), and they must agree.
- **Keep terrain data out of `.tscn`.** LowPolyTerrainBuilder keeps chunk data in editor RAM explicitly *"to
  prevent `.tscn` bloat"*, and Terrain3D uses a data directory. A scene file is not a terrain store.

## 6. Plugins: what fits, and what does not

**A plugin may never enter the sacred half.** Anything on the sim side must be plain GDScript in this
repository, because a third-party dependency inside a parity-locked rule cannot be verified, pinned to a
behaviour, or replaced later.

### The distinction that actually decides it

All three candidates are **editor-first tools**. This world is **generated from a seed**, so an editor is only
useful if it can also *consume a terrain produced by code*. Two are 3D heightmap systems shipped as C++
GDExtension binaries; the third is GDScript and shaders with no build step. That difference is not cosmetic —
a binary binds to a Godot version, and this project's editor is 4.7.2.

- **[LowPolyTerrainBuilder](https://github.com/78sForge/LowPolyTerrainBuilder)** — **Godot 4.7+**, and its
  README says that is the version it is built and tested on, which makes it the only candidate here that
  matches this project's editor exactly. Its own rules file lists GDScript and GDShader, and installation is
  *"copy `addons/lowpolyterrain` into your `addons` directory"* — no build step and no platform binaries, so
  unlike the other two it carries **no GDExtension version binding**. Chunk-based terrain with deterministic
  Delaunay triangulation, sculpting brushes, a four-layer vertex painter with slope filters, a two-click ramp
  builder, flat/smooth shading, a water shader, glTF export, and two backends (`MESH_NODES` for nodes per
  chunk, or `SERVERS` for `RenderingServer`/`PhysicsServer3D` with radius-based collision culling).

  Two things matter for this port specifically. It exposes a **runtime height query** —
  `get_height_at_world_coords(x, z)`, O(1) with no physics query — which is the seam's `sampleElev` in Godot
  form. And it is scriptable at runtime (`add_culling_target()`, `update_collision_culling()`,
  `apply_ramp(from_world, to_world)`), so a generated world can drive it rather than only a human in the
  editor. It is nonetheless an **editor sculpting tool first**: whether it will accept a whole generated height
  field programmatically is the question to answer before adopting it, and it is a smaller question than the
  same one for the two above, because there is no binary in the way.

- **[Terrain3D](https://github.com/TokisanGames/Terrain3D)** — **MIT**, a C++ GDExtension doing GPU-driven
  clipmap mesh terrain: sculpting, holes, texture painting, foliage instancing with LOD, heights from 64×64 m
  to 65.5×65.5 km. It is in the **official Godot Asset Library** (asset 3134), so it installs from the AssetLib
  tab inside the editor, and that tab shows the entry matching your Godot version — the version fit is handled
  by the store rather than left to us. v1.0.2 states Godot **4.4–4.6+** (a maintenance release that added 4.6
  support), so 4.7 is within the stated range but not named: confirm it in the editor rather than assume either
  way.

  It is usable from GDScript rather than editor-only — `Terrain3D.new()`, and `Terrain3DData` exposes signals
  for updates — so a seeded world can drive it. Two constraints shape the integration:

  1. **It is a 3D node in a 3D scene.** Every setup instruction assumes a `Terrain3D` node and `Data Directory`
     in a 3D scene, so this belongs to the 2.5D/3D branch of the rendering decision, not to tiles.
  2. **The heightmap path is file-based, not array-based:** `exr` or `r16`, 16- or 32-bit, at **1 px = 1 m
     lateral** with real heights and **0 = sea level** — the same convention as the oracle's `DEFAULT_SEA_LEVEL`,
     so there is no unit translation. Terrain data lives as **one file per region in a data directory**, which is
     exactly where a generated world writes its region files.

  The adapter is therefore *"generate the elevation field from the seed, write it as region files, point
  Terrain3D at the directory"* — small and well defined, and it keeps terrain outside `src/sim/`.
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
