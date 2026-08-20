# Bug: Affair establishment runs on two cadences (realtime + daily)

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 2 full-code ownership audit)
- Area: Truth
- Owner module: humanRelationships.ts (decision owner) + humanTick.ts (call sites)
- Cadence: new-calendar-day (declared) vs staggered-social (actual realtime path)

## Status history
- 2026-08-20 — open (discovered in the Objective 2 full-code ownership audit)
- 2026-08-20 — investigating (root cause: §3 vs §4 doc inconsistency; assigned to Objective 9)
- 2026-08-20 — verified (Objective 9 fix: realtime path advances progress only; daily owner establishes; authority doc §3/§4 resolved first)

## Observed behavior

Affair establishment — writing `affairPartnerId = <id>` on both partners and
completing `affairProgress = 100` — can fire from two different cadences:

1. `humanTick.tryDailyAffairEncounter`, called inside the `isNewCalendarDay`
   gate (humanTick.ts:385–399), establishes the affair daily-conformant.
2. The realtime flirt path inside `tickHumans` (humanTick.ts:1197–1218) also
   writes `affairPartnerId` + `affairProgress = 100` when two settlers with
   existing progress interact during normal social time — no daily gate.

## Expected behavior

SIMULATION_AUTHORITY.md §4 assigns "affair establishment" to the
`new-calendar-day` cadence ("Conception, affair establishment, gossip, daily
economy"). A decision must have exactly one declared cadence; the realtime
path must only advance small progress, not establish the affair.

## Reproduction steps

1. Run a seeded sim with a married settler pair accumulating affair progress
   (humanTick realtime flirt path).
2. Let them interact during a social window on a non-day-boundary tick.
3. Observe `affairPartnerId`/`affairProgress = 100` written in the realtime
   path (no `isNewCalendarDay` gate).

## Evidence

- `src/game/humanTick.ts:1197–1218` (realtime establishment)
- `src/game/humanTick.ts:385–399` (daily-gated establishment)
- Full-code write audit: `affairPartnerId`/`affairProgress` written from
  humanTick.ts (7 + 10 sites), humanRelationships.ts (9 + 4), dayCycle.ts (death
  cleanup), moonHowler.ts (snapshot/restore), nameLoader.ts (load migration)

## Root cause

The authority document is internally inconsistent: §3 ownership row says
"Affairs and scandals | Staggered/daily | Affair progress, affair partners,
scandal outcomes" (which permits affair partners on a staggered cadence),
while §4's cadence table assigns "affair establishment" to
`new-calendar-day`. The realtime path in `tickHumans` implements the §3
reading; the daily path implements the §4 reading. Two implementations of one
decision exist.

## Fix

Resolved under Objective 9 (authority-doc-first, per §13):

1. `SIMULATION_AUTHORITY.md` §3 affairs row now declares: "Staggered (tryst
   progress/feedback only) + new-calendar-day (establishment, gossip, scandal
   decisions)", and the §4 note forbids realtime scandal rolls for
   unestablished pairs (established-pair caught-in-the-act exposure remains a
   spatial realtime event).
2. `humanTick.ts` realtime flirt path no longer writes `affairPartnerId` /
   `affairProgress = 100` — it advances small progress only (and may begin
   before establishment). Establishment happens solely in
   `tryDailyAffairEncounter` (daily gate) when both sides reach 100.
3. Realtime scandal exposure in the flirt path now requires an established
   affair (`hasAffairPartner` + partner match) and passes the established
   chance — unestablished flirtation never rolls a scandal.

## Regression test

`tests/affair.cadence.test.ts` (2 tests): a golden run of 71 real sim ticks
(no day boundary) completes tryst progress on both sides to 100 without ever
writing `affairPartnerId` and produces no scandal artifacts; a deterministic
unit on `tryDailyAffairEncounter` establishes the pair on its own roll and
records `affairsEstablished`.

## Invariants checked

- One declared cadence per decision (violated: affair establishment has two).
- Decision registry row `affairs` (cadence: new-calendar-day, note about
  staggered tryst progress).

## Save/migration impact

None expected (no state field changes; cadence routing only).

## Verification result

Focused tests pass; full suite green. Seeded 60-day measurement: 27 affairs
established via the daily gate, 8 scandals (all established-affair exposures),
tick p50 0.4ms / p95 1.8ms at ~26 colonists.

## Related commits or files

- `src/game/humanTick.ts` (call sites — realtime establishment removed, daily owner exported)
- `src/game/simulation/humanRelationships.ts` (decision owner)
- `src/game/simulation/decisionRegistry.ts` (affairs row)
- `SIMULATION_AUTHORITY.md` (§3 affairs row + §4 affair-cadence note)
- `tests/affair.cadence.test.ts`
- `scripts/measure-relationship-feel.ts`
