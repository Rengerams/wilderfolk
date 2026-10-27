# Handover — audit remediation and the commuting rule

**Date:** 2026-10-06 · **Base:** `wilderfolk@0.6.5.0`, changelog section `[0.6.5.1]`
**Audit record:** `docs/private/audits/2026-10-06/` (tracker: `LIVE-FINDINGS-STATUS.md`)

This picks up after the owner's upgrade push. The tree is frozen and green as of the numbers below;
read this before starting new work, and check the tracker for the authoritative per-finding status.

---

## 1. State at handover

Verified on the frozen tree, in this order:

| Gate | Result |
|---|---|
| `npm test -- types` | PASS |
| `npm test -- lint` | PASS, 0 errors (6 pre-existing warnings, none in touched files) |
| `npm test -- check` | PASS (comment gate) |
| `npm test -- dup` | PASS |
| `npm test -- cycles` | PASS — no runtime import cycles, 352 modules |
| `npm test -- unit` | **1615 passed, 2 skipped, 1 failed** — the failure is `tests/duplicationA.remaining.test.ts` A18, pre-existing and deliberately untouched (see §5) |
| `npm run build` | PASS (`built in 5.14s`) |
| `npm test -- invariants` | **FAILED — see §1b. Not caused by this session's work, but it blocks the gate, so read §1b before pushing.** |

### 1b. `invariants` is red: one over-capacity residence (pre-existing, deterministic)

The default `restocked` scenario fails its final housing assertion:

```
housing diagnostics reported an inconsistent colony
(over-capacity residences: 1; 8 residences, 48 beds, 50 occupied, 20 homeless)
```

- **Deterministic.** Ran three times, same seed 12345, same result every time.
- **Not introduced by this session's changes.** Run logs in `docs/log/` show the same
  `full-year-failed` at 05:08 and 05:12, *before* the commute gate landed; the gate's own scenario run
  at 05:16 completed, and the first failure after it is this same housing message. Nothing in that
  gate (`workforce.ts` candidate filter, `humanMovement.ts` commute helpers) writes residence lists.
- **What it means.** The owner's verdict counts three inconsistencies
  (`src/game/housingDiagnostics.ts`): over-capacity residences, orphaned residence references, and
  occupant-list mismatches. Only the first is non-zero: 50 settlers hold a bed in 8 residences whose
  capacity sums to 48, and 20 settlers are homeless.
- **Where to look.** `syncResidenceOccupants` (`src/game/residencyReconciliation.ts`) is the single
  writer of `building.occupants`, and it groups by `residenceBuildingId` with **no capacity bound**, so
  a list can exceed `getResidenceCapacity`. The pre-checks that should prevent that are
  `familyFitsInResidence` (`src/game/residencySelection.ts`, which does compute
  `outsiders + family.length <= cap`) and `rebalanceOvercrowdedResidences`
  (`src/game/residencyReconciliation.ts:44`). Both agree on who counts, so the drift is created
  somewhere that assigns `residenceBuildingId` **after** the last rebalance, or by a path handed a
  stale occupancy map. The household write at `residencySelection.ts:392`
  (`for (const member of household) member.residenceBuildingId = target.id;`) writes unconditionally
  once its predicate passes, and is the most likely place to instrument.
- **One attempted fix was reverted.** Passing a freshly built `ResidenceOccupancy` to the
  `rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable` call at `residencyReconciliation.ts:236`
  did **not** change the outcome (measured), so it was reverted rather than left in unverified. Do not
  re-try it blind.
- **Harness improvement kept.** `scripts/run-full-year.mts` now names *which* of the three counters
  failed and prints the residence/bed/homeless totals. The bare message cost three 90-second runs.

This is the highest-value next task, and it is the reason the owner is **not** pushing. The `restocked`
scenario builds no producers (a caveat the audit recorded), so first confirm whether
`--scenario=producers` also reaches 50 occupants in 48 beds — that decides whether the defect is in
assignment logic or in the scenario's own housing pressure.

**Falsified hypothesis — do not retry.** The stale-occupancy theory was implemented and measured:
passing a live `ResidenceOccupancy` into the move-out path and calling `occupancyMove` alongside each
`residenceBuildingId` write (`residencySelection.ts`, `tryMoveOutOfFamilyHome`) left the result
*identical* — still 50 occupied in 48 beds. It was reverted, so no unverified change is in the tree.
The mechanism is therefore **not** confirmed to be the move-out loop at all.

No half-finished edits remain. One agent was interrupted mid-task; its single-line change was
complete and its test passes (§4, `SIM-10`).

---

## 2. The owner's commute rule — the main feature of this session

**Rule:** a post more than **two hours** from a settler's home is not offered to them.

**Owner decision recorded:** the two hours are measured at the speed the settler *actually* commutes
at, and the lead estimate's missing rush multiplier was to be corrected in the same change.

### What was measured (this is the calibration — keep it)

`isWithinAssignableCommute` measures from the settler's **home** if they have one, along the straight
line to the building's centre, and judges the hours `commuteLeadHoursFor` would hand out:

