# Moon Howler counter-kill loses title and original type index

- Bug: A successful counterattack restores the dead cursed entity's human type before title awarding and removal from the original byType bucket.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-26
- Version/build: main `ab0525ce`, PR #215 prior head `b5b04ea`
- Reporter: owner symptom, source audit
- Area: Moon Howler / wildlife
- Owner module: `src/game/tickLayerSystems.ts` (hunt) and `src/game/simulation/simulationEntities.ts` (death)
- Related PR: [#215](https://github.com/Rengerams/wilderfolk/pull/215)

## Status history
- 2026-11-26 — investigating: head `ffca52c` passed 3,180 tests and all five workflows. Follow-up source inspection found that the wildlife death adapter omits world state when calling `killHuman`, and counter-kills clear hunter links to the surviving defender. Both corrected; a deterministic armed-settler counterattack regression now checks the title, death type, original bucket, hunter cleanup, genealogy and office vacancy. New-head CI pending.
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
A successful counterattack restores the dead cursed entity's human type before title awarding and removal from the original byType bucket.

## Expected behavior
The survivor can earn Moonslayer and the dead entity is removed from the original wildlife bucket without further predator movement.

## Reproduction steps
Trace tickWildlife successful counterattack on an active cursed form into markWildlifeDead and killHuman; observe that the post-call type is Human, not Werewolf. Follow-up: use the armed-defender scenario in `tests/hospital.howler.geometry.test.ts`, selecting a passing tick via the existing seeded combat roll. The new regression is committed but not yet run.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). Specific death title/index outcome is source evidence only, not a separately verified runtime reproduction.

## Root cause
Post-death code consulted a mutated type rather than capturing pre-death identity. The wildlife adapter omitted the world state required for human death genealogy and office cleanup, and the counterattack branch supplied the survivor ID to hunter cleanup. The family census also excluded transformed human settlers (see the separate form-state report).

## Fix / proposed fix
Use the existing pre-death active curse boolean for the title; markWildlifeDead captures previousType and removes the correct bucket; stop processing the dead predator. Forward state into the existing `killHuman` owner and clear hunter links to the actual slain predator, not the defender.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Head `ffca52c`: Node.js CI run 45868980564 passed 3,180 tests (423 files), all five returned workflows passed. Latest death-cleanup follow-up not yet tested. No owner save supplied.
