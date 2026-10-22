# Bug: Conception is logged as a birth event, so births are mislabelled and overcounted

- Status: resolved
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Coding assistant (found while auditing a deterministic full-year run; developer suspected "some of the social sim doesn't work")
- Area: Truth | UI (Chronicle)
- Owner module: `src/game/simulation/humanRelationships.ts` (conception owner)
- Cadence: The conception decision (once per colony day per eligible pair) — the event log write, not the decision

## Status history

- 2026-09-10 — open: a 360-day run reported `birthsCompleted: 32` settler pregnancies completed but **56** events of `type: 'birth'` in the log. Tracing the writers showed conception announcements are written with the birth type.
- 2026-09-10 — resolved: `'conception'` added to `EventType`; the two conception writers annotate expectations with it; consumers updated; regression coverage in `tests/conceptionEvent.labelling.test.ts`. Save format untouched (an event log is historical text, and load passes entries through unchanged).

## Observed behavior

The full-year run (`seed 12345`, 1 year) reported:

```text
annualSocialTotals: pregnanciesStarted 27, birthsCompleted 32
eventTotals:        births 56
```

`birthsCompleted` counts every completed pregnancy (`humanLifecycle.ts:90`, incremented for the normal, bastard, and Wildkin outcomes alike). The log tally (`countEvents()` in `scripts/run-full-year.mts`, filtering `eventLog` on `type === 'birth'`) counted 56 — nearly double — because **the moment a pregnancy begins, an "expecting" announcement is written with the birth type**:

- `humanRelationships.ts:648` — `startMarriedPregnancy` → `logEvent(state, 'birth', "${mother} and ${father} are expecting a child")`
- `humanRelationships.ts:664` — `startYouthPregnancy` → the same line with the same type
- Correction to the first draft of this report: the third conception helper (`startAffairPregnancy`) writes `'scandal'`, not `'birth'`. Only the two helpers above inflated births; the affair path was already excluded from the count, and it deliberately stays a scandal because the *secret* is the event the Chronicle and the scandal feed must show.

Actual deliveries are also written as `'birth'`: `humanLifecycle.ts:203` (born), `:186` (born a bastard), `:113` (Wildkin born).

So one pregnancy produces up to two `birth`-typed events: one "expecting" and one "born".

## Expected behavior

A birth event means a child (or Wildkin) was delivered. The start of a pregnancy is a conception/expectation, a different fact, and the Chronicle must not present it as a birth. Per `AGENTS.md` §8 (pregnancy invariants) diagnostics must distinguish new conceptions, active pregnancies, and completed births — the event log currently blurs the first and third.

## Reproduction steps

1. `npm run test:full-year` (seed 12345, 1 year) and read the `full-year-complete` line: `eventTotals.births` (56) exceeds the settler births actually completed (32).
2. Or grep the writers: `logEvent(state, 'birth', ...)` occurs in the conception helpers as well as the delivery paths.

## Evidence

`docs/log/full-year-2026-09-10T02-00-39-974Z.jsonl` — `full-year-complete` line: `birthsCompleted 32` vs `eventTotals.births 56`, with `marriages 145`, `divorces 67`, `scandalEvents 176`, `scandalImpressions 28`. Ruled out as causes: the diagnostics history cap (it is `MAX_HISTORY = 400`, so a 360-day run is not truncated) and the conception counters themselves (all three conception helpers do record `pregnanciesStartedThisInterval`).

## Root cause

The conception helpers reused the `'birth'` event type for the "expecting" announcement, so `EventType` cannot distinguish the two facts at any consumer. Downstream consumers that therefore treat expectations as births: `eventLogFilters.ts:9` (Chronicle "Births" filter), `dashboardData.ts:319` (`counts.births++`), `contextualTutorial.ts:415-418` (watches new birth events), `rumourLedger.ts:89` (maps birth to the 'family' rumour category).

## Fix

Implemented as follows.

