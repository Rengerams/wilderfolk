# Spotlight chorus begins before every selected villager arrives

- Bug: A scene with eight selected chorus members could enter presentation when only six reached their positions.
- Status: resolved (code change committed; CI and live browser verification pending)
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: feature PR #91, not merged into main
- Reporter: code review during feature implementation
- Area: simulation / scene staging
- Owner module: `src/game/spotlightLore.ts` (`tickSpotlightGathering`)
- Related PR/commit: #91, `62c977b6eedd16b9b9e5b557f1e2d40eb7fee60b`

## Status history
- 2026-10-28 — investigating: exact source shows the ready predicate `arrived >= SPOTLIGHT_MIN_CHORUS`; a selected eight-person chorus can begin at six.
- 2026-10-28 — resolved in branch: compare arrived count with actual selected slot count and add an eight-person regression.

## Observed behavior
Code inspection, not a browser reproduction: the previous branch predicate accepted 6/8 actors at position. The UI speaks lines assigned to all selected performers after pause, potentially including villagers who have not yet walked to the subject.

## Expected behavior
Every assigned speaker should reach their assigned valid gathering position before the performance freezes the simulation. The timeout still aborts unreachable scenes.

## Reproduction steps
1. Build a gathering scene containing eight selected adult performer IDs and eight target slots.
2. Move six performers to their targets while leaving two away.
3. Advance `tickSpotlightGathering`.
4. Before the fix, `phase` becomes `ready`; after the fix it stays `gathering` until all eight arrive.

## Evidence
Source owner `tickSpotlightGathering` formerly used `arrived >= SPOTLIGHT_MIN_CHORUS` rather than a comparison to `scene.slots.length`.

## Root cause
The minimum number required to **start** a scene was incorrectly reused as the number needed to **finish gathering**, although the scene could contain up to ten performers.

## Fix / proposed fix
Change the phase transition to `arrived === scene.slots.length`; regression test `tests/spotlightLore.test.ts` checks the six-of-eight and eight-of-eight transitions.

## Save/migration impact
None beyond the already planned and implemented optional scene fields in the same PR. Stored slot cardinality remains unchanged.

## Verification result
- Source inspection: confirms the old branch condition and the new condition.
- `tests/spotlightLore.test.ts`: added but **NOT YET VERIFIED** at report time.
- GitHub CI and live scene browser verification: pending.
