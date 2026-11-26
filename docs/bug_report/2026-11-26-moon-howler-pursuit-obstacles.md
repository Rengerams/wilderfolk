# Moon Howler pursuit disagrees with movement passability

- Bug: Direct chase presses against walls and can attack through a blocked segment. The first routing fix still stalled if the shortest detour used shallow water.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main `ab0525ce`, PR #215 prior head `b5b04ea`
- Reporter: owner symptom, source audit and Codex review
- Area: Moon Howler / wildlife
- Owner module: `src/game/tickLayerSystems.ts` (hunt) and `src/game/pathfinding.ts` (routing)
- Related PR: [#215](https://github.com/Rengerams/wilderfolk/pull/215)

## Status history
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
Direct chase presses against walls and can attack through a blocked segment. The first routing fix still stalled if the shortest detour used shallow water.

## Expected behavior
Pursuit and contact honor walls and wildlife water restrictions; use a dry detour when available, while allowing completed bridges.

## Reproduction steps
Use a finite wall between howler and exposed settler and shallow water on the shorter northern detour, then run up to 100 pulses. Expect the southern dry detour and progress beyond the wall. Also check close contact across a wall.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). [Codex review](https://github.com/Rengerams/wilderfolk/pull/215#discussion_r4710569311) reproduced a stall near (95, 67.4) over 100 pulses. The follow-up dry-detour test is not yet executed.

## Root cause
tickWildlife originally steered directly and tested only distance for contact. The first fix called steerWithPath on the human grid, which allows shallow-water wading, while canStep rejects that water.

## Fix / proposed fix
Keep the existing A* and steering owner, derive a cached wildlife mask using the same waterBlocked verdict, scope route cache entries and unreachable queries to grid identity; require clear contact and retain indoor shelter. Regression added for dry detour and separate cached bridge-aware mask.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Latest follow-up build/tests NOT RUN by this agent. No owner save supplied.
