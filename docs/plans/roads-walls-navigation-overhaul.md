# Roads, Walls, Gates & Navigation Overhaul — implementation brief

Status: implementation pending. This branch is reserved for the coordinated overhaul.

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
Implement, validate and update roadmap, changelog, ownership and asset documentation. This brief is not an implementation or a passing test report.


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
