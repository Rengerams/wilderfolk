# Name of file: 2026-09-30

- Bug: Village officials are never recorded as on shift, so the Town Hall reads 0.0 h worked
- Status: open
- Date discovered: 2026-09-30
- Version/build: 0.6.5.0
- Reporter: reported from play by the owner, traced by the agent
- Area: Truth
- Owner module: `src/game/humanTick.ts` — the shift-recording gate
- Cadence: realtime, every tick an Official is on duty

## Status history

- 2026-09-30 — open (found while measuring why a chronicle line claimed a settler had worked 0.7 h of a 9 h day)

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

One tick computes two different answers to "is this settler on shift", and the recording path uses the one
that omits officials.

`src/game/humanTick.ts` computes the flag:

```
666:  const onOfficialShift =
667:    entity.job === JobType.Official &&
668:    workplace?.type === BuildingType.TownHall &&
669:    workplace.completed &&
670:    goWorkTime;
```

The recording gate then leaves it out of the disjunction:

```
697:  const onJobShift = onDayJobShift || onTavernShift || onHotelShift || onMoonPriestShift;
698:  if (onJobShift && isPlayerHuman(entity)) recordScheduleWorkTick(entity);
```

while the same tick passes it downstream **as** the day-shift flag, which is why officials serve normally:

```
1291:  onDayJobShift: onDayJobShift || onOfficialShift,
```

and the civic path consumes exactly that:

```
src/game/humanVenueBehavior.ts:83
  if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Official) { ...serve... }
```

So the official is on shift for the purpose of serving and off shift for the purpose of being counted. The
same shape is what the changelog's M16 fix addressed from the other side ("an on-duty Official could never
serve because the workplace predicate excluded the Town Hall") — serving was repaired, counting was not.

**Consequence 1 — the chronicle narrates it backwards.** `dailyScheduleFatigue.resolveDailyVillageScheduleFatigue`
treats a shortfall against the target as *rest*, so an official's unrecorded day is reported as recovery. That
is the class of line quoted in Observed behavior.

**Consequence 2 — the presence multiplier may read 0 for the Town Hall.** `getWorkplacePresenceShare` is fed
by `getScheduleLastWorkedHours`, and it is applied in `dailyBuildingEconomy.tickBuildingProduction` and
`workshopEconomy.estimateWorkshopGold`. **Not yet verified** whether any Town Hall output flows through that
path; the Town Hall grants reputation on a production interval, so it may not. This needs one check before
the severity is stated.

**Related but separate — the church.** A priest matches only `onMoonPriestShift`, which is gated on
`isOnMoonHowlerNightShift`, so an ordinary day at a completed church is also unrecorded. Whether a priest's
ordinary service *should* count as a shift is a design question, not this defect; it is recorded here so the
two are not confused.

## Regression test

Not written yet. It should be red before the fix and pin the rule rather than the symptom:

- an Official on duty at a completed Town Hall during work hours must have a work tick recorded
- and the counter-case: an Official outside `goWorkTime`, or at a workplace that is not a completed Town
  Hall, must not

## Invariants checked

- The recording gate and the serving gate must be **one predicate**. A third expression of "on shift" is how
  this defect appeared, so the fix is a single predicate read by both paths, not `|| onOfficialShift` added
  to line 697.

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

To be done in a following session, deliberately not rushed. Three parts, and the second is the one that
treats the officials fairly rather than merely counting them.

**1. One predicate, so a third definition cannot appear.** Extract `isOnShift(entity, …)` — the single
answer to "is this settler working right now" — and have both the recording gate (line 698) and the serving
path (line 1291) read it. **Refuse the tempting repair** of adding `|| onOfficialShift` to line 697: that is
how the two answers diverged in the first place, and it leaves the next job type (a teacher, a soldier, a
doctor) to be forgotten in exactly the same way.

**2. Stop calling a service day "rest".** `dailyScheduleFatigue` treats a shortfall against the 9-hour
target as recovery, so an official whose hours were never counted is reported as having *rested* — which is
the class of chronicle line this report came from. Counting them fixes the number, but the model would still
score a duty that is not a production shift against a production yardstick. A workplace whose contribution
runs on an **interval** rather than on hours — Town Hall, church, school, barracks, hospital, prison — should
be **outside** the attendance and fatigue accounting rather than scored as absent from it. That is the half
that stops the game telling a working official they did nothing all day.

**3. The same decision for the priest.** A priest matches only `onMoonPriestShift`
(`isOnMoonHowlerNightShift`), so an ordinary day at a completed church is unrecorded too, and the church
measures 0.0 h in both saves for that reason. Whether ordinary service at a church is a shift is the owner's
call; it is the same question as (2) and should be answered together with it rather than patched separately.

Then the evidence the fix owes:

4. **Add the regression test** above, proven red before the change.
5. **Re-measure the two saves** and record the Town Hall's hours.
6. **Record the oracle movement** if `test:full-year` totals change.
