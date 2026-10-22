# Bug Report — Full-Year Relationship Diagnostics Looked Dead After ~500 Ticks

**Date:** 2026-08-25  
**Area:** Full-year integration test / relationship diagnostics  
**Severity:** Medium — misleading diagnostics and invalid long-run test fixture  
**Status:** Fixed in test/reporting path; no production simulation owner changed

## Reproduction

Run:

```bash
npx vitest run tests/fullYear.integration.test.ts --reporter=verbose
```

The original test ran `initGame()` without a completed residence, production buildings, or a sustainable food setup. The founding settlers therefore died during the long run. The relationship diagnostics continued flushing once per calendar day, but after the human population reached zero, all relationship counters and active relationship counts were correctly zero.

The original test also did not print checkpoint summaries, so the output made it difficult to distinguish “diagnostics stopped” from “the relationship population disappeared.”

## Expected behavior

The long-run test should expose useful relationship state at regular checkpoints and should make it clear whether a zero snapshot means no eligible/living settlers, no active relationships, or a diagnostics transport/reporting failure.

## Observed behavior

Diagnostics continued reporting, but later snapshots were all zero. The first diagnostic run showed the test colony with no buildings and eventually zero living player humans. Food spoilage and the absence of production caused the fixture to collapse. This was a test-design problem, not evidence that `flushRelationshipDiagnostics()` had stopped running.

## Root cause

There were two contributing causes:

1. `fullYear.integration.test.ts` exercised a new-game state without establishing the minimum conditions needed for a meaningful one-year colony simulation.
2. The test emitted no 90-day summary, while production diagnostics logged every day, making the useful signal hard to see in a long terminal output.

## Correction

The full-year test now:

- Uses the canonical `EntityType.Human` value when summarizing humans.
- Runs the returned `gameTick` contract rather than discarding the return value.
- Creates one completed starter house and assigns the founding humans through the normal residence helper.
- Gives the test fixture a non-starving food reserve and disables spoilage only for this diagnostic scenario.
- Prints compact summaries at days 90, 180, 270, and 360.
- Includes active marriages, courtships, affairs, pregnancies, conception candidates, births, diagnostic age, population, resources, and invariant status.
- Suppresses only the daily console emission during this test; diagnostic collection remains enabled and the 90-day summaries read the collected snapshots.

The diagnostics module now separates collection from console emission through `setRelationshipDiagnosticsConsoleLoggingEnabled()`. Production logging remains enabled by default.

## Verification

The seeded fixture now produces non-zero, meaningful checkpoints:

| Day | Humans | Married pairs | Courtship pairs | Affairs | Pregnant | Conception candidates |
|---:|---:|---:|---:|---:|---:|---:|
| 90 | 14 | 5 | 1 | 0 | 0 | 14 |
| 180 | 14 | 2 | 1 | 0 | 1 | 14 |
| 270 | 18 | 4 | 0 | 1 | 0 | 18 |
| 360 | 19 | 2 | 1 | 0 | 1 | 19 |

The full-year test passes. Relationship diagnostics tests pass. The production build passes with the existing large-chunk warning.

## Invariants preserved

No simulation owner, cadence, relationship rule, resource rule, worker authority, or save schema was changed. The starter-house and resource adjustments are confined to the integration-test fixture. The production relationship diagnostic logger still reports every daily flush unless explicitly disabled by a caller.

## Save impact

None. No durable world-state field was added or changed.
