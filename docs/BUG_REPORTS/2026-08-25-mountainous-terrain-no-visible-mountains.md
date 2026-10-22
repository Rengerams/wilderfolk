# Bug: Mountainous terrain has no visible mountain tiles
- Status: resolved — live verification pending
- Date discovered: 2026-08-25
- Version/build: 0.6.3.1 development
- Reporter: Wilderfolk development audit
- Area: UI
- Owner module: `src/game/spriteLoader.ts` and `src/game/terrainLayer.ts`
- Cadence: Startup preload and terrain-decoration bake
## Status history
- 2026-08-25 — open (Mountainous map screenshot showed grassland and rivers without visible mountain peak sprites)
- 2026-08-25 — investigating (terrain generation and renderer paths were traced)
- 2026-08-25 — resolved — live verification pending (preload/rendering contract repaired; browser confirmation remains)
## Observed behavior
A new game using the Mountainous terrain preset generated a map that visibly contained grassland, forests, and rivers, but no mountain peak tiles or mountain peak overlays appeared in the map view.
## Expected behavior
Mountainous maps should show the generated mountain relief and the supplied rotated mountain peak sprites after the startup asset preload and terrain decoration bake complete.
## Reproduction steps
1. Start Wilderfolk and choose New Game.
2. Select the Mountainous map preset.
3. Start the map and inspect the terrain at a normal zoom level.
4. Observe that mountain peak sprites are absent.
## Evidence
The Mountainous screenshot supplied on 2026-08-25 showed no visible mountain peaks. The earlier terrain-generation test passed because it only counted generated `TerrainType.Mountains` tiles; it did not test the asset preload or canvas rendering path.
## Root cause
The mountain PNG files existed in `public/sprites/mountains/`, and `terrainLayer.ts` referenced them, but `spriteLoader.ts` did not include them in `preloadAllSprites()`. Consequently `getSprite('/sprites/mountains/<rotation>.png')` returned `null` while `stampMountainPeaks()` baked terrain decorations, so the draw operation silently skipped the mountain overlays. The preload list and terrain readiness check also used separate path definitions, allowing them to drift apart.
## Fix
The four mountain sprite paths were added to `preloadAllSprites()` through the shared `MOUNTAIN_SPRITE_PATHS` constant. The terrain-layer readiness check now consumes the same shared constant, ensuring the preloaded assets are the exact assets required by the renderer.
## Regression test
`tests/mountainous.visibility.test.ts` verifies Mountainous terrain generation. It must be paired with the shared asset-contract check and live browser verification because terrain generation alone cannot prove visual output.
## Invariants checked
Mountain sprites remain presentation-only. No terrain topology, buildability, pathfinding, simulation cadence, or WorldState ownership was changed.
## Save/migration impact
No save or migration impact. Existing saves retain their existing terrain. A refreshed application and a newly generated Mountainous map are required to verify startup preload behavior.
## Verification result
Automated build, TypeScript, lint, terrain-generation, and terrain-atlas checks must pass. Final player-facing verification is pending: refresh the application, start a new Mountainous map, and confirm visible peak overlays.
## Related commits or files
- `src/game/spriteLoader.ts`
- `src/game/terrainLayer.ts`
- `tests/mountainous.visibility.test.ts`
- `Roadmap_V0_6.3.1.MD` — O1
