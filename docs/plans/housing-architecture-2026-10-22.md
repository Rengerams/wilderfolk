# Housing architecture refactor

Branch: `refactor/housing-architecture`, based on main `bb1942df1e84023e839b718f7dd7d52e1eb833f2`.
Keep main and original saves unchanged. Merge requires the owner's explicit approval.

## Confirmed model

- Every building has one permanent universal numeric ID. Its type and name may match those of other buildings; its ID cannot.
- A citizen's `residenceBuildingId` and `workerBuildingId` reference that same building-ID system. They identify different relationships, not different kinds of building ID.
- Old `homeBuildingId` workplace fields are converted at the save boundary and removed from live state, including nested Moon Howler saved forms.
- Citizen IDs and original birthdates persist across housing, work, family and leadership changes. Preserve current age progression.

## Confirmed gameplay decisions

- For an overcrowded family home, first try to rehouse unrelated residents. If that cannot resolve the shortage, try a suitable whole-family move.
- A couple never shares a house with another, unrelated couple. Until a home of its own frees up it stays with its own family, and a lone settler belongs in a singles' house.
- If no whole-family solution exists, temporarily place the father elsewhere, or leave him homeless when no bed exists, and show a warning message. Keep dependent children with their guardian. Reunite the family when a suitable home becomes available.
- Ordinary adult children start looking for a suitable independent or shared home at 18. They stay with their parents until housing is available; adulthood does not cause eviction.
- The leader, spouse, children and those children's spouses are eligible for the Leader's House. The manor has enough space for the eligible household. Adult children may establish their own home.
- The deceased leader's household stays until the successor takes office. After succession or election defeat, the outgoing household returns to ordinary housing.
- Without an available manor, house the leader's family through ordinary housing.
- Prison stays retain both home and workplace assignments. Physical presence in prison must not count as work attendance.

## Observed ownership conflicts

Residence assignments are currently written by reconciliation, selection/adoption, leader housing, relationships, birth/death handling, demolition, Moon Howler transitions, caravan/rival cleanup and save loading. Resident rosters also have independent writers. Generic housing can split a family when no residence fits and repeatedly reconcile the resulting assignments. The exact initiator of the Day 121 manor move events still needs reproduction from an unchanged save copy.

Consolidate housing decisions and residence writes into the existing reconciliation owner. Keep relationship eligibility and residence selection as pure rules. Events request housing evaluation; a valid unchanged world should produce no relocations. Worker assignment remains owned by workforce. Derive role-specific resident, worker and prisoner rosters from authoritative links.

## Stages

1. Rename the workplace field, migrate old saves, and verify worker transport and UI projections.
2. Consolidate housing writes, implement family shortage/reunion and prisoner reservation rules, and preserve leader eligibility through succession.
3. Make reconciliation stable and bounded; add household commute evaluation without per-tick route searches.
4. Audit permanent ID allocation and retirement history, preserve birthdates, reproduce the Day 121 save, and verify the complete acceptance matrix.

Stages 2–4 follow-up: residence writes are consolidated in reconciliation; family shortage/reunion,
married-child/spouse manor entitlement and grandparent/sibling custody are implemented. Stage 3 retains
both work and school scoring and now has isolated before/after relocation benchmarks and indexed sweeps.
Stage 4 explicitly refuses saves missing identity counters instead of guessing retirement history.
The workplace reference is single-door too (`clearWorkerAssignment` / `detachWorkplaceReference` in
`workforce.ts`), mirroring the residence door.
Prison reservation, the original Day 121 reproduction and the full acceptance matrix remain open.

The existing unmarried-grandchild entitlement is preserved. The confirmed child/spouse rule is applied
without extending eligibility to collateral relatives or married grandchildren. Eligibility is a right
to the manor, not a move order: an adult child or spouse already settled in a home of their own stays
there, so the September audit rule keeping grown children out of the manor still holds.

## Stage 1 verification

Types, lint, production build, source integrity, comment checks and diff whitespace checks passed. The targeted migration, worker transport, rollback and logistics tests passed (32 tests). The full unit run passed 2,176 tests, skipped two and failed one quarry-staffing verdict test. The same failure was reproduced on unchanged main at the base commit. The documentation gate reports two existing README links to the missing older roadmap. No gameplay housing changes are included in this checkpoint; stages 2–4 remain outstanding.

Verification ran in native Linux Bash. The disposable baseline worktree and generated build output were removed. Main and original saves were left unchanged.
