# CC-BY 4.0 Dirt Path Implementation Plan

**Project:** Wilderfolk  
**Status:** Planning only; no production integration started  
**Asset:** *Dirt Path Tileset* by [Scobmyster](https://opengameart.org/users/scobmyster)  
**Source:** [OpenGameArt.org — Dirt Path Tileset](https://opengameart.org/content/dirt-path-tileset)  
**License:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

## Plan verification — 2026-08-21

This plan was re-checked against `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md`, `docs/SIMULATION_AUTHORITY.md`, `THIRD_PARTY_NOTICES.md`, `stripJunction.ts`, `stripTopology.ts`, and `stripRender.ts`. The review confirmed that the prototype remains presentation-only and that the existing road topology remains authoritative.

The plan now explicitly accounts for the current contract nuance that straight and endpoint road pieces may not carry `junctionInfo`. A future adapter must derive that information from existing read-only topology or pass it through a presentation-only contract; it may not invent a second road graph or mutate simulation state. The plan also includes the required Simulation Change Record, attribution preservation, acceptance criteria, performance checks, full validation commands, and rollback procedure.

Verification result: **plan approved for isolated prototype work only**. Production integration remains blocked until the visual and technical acceptance gates pass. `git diff --check` passed for the revised plan and notice file.

## Review incorporation — 2026-08-21

The attached review approved the plan for an isolated visual prototype and confirmed that this should remain presentation polish rather than a new gameplay system. The following review recommendations are binding additions to the acceptance process:

1. Phase A is approved immediately; Phase B is allowed only after the standalone preview passes the visual gate; the existing renderer remains the default until Phase C and full regression/performance checks pass.
2. The smallest useful prototype is one fixed map seed containing a straight, corner, tee, cross and endpoint route, shown beside the current renderer at normal gameplay zoom.
3. The key visual decision is whether the new path makes the settlement feel more lived-in and readable without becoming noisier, more artificial, or less consistent with the existing world.
4. A visually attractive asset sheet alone is insufficient evidence. The connected route and side-by-side in-world view are the acceptance artifacts.
5. Performance testing must include a deliberately dense road map with many connected segments and junctions, seasonal tinting, zoom changes, texture-cache observation and memory/frame-time comparison against the current renderer.
6. Every derived filename must retain a provenance record identifying the original source file, author, license, source URL, and the exact Wilderfolk modification. If a derived asset is renamed, cropped, recolored, merged or removed, the provenance record and `THIRD_PARTY_NOTICES.md` must remain accurate.
7. Do not add simulated foot traffic to justify the visual. Any future activity-responsive gameplay would be a separate proposal with its own owner, cadence, state, invariants and tests.

## 1. Purpose

The purpose of this plan is to evaluate and, if accepted, safely introduce a dirt footpath visual for Wilderfolk. The path should look like it has been used by many villagers: the centre should be compacted and darker, the edges should be irregular, grass should reclaim parts of the border, and junctions and endpoints should show heavier wear.

The first deliverable is an isolated visual prototype. Existing production assets, terrain mapping, road topology, simulation state, saves, worker commands, pathfinding, and cadence must remain unchanged until the prototype passes the acceptance gate in this document.

> **Core rule:** the external asset may influence presentation, but it must never become a new simulation authority.

## 2. License and attribution requirements

The asset is licensed under CC BY 4.0. Wilderfolk may share, adapt, and use it commercially, provided that appropriate credit is given, the license is linked, and changes are indicated.[1]

The attribution must identify the original title, author, source, license, and Wilderfolk modifications. The required notice is maintained in `THIRD_PARTY_NOTICES.md`.

Recommended attribution text:

> “Dirt Path Tileset” by Scobmyster, obtained from OpenGameArt.org, licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Wilderfolk modifications: tiles were selected, recolored or masked where applicable, combined with original Wilderfolk wear overlays, and integrated as a presentation-only prototype.

Until the asset is actually shipped, the notice must remain clearly marked as **reviewed candidate — not currently shipped**. If it enters the production bundle, the notice must be changed to a shipped-asset entry with the exact in-game file path.

## 3. Scope boundaries

| Included in the prototype | Explicitly excluded from the prototype |
|---|---|
| Isolated dirt-path preview assets | Replacing `tileset_grass.png` |
| Straight, vertical, corner, tee, cross and endpoint samples | Changing `TerrainType` or `WorldMap` |
| Worn-earth, grass-reclaim and debris overlays | Changing pathfinding or collision rules |
| Deterministic visual variation | Adding pedestrian-count simulation state |
| Side-by-side visual comparison | Changing saves or migrations |
| Optional render-only development toggle later | Changing worker commands or simulation cadence |

The prototype must live outside the production sprite import path until it is accepted. Removing the prototype directory must be sufficient to remove the experiment.

## 4. Prototype asset preparation

The two source sheets should be preserved unchanged as the original reference. Derived files must be stored separately and clearly marked as Wilderfolk modifications. The original source files, attribution text, source URL and license URL must travel with the prototype/reference directory so the provenance remains available even if derived assets are moved.

Maintain a provenance table for every derived file:

| Derived file | Original source file | Author | License | Modification | Status |
|---|---|---|---|---|---|
| `prototype/ccby-dirt-path-reference/<derived-file>.png` | `dirtpathtileset4.png` or `dirtpathtileset4_2.png` | Scobmyster | CC BY 4.0 | Selected, cropped, masked, recolored or combined with Wilderfolk wear overlays | Prototype only |

The table must be updated whenever a derived asset is renamed, cropped, recolored, merged, replaced or removed. No derived file may enter the production bundle without a matching notice and exact shipped path.

The prototype should contain the following visual cases. The first review artifact must use one fixed map seed and one connected route containing a straight, corner, tee, cross and endpoint, plus a side-by-side comparison with the current renderer at normal gameplay zoom.

| Variant | Required purpose |
|---|---|
| `straight` | Horizontal connection between two adjacent segments |
| `vertical` | Vertical connection with consistent width and rotation |
| `corner` | A readable 90-degree bend |
| `tee` | Three-way connection |
| `cross` | Four-way connection |
| `endpoint` | A natural path ending in grass |
| `wear-overlay` | Dark compressed lanes and broken soil variation |
| `grass-reclaim` | Irregular grass and weeds crossing the border |
| `debris` | Small stones and mud accents |

The first visual master should establish the final palette, tile scale, transparency rules, path width, and edge treatment. Other variants should be derived from the same visual language rather than generated as unrelated images.

## 5. Visual design requirements

The path must read as a **well-used pedestrian path**, not as a paved road or a perfectly repeated brown rectangle. It should have a warm earth base, a darker compacted centre, two subtle broken traffic lanes, and an irregular transition into the surrounding grass.

The wear pattern should be deterministic. A stable seed derived from segment position and map seed may select small variations, but no persistent `footTrafficCount` or equivalent simulation field is required for the first implementation.

The visual layer order should be:

```text
existing terrain background
  -> dirt-path base
  -> low-opacity material variation
  -> dark compacted traffic lanes
  -> broken lighter centre highlights
  -> grass reclaim and mud edges
  -> small stones and debris
```

The external CC-BY asset provides the initial path geometry. Wilderfolk-specific overlays provide the distinctive crowded-footpath appearance.

## 6. Proposed render-only architecture

If the prototype passes review, the production adapter should consume existing road topology rather than creating a second road network. Existing topology remains responsible for placement, snapping, segment connectivity and junction classification.

A future pure presentation helper may expose a shape similar to:

```ts
type WornPathVariant =
  | 'straight'
  | 'vertical'
  | 'corner'
  | 'tee'
  | 'cross'
  | 'endpoint';

interface WornPathVisual {
  variant: WornPathVariant;
  wearSeed: number;
  wearStrength: number;
  edgeReclaim: number;
}
```

The helper may read existing `StripJunctionInfo`, segment position and other read-only snapshot data. It must return presentation data only. It must not write buildings, terrain, relationships, resources, schedules, fatigue, commands, saves, worker state or simulation clocks.

The likely implementation boundary is alongside the existing strip presentation code, such as `stripRender.ts`. The existing topology code remains authoritative and must not be duplicated in the new visual adapter.

### Architecture constraint verified against the current code

The current road placement contract does not attach `junctionInfo` to every road piece: straight and endpoint pieces may arrive with only their base strip rotation, while elbow, tee and cross pieces may carry junction data. Therefore, a production adapter must not assume that `junctionInfo` is always present. Before runtime integration, choose one of these safe options and document the choice:

1. derive the missing straight/end presentation from the existing read-only building/road topology through `detectBuildingJunction()` at render preparation time; or
2. extend the presentation data contract so the already-computed read-only junction information is passed through without changing simulation ownership or persisted state.

The adapter must never infer a new road connection by mutating buildings or by maintaining a second topology cache that can diverge from the authoritative road layout. This is a required design checkpoint, not optional polish.

## 7. Integration sequence after prototype approval

### Phase A — Standalone preview

Build a static preview using fixed sample topology. Display every required variant individually and as a connected route. This phase must not import live game state or production renderer modules.

### Phase B — Development-only toggle

If the preview is approved, add a development-only presentation toggle. The current road renderer remains the default. The toggle must make old and new visuals comparable on the same map seed, camera, zoom and road layout.

### Phase C — Read-only runtime adapter

Connect the adapter to existing topology and junction information. The adapter selects and draws assets but does not decide whether a road exists, whether it is complete, how agents navigate, or how the world is saved.

### Phase D — Limited asset bundle

Ship only the selected derived tiles and overlays. Do not load the entire external package if only a small subset is needed. Keep original attribution and source files available in the project documentation.

### Phase E — Default decision

The new visual remains optional until it has passed the complete acceptance gate and full regression validation. If it is rejected, the existing renderer remains unchanged.

## 8. Acceptance criteria: visual quality

The prototype is considered visually good only when every criterion below passes.

| Criterion | Pass condition |
|---|---|
| Path identity | A player can immediately recognize the asset as a dirt footpath rather than a paved road |
| Heavy use | The dark compacted centre and two broken traffic lanes visibly communicate repeated pedestrian use |
| Natural edges | Grass reclaim is irregular and does not form a perfect border or repetitive noise pattern |
| Width | Straight segments, corners and junctions have a consistent readable width |
| Connectivity | Straight, vertical, corner, tee and cross variants connect without gaps, overlaps or exposed transparent holes |
| Endpoint | Endpoints fade naturally into grass and do not look abruptly cut off |
| Junction wear | Intersections and frequent-route areas show slightly stronger wear without becoming black or muddy |
| Style match | The asset fits Wilderfolk’s pixel-art and top-down visual language at normal gameplay zoom |
| No obvious tiling | Repetition is not immediately visible across a connected route |
| Pixel integrity | Pixels remain crisp; no unintended blur, anti-aliasing or coloured fringe is visible |
| Readability | The path remains distinguishable under normal terrain, seasonal tint and map lighting |

A visual review fails if any connection type visibly breaks, if the path looks like a rectangular overlay, or if the material style overwhelms the surrounding Wilderfolk world.

## 9. Acceptance criteria: technical and authority safety

| Criterion | Pass condition |
|---|---|
| Simulation authority | No renderer or visual helper mutates authoritative simulation state |
| Existing topology | The adapter consumes existing road topology and does not create a second road graph |
| Save safety | No save schema or migration is required for the visual prototype |
| Worker safety | Worker commands, snapshots and command-result semantics are unchanged |
| Fallback | Missing assets or disabled toggle use the existing road renderer without errors |
| Determinism | Same map seed, segment layout and camera produce the same visual variant selection |
| Isolation | Prototype files can be removed without changing gameplay or save compatibility |
| Attribution | `THIRD_PARTY_NOTICES.md` contains the correct author, source, license link and modification statement |
| Build health | Typecheck, lint, tests and production build remain successful |
| Scope discipline | School, Church, Town Hall, schedules, fatigue, rival systems and unrelated terrain remain untouched |

## 10. Simulation Change Record

The isolated prototype has no simulation owner and writes no simulation state. If a render-only runtime adapter is later approved, its change record must be completed before code changes are merged:

```md
## Simulation Change Record

- Owner module: render-only road presentation adapter; authoritative road topology remains in existing strip topology/building state
- Decision changed: visual tile selection only; no gameplay decision changes
- Cadence: render preparation / existing presentation cadence; no simulation cadence change
- State fields written: none
- Why the change is needed: improve dirt-path readability and communicate repeated pedestrian use
- Player-visible behavior before: existing procedural/pavement road presentation
- Player-visible behavior after: optional worn dirt-path presentation using existing road topology
- Performance impact: measured texture-cache and frame-time comparison required
- New or updated tests: pure variant mapping, deterministic wear, alpha/fallback, road-strip renderer, worker command/state parity
- Invariants checked: worker authority, no renderer mutation, road topology consistency, save compatibility
- Save/migration impact: none expected; reject integration if migration becomes necessary
- Rollback plan: disable the development toggle and remove the render-only adapter/assets; retain the existing renderer
```

## 11. Test plan

Pure mapping tests must cover all six variant types, rotation, deterministic wear selection, fallback selection and invalid or missing asset handling. Renderer tests must verify alpha behaviour, path width, connected edges and that the render path does not mutate input state.

A browser smoke test should use the existing real worker/runtime flow to verify command/state parity. It should confirm that enabling or disabling the presentation toggle does not alter authoritative snapshots, command results, save output or daily simulation behaviour.

The following final checks are required before any default-on decision:

```text
npm run test:types
npm test -- --run
npm run lint
npm run build
git diff --check
```

The relevant worker, road-strip, renderer and simulation-authority tests must be included in the final report.

## 12. Performance criteria

The new presentation must not create a visible frame-rate regression on maps containing many road segments. Texture loading must be cached, repeated patterns must not allocate per frame unnecessarily, and the full external archive must not be loaded when only selected derived assets are required.

The benchmark must include a deliberately dense road map with many connected straight segments, corners, tees and crosses. It must compare the current renderer and the prototype under the same fixed map seed, camera, zoom levels and seasonal tinting. Record frame time, observed FPS, texture/cache behavior, image-decoding behavior, and memory/allocation symptoms during zoom changes and redraws.

The performance review fails if the new path causes repeated image decoding, unbounded canvas allocations, new per-frame state writes, a noticeable FPS drop, material memory growth during camera/zoom changes, or a regression that appears only on the dense-road scenario.

## 13. Rollback procedure

The first integration must be hidden behind a development toggle. If visual quality is poor, disable the toggle and retain the existing renderer. If technical problems occur, remove the render-only adapter and prototype assets. No save migration, world-map repair or simulation rollback must be required.

The rollback is complete when the repository returns to the previous production path renderer, all tests pass, the external asset is no longer in the production bundle, and `THIRD_PARTY_NOTICES.md` accurately reflects whether the asset is shipped or only reviewed.

## 14. Final decision gate

The CC-BY 4.0 dirt path may move from prototype to optional runtime integration only if all of the following are true:

1. Every visual acceptance criterion passes.
2. Every technical and authority criterion passes.
3. The full test, typecheck, lint, build and diff checks pass.
4. The asset remains visually compatible with Wilderfolk at normal zoom.
5. Attribution and modification notices are complete.
6. Performance is neutral or acceptably improved.
7. The fallback renderer remains reliable.
8. Rollback can be completed without save or simulation migration.

Until that gate passes, the correct status is **prototype/reference only — not shipped**.

## References

[1]: https://creativecommons.org/licenses/by/4.0/ "Creative Commons Attribution 4.0 International"

[2]: https://opengameart.org/content/dirt-path-tileset "OpenGameArt — Dirt Path Tileset by Scobmyster"
