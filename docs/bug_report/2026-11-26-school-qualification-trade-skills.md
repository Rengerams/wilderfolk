# Schooling fabricates attendance and universal trade skills

- Status: investigating
- Severity: medium
- Date discovered: 2026-11-23
- Area: education, immigration and apprenticeship
- Owner: education.ts, worldGen.ts, apprenticeships.ts; skills.ts retains skill-write authority

## Observed behavior
A 17-year-old immigrant received 220 school days at arrival; scholar graduation awarded 20 skill points to every job even without trade training.

## Expected behavior
New arrivals earn witnessed school days in the village. Graduation establishes eligibility; the school-tier bonus applies only on completion of training in the relevant trade.

## Reproduction and evidence
The previous immigration composition test explicitly expected 220 days at age 17; the graduation test expected a 20-point award in every job. Both encoded the old behavior. Source inspection confirms the unconditional spawn credit and graduation skill loop.

## Fix
Start new immigrant children at zero days, remove universal graduation skills, and move the existing tier amounts to completed trade apprenticeships, guarded by the existing career training receipt. Retain graduation stamina and research effects. Existing records and skills are not retroactively altered because their provenance is ambiguous.

## Verification
NOT RUN: focused regression tests and full CI. Updated immigration, graduation and apprenticeship tests assert the new contract.

## Status history
- 2026-11-26 — investigating: implementation and regression changes submitted; CI pending.

- 2026-11-26 — follow-up: reconcile overlapping PRs #198/#199, restoring tier bonuses 5/8/20 and validating new pair eligibility and commute reach. Existing saves remain unchanged; CI and live simulation pending.
