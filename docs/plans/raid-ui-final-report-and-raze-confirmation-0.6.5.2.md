# Raid UI completion — final settlement report and raze confirmation (v0.6.5.2)

**Status:** implementation plan; **not yet implemented**  
**Date:** 28 October 2026  
**Scope:** the two remaining raid UI features formerly numbered **2** (expanded end-of-settlement screen) and **3** (clearer raze confirmation). **No deeper siege simulation** is part of this work.

## 1. Current behavior and source of truth

- `src/components/WarfareStatus.tsx`: displays `raidRecovery.status === 'destroyed'`, village name, year/day, terminal reason, losses, survivors, named fallen, and final-save/Chronicle/new-village/main-menu actions. It does **not** display the last leader, completed milestones or a selected Chronicle recap.
- `src/App.tsx`: displays the battle report and persistent pending victory decision. Raze already has an extra `Confirm raze` / `Cancel` step, but the confirmation only asks `Raze <name>?`.
- `src/game/frontierCombat.ts`: `resolveRaidVictory` is the sole authority for mercy, one-time tribute and raze. The existing raze action removes a rival, its events and associated entities, and updates witnessed diplomatic relationships. `persistBattleAftermath` records `raidBattleReports[].leaderId`. Do not reproduce this logic in UI.
- `src/game/raidAftermath.ts`: `beginRaidRecovery` owns the terminal state, and `WorldState.raidRecovery` persists its `raidId`, `rivalName`, `reason` and recovery/terminal fields.
- `src/game/valleyChronicle.ts`: `VALLEY_CHAPTERS` defines milestones; `WorldState.chronicleChapters` records completed chapter IDs.
- `src/game/legacyGoals.ts`: `collectLegacyGoals(state)` is the **existing** read-only projection of goals from history and stats. There is no reason to create another achievement system.
- `WorldState.eventLog` and `src/components/tabPanels/ValleyChroniclePanel.tsx` provide the existing Chronicle story sources and presentation conventions.
- `tests/warfare.lifecycle.test.ts` covers many relevant lifecycle/save cases; `scripts/autoplay_playwright_probe.py` exercises the existing UI and raze cancellation.

## 2. Feature 2 — expanded end-of-settlement screen

### Expected result

After a genuine terminal defeat, `Settlement fallen` remains a **read-only, non-resumable** summary and contains:

1. **Village identity and duration:** existing village name, year/day, attacking settlement, reason and final outcome.
2. **Final leader:** name (if recorded) and identity of the leader in office for the final battle, not a successor elected later. If old saves do not contain a resolvable identity, show `Last leader not recorded` rather than inventing a name.
3. **Human consequences:** existing player casualties and surviving population, named player fallen; retain separate opposing-side numbers if using the persisted battle report. Never imply an abstract loss is a named person.
4. **Milestones / achievements:** only *completed* existing Valley Chronicle chapters and achieved Legacy Goals. Show their canonical names, and where appropriate the recorded evidence. If none are available, say `No recorded milestones`. Do not introduce badges, rewards or a new gameplay progression system.
5. **Chronicle highlights:** a small, stable list (e.g. up to five) of noteworthy recorded events from the existing Chronicle; prefer milestones, leadership transitions, raids and major colony events. Preserve ordering and event identity; do not infer a story that is absent in the save. Provide the existing `View / export Chronicle` action for the full available record.
6. **Actions:** retain `Export final save`, `View / export Chronicle`, `Export & start new village`, and `Return to main menu`. Existing save files must remain untouched; there is no functional `Continue`.

### Minimal implementation approach

1. Read the existing battle report by `raidRecovery.raidId` and resolve its `leaderId` using the authoritative living/deceased records. **Important:** regular tick cleanup may remove dead entities. Determine whether the original leader can always be recovered from the genealogy or saved battle data *before* relying on a direct `entities.find`.
2. Prefer a small, **pure read-only view-model selector** in the existing owning UI/domain layer instead of repeated full-world scans inside `WarfareStatus`. Use `VALLEY_CHAPTERS`, `collectLegacyGoals` and existing event metadata for labels and chronology.
3. If the leader's name or completed-status evidence cannot reliably be reconstructed after destruction, add a **minimal optional terminal-report snapshot** at the existing `beginRaidRecovery` transition (not during React rendering). Update `gameTypes.ts`, `saveSchema.ts`, save/load normalization and worker delta/prep owners only for fields genuinely required. Capture once per terminal `raidId` and preserve the first snapshot on reload/repeated outcome; never let loading recompute historical results.
4. Check that Legacy Goals currently derived from changing resources cannot be marked unachieved *because the terminal raid destroyed the resources*. If needed, snapshot only the achieved goal IDs/evidence at terminal resolution; avoid creating redundant mutable achievement state during normal play.
5. Select highlights from existing saved `eventLog` and completed `chronicleChapters`; remember that logs are bounded. Render `No recorded Chronicle highlights` if no source events remain. Do not promise a complete lifetime record if older events are pruned.
6. Expand only the existing terminal branch of `WarfareStatus.tsx`. Use semantic headings, compact sections, readable overflow/scroll and a responsive layout; buttons must remain keyboard-reachable and visually distinct. No separate terminal simulation or new game-over state.

