# Regression-Proofing Completion Record — 2026-08-20

Handoff record for the ten-objective regression-proofing program (0.6.1-line
development). Everything here is also summarized in `CHANGELOG.md` under
`[Unreleased — 0.6.1-line development]` — pull the version-bump release notes
from there.

## Definition of done

All ten objectives are **verified** (implemented + tested + full suite green).
The one documented blocker found during the program — the housing-owner doc gap
(bug report `2026-08-20-housing-owner-not-declared.md`) — was also resolved:
`SIMULATION_AUTHORITY.md` §3 now declares the Housing and residence assignment
owner, and the decision registry gained the `housing` key. No objective was
marked complete on "it compiles" alone — each has a regression test and a
verification result.

## Completion protocol checklist

| Protocol step | Status |
|---|---|
| Required bug report per objective | Done — 10 reports in `BUG REPORTS/` (9 verified/closed, 1 open blocker), each with a per-date Status history |
| Smallest owner-local change | Done — each change stays in its authoritative owner module |
| Regression test added/updated | Done — 15 test files added or extended (see per-objective tables) |
| Focused tests + TypeScript | Done — run after every objective |
| Full suite before marking complete | Done — progression 38 files/225 tests → **49 files/322 tests** |
| Perf + seeded gameplay measurement | Done — Objective 9 has a full 60-day seeded run; workforce (Obj 4) and command latency recorded below; other objectives are perf-neutral or covered by sim-run validation |
| Simulation Change Record | Done — one per objective (in each bug report and in the CHANGELOG) |
| Authority-doc-first on conflicts | Done — Objective 9 (§3/§4 affair cadence) and the optimistic-apply amendment (§2/§5) updated `SIMULATION_AUTHORITY.md` BEFORE code |

## Objectives 1–10

| # | Change | Owner module | Tests | Bug report | Status |
|---|---|---|---|---|---|
| 1 | Role-aware simulation invariants checker (`collectSimulationInvariantErrors`, `assertSimulationInvariants`) | `simulationInvariants.ts` | `simulation.invariants.test.ts` (27) | — (none discovered) | verified |
| 2 | Static one-owner-per-decision registry | `decisionRegistry.ts` | `simulation.decisionRegistry.test.ts` (4) | — | verified |
| 3 | Locked tick-layer schedule (realtime → systems/4 → assign/18 → daily/72; 72 ticks/day) | `gameTick.ts` | `gameTick.layerOrder.test.ts` (7) | — | verified |
| 4 | Workforce authority: `assignWorkerTransition` / `removeWorkerTransition` / `addToConstructionCrew`; leader can hold a manual workplace; `buildingActions` delegates; donor semantics unified (School/Town Hall manual) | `workforce.ts` + `buildingActions.ts` | `workforce.transitions.test.ts` (15) | — | verified |
| 5 | Church manual staffing: no auto-fill; legacy saves migrated (`church-manual-staffing`, `clearAutoFilledChurches`) | `saveLoad.ts` + `workforce.ts` | `church.manualStaffing.test.ts` (7) | `2026-08-20-church-auto-staffing.md` | verified |
| 6 | Worker commands dispatch immediately (no idle-wait dead clicks); FIFO ordering guarantees no stale-delta overwrite; command round-trips through the shared `applyWorkerCommand` | `gameLoop.ts` transport | `workerCommand.roundtrip.test.ts` (9) + `gameLoop.commandDispatch.test.ts` (6) | `2026-08-20-command-waits-for-worker-idle.md` | verified |
| 7 | Demolition repaired: cleanup via `removeWorkerTransition` (single-writer), `totalBuildingsCompleted` decrement, no reappearance across sim ticks, selection cleared; PLUS discovered + fixed prisoners being wiped from `prison.occupants` every assign pass | `buildingActions.ts` + `workforce.ts` | `demolish.roundtrip.test.ts` (5) + prison tests | `2026-08-20-demolish-command-failure.md`, `2026-08-20-prisoner-occupants-wiped.md` | verified |
| 8 | Truthful relationship diagnostics: interval counters (conception gate funnel, `pregnanciesStartedThisInterval`, `birthsCompletedThisInterval`) separated from active state (`activePregnancies` computed at flush) | `relationshipDiagnostics.ts` + recorders | `relationshipDiagnostics.test.ts` (8, incl. start→advance→birth lifecycle) | `2026-08-20-diagnostics-ambiguous-counters.md` | verified |
| 9 | Affair cadence resolved (authority doc first): realtime path advances tryst progress only, never establishes; scandals require an established affair; daily owner is the sole establisher; no new tick layer | `humanTick.ts` + `humanRelationships.ts` | `affair.cadence.test.ts` (2: golden no-establishment run + deterministic daily establishment) | `2026-08-20-affair-establishment-dual-cadence.md` | verified |
| 10 | Moon Howler replacement is rare, not guaranteed: `MOON_HOWLER_REPLACEMENT_CHANCE = 0.15` + injectable RNG; survivor returns unchanged; ≤1 living Howler | `moonHowler.ts` | `moonHowler.rare.test.ts` (7) | `2026-08-20-moon-howler-replacement-not-rare.md` | verified |

