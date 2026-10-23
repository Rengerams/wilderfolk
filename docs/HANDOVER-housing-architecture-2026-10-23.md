# Handover — housing architecture refactor, section by section

Written: 2026-10-23 · Branch: `base44/setup-4bdf1c9f` (re-checked at HEAD `68d66f81d9`) · PR: #40

Spec source: the owner's 21-section housing specification of 2026-10-22. Section numbers below are the spec's
own (0–21). Companion documents: the repository's condensed plan
`docs/plans/housing-architecture-2026-10-22.md`, and the static audit with its file:line evidence
`docs/private/audits/2026-10-22/housing-architecture-refactor-audit.md`.

This document answers one question: **for each section of the spec, what is true in the tree today and what is
left to do.** Every "done" below was re-checked against the code on 2026-10-23, not quoted from the audit. Where
a section is open, the reason and the next concrete step are stated.

**Correction pass (owner review, 2026-10-23).** The first version of this document called four sections done
that the owner's own read of the code found only partly built. §7, §8, §11 and §19 now carry the corrected status
and the evidence for it; nothing else was re-statused. Treat those four as the known soft spots of any "DONE" in
this table.

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
| 7 | Manor exclusivity and succession | **PARTIAL** | Succession is done: a vacancy restores the incumbents from `pendingLeaderHouseResidentIds` (`leaderHouse.ts:96`–`:105`, written in `villageLeadership.ts:1173`, persisted in `saveLoad.ts:1594`); once held, only non-entitled residents are displaced and an empty household never evicts. That guard is the fix for the reported manor churn. **Not done — who is entitled:** `collectLeaderDescendants` (`householdComposition.ts:32`) drops every married adult descendant from the walk (`partnerId != null && !isJuvenile && age >= HUMAN_ADULT_MIN_AGE`) and never adds a descendant's partner, so a married adult child and their spouse are ineligible, while the plan (line 18) grants "the leader, spouse, children and those children's spouses" a place and leaves grandchildren open (plan line 46). See open item 5. |
| 8 | Families stay together | **PARTIAL** | What exists: the overcrowd rebalance keeps whole families, largest first, and evicts the remainder individually (`residencyReconciliation.ts:60`–`:120`); placement is family-first in `residencySelection`, with the split path only when nothing fits. **Not done — the plan's order:** `rebalanceOvercrowdedResidences` never looks for an unrelated resident to move out first, never attempts a whole-family move as a second step, and has no father-elsewhere fallback with the family warning (plan lines 15–16). See open item 3. |
| 9 | Adult children at 18 | **OPEN — one word needed** | Spec rule: at 18 an adult child looks for an own or shared home, stays with the parents while no housing is available, and adulthood alone never evicts. Today `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` (`residencySelection.ts:402`, called from `residencyReconciliation.ts:268` and `dayCycle.ts:102`) moves them out **automatically as soon as an empty home exists**. Decide: (a) an automatic move into a genuinely free home is fine — then this section is done as-is; or (b) the move must be the settler's/player's choice — then the empty-home sweep is removed and the "looking for a home" path is kept. |
| 10 | Singles, capacity, no homeless while beds exist | **DONE** | Capacity via `getResidenceCapacity`; singles-only homes respected; `fillHomelessAfterEviction` refills beds after an eviction; `tests/housingUnits.composition.test.ts`. |
| 11 | Children without parents | **PARTIAL** | `ensureOrphanAdoption` (`residencySelection.ts:227`): living custodian → adoptive couple → single guardian → `placeOrphanInHouse`, which checks room and skips the manor (`pickOrphanResidence` + `isLeaderHouseResidence` guard). Covered by `tests/adoption.leaderHouse.test.ts` and `tests/simSeed.adoption.test.ts`. **Not done — the custodian chain and sibling sets:** `getChildCustodian` (`householdComposition.ts:137`) reaches grandparents only when `child.isBastard`, and then only the two grandmothers (the mother's mother and the father's mother) — no grandfather, and no grandparent at all for a legitimate orphan; and adoption runs one child at a time, so siblings can still land in different homes. See open item 6. |
| 12 | Meaningful commute moves | **DONE, one review finding open** | Route-priced commutes in `commuteReach.ts` with `pickCommuteRelocation`, a once-a-day household move, a school-reach pre-check and anti-flap margins; `tests/residenceCommuteRelocation.test.ts`. **Open:** the large-colony (600+) cost of the daily sweep — benchmarks added, verdict and the decision on the sweep's shape not yet taken (PR #40 review finding). |
| 13 | Event triggers | **DONE** | Load, player command and events request a housing evaluation; the rest runs as bucketed daily sweeps. Nothing re-houses settlers per tick. |
| 14 | One housing decision owner | **OPEN — the biggest item** | A live grep finds **27 writes to `residenceBuildingId` in 12 modules outside the owner's door** (`moveResident`, `residencyReconciliation.ts:25`): `humanRelationships` (8), `moonHowlerForm` (3), `leaderHouse` (3), `tradeCaravans` (2), `residencySelection` (2), `moonHowler` (2), `humanLifecycle` (1), `humanLifecycleCleanup` (1), `rivalEvents` (1), `buildingResidencyActions` (1), `buildingMaintenanceActions` (1), `saveLoad` (1). Re-counted on this branch, unchanged. This was wrongly parked as "not requested"; the repo's own plan calls housing-write consolidation *outstanding*. |
| 15 | Stable, bounded reconciliation | **DONE** | `RESIDENCE_SWEEP_BUCKETS = 4` (`residencyReconciliation.ts:213`), bounded passes with early exit, occupancy and trait maps built once per pass, a per-sweep route-search budget in `commuteReach.ts` with a straight-line fallback. |
| 16 | Permanent birthdates | **DONE** | Saved birthdates win over age-derived ones on load (the drift fix); the juvenile/adult day-per-age-year rule is untouched. Covered by `tests/saveMigration.birthdatesPreserved.test.ts`. |
| 17 | Remove redundant functions | **NO GAP FOUND** | The duplication the spec suspected is already collapsed (`pickSharedResidence` and `pickLeastCrowdedResidence` share one path). Treat as an ongoing style rule; no known code gap to close. |
| 18 | Comments, changelog, docs | **DONE (enforced)** | `scripts/check-comments.mjs` (2-line comment cap) and `scripts/check-docs.mjs` run as repo gates. Every player-visible change of this campaign has a `CHANGELOG.md` entry under `## 0.6.6.0[Unreleased]`. |
| 19 | Save format, migrations, id safety | **PARTIAL** | Done: the old workplace field is translated once on load and dropped from live state; ids beyond the safe bound are refused rather than loaded; a counter the payload carries is never lowered, and a missing one is floored from durable records (the genealogy registry for settlers, rival camp rows for buildings). **Not done — a legacy save with neither:** `floorIdAllocators` (`saveLoad.ts`) can only reconstruct an id from a record that still exists, so a demolished building that leaves no row in `buildings` and none in `rivalSettlements[].buildingIds` loses its number; a later building may be handed that id again. See open item 7. |
| 20 | Tests and acceptance criteria | **PARTIAL** | Most listed invariants have tests — ten relevant files re-checked today (occupant order, adoption, age 18, housing units, prisoners, commute relocation, save value integrity, birthdates, route estimate, graduated school seat). **Left:** the full acceptance matrix (`npm test -- accept` = build + real-browser gate) has not been run as a final pass, and the Day 121 reproduction is **BLOCKED** — the repository holds only a Day 69 save (`docs/private/saves/wilderfolk-New-Frontier-Y4-D69.json`). |
| 21 | Execution plan | **PARTIAL** | Stage 1 (audit + rename) done. Stage 2: consolidation **open** (§14), prisoner reservation **not implemented** (item 2), family shortage/reunion **partial** (item 3), manor succession done but entitlement composition open (§7, item 5), orphan custody rules incomplete (§11, item 6). Stage 3 done except the sweep-scaling decision (§12). Stage 4: id audit and birthdates done, with the legacy-id caveat of §19 (item 7) open; Day 121 and the acceptance matrix outstanding. |

