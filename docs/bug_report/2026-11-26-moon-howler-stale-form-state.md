# Moon Howler form transitions retain stale indoor and movement state

- Bug: The cursed entity can retain a previous indoor marker, and dawn reversion can retain predator velocity. Generic wildlife aging increments the transformed settler's age on the systems cadence.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main `ab0525ce`, PR #215 prior head `b5b04ea`
- Reporter: owner symptom, source audit
- Area: Moon Howler / wildlife
- Owner module: `src/game/moonHowler.ts`, `src/game/moonHowlerForm.ts`, `src/game/tickLayerSystems.ts` (respective form and age owners)
- Related PR: [#215](https://github.com/Rengerams/wilderfolk/pull/215)

## Status history
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
The cursed entity can retain a previous indoor marker, and dawn reversion can retain predator velocity. Generic wildlife aging increments the transformed settler's age on the systems cadence.

## Expected behavior
Transformation/ejection clears indoor arrival metadata; human form returns at its actual position at rest, with human calendar age intact.

## Reproduction steps
In tests/moonHowler.test.ts set indoorBuildingId before transform, then set stale indoor marker and velocity before revert; expect marker cleared and zero velocity. Inspect tickWildlife age increment for an active cursed form.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). Existing focused tests and new form/hunt geometry regressions passed on that head; no live-save reproduction.

## Root cause
Temporary form uses the same entity as the human; the transitions did not clear transient arrival/velocity, and wildlife age was incremented unconditionally.

## Fix / proposed fix
Clear transient state in transform, forceOutside and revert; skip wildlife age increment for the active cursed settler.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Latest follow-up build/tests NOT RUN by this agent. No owner save supplied.
