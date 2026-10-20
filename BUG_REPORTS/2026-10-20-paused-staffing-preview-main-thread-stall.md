# 2026-10-20 — Paused UI stalls in worker-assignment availability checks

## Evidence
Chrome Performance recording of paused Wilderfolk shows a long-running main-thread task whose visible stack includes `App → canAssignWorkerToBuilding → findOverstaffedDonorBuilding`. The UI is sluggish despite the simulation being paused. This is a **render-time eligibility check**, not the periodic `assignMissingWorkers` simulation pass.

## Root cause (confirmed by source)
`findOverstaffedDonorBuilding` filtered every potential donor building by running `countWorkersAtBuilding(humans, id)` and `humans.some(...)`, then sorted donors by repeated `countWorkersAtBuilding` scans. Calling this from `canAssignWorkerToBuilding` during UI rendering multiplied full-population scans by candidate buildings and UI renders.

## Fixes
- `e91d9a1`: replace repeated per-building scans with one linear population pass constructing assignment counts and cooldown-eligible donor ids, then one linear pass choosing the smallest eligible donor. Preserve source-order tie breaks, manual-building exclusion, minimum two assigned workers, and current cooldown behavior.
- `d9c58ba`: add cases for donor selection, cooldown, manual exclusion, and a large fixture (8,000 workers / 200 buildings).

## Verification
Source change committed. GitHub connector does not execute build/tests; run:
`npx vitest run tests/workforce.autoTransferCooldown.test.ts`
`npm run build`
Then compare paused Chrome Performance recordings for `findOverstaffedDonorBuilding`, input latency and FPS.

## Remaining
Other UI render-time staffing queries can still be expensive if invoked excessively. Profile again before adding unsafe world-reference caches or changing simulation staffing cadence.
