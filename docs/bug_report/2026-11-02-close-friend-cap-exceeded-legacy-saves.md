# Close-friend cap exceeded (legacy saves and a unilateral over-cap bond)

- Bug: settlers can hold more than `MAX_CLOSE_FRIENDS_PER_SETTLER` (6) close friends — the supplied 2,200-settler save has 131 settlers over the cap, the worst at 31 — and new friendships still appear to accumulate past it.
- Status: resolved
- Severity: medium (social stamina, elections and the yearly review read the close-friend count)
- Date discovered: 2026-11-02
- Version/build: `main` at `583bbfd0` (V.0.6.5.2)
- Reporter: player report ("capped at 6 but still making more friends")
- Area: social simulation and save loading
- Owner module: `game/relationships.ts` (cap rule and reconciliation); load path `game/saveLoad.ts`
- Related PR/commit: same change

## Status history
- 2026-11-02 — open: counted the supplied save; 131 settlers over the cap (max 31), all mutable data present. A probe with the full daily reconcile clamps it to 6, but a load never reconciled and the unilateral-bond keep could leave seven.
- 2026-11-02 — resolved: load now trims over-cap bonds to the strongest six; the off-by-one and the per-bond rescan are fixed; regressions added.

## Observed behavior

A long-running colony can show settlers with more than six close friends. In the supplied save, 131 of 2,027 settlers exceed the cap and the worst holds 31 mutual close friendships. The yearly review counts these as close friendships, and the daily stamina and election modifiers read the same count.

## Expected behavior

At most six close friendships per settler. A legacy save is repaired when it is loaded, not only after the first social day, and a seventh unilateral bond cannot survive reconciliation.

## Reproduction steps

1. Load `wilderfolk-New-Frontier-Y4-D64.json` (or any save played across versions that predate the cap).
2. Count `friendships` entries with a score at or above the close threshold. Observed: up to 31 per settler.
3. On the build before this fix, loading kept the excess until the daily social pass, and a settler with six mutual plus one unilateral close bond kept all seven.

Deterministic reproduction: `tests/relationships.closeFriendCap.test.ts` builds twelve mutual close bonds, saves, loads, and asserts every settler ends at six or fewer.

## Evidence

The save's entity friendship maps hold 4.8 MB of scores; counting close entries per human gave `maxClose 31`, `over6 131`. Calling `reconcileCloseFriendships` on the loaded people reduced the worst settler from 31 to 6 and left no settler over the cap, which isolates the defect to when reconciliation runs and to its unilateral keep rule, not to the bump path.

## Root cause

The cap postdates long-running saves and was only enforced while a bond crossed the threshold. Excess legacy bonds were trimmed by the daily pass's mutual-priority reconciliation, which (a) does not run on load, and (b) kept a unilateral bond whenever the settler's live close count was at most six, so six mutual plus one unilateral bond left seven. The keep test also recomputed the full count for every bond, making a full-colony reconciliation quadratic in the friendship web.

## Fix / proposed fix

`clampCloseFriendships` trims each settler to its six strongest close bonds during `loadGameFromParsed` (before the first social day). The daily reconciliation's unilateral keep now requires a count strictly below the cap, and it tracks one running close count per settler instead of rescanning per bond.

## Save/migration impact

Only friendship scores are demoted to just below the close threshold; nothing is deleted and the acquaintance history survives. The clamp is idempotent, so re-saving is stable.

## Verification result

- `npx vitest run tests/relationships.closeFriendCap.test.ts` — 3 tests PASS (crafted over-cap clamp, over-cap save roundtrip, 400-day social growth guard).
- Supplied save after the fix: worst close-friend count 31 → 6; settlers over six 131 → 0; population 2,009 unchanged.
- Load cost A/B on the supplied save: 1,533 ms without the clamp, 1,692–1,881 ms with it (repeated runs under load), i.e. +0.15–0.35 s for a once-per-load repair.
- `npm run test:types`, `npm run lint`, `npm run build`, docs/comment and owner checks — PASS.
