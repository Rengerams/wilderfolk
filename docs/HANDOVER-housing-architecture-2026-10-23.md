# Handover — housing architecture refactor, section by section

Written: 2026-10-23 · Branch: `base44/setup-4bdf1c9f` (re-checked at HEAD `68d66f81d9`) · PR: #40

Spec source: the owner's 21-section housing specification of 2026-10-22. Section numbers below are the spec's
own (0–21). Companion documents: the repository's condensed plan
`docs/plans/housing-architecture-2026-10-22.md`, and the static audit with its file:line evidence
`docs/private/audits/2026-10-22/housing-architecture-refactor-audit.md`.

This document answers one question: **for each section of the spec, what is true in the tree today and what is
left to do.** Every "done" below was re-checked against the code on 2026-10-23, not quoted from the audit. Where
a section is open, the reason and the next concrete step are stated.

**Completion pass (2026-10-23).** The earlier PARTIAL labels were real gaps, not requests for more
scope decisions. The follow-up implements §§7, 8, 11, 14 and 19 and benchmarks/optimizes §12 without
removing work or school scoring. The confirmed gameplay plan supplies married-child/spouse entitlement;
the earlier unmarried-grandchild rule remains unchanged.

Statuses: **DONE** · **DONE (guidance)** · **PARTIAL** · **OPEN** · **BLOCKED** · **NO GAP FOUND**

---

## Status of every section

