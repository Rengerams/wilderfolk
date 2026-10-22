# Name of file: 2026-09-30

- Bug: Village officials are never recorded as on shift, so the Town Hall reads 0.0 h worked
- Status: resolved
- Date discovered: 2026-09-30
- Version/build: 0.6.5.0
- Reporter: reported from play by the owner, traced by the agent
- Area: Truth
- Owner module: `src/game/humanTick.ts` — the shift-recording gate
- Cadence: realtime, every tick an Official is on duty

## Status history

- 2026-09-30 — open (found while measuring why a chronicle line claimed a settler had worked 0.7 h of a 9 h day)
- 2026-10-09 — resolved (both halves measured live on the owner's Year 3 save. Town Hall officials were already
  repaired when this status was written: `humanTick` credits `onJobShift || onOfficialShift`, and the census in
  `Verification result` reads 27 ticks / 9.00 h for the official on every weekday and 0 on the rest day. The
  church half is repaired in the same session by crediting an ordinary service as the colony day shift: the same
  census reads the priest at 27 ticks / 9.00 h on weekdays and 0 on the rest day, and the moon-howler night still
  records. Parts 1 and 2 of the `Fix` section below — one shared `isOnShift` predicate, and taking
  interval-driven workplaces out of the attendance/fatigue yardstick — were **not** adopted; they remain
  follow-up design work, not a defect.)

## Observed behavior

The owner read this line in their own chronicle and asked how it could be true:

```
[Y2 D58] [event] Short shifts eased fatigue for 1 settler (39% → 10% after 0.7h of work).
```

Tracing it led to the attendance snapshot `scheduleLastWorkedHours`, and measuring that across two of the
owner's saves gives a stable answer: **the Town Hall records 0.0 h, for every official, in both saves.**

| save | Town Hall workers | mean hours | under 1 h |
|---|---|---|---|
| `New Frontier` Y1 D44 | 3 | **0.0 h** | 3 (100%) |
| `New Frontier` Y2 D63 | 3 | **0.0 h** | 3 (100%) |

For contrast, from the same run: farm 7.8 h (14 % under 1 h), market 9.0 h (0 %), quarry 6.9 h (24 %).

## Expected behavior

An Official who is on duty at a completed Town Hall is working, and the systems that read "did this settler
work today" should see it. They already do for *serving* — the official carries out civic duties — so the
inconsistency is between two answers to the same question inside one tick.

## Reproduction steps

1. Build and complete a Town Hall; assign settlers whose job is `Official` to it.
2. Let a full colony day pass.
3. Read the attendance snapshot (`scheduleLastWorkedHours`) for those officials — or open the work hours
   panel and the chronicle, which both derive from it.
4. The officials read as never having worked a single hour, while they visibly serve.

Also reproducible straight from a save: load either save attached to this report and sum
`scheduleLastWorkedHours` over the Town Hall's occupants.

## Evidence

Two of the owner's saves, measured directly:

- `wilderfolk-New-Frontier-Y1-D44.json` — 2542 KB, `_version` 0.6.5.0, `year 1 / dayInYear 44`, saved 2026-09-30T21:45Z
- `wilderfolk-New-Frontier-Y2-D63.json` — 2524 KB, `_version` 0.6.5.0, `year 1 / dayInYear 63`, saved 2026-09-30T22:25Z

The measured day for the second save (Y2 D43) is an ordinary day — 9 log events against 5-26 on the days
around it, with no election, festival or disaster — so the reading is not a special-day artefact.

Per-workplace-type attendance, second save:

```
church      4 workers   0.0 h   <1h  4 (100%)   <- related, different cause: see below
townHall    3 workers   0.0 h   <1h  3 (100%)   <- THIS REPORT
tavern     14 workers   3.1 h   <1h  7 ( 50%)
school     41 workers   5.3 h   <1h 17 ( 41%)
hospital   15 workers   5.5 h   <1h  6 ( 40%)
farm       42 workers   7.8 h   <1h  6 ( 14%)
market      8 workers   9.0 h   <1h  0 (  0%)
```

Energy is **not** the explanation: every adult sits at 93 % of maximum and **none** is below the hospital
threshold (42 %), in either save. Distance is not the explanation either: the under-workers live *closer* to
their workplace (median 475 px) than the full-day workers (median 710 px).

## Root cause

