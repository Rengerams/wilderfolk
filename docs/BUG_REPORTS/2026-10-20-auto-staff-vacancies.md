# 2026-10-20 — Auto staffing leaves vacancies while settlers idle

## Report
Player reports completed workplaces set to **Auto** remain below their maximum staff count even while the village reports idle settlers.

## Reproduced from code (Tavern/Hotel)
`workforce.assignWorkerInPlace` previously capped automatic assignment to `getVenueAutoStaffingTarget`, a **minimum opening-hours shift coverage** that is less than the building's `maxOccupants`. This silently prevented auto-fill above the minimum even with eligible adults available. Other completed work buildings should already fill to configured cap.

## Fix
- Commit `132c83e`: Auto staffing now uses `staffingCapFor` for Taverns/Hotels as for other workplaces. Venue service-hours schedule still governs when assigned workers are on duty; it is not a limit on employment slots.
- Commit `2351e40`: regression checks capacity for both venue types with surplus eligible adults and short opening windows.

## Follow-up
Run `npm run build` and relevant Vitest tests. Investigate if non-venue workplaces also underfill; possible exclusions include staff assigned to construction, imprisoned citizens, juvenile citizens, uncompleted buildings and manual mode. Confirm with affected building type and save data before changing these rules.
