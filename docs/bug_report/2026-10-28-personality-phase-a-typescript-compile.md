# Phase A trait evaluation fails TypeScript CI

- Bug: the first personality-phase implementation failed the compiler gate before tests could run.
- Status: resolved
- Severity: low
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1, unmerged Phase A commit `6298e0d`
- Reporter: Node.js CI run 40674771650
- Area: personality trait evaluator and regression tests
- Owner module: `src/game/personality/traitEvaluation.ts`; test fixtures are owned by their respective test files
- Related PR/commit: PR #85; correction commit `b5942e9`

## Status history
- 2026-10-28 — investigating: the initial run failed; type fixes committed, passing rerun not yet confirmed.
- 2026-10-28 — resolved: the type gate passes on branch `codebot-tasks` at the current head.

## Observed behavior
`npm run test:standard` stopped at TypeScript compilation with TS7053 in trait evaluation and two TS2352 errors in invalid-trait test fixtures. Build was skipped.

## Expected behavior
The pure evaluator and its tests must typecheck before the complete standard suite and build proceed.

## Reproduction steps
1. Check out Phase A commit `6298e0d`.
2. Execute `npm run test:standard`.
3. Observe TS7053 and the two TS2352 diagnostics in the CI log.

## Evidence
GitHub Actions run 40674771650, build job 122770254618. Source: index access after an `Array.isArray` guard; test fixtures cast deliberately invalid strings directly to `SettlerTrait[]`.

## Root cause
The array guard widened an array item to `any`, making the exhaustive catalog lookup unsafe for the compiler. Test-only corrupted values also required an explicit `unknown` conversion at the boundary.

## Fix / proposed fix
Committed a typed trait-index assertion after the defensive array guard, and corrected the invalid legacy fixtures to cast through `unknown`. The runtime defense is independently tightened in the malformed-DNA report.

## Save/migration impact
None: no fields, serializer or worker transport changes.

## Verification result
- FAIL (initial): `npm run test:standard`, CI run 40674771650, TS7053/TS2352.
- PASS: `npm run test:types` and `npm run build` on branch `codebot-tasks` (no TS7053/TS2352).
