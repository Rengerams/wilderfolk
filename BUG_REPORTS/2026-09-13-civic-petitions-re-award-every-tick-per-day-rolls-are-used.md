# Civic petitions re-award every tick: per-day rolls are used as per-tick gates, so reputation/gold/food move at tick rate

- **Bug:** Civic petitions re-award every tick: per-day rolls are used as per-tick gates, so reputation/gold/food move at tick rate
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A19-leadership, A11-human-behaviors-schedule; adversarially verified) — audit id H12
- **Area:** Truth
- **Owner module:** `src/game/townHall.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

personDayRoll hashes entityId + getAbsoluteCalendarDay(tick) (dayCycleClock.ts:28, humanSchedule.ts:98-107), so it returns the SAME value for all 72 ticks of a colony day: the guard is a per-day pass/fail, not a rate limit. resolveCivicPetition is called every tick for an official on duty near the hall (humanVenueBehavior.ts:88 -> officialHandlePetitioners, whose petitioner pick at townHall.ts:329 is also day-stable) and every tick for a free-roaming settler near a hall (humanVenueBehavior.ts:121-122); `active` is true every tick for in-focus humans and for ALL humans whenever there is no camera focus (humanTick.ts:378-384, 429-442). So a scandalized/grieving settler near a staffed hall takes the 'heard' branch (line 251-259) and gets +1 village reputation EVERY TICK (up to 72/day, pinning the 0-100 clamp within a day or two), a forced chat line via sayHumanChatPhrase (which ignores chatTicks and clears the dialogue session key, humanChat.ts:332-341), and a floating text every tick; the food-aid branch debits up to 4 food/tick and the stipend branch 1 gold/tick until the settler's energy passes the branch threshold. The declared intent ('at most one meaningful petition per person per few days', and +1 reputation per petition) is defeated.

## Expected behavior

Enforce a real per-person cadence: add an explicit day stamp (e.g. `lastCivicPetitionDay?: number` on Entity, checked/set here as `if (petitioner.lastCivicPetitionDay === day) return { kind: 'none' }; petitioner.lastCivicPetitionDay = day;`) and carry it through saveSchema/simPrep/simDelta; if no new field is wanted, gate the decision to the day-boundary tick (`if (state.tick % TICKS_PER_DAY !== 0) return { kind: 'none' };`) so the day-stable rolls can only be evaluated once per day.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/townHall.ts` at lines 207-209, 242, 259, 277, 288 | 207-209 (callers: src/game/humanVenueBehavior.ts:88 and :122, both reached per tick from src/game/humanTick.ts:1086-1107) | 115-123.
2. Note the offending code: `// At most one meaningful petition per person per few days
  const day = Math.floor(state.tick / TICKS_PER_DAY);
  if (personDayRoll(petitioner.id, state.tick, 821 + day) > 0.4) return { kind: 'none' };`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> resolveCivicPetition's only per-person gate is personDayRoll(petitioner.id, state.tick, 821 + day) > 0.4 (line 209), and personDayRoll is documented and implemented as constant for a whole colony day (humanSchedule.ts:97-107), while both realtime callers invoke the resolver every tick: officialHandlePetitioners (humanVenueBehavior.ts:88) and the free-time path (humanVenueBehavior.ts:121-122), even though the intended cadence already exists as the daily tickTownHallAudiences (townHall.ts:345-362, at most two petitions per day). On a qualifying day the same branch re-applies per tick: the grief/scandal 'heard' branch grants addReputation(1) and +6 energy with no other condition (lines 247-261), the leader-audience branch likewise (264-278), and the aid branches restore energy to a level that keeps them eligible for several more ticks; grief lasts 5-7 days (humanLifecycleCleanup.ts:72-73), so a grieving settler parked at the hall drives reputation to the 100 cap in roughly 100 ticks and spends food/gold at tick rate. Minimal fix: latch one resolved petition per petitioner per colony day (a stamped field or a per-day marker), or move the effects into the daily owner so the per-day roll only selects the day.

## Root cause

resolveCivicPetition's only per-person gate is personDayRoll(petitioner.id, state.tick, 821 + day) > 0.4 (line 209), and personDayRoll is documented and implemented as constant for a whole colony day (humanSchedule.ts:97-107), while both realtime callers invoke the resolver every tick: officialHandlePetitioners (humanVenueBehavior.ts:88) and the free-time path (humanVenueBehavior.ts:121-122), even though the intended cadence already exists as the daily tickTownHallAudiences (townHall.ts:345-362, at most two petitions per day). On a qualifying day the same branch re-applies per tick: the grief/scandal 'heard' branch grants addReputation(1) and +6 energy with no other condition (lines 247-261), the leader-audience branch likewise (264-278), and the aid branches restore energy to a level that keeps them eligible for several more ticks; grief lasts 5-7 days (humanLifecycleCleanup.ts:72-73), so a grieving settler parked at the hall drives reputation to the 100 cap in roughly 100 ticks and spends food/gold at tick rate. Minimal fix: latch one resolved petition per petitioner per colony day (a stamped field or a per-day marker), or move the effects into the daily owner so the per-day roll only selects the day.

## Fix

The petition *resolution* now happens only in the daily owner `tickTownHallAudiences`. Both realtime callers were removed: `tickHumanFreeTimeCivicPetition` (and its `humanTick` call site) is deleted, and `officialHandlePetitioners` no longer calls `resolveCivicPetition` — it keeps only its greeting chat. The free-time walking motive that sends settlers to the hall is untouched, so the daily pulse still finds petitioners there.

## Regression test

`tests/civicPetition.cadence.test.ts` (2) — calling the on-duty official path twelve times at a hall leaves energy, reputation, food and gold unchanged, while one `tickTownHallAudiences` pulse still grants the petition effect (+6 energy, +1 reputation on the "heard" branch).

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` passes; the first case fails on the pre-fix code (the per-tick resolution moved energy and reputation).

## Related commits or files

- `src/game/townHall.ts` (lines 207-209, 242, 259, 277, 288 | 207-209 (callers: src/game/humanVenueBehavior.ts:88 and :122, both reached per tick from src/game/humanTick.ts:1086-1107) | 115-123)
- Same root cause also reported as: Free-time civic petition is a per-day decision re-evaluated every tick while the settler stands near the hall (A11-human-behaviors-schedule)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H12)
