# Vacancy-election due check runs only at the New Year, so the declared 3-month campaign stretches to ~1.4 years and can swallow a scheduled term election

- **Bug:** Vacancy-election due check runs only at the New Year, so the declared 3-month campaign stretches to ~1.4 years and can swallow a scheduled term election
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A19-leadership; adversarially verified) — audit id H14
- **Area:** Truth (cadence)
- **Owner module:** `src/game/villageLeadership.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

tryStartVacancyElectionCeremony takes dayInYear and compares the full fractional date (`if (currentFraction < state.pendingElectionYear) return false;`), but its only caller sits inside `if (yearRollover)` in dailyWorldEvents.ts, so it is invoked with dayInYear === 0 once per year. A leader who dies on, say, day 20 of year 3 gets pendingElectionYear = 3.06, but the ceremony cannot start until tick 0 of year 4 (about a 0.95-year wait instead of the declared 3 months); the ceremony then never happens mid-year, so the effective delay is uniformly 0.25-1.25 years. getVillageCeremonyStatus/formatElectionDelay keep telling the player 'No village head - merit election in 3 months (Year 4)' and then 'Leadership election imminent - settlers will gather soon.' for up to nine more months, and focusHints reports '0.25 years'.

## Expected behavior

Call `tryStartVacancyElectionCeremony(state, state.year, state.dayInYear)` from the daily path unconditionally (next to `tickLeaderVacancy`, outside the yearRollover block) - the function is already idempotent (it bails on a null pendingElectionYear, an active ceremony, or a future date) - or change the schedule to a whole year boundary so the displayed delay matches the actual one.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/villageLeadership.ts` at lines 922-934 (only call site dailyWorldEvents.ts:223-230) | 903-904, 922-943 (call site src/game/dailyWorldEvents.ts:223-232).
2. Note the offending code: `const electionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;
  state.pendingElectionYear = electionYear;   // ... while the only caller is: if (yearRollover) { const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear); }`.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> `tryStartVacancyElectionCeremony` compares `year + dayInYear/DAYS_PER_YEAR` against `pendingElectionYear` (931-934) but its only caller (dailyWorldEvents.ts:230) sits inside `if (yearRollover)` (222-223), and `tickLeaderVacancy` refuses to re-enter once a pending year exists (villageLeadership.ts:889, 902-904), so the due date is only evaluated at integer year boundaries; with `VACANCY_ELECTION_DELAY_YEARS = 0.25` (line 30) a vacancy on day 300 of year 3 (pending 4.083) misses the year-4 rollover and only fires at year 5 — about 14 months, not the 3 months the UI promises (getElectionCeremonyStatus 480-486, getYearsUntilElection 383-387) — and `tryStartTermElectionCeremony` is refused because `pendingElectionYear != null` (958), silently skipping year 4's scheduled term election; the auditor's "~1.4 years" figure is slightly overstated (the range is ~1.0-1.25 years for last-quarter vacancies, and anything in days 0-270 slips to the next New Year). Fix: evaluate the due date at the daily cadence (call `tryStartVacancyElectionCeremony` from `tickLeaderVacancy` or the daily layer whenever `pendingElectionYear != null`) and keep the term-election suppression only while the vacancy is genuinely imminent.

## Root cause

`tryStartVacancyElectionCeremony` compares `year + dayInYear/DAYS_PER_YEAR` against `pendingElectionYear` (931-934) but its only caller (dailyWorldEvents.ts:230) sits inside `if (yearRollover)` (222-223), and `tickLeaderVacancy` refuses to re-enter once a pending year exists (villageLeadership.ts:889, 902-904), so the due date is only evaluated at integer year boundaries; with `VACANCY_ELECTION_DELAY_YEARS = 0.25` (line 30) a vacancy on day 300 of year 3 (pending 4.083) misses the year-4 rollover and only fires at year 5 — about 14 months, not the 3 months the UI promises (getElectionCeremonyStatus 480-486, getYearsUntilElection 383-387) — and `tryStartTermElectionCeremony` is refused because `pendingElectionYear != null` (958), silently skipping year 4's scheduled term election; the auditor's "~1.4 years" figure is slightly overstated (the range is ~1.0-1.25 years for last-quarter vacancies, and anything in days 0-270 slips to the next New Year). Fix: evaluate the due date at the daily cadence (call `tryStartVacancyElectionCeremony` from `tickLeaderVacancy` or the daily layer whenever `pendingElectionYear != null`) and keep the term-election suppression only while the vacancy is genuinely imminent.

## Fix

The daily layer evaluates `tryStartVacancyElectionCeremony` every day instead of only inside the year-rollover branch, so a campaign falls due on its date (the declared 0.25-year delay is now real and can no longer swallow that year's scheduled term election); the term election itself remains a year-rollover decision, and the ceremony news/notification now fires for a mid-year vacancy too.

## Regression test

`tests/vacancyElection.dueDate.test.ts` (2) — a real `gameTick` day boundary (not a rollover) starts the ceremony when day 40 of year 4 passes the due date 4.083 and clears `pendingElectionYear`, while an earlier day before the due date starts nothing.

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` and `npm run test:full-year` pass; `tests/villageLeadership.*.test.ts` and `tests/electionVotes.test.ts` still pass.

## Related commits or files

- `src/game/villageLeadership.ts` (lines 922-934 (only call site dailyWorldEvents.ts:223-230) | 903-904, 922-943 (call site src/game/dailyWorldEvents.ts:223-232))
- Same root cause also reported as: The 0.25-year vacancy campaign is only evaluated on a year rollover, so the real delay is 0.25-1.25 years while the UI reports 3 months (A19-leadership)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H14)
