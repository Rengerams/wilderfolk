# Migrated event dialogue lasts far longer than original speech

- Bug: legacy nominal tick durations were passed as hardcoded dialogue hours, prolonging speech and blocking subsequent interactions.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2, PR #93 dialogue migration branch
- Reporter: Codex PR review, [discussion #4404557895](https://github.com/Rengerams/wilderfolk/pull/93#discussion_r4404557895)
- Area: scripted event dialogue durations
- Owner module: `src/game/dialogueTrees.ts` (unit conversion), `src/game/humanChat.ts` (session timing only)
- Related PR: [#93](https://github.com/Rengerams/wilderfolk/pull/93)

## Status history

- 2026-10-28 — investigating: review confirmed incorrect 4-to-64-tick conversion in migrated hospital speech.
- 2026-10-28 — correction applied to migrated domain callers using `dialogueHoursFromNominalTicks`; regression test added in commit [79f2e8f](https://github.com/Rengerams/wilderfolk/commit/79f2e8f2af29a8ca58421a97a72bae00a6c787fe). Final CI result pending.

## Observed behavior

Legacy `sayHumanChatPhrase(patient, text, 48)` used `Math.max(4, Math.round(48 * PER_TICK_RATE_SCALE))` and lasted **4 effective ticks** at the current 12 ticks/hour. The first migrated `requestDialogue` invocation supplied `durationHours: 16 / 3`, yielding **64 effective ticks**. `isDialogueBusy` consequently remained true for over five game hours, preventing new ambient conversations.

The same unit mismatch affected hospital, hotel, hunting, Town Hall and Renffr omen captions. With the current clock, nominal 40–52 ticks must still yield 4 effective ticks, while nominal 150 yields 13.

## Expected behavior

Migrate authored speech into canonical JSON without altering its effective bubble lifetime, social busy gates, event cadence, selected dialogue text, deterministic rolls or saved data.

## Reproduction steps

1. Compare the old `sayHumanChatPhrase` duration scaling with `requestDialogue` and `humanChat.showDialogueStep`.
2. For hospital treatment, compare `Math.max(4, Math.round(48 * PER_TICK_RATE_SCALE))` against `Math.max(4, Math.round((16 / 3) * TICKS_PER_HOUR))`.
3. Observe 4 vs 64 ticks and the increased `isDialogueBusy` window. Repeat with the other migrated event captions.

## Root cause

Nominal legacy ticks and actual game hours were conflated in the migration. The current authoritative `dayCycleClock.ts` values are `TICKS_PER_HOUR = 12` and `PER_TICK_RATE_SCALE = 1 / TICKS_PER_HOUR`.

## Fix

Use the shared `dialogueHoursFromNominalTicks(nominalTicks)` in `dialogueTrees.ts`, which derives hours from the same effective tick count as the legacy writer: `Math.max(4, Math.round(nominalTicks * PER_TICK_RATE_SCALE)) / TICKS_PER_HOUR`. The affected domain callers now pass their original nominal counts rather than hardcoded hour fractions.

## Regression and verification

`tests/humanChat.duration.test.ts` asserts effective durations and exact busy-state release for 12 representative migrated captions, including the 150-nominal-tick omen. This regression was committed to PR #93; **CI verdict pending** at report creation. The earlier full Node CI failure concerned an unused import, not this duration test.

## Save/migration impact

None. No new save fields, RNG, tick scheduler, gameplay rules or session owners; the fix restores the old runtime duration of event speech.
