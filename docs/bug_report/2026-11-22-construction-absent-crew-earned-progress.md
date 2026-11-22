# Unwitnessed construction roster earned crew speed and XP

- Bug: Unwitnessed construction roster earned crew speed and XP.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-22
- Version/build: 0.6.5.1; PR #166 targeting 0.6.5.2
- Reporter: Codex review / PR #166 owner audit
- Area: Construction and labour economy
- Owner module: `src/game/dailyBuildingEconomy.ts`; canonical attendance in `src/game/scheduleFatigue.ts`
- Related PR: https://github.com/Rengerams/wilderfolk/pull/166

## Status history
- 2026-11-22 — investigating: source trace reviewed; correction prepared in PR #166; CI verification pending.

## Observed behavior
An occupant listed on an unfinished site could contribute crew speed and/or trade skill regardless of whether the settler reached that site. Adding a weaker worker could also reduce a stronger worker's effective result through averaged crew skill. This is distinct from the older W-90 dead-occupant roster defect.

## Expected behavior
Only adult, living, present, site-matched player settlers grant construction staffing speed or trade credit. An extra positive attended fraction must not lower progress.

## Reproduction steps
1. Place an unfinished staffable site with an expert worker on its witnessed roster.
2. Add a second roster entry with zero presence, then with one witnessed tick.
3. Compare progress/skill credit in the old rate and new per-attendee calculation.

## Evidence
PR #166 source diff in `dailyBuildingEconomy.tickBuildingProgress` and its `production.attendancePacing.test.ts` regressions. W-90 previously removed dead roster counts, but not verified site attendance and monotonic per-worker contributions.

## Root cause
Roster membership was treated as crew labour; pooled skill factors could dilute an expert and add phantom experience.

## Fix / proposed fix
Use the existing site/tick attendance witness, validate person and site, price each worker separately, keep a nonnegative bonus per attended share and pay one proportional shift credit.

## Save/migration impact
None. Existing attendance and skill fields are retained; no new persisted construction ledger or scheduler is added.

## Verification result
NOT RUN locally for this revision; targeted crew monotonicity and zero-presence tests were added in PR #166. The previous expert case was capped and was revised to remain below 100%.
