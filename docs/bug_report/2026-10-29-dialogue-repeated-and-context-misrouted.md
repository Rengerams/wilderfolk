# Dialogue variants repeat while contextual scenes bypass their event requirements

- Bug: Ambient dialogue can repeatedly select the same authored variant and route pregnancy or family text to unsuitable participants.
- Status: investigating
- Severity: medium
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 development main at ef0c44d6
- Reporter: player, confirmed by source inspection
- Area: JSON dialogue routing and selection
- Owner module: `src/game/dialogueTrees.ts`
- Related branch: `fix/dialogue-context-and-variety-20261029`

## Status history
- 2026-10-29 — investigating: source trace confirmed fixed `treeId` choices for pregnancy/family/famine, unguarded pregnancy lines in `ambient.home`, and independent random rolls that permit immediate repetition. A correction and focused regressions were committed on the linked branch; CI has not yet verified them.

## Observed behavior
`contextualAmbientScene` fixed a pregnant mother's speech to `wf_pregnant_mother_waddle` without a partner and `wf_pregnant_kicking` with one. Family and famine branches also pinned one scene. `requestDialogue` used a fresh deterministic selection roll without considering the last selected tree. `needs.json` contained a pregnancy-specific `ambient.home` pair without a pregnancy guard. Nine uniquely written old needs alternatives in the misleadingly named `Elections.json` were not in the active bank.

## Expected behavior
All eligible variations in each authored event/mode pool should be selectable, voices should match real relationships and pregnancy state, and a settler should use other eligible variants before cycling back to the last one. Singleton ambient captions should not fire repeatedly every few ticks.

## Reproduction steps
1. Read the shipped `contextualAmbientScene` in `src/game/dialogueTrees.ts`.
2. Compare its fixed IDs to the fifteen `pregnancy.daily` scenes in `src/game/data/pregnancy.json` and the other `family.daily` / `famine.hunger` scenes.
3. Observe that the selector only prevents a speaker already in a session from talking, not selecting an immediately repeated scene.

## Evidence
`dialogueTrees.ts` at the inspected main commit; `src/game/data/pregnancy.json`, `src/game/data/Family.json`, `src/game/data/needs.json` and `src/game/data/Elections.json`.

## Root cause
Fixed scene IDs overrode event pools and the canonical random selector had no per-person scene history. The source file category and event key were not consistently aligned with pregnancy eligibility.

## Fix / proposed fix
Select context-aware pregnancy/family/famine pools by real participant roles, rotate eligible scene choices per resident, introduce a three-day singleton ambient cooldown, persist compact scene selection history, and make the nine distinct historical texts available in `needs.json`. Scripted outcome-specific exact IDs remain authoritative.

## Save/migration impact
The optional `Entity.dialogueRecentScenes` field is added to the existing entity persistence contract. Old saves have no history and begin cycling on their next successful dialogue. No existing save field is overwritten.

## Verification result
- Static inspection: code paths and authored scene inventory checked.
- Regression tests added: `tests/dialogue.variety.test.ts`, `tests/dialogue.workerSaveParity.test.ts` and updated dialogue routing/legacy audit tests.
- Full TypeScript, lint, build and CI: NOT RUN in the connector-only environment; verification pending on PR.
