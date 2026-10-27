# Bug: Barracks description shows the wrong militia-strength bonus

- Status: resolved
- Date discovered: 2026-08-22
- Version/build: Wilderfolk v0.6.3 unreleased
- Reporter: Prison and Barracks Verification Addendum
- Area: UI | Truth | Play
- Owner module: `src/game/buildings.ts`, `src/game/defenseStructures.ts`
- Cadence: Building description/rendering and defense calculation

## Status history

- 2026-08-22 — open (source comparison found player-facing copy disagrees with the authoritative balance constant)
- 2026-08-23 — resolved (copy changed to Soldiers/+14 and focused role regression passed)
- 2026-08-25 — re-verified/reapplied: the working tree again contained stale `+12`/`Guards` copy after a checkout; fixed all three text spots to Soldiers/+14 (commit `2691a13`)

## Observed behavior

The Barracks building description says: `Staff Guards to patrol the village (+12 militia strength each).` The authoritative `MILITIA_BALANCE.guardBonusPerGuard` value is `14` before forge upgrades.

## Expected behavior

The player-facing description must show the same base value used by authoritative defense calculation, or clearly describe the value as a different intentional metric.

## Reproduction steps

1. Build or inspect the Barracks building configuration.
2. Read the Barracks description.
3. Assign a valid Soldier and inspect the defense calculation.
4. Compare the displayed +12 with the authoritative +14 base bonus.

## Evidence

- `src/game/buildings.ts:363` — Barracks description contains `+12 militia strength each`.
- `src/game/defenseStructures.ts:23` — `MILITIA_BALANCE.guardBonusPerGuard: 14`.
- Prison and Barracks Verification Addendum — confirms the player-facing mismatch.

## Root cause

The building description contains a hard-coded stale balance value instead of reading or sharing the authoritative displayed-value source.

## Fix

Update the copy to +14 or derive the displayed base value from the shared balance constant. Do not change the balance value as part of this clarity fix.

## Regression test

Add a focused assertion that the Barracks description and authoritative base guard bonus agree, while forge upgrades remain separately represented.

## Invariants checked

- Barracks Soldiers contribute the authoritative base militia bonus.
- Prison Guards do not contribute Barracks defense.
- UI copy does not invent a different base value.
- Balance tuning remains separate from copy correction.

## Save/migration impact

None. This is a UI/configuration correction.

## Verification result

Resolved. Barracks copy now says `Staff Soldiers to patrol the village (+14 militia strength each).` The focused security-role suite passes, including the copy-to-`MILITIA_BALANCE.guardBonusPerGuard` assertion; TypeScript, targeted ESLint, and `git diff --check` pass.

## Related commits or files

- `src/game/buildings.ts`
- `src/game/defenseStructures.ts`
- `docs/PRISON_FUNCTION_AUDIT.md`
- `BUG_REPORTS/Readme.md`

## Unique ID

`2026-08-22-barracks-militia-copy-wrong`

## Audit change references

- Change 16: player-facing security and festival clarity.
- Change 17: Prison/security UI state clarity.
- Change 22: focused regression validation.

## Practical advice

Fix the displayed value without retuning combat. If the intended balance is +12 rather than +14, make that a separate balance decision with its own change record and tests.

