# Handover — housing architecture refactor, section by section

Written: 2026-10-23 · Branch: `base44/setup-4bdf1c9f` (HEAD `3aa3bec15b`) · PR: #40

Spec source: the owner's 21-section housing specification of 2026-10-22. Section numbers below are the spec's
own (0–21). Companion documents: the repository's condensed plan
`docs/plans/housing-architecture-2026-10-22.md`, and the static audit with its file:line evidence
`docs/private/audits/2026-10-22/housing-architecture-refactor-audit.md`.

This document answers one question: **for each section of the spec, what is true in the tree today and what is
left to do.** Every "done" below was re-checked against the code on 2026-10-23, not quoted from the audit. Where
a section is open, the reason and the next concrete step are stated.

Statuses: **DONE** · **DONE (guidance)** · **PARTIAL** · **OPEN** · **BLOCKED** · **NO GAP FOUND**

---

## Status of every section

| § | Topic | Status | Evidence / what is left |
| :-- | :--- | :--- | :--- |
| 0 | Branch and worktree workflow | **BLOCKED (environment)** | This sandbox works one checked-out branch; a second worktree or a direct `main` write is not available. `main` stays protected: everything reaches it through PR #40 with the owner's approval. A platform constraint, not an omission — nothing to code. |
| 1 | Refactoring freedom | **DONE (guidance)** | Applied through the ownership map: rules live in their owners (`residencyReconciliation`, `residencySelection`, `leaderHouse`), views only render. No standalone work. |
| 2 | Permanent citizen ids | **DONE** | Identity is `entity.id`; an id is neither index, age nor household. The id-retirement policy is implemented (`saveLoad.ts` `floorIdAllocators`) and covered by `tests/saveLoad.valueIntegrity.test.ts`. |
| 3 | Permanent building ids | **DONE** | One numeric id per building; type and name may repeat. Legacy rival-camp buildings that no settlement still lists are retired on load and by the daily rival pulse. Building-type numbers feed the dashboard table and the inspector. |
| 4 | `workerBuildingId` rename | **DONE** | Rename complete across simulation, UI, diagnostics and worker transport; the save boundary translates the old field once — including nested Moon Howler forms — and removes it from live state. Migration, worker-transport and rollback tests pass. |
| 5 | One authoritative reference; derived rosters | **DONE** | `syncResidenceOccupants` (`residencyReconciliation.ts:135`) is the single roster writer, called from 17 sites and never re-implemented. Occupant order pinned by `tests/residencyReconciliation.occupantOrder.test.ts`. |
| 6 | Find the Leader's House by type | **DONE** | `findLeaderHouse` (`leaderHouse.ts:18`) matches `BuildingType.LeaderHouse`, completed, player faction. No id or index assumption in the residency path. |
| 7 | Manor exclusivity and succession | **DONE** | A vacancy restores the incumbents from `pendingLeaderHouseResidentIds` (`leaderHouse.ts:96`–`:105`, written in `villageLeadership.ts:1173`, persisted in `saveLoad.ts:1594`); once held, only non-entitled residents are displaced and an empty household never evicts. This guard is the fix for the reported manor churn. |
| 8 | Families stay together | **DONE** | Overcrowd rebalance keeps whole families, largest first, and evicts the remainder individually (`residencyReconciliation.ts:60`–`:120`); placement is family-first in `residencySelection`, with the documented split path only when nothing fits. |
| 9 | Adult children at 18 | **OPEN — one word needed** | Spec rule: at 18 an adult child looks for an own or shared home, stays with the parents while no housing is available, and adulthood alone never evicts. Today `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` (`residencySelection.ts:402`, called from `residencyReconciliation.ts:268` and `dayCycle.ts:102`) moves them out **automatically as soon as an empty home exists**. Decide: (a) an automatic move into a genuinely free home is fine — then this section is done as-is; or (b) the move must be the settler's/player's choice — then the empty-home sweep is removed and the "looking for a home" path is kept. |
| 10 | Singles, capacity, no homeless while beds exist | **DONE** | Capacity via `getResidenceCapacity`; singles-only homes respected; `fillHomelessAfterEviction` refills beds after an eviction; `tests/housingUnits.composition.test.ts`. |
| 11 | Children without parents | **DONE, one clause to confirm** | `ensureOrphanAdoption` (`residencySelection.ts:227`): living custodian → adoptive couple → single guardian → `placeOrphanInHouse`, which checks room and skips the manor (`pickOrphanResidence` + `isLeaderHouseResidence` guard). Covered by `tests/adoption.leaderHouse.test.ts` and `tests/simSeed.adoption.test.ts`. **Confirm:** the spec's "siblings kept together" is not visible as an explicit rule — each orphan is placed independently, so siblings can still land in different homes. |
| 12 | Meaningful commute moves | **DONE, one review finding open** | Route-priced commutes in `commuteReach.ts` with `pickCommuteRelocation`, a once-a-day household move, a school-reach pre-check and anti-flap margins; `tests/residenceCommuteRelocation.test.ts`. **Open:** the large-colony (600+) cost of the daily sweep — benchmarks added, verdict and the decision on the sweep's shape not yet taken (PR #40 review finding). |
| 13 | Event triggers | **DONE** | Load, player command and events request a housing evaluation; the rest runs as bucketed daily sweeps. Nothing re-houses settlers per tick. |
| 14 | One housing decision owner | **OPEN — the biggest item** | A live grep finds **27 writes to `residenceBuildingId` in 12 modules outside the owner's door** (`moveResident`, `residencyReconciliation.ts:25`): `humanRelationships` (8), `moonHowlerForm` (3), `leaderHouse` (3), `tradeCaravans` (2), `residencySelection` (2), `moonHowler` (2), `humanLifecycle` (1), `humanLifecycleCleanup` (1), `rivalEvents` (1), `buildingResidencyActions` (1), `buildingMaintenanceActions` (1), `saveLoad` (1). This was wrongly parked as "not requested"; the repo's own plan calls housing-write consolidation *outstanding*. |
| 15 | Stable, bounded reconciliation | **DONE** | `RESIDENCE_SWEEP_BUCKETS = 4` (`residencyReconciliation.ts:213`), bounded passes with early exit, occupancy and trait maps built once per pass, a per-sweep route-search budget in `commuteReach.ts` with a straight-line fallback. |
| 16 | Permanent birthdates | **DONE** | Saved birthdates win over age-derived ones on load (the drift fix); the juvenile/adult day-per-age-year rule is untouched. Covered by `tests/saveMigration.birthdatesPreserved.test.ts`. |
| 17 | Remove redundant functions | **NO GAP FOUND** | The duplication the spec suspected is already collapsed (`pickSharedResidence` and `pickLeastCrowdedResidence` share one path). Treat as an ongoing style rule; no known code gap to close. |
| 18 | Comments, changelog, docs | **DONE (enforced)** | `scripts/check-comments.mjs` (2-line comment cap) and `scripts/check-docs.mjs` run as repo gates. Every player-visible change of this campaign has a `CHANGELOG.md` entry under `## 0.6.6.0[Unreleased]`. |
| 19 | Save format, migrations, id safety | **DONE** | The old workplace field is translated once on load and dropped from live state; id counters are floored only when absent, and then from durable records (genealogy registry for entities, rival camp rows for buildings); ids beyond the safe bound are refused rather than loaded. |
| 20 | Tests and acceptance criteria | **PARTIAL** | Most listed invariants have tests — ten relevant files re-checked today (occupant order, adoption, age 18, housing units, prisoners, commute relocation, save value integrity, birthdates, route estimate, graduated school seat). **Left:** the full acceptance matrix (`npm test -- accept` = build + real-browser gate) has not been run as a final pass, and the Day 121 reproduction is **BLOCKED** — the repository holds only a Day 69 save (`docs/private/saves/wilderfolk-New-Frontier-Y4-D69.json`). |
| 21 | Execution plan | **PARTIAL** | Stage 1 (audit + rename) done. Stage 2: consolidation **open** (§14), prisoner reservation **not implemented** (below), family shortage/reunion **partial** (below), leader eligibility through succession done. Stage 3 done except the sweep-scaling decision (§12). Stage 4: id audit and birthdates done; Day 121 and the acceptance matrix outstanding. |

