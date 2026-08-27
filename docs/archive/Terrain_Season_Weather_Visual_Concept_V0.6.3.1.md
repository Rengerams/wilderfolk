# Wilderfolk Terrain, Season, and Weather Visual Concept

**Development target:** Version 0.6.3.1  
**Status:** Concept for a side-by-side experimental implementation  
**Scope:** Terrain presentation, geographic formations, seasonal visuals, weather consequences, and renderer separation  
**Authority:** `WorldState` remains authoritative for simulation; the current renderer remains available as fallback.

## 1. Vision

Wilderfolk should present the world as a coherent painted geographic landscape while preserving the existing fine logical grid underneath. The player should see connected shorelines, readable rivers, clustered mountain formations, forests, buildings, and seasonal change. The simulation should continue to operate on precise logical cells without being forced to use those cells as visible ten-pixel tiles.

The new system is therefore not a replacement for the simulation. It is a new visual projection of the simulation.

> The small grid describes what the world is. The larger visual layer describes what the world looks like.

The first implementation must run beside the current Canvas renderer. It must use the same real simulation, the same worker, the same `WorldState`, and the same `RenderSnapshot`. Only the presentation layer should differ.

## 2. Core architectural separation

Wilderfolk will use three clear responsibilities.

| Responsibility | Authoritative owner | Examples |
|---|---|---|
| Simulation | `WorldState` and worker tick systems | Settler movement, resources, buildings, production, terrain rules, season, weather, disasters |
| Logical terrain | Fine invisible grid inside the world map | Terrain identity, buildability, movement, river cells, formation membership where gameplay needs it |
| Presentation | Experimental visual renderer and `ViewState` | Camera, large sprites, shoreline transitions, mountain formations, snow, particles, atmosphere, selection |

The renderer must never infer gameplay from the appearance of a sprite. A white mountain cap does not create a new terrain type. A snow-covered grass sprite does not become a different buildability class. A beach transition sprite does not determine whether a tile is water.

The normal data flow is:

```text
real game initialization
        ↓
real WorldState in the simulation worker
        ↓
real RenderSnapshot
        ↓
┌──────────────────────────┬──────────────────────────┐
│ Current Canvas renderer  │ Experimental renderer     │
│ known-good fallback      │ large formations + snow   │
└──────────────────────────┴──────────────────────────┘
```

There must be one simulation authority. The experimental renderer must not create a second world, second clock, second weather system, or second terrain generator.

## 3. Logical terrain model

The existing ten-pixel grid remains the invisible gameplay canvas. It is useful for deterministic queries and does not need to be visually exposed during normal play.

The logical terrain model should contain only categories that have a distinct simulation purpose. The initial target model is:

```text
Grassland
Forest
Beach
RiverBank
ShallowWater
River
DeepWater
Rocky
Mountains
```

`Forest` and `DarkForest` should be merged if they have no different gameplay rules, visual treatment, resource behavior, or player-facing meaning. `Snow` should not be a normal terrain type. Snow is a seasonal weather and presentation condition applied to the existing terrain.

`Hills` should remain only if it has a real gameplay distinction from `Rocky` or `Mountains`. If it does not, it should be merged or represented as a visual formation attribute rather than another terrain category.

The final decision must be based on actual consumers. A terrain category may remain only when at least one of these is true:

1. It changes movement, buildability, production, spawning, or another simulation rule.
2. It is required to preserve meaningful geographic information such as a river, shoreline, or mountain formation.
3. It has a deliberate and visibly understandable player-facing purpose.

All terrain properties should be centralized in one definition table rather than repeated across generation, placement, simulation, and rendering code.

```ts
interface TerrainDefinition {
  isWater: boolean;
  isBuildable: boolean;
  movementCost: number;
  visualFamily: 'grass' | 'forest' | 'beach' | 'water' | 'rock' | 'mountain';
  riverRole: 'none' | 'bank' | 'channel';
  formationRole: 'none' | 'mountain';
  efficiency: Partial<Record<BuildingType, number>>;
}
```

