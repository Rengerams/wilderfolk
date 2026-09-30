# Bug: Citizens assigned to a workplace do not stay there during work hours

- Status: investigating — status display added to help reproduce; root cause not yet confirmed
- Date discovered: 2026-08-24
- Version/build: Wilderfolk v0.6.3 working tree
- Reporter: Dev
- Area: movement citizens
- Owner module: `src/game/humanTick.ts` (realtime movement), read-only status in `src/game/humanStatus.ts`
- Cadence: realtime work movement

## Status history

- 2026-08-24 — open (reported by Dev)
- 2026-08-24 — investigating (added a read-only per-human activity status shown in the selected-entity panel so the player can see why a worker is away; reproduction needs the observed status label)

## Observed behavior

It looks like citizens assigned to a workplace are not staying at the workplace during work hours.

## Evidence

- User report: normal job buildings (Farm, Lumber, Mine, etc.); the worker arrives but leaves again during work hours.
- Focused repro with a completed Farm + assigned Farmer did NOT reproduce leaving after arrival (worker stayed within ~30 units of the farm during work hours).
- Added `getHumanActivityStatus()` and a status line in `SelectedEntityPanel` to expose what each human is doing at the clicked moment.

## Root cause

Not yet confirmed. Candidate causes to check with the new status: festival gathering, famine override (hunting), courtship/affair paths, venue shifts, auto-staff reassignment between buildings, or an uncompleted workplace.

## Proposed changes and unique IDs

- Status diagnostic: `UX/2026-08-24-human-activity-status` (implemented).

## Fix

Investigate with the new status display, then fix the movement/assignment owner and update this bug log.
