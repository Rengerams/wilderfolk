# Audit — what is done and what still needs to be done (2026-11-12)

Honest state of the remediation. No "verified" claim is made here for anything that has not run on
this exact tree.

## Bottom line

- **162 numbered findings:** 159 fixed, 1 obsolete (`W-85`), 1 refuted (`W-95`), 1 unproven (`W-96`).
- **34 N-IDs (previously unnumbered):** 28 fixed with a regression, 3 refuted (`N-16`, `N-20`, `N-24`), 3 removed with the enemy-captive subsystem (`N-13`, `N-23`, `N-28`).
- **P1 jail fixes:** fixed and verified — `tests/workforce.jailRelease.test.ts`, **4/4 pass**.
- **Gates on the final code tree (re-run after the skill-attendance fix, semantic consolidation and full-year decision):**
  `standard` **PASS** — 533 files / 3,544 tests / 211.5 s; `calendar-scheduler` **PASS** — 18 tests / 11.9 s;
  `colony-integration` **PASS** — 222.6 s; `npm run build` **PASS**. The full unit suite (including the
  optional harnesses) is 535/535 files, 3,546/3,546 tests.
- **Full-year harness:** **GREEN** — 215.5 s. Its scenario-dependent social assertions were removed;
  social non-vacuity lives in the writer suites (`conceptionEvent.labelling`, `courtship.exclusivity`).
- **What remains:** nothing open on this tree; the enemy-captive feature was removed, not deferred.

## Gate status

- **`standard`: PASS** — 533 files / 3,544 tests / 10 steps / 211.5 s on this tree.
- **`calendar-scheduler`: PASS** — 23.8 s; **`colony-integration`: PASS** — 121.6 s (real 90-day
  producer run); **`npm run build`: PASS** (tsc, call-graph, semantic/overlap, lint, duplicate gate,
  vite). Full unit (`vitest run`, including the optional harnesses): 535 files / 3,546 tests, all pass.
- **Full-year harness:** **GREEN** — 215.5 s. The scenario assertions that counted new marriages were
  invalid (the only marriage predates the run; the raid/Moon-Howler colony legitimately falls from 7
  residents to 1). The harness now asserts the year boundary, invariants and a living colony; social
  non-vacuity is covered by `conceptionEvent.labelling` and `courtship.exclusivity`.

## Fixed and named (with proof)

- **162 numbered findings** (`S-01…S-18`, `W-01…W-147`) — every one has a proof row in
  `audit-remediation-evidence-2026-11-12.md`. Three are not fixes: `W-85` obsolete (rival camps are
  strategic records), `W-95` refuted, `W-96` unproven.
- **31 previously unnumbered findings** are now `N-01…N-31` in `audit-all-bugs-2026-11-12.md`.
  Of those, **21 are fixed** and tested, `N-13`/`N-23` became obsolete with the removed enemy-captive subsystem, `N-28` was removed with it, and the remaining seven are
  refuted or now carry the missing regression (see the P2/P3 tables above).
- **F-1…F-7** (focused re-audit): fixed — `campLabel` fixture, pair-salt collisions, DNA doc drift,
  per-person day gate, housing status line, real frontier regressions, log honesty.

## Status by priority (all resolved; enemy captivity removed)

### P1 — fixed and verified (done)

1. ~~**Jailed-post backfill overfills on release (HIGH).**~~ **Fixed** — `restoreWorkerRosterAfterCustody`
   re-posts only when the post is open, otherwise leaves the returnee idle; regression
   `tests/workforce.jailRelease.test.ts`, **4/4 pass**.
2. ~~**A jailed priest still counts as church staff (LOW).**~~ **Fixed** — `countStaffedWorkersAtType`
   now counts active workers only; same regression file.

### P2 — resolved or decided (2026-11-12 follow-up)

