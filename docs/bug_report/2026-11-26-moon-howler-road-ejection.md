# Moon Howlers are repeatedly scattered from travel surfaces

- Bug: The padded indoor footprint test treats a completed road or bridge as an interior, while wildlife road avoidance also pushes the cursed form off travel surfaces.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main `ab0525ce`, PR #215 prior head `b5b04ea`
- Reporter: owner symptom, source audit
- Area: Moon Howler / wildlife
- Owner module: `src/game/moonHowler.ts`, `src/game/terrainSystems.ts` (footprint), `src/game/tickLayerSystems.ts` (movement)
- Related PR: [#215](https://github.com/Rengerams/wilderfolk/pull/215)

## Status history
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
The padded indoor footprint test treats a completed road or bridge as an interior, while wildlife road avoidance also pushes the cursed form off travel surfaces.

## Expected behavior
Roads and bridge decks do not count as indoors and must remain traversable.

## Reproduction steps
In tests/moonHowler.test.ts place the active form at the centre of a completed Road or Bridge and run tickMoonHowlerCycle during full moon. Expect no scatter.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). Existing focused tests and new form/hunt geometry regressions passed on that head; no live-save reproduction.

## Root cause
isInsideCompletedBuilding includes completed travel surfaces by default; tickWildlife also applies wildlife road repulsion.

## Fix / proposed fix
Exclude roads and bridges from the moon-specific indoor check and omit road repulsion for the active curse; leave general placement defaults alone.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Latest follow-up build/tests NOT RUN by this agent. No owner save supplied.
