# A stale crew slot could still price a dead settler's DNA

- Bug: When the caller supplied an occupant index that lacked an id, the crew multiplier fell back to a full-world scan and could resolve the settler's dead body, pricing its traits into the crew factor.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: 0.6.5.2 branch `codebot-tasks`, commit `c5c81c5e`
- Reporter: owner code review on PR #90
- Area: crew trait multiplier / daily construction
- Owner module: `src/game/skills.ts` (`getWorkerSkillMultiplier`)
- Related PR/commit: PR #90

## Status history
- 2026-10-28 — open: reported by review as a P2 performance and correctness risk.
- 2026-10-28 — resolved: a supplied index is authoritative and dead occupants are neutral.
- 2026-10-28 — closed for the shift credit too: `gainSkill` no longer scans the world for an id the supplied index lacks.

## Observed behavior
`entityById?.get(id) ?? state.entities.find((e) => e.id === id)` scanned the whole population whenever an id was missing from the supplied map. The daily construction map indexes living entities only, so a stale slot could both cost an O(N) scan per occupant and find a dead entity in the backing array, adding its DNA to the average.

## Expected behavior
A supplied index is authoritative: an id it lacks is a stale crew slot and contributes a neutral factor. An entity that is not alive never contributes DNA or skill.

## Reproduction steps
1. Build a Farm with `occupants: [1]`.
2. Put a dead settler with id 1 and traits `['greenthumb']` in `state.entities`.
3. Call `getWorkerSkillMultiplier(state, farm, new Map())` — before the fix the empty index fell through to the scan and priced the dead body.

## Evidence
Review trace on `src/game/skills.ts:113`; the new regression also covers the no-index path, which resolves the same dead entity and must stay neutral.

## Root cause
`??` treated a missing map entry as "look elsewhere" instead of "this slot is empty", and the resolved entity was never checked for `alive`. The same fallback survived in `gainSkill`, the per-worker shift credit behind `rewardBuildingWork` and `rewardProductionSkills`.

## Fix / proposed fix
`const h = entityById ? entityById.get(id) : state.entities.find(...)` with a `!h || !h.alive` guard that adds the neutral factor, and `gainSkill` now resolves through the supplied index alone. No new index was introduced; the existing caller-supplied map is reused.

## Save/migration impact
None.

## Verification result
`tests/personality.workIntegration.test.ts` — PASS: with an empty index the multiplier is exactly 1, and the no-index scan also returns 1 for the dead body. `tests/workSkillAttribution.accrual.test.ts` — PASS: a shift credit leaves a worker the supplied index does not name untouched, while an index that names them pays the standard shift.
