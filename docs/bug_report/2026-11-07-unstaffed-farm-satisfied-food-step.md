# An unstaffed farm satisfied the auto-player's food step

- Bug: The auto-player's "does the colony already have food?" predicate counted a completed farm by type alone, so a farm with no crew — producing nothing — still told the ladder the colony was fed.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: V0.6.5.1 audit (COV-G-08)
- Reporter: full-audit coverage pass
- Area: gameplay / auto-player
- Owner module: `src/game/virtualPlayer.ts` (`hasProductiveFoodProducer`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit recorded the type-only predicate and its own "known gap" comment.
- 2026-11-07 — resolved: the predicate requires a crew or an unfinished site.

## Observed behavior
`hasFoodProducer` returned true for any completed Farm, Greenhouse, Fishing Spot or Hunting Spot regardless of `occupants`, and for any unfinished one regardless of progress.

## Expected behavior
A standing producer counts only with a crew; a site still under construction counts, so the ladder does not queue a duplicate. Rival buildings never count.

## Reproduction steps
1. Give the auto-player one completed Farm with `occupants: []`.
2. Ask the food ladder whether a producer exists — it answers yes.

## Evidence
- `tests/virtualPlayer.foodProducer.test.ts` — unstaffed farm false, staffed farm true, unfinished site true, rival false.

## Root cause
The predicate encoded "a building of this type exists", which the audit flagged as a known gap against the ladder's meaning.

## Fix / proposed fix
Renamed to `hasProductiveFoodProducer` and gated completed buildings on a non-empty crew. The staffing ladder's own `firstUnstaffedFoodProducer` path is unchanged.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/virtualPlayer.foodProducer.test.ts` — PASS (4/4).
- `npx vitest run virtualPlayer` — PASS as part of the wider regression set.
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
