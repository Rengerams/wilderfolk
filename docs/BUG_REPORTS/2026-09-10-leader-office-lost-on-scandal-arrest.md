# Bug: A scandal-imprisoned leader is released without the `leader` occupation

- Status: resolved
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Coding assistant, via the deterministic full-year invariant gate
- Area: Truth | simulation | leadership | workforce
- Owner module: `src/game/simulation/humanRelationships.ts` (arrest), `src/game/workforce.ts` (release)
- Cadence: Attendance of a scandal sentence (arrest transition + daily release pass)

## Status history

- 2026-09-10 — open: the full-year gate failed at the day-60 checkpoint with
  `leader 657 does not hold the "leader" occupation`. This is a **regression of the
  resolved report `2026-08-28-leader-occupation-invariant.md`**: the earlier fix
  stamped the office only at handover and load, so a leader who lost it *between*
  those events stayed broken.
- 2026-09-10 — resolved: the office now survives arrest and release; the same
  seeded year completes 360 days with the invariant satisfied.

## Observed behavior

```text
Simulation invariants failed at day 60: leader 657 does not hold the "leader" occupation
```

Instrumenting the run with a temporary per-tick probe (since removed) pinpointed the
transition:

```text
kind: leader-without-office, tick 3432, day 47.67, leaderId 657, type human,
job settler, occupation settler, homeBuildingId null, residenceBuildingId 6,
hasSavedSnapshot false
```

Entity 657 was the **founding leader** — `leader-changed` never fired across the whole
year, the entity was never transformed (no Moon Howler snapshot), was alive, and had
no workplace. So the office was dropped while they held `villageLeaderId` throughout,
and the next 30-day checkpoint (day 60) reported it.

## Expected behavior

A living leader keeps the `leader` occupation for their whole term. Per the project
authority a leader may hold a normal workplace and manor residency, and *valid work
must survive office-taking and save/load* — so clearing the workplace during a prison
sentence is correct, but it must not clear the office.

## Reproduction steps

1. `npm run test:full-year` (seed 12345, 1 year) — fails at day 60 on the invariant.
2. Or: appoint a leader, have them commit a scandal that imprisons them, wait for
   release, then observe `occupation === 'settler'` while `villageLeaderId` still
   points at them.

## Evidence

`docs/log/full-year-*.jsonl`: the `full-year-failed` line at day 60, plus the
`leader-without-office` probe record quoted above giving the exact tick, the entity
state, and the fact that the leader id never changed. Before the fix the run exits 1;
after the fix it reaches `full-year-complete` with exit 0.

## Root cause

Two halves, both in the scandal-sentence path:

1. **Arrest** — `humanRelationships.ts` cleared the workplace and stamped
   `offender.occupation = 'settler'` unconditionally. Every other occupation-writing
   transition guards the office (`workforce.ts` uses a `keepOffice` check in both
   assignment paths), so this site was the odd one out.
2. **Release** — `workforce.ts:releasePrisoners` cleared `prisonBuildingId`,
   `prisonerUntilTick`, and `prisonSentenceCrime` and restored nothing else, so even a
   leader who had entered prison correctly would leave as a plain settler.

Because `applyLeaderOccupation` only runs at handover and on load, nothing re-stamped
the office in between — which is why the earlier "stamp at handover and load" fix
merely moved the failure to a trajectory where the leader was imprisoned.

## Fix

- Arrest (`humanRelationships.ts`): the office survives the sentence —
  `offender.occupation = offender.occupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler'`,
  matching the `keepOffice` rule used by workforce assignment transitions. The
  workplace and job are still cleared, because a prisoner has no job slot.
- Release (`workforce.ts`): a released settlement leader is re-stamped to
  `LEADER_OCCUPATION`. Ordinary work is deliberately **not** restored here — the daily
  assignment layer re-assigns it, and its `keepOffice` guard preserves the office.
- Related hardening in the same class: `moonHowler.ts:revertToHumanForm` had the same
  shape (it defaulted `occupation` to `'settler'` and only restored the saved value
  inside the "job slot is free" branch, so a leader with no workplace, a full
  workplace, or an active sentence came back from a Moon Howler night as a settler).
  It now preserves `LEADER_OCCUPATION` unconditionally while leaving the
  "missing slot → settler" rule intact for ordinary workers.

## Regression test

The invariant gate is the test: `npm run test:full-year` must complete 360 days, and it
now does. Focused unit coverage for the two transitions (arrest keeps the office,
release restores it) is still worth adding and is not yet written — recorded here so
it is not forgotten.

## Invariants checked

- A living leader retains `leader` status and the `leader` occupation (the violated
  invariant, now satisfied through the year).
- The leader may still hold a normal workplace; nothing in this fix blocks or removes
  leader employment — the assignment layer restores work after release.
- Residence behaviour is untouched (the developer explicitly accepted that a released
  leader may not move into the Leader's House: "its no problem that just the fun of the
  game").
- No new owner: arrest stays in the relationship/scandal owner, release in workforce,
  the office itself still owned by `leaderHouse.ts`.
- No cadence, layer, save-schema, or `SimTickDelta` change.

## Save/migration impact

None. No field was added or reinterpreted; the fix only narrows what an existing
transition clears. Saves taken while a leader was imprisoned without the office will
self-correct on the next arrest/release cycle, and the invariant gate reports them
rather than silently repairing them.

## Verification result

- `npx tsx scripts/run-full-year.mts`: exit 0, `full-year-complete`, 25,920 ticks,
  360 days, no `leader-without-office` record.
- `tsc -b` clean; `npm run lint` 0 warnings / 0 errors; `npx vitest run`
  95 files / 502 tests passing (includes the virtual-player suite landing in parallel).

## Related files

- `src/game/simulation/humanRelationships.ts`
- `src/game/workforce.ts`
- `src/game/moonHowler.ts`
- `src/game/leaderHouse.ts` (`applyLeaderOccupation`)
- `BUG_REPORTS/2026-08-28-leader-occupation-invariant.md` (superseded root cause)
- `scripts/run-full-year.mts`
