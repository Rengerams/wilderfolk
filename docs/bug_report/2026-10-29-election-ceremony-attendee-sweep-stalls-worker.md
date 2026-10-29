# Election ceremony attendee check swept the whole village per settler

- Bug: while an election ceremony is live, every settler's ceremony check walked the entire entity list, so a large village spent seconds per tick in one read-only projection and the simulation worker could not answer a save export.
- Status: resolved
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1 codebase, branch `personality-career-tasks`
- Reporter: owner report (in-game "Save not written — simulation worker did not confirm the current world" banner) with the owner's own save
- Area: village leadership ceremony / simulation worker responsiveness
- Owner module: `villageLeadership.ts` — `isCeremonyAttendee`, `getElectionGatherTarget`
- Related PR/commit: none yet

## Status history
- 2026-10-29 — open: measured on the owner's save (2692 entities, 2027 humans, 933 eligible, ceremony in the `gathering` phase).
- 2026-10-29 — resolved: both ceremony projections stop as soon as the answer is fixed; identical attendee set and slot positions, ~32× cheaper.

## Observed behavior

On the owner's save one simulation tick took 2788 ms with the ceremony active and 738 ms with the ceremony cleared. A single pass of the ceremony projections over the same world measured:

- `isCeremonyAttendee` called once per settler (2027 calls): 1217 ms
- `getElectionGatherTarget` called once per settler (2027 calls): 1619 ms
- `isEligibleForLeadership` alone (2027 calls): 1 ms

The owner's session showed the worker losing contact with the page: a demolition command reported a timeout, and the game refused to save with "Save not written — simulation worker did not confirm the current world. Please retry."

## Expected behavior

The ceremony is a single day and elections are years apart, but the per-settler check must stay bounded work per tick: a read-only projection may not consume seconds of a tick on a large village.

## Reproduction steps

1. Load a large save whose `electionCeremony` is non-null (owner save: 2692 entities, 2027 humans, `phase: 'gathering'`).
2. Call `isCeremonyAttendee(state, id)` for every human and time it, and again with `state.electionCeremony = null`.
3. Observe ~1.2 s of work in the ceremony sweep and a ~2 s longer tick.

## Evidence

Timing script run inside the project container against the owner's save:

```
entities 2692 humans 2027 ceremony {"phase":"gathering",...}
isCeremonyAttendee x 2027 : 1217ms attendees 26     (before)
isEligibleForLeadership x 2027 : 1ms eligible 933
getElectionGatherTarget x 2027 : 1619ms             (before)
isCeremonyAttendee x 2027 : 38ms attendees 26       (after)
getElectionGatherTarget x 2027 : 63ms               (after)
```

The attendee count is unchanged at 26.

## Root cause

Both projections scanned **all** entities for **every** settler, and `isCeremonyAttendee` could not stop early: it kept walking the list to find the queried settler even after the answer was already settled. That is O(settlers × entities) — 5.5 million eligibility checks per tick on the owner's village, where a full pass costs ~0.6 ms.

## Fix / proposed fix

`isCeremonyAttendee` counts the eligible settlers with a smaller id and returns `false` the moment that count reaches `CEREMONY_ATTENDEE_LIMIT`; the slot only grows, so the rest of the pass cannot change the answer. `getElectionGatherTarget` caps both counters it uses — the slot at the same limit, the crowd count at the point where the outer ring radius has already saturated — and stops when both are settled. Neither function caches anything, so both keep the live `alive` / `isJuvenile` semantics the 2026-09 audit pinned.

## Save/migration impact

None. No field, no save format and no ceremony output changes.

## Verification result

- `vitest run tests/medium-N5-electionGatherSlot.test.ts` — PASS (5 tests, includes the legacy oracle comparison for every attendee and the mid-tick death case).
- `vitest run tests/villageLeadership.test.ts tests/medium-B2-leadership.test.ts tests/vacancyElection.succession.test.ts tests/vacancyElection.dueDate.test.ts tests/electionGossip.dedup.test.ts tests/workAbsence.reasons.test.ts` — PASS (64 tests).
- Timing script on the owner's save — PASS: 1217 ms → 38 ms and 1619 ms → 63 ms, attendee set identical.
- Owner-visible save failure — NOT REPRODUCED in the sandbox preview with the same save; a save there completed. The measured tick cost is the defect fixed here, and the export timeout that produced the banner is not directly established.
