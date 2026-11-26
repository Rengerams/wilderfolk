# Moon Howler hunting is throttled and hunger-gated

- Bug: Exposed settlers are ignored while the transformed predator is fed or its position is outside the viewport.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main `ab0525ce`, PR #215 prior head `b5b04ea`
- Reporter: owner symptom, source audit
- Area: Moon Howler / wildlife
- Owner module: `src/game/tickLayerSystems.ts`
- Related PR: [#215](https://github.com/Rengerams/wilderfolk/pull/215)

## Status history
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
Exposed settlers are ignored while the transformed predator is fed or its position is outside the viewport.

## Expected behavior
An active cursed form with full energy near an exposed settler should pursue on each wildlife pulse independently of viewport; ordinary animal prey remains hunger-gated.

## Reproduction steps
Use howlerAtDoor(false, 700, true) in tests/hospital.howler.geometry.test.ts with tick 4 and a distant focus. Compare the exposed and indoor targets.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). Existing focused tests and new form/hunt geometry regressions passed on that head; no live-save reproduction.

## Root cause
tickWildlife applied ordinary offscreen wildlife throttling and the hunger gate to the curse.

## Fix / proposed fix
Active howlers run each systems pulse and pursue exposed human prey even when fed; indoor protection and animal hunger gating retained.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Latest follow-up build/tests NOT RUN by this agent. No owner save supplied.
