# tryGraduateHumanChild is unreachable: the daily age sync clears isJuvenile before the graduation check, so no child ever graduates

- **Bug:** tryGraduateHumanChild is unreachable: the daily age sync clears isJuvenile before the graduation check, so no child ever graduates
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A3-daycycle-residency; adversarially verified) — audit id H2
- **Area:** Truth
- **Owner module:** `src/game/dayCycle.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

`computeHumanAgeYears` returns 12 exactly when daysLived reaches juvenileSpan, and line 246 immediately sets isJuvenile=false, so on the only tick where age>=HUMAN_CHILDHOOD_DAYS the guard's `!entity.isJuvenile` clause is already true and the body never runs. No human is ever incremented out of juvenile by this function (only setHumanBirthFromAge/syncHumanAgeFromCalendar ever write isJuvenile — verified by grep; tickLayerSystems.ts:227 only handles WILDLIFE_TICK_TYPES, which excludes Human). Consequence: `applyEducationGraduation` (only other reference is its definition, education.ts:125) is never called, so `entity.educated` is never set — schoolDays accumulated as a juvenile never convert to skill/energy bonuses, no 'Graduation' notification/event ever fires, and `getEducationResearchMultiplier` (education.ts:155) can never count an educated settler. `entity.size` also stays at the juvenile 0.5x value set in entityFactory.ts:110 (today the renderer derives human scale from isJuvenile, so this is latent rather than visible).

## Expected behavior

Let the graduation transition own the flag: in `syncHumanAgeFromCalendar` (dayCycle.ts:246) stop clearing `isJuvenile` and instead pass the new age to the promotion owner — e.g. make the sync return `wasJuvenile && !isNowJuvenile`, or delete line 246 and have `tryGraduateHumanChild` (called every tick from humanTick.ts:360) clear `isJuvenile` together with size/speed and the `onGraduate` callback. Do not simply drop the `!entity.isJuvenile` clause, or every adult would re-run the callback each tick.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/dayCycle.ts` at lines 135-141, 246; src/game/humanTick.ts:300, 360-362 | 135-141 (with 246 and humanTick.ts:292-303, 360-362).
2. Note the offending code: `dayCycle.ts:135 `if (!entity.isJuvenile || entity.age < HUMAN_CHILDHOOD_DAYS) return false;` — but dayCycle.ts:246 in the sync that runs first sets `entity.isJuvenile = entity.age < HUMAN_CHILDHOOD_DAYS;`, and humanTick.ts runs the sync at line 300 (`syncHumanAgeFromCalendar(entity, state, {...})`) before the check at line 360 (`tryGraduateHumanChild(entity, config.size, config.speed, (e) => { if (isPlayerHuman(e)) applyEducationGraduation(state, e); });`).`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> Verified by running gameTick on a settler born 359.7 days earlier with schoolDays=20: at the day boundary age became 12 and isJuvenile false (syncHumanAgeFromCalendar via humanTick.ts:300 → dayCycle.ts:245-246) while `educated` stayed undefined, and a later direct tryGraduateHumanChild call returned false. The two guard clauses are mutually exclusive because entity.age only reaches HUMAN_CHILDHOOD_DAYS through that same sync (grep: isJuvenile is written only by setHumanBirthFromAge, syncHumanAgeFromCalendar, tryGraduate, finalizeSettlerAge and migrateHumanAges), so applyEducationGraduation (education.ts:125) is dead and `educated` is never set. Minimal fix: let the graduation transition own the flag — remove the isJuvenile write at dayCycle.ts:246 (have the sync report the transition) and let tryGraduateHumanChild, called every tick from humanTick.ts:360, clear isJuvenile/size/speed with the callback exactly once.

## Root cause

Verified by running gameTick on a settler born 359.7 days earlier with schoolDays=20: at the day boundary age became 12 and isJuvenile false (syncHumanAgeFromCalendar via humanTick.ts:300 → dayCycle.ts:245-246) while `educated` stayed undefined, and a later direct tryGraduateHumanChild call returned false. The two guard clauses are mutually exclusive because entity.age only reaches HUMAN_CHILDHOOD_DAYS through that same sync (grep: isJuvenile is written only by setHumanBirthFromAge, syncHumanAgeFromCalendar, tryGraduate, finalizeSettlerAge and migrateHumanAges), so applyEducationGraduation (education.ts:125) is dead and `educated` is never set. Minimal fix: let the graduation transition own the flag — remove the isJuvenile write at dayCycle.ts:246 (have the sync report the transition) and let tryGraduateHumanChild, called every tick from humanTick.ts:360, clear isJuvenile/size/speed with the callback exactly once.

## Fix

`syncHumanAgeFromCalendar` no longer writes `entity.isJuvenile`; the graduation transition owns that flag. `tryGraduateHumanChild` (called every tick from `humanTick.ts`, after the daily sync) now sees `isJuvenile && age >= HUMAN_CHILDHOOD_DAYS` on exactly the transition tick, clears the flag, sets adult `size`/`speed` and runs the `onGraduate` callback — so `applyEducationGraduation` runs and `entity.educated` (its only writer) is set for the first time.

## Regression test

`tests/humanGraduation.education.test.ts` (3) — the sync leaves the transition reachable on the age tick and graduation sets `isJuvenile=false`, adult size/speed and `educated`; a second tick is a no-op (the bonus is not re-applied); a child below the threshold is untouched.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` passes; the graduation test fails on the pre-fix code (`graduated === false`, `educated` undefined).

## Related commits or files

- `src/game/dayCycle.ts` (lines 135-141, 246; src/game/humanTick.ts:300, 360-362 | 135-141 (with 246 and humanTick.ts:292-303, 360-362))
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H2)