| ID | Finding | Resolution |
|---|---|---|
| N-14 | Registry drift: unused `isPropertyWritePermitted`, 06:00 social layer unregistered, `indoorBuildingId` attributed only to leisure | Fixed — a `dailyRelationships` decision now registers the 06:00 pass; `isPropertyWritePermitted` is documented as the registry contract query (no production caller); `construction` owner text already names the real 18:00 private function; `indoorBuildingId` is declared by both `humanWalk` (the writer) and `humanLeisure` |
| N-16 | Combat rolls still use a bespoke LCG, not `simRng` | Refuted — `combat.combatRoll` draws from `seededRandomForRun`; `tests/combatTierEffects.test.ts` proves seed dependence and snapshot replay |
| N-17 | Leisure activity choice is `id/day` arithmetic, not seeded | Fixed — `leisureKindFor` takes the whole activity from a run-seeded stateless roll (weekend swap too); `tests/humanLeisureBehavior.test.ts` proves seed sensitivity and slot stability |
| N-19 | `scentGrid` is not persisted and is stripped at hand-off | Fixed — saves carry a validated cell sidecar and load rebuilds the `ScentGrid`; hand-off already preserved it via `simPrep`; `tests/auditOpenItems.verification.test.ts` |
| N-20 | Child-playmate cache holds live entity references across rollback | Refuted — the cache stores `{tickBucket, mateId}` keyed per world; `tests/humanLeisureBehavior.test.ts` drops a cached mate a rollback removed |
| N-24 | Seeded global `Math.random` is installed in production | Refuted — `enableSeededGlobalRandom` has no production caller and `tests/simRng.test.ts` fails on any `Math.random` in `src` |
| N-25 | `Math.sin/cos` drive patrol/gather positions | Fixed — `simTrig.deterministicSin/Cos` (IEEE arithmetic) drive settler patrol, crowd/gather, birth, camp-wander and wildlife-wander positions; source guard in `tests/simTrig.deterministic.test.ts` |
| N-28 | Enemy prisoner capture is unreachable | Removed — the enemy war-captive subsystem and its unreachable capture path were deleted; player imprisonment is unchanged |

### P3 — verified with dedicated regressions (2026-11-12 follow-up)

| ID | Finding | Evidence |
|---|---|---|
| N-15 | Two seed authorities (`worldMap.seed` vs `getSimSeed`) | `tests/auditOpenItems.verification.test.ts` adopts a saved seed and guards that no gameplay module outside `simRng`/`saveLoad` reads `worldMap.seed` |
| N-22 | UI-authored floating text erased by the next worker delta | Fixed — save feedback is the existing UI toast; the persistence hook no longer mutates the world's floating texts (`tests/useGamePersistence.test.ts`) |
| N-27 | Leadership invariant null branch | `tests/auditOpenItems.verification.test.ts` asserts the "unset but human still holds leader" error |
| N-29 | Housing-relocation counters persist across sessions | `tests/auditOpenItems.verification.test.ts` records a move, crosses `clearColonySessionState`, and reads zero |
| N-30 | `humanPopulation` dips on Moon Howler nights | `tests/auditOpenItems.verification.test.ts` counts a cursed werewolf form as one colonist through `computePopulationCounts` |


### P4 — decisions

- **N-34 crew skill/trait multiplier — fixed by the owner's rule: no skill for work not done.** The
  crew's skill factor, its trade XP (`rewardProductionSkills`, `rewardBuildingWork`), the farm/hunt
  skill credit, town-hall civic XP, hospital medicine XP and hotelier XP now read only workers who
  actually attended or served; an assigned-but-absent roster member contributes nothing.
  `tests/production.attendancePacing.test.ts` and `tests/workshopEconomy.test.ts` prove it.
- **Full-year harness — wrong assertion, not a game bug.** A random year can lose the colony to a
  raid or a Moon Howler before any birth. Do **not** assert `births > 0`/`marriages > 0` on that run.
  The year harness should assert invariants and a valid terminal outcome; non-vacuity belongs in a
  controlled fertility fixture (two adults, food, housing, no raid/howling).

## What "done" would require

1. **P1 is done** — jail release and jailed priest regressions pass 4/4.
2. Re-run `standard`, `calendar-scheduler`, `colony-integration`, `vite build` on the final tree and
   record the exact numbers.
3. The enemy-captive feature is removed and the full-year assertion decision above is recorded.
4. Only then change the remediation log's status from "verified" to reflect the final run.
