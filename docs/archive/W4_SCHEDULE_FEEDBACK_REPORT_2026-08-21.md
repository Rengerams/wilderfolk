# W4 Schedule Feedback and Workforce Safeguards — Objective Report

**Status:** verified
**Date:** 2026-08-21
**Owner:** `scheduleFeedback.ts` selectors, existing schedule panels, typed schedule command boundary, and `tickLayerDaily.ts` event-log feedback
**Cadence:** presentation preview on UI state; player-command validation through the existing worker path; daily fatigue feedback through the existing daily owner

## Player outcome

The schedule UI now previews expected hours, affected workplaces or venues, assigned staff, and the consequence of a longer or shorter window before the player applies a command. Invalid windows are explicitly shown as **Blocked**, unchanged windows as **Unchanged — no command will be sent**, and valid windows as **Accepted by bounds**. Tavern and Hotel panels also show whether the Tavern festival override is active.

Daily fatigue changes of at least eight points are recorded in the existing event log/Chronicle stream as concise feedback. The UI remains read-only: it computes selectors and sends typed commands, while the worker remains authoritative for accepted state changes.

## Simulation Change Record

- Owner module: `scheduleFeedback.ts` for pure selectors; existing schedule panels for presentation; `tickLayerDaily.ts` for daily event-log feedback.
- Decision changed: Schedule choices now explain affected workplaces, staff impact, fatigue risk, and override state before application.
- Cadence: UI preview is presentation-only; schedule mutation remains player-command cadence; fatigue feedback remains new-calendar-day cadence.
- State fields written: No new UI state in `WorldState`; daily feedback writes only existing `eventLog` through the daily owner.
- Player-visible behavior before: Schedule controls showed bounds and current hours but not affected workplaces, staff counts, warnings, or daily fatigue history.
- Player-visible behavior after: The player sees a plain-language preview and explicit blocked/unchanged/accepted status before applying a change, plus concise event-log feedback after meaningful fatigue changes.
- Performance impact: Preview scans only the existing buildings and entities when the panel renders; daily feedback is one bounded player-human pass already used for fatigue resolution.
- Tests: `tests/scheduleFeedback.test.ts`, venue/fatigue tests, and the complete regression suite.
- Invariants: UI never mutates simulation state; guests are not employees; fixed School/Church/Town Hall schedules remain unchanged; no new tick layer; no automatic staffing; no pregnancy, mortality, or relationship side effects.
- Save/migration impact: No new save fields. Existing event log persistence is reused.
- Rollback plan: Remove preview selectors and event-log threshold feedback; existing schedule command and W3 fatigue behavior remain valid.

## Validation

| Check | Result |
|---|---:|
| Focused W4/venue/fatigue tests | 3 files, 12 tests passed |
| Full regression/type suite | 74 files, 423 tests passed |
| Production build | Passed; existing circular-chunk and large-chunk warnings remain |
| ESLint | Passed |
| `git diff --check` | Passed |

## Deferred non-goals

Automatic staffing, staff rotation, overnight schedules, new command-result protocol fields, and schedule changes for School, Church, or Town Hall remain deferred.