One tick computed two different answers to "is this settler on shift", and the recording path used the one
that omits officials. As found on 2026-09-30, when `humanTick` was at lines 666, 697 and 1291:

```
666:  const onOfficialShift =
667:    entity.job === JobType.Official &&
668:    workplace?.type === BuildingType.TownHall &&
669:    workplace.completed &&
670:    goWorkTime;
697:  const onJobShift = onDayJobShift || onTavernShift || onHotelShift || onMoonPriestShift;
698:  if (onJobShift && isPlayerHuman(entity)) recordScheduleWorkTick(entity);
1291:  onDayJobShift: onDayJobShift || onOfficialShift,
```

The recording gate left the flag out of the disjunction, while the same tick passed it downstream **as** the
day-shift flag — which is why officials served normally, and the civic path consumes exactly that:

```
src/game/humanVenueBehavior.ts:83
  if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Official) { ...serve... }
```

So the official was on shift for the purpose of serving and off shift for the purpose of being counted. The
same shape is what the changelog's M16 fix addressed from the other side ("an on-duty Official could never
serve because the workplace predicate excluded the Town Hall") — serving was repaired, counting was not.

**Repaired state (2026-10-09).** `humanTick.ts` now computes `onOfficialShift` at line 528, `onPriestShift` at
line 553 (the church half, added in this session), `onJobShift` at line 568, and the recording gate at line 570
reads `if (isPlayerHuman(entity) && (onJobShift || onOfficialShift || onPriestShift))
recordScheduleWorkTick(entity);`. The serving path still receives `onDayJobShift || onOfficialShift` (line
1355), so serving is untouched.

**Consequence 1 — the chronicle narrates it backwards.** `dailyScheduleFatigue.resolveDailyVillageScheduleFatigue`
treats a shortfall against the target as *rest*, so an official's unrecorded day is reported as recovery. That
is the class of line quoted in Observed behavior.

**Consequence 2 — the presence multiplier may read 0 for the Town Hall.** `getWorkplacePresenceShare` is fed
by `getScheduleLastWorkedHours`, and it is applied in `dailyBuildingEconomy.tickBuildingProduction` and
`workshopEconomy.estimateWorkshopGold`. **Not yet verified** whether any Town Hall output flows through that
path; the Town Hall grants reputation on a production interval, so it may not. This needs one check before
the severity is stated.

**Related but separate — the church (repaired in this session).** A priest matched only `onMoonPriestShift`,
which is gated on `isOnMoonHowlerNightShift`, so an ordinary day at a completed church was unrecorded too.
The church's own rules answer the design question the earlier version of this report left open: the building
names no service window of its own (the only church-specific window in `humanSchedule` is the moon-howler
night), `humanStatus.getHumanActivityStatus` already labels a priest at a completed church during the colony
workday as *Working at Church*, and `skills.WORK_SKILL_BUILDING_TYPES` — derived from `BUILDING_JOB_TYPES`, so
the church is in it by construction — already pays the priest trade skill for the shift. Attendance was the
only field left at zero, so an ordinary service is now credited as the colony day shift: `onPriestShift`
(`humanTick.ts:553`), read by the gate at line 570. The moon-howler night duty is unchanged and still records.

## Regression test

Landed 2026-10-09 in `tests/prisonFestivalWorkContinuity.test.ts`, under *a priest serving at a completed
church* (the suite that already pins the prison and tavern duty windows by ticking the real `gameTick`):

- `records attendance across the colony workday, and none on a rest day` — a priest at a completed church at
  10:00 on a weekday (day 2, Wednesday) must credit work ticks, and the same hour on a rest day (day 5,
  Saturday) must credit none.
- `still records the moon-howler night duty, which is the church's other shift` — 21:00 on a full-moon day
  (day 14) is outside the work window, so any credit there can only come from `onMoonPriestShift`.
- **Fail-before proof:** with `onPriestShift` and its disjunct reverted, the weekday case fails with
  `a priest on ordinary service recorded no attendance: expected 0 to be greater than 0` while all seven other
  tests in the suite pass; restored, the suite is 8/8 green.

The Town Hall's own case is still not written as a unit test; it is verified live instead (see below).

## Invariants checked

- The recording gate and the serving gate must be **one predicate**. A third expression of "on shift" is how
  this defect appeared, so the fix is a single predicate read by both paths, not `|| onOfficialShift` added
  to line 697.
