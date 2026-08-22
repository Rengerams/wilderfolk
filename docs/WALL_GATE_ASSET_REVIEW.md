# Wall and Gate Asset Review

## Inspected assets

- `public/sprites/wall_isometric.png`: 64 × 64 PNG, approximately 2.6 KB. It is a compact isometric stone-wall segment with transparent background and a suitable in-game sprite scale.
- `public/sprites/Gate .png`: 1254 × 1254 PNG, approximately 958 KB. It is a large isometric stone-and-wood gate asset with transparent-looking black preview background. The filename contains an unintended space before `.png`, and its working dimensions are far larger than the wall asset.

## Integration implications

The wall and gate should not be wired by changing collision or building footprints first. Existing wall/gate placement, rendering, collision, save/load and asset-loader ownership must be traced. The gate should be normalized through a controlled asset-preparation pass: preserve the source, remove unintended opaque background pixels if present, crop transparent padding where safe, export a predictable filename, and scale it according to the existing wall/building render convention.

The canonical wall asset is `wall_isometric.png`; `wall.png` must not be selected accidentally. The gate’s visual dimensions must be decoupled from its logical footprint so its art can be larger than the collision rectangle without changing simulation behavior.

## Existing game logic findings

- `BuildingType.Wall` uses a 60 × 40 logical footprint and currently points to `/sprites/wall_straight.png` in the building catalog.
- `BuildingType.WallCorner` uses a 48 × 48 logical footprint and is rendered through procedural corner/junction logic.
- `BuildingType.WallGate` uses a 60 × 48 logical footprint and currently points to `/sprites/wall_gate.png` in the building catalog.
- Completed walls, corners and gates are rendered by `src/game/renderer/buildings.ts`, but strip types currently use `drawProceduralStripBuilding` from `src/game/stripRender.ts`; ordinary building sprites are drawn through `getSpriteFrame` and `drawBuildingSprite`.
- Wall topology, strip snapping, junction detection and defensive behavior are separate from the visual renderer. The safest integration is therefore a visual asset path inside the existing renderer, leaving logical dimensions, placement, collision, topology and save behavior unchanged.

## Palette and normalization results

The original wall uses a compact 16-color pixel palette, while the large generated gate and watchtower contain thousands of anti-aliased RGB colors. The normalized game-ready outputs now use a shared 24-color Wilderfolk defensive palette covering deep outlines, charcoal stone, warm stone highlights, dark-to-warm wood, iron, blue cloth and restrained gold/orange accents. Alpha was preserved throughout.

The normalized outputs are `gate_isometric.png` at 96 × 96 and `watchtower_isometric.png` at 112 × 128. The original `Gate .png`, `watchtower.png` and `wall_isometric.png` sources remain preserved; only the new normalized gate/tower outputs were palette-adjusted. The wall remains 64 × 64 because it was already compact and pixel-art-like.

The gate silhouette remains readable after normalization, but it is visually more detailed than the wall because it originated from a much larger source. A final in-game screenshot is still required before committing renderer path changes.

## Final integration status

The renderer now uses the normalized wall and gate assets for straight segments and falls back to the existing procedural strip art while an image is not yet loaded. The Watchtower uses the normalized sprite through the ordinary building path, with an optional horizontal mirror on the existing 90-degree building orientation. This mirror is visual only and does not alter the building footprint, collision, defense score or saved state.

The full regression suite passed with 77 test files and 435 tests. The production build also passed. Remaining build output is the pre-existing circular `game-render`/`game` chunk warning and the large `game` chunk; neither was introduced by the asset pass.
