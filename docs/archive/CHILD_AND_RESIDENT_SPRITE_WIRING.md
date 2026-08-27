# Resident and Child Sprite Wiring

**Version:** v0.6.3 unreleased  
**Date:** 2026-08-22  
**Status:** Wired; visual acceptance still pending.

## Summary

The v0.6.3 visual preview uses the new adult resident sprites and the rerendered child sprites while preserving the previous assets for rollback. This is a presentation-only change. It does not change entity identity, gender, age logic, profession, movement, collision, simulation state, save data, or Simulation Authority.

## Runtime wiring

Adult sprite selection is defined in `src/game/humanSprites.ts`. With `USE_NEW_SETTLER_ART_PREVIEW = true`, the first five male variants use `public/sprites/new_male_set/`, and the first five female variants use `public/sprites/new_female_set_v2/`. Remaining variants continue to use the legacy adult sprite paths.

The rerendered child sprites are selected from `public/sprites/new_child_set/new/`:

| Gender | Runtime files |
|---|---|
| Male | `child_boy_bakersboy.png`, `child_boy_merchantson.png` |
| Female | `child_girl_doctorsdaughter.png`, `child_girl_poorservant.png` |

The juvenile paths are declared in `src/game/humanSprites.ts`. The same paths are registered in `src/game/spriteLoader.ts` so the loader applies the normal human feet/anchor handling.

## Fallback

The original child files remain in `public/sprites/new_child_set/`. The original adult sprite paths also remain available. Reverting the preview switch or restoring the previous child path constants returns the earlier presentation without changing saves or simulation state.

## Validation

All referenced adult and rerendered child PNG files exist in the public asset tree. TypeScript validation passed after the wiring update. Visual acceptance remains to be completed on the real map at ordinary and close zoom, including silhouette readability, transparent edges, scaling, frame/anchor placement, family consistency, and fallback behavior.

## Files changed

- `src/game/humanSprites.ts`
- `src/game/spriteLoader.ts`
- `docs/CHILD_AND_RESIDENT_SPRITE_WIRING.md`

## Rollback rule

Do not delete the old sprite sets until visual acceptance and rollback checks pass. If the rerendered child art is unsuitable, restore the child paths from `public/sprites/new_child_set/` and leave simulation and save data unchanged.


## Road asset wiring audit

The road pieces are connected to the renderer through `src/game/stripRender.ts`. Straight segments use `road_straight_1.png` for horizontal strips and `road_straight_2.png` for vertical strips. Crossings use `road_cross.png`; three-way junctions select from `road_tee_1.png` and `road_tee_2.png`; elbow junctions select from the four `road_corner_*.png` files. If an authored image is not loaded, the renderer falls back first to the pavement texture and then to a procedural flat road.

Connection topology is calculated in `src/game/stripJunction.ts`. Neighbor presence is classified as `end`, `straight`, `elbow`, `tee`, or `cross` using north/south/east/west connections. The junction renderer intentionally skips `end` and `straight` because those are rendered by the strip renderer.

The road system is currently **cosmetic**. The road pieces do not change movement speed, collision, pathfinding, ownership, build cost, or save data. The asset paths are wired, but visual acceptance remains required for every straight, corner, tee, cross, and endpoint combination at normal and close map zoom.

### Road audit findings

| Finding | Status | Advice |
|---|---|---|
| `road_straight_1`, `road_straight_2`, `road_cross`, both `road_tee` pieces, and all four `road_corner` pieces are referenced by `stripRender.ts`. | Confirmed wired | Keep the authored paths and fallback. |
| `road_end.png` exists in `public/sprites/roads/` but is not referenced by the renderer. | Not connected — accepted by design (2026-08-24) | Dev decision: a footpath may simply end without a dedicated endpoint cap, so `road_end.png` is intentionally not wired. |
| Junction topology is computed from nearby horizontal/vertical strip centers. | Implemented | Test isolated endpoints, adjacent segments, corners, tees, crosses, and near-but-disconnected roads. |
| Tee/corner selection uses rotation-indexed asset variants rather than rotating the image at draw time. | Implemented but requires visual review | Confirm that each authored variant’s orientation matches `cornerRotation`; do not assume filenames encode the same compass order. |
| No dedicated road-connection tests were found in the inspected test search. | Test gap | Add deterministic topology tests before declaring the road visual upgrade complete. |

The road work should remain separate from simulation behavior. A connection-art fix must not silently become a pathfinding or movement-speed change.
