# Automatic workforce can assign an unreachable workplace

- Bug: A candidate who fails the canonical commute reachability rule can still receive a job; transfers do not check commute reachability at all.
- Status: investigating — source fix committed on PR #126; runtime unverified
- Severity: high
- Date discovered: 2026-11-06
- Version/build: main source audited at `6e9dd6bfcd525cb1df3d8960a636069f5aa240c7`
- Reporter: source-level audit of persistent workforce against pathfinding
- Area: workforce / commuting / pathfinding
- Owner module: `src/game/workforce.ts` (staffing selection); canonical reachability owner `src/game/commuteReach.ts`
- Related plan: `docs/plans/persistent-automatic-workforce-2026-11-06.md`

## Status history
- 2026-11-06 — Codex review follow-up: unpriced route or node-budget searches now set a per-pass deferral signal; workforce does not cache an incomplete staffing pass. The next scheduled pulse retries with a fresh budget; no tests executed.
- 2026-11-06 — investigating: PR #126 adds a hard canonical two-hour eligibility gate to new hires and transfers; home-based transfer distances and conservative deferral on exhausted route search; no runtime checks executed.
- 2026-11-06 — open: direct source inspection identified reachable-preference fallback and missing transfer eligibility; runtime not executed.

## Observed behavior
`assignWorkerInPlace` computes `near = isWithinAssignableCommute(...)` but treats that result as a ranking preference instead of a mandatory eligibility gate. When all eligible candidates are `near === false`, the first one can still become `worker`, and `assignWorkerTransition` accepts the job without a commute check. Separately, `pickWorkerToTransfer` sorts by relative skills and the candidate's **current position** to the target; it never calls `isWithinAssignableCommute`. `rebalanceJobWorkers` invokes that picker and then transfers.

## Expected behavior
No *new* job assignment or transfer may select a settler with a definitely unreachable or over-two-hour commute under the canonical `MAX_ASSIGNABLE_COMMUTE_HOURS = 2` policy. The route is priced from the settler's **residence** (or current position when unhoused), not merely their current location. A temporarily obstructed commute after a valid assignment must not automatically fire or reassign a longstanding worker.

## Reproduction steps
1. At the inspected commit, read `src/game/workforce.ts` `assignWorkerInPlace`, `pickWorkerToTransfer`, `rebalanceJobWorkers` and `src/game/commuteReach.ts` `isWithinAssignableCommute`.
2. Construct an eligible unemployed citizen whose route to the only vacant workplace exceeds 2 hours, or whose route grid proves it unreachable. Observe that `near` becomes false but the selection loop retains a candidate.
3. For a transfer, provide a qualified donor who cannot reach the target within the canonical commute window. Observe the absence of a reachability condition in `pickWorkerToTransfer`.
4. No runtime execution took place during this audit, per explicit owner instruction.

## Evidence
- `commuteReach.ts`: `MAX_ASSIGNABLE_COMMUTE_HOURS = 2`; `isWithinAssignableCommute` uses home-based estimated commute and distinguishes unreachable routes from incomplete searches.
- `workforce.ts`: `assignWorkerInPlace` sets `bestNear = near` without `if (!near) continue`; `pickWorkerToTransfer` never calls reachability; `transferWorkerBetweenBuildings` writes the new job directly.

## Root cause
Confirmed source-level eligibility omission: travel reachability is a soft preference for initial selection and absent from the automatic transfer picker. This is **not** evidence that every actual commute fails.

## Fix / proposed fix
**Implemented on PR #126 (unverified):** `assignWorkerInPlace` ignores unreachable candidates, `pickWorkerToTransfer` checks the same canonical predicate with all colony buildings, and `commuteReach.isWithinAssignableCommute` refuses an unknown routed path while allowing same-cell and no-grid bootstrap estimates. An event-signature gate avoids running route searches on unchanged workforce pulses; a weekly safety sweep retries. Incumbent jobs are never revoked merely for being unreachable.

Make the canonical `isWithinAssignableCommute` a hard eligibility rule for a **new assignment and transfer**, with deterministic candidate ordering. Reuse `commuteReach.ts`; do not invent distance formulas, straight-line substitutes or new pathfinding. Address route-search-budget exhaustion explicitly: an unpriced leg (`null`) is unknown, not proof of an impassable route; the owner should select a documented bounded retry/defer policy rather than accept false eligibility or reject forever.

Keep existing valid jobs persistent when dynamic terrain, roads, homes or schedules change. A navigation failure should trigger route recovery or housing/commute resolution, **not automatic dismissal**. For an established worker whose route becomes permanently invalid, evaluate a bounded relocation or reassignment under the one workforce/housing owners, with cooldown and no day-by-day churn. Preserve commute waypoints and movement owners; don't recompute A* for every citizen on every tick.

## Save/migration impact
No new stored job schema required. Preserve existing saved jobs and avoid bulk revocation at load; assess bad legacy routes separately.

## Verification result
- Static code-path inspection — completed.
- Runtime reproduction, tests, typecheck, lint, build and CI — NOT RUN by owner instruction.
