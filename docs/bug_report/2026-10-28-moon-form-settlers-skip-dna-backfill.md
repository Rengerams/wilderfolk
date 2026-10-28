# A settler saved in Moon Howler form never receives legacy DNA

- Bug: `backfillLegacySettlerDNA` skipped every entity whose type was not `Human`, so a cursed settler saved while transformed kept no DNA at all — before and after reverting.
- Status: resolved
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: 0.6.5.1 sources on branch `codebot-tasks` at `971b23c6` (personality/career 0.6.5.2, PR #90)
- Reporter: independent review of PR #90 (save-migration finding)
- Area: save/load migration, Moon Howler form
- Owner module: `src/game/saveLoad.ts` — `backfillLegacySettlerDNA`
- Related PR/commit: PR #90, fixed on the same branch

## Status history
- 2026-10-28 — open: review noted the type filter against the plan's requirement that old saves gain the new behaviour on load, including the Moon Howler form case.
- 2026-10-28 — resolved: the fill now covers a cursed werewolf, and `tests/personality.legacyDNA.test.ts` loads a legacy payload whose first settler is saved in moon form.

## Observed behavior
The backfill iterated `world.entities` and continued on `entity.type !== EntityType.Human`. A player settler transformed by the curse is stored as `EntityType.Werewolf` with `moonHowlerCursed`, so that person was skipped: on load they had no `traits`, the trait evaluator stayed neutral for them, and `revertToHumanForm` restored a human with no DNA.

Legacy saves are exactly the case that matters here, because `migrateLegacyMoonHowler` runs *after* the backfill and can flip a stored werewolf back to `Human` for the rest of the load — too late for a type-filtered pass.

## Expected behavior
Every living settler gains canonical DNA on load regardless of the body the save stored them in (plan §1.1: old saves must acquire the new behaviour automatically; §1.1 item 7 names the Moon Howler form explicitly). Saved valid DNA is still never rerolled, and the fill still draws no live RNG.

## Reproduction steps
1. Take a real payload from `buildSaveData`, delete `traits` from every human, and mark the first settler `type: EntityType.Werewolf` (the pre-DNA layout of a cursed settler).
2. `loadGameFromParsedOutcome(payload)` and read that settler.
3. On `971b23c6` `traits` is `undefined` for that settler while every other settler is filled.

## Evidence
- `src/game/saveLoad.ts`: `if (entity.type !== EntityType.Human || !entity.alive) continue;`.
- `src/game/moonHowler.ts`: `isActiveMoonHowler` is `Werewolf && moonHowlerCursed`; `migrateLegacyMoonHowler` runs after `backfillLegacySettlerDNA` in `loadGameFromParsedOutcome`.
- The new case `gives a settler saved in moon form its DNA too` fails on that code and passes after the fix.

## Root cause
The fill was written against the common case (`Human`) and did not account for the one other entity type a living settler can legitimately be saved as. `EntityType.Werewolf` is only ever a transformed settler — wild wolves are `EntityType.Wolf` — so the type test was narrower than "living settler".

## Fix / proposed fix
The pass now accepts `Human` and `Werewolf` and still requires `alive`. The roll stays `rollLegacySettlerTraits(colonySeed, entity.id, gender)`, so the derived set is stable across load, save and a later revert, and no live stream is drawn from.

## Save/migration impact
Only the in-memory derived result of an old save changes; nothing new is persisted and no schema field was added. A moon-form settler now carries the same DNA after reverting as they would have carried had they never transformed.

## Verification result
- `npx vitest run tests/personality.legacyDNA.test.ts` — **PASS** (9 tests); the new case **FAILS** with the fix reverted.
- Idempotent load, unchanged valid DNA, unchanged RNG snapshot and the transform/revert case in the same file — **PASS**.
- `npm run test:types` — **PASS**.