### Acceptance criteria

- [ ] Terminal screen shows correct final leader, achievements/chapters and actual saved Chronicle highlights when available, and explicit neutral fallbacks when unavailable.
- [ ] Leader who died in the battle is not replaced in the report by the next officeholder; deleted dead entities and old saves do not crash.
- [ ] Only achieved, existing milestones are shown; the attack cannot erase previously achieved milestones from the report.
- [ ] Reopening, exporting, saving or reloading the screen does not grant rewards or rerun a raid.
- [ ] Simulation remains terminal and the four existing exit/export actions still work.

## 3. Feature 3 — informative but neutral raze confirmation

### Expected result

Retain the existing deliberate **two-step** path `Raze settlement` -> `Confirm raze`. Extend the second confirmation to show:

- **Target:** the rival settlement's actual saved name and its remaining population from `pendingRaidVictories`.
- **Finality:** razing removes that rival from the strategic world and cancels its remaining settlement-related events. It cannot be restored by canceling the dialog after confirmation; the action is permanent **in the current save**.
- **People:** currently surviving rival residents are recorded as displaced/refugees by the outcome; do not claim that all are executed.
- **Diplomacy:** settlements close enough to witness the event can change their relationships, fear/grievance and future behavior. This is **contextual**; do not predict fixed numerical reputation losses or label the decision morally right/wrong.
- **Controls:** `Confirm raze` and `Cancel`, both with descriptive labels. Cancel returns to the unchanged pending choice and causes no state mutation.

Suggested neutral English copy (final wording may follow established game localization):

> **Raze <settlement>?**  
> This permanently removes the settlement from this save and cancels its pending activities. Its <N> remaining inhabitants will be recorded as displaced people. Nearby settlements that witness the event may change their attitude and future actions.  
> **Confirm raze** / **Cancel**

### Minimal implementation approach

1. In `src/App.tsx`, enrich only the existing `razeConfirmationId === pending.raidId` block. Use the already persisted `pending.rivalName` and `pending.enemySurvivors`; do not duplicate rules for selecting witnesses or calculating civic merit.
2. Keep the existing worker command `{ proto: 1, op: 'resolveRaidVictory', eventId: pending.raidId, choiceId: 'raze' }` and `resolveRaidVictory` as the **only mutation path**. Reuse the pending-raid guard; do not infer fate from the label or call another action.
3. Ensure a canceled confirmation performs no action, is re-openable, and does not accidentally persist confirmation UI state. Prevent misleading confirmation after a pending decision disappears or changes.
4. Keep modal text factual and accessible at narrow widths. Do not add a forced moral warning or an unimplemented occupation/vassalage option.

### Acceptance criteria

- [ ] The second confirmation visibly explains permanent removal, displacement and contextual diplomatic consequences.
- [ ] The target name and survivor count match the current pending victory; no fabricated casualties, rewards or precise diplomatic predictions.
- [ ] Cancel leaves the rival, troops, resources, pending decision, diplomacy memory and save state unchanged.
- [ ] A confirmed raze is applied exactly once through the existing worker-authoritative path; repeated confirmation or reload cannot grant rewards twice.
- [ ] Mercy and one-time tribute continue to work unchanged.

## 4. Implementation order and review boundaries

**PR A — terminal report (feature 2):** add a read-only summary using canonical Chronicle/Legacy sources; add the minimum terminal snapshot/migration code **only if necessary** to preserve facts that can otherwise disappear. Verify that terminal screens remain usable after reload.

**PR B — raze confirmation (feature 3):** update the existing confirmation text and, if needed, the smallest local interaction guard. No simulation balance changes.

**Tests:** extend `tests/warfare.lifecycle.test.ts` with any newly stored terminal-report fields and reload scenarios; add component/DOM tests where the repository's existing harness supports them; use the existing Playwright raid flow for terminal and confirmation/cancel/confirm checks. Validate old saves without the new optional fields, end-state reloads, leader death/cleanup, no completed goals, bounded Chronicle history and rapid repeated clicks. Run the repository's relevant tests, typecheck and build before marking these items complete.

**Explicitly out of scope:** deeper siege logic, wall/gate breach damage models, combat balance, active projectiles, new prisoners/diplomacy rules, or any second owner of combat or achievement state.

## 5. Documentation upon implementation

- Update `roadmap_V.0.6.5.2.md` to `[x]` **only** for the feature actually merged into `main`. Keep the roadmap free of these steps and test details.
- Log the implementation changes in `CHANGELOG.md` and update `OWNERSHIP_OVERVIEW.md` only if new owned functions or state owners are added.
