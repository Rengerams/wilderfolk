# Headless colony bot retained stale entity caches after cloned commands

- Bug: Headless Virtual Player copies a cloned worker-command world into an existing WorldState without invalidating its identity-dependent entity caches.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-02
- Version/build: PR #118, workflow 41371512725
- Reporter: GitHub Actions population benchmark
- Area: scripted colony simulation / runtime cache ownership
- Owner module: `scripts/colonyHealth.ts` (adapter), `src/game/worldRuntimeCaches.ts` (cache owner)
- Related PR/commit: PR #118

## Status history
- 2026-11-02 — investigating: 1,800-resident benchmark confirmed zero credited days with 1,442 assigned workers; focused attendance instrument showed 1,441 workers recording ticks but no daily credit after a cloned bot command. Cache-hydration fix committed; CI rerun pending.

## Observed behavior
On seed 12345 over 2 measured colony days, the 750-resident benchmark recorded 623 distinct workers' real career days. The 1,800-resident benchmark instead recorded 0 despite 1,442 assigned workers. At world tick 468, 1,441 assigned workers held accumulated on-shift ticks, including a sample with 192 ticks and no prior settled work hours. At tick 576, their previous workday was settled at 16.9167 hours (two workday windows accumulated rather than one). This is a genuine lost/misattributed daily state update, not a reason to loosen the audit.

## Expected behavior
Every authoritative `world.entities` reference used by the realtime and daily layers must be the same current object reached by runtime entity lookup caches. One day's attendance is settled exactly once, and career credits are observed and audited.

## Reproduction steps
1. Populate a Huge world to 1,800 residents with `scripts/perf-population-colony.mts` using seed 12345, 2 days and the default 12-tick warmup.
2. Let the hourly Virtual Player apply actual `startBuilding` commands through `applyColonyBotAction`.
3. Compare `world.entities` identity with `getCachedEntityByType` before and after command replacement; observe missing career entries in the large-population audit.

## Evidence
Workflow 41371512725 logged `CAREER_ATTENDANCE_AUDIT`: at tick 468, `assigned=1442, recording=1441, matched=1441, workedHours=0`, sample `ticks=192`; tick 576 `workedHours=1441` with `lastHours=16.916666666666668`. `startBuilding` performs `structuredClone(originalState)`; `applyColonyBotAction` used `Object.assign` to replace the state under the same object key, while `getCachedEntityByType` accepts its old WeakMap bucket when population count is unchanged. This leaves daily and realtime loops seeing detached entity objects.

## Root cause
The headless benchmark adapter reused the original WorldState object without invalidating identity-indexed caches after adopting a deep-cloned command result.

## Fix / proposed fix
After adopting `applied` into `world`, call the existing `worldRuntimeCaches.hydrateWorldRuntimeCaches(world)` owner. It clears entity-type, entity-ID, and spatial derived caches, then rebuilds the active ID index. No new cache ownership or gameplay logic. Remove temporary one-off diagnostic logging. Add focused identity regression in `tests/colonyBotCacheHydration.test.ts`.

## Save/migration impact
None. Only ephemeral runtime caches in the headless simulation adapter are invalidated and refreshed.

## Verification result
- Prior 1,800-resident benchmark: FAIL, zero career workdays (workflow 41371512725).
- Prior 750-resident benchmark: PASS, 623 workers' career days.
- Focused regression and new 1,800-person run: NOT RUN at report creation; pending CI.
