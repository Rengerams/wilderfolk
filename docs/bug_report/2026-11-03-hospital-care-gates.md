# Hospital care gates let near-term doctors serve and hid grief care

- Bug: a doctor kept running ward rounds at 99 % of a pregnancy, and the treatment gate re-tested stamina below 50 %, so a settler whose medical need came from grief (stamina 50–70 %) never sought care. The daily treatment roll also used a bare `840` salt and `0.2` chance.
- Status: resolved
- Severity: medium — a near-term doctor worked instead of resting; grieving settlers missed care
- Date discovered: 2026-11-03
- Version/build: 0.6.5.1 working tree (0.6.5.2 development)
- Reporter: owner review of `humanHospitalBehavior.ts`
- Area: hospital care
- Owner module: `src/game/humanHospitalBehavior.ts` (`tickHumanDoctorHospitalService`, `shouldAttemptHospitalTreatment`, `isAtHospital`)
- Related PR/commit: fixed 3 November 2026

## Status history

- 2026-11-03 — open: recorded from the owner's file review.
- 2026-11-03 — resolved: pregnancy takes the doctor off duty, `needsMedicalCare` alone decides care, and the roll uses named constants.

## Observed behavior

- `tickHumanDoctorHospitalService` gated on shift, player and `job === Doctor` only — a doctor in labour still treated the ward. The hospital is both her workplace and her delivery place, so the two states overlapped.
- `shouldAttemptHospitalTreatment` required `getHumanStaminaRatio < 0.5` in addition to `needsMedicalCare`, which detects grief up to 70 % stamina and low stamina below 42 %. The extra gate made the grief clause mostly dead: grief at 50–70 % never reached a ward.
- The daily treatment roll was `personDayRoll(entity.id, state.tick, 840) < 0.2` with no named salt or chance.
- A patient was marked indoors up to 36 px from the door, so they could vanish while still visibly outside.

## Expected behavior

A near-term doctor is a patient; a detected medical need is enough to seek care, working or not; tuning values are named.

## Reproduction / evidence

`tests/hospitalWalk.regression.test.ts` — "takes a near-term doctor off the ward round" (79 % serves, 81 % does not), "seeks care for a detected need even with stamina above half" (grieving at 60 % stamina is true, healthy is false), "does not mark a patient indoors while they are still more than a door away".

## Root cause

The doctor gate never read pregnancy; the care gate repeated a stamina test that was stricter than the need test; magic values stayed inline.

## Fix (applied)

- `doctorMayServe(entity)` returns false past 80 % of `PREGNANCY_TICKS`; the doctor service returns early for her.
- `shouldAttemptHospitalTreatment(entity, hasStaffedHospital, tick)` is `isPlayerHuman && hasStaffedHospital && needsMedicalCare(entity, tick)`; the redundant stamina clause and the dead `!onJobShift` term are gone.
- Named constants: `HOSPITAL_TREATMENT_ROLL_SALT = 840`, `HOSPITAL_TREATMENT_DAILY_CHANCE = 0.2`, `PATIENT_CENTRE_RADIUS_PX = 36`, `PATIENT_ENTRY_RADIUS_PX = 16`, `DOCTOR_PREGNANCY_OFF_DUTY_RATIO = 0.8`.
- Entry uses the 16 px door radius, so a patient is not marked indoors a door away.

## Not a bug — the night-shift claim

The review claimed `tickOfShift` goes negative for a 22:00 shift. There is no 22:00 shift: `HOSPITAL_SHIFT_WINDOWS` starts at 0, 8 and 16, and `isHospitalDoctorOnShift` gates each doctor to their own window, so `getTickOfDay - startHour * TICKS_PER_HOUR` is always in `[0, 23]`. `tests/hospitalShifts.test.ts` proves exactly one doctor is on shift in every hour of 14 days. No code change was made for this claim.

## Regression coverage

`tests/hospitalWalk.regression.test.ts`, `tests/settlers.indoors.test.ts`, `tests/medium-A-movement.test.ts`, `tests/hospitalShifts.test.ts`.

## Save compatibility

None: in-memory state only.

## Verification

`npx vitest run tests/hospitalWalk.regression.test.ts tests/settlers.indoors.test.ts tests/medium-A-movement.test.ts` — 58 passed. `npm run test:types`, `npm run lint` — passed.