| Route | Assignable up to |
|---|---|
| No road on the route | **665 px** |
| Road on the route (`ROAD_SPEED_MULT` = 1.5) | **998 px** |

The owner's live example — two teachers housed 1,545 px from School #184 — is refused either way
(4.64 h without a road, 3.10 h with one).

### Two defects found while building it

1. **`commuteLeadHoursFor` omitted the commute's `rush` multiplier.** The work commute calls
   `commuteHumanToBuilding(…, rush = 3.5)` (`humanTick.ts`), but the lead estimate computed
   `distance / (speed × distRush × 0.88)` with no `rush` — so every reported commute read **3.5×
   longer** than the walk actually made, and settlers left for work hours earlier than needed.
   Fixed with one named constant, `WORK_COMMUTE_RUSH`, now used by both the estimate and the walk.
   *A first measurement in this session published the inflated 26 px figure before this was found —
   that number was wrong; 665/998 px is the real one.*
2. **The rule had nowhere to live.** Work assignment sorted candidates by distance and took the
   nearest whatever the distance. The gate is now enforced in that single assignment path.

### Files

- `src/game/simulation/humanMovement.ts` — `MAX_ASSIGNABLE_COMMUTE_HOURS`, `WORK_COMMUTE_RUSH`,
  `routePassesRoad`, `isWithinAssignableCommute`.
- `src/game/workforce.ts` — the gate in the candidate filter (with `SPECIES_CONFIG[EntityType.Human].speed`).
- `tests/commute.assignmentLimit.test.ts` — 6 cases. **Non-vacuity proven**: setting the rush to 1
  fails 5 of the 6.

### Still open on this subject (owner decision)

The rule only closes the **assignment** half. `residencySelection.ts` still has **no** distance or
workplace term, so a family can still be *housed* 1,500 px from their work — they just are not offered
the post now. Whether housing should consider the workplace is an open owner decision; see the tracker
row `COMMUTE-1`.

---

## 3. The road correction — do not repeat this mistake

An earlier reading in this session claimed roads needed a "prefer roads" bonus added. **They did not,
and do not.** The mechanism was already complete:

- `ROAD_STEP_COST = 1 / ROAD_SPEED_MULT` makes a road tile cheaper to route over (`pathfinding.ts`,
  applied in the A* step loop).
- The integration step applies `ROAD_SPEED_MULT` at `humanTick.ts:1684`.
- `RoadAvoidanceIndex.applyAvoidance` **steers settlers toward road tiles** — the name is a misnomer;
  `road_avoid` names the spatial query, not an avoidance behaviour.
- `tests/pathfinding.test.ts` already pins "routes along a built road instead of the open ground
  beside it".