1. `'conception'` added to `GameEventLog['type']` in `gameTypes.ts`, with a comment stating the distinction. Because `EventLogPanel.tsx` declares `EVENT_ICONS` and `EVENT_COLORS` as `Record<GameEventLog['type'], string>`, the compiler refuses to build until the new type has an icon (`🤰`) and colour (`text-fuchsia-300`), so a future event type cannot be added silently.
2. `startMarriedPregnancy` and `startYouthPregnancy` now write `'conception'`. The line text ("… are expecting a child") is unchanged, so the Chronicle still reads the same; only the type moved.
3. Consumer behaviour, decided and stated:
   - `eventLogFilters.ts` — the type gets its own Chronicle filter, **Conceptions (expecting)**, placed before **Births**. Both are shown; neither is hidden.
   - `dashboardData.ts` — the council report counts `conceptions` in a **separate** bucket and renders `Births N · Expecting M · …`, so a day with two expectations and no delivery no longer claims two births.
   - `contextualTutorial.ts` — unchanged behaviour, now correct by construction: the `first_birth` tutorial only matches `'birth'` events plus a living new juvenile, so an expectation cannot trigger it. A comment records that this is deliberate.
   - `rumourLedger.ts` — `'conception'` maps to the `'family'` rumour source kind alongside `'birth'` and `'marriage'`, preserving the previous category for the newest-event scan.
   - `scripts/run-full-year.mts` — `countEvents()` now also reports `conceptions`, so the annual summary can be reconciled by a reader.
4. `birthsCompletedThisInterval` semantics unchanged — it always counted deliveries.
5. Save compatibility: nothing to migrate. Load passes `eventLog` through unchanged and `EventType` is not a keyed save structure, so historical `'birth'` entries written before the fix keep reading as births and no save-version bump is required.

## Regression test

`tests/conceptionEvent.labelling.test.ts` — four cases on a real `initGame()` world with the real command-free owners:

1. a married conception (forced by stubbing `Math.random` to 0) logs exactly one `'conception'` event with the expecting line, and the log contains **no** `'birth'` event;
2. a youth-love conception (ages 16, mutual link) does the same — this pins the second writer, which a married-only test would miss;
3. the council report shows `Births 0 · Expecting 1` for the day the expectation was logged;
4. a completed delivery (pregnant settler at due progress, fake `livingHumanAt`) logs exactly one `'birth'` event and **no** `'conception'` event, and leaves no simulation-invariant error.

A whole-run assertion that `eventTotals.births <= birthsCompleted` is still not valid as-is, because migrant couples arrive already pregnant (see the related finding below); the test therefore pins the labels at the writers instead.

## Invariants checked

- No pregnancy state, cadence, or ownership changes: the conception owner still creates pregnancies, the lifecycle owner still creates births.
- Diagnostics counters unchanged; this is an event-labelling fix, not a counter change.
- Related finding (not this defect): `worldGen.ts:504-514` creates **migrant couples with the wife already pregnant** (`pregnant: true`, `pregnancyProgress: 10 + random*50`). Those pregnancies arrive without a colony conception, which fully explains the remaining `pregnanciesStarted 27` vs `birthsCompleted 32` gap. Not a bug — but the diagnostics have no counter for "arrived pregnant", so the annual summary cannot be reconciled by a reader. Worth an explicit counter or a note in the summary.

## Save/migration impact

None required. Existing saves keep their historical `'birth'` entries; only newly written conception events use the new type. `EventType` is not a keyed save structure.

## Verification result

- `tests/conceptionEvent.labelling.test.ts` — 4/4 pass; full local suite 95 files / 507 tests pass; `npx tsc -b` clean; `npx oxlint` 0 warnings / 0 errors.
- Deterministic `npm run test:full-year` (seed 12345, 360 days) after the fix reports `birthsCompleted 30`, `eventTotals.births 30`, `eventTotals.conceptions 24`. The same-seed run immediately before the fix reported `birthsCompleted 30` with `eventTotals.births 54` — the difference is exactly the 24 expectations, so the two facts now reconcile with no unexplained remainder. (Migrant couples that arrive already pregnant still account for conceptions that never appear in the log; that is the documented related finding, not a labelling defect.)

## Related files

- `src/game/simulation/humanRelationships.ts` (the two writers; the affair helper stays a scandal)
- `src/game/simulation/humanLifecycle.ts`
- `src/game/gameTypes.ts` (`EventType`)
- `src/game/eventLogFilters.ts`, `src/game/EventLogPanel.tsx`, `src/game/dashboardData.ts`, `src/game/contextualTutorial.ts`, `src/game/rumourLedger.ts`
- `src/game/worldGen.ts` (migrant couples arrive pregnant)
- `scripts/run-full-year.mts` (`countEvents`)
- `tests/conceptionEvent.labelling.test.ts`
