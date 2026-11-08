# A settler dying in wolf form was counted as an animal death

- Bug: The per-tick death scan classified by the entity's visual type first, so a Moon Howler settler who died while transformed was tallied as wildlife, never as a human death.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 audit (SIM-05)
- Reporter: full-audit simulation review
- Area: simulation / death accounting
- Owner module: `src/game/stats.ts` (`tallyTickDeaths`), `src/game/gameTick.ts`
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: audit traced the `entity.type === EntityType.Human` test in the tick death scan.
- 2026-11-07 — resolved: classification moved to the ownership predicate before the type test.

## Observed behavior
A cursed settler transformed into a wolf keeps the `Werewolf` type for the duration of the form. When that settler died, the post-layer scan saw `type !== Human` and added the death to `deathsThisYear.animals`; `deathsThisYear.humans` and the yearly record stayed short by one.

## Expected behavior
Death accounting follows ownership, not the temporary visual form: the death is a player settler death. Trees and grass stay excluded, and a visitor or rival human is neither a settler nor an animal.

## Reproduction steps
1. Build a world with one cursed settler in wolf form (`type: Werewolf`, `moonHowlerCursed`, `moonHowlerSaved`).
2. Mark the entity dead and run the tick death tally.
3. Observe the animal counter rise instead of the human counter.

## Evidence
- `src/game/playerHuman.ts` — `isPlayerHumanShiftOwner` is the existing ownership predicate for a settler in wolf form.
- `tests/stats.deathAccounting.test.ts` — "counts a cursed settler dying in wolf form as a human, not an animal".

## Root cause
The scan ordered its type check before the ownership check, so the temporary form decided the accounting bucket.

## Fix / proposed fix
`tallyTickDeaths` (the single per-tick death owner) asks `isPlayerHumanShiftOwner` first, records the human death and its owner name, and excludes `Human`, `Tree` and `Grass` from the animal bucket.

## Save/migration impact
None.

## Verification result
- `npx vitest run tests/stats.deathAccounting.test.ts` — PASS (5/5).
- `npm run test:types`, `npm run lint`, `npm run build` — PASS.
