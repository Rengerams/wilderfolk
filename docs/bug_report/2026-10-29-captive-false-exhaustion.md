# Foreign captive false exhaustion

- Bug: Immobilized foreign captives could die from simulated energy depletion.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: PR #100 before removal of captive energy loss
- Reporter: source audit and failing warfare lifecycle regression
- Area: prison custody and human needs
- Owner module: humanTick.ts delegates player human needs to simulation/humanPhysiology.ts; simulation/humanNeeds.ts owns food transactions
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/100

## Status history
- 2026-10-29 — open: imprisoned foreigners had a second energy-loss path, which could trigger death despite no work or movement.
- 2026-10-29 — investigating: production exhaustion path removed; old death expectation replaced by survival and explicit-death lifecycle assertions. Latest CI pending.

## Observed behavior
An immobilized foreign captive at zero energy was removed by the old exhaustion cleanup. It also inherited infrastructure modifiers that belong to player settlers.

## Expected behavior
Custody itself must not drain foreign-captive stamina or kill a prisoner. Only existing independent death, execution, release, escape and recruitment paths alter their fate.

## Reproduction steps
1. Start the existing captiveColony warfare fixture and set its captive energy and colony food to zero.
2. Advance gameTick once with simulation unpaused.
3. Assert the captive stays alive and custody history remains captured, instead of expecting an exhaustion death.
4. Invoke the existing death owner explicitly; verify the death record appears only once and remains after reload.

## Evidence
The previous PR-head Node.js CI failed tests/warfare.lifecycle.test.ts at its old exhaustion-death assertion (the observed captive survived).
The removed code was an energy-loss and exhaustion-death path for non-player war captives.

## Root cause
Foreign captives were processed by a separate fictional energy model despite never being ordinary player settlers.

## Fix / proposed fix
Retire the captive energy-loss and exhaustion-death path. Preserve deliberate and natural deaths through humanLifecycleCleanup.killHuman; update the gameplay regression to distinguish survival at zero energy from a genuine death.

## Save/migration impact
No additional physiology fields for foreign captives. Existing custody identity and outcome records persist unchanged.

## Verification result
Regression updated in PR #100. Latest-head TypeScript, Node.js CI and full browser simulation: NOT RUN/NOT YET VERIFIED at report edit.
