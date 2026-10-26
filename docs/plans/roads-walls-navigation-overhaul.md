# Roads, Walls, Gates & Navigation Overhaul — implementation brief

Status: implemented in PR #59; local validation passed in the owner-adjusted scope. Verification details and scope limits are recorded below.

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
Long straight and L-shaped drags, corners, T and cross junctions, reconnecting and demolishing segments, terrain policy, gate insertion and removal, sealed enclosures, blocked-route recovery, road preference based on travel time, actual road speed bonus, older save hydration, worker roundtrips and preservation of established performance budgets.

## Next work
Review the final PR and its remote CI before merging. Local standard checks, annual integration and three-zoom visual inspection have passed.


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

### Verification and current scope

The owner removed full responsiveness at 1,800 settlers and testing with a real
historical settlement save from this PR's mandatory acceptance criteria. Existing
performance budgets and synthetic legacy save compatibility remain applicable.

| Check | Result |
| --- | --- |
| Final complete standard gate | PASS: 377 files; 2,436 passed, 2 existing skipped; 185.1 seconds |
| Road/infrastructure regression tests | PASS: 46 tests, including short trips and savings below five percent |
| Pointer-jitter and strip regression tests | PASS: 36 tests; seven new jitter cases fail before the fix and pass after it |
| `npm run test:types` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS; existing large-chunk warning remains |
| `npm test -- invariant-test` | PASS: 360 days; 157.75 seconds with the original 300,000 ms timeout |
| `node scripts/test.mjs scripts-types` | PASS: missing Building type import and unused assertion helper fixed |
| Real browser infrastructure view | PASS: saved scenario loaded through the normal UI; 50%, 75% and 145% zoom; no page errors |

The original annual run overlapped the complete test suite and exceeded its timeout.
The isolated rerun completes within the same budget. The annual harness now counts
only new chronicle entries using the log owner's newest-first monotonic ID contract,
instead of scanning the complete history on every tick. Its duration, simulation,
checkpoints and assertions remain unchanged.

Road route selection no longer ignores trips below 150 pixels or savings below five
percent. Existing bounded A* searches, accepted-waypoint reuse and rejected-detour
caching remain; regression coverage includes an unrelated distant road. The latter
fixture now keeps its route on the intended row instead of accidentally crossing
the road diagonally through a duplicated x coordinate.

The visual mode extends the existing population harness with an opt-in synthetic
save export (`PERF_INFRASTRUCTURE_VISUAL_SAVE`) and the existing browser harness with
`--infrastructure-save`. It shows repeated horizontal roads, perpendicular crossings,
wall runs and gates at actual footprint spacing. Temporary Chromium and Python tools
are verification tools only; no browser binary or additional runtime dependency ships.
The screenshots were manually inspected for road continuity and upright wall/gate art.
These captures do not claim to measure interaction latency or every possible layout.

Gate locking remains an optional future gameplay feature; this PR preserves the
existing passable gate model. The navigation regression closes an opening by replacing
a gate with a wall. Boat mechanics are also outside this PR.

### Updated requirement assessment

| Requirement | Result |
| --- | --- |
| Drag roads and walls | Implemented; bounded single-command planning and multi-turn regressions |
| Automatic road connections | Footprint-based classification; snapping radius is pointer assistance only |
| Seamless road/wall presentation | Browser captures inspected at three zoom levels; renderer regressions |
| Physical walls | Movement, blocked-route recovery, diagonal corner and sealed-enclosure regressions |
| Gates in existing walls | Alignment, passage, failure preservation and resource accounting covered |
| Bulk demolition | Bounded worker command, shared cleanup/refunds and unrelated-building preservation |
| Faster road travel | Weighted routing and exact-surface speed; short and small-benefit trips covered |
| Traversable terrain foundations | Dry passable terrain accepted; water and reserved obstacles rejected |
| Existing supported saves | Synthetic 0.6.5.0 infrastructure matrix retained across three load cycles |
| Documentation and licences | Ownership, roadmap, changelog, asset register and third-party notices updated |

Shell: Linux/Bash; the Windows-specific command.md file is absent in this checkout.
Temporary browser, scenario and screenshot files are cleaned up after verification.
No profile, scheduled task or global Git configuration is changed.

### Follow-up: complete route and placement contracts

- Affordability is calculated before drawing a strip stroke, including any capped refund for a replaced wall. A blocked or unfunded segment is not shown as valid; the overlay lists net cost, available stores and shortage. A broken wall preview does not claim a sealed enclosure.
- The workforce commute fallback computes the exact union of paved portions on a straight leg; a short road cannot discount a full journey. When a route grid is available, its weighted A* cost remains authoritative.
- Road drag endpoints can snap to the front approach of completed player homes and workplaces, outside the building foundation. Existing road junction snaps take precedence.
- Completed wall gates can be opened/closed from their building panel. The worker command persists the closed state and pathfinding treats closed gates as solid wall cells; old saved gates default to open. Closed gates have a visible latch marker. The old wall-replacement workflow remains valid.
- Emergency relocation checks the full movement path before changing position, preventing a stuck walker from teleporting across a completed blocking wall or river.
- Virtual-player road work requires the established food buffer and tracks actual material deductions across every leg of a corridor; emergency food recovery is not displaced by paving.
- Full-scale 1,800-settler responsiveness and a real historical save remain owner-waived for this PR; synthetic compatibility and existing performance gates still apply.

### Pointer drift correction

Freehand strokes reuse the same minimum bend distance as the drag planner. Sub-threshold
minor movement stays projected onto the accepted axis; small subsequent samples accumulate
from that projected anchor. This prevents an incidental perpendicular piece from being
built or charged for without dropping genuine diagonal legs or multi-turn strokes.
