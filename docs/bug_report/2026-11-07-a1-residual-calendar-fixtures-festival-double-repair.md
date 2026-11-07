# A1 — Residual calendar and festival-load regressions

- **Bug:** SIM-14 calls `repairStaleFestivalOnLoad` twice for one restored save, while TEST-10/17, TQ-05 and part of SIM-04/CB-04 still encode a retired 72-tick-day in fixtures and active README copy.
- **Status:** source repaired; behavior tested for current and synthetic legacy 72-tick Year-0 save, festival active/stale outcomes and single 18:00 promise ownership; last CI pending. Historic owner-supplied save not tested.
- **Discovered:** 2026-11-07 audit
- **Current branch:** `fix/a1-calendar-restpunten-20261107`
- **Owner modules:** `src/game/saveLoad.ts`, `tests/...`, `README.md`
- **Affected IDs:** SIM-04, SIM-07, SIM-13, SIM-14, CB-04, GAME-02, TEST-10, TEST-17, TQ-05. GAME-05 verification also tracked in this A1 action.

## Reproduction

1. Read `loadGameFromParsedOutcome`: the festival repair is executed twice consecutively.
2. In `tests/displayYear.oneBased.test.ts`, a year-0 day-90 fixture uses `90 * 72`, not `90 * TICKS_PER_DAY`.
3. In `tests/spotlightLore.test.ts`, an adult scene is positioned at `72 * 200`, not day 200 in the active 288-tick clock.
4. `tests/storyEvents.welcome.test.ts` asserts the right 18:00 tick but its header calls it the day boundary at 72, despite `initGame` starting at 96 (08:00).
5. README's dated v0.6.2.1 history correctly records the old 72-tick day and must remain unchanged. The current 288-tick contract belongs in the live overview/changelog.

## Expected

- One festival reconciliation per load; no duplicate invocation.
- Every live fixture computes ticks from the canonical clock.
- The first event from an 08:00 start is at 18:00, not midnight; midnight runs the next day.
- Year-0 stored election stamp is distinguished from the founding `-1` sentinel after an actual load.
- Historical release notes remain untouched, while the current changelog states the active 288-tick contract.

## Intended fix and verification

Remove duplicate load repair in production; repair current fixtures/comments; preserve historical README content; add real save/load tests for stale-festival removal **and** valid-festival preservation, with no mocks of internal modules, plus a synthetic founding-year-election save/load test. Run the named suites, full Node.js CI, lint and existing simulation/performance gates.

**Verification — passed on code commit `1de462e`:** `tests/saveLoad.a1CalendarRepair.test.ts` 2/2 on the earlier code commit (pre-review; an internal call-count mock was removed in response to review, and the revised real-outcome tests require fresh CI), `tests/gameTick.layerOrder.test.ts` 8/8, `tests/storyEvents.welcome.test.ts` 2/2, `tests/displayYear.oneBased.test.ts` 4/4, `tests/spotlightLore.test.ts` 27/27, Node.js CI 106 files / 929 tests, plus calendar, 120-day, and 250/750/1800 performance gates. Browser old-save fixture with owner-supplied historic file is not part of this synthetic test; GAME-05 is covered by current-resolution and synthetic legacy 72-tick Year-0 round-trips, but no owner-supplied historical file was available for replay. The new behavior and calendar regressions require a fresh full CI run after review fixes.

## SIM-06/07 additional A1 consolidation

One 18:00 `tickElectionPromises` writer now runs from `dailyWorldEvents.tickDailyWorldEvents` after production. Removed the duplicate `tickLayerDaily` call and the `villageLeadership.tickLeaderPromise` forwarding wrapper. Calendar integration verifies promise verdict occurs at 18:00 exactly once in the next two evening boundaries, without mocks. Election-voter documentation now describes the seeded 65–98% attendance rather than claiming all adults cast a ballot.
