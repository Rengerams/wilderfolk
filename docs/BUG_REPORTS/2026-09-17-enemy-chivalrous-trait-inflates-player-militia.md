# A rival's 'chivalrous' trait inflated the player's militia — and the label overclaimed

- Bug: the chivalrous militia bonus filtered `traits.includes('chivalrous')` without `isPlayerHuman`, so a **rival, visitor or caravan member** carrying the trait raised the player's `militiaStrength` — the number `resolveDefenseRatio` turns into a raid outcome; the same line labelled the bonus `(N × 8 %)` while the arithmetic added a single flat 8 %
- Status: resolved — the owner question in "Open question" below is still open
- Date discovered: 2026-09-16 (2026-09-16 economy audit, finding H3)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: `docs/private/audits/2026-09-16/sim-economy-leadership-combat.md` H3 (agent A2), verified against the tree and fixed 2026-09-17
- Area: Truth (defense math) + UI (the breakdown label)
- Owner module: `src/game/militiaBalance.ts`
- Cadence: on-demand projection (panel + raid resolution)

## Status history

- 2026-09-16 — open (found by the economy audit; never filed, so it sat in the "live but unfiled" list)
- 2026-09-17 — verified against the tree and resolved, except the balance question recorded below

## Observed behavior

```ts
const chivalrous = entities.filter(
  (e) => e.type === EntityType.Human && e.alive && e.traits?.includes('chivalrous'),
).length;                                   // ← no isPlayerHuman, no !isJuvenile
if (chivalrous > 0) {
  const bonus = Math.round(rawTotal * 0.08); // ← flat, once, regardless of count
  rawTotal += bonus;
  lines.push(`+ ${bonus} chivalrous protector(s) (${chivalrous} × 8%)`); // ← claims per-protector
}
```

Two defects in five lines. The village-wide settler count ten lines above filters correctly
(`countAdultSettlers`: `e.alive && isPlayerHuman(e) && !e.isJuvenile`), so the file already held the
right predicate. The audit's repro (`tmp/audit-2026-09-16/chivalrous-leak.ts`) shows a rival or a
visitor alone moving the player's number from 100 to 108, and a child counting as a protector too.

## Expected behavior

Only the player's own adult settlers contribute; the breakdown line states the bonus the code
applies.

## Reproduction steps

1. Give a **rival** settler the `chivalrous` trait (or let one roll it).
2. Read the militia breakdown in the Frontier panel.
3. **Before the fix:** militia strength rises by 8 % and a "chivalrous protector" line appears.
4. **After the fix:** the number is unchanged; your own chivalrous adults still grant the bonus.

## Evidence

Static trace of the filter against `playerHuman.ts` (`isPlayerHuman` excludes `visitor`, `rival`,
`trade_caravan`), the file's own `countAdultSettlers` predicate, and the flat `0.08 × rawTotal`
arithmetic behind an `(N × 8 %)` label.

## Root cause

A filter that was written for a single-player-only entity list and then used on the full entity
list, plus a label written from the intent rather than from the expression. Neither was covered by
a test: `militiaStrength` had no test at all.

## Regression test

`tests/militiaBalance.chivalrous.test.ts` (3, on a fabricated 25-adult fixture so the 8 % bonus
rounds to a visible integer):

- a rival, a visitor and a caravan member with the trait each leave the strength unchanged, while
  the player's own chivalrous adult still raises it — the second half is what stops the test
  passing for the wrong reason;
- a chivalrous **child** does not act as a protector;
- the line reads `flat +8%` and no longer matches `× 8%`.

All three fail against the old code (reverted filter and label, 5/5 tests across this file and the
iron file failed, then the source was restored byte-identically — sha256 checked).

## Invariants checked

- `isPlayerHuman` also drops the now-redundant `e.type === EntityType.Human` check, so the
  `EntityType` import became unused and was removed (lint is 0 warnings / 0 errors).
- The fix does not change balance for a colony with only player settlers: the same flat 8 % applies.
- `resolveDefenseRatio` consumes `militiaStrength`, so this closes the leak into raid outcomes, not
  just the panel number.

## Open question for the owner (not guessed at)

The audit asked whether the intended value is **+8 % per chivalrous settler** (what the label always
claimed) or **a flat +8 % when any exists** (what the code always did). The label now states the
flat reading, so the code and the copy agree and nothing was silently rebalanced. If the
per-protector reading was intended, that is a balance change and its own decision — the fix here
would then be `rawTotal += Math.round(rawTotal * 0.08 * chivalrous)` with the label restored and a
measurement of the effect on the 360-day gate.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/militiaBalance.chivalrous.test.ts` — passed (3); failed (3) against the reverted code.
- `npx tsc -p tsconfig.vitest.json --noEmit` — passed.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- No test asserted the old label (checked: `tests/` mentions `chivalrous` only as a trait name in a
  set), so nothing was weakened to make this pass.

## Related commits or files

- `src/game/militiaBalance.ts` — the filter and the label
- `src/game/playerHuman.ts` — the predicate the file already imported and used elsewhere
- `tests/militiaBalance.chivalrous.test.ts` — the guard
- `docs/private/audits/2026-09-16/sim-economy-leadership-combat.md` — finding H3

## Fix

The filter is now `e.alive && isPlayerHuman(e) && !e.isJuvenile && e.traits?.includes('chivalrous')`
— the same shape as `countAdultSettlers` directly above it — and the line reads
`+ ${bonus} chivalrous (flat +8%, ${chivalrous} protector${chivalrous === 1 ? '' : 's'})`.
