# A feud against a removed settler was never pruned when the survivor had the higher id

- **Bug:** the feud decay pass deletes the record of a counterpart who is gone, but that deletion sat **below** the "lower id takes responsibility" guard, so when the lower-id settler died or was removed, the surviving higher-id settler kept `feud_<deadId>` forever — never decayed, never deleted, and never able to log "settled their feud". The friendship pass that the code claims to mirror prunes for both sides
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 lifecycle/social audit, finding **F4** (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`); runtime-reproduced there (survivor #2 keeps `feuds = { feud_1: 30 }` after #1 is removed, while the symmetric friendship is pruned) and re-verified here
- **Area:** Truth (relationship state), with a small save/delta consequence (dangling links that only grow)
- **Owner module:** `src/game/relationships.ts` (`advanceSocialRelationships`, feud pass)
- **Cadence:** daily

## Status history

- 2026-09-16 — open (audit finding; the comment above the friendship pass explicitly claims it prunes "exactly as the feud pass above does")
- 2026-09-16 — resolved (missing-counterpart deletion hoisted above the lead-only guard; regression test added)

## Observed behavior

```ts
// src/game/relationships.ts (before)
if (p.id > otherId) continue;          // lead-only guard first …
const other = byId.get(otherId);
if (!other) { delete feuds[key]; continue; }   // … so this only ran for the lower id
```

A survivor with the higher id never reached the deletion: the entry stayed in its `feuds` map,
persisted by the save and shipped in the worker delta, and `activeFeudCount` would over-count it.

## Expected behavior

A counterpart who is gone is not an enemy any more, for either side: the record is pruned regardless
of id order, exactly as the friendship pass does. Decay and the once-per-pair energy drain stay
lead-only, which is what that guard is for.

## Reproduction steps

1. Before the fix: give survivors #1 and #2 a mutual feud (`startFeud`), then run
   `advanceSocialRelationships` with only #2 alive → `#2.feuds['feud_1']` is still 30.
2. `npx vitest run tests/relationships.feudCleanup.test.ts` — the higher-id case fails.

## Evidence

- `src/game/relationships.ts:139-156` — the guard above the missing-counterpart check.
- `src/game/relationships.ts:188-204` — the friendship pass, with its comment "A counterpart who is
  gone is not a friend any more, so prune the record here exactly as the feud pass above does".
- `src/game/relationships.ts:55-62` — `activeFeudCount`, which consumes the same map.

## Root cause

Ordering inside one loop: a `continue` that implements a de-duplication optimisation was placed above
the cleanup for a *different* concern (a vanished counterpart), so half the intended cleanup became
unreachable for one id ordering.

## Regression test

`tests/relationships.feudCleanup.test.ts` (3 tests):
- the surviving **higher** id prunes the removed counterpart's feud (fails before the fix);
- the surviving lower id still prunes it, as before;
- a live feud still decays by 0.4 symmetrically and drains energy once.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied. The change only removes records whose counterpart no longer exists, so no live
relationship value moves.

## Save/migration impact

None required. Existing saves may carry dangling `feud_<id>` entries for settlers who are already
gone; the next daily pass prunes them, and the field's shape and meaning are unchanged.

## Verification result

- `npx vitest run tests/relationships.feudCleanup.test.ts tests/relationships.sharedHomeFriendship.test.ts` — passed (6 tests).
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm test` / `npm run test:full-year` — passed (see the batch verification in `CHANGELOG.md`).

## Related commits or files

- `src/game/relationships.ts` — the missing-counterpart deletion is resolved before the lead-only guard
- `tests/relationships.feudCleanup.test.ts` — new

## Fix

`const other = byId.get(otherId)` and the `if (!other) { delete feuds[key]; continue; }` cleanup were
hoisted above `if (p.id > otherId) continue;`, so the prune applies to both sides while decay and the
energy drain stay lead-only. The friendship pass's comment is now true.
