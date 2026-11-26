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
- 2026-11-26 — investigating: fixes committed; latest-head and live-save verification pending.

## Observed behavior
A successful counterattack restores the dead cursed entity's human type before title awarding and removal from the original byType bucket.

## Expected behavior
The survivor can earn Moonslayer and the dead entity is removed from the original wildlife bucket without further predator movement.

## Reproduction steps
Trace tickWildlife successful counterattack on an active cursed form into markWildlifeDead and killHuman; observe that the post-call type is Human, not Werewolf. Dedicated title/index runtime regression not yet added.

## Evidence
Source trace at base `ab0525ce`; prior-head CI `b5b04ea` ran 2,978 passing tests (43 in moonHowler, 10 in hospital.howler.geometry). Specific death title/index outcome is source evidence only, not a separately verified runtime reproduction.

## Root cause
Post-death code consulted a mutated type rather than capturing pre-death identity.

## Fix / proposed fix
Use the existing pre-death active curse boolean for the title; markWildlifeDead captures previousType and removes the correct bucket; stop processing the dead predator.

## Save/migration impact
None. Existing fields and transient caches only; no save format changes.

## Verification result
Prior head `b5b04ea`: Node.js CI run 45850139673 passed (2,978 tests, lint and duplicate checks), all five returned workflows passed. Latest follow-up build/tests NOT RUN by this agent. No owner save supplied.