The table is the single source of truth for gameplay properties. Visual sprite selection must be a separate concern.

## 4. Terrain generation concept

Terrain generation should proceed in two passes.

### 4.1 Logical generation pass

The generator creates the authoritative logical grid using the preset and seed. It determines land, water, forest, shore, rivers, and high terrain. It guarantees enough buildable starting space before placing the camp. Natural water and mountain cells are protected during clearing.

The generator should create canonical river paths and mountain regions as explicit formation data. The primary river must be included in the canonical river representation, not only painted into individual tile types.

```ts
interface RiverFormation {
  id: string;
  cells: number[];
  path: Array<{ x: number; y: number }>;
}

interface MountainFormation {
  id: string;
  cells: number[];
  peaks: Array<{ x: number; y: number; variant: string }>;
}
```

The logical grid may use temporary generation values such as noise, moisture, and elevation. If those values do not affect the simulation after generation, they should not be treated as ongoing gameplay state.

### 4.2 Visual projection pass

The visual projection groups logical cells into larger visible surfaces and formations. It does not replace or modify the logical grid.

A visible formation maintains a mapping to the logical cells it covers:

```ts
interface VisualFormation {
  id: string;
  kind: 'terrain' | 'shoreline' | 'river' | 'mountain';
  x: number;
  y: number;
  width: number;
  height: number;
  coveredCells: number[];
  spritePath: string;
  orientation: 'canonical' | 'mirrored';
}
```

This allows a large visual mountain range to cover many small logical cells while placement, pathfinding, and production continue to query the underlying grid.

## 5. Visual terrain language

The visible map should use a small number of readable materials and a small number of meaningful formations.

### Materials

```text
grass
forest ground
beach sand
shallow water
river water
deep water
rocky ground
mountain formation
```

### Formations

```text
smooth shoreline
river segment and bank
connected mountain range
mountain peak or landmark
```

### Overlays

```text
winter snow ground
water-bank frost
tree canopy snow
roof snow
mountain-cap snow
```

The renderer should not generate multiple near-identical terrain materials merely to fill an enum. If two categories look the same and behave the same, they should be one category.

## 6. Shoreline and river design

Shorelines are a priority because they determine whether the map looks geographic or like a collection of isolated cells.

The visual renderer should resolve a shoreline from neighboring logical material families. It should support at least these transitions:

```text
Grassland ↔ Beach
Beach ↔ ShallowWater
ShallowWater ↔ DeepWater
Grassland/Forest ↔ RiverBank
RiverBank ↔ River
```

The visual rule should use only the relevant neighboring family. An unsupported neighbor should not automatically suppress every compatible atlas tile in a large ring. Unsupported boundaries should receive a deliberate hard edge or a dedicated transition mask.

The primary river must have one canonical path used by the minimap, visual river core, future water systems, and any river-related gameplay. There must not be one river definition in `WorldMap.tiles` and another incomplete definition in `map.rivers`.

## 7. Mountain design

Mountains should be generated and rendered as connected geographic formations, not as independent tree-like objects distributed randomly across the map.

The generator should first determine connected high-terrain regions. Visual snow or seasonal appearance must not decide whether a cell belongs to a mountain range. A cold peak can still belong to the same mountain formation even if its winter appearance is snowy.

The view should show:

```text
one connected base or ridge
+ spaced large mountain landmarks
+ controlled variation in peak size and orientation
+ buildable clearings near the starting area
```

The visual mountain formation must still map to logical cells. The sprite is a large presentation object; it is not a replacement for the underlying terrain rules.

## 8. Seasons and weather

Seasons describe the calendar. Weather describes current conditions. Snow is a weather and seasonal presentation effect, not a permanent terrain material.

### Seasons

```text
Spring
Summer
Fall
Winter
```

### Weather states

```text
Clear
Rain
Snow
Storm
Drought
Fog, only if deliberately retained as cosmetic or given a real consequence
```

Each retained weather state must have a defined role, visible feedback, and—unless explicitly cosmetic—a simulation consequence.