The genuine gap was only that the two-hour gate did not credit a road on the route. It now does
(`routePassesRoad`, sampled along the line — deliberately *not* "does the village own any road",
which would widen every settler's reach).

---

## 4. Findings fixed this session

Grouped as in the tracker; `LIVE-FINDINGS-STATUS.md` is authoritative.

**Save/load integrity:** refused-load no longer keeps the failed save's RNG seed or its auto-save
preference · id allocators floored · duplicate/fractional/negative ids refused · `festival.daysLeft`
normalised · storage-quota failure reported instead of claiming success · terrain overrides
round-trip · dangling relationship references swept · map dimensions bounded · `_ticksPerDay`
allow-listed · **SAV-8** `tick`/`lastProcessedCalendarDay` bounded · **SAV-5** venue schedules
normalised through their owner · **SAV-6** container arrays refused by field name.

**Simulation:** wolf can kill (5 % / 11 % bands on one roll) · one-year remarriage bar · affair hour
comparison · officials recorded on shift · off-screen throttle no longer starves attendance · caravan
wait moved to the layer whose unit it uses · death tally no longer counts despawns · disaster drain
reachable · **SIM-10** end-of-tick dedupe made linear (the interrupted agent's change: one `Set`
membership test, survivor order and drops unchanged).

**UX:** intro-seen flag · pause no longer rewrites the workforce · settler hit box floored in screen
space · mini-map viewport · notification dismiss · arrow-key ownership · Guide copy · staffing
refusals rendered · tooltip-only trade/raid refusals rendered as text · critical alerts never
collapsed and not colour-only · raw weather enum replaced by the owner's label.

**Rendering:** **RND-11** grid markers and zone hints ride `terrainRiseAt` (this also turned the
forward-pinned `visualsAudit.renderWiring` D23 test green, which had been red at HEAD).

**Tests added:** `commute.assignmentLimit` (6), `saveLoad.valueIntegrity` (17), `saveLoad.mapAndReferences` (9),
`huntingFightBack.fate` (5), `alertStrip.criticalVisibility` (4), `gameTick.dedupe` (1), plus cases in
`courtship.exclusivity`, `humanSprites`, `venueSchedule`, `saveLoad.elementShape`, `stripSnap.continuity`,
`tradeCaravan.carrierRetention`, `workerBoundary.closure`.

---

## 5. Deliberately NOT done — read before "fixing" these

- **`tests/duplicationA.remaining.test.ts` A18 is red on purpose.** It pins a stale source regex
  (`isOnConstructionCrew(state, entity.id`) while the owner signature is
  `isOnConstructionCrew(state.buildings, entity.id, …)`. The premise still holds; the regex is
  `BRITTLE-TEST`. Left to the owner as the audit flagged it.
- **`SIM-4` (research cadence) is unfinished by choice.** `updateResearch` applies a per-tick rate on
  a 4-tick cadence, so research runs ~4× slower than its constant declares. Correcting the rate
  without re-tuning every node's cost makes research 4× *faster* than designed. This is a balance
  decision and was not taken.
- **The renderer performance work (`RND-1`–`RND-3`, hover-rebake half of `RND-5`) was reverted.** A
  delegated agent died having left three files non-compiling; that half was ~170 lines of visual
  logic in a path no test in this repository can *see*, so it was reverted rather than finished
  blind. Entity interpolation (`RND-1`) remains the most visible presentation defect.
- **Road snapping was NOT diagnosed.** A theory (snap-point gap) was tested and **falsified** — the
  test passed against the old code, so it was deleted rather than shipped. A committed
  `stripTopology.ts` sampling change by another agent is in the tree, and its test
  (`tests/stripSnap.continuity.test.ts`) was **failing on a wrong import** (`createBuilding` comes
  from `worldGen.ts`, not `buildingPlacementActions.ts`); that one line was fixed and it is 4/4.
  **The owner's actual complaint is still unresolved.** To fix it, first determine which it is:
  (a) the road will not attach to an existing road → `snapStripDragEndpoints`; or
  (b) the drag direction/angle fights the pointer while drawing → `inferStripRotation`. They are
  different fixes.
- **`loadIntroSeen`/`saveIntroSeen` has no test.** A direct `tsx` probe round-trips correctly through
  Node's `--localstorage-file`, but the same calls fail under vitest despite
  `execArgv: ['--localstorage-file=…']` being configured. Cause not isolated; the test was deleted
  rather than shipped red. The fix is verified by `types`/`lint`/`check`/build only.
- **`weather` is still unvetted at the load boundary.** The Nature panel's reads were made defensive
  so an unknown value cannot throw, but the field wants the same treatment `tick` got.

---

## 6. Open work

`SIM-4`, `SIM-7`, `SIM-12`–`SIM-21` · `RND-1`–`RND-3`, `RND-4`–`RND-31` · `SAV-7`, `SAV-14`–`SAV-22` ·
`IX-1`–`IX-5`, `IX-8`–`IX-31` · `UX-3`, `UX-4`, `UX-6`–`UX-9`, `UX-11`–`UX-35`.
Full detail in the per-area reports beside the tracker.

**Owner decisions outstanding:**
1. Should **residence selection** consider the workplace (the commute rule's other half)?
2. The **UX redesign proper** — the audit found the interaction layer strong, but the onboarding
   sequence (four surfaces competing on screen one), the inspector's eight-section stack, and the
   notification/alert/reason surfaces need a deliberate design pass.
3. Road snapping: which of (a)/(b) in §5 is the actual complaint.

---

## 7. Traps that cost time this session — worth knowing

- **Concurrency is real.** Several agents commit to this tree. `git status` is noisy and files move
  under you; re-read immediately before every edit. Two of my commits-worth of work were swept into
  another agent's commit, and one of my reverts deleted another agent's *committed* work — which is
  why `stripTopology.ts` must not be reverted casually.
- **One-shot delegated agents can die mid-edit and leave the tree non-compiling.** Instruct each
  agent to report its unified diff in its closing message so the work is recoverable, and give each
  one a *small* scope. Four agents on one file produced a regression that refused every real save
  (object-element rules applied to string arrays) and was caught only by a peer agent.
- **The shell is PowerShell 7 — `7.7.0-preview.5`, in this session.** An earlier draft of this handover
  claimed 5.1 and wrapped every command in `cmd /c "…"` as a 5.1 fallback; that was a **misreading of
  the §0 check, not a requirement**. The wrapper works but is unnecessary, and it puts cmd's exit code
  between you and the real one. Verified: `$PSVersionTable.PSVersion.ToString()` → `7.7.0-preview.5`.
  A **delegated shell is a separate process and can still report 5.1** in the same session — check
  inside the shell you are actually running, and if it is 5.1, invoke `C:\powershell7\pwsh.exe` (already
  on PATH) directly. `command.md` §0 now documents both cases.
- **`lint` is type-aware and catches things `types` does not.** A bad union member passed `types` and
  failed `lint`.
- **The comment gate (`npm test -- check`) rejects dates and "used to be" in newly added comments** —
  including in test-file headers. It fired on this session's own work four times.
- **`%TEMP%\dsh-spill-eTLPYu\` was left in place deliberately**: it is a harness spill file from
  another agent's truncated output, not this session's, and is not mine to delete.