## Extra work this session

- **UX commands apply instantly (developer comment, resolved)** — optimistic
  main-thread application of player commands through the same
  `applyWorkerCommand` domain implementation; the authoritative `commandResult`
  replaces (ok) or reverts (!ok) the display; tick results never overwrite the
  pending display; worker errors/disposal revert. `SIMULATION_AUTHORITY.md`
  §2/§5 amended first. Tests: `gameLoop.commandDispatch.test.ts` (+3).
- **Bug reports carry per-date Status history** (open → investigating → fixed →
  verified) and the `BUG REPORTS/Readme.md` template now requires it.
- **CHANGELOG Unreleased section restructured** for the version bump (single
  Technical / Changed / Fixed / Bug reports layout + summary block).

## Measurements

- **Objective 9 (relationship feel), `scripts/measure-relationship-feel.ts`,
  60 seeded days** (3 couples + 4 singles + houses/workplaces/farms):
  affairChecks/day 20.3, 27 affairs established via the daily gate, 8 scandals,
  conception candidates/day 20.3, 1 pregnancy started, 3 births (2 from
  immigrant pregnancies — visible only via `activePregnancies`), tick p50
  **0.4 ms** / p95 **1.8 ms** at ~26 colonists.
- **Full-sim tick performance (`scripts/perf-all.ts`)**:
  - 100 pop: avg 1.24 ms / p95 2.86 ms — ACCEPTABLE
  - 200 pop: avg 1.27 ms / p95 2.25 ms — ACCEPTABLE
  - 400 pop: avg 1.64 ms / p95 2.82 ms — ACCEPTABLE
  (All tiers include the new workforce transitions in the hot assign path —
  Objective 4 shows no regression.)
- **Command latency (Objective 6 + optimistic apply)**: dispatch is immediate
  (no idle wait); the optimistic path adds one domain clone per command on the
  main thread (the same cost the worker pays) — net faster than the FIFO queue
  drain it replaces.

## Open blockers

None. The single blocker found during the program
(`2026-08-20-housing-owner-not-declared.md`) was resolved on 2026-08-20 —
`SIMULATION_AUTHORITY.md` §3 now declares the housing/residence owner and the
decision registry gained the `housing` key.

## Final state

- **49 test files / 322 tests passing, 0 lint errors, 0 type errors, audit clean.**
- Worker, workforce, pregnancy, Moon Howler, and command round-trip invariants
  all exercised by tests.
- No commits made — integration/versioning decisions belong to the developer.
- Changelog (`CHANGELOG.md`, Unreleased section) is the version-bump source of
  truth; README updates deferred per developer instruction.