---

## The four open items, with the exact next step

### 1. §14 — consolidate the residence writes (no decision needed; start here)

* **Problem:** twelve modules write `residenceBuildingId` directly; only one of them is the owner.
* **Minimal change:** for each module, replace its direct set or clear with a call on the reconciliation owner
  that takes the reason, keeping the effect byte-identical. One module per commit, each compiling, tests green.
* **Suggested order (smallest blast radius first):** `buildingResidencyActions` (player unassign) →
  `tradeCaravans` and `rivalEvents` (transient departures) → `moonHowlerForm` and `moonHowler` (form switch parks
  and restores a bed) → `humanLifecycleCleanup` and `humanLifecycle` (birth, death, rehoming) →
  `residencySelection` (adoption placement, family move) → `humanRelationships` (divorce, scandal, arrest) →
  `leaderHouse` (a legitimate owner of its own rule: agree its interface rather than folding it in) →
  `saveLoad` and `buildingMaintenanceActions` (boundary and demolition cleanup).
* **Risk:** these sites carry behaviour (the arrest path clears a bed on purpose). Preserve each caller's effect
  exactly — nothing here may change who sleeps where.

### 2. §21 stage 2 — prisoner reservation (**not implemented; spec and code disagree**)

* The spec: *"Prison stays retain both home and workplace assignments. Physical presence in prison must not count
  as work attendance."*
