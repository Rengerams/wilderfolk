# The "shared home" friendship bump was keyed on the workplace, so cohabitants never became friends

- **Bug:** `advanceSocialRelationships` grouped the daily friendship bump into a map named `homeGroups`, but keyed it on `homeBuildingId` — which in this codebase is the **workplace** (`residencyOccupancy.hasWorkAssignment` = `homeBuildingId != null`), while `residenceBuildingId` is the home. The residence half of the module's own documented rule ("friendships grow from shared work, home and childhood") therefore had no implementation at all: two settlers sharing a House, including spouses, gained nothing
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 lifecycle/social audit, finding **F2** (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`); runtime-reproduced there (two housemates with different workplaces ended with `friendships = {}` while two coworkers gained `{ friend_4: 0.6 }`) and re-verified here
- **Area:** Truth (relationship simulation) with a Play consequence (friendships, the daily strong-friend energy lift, election vote weight)
- **Owner module:** `src/game/relationships.ts` (`advanceSocialRelationships`)
- **Cadence:** daily (`tickLayerDaily` → `advanceSocialRelationships`)

## Status history

- 2026-09-16 — open (audit finding; the friend pass pruned and the feud pass decayed, but the home group never described a home)
- 2026-09-16 — resolved (residence, workplace building and job type are now three distinct sources; regression test added)

## Observed behavior

```ts
// src/game/relationships.ts (before)
const homeGroups = new Map<number, Entity[]>();
for (const p of people) {
  if (p.homeBuildingId != null) {           // workplace, not home
    const arr = homeGroups.get(p.homeBuildingId) || [];
```

Two settlers living in the same House but working elsewhere were never grouped; `homeGroups` and
`jobGroups` both described work (workplace building and job type), so a pair of coworkers could be
counted through two paths (de-duplicated by `seenPairs`, so one bump).

## Expected behavior

Friendship grows from a shared **home**, a shared **workplace**, and a shared **job type** — three
sources, each contributing at most one bump per pair per day through the existing `seenPairs` guard.

## Reproduction steps

1. Before the fix: two settlers with the same `residenceBuildingId` but different
   `homeBuildingId`/`job` gain no friendship (`friendshipScore(a, b) === 0`).
2. `npx vitest run tests/relationships.sharedHomeFriendship.test.ts` — the "shares a house" case
   fails against the old field.

## Evidence

- `src/game/residencyOccupancy.ts:32-38` — `hasWorkAssignment` reads `homeBuildingId`;
  `hasResidenceAssignment` reads `residenceBuildingId`.
- `src/game/workforce.ts:612-616` — the workplace is resolved from `entity.homeBuildingId`.
- `src/game/relationships.ts:5-7` (module doc) and the pass comment "Shared home and shared job draw
  people together" — the documented behaviour the code did not implement.
- `src/game/relationships.ts:209-214` — strong friends give a daily energy lift, and
  `electionVotes.ts:59` weights votes by friendship, so the missing source had real consequences.

## Root cause

A wrong field picked while writing a grouping pass whose variable name (`homeGroups`) described the
intent rather than the field. `homeBuildingId` sounds like a home and is not one; the audit's open
question about that naming is recorded in the audit document.

## Regression test

`tests/relationships.sharedHomeFriendship.test.ts` (3 tests):
- housemates with different workplaces **do** gain friendship, symmetrically (fails before the fix);
- coworkers sharing a workplace building still gain friendship (the pre-existing behaviour, preserved);
- settlers sharing neither home nor work remain strangers.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied; the change only adds a bounded, de-duplicated friendship source, so no cadence,
save field or relationship invariant moved.

## Save/migration impact

None. `friendships` keeps its shape and meaning; a colony simply accrues more of the friendship that
the documented rule already promised, and none of it is a new field.

## Verification result

- `npx vitest run tests/relationships.sharedHomeFriendship.test.ts tests/relationships.feudCleanup.test.ts` — passed (6 tests).
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm test` / `npm run test:full-year` — passed (see the batch verification in `CHANGELOG.md`).

## Related commits or files

- `src/game/relationships.ts` — `residenceGroups` (home), `workplaceGroups` (workplace building) and `jobGroups` (job type)
- `tests/relationships.sharedHomeFriendship.test.ts` — new

## Fix

The daily pass now builds three groups from the three fields that actually mean what the rule says:
`residenceBuildingId` (home), `homeBuildingId` (workplace building) and `job` (job type), and iterates
all three through the same `bumpFriendship` / `seenPairs` path. The audit's option of *replacing* the
workplace group was deliberately not taken: sharing a building is shared work, so the fix is additive
and cannot remove friendship growth that already existed.