| § | Topic | Status | Evidence / what is left |
| :-- | :--- | :--- | :--- |
| 0 | Branch and worktree workflow | **BLOCKED (environment)** | This sandbox works one checked-out branch; a second worktree or a direct `main` write is not available. `main` stays protected: everything reaches it through PR #40 with the owner's approval. A platform constraint, not an omission — nothing to code. |
| 1 | Refactoring freedom | **DONE (guidance)** | Applied through the ownership map: rules live in their owners (`residencyReconciliation`, `residencySelection`, `leaderHouse`), views only render. No standalone work. |
| 2 | Permanent citizen ids | **DONE** | Identity is `entity.id`; an id is neither index, age nor household. The id-retirement policy is implemented (`saveLoad.ts` `floorIdAllocators`) and covered by `tests/saveLoad.valueIntegrity.test.ts`. |
| 3 | Permanent building ids | **DONE** | One numeric id per building; type and name may repeat. Legacy rival-camp buildings that no settlement still lists are retired on load and by the daily rival pulse. Building-type numbers feed the dashboard table and the inspector. Persistence relies on the save carrying its counter — a legacy payload that does not is §19. |
| 4 | `workerBuildingId` rename | **DONE** | Rename complete across simulation, UI, diagnostics and worker transport; the save boundary translates the old field once — including nested Moon Howler forms — and removes it from live state. Migration, worker-transport and rollback tests pass. |
| 5 | One authoritative reference; derived rosters | **DONE** | `syncResidenceOccupants` (`residencyReconciliation.ts:135`) is the single roster writer, called from 17 sites and never re-implemented. Occupant order pinned by `tests/residencyReconciliation.occupantOrder.test.ts`. |
| 6 | Find the Leader's House by type | **DONE** | `findLeaderHouse` (`leaderHouse.ts:18`) matches `BuildingType.LeaderHouse`, completed, player faction. No id or index assumption in the residency path. |
| 7 | Manor exclusivity and succession | **DONE** | The confirmed plan's leader, spouse, children and children's spouses are entitled. Existing unmarried-grandchild eligibility is retained, not broadened. Vacancy protection and arbitrary-id succession remain in place, and an adult child or spouse settled in their own home is not relocated into the manor. Regressions cover married children, their spouses, unrelated settlers, vacancy and one-time handover. |
| 8 | Families stay together | **DONE** | Shortage order is explicit: move unrelated residents first, then try a whole-family move, then keep dependents with their guardian and temporarily place the father elsewhere. A derived family-specific warning remains until reunion. If even the dependent group fits nowhere, it stays together unhoused rather than violating capacity. Reconciliation reunites the household when space appears. |
| 9 | Adult children at 18 | **OPEN — one word needed** | Spec rule: at 18 an adult child looks for an own or shared home, stays with the parents while no housing is available, and adulthood alone never evicts. Today `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` (`residencySelection.ts:402`, called from `residencyReconciliation.ts:268` and `dayCycle.ts:102`) moves them out **automatically as soon as an empty home exists**. Decide: (a) an automatic move into a genuinely free home is fine — then this section is done as-is; or (b) the move must be the settler's/player's choice — then the empty-home sweep is removed and the "looking for a home" path is kept. |
| 10 | Singles, capacity, no homeless while beds exist | **DONE** | Capacity via `getResidenceCapacity`; singles-only homes respected; `fillHomelessAfterEviction` refills beds after an eviction; `tests/housingUnits.composition.test.ts`. |
| 11 | Children without parents | **DONE** | Eligible parent, then maternal/paternal grandparents of either gender, then a suitable adoptive couple, then the existing single-guardian fallback. Genealogy supplies parent links after pruning; sibling sets share custody and placement, and a fitting current guardian home is preferred. Leader adoption remains excluded. |
| 12 | Meaningful commute moves | **DONE — measured and optimized** | Work and school route costs, pupil reach and anti-flap thresholds are retained. The daily sweep skips route pricing with no vacancy, indexes homes/destinations, and scans only roads in the straight-line fallback. Isolated benchmarks at 600/1,200/2,400 settlers produce identical assignment hashes to the unindexed reference; warm median with 80 spare homes at 2,400 falls from 684.6 ms to 66.1 ms. See the benchmark report below. |
| 13 | Event triggers | **DONE** | Load, player command and events request a housing evaluation; the rest runs as bucketed daily sweeps. Nothing re-houses settlers per tick. |
| 14 | One housing decision owner | **DONE** | `moveResident` in reconciliation is the only live residence-reference writer. All event set/clear sites call it with a reason; adoption placement, adult-child moves and divorce housing moved out of selection/relationships into reconciliation. Pass occupancy/traits and supplied residence rosters update at the door. Selection remains pure; leader entitlement remains with its existing rule owner. |
| 15 | Stable, bounded reconciliation | **DONE** | `RESIDENCE_SWEEP_BUCKETS = 4` (`residencyReconciliation.ts:213`), bounded passes with early exit, occupancy and trait maps built once per pass, a per-sweep route-search budget in `commuteReach.ts` with a straight-line fallback. |
| 16 | Permanent birthdates | **DONE** | Saved birthdates win over age-derived ones on load (the drift fix); the juvenile/adult day-per-age-year rule is untouched. Covered by `tests/saveMigration.birthdatesPreserved.test.ts`. |
| 17 | Remove redundant functions | **NO GAP FOUND** | The duplication the spec suspected is already collapsed (`pickSharedResidence` and `pickLeastCrowdedResidence` share one path). Treat as an ongoing style rule; no known code gap to close. |
| 18 | Comments, changelog, docs | **DONE (enforced)** | `scripts/check-comments.mjs` (2-line comment cap) and `scripts/check-docs.mjs` run as repo gates. Every player-visible change of this campaign has a `CHANGELOG.md` entry under `## 0.6.6.0[Unreleased]`. |
| 19 | Save format, migrations, id safety | **DONE — explicit refusal policy** | Saves carrying counters retain their high-water marks and known historical floors. A payload missing either identity counter is explicitly refused: lost retirement history cannot be reconstructed from surviving rows. Existing identities and legitimate assignments are never renumbered to disguise missing history. Migration, allocator, immutable-input and browser refusal checks cover the boundary. |
| 20 | Tests and acceptance criteria | **PARTIAL** | Most listed invariants have tests — ten relevant files re-checked today (occupant order, adoption, age 18, housing units, prisoners, commute relocation, save value integrity, birthdates, route estimate, graduated school seat). **Left:** the full acceptance matrix (`npm test -- accept` = build + real-browser gate) has not been run as a final pass, and the Day 121 reproduction is **BLOCKED** — the repository holds only a Day 69 save (`docs/private/saves/wilderfolk-New-Frontier-Y4-D69.json`). |
| 21 | Execution plan | **PARTIAL** | Stages 2–4 now have housing-write consolidation, family shortage/reunion, manor entitlement, sibling/grandparent custody, measured commute optimization and an explicit legacy-identity policy. Prison reservation remains outside this follow-up; Day 121 still needs the original save, and the final acceptance matrix remains outstanding. |

---

## Remaining acceptance work (not reopened gameplay decisions)

