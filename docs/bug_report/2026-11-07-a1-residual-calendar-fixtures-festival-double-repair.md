# A1 — Residual calendar and festival-load regressions

- **Bug:** SIM-14 calls `repairStaleFestivalOnLoad` twice for one restored save, while TEST-10/17, TQ-05 and part of SIM-04/CB-04 still encode a retired 72-tick-day in fixtures and active README copy.
- **Status:** investigating
- **Discovered:** 2026-11-07 audit
- **Current branch:** `fix/a1-calendar-restpunten-20261107`
- **Owner modules:** `src/game/saveLoad.ts`, `tests/...`, `README.md`
- **Affected IDs:** SIM-04, SIM-07, SIM-13, SIM-14, CB-04, GAME-02, TEST-10, TEST-17, TQ-05. GAME-05 verification also tracked in this A1 action.

## Reproduction

1. Read `loadGameFromParsedOutcome`: the festival repair is executed twice consecutively.
2. In `tests/displayYear.oneBased.test.ts`, a year-0 day-90 fixture uses `90 * 72`, not `90 * TICKS_PER_DAY`.
3. In `tests/spotlightLore.test.ts`, an adult scene is positioned at `72 * 200`, not day 200 in the active 288-tick clock.
4. `tests/storyEvents.welcome.test.ts` asserts the right 18:00 tick but its header calls it the day boundary at 72, despite `initGame` starting at 96 (08:00).
5. README's old release-history performance row describes the current simulation as 72 ticks/day without identifying that as historical.

## Expected

- One festival reconciliation per load; no duplicate invocation.
- Every live fixture computes ticks from the canonical clock.
- The first event from an 08:00 start is at 18:00, not midnight; midnight runs the next day.
- Year-0 stored election stamp is distinguished from the founding `-1` sentinel after an actual load.
- Historical descriptions do not misstate the present engine.

## Intended fix and verification

Remove duplicate load repair; repair fixtures/comments and README; add a spy-backed real save/load test that fails if the festival repair runs twice and a synthetic founding-year-election save/load test. Run the named suites, full Node.js CI, lint and existing simulation/performance gates.

**Do not mark this report resolved until CI and behavior tests pass.**
