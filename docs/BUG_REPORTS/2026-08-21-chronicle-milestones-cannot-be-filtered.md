# Bug: Chronicle milestones cannot be filtered

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-requested event-log audit
- Area: UI | Play
- Owner module: `src/game/EventLogPanel.tsx`
- Cadence: Render-time player filter selection

## Status history

- 2026-08-21 — open (discovered while comparing the `GameEventLog` union with Chronicle filter controls)
- 2026-08-21 — investigating (UI omission confirmed)
- 2026-08-21 — resolved (Milestones filter and complete category-parity regression added)

## Observed behavior

Milestone entries are stored, displayed by the Chronicle’s **All** view, and exported, but the player cannot select a **Milestones** filter.

## Expected behavior

Every supported `GameEventLog.type` should have a matching player filter unless it is explicitly documented as intentionally grouped with another type.

## Reproduction steps

1. Create or load a village with a milestone Chronicle entry.
2. Open **Log → Chronicle**.
3. Inspect available filters.

## Evidence

`GameEventLog['type']` includes `milestone`; `EventLogPanel` supplies an icon and color for `milestone`; `FILTER_OPTIONS` did not include a corresponding filter button.

## Root cause

The Chronicle UI added milestone rendering support without extending the filter list.

## Fix

Resolved. `EVENT_LOG_FILTER_OPTIONS` now includes `milestone` with the player-facing label `Milestones`.

## Regression test

Implemented in `tests/eventLogPanel.filters.test.ts`; it asserts that every value in the current `GameEventLog['type']` union has exactly one selectable Chronicle filter.

## Invariants checked

- Filter selection remains read-only presentation state.
- No event-log entry is mutated, hidden from export, or removed from the all-events view.

## Save/migration impact

None. Existing milestone records remain valid.

## Verification result

Resolved — `npm test -- --run tests/eventLogPanel.filters.test.ts` passed on 2026-08-21. Full validation remains recorded in the session changelog entry.

## Related commits or files

- `src/game/gameTypes.ts`
- `src/game/EventLogPanel.tsx`
- `tests/eventLogPanel.filters.test.ts`
- `BUG REPORTS/2026-08-21-chronicle-milestones-cannot-be-filtered.md`
