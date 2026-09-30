# 🗺️ Wilderfolk: The Valley Reborn — Teraforge

## Status: shipped, and since tuned

The terrain overhaul **is the shipping world generator and pathfinder** as of the 0.6.5 line — this
document now describes what the valley *is*, not only what was planned. Two passes followed the
initial port:

- **The integration was finished.** The four layers are read through one owner
  (`src/game/terrain/terrainGrid.ts`: `tileAt` / `tileTypeAt` / `isTileWalkable` /
  `isTileBuildable` / `setTileOverride` / `rebakeTerrainGrids`), the sparse override layer holds
  post-generation edits, and both occupancy grids are re-derived when terrain changes.
- **The landscape was tuned.** The first shipped valley was flat, uniformly green and mostly
  canopy: min/max height normalisation left the land in a third of its range so the rock and snow
  bands were unreachable (**0.1 % rock, 0 % snow** on a continental map), the moisture field was a
  single climate with the preset's own bias never applied, grassland served as the catch-all
  instead of the dry-temperate biome, and the cast-shadow pass painted hard dark outlines around
  every river. Each was measured and fixed at its source; the numbers are in `CHANGELOG.md`.
- **The ground look was fixed.** The generator was healthy; the per-pixel *bake* was not. It
  coloured land on absolute elevation above sea while `classifyTile` classifies on the normalised
  land range, so every alpine arm of its ramp sat above the map's own maximum height — measured,
  **0.0 % of a scandinavia map's land could paint snow** while 1.0 % of its tiles were `Snow`, and
  its rock and mountain tiles were painted lawn green. The bake now takes its bands from
  `terrainGrid` (`LAND_BANDS`), reads one continuous water ramp, draws its coasts and river banks on
  smooth contours instead of the lattice, chooses material from the smooth fields rather than the
  nearest biome label, and shades from a precomputed slope field. Measured and recorded in
  `CHANGELOG.md`; audit in `docs/private/audits/2026-09-24/terrain-ground-look.md`.

