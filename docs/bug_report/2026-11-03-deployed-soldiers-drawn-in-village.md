# Deployed soldiers were drawn standing in the village

- Bug: a settler with `raidDeploymentId` was frozen in the simulation but still rendered at their last village position, and the inspector described them as "Walking home to sleep" while the badge said "Away with the war-band" — the same settler shown in two places at once.
- Status: resolved
- Severity: medium — the village showed soldiers who were away at war
- Date discovered: 2026-11-03
- Version/build: 0.6.5.1 working tree (0.6.5.2 development)
- Reporter: owner gameplay screenshot ("people who are at war are still in the village")
- Area: war-band deployment, village rendering and the activity projection
- Owner module: `src/game/renderer/humans.ts`, `src/game/simBuffers/entityRenderMeta.ts`, `src/game/simBuffers/renderSoAEntities.ts`, `src/game/humanStatus.ts`
- Related PR/commit: fixed 3 November 2026

## Status history

- 2026-11-03 — open: the owner selected a deployed soldier ("Away with the war-band", rest 0) who was still shown walking home in the village.
- 2026-11-03 — resolved: the village layer skips deployed settlers on both render paths, and the projection reports the war-band.

## Observed behavior

`humanTick` freezes a deployed settler (`vx = vy = 0`, then `continue`), so their position never leaves the village. `drawHumans` filtered only rivals, indoor settlers and spotlight-hidden ids, so the frozen body kept drawing at that position. `getHumanActivityStatus` did not read `raidDeploymentId`, so the inspector's status line still said "Walking home to sleep" next to the war-band badge.

## Expected behavior

A soldier away with the war-band is not in the village: the village layer draws nothing for them, and every projection describes them as away. Their needs pause while deployed (the tick already skips them), and they resume on return.

## Reproduction / evidence

1. Select a deployed settler (`raidDeploymentId` set) in the village.
2. Before: a body is drawn at their old spot and the status reads "Walking home to sleep".
3. `tests/humanStatus.projection.test.ts` — "reports a deployed soldier as away with the war-band, not walking home" fails before the change.

## Root cause

Deployment was a simulation-only fact: the tick and `workAbsence` knew it, but neither the village renderer nor the activity projection consulted it.

## Fix (applied)

- `drawHumans` skips `human.raidDeploymentId` with the rival/spotlight filters.
- The worker render path carries `raidDeploymentId` in `EntityRenderMeta` and the shim, and `updateRenderSoABuckets` skips deployed entities.
- `getHumanActivityStatus` returns "Away with the war-band" first.

## Regression coverage

`tests/humanStatus.projection.test.ts`. The render path is covered by the render meta/build gates; no canvas assertion was added.

## Save compatibility

None: the flag already round-trips through the save schema.

## Verification

`npx vitest run tests/humanStatus.projection.test.ts` — 8 passed. `npm run test:types`, `npm run lint`, `npm run build` — passed.
