# Virtual Player Store scaling is unreachable after the first copy

- Bug: The documented policy to scale Stores with population is unreachable in the `decideIndustry` branch.
- Status: investigating — source fix committed on PR #126; runtime unverified
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: main at 6e9dd6bfcd525cb1df3d8960a636069f5aa240c7
- Reporter: static source audit
- Area: Virtual Player / industry storage
- Owner module: `src/game/virtualPlayer.ts`
- Related implementation: `docs/plans/persistent-automatic-workforce-2026-11-06.md`

## Status history
- 2026-11-06 — investigating: PR #126 replaces population/gold-based Store planning with completed-building material capacity pressure (wood, stone, iron at 85%); pending industrial construction and reserve checks remain; runtime unverified.
- 2026-11-06 — open: contradictory source comment and branch condition identified; gameplay observation not performed.

## Observed behavior
`decideIndustry` comments say Stores scale past the first copy. But `scaling` is defined with `entry.type !== BuildingType.Store`. Once any Store exists, the `owned.length > 0 && !scaling` branch skips further construction. This route cannot propose a second Store.

## Expected behavior
The Store policy must be explicit and consistent. If intended to scale, derive demand from actual storage capacity/pressure instead of blindly building per adult; if only one is intended, correct the policy and documentation.

## Reproduction steps
1. Read `decideIndustry` in `src/game/virtualPlayer.ts` at the pinned commit.
2. Follow the Store case through `scaling` and `owned.length > 0`.
3. Observe that the second Store path is excluded regardless of population; runtime gameplay was not executed.

## Evidence
`const scaling = entry.type !== BuildingType.Store && built >= 1 && built < wanted;` and `if (owned.length > 0) { if (!scaling) continue; }`.

## Root cause
Verified contradiction between the declared Store-scaling policy and its exclusion in the scaling predicate.

## Fix / proposed fix
**Implemented on PR #126 (unverified):** `needsAdditionalStore` reads `economy.computeStorageMax` rather than stale `state.storageMax`, builds when wood, stone or iron exceeds 85% of its capacity, and does not use gold (a Store does not increase gold capacity). The waiting reason uses the same predicate. Existing construction/resource gating prevents immediate duplicate construction; as each Store completes, capacity is recalculated before the next proposal.

Confirm the intended storage policy; replace the contradictory branch with one storage-pressure decision delegated to the relevant owner. Prevent runaway construction, consider pending construction and resource reserves, and reuse actual storage-capacity information. Do not add a second independent Store chooser.

## Save/migration impact
No expected stored-state schema change. Existing Stores and resources must remain intact.

## Verification result
- Static reachability analysis — completed.
- Gameplay tests, TypeScript, lint, build and CI — NOT RUN, at user request.
