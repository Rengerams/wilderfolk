# Roads, Walls, Gates & Navigation Overhaul — implementation brief

Status: implemented in PR #59; validation and remaining limitations recorded below.

## Required outcome
- Click-and-drag roads and walls with seamless, deterministic connections and clear previews.
- Road placement on ordinarily traversable terrain without normal-building foundation restrictions.
- Drag-to-demolish infrastructure in one authoritative batch operation.
- Click-to-insert a gate into a suitable existing wall.
- Completed walls are impassable to settlers except through valid gates; no steering, smoothing, or failed-path fallback may bypass collision.
- Settlers prefer roads when the total route is faster and receive the existing 1.5x movement bonus only while actually traversing road surface.
- Preserve save compatibility, worker command invariants, determinism, and large-settlement performance.

## Implementation constraints
Read AGENTS.md and OWNERSHIP_OVERVIEW.md first. Audit existing stripBuild, stripTopology, stripJunction, stripRender, buildingPlacementActions, placementUtils, buildingMaintenanceActions, useCanvasInteractions, pathfinding, movementSteering and simWorker/commands. Prefer extending authoritative modules. No re-exports, unnecessary aliases, magic numbers, duplicate owners or forwarding wrappers. Define constants at top of owning modules. Only zero-cost commercially usable sprite assets; verify license and attribution. Existing code or compatible open-source libraries may be reused if this simplifies the architecture.

## Agent discretion
The coder may propose and implement a simpler or more robust architecture, explaining significant tradeoffs. Do not mechanically create all suggested modules; retain one authoritative source for topology, validation and navigation. Do not claim implementation is complete until acceptance tests and the required pipeline pass.

## Acceptance tests
Long straight and L-shaped drags, corners, T and cross junctions, reconnecting and demolishing segments, terrain policy, gate insertion and removal, sealed enclosures, blocked-route recovery, road preference based on travel time, actual road speed bonus, older save hydration, worker roundtrips and performance at 1,800 settlers.

## Next work
Complete visual acceptance and review measured performance against the settlement budget before merging.


## Future travel modes: navigation architecture constraint

The current implementation must support walking correctly, while leaving a clear extension path for future travel modes such as boats. Do not implement unused boat gameplay now.

- Separate **route selection** from **mode-specific traversability and movement cost** without creating unnecessary wrappers, aliases, re-exports, or speculative frameworks.
- Walking remains the implemented mode: traversable land, roads, bridges, walls and gates; road speed bonus applies only to walkers physically on a road.
- A future boat mode may have distinct passability (navigable water), speed and route costs. A boat must not be allowed to traverse ordinary land merely because walking paths exist.
- Future multimodal journeys may require explicit transfer nodes, such as docks: walk to dock, board boat, travel on water, disembark at another dock, walk onward. Do not allow arbitrary transfers in the middle of water.
- Keep authoritative terrain, collision, and cost rules mode-aware where needed, but avoid introducing an unused transport framework or second independent pathfinding engine.
- Preserve existing save formats and movement APIs unless a necessary, reviewed change is justified.
- Prefer small extension points that can be exercised by today's walking tests; document how boat navigation could be added later.
- Tests for current walking must continue to enforce walls, gates, roads and bridges. Add focused tests for any new mode-sensitive boundary introduced now.

The coding agent has discretion to propose a better extensibility design and must explain tradeoffs. All module-level configuration constants belong near the top of their owning module; no magic numbers.


## Design intent clarification: riverboats extend practical travel range

Boats are not merely a hypothetical additional locomotion mode. The gameplay motivation is that settlers' current walking speed and commute/reach limits make distant destinations impractical or unreachable. Navigable rivers could become faster transport corridors that extend settlement access and economic reach without arbitrarily increasing walking speed.

For future implementation, the planner should compare **complete door-to-door travel time**, including walking to a dock, boarding/waiting, boat journey, disembarking, and final walking. A boat-assisted route should be preferred only when faster and feasible, not simply because water is present. River direction, navigability, dock accessibility, capacity and scheduling are design considerations for that future feature, not rules to invent or hardcode now.

Important architectural implication: commute eligibility and destination reach must eventually consume the same route-cost model as navigation, so a feasible river journey can genuinely make a distant destination reachable. Do not implement boat transport as a separate cosmetic shortcut or ignore the commute budget. Current PR scope remains fixing walking, roads, walls and gates, with an extension point for later river transport. The coding agent may recommend the smallest sound architecture to support this.


## Acceptance follow-up — 2026-10-26

### Architecture and corrections

Keep the existing construction command, placement, demolition and A* owners. No new
runtime dependency or save schema is needed. Pointer snapping may use a radius, but
junction classification reads actual saved rectangles: nearby disconnected pieces
and distant pieces no longer create phantom arms, and a real crossing has four arms.
The previous alternative coerced coincident strips to an elbow and resnapped legacy
coordinates during rendering, disagreeing with physical geometry.

Road foundations now accept dry passable terrain, including ordinary mountain, snow
and riverbank tiles, while rejecting reserved boulders and water. Ordinary building
foundation restrictions stay in their existing owner. Only bridges clear terrain
blockers in the navigation raster. Roads over water in older saves remain saved but
cannot become accidental bridges. Grid signatures include dimensions and road versus
bridge type. Road speed checks exact rectangles in a per-cell surface index, avoiding
a full building scan for every settler and preventing bonuses beside narrow roads.

### Test matrix

- Existing strip tests cover straight and freehand multi-turn drags, diagonal legs,
  duplicate prevention, preview guards, crossing validity and bounded worker commands.
- Infrastructure acceptance tests cover dry rocky foundations, reserved decor, water
  rejection, legacy roads over water versus bridges, incomplete walls, completion,
  wall-to-gate opening and closure by wall replacement, removal, sealed rectangles,
  exact surface speed eligibility, failed non-destructive gate replacement, alignment,
  cost/refund accounting and preserving unrelated buildings during batch demolition.
- Supported legacy version 0.6.5.0 is loaded three times with long roads, a perpendicular
  road, walls, a gate, a bridge and unfinished construction; IDs, footprints and progress
  remain unchanged. This is a generated legacy-format fixture, not a real historic save.
- Junction geometry cases cover disconnected parallel strips, distant strips, crosses,
  endpoint T-junctions and off-grid legacy coordinates.
- The existing final-approach route fixture supplied the x tile for both axes, placing
  its target outside the map. Corrected coordinates test the intended accepted route.
- The old lone-crossing test expected a two-arm elbow; it now requires all four arms.

### Assets and scope

No new art or libraries were imported in this follow-up. The existing three Drummyfish
sprites are CC0, verified against their OpenGameArt source on 2026-10-26; central asset
and third-party registers now include them and the two original SVG fallbacks.

### Verification limits

The full browser and zoom-level visual acceptance is not yet executed: this host has
no installed Playwright Python package or Chromium executable. Renderer unit assertions
are not a substitute for visual inspection. Gate toggling/locking is not a distinct
saved gameplay feature; navigation tests close an opening by replacing the gate with a
wall. No boat mechanics or unrelated gameplay changes are introduced.

The existing population benchmark now accepts PERF_INFRASTRUCTURE=1, adding 72 road
pieces and 72 wall/gate pieces to the 1,800-settler city. This is a simulation benchmark;
it does not measure pointer latency or canvas frame time. Initial runs shared CPU with
the full test suite and are unsuitable for claiming a performance improvement. Both
versions produced the same final delta fingerprint, 0a40016f2632d2ec.
