# Spotlight presentation can jump to the stage target

- Bug: the paused heroine display began at the saved gathering target rather than her actual arrival position.
- Status: resolved in PR #91 source; runtime verification pending
- Severity: low
- Date discovered: 2026-10-28
- Version/build: PR #91 choreography after implementation
- Reporter: source-level choreography audit
- Area: on-map Spotlight presentation
- Owner module: `src/components/SpotlightLoreOverlay.tsx`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/91

## Status history
- 2026-10-28 — open: a ready scene only requires the heroine to be within 11 world units of the saved gather target, but her first visual frame used the target itself.
- 2026-10-28 — resolved in source: capture the actual living heroine position for the scene's visual origin and reuse it for both 7-second pose loops and the validated farewell. Runtime verification pending.

## Observed behavior
The arrival rule in `spotlightLore.tickSpotlightGathering` accepts the girl within 11 world units of the gathering target. The initial choreography in `SpotlightLoreOverlay` used `scene.gatherX/gatherY` as the display origin, so the image could jump by that distance on entering ready.

## Expected behavior
The existing real juvenile sprite remains at her actual current rendered position at performance start. Presentation-only offsets apply from that exact point without moving authoritative game coordinates.

## Reproduction steps
1. Create a ready scene with the heroine within 11 units of, but not exactly on, its saved gather target.
2. Let the wall-clock overlay begin projecting the heroine.
3. Before the correction, the projection starts at `scene.gatherX/gatherY`, not her entity's `x/y`.

## Evidence
Source trace through `tickSpotlightGathering` and `SpotlightLoreOverlay`. No browser measurement is claimed.

## Root cause
The saved slot target was treated as the actual visual actor location.

## Fix / proposed fix
PR #91 uses a stable, per-scene `stageOrigin` from the actual heroine entity if present, with the slot target only as fallback. The stage-circle collision radius and farewell corridor are computed from the same origin.

## Save/migration impact
None. Presentation-only origin; persisted state and worker data unchanged.

## Verification result
Source diff inspected. Targeted browser and TypeScript execution **NOT RUN**.