* The code today does the opposite: arrest removes the prisoner from the workplace roster, sets
  `workerBuildingId = undefined`, removes them from the residence roster and sets `residenceBuildingId = undefined`,
  then sets `prisonBuildingId` (`src/game/simulation/humanRelationships.ts`, arrest path). The dashboard comment
  says this is deliberate, and `tests/prisonerHousing.assign.test.ts` pins it ("arrest clears `residenceBuildingId`
  on purpose").
* Implementing the spec therefore flips a test-pinned behaviour: keep the assignments while imprisoned, exclude the
  prisoner from attendance and occupancy counts, restore the seat on release. It needs the owner's explicit go,
  because it changes gameplay and an existing test rather than repairing a defect.

### 3. §21 stage 2 — family shortage and reunion (partial)

* Spec: for an overcrowded family home, first rehouse unrelated residents; if that cannot resolve it, try a
  whole-family move; if neither exists, temporarily place the father elsewhere (or leave him homeless when no bed
  exists) **with a warning**, keep dependent children with their guardian, and reunite the family when a suitable
  home becomes available.
* In the tree: `rebalanceOvercrowdedResidences` sorts *families* largest-first and evicts the remainder
  (`residencyReconciliation.ts:60`–`:120`), then `fillHomelessAfterEviction` re-houses the evicted on the same
  pass, so reunion happens implicitly through the next assign pulse. Missing as explicit rules: the
  "unrelated residents first" preference, the father-elsewhere fallback, and a family-specific warning (today's
  warning is the generic homeless alert in `priorityAlerts.ts:129` and `dashboardData.ts:246`).
* Next step: confirm whether the implicit reunion counts, then implement the missing clauses with a test pinning
  the order (unrelated first → whole family → father elsewhere → warning).

### 4. §20 — Day 121 reproduction (**blocked**) and the acceptance matrix

* The repeated Leader's-House transfer events need the original save. Only a Day 69 save is in the repository.
  Provide the Day 121 save (an unchanged copy) and the investigation can start; until then this stays
  unreproduced — do not guess at a fix.
* Before merging PR #40: run the acceptance matrix (`npm test -- accept` — build plus the real-browser gate) and
  the unit run. From the stage-1 checkpoint, one quarry-staffing verdict test also failed on unchanged `main`, so
  check a single failure against `main` before treating it as yours.

---

## Open review findings on PR #40 (not spec sections, but the same feature)

The daily commute-relocation pass drew five findings. Fixed: school reach after a move, straight-line pricing,
graduates still scored as pupils, and the route-cost search overestimating when a road is faster than open
ground. **Still open:** the daily sweep's scaling on large colonies (600+). Benchmarks exist; the final numbers
and the decision on the sweep's shape (search budget, cache lifetime, or a cheaper trigger) are not taken. The
owner was also asked whether to keep the feature and fix the scaling, or drop its school-scoring part.

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
