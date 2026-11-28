# Factory age and identity defaults disagree

- Bug: Human spawn defaults can disagree with the calendar juvenile flag, invent a maiden name, or accept a pregnancy marker as civil status.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-28
- Version/build: 0.6.5.2, inspected main entityFactory blob 96c30dd759ab9813d9b5cc6f603ffe2a4098d527
- Reporter: owner source review
- Area: entity creation, calendar, identity
- Owner module: entityFactory.ts (creation), dayCycle.ts (calendar age initialization)

## Status history
- 2026-11-28 — investigating: source defects confirmed; implementation and focused regressions committed; CI not verified.

## Observed behavior
An explicit adult flag with a child calendar age produces an adult-sized child, and an explicit juvenile flag with an adult age produces a half-sized adult. Promoting an initially half-sized entity through finalizeSettlerAge does not restore its size. A married spawn without a maiden name draws a random surname, and new factory options accept the legacy expecting civil status.

## Expected behavior
Human calendar age determines juvenile status and corresponding size. Missing historical identity is not invented. Pregnancy is separate from civil status.

## Reproduction steps
1. Create a human with ageYears 8 and isJuvenile false, or ageYears 30 and isJuvenile true.
2. Compare the returned flag and size, then run finalizeSettlerAge for the child.
3. Create a married woman with a supplied surname and no maiden name; inspect the generated identity.

## Evidence and root cause
createEntity computed size before setHumanBirthFromAge rewrote juvenile status; finalizeSettlerAge rewrote age and flag without size. The factory independently drew a maiden surname for partnered women and included expecting in its creation type.

## Fix
Calendar initialization sets human size and juvenile status together; the factory and finalizer delegate to it. Explicit juvenile flags remain applicable to non-human species. Married or widowed spawns without maiden-name evidence retain an unknown value. New creation options exclude expecting; legacy persisted status is still accepted for existing migration owners.

## Save/migration impact
No schema change. Explicit age initialization uses the same calendar owner for loaded entities where already invoked; no speculative genealogy reconstruction. Ordinary age synchronization and graduation remain separate.

## Verification result
Source trace only. Extended existing lifecycle and geometry regression suites. Local build, tests and live simulation not run; CI pending.

## CI follow-up — 2026-11-28

The affected suite passed 3,008 of 3,010 tests. Two failures exposed a direct marriage-status comparison and a calendar correction overwriting established child geometry. The factory now reads isMarriedOrExpecting and explicitly opts into spawn/finalization body initialization; ordinary calendar corrections retain their prior size. Existing graduation and architecture tests are unchanged. Re-run pending.
