# Child playmates reroll hourly and playing is labelled as walking home

- Bug: Children can choose a different nearby playmate every hour, while the selected-settler inspector incorrectly infers 'Walking home' from residence distance and omits playmates from movement explanations.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-22
- Version/build: main at 112a0839ce062f7610ea6b6d1f8acdb4d04a8272
- Reporter: player screenshot of multiple children congregating by the shore
- Area: child leisure, activity inspector, movement explanation
- Owner module: `humanLeisureBehavior.ts` (choice and intent), `humanStatus.ts` and `movementExplanation.ts` (read-only display)
- Related PR/commit: fix/child-playmate-daily-and-activity-20261122

## Status history
- 2026-11-22 — investigating: daily selection, persisted intent and read-only activity/target updates committed; focused regression tests added, CI pending.
- 2026-11-22 — investigating: Codex review fixes committed; evening-outing projection excludes children and scheduled homeward travel reads the existing movement owner's commute evidence. Added 19:00 and scheduled-home regressions, latest CI pending.

## Observed behavior
A child standing alongside other children is labelled "Walking home" with a House target even when play/follow behaviour is steering movement. The old child selection cache uses `Math.floor(tick / TICKS_PER_HOUR)`, rerolling a potential partner each hour.

## Expected behavior
One playmate is selected per colony day and retained while available. Work/school/sleep obligations override leisure. The inspector reports actual playing, following or homeward travel, and does not describe a playmate as an absent homeward journey.

## Reproduction steps
1. Start a colony with two nearby children with an assigned house.
2. Observe that the old cache refreshes at each hourly boundary and that the selected-child activity reads "Walking home" away from their house.
3. With the new implementation, exercise `tests/humanLeisureBehavior.test.ts` and `tests/humanStatus.projection.test.ts` for day retention, save-copy continuity, unavailable partner replacement and read-only target projection.

## Evidence
`tickHumanChildLeisure` previously used an hourly `WeakMap` cache. `getHumanActivityStatus` defaulted to "Walking home" solely on house distance, and `explainHumanMovement` only represented houses, workplaces and venues. The screenshot is evidence of the symptom, not proof of why that exact shoreline was chosen.

## Root cause
Daily relationships were stored in an hourly ephemeral cache, while UI projection ignored child leisure intent and instead inferred movement from a distant assigned residence.

## Fix / proposed fix
The leisure owner now records the playmate ID and colony day on `Entity`; it reselects only at a day boundary or if the chosen mate disappears. It records play/follow/home intent for read-only activity and movement projections. Children are excluded from the adult evening-outing target, and a homeward label additionally reads `humanMovement.isCommutingToBuilding` for schedule-owned travel. No second scheduler or UI-side playmate decision was added.

## Save/migration impact
Optional fields are absent in older saves and initialize on the first eligible leisure tick. The existing full-entity worker tick delta and save representation carry the added primitive fields. No schema version change.

## Verification result
- Source trace: completed.
- Focused regression tests: added; not executed locally.
- TypeScript, lint, full CI: not run locally; pending PR checks.
