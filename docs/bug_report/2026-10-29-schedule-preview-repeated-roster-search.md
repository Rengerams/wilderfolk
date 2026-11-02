# Work-hours preview repeatedly scans the entire population

- Bug: each populated workplace occupant triggers a full entity-roster search when rendering the work-hours preview.
- Status: investigating — targeted correction and regression authored, browser verification pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 development, main inspected 2026-10-29
- Reporter: owner INP metrics and source inspection
- Area: schedule UI read-only projection and game-loop command preview
- Owner module: `src/game/scheduleFeedback.ts` (`getScheduleImpactPreview`); `src/game/gameLoop.ts` owns optimistic command presentation

## Status history
- 2026-10-29 — open: owner reports work-hours button taking up to 2,272 ms and wildly varying FPS with 2,000+ residents.
- 2026-10-29 — investigating: confirmed `state.entities.some(...)` inside each building occupant count, repeated every render. Lightweight worker schedules also used full-world optimistic clones.
- 2026-10-29 — investigating: ID-index preview and shallow schedule/policy optimistic copies committed; CI and browser measurements pending.

## Observed behavior
`getScheduleImpactPreview` filters ordinary workplaces and checks every occupant by searching all entities. With B buildings, O assigned occupants and E entities this creates up to O(O×E) comparisons each render. The same panel derives it on React renders. Work-schedule changes did not preview optimistically, while venue schedule previews deep-cloned the whole colony.

## Expected behavior
The preview must give identical counts without repeatedly searching the population. A valid work-hours click should immediately display its pending values without copying unrelated simulation entities or buildings, and later acknowledge the authoritative worker result.

## Reproduction steps
1. Open Work & venue hours in a large settled colony.
2. Change ordinary work hours, then use Apply; owner INP log includes 2,272 ms for this button.
3. Observe through source trace that each assigned worker triggers `state.entities.some`; changing venue hours also enters `createOptimisticDisplayWorld` which deep-clones state.

## Evidence
`src/game/scheduleFeedback.ts` nested `buildings.reduce` → `occupants.filter` → `state.entities.some` and `src/game/gameLoop.ts` `rebuildOptimisticDisplay` clone on venue schedule.

## Root cause
Confirmed unnecessary repeated entity search and deep cloning in read-only command previews. The exact attribution of all browser INP spikes is not established without performance recording.

## Fix / proposed fix
Index eligible entity IDs once for the preview, then use constant-time membership checks; leave counts and warnings unchanged. Preview ordinary/venue/policy top-level fields with a shallow shell and avoid catalog rebuilds for those commands; retain deep isolation for worker assignments.

## Save/migration impact
None; schedules and worker command protocol are unchanged.

## Verification result
- PASS (static): source trace.
- ADDED, NOT RUN: bounded roster-inspection regression in `tests/scheduleFeedback.test.ts`; shallow optimistic schedule regression in `tests/gameLoop.test.ts`.
- PENDING: CI, typecheck/lint/build and large-colony browser INP/FPS measurements.