- Prison reservation is unchanged in this follow-up. Arrest still releases work and residence references;
  the existing prisoner-housing regression continues to pin that separate behaviour.
- The original Day 121 save is still absent. Only the Day 69 save is available, so no claim is made to
  reproduce that original session. Synthetic succession and Moon Howler anti-churn regressions cover the
  implemented rules, not that unavailable fixture.
- The final full acceptance matrix and full unit suite are left to the broader acceptance/CI pass. The
  targeted housing, migration, worker-transport and command suites cover this follow-up.
- §9's ordinary adult-child automatic move into a free home is not changed by this follow-up.

## Daily relocation benchmark (spec §12, not a review finding number)

The existing `scripts/perf-at-pop.ts` harness now has an isolated relocation mode. Each generated tier
contains three-person households, workers and pupils on a real seeded path grid. It runs twelve sweeps,
reports the first cold sample and warm median/p95, and restores the initial assignments between samples.
Grid caches are reset between fixtures so an earlier no-vacancy fixture cannot warm the next fixture's
routes. The reference uses the original ordered picker loop; the optimized run uses the production sweep.

| Settlers | Spare homes | Warm median before → after | Warm p95 before → after | Exact assignment hash |
|---|---|---|---|---|
| 600 | 0 | 8.12 → 0.11 ms | 10.10 → 0.15 ms | identical |
| 600 | 20 | 22.20 → 4.40 ms | 30.32 → 5.62 ms | identical |
| 1,200 | 0 | 10.65 → 0.10 ms | 12.46 → 0.13 ms | identical |
| 1,200 | 40 | 102.23 → 14.91 ms | 120.60 → 22.97 ms | identical |
| 2,400 | 0 | 23.85 → 0.25 ms | 26.31 → 1.63 ms | identical |
| 2,400 | 80 | 684.59 → 66.15 ms | 772.79 → 96.21 ms | identical |

These are sweep timings, not whole-game frame rates or a long-run colony-balance verdict. Both runs keep
school-reach checking, the route-search budget, candidate order, tie-breaking and improvement margins.
The optimized vacancy list is updated after every move, including a newly vacated home.

Reproduce in the existing Compose service (one process at a time):

```sh
docker compose -f docker-compose.base44.yml exec -T -e PERF_RELOCATION=1 -e PERF_RELOCATION_REFERENCE=1 -e PERF_POPS=600,1200,2400 web npx tsx scripts/perf-at-pop.ts
docker compose -f docker-compose.base44.yml exec -T -e PERF_RELOCATION=1 -e PERF_POPS=600,1200,2400 web npx tsx scripts/perf-at-pop.ts
```

## Legacy identity policy (spec §19)

An intact saved allocator is the retirement record: it never decreases, and durable genealogy/camp ids
can raise an incorrectly rewound floor. Without a stored counter, the largest surviving id cannot prove
that a larger demolished building or departed citizen never existed. Such a payload is refused with an
explanation asking for an intact save with its original counters. No identities are changed, no guessed
namespace is allocated, and the rejected input remains untouched. This is deliberate compatibility
refusal, not a claim that missing history was recovered.

---

## Working in this environment (so the next person does not rediscover it)

* **Preview:** Linux sandbox. Start it with `docker compose -f docker-compose.base44.yml up -d --build`; the
  game's Vite dev server is served on host port 3000 from the mounted clone, with live reload. The shell is Bash,
  not PowerShell, so the shell-verification steps of `AGENTS.md` §0 do not apply here — the npm commands do.
* **Checks:** `npm run test:types`, `npm run lint`, `npm run build`, and `node scripts/test.mjs check` for the
  comment and doc gates. Run the targeted housing suites for anything in this area.
* **Rules that will bite:** every function you add or move needs a row in `OWNERSHIP_OVERVIEW.md` (§5.9); a
  changelog entry under `## 0.6.6.0[Unreleased]` for anything player-visible; comments are capped at 2 lines;
  scratch belongs in `tmp/` and must not outlive the session. Note that earlier sessions of this campaign left
  directories under `tmp/` (`main-baseline`, `wf-commute`) — they are scratch, not a harness, so do not build on
  them; `npm run clean` empties `tmp/` wholesale when the owner wants them gone.
* **Do not** switch branches, touch `main`, or merge PR #40 without the owner's explicit approval.