| Weather | Main consequence | Visual identity | Player feedback |
|---|---|---|---|
| Clear | Normal production and movement | Normal seasonal grade | Baseline weather label if useful |
| Rain | Wet-season production or outdoor modifier | Rain and darker wet ground | Weather notification when conditions change |
| Snow | Cold-season production/work modifier if intended | World-space snow and snowfall | Snow-start notification |
| Storm | Building damage and stronger weather | Heavy rain, wind, flashes | Warning, event log, damage feedback |
| Drought | Reduced farm yield and ecological stress | Dry ground, dry grass, dust/heat haze | Start notification and active-effect explanation |
| Fog | Reduced visibility or cosmetic atmosphere | Layered fog or haze | Explanation if it affects gameplay |

Fog should remain low priority until it has either a meaningful visibility consequence or a convincing presentation. A weak grey screen wash should not be treated as a finished feature.

## 9. Seasonal weather probabilities

Weather should not be equally likely in every season. The initial probability profile should make the seasons feel different.

| Season | Common | Occasional | Rare or disabled |
|---|---|---|---|
| Spring | Rain, clear | Fog, storm | Drought, snow |
| Summer | Clear, rain | Storm, drought | Snow, fog |
| Fall | Rain, clear | Storm, fog | Drought, snow |
| Winter | Snow, clear | Fog, rain/thaw | Drought |

The weather resolver may use season, temperature, and recent weather history. A drought should be more likely after a hot and dry period rather than appearing as an unrelated random result. Rain should be more common in spring and fall. Winter rain can represent a thaw and should reduce or darken visible snow rather than behaving like ordinary summer rain.

## 10. Snow presentation

Snow is derived from season and weather and does not mutate the logical terrain.

```text
Grassland + winter → snow-covered grass
Forest + winter → snow-covered ground and tree caps
Beach + winter → lighter snow or frost
River + winter → visible blue river with frost at banks
Mountains + winter → snow on upper silhouettes and ledges
```

Snow has two separate visual layers:

1. **Ground snow**, drawn below props, buildings, and actors.
2. **Accumulation caps**, drawn above selected tree, roof, rock, and mountain sprites.

Snow must use masks matching the actual visible sprite footprint. It must never be drawn as a full white rectangle over a transparent PNG boundary.

A simple first render-only state is sufficient:

```ts
interface WeatherVisualState {
  season: Season;
  weather: WeatherType;
  snowCoverage: number;
  snowFreshness: number;
  precipitation: number;
  fogAmount: number;
  droughtAmount: number;
  windX: number;
  windY: number;
  visualSeed: number;
}
```

The first version can derive coverage from winter and active snowfall. A later version may add gradual accumulation and melt based on recent weather history. That state should remain render-only until snow depth has a deliberate gameplay purpose.

## 11. Rendering layers

The experimental visual renderer should use a fixed canonical orientation and a stable layer order.

```text
1. Map background / void
2. Base visual terrain formations
3. Shoreline transition sprites
4. River formation layer
5. Mountain formation layer
6. World-space snow ground
7. Trees, rocks, bushes, and props
8. Snow caps on trees, roofs, rocks, and mountain peaks
9. Buildings and construction previews
10. People and animals
11. Screen-space rain, snow, leaves, and storm particles
12. Fog, drought grade, storm flash, and seasonal atmosphere
13. UI
```

The 10 px logical grid is visible only in debug mode. The camera transform applies consistently to the visual world. There must be no independent camera orientation for individual terrain sprites.

## 12. Side-by-side implementation

The current renderer remains the default until the experimental renderer passes acceptance criteria. Both renderers consume the same real `RenderSnapshot`.

```ts
type RendererMode = 'canvas' | 'experimental';
```

The first experimental build should contain a debug toggle or startup option. A comparison mode may later show two views of the same seed, season, and camera, but the first implementation should avoid running two complete renderers simultaneously unless profiling requires it.

The experimental renderer should begin with one controlled map slice:

