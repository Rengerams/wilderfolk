# Social motives bypass needs and leisure routing

**Status:** investigating; implementation and regressions added; CI and live reproduction pending.

## Observed behavior

Static source tracing shows that socialLife used a legacy energy mirror for exhaustion and medical vulnerability, referred healthy early pregnancies to hospitals independently of admission, and accepted unilateral spouse references. Its duplicated cached/uncached venue selection ignored distance, adult motives bypassed the ordinary leisure route rejection path, and completed market/civic errands could repeat all day.

## Expected behavior and correction

- Read physiology-owned stamina and break intent; use hospitalCare medical need/urgency and the existing staffed-ward predicate. A roster does not imply a doctor is physically present; treatment continues to use the hospital owner's existing rules.
- Partner care is companionship, not a medical referral; require living mutual marriage and the same nearby radius used for social scans. Keep delivery priority and work/sleep gates unchanged.
- Select nearest eligible completed venue with stable ID tie-break, using the existing completed pool cache. Adult grave, company and building travel use the existing leisure route/arrival/rejection helper, with no second movement integration. Only give company comfort when actually close and unobstructed.
- Record market and civic errand completion after arrival, using a day-scoped saved receipt replaced rather than mutated. Other social activities (service, birthday, grieving, rest and gatherings) intentionally remain sustained motives, not instant errands.

## Verification

Extended tests/socialCadence.oneScenePerDay.test.ts for stale energy versus stamina, healthy pregnancy, reciprocal marriage, nearest venue and completed errand selection. Existing inspector and worker fixtures are migrated to the shared pool interface. No local execution available; CI required. Static evidence, not a reproduced save-game incident.
