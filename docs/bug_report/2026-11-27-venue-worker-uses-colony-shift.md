# Venue workers inherit ordinary colony shift in commute and activity projection

- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Version/build: 0.6.5.2 development
- Reporter: owner — innkeeper continues working after festival
- Owner modules: humanTick, workAbsence, humanStatus, venueSchedule
- Related PR: #231

## Evidence
Current attendance already excludes the festival visitor-service override; the older all-day attendance bug is documented in `docs/BUG_REPORTS/2026-10-09-innkeeper-festival-fatigue-regression.md`. However the ordinary colony commute and inspector duty predicates ignore venue shifts; hotel staff also receive ordinary day duty. These are distinct remaining defects. The exact reported 24-hour post-festival behavior has not been reproduced from a live save.

## Fix
Use individual venue duty and commute, exclude completed hotels from ordinary day-job attendance, and project the actual venue window. Retain the festival visitor opening override only for visitors. Do not change configured opening hours.

## Regression and save impact
Extended `tests/prisonFestivalWorkContinuity.test.ts` through expiry and into the following day. No schema change. CI/live replay pending.