```text
blank logical grid
+ grass field
+ grass/beach edge
+ beach/shallow-water edge
+ connected river
+ clustered mountain formation
+ trees and one building
+ winter snow layer
```

This prototype should be tested before implementing all assets, all weather types, or a full renderer migration.

## 13. Implementation sequence

### Phase 1: Contract and cleanup

Centralize terrain properties. Merge `Forest` and `DarkForest` if their semantics are identical. Remove `Snow` as a terrain identity if it is only used for winter appearance. Protect natural water and high terrain during camp clearing. Repair or remove missing shoreline assets.

### Phase 2: Real-data projection

Create the visual formation types and projection functions. The projection must consume the real generated `WorldState` and preserve a mapping to logical cells. Add canonical river and mountain formation data.

### Phase 3: Experimental terrain renderer

Build the new visual terrain beside the existing Canvas renderer. Implement grass, water, shoreline, river, and mountain formations with fixed orientation and consistent world coordinates.

### Phase 4: Seasonal and weather layers

Add the pure weather visual resolver, world-space snow ground, masked mountain/tree/roof caps, rain, snow, storm particles, and drought ground treatment. Keep simulation weather consequences in the worker and `worldEvents.ts`.

### Phase 5: Player feedback

Add transition-based notifications and event-log entries for drought, snow, storm, and any weather state with a gameplay consequence. The notification should occur when the weather changes, not every tick.

### Phase 6: Performance and invalidation

Keep static terrain, formation, and decor caches separate from dynamic weather. A weather change should update only weather-ground, particles, and atmosphere. Seasonal blend changes must not dispose and rebuild every terrain chunk.

### Phase 7: Migration decision

Compare the experimental renderer with the current renderer using the same real simulation, seed, preset, camera, and weather. Do not remove the fallback until the new path is visually and functionally superior.

## 14. Testing strategy

Unit tests remain useful for pure rules but are not sufficient proof of the production game.

### Unit tests

Test terrain definitions, transition rules, formation classification, snow coverage, weather visual resolution, and deterministic visual seeds.

### Integration tests

Start the real game initialization and run real simulation ticks. Verify that terrain identity, buildability, movement, production, season, and weather remain correct while the visual projection changes.

### Browser acceptance tests

Use the actual worker and renderer. Verify the Mountainous preset has buildable starting space, rivers are connected, mountains are clustered, shorelines are readable, winter snow appears white at normal zoom, and camera movement does not detach or swim the visual layer.

### Required acceptance conditions

| Area | Acceptance condition |
|---|---|
| Simulation | The same real `WorldState` produces the same gameplay results in both renderer modes |
| Terrain | Visual formations never mutate logical terrain or buildability |
| Starting area | The camp has enough buildable space without destroying natural water or mountains |
| Shorelines | Grass, beach, shallow water, river, and deep water are visually distinct and aligned |
| Rivers | The primary river is present in canonical river data and has a continuous visual core |
| Mountains | Mountain visuals form connected ranges with spaced landmarks |
| Winter | The map becomes visibly white without rivers disappearing or snow becoming square halos |
| Drought | Farm penalty is visible in the UI and announced when drought begins |
| Storm | Damage and warning feedback remain connected to real simulation effects |
| Fog | Either has a clear purpose or is explicitly treated as cosmetic/postponed |
| Camera | Panning and zooming preserve alignment with the logical world |
| Performance | Weather changes do not cause full terrain rebakes |
| Rollback | The current renderer can be re-enabled immediately |

## 15. Final design principle

Wilderfolk should not generate terrain categories merely because the code can name them. It should generate meaningful simulation data and project that data into a larger, more readable visual geography.

The final target is:

```text
one real simulation
+ one authoritative logical grid
+ one clear terrain-definition table
+ one larger visual projection
+ independent seasonal and weather layers
+ current renderer retained as fallback
```

The new system is a significant amount of work, but it addresses the root problem rather than adding another patch to the existing terrain bake. The work should proceed incrementally, with the experimental renderer built beside the current implementation and validated through the real running simulation.