**One honest limit:** the terrain cell is **16 px** (down from Teraforge's 64 px, 2026-09-24), so at
high zoom a river's edge is still quantised to that lattice — the waterline is smoothed, but a
carved channel's banks are written a whole cell at a time. `TERRAIN_CELL` in
`terrain/terrainGrid.ts` is the single constant that sets it.

## A Tease for What's Coming

> **Heads up, keepers!** The terrain overhaul is on its way, and when it lands it **replaces the current world generation and pathfinding entirely**. The valley is being rebuilt from bedrock to treeline — real relief, living watersheds, and coastlines that finally breathe. You won't be settling a flat map anymore. You'll be moving into a *landscape*.

---

## 🏔️ Real Relief & Mountain Ranges

The valley's vertical range grows dramatically, and the mountains that ring your home finally feel like mountains.

- **Clustered ranges, not lonely mounds.** Peaks form connected chains that wall off regions — sun-lit ridgelines, shaded cliff faces, and snow-capped crests rising out of the plain.
- **Elevation changes everything.** As the land climbs, so does life on it:

| Zone | What you'll find |
|---|---|
| **Valley floor** | Temperate meadows, deciduous groves, blueberry stands, warm ground your settlers know best |
| **Mid-slopes** | Pine and boreal cover, cooler air, steeper commutes that tax stamina |
| **High crests** | Wind-scoured rock and glacial snow — beautiful to look at, brutal to build on |

- **Natural high ground.** Enclosed upland valleys, sheltered plateaus, and cliff-backed pockets make genuinely defensible ground for a frontier village facing raids.

---

## 🕳️ Living Watersheds & Carved Land

Water no longer trickles across the map as a thin blue thread — **it shapes the terrain it flows through**.

- **Gradient-walker rivers** follow downhill elevation with meander noise and inertia.
- **Whole-tile rivers that carve** — systems cut gorges and ravines through high ground before spilling toward the lowlands, leaving dramatic drops and hand-painted shores.
- **Smooth distance fields** — river edges blend seamlessly into terrain; no blocky cells.
- **Width growth** — thin mountain streams widen into broad lowland rivers.
- **Waterfalls** — auto-detected wherever rivers meet steep elevation drops, with animated spray particles.
- **Lakes, basins & floodplains** — water pools where the land dips, feeding fertile riverbanks: prime farm, fishing, and settlement ground if you read the terrain right.
- **River ≠ ocean** — distinct colours: rivers run teal-blue, the ocean sits dark navy.
- **Terrain that tells a story** — every generated valley has its own natural bottlenecks, corridors, and vantage points.

---

## 🌿 Seamless Biomes & Soft Borders

Biomes no longer snap together at hard square edges. The engine blends **temperature, moisture, and elevation** into organic gradients — no tile seams, no grid squares, no guillotine edges.

```text
Cold/Dry (Tundra) ◄──────► Cold/Wet (Taiga)
       ▲                          ▲
       │     [Organic Gradient]   │
       ▼                          ▼
Warm/Dry (Steppe) ◄──────► Warm/Wet (Meadow/Wetland)
```

- **15 biomes**, flowing into one another: deep water → rivers → sand → desert → dirt → grass → meadow → forest → dense forest → taiga → swamp → tundra → rock → snow.
- **Biomes ride the terrain.** Regions conform to the land instead of dictating it — a forest can spread across flat bottoms, climb a hillside, or crown a coastal bluff.
- **Per-pixel rendering.** Smooth Whittaker-style colour gradients, plus biome-specific textures — grass streaks, dirt grain, sand ripples, rock cracks, snow sparkle — visible when you zoom in.
- **Elevation shading.** Hillshading, cast shadows, slope edges, and progressive darkening at altitude.
- **The food chain flows across the blends** — grass, prey, predators, and people all sharing terrain that finally makes sense.

---

## 🌊 Coastlines & Frontier Edges

- **Coasts with character** — oceans and riverlands gain real shelving, sheltered coves, and cliff-lined edges instead of one uniform shore.
- **Terrain-aware placement** — starting areas, footpaths, and resources respect the shape of the land; warm, hand-made paths thread through the relief instead of ignoring it.

---

## 🌿 Life & Atmosphere

The valley is alive with detail, all of it deterministic:

| Type | Count | Examples |
|---|---|---|
| **Trees** | 4 variants × 2 types | Oak (round canopy), Pine (tiered triangles), Fruit tree (coloured fruits), Palm |
| **Plants** | 8 types | Bush, flower, fern, tallgrass, berries, reed, cattail, scrub |
| **Ground objects** | 7 types | Rock (small/big), stump, log, driftwood, bones, dirt patch |
| **Water props** | 1 type | Lilypad (with optional flower) |
| **Wildlife** | 2 types | Birds (V-shape, flapping), Butterflies (coloured wings, fluttering) |

- **Wind animation** — trees sway from the canopy (trunk stays planted); grass and reeds bend.
- **Birds & butterflies** — animated over forests and meadows, deterministic flock positions.
- **Waterfall spray** — white particles where rivers drop.

---

## 🧱 Built on a Four-Layer Grid

The new terrain replaces the current generation *and* pathfinding, with every system riding one clean structure:

```text
┌──────────────────────────────────────┐
│ L3 DECOR    Free sprites             │ ← 23 decoration types
├──────────────────────────────────────┤
│ L2 TERRAIN  64px biome cells         │ ← 15 biome types
├──────────────────────────────────────┤
│ L1 BUILD    20px placement grid      │ ← Snap grid for structures
├──────────────────────────────────────┤
│ L0 PATH     10px collision grid      │ ← Pathfinding / occupancy
└──────────────────────────────────────┘
```

- **Deterministic** — same seed + same settings = identical world, forever.
- **3 map sizes** — Medium (2560×1920) · Large (4096×3072) · Huge (6144×4608).

---

## 🎒 Keeper's Survival Cheat Sheet

| Terrain Challenge | What to Expect | Recommended Approach |
|---|---|---|
| **Steep slopes & cliffs** | Long, winding commutes and awkward build sites on the highlands | Site key buildings on plateaus and valley floors; let cliffs be your walls |
| **Climbing fatigue** | Scale-heavy terrain drains settler stamina faster | Keep homes, farms, and workplaces close; mind your workday hours |
| **River barriers** | Wide, whole-tile rivers splitting your land | Straddle water with a Fishing Spot dock; plan crossings before you sprawl |
| **High-ground raids** | Rivals exploiting the same defensible terrain you crave | Claim the choke points first — walls, towers, and patrols love good relief |

---

## 💡 Builder's Note

Because the valley is genuinely three-dimensional now, **settlement layout is a real decision again**. Lean into cliff-backed strongholds, riverside farm terraces, upland fortress-villages, and coves that shelter your growing family from the frontier. **Read the land before you break ground** — the terrain is trying to tell you where to live.

---

> ⚠️ **Development note:** The terrain overhaul is a separate development track — it replaces the current terrain generation and pathfinding and is **not part of the current v0.6.4 desktop distribution release**. This tease previews where the valley is headed.