- **This invariant was not honoured.** Both measured repairs took the tempting route: officials by adding
  `|| onOfficialShift` to the recording gate, and the church half by adding `|| onPriestShift`. The extract of
  a single `isOnShift` remains undone, and a fourth post with its own window would have to be remembered the
  same way. Recorded here rather than quietly dropped.

## Save/migration impact

None. `scheduleWorkedTicksToday` and `scheduleLastWorkedHours` are already persisted, derived daily, and need
no migration. The fix changes which settlers accrue ticks; it writes no new field.

## Verification result

Not yet. When the fix lands, the expected evidence is: the new test red before and green after, `npm test -- all`,
and the two saves re-measured to show the Town Hall's officials recording real hours. If officials start
accruing hours, their fatigue and the Town Hall's presence share change, so **the 360-day `test:full-year`
oracle may move and must be recorded, not hidden** — the rule the 2026-09-25 design council set for any change
that moves it.

## Related commits or files

- `src/game/humanTick.ts:666`, `:697`, `:1291` — the two predicates
- `src/game/humanVenueBehavior.ts:83` — the serving path that already includes the official
- `src/game/scheduleFatigue.ts:28` (`recordScheduleWorkTick`), `:86` (`getScheduleLastWorkedHours`), `:106` (`getWorkplacePresenceShare`)
- `src/game/dailyScheduleFatigue.ts` — the chronicle lines that report the shortfall as recovery
- `CHANGELOG.md` — the M16 entry that repaired official *serving*

## Fix

Landed 2026-10-09, as the smallest change in the existing shape rather than the extraction this section
originally proposed. `humanTick` now computes `onPriestShift` at line 553 —

```
entity.job === JobType.Priest && workplace?.type === BuildingType.Church && workplace.completed && goWorkTime
```

— and the recording gate at line 570 reads `onJobShift || onOfficialShift || onPriestShift`. Attendance only:
the priest's movement, the moon-howler night branch and every other `onJobShift` consumer are untouched, so the
change decides whether an ordinary service is *counted*, never how a priest behaves.

**1. One predicate, so a fourth definition cannot appear — NOT DONE.** Extract `isOnShift(entity, …)` — the
single answer to "is this settler working right now" — and have both the recording gate (line 570) and the
serving path (line 1355) read it. **This is the repair that was refused**: both halves extended the
disjunction instead (`|| onOfficialShift`, then `|| onPriestShift`), which is exactly how the two answers
diverged, and it leaves the next post with its own window to be remembered the same way. Kept here as open
work, not as a claim.

**2. Stop calling a service day "rest" — NOT DONE, and superseded for these posts.** `dailyScheduleFatigue`
treats a shortfall against the 9-hour target as recovery, so an unrecorded day is reported as having *rested* —
the class of chronicle line this report came from. Counting the hours fixes the number. The stronger proposal
here was to move interval-driven workplaces (Town Hall, church, school, barracks, hospital, prison) **outside**
attendance and fatigue accounting altogether; the owner's direction on 2026-10-09 is the opposite for the
church — an ordinary service is a day shift and must be counted — so that proposal no longer applies to the
church, and if it were applied as written it would undo this fix. The fatigue *yardstick* question for a duty
whose output is not hourly is still open on its own.

**3. The same decision for the priest — ANSWERED AND DONE.** The church's own rules settled it rather than a
preference: the building names no service window of its own beyond the full-moon night, the inspector already
labels a priest at a completed church during the colony workday as *Working at Church*, and
`skills.WORK_SKILL_BUILDING_TYPES` (derived from `BUILDING_JOB_TYPES`) already paid the priest trade skill for
the shift while attendance stayed at zero. An ordinary service is therefore credited as the colony day shift,
and the moon-howler night is unchanged.

Then the evidence the fix owes:

4. **Add the regression test** above, proven red before the change. **Done** — see `Regression test`.
5. **Re-measure the saves** and record the hours. **Done** — see `Verification result`.
6. **Record the oracle movement** if `test:full-year` totals change. **Nothing can move from either half:**
   `scripts/colonyHealth.ts`'s `prepareColonyWorld` places Houses, Barns, Silos, a Lumber Mill, Farms, a Tavern
   and a Prison — **no Church and no Town Hall** — so the long automated run has no such post to credit.