---

## The open items, with the exact next step

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

### 3. §8 + §21 stage 2 — family shortage and reunion (**partial**)

* Spec: for an overcrowded family home, first rehouse unrelated residents; if that cannot resolve it, try a
  whole-family move; if neither exists, temporarily place the father elsewhere (or leave him homeless when no bed
  exists) **with a warning**, keep dependent children with their guardian, and reunite the family when a suitable
  home becomes available.
* In the tree: `rebalanceOvercrowdedResidences` sorts *families* largest-first and evicts the remainder
  (`residencyReconciliation.ts:60`–`:120`), then `fillHomelessAfterEviction` re-houses the evicted on the same
  pass, so reunion happens implicitly through the next assign pulse. Missing as explicit rules: the
  "unrelated residents first" preference, the whole-family-move step, the father-elsewhere fallback, and a
  family-specific warning (today's warning is the generic homeless alert in `priorityAlerts.ts:129` and
  `dashboardData.ts:246`).
* Next step: confirm whether the implicit reunion counts, then implement the missing clauses with a test pinning
  the order (unrelated first → whole family → father elsewhere → warning).

### 4. §20 — Day 121 reproduction (**blocked**) and the acceptance matrix

* The repeated Leader's-House transfer events need the original save. Only a Day 69 save is in the repository.
  Provide the Day 121 save (an unchanged copy) and the investigation can start; until then this stays
  unreproduced — do not guess at a fix.
