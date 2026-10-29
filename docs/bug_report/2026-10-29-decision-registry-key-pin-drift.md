# Decision registry test pins an outdated decision key list

- Bug: `tests/simulation.decisionRegistry.test.ts` fails on `main`, so the standard unit gate is red: its pinned key list omits three owners the registry already declares, and its write rule demands writes from two read-only owners.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: source at `main` merge commit `2a093b3c` (V.0.6.5.1)
- Reporter: coding agent implementing the personality/career inspector (PR E)
- Area: ownership and decision-registry contract
- Owner module: `src/game/simulation/decisionRegistry.ts` (registry rows) and `tests/simulation.decisionRegistry.test.ts` (the pinned list)
- Related PR/commit: PR E — personality and career inspector

## Status history
- 2026-10-29 — open: reproduced while running the tests that cover the personality/career inspector's shared registries; two assertions failed before any registry edit in this branch.
- 2026-10-29 — resolved: pinned list and read-only rule brought back in line with the existing rows; the file's seven tests pass.

## Observed behavior

Running `npx vitest run tests/simulation.decisionRegistry.test.ts` on unmodified `main`:

- `contains exactly the required decision keys` failed: `DECISION_KEYS` contains `workerMotionPresentation`, `chronicleProseNames` and `dailyPersonRoll`, none of which appear in the test's `REQUIRED_DECISIONS`.
- `gives every decision one owner with written fields, scheduling, and tests` failed with `writes of "workerMotionPresentation": expected 0 to be greater than 0`, because the read-only allow-list in that assertion named only five owners.

Both failures therefore pre-date the inspector and are independent of it: the same two assertions also failed when the only change in the tree was the new component and its test.

## Expected behavior

The registry is the machine-checked ownership contract, and its test pins the exact key set (`DECISION_KEYS` must equal the required list) and requires every read-only owner to declare `writes: []` while every mutating owner declares at least one field. A registered presentation or projection owner must satisfy both rules in the test itself, not by being left out of the list.

## Reproduction steps

1. Check out `main` at `2a093b3c` with the repository's dependencies installed.
2. Run `npx vitest run tests/simulation.decisionRegistry.test.ts`.
3. Observe the two failures above (5 passed, 2 failed).

## Evidence

Test output:

```text
× contains exactly the required decision keys
  AssertionError: expected [ 'affairs', 'careerHistory', …(28) ] to deeply equal [ 'affairs', 'careerHistory', …(26) ]
  +   "chronicleProseNames",
  +   "dailyPersonRoll",
  +   "workerMotionPresentation",
× gives every decision one owner with written fields, scheduling, and tests
  AssertionError: writes of "workerMotionPresentation": expected 0 to be greater than 0
```

The registry rows themselves are correct and already carry `writes: []`: `workerMotionPresentation` (render interval anchor), `chronicleProseNames` (name formatting) and `dailyPersonRoll` (pure per-day hash) all mutate nothing.

## Root cause

Three read-only owners were added to `SIMULATION_DECISIONS` without updating the test's hand-maintained `REQUIRED_DECISIONS` list or its read-only allow-list, so the contract test drifted behind the registry it is meant to pin.

## Fix / proposed fix

Committed in this PR: `REQUIRED_DECISIONS` now lists all three keys, and the write assertion uses two named sets — `READ_ONLY_DECISIONS` (must declare `writes: []`) and `RENDER_ONLY_DECISIONS` (must file under the `render` cadence) — instead of a five-key inline disjunction. Every mutating owner still has to declare at least one written field, so the assertion is not weakened. No registry row changed for this fix; the inspector's own registry change is a separate, additive presentation entry.

## Save/migration impact

None. Test-only change; no saved data, simulation, balance or RNG is touched.

## Verification result

- `npx vitest run tests/simulation.decisionRegistry.test.ts` — PASS (7 tests).
- `npx vitest run tests/personalityCareer.inspector.test.ts` — PASS (8 tests).
