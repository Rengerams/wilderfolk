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
