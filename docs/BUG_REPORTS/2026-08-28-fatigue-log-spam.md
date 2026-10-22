# Bug: Schedule fatigue floods the chronicle with duplicate zero-hour work events

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer-provided Village Chronicle
- Area: Play | UI | diagnostics
- Owner module: Daily schedule-fatigue aggregation and event logging
- Cadence: Daily at the colony-day boundary

## Status history

- 2026-08-28 — investigating: the Village Chronicle showed repeated per-settler fatigue cards such as “Schedule fatigue recovered to 72% after 0.0 hours of work.”
- 2026-09-09 — resolved: daily fatigue is aggregated into at most one settlement-level chronicle summary per day (rise or short-shift recovery); zero-hour off-shift recovery is silent; individual fatigue still updates per schedule results (fix: `dailyScheduleFatigue.ts` aggregation, commit `de98bd6` 2026-08-29; regression tests `tests/dailyScheduleFatigue.test.ts`).

## Observed behavior

The same daily fatigue message is logged once per affected settler. On off-shift days it labels normal recovery as occurring “after 0.0 hours of work.” In the supplied Year 0 Day 27 chronicle, five identical recovery messages buried buildings, hunting, marriage, storm, and ecology events.

## Expected behavior

The chronicle should emit at most one meaningful settlement-level fatigue summary per day. It must distinguish active-work fatigue from off-shift recovery and omit no-op or non-actionable recovery noise. Work duration should only be presented as causal context when it is non-zero.

## Reproduction steps

1. Create multiple adult settlers under the standard work schedule.
2. Run through a work day and a non-work/recovery day.
3. Open the Village Chronicle.
4. Observe repeated worker-level fatigue entries and zero-hour recovery wording.

## Evidence

Developer-provided Village Chronicle export on 2026-08-28, including repeated recovery entries on Days 13, 14, 20, 21, and 27 and repeated fatigue-rise entries on Days 12, 15, 16, 17, 22, and 23.

## Root cause

Pending investigation of daily per-human fatigue calculation and `logEvent()` emission in the daily schedule path.

## Fix

Pending investigation. The fix must retain fatigue calculation and player-selected schedule consequences, aggregate presentation only, and avoid a UI-owned simulation mutation path.

## Regression test

Pending: one daily summary at most; no “after 0.0 hours of work” text; individual fatigue values still change according to schedule results.

## Invariants checked

Not applicable — presentation/event aggregation must not alter individual fatigue state, work assignment, work schedule, or production state.

## Save/migration impact

None expected — event/log behavior only.

## Verification result

Pending.

## Related files

- `src/game/tickLayerDaily.ts`
- `src/game/scheduleFatigue.ts`
- `src/game/eventLog.ts`