* Before merging PR #40: run the acceptance matrix (`npm test -- accept` — build plus the real-browser gate) and
  the unit run. From the stage-1 checkpoint, one quarry-staffing verdict test also failed on unchanged `main`, so
  check a single failure against `main` before treating it as yours.

### 5. §7 — manor entitlement composition (**a family-entitlement decision first**)

* **Problem:** succeeding into the manor works; *composing* the manor household does not match the plan.
  `collectLeaderDescendants` (`householdComposition.ts:32`) skips a married adult child of the leader outright and
  never adds a descendant's partner, so that couple is ineligible for the house the plan reserves for them.
* **Decision first:** whether grandchildren are eligible as well (plan line 46). This is a family entitlement, not
  a coding choice.
* **Then the change:** one eligibility predicate in the entitlement owner — descendant, spouse of a descendant,
  age rule — and a test at an arbitrary house id (not assumed `#0`) covering leader death, two-month succession
  and an election defeat.
* **Risk:** eligibility feeds displacement. Loosening it moves more settlers into the manor's eviction path, so
  pin the displacement rule in the same test.

### 6. §11 — orphan custody rules (**partial**)

* **Problem:** `getChildCustodian` (`householdComposition.ts:137`) walks mother → father → (only when
  `child.isBastard`) the mother's mother and the father's mother → adoptive parents. A legitimate orphan never
  reaches a grandparent, a grandfather is never considered, and `ensureOrphanAdoption` places one child at a time,
  so a sibling set can be spread across homes.
* **Decision first:** the intended custodian order — which grandparents, for which orphan, and whether a sibling
  set outranks the custodian tier it does not fit in.
* **Minimal change:** implement that order in the one owner, and place a sibling set as one unit whenever a home
  has room for it. Test both: a legitimate orphan reaching a grandparent, and two siblings landing in one home.

### 7. §19 — a legacy save with no counter and no record of a demolished building

* **Problem:** `floorIdAllocators` (`saveLoad.ts`) reconstructs the allocator floor from records the payload still
  has — `entities`, the genealogy registry, `buildings`, and `rivalSettlements[].buildingIds`. A player building
  that was demolished before the save is in none of them, and a legacy payload carries no counter, so its id
  cannot be recovered: a later building can be handed that number, and anything still referring to the old id
  silently resolves to the new building.
* **Options (owner's call):** carry a retire list of demolished building ids so the floor survives saving; refuse
  a payload that has neither counter nor retire list instead of trusting the floor it computes; or start
  recording demolished ids today so the case cannot arise for saves written from now on.
* **Scope of the risk:** a save that carries its counter is unaffected, and the `MAX_PERSISTED_ID` bound is
  enforced on every persisted id either way.

---

## Open review findings on PR #40 (not spec sections, but the same feature)

The daily commute-relocation pass drew five findings. Four are fixed and each is pinned by a test: school reach
after a move, straight-line pricing, graduates still scored as pupils
(`tests/education.graduatedSeatCleared.test.ts`), and the route-cost search overestimating when a road is faster
than open ground (`tests/commuteRouteEstimate.test.ts`, "prices a paved route that is longer on the map but
cheaper to walk") — the last two landed in `8f76125`. The owner's answer to the open question was **keep the
feature**; nothing was removed. **Still open:** the daily sweep's scaling on large colonies (600+). Benchmarks
exist; the final numbers and the decision on the sweep's shape (search budget, cache lifetime, or a cheaper
trigger) are not taken.

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
