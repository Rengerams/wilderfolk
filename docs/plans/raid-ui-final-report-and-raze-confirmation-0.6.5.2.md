# Wilderfolk 0.6.5.2 — raid UI completion: executable implementation plan

**Date:** 28 October 2026  
**Status:** PLAN ONLY — neither UI feature is implemented by this document.  
**Scope:** (2) improve the final-village report; (3) explain the already-existing "Raze settlement" confirmation. Keep the simulation open-ended: the destruction of one village ends **that save's active settlement**, not the sandbox or game as a whole. **Exclude** any new siege/breach simulation, achievements, Legacy Goals, new diplomacy calculations or new tactical combat.

## 0. Bot execution contract

1. Read `AGENTS.md`, `docs/command.md` and `OWNERSHIP_OVERVIEW.md`; verify the actual shell environment, then inspect the latest code before editing. Do not assume this plan's line numbers are unchanged.
2. Implement in the **existing owners**. Avoid extra adapters, alias modules or duplicate selectors; search for equivalent helpers first.
3. The **ordinary** `WorldState.eventLog` is the canonical Chronicle. Raid-specific `raidBattleReports` are supplemental typed summaries, **not** the sole record of combat. Inspect `logEvent` call sites in `frontierCombat.ts`, `raidAftermath.ts` and `warPrisoners.ts`, and close any missing phase/fate entries using `logEvent` with correct `combatKind`/`combatStage`; do not duplicate entries already written.
4. Maintain `OWNERSHIP_OVERVIEW.md` **and** `src/game/simulation/decisionRegistry.ts` in every implementation change: real owning module, invocation/cadence, caller, field writes (read-only views: `writes: []`) and existing regression-test location. Update registry tests only if a legitimate new key is needed. Do not invent a new scheduler or second decision owner.
5. Record discovered **bugs** under `docs/bug_report/` following `docs/bug_report/readme.md` and register each in the **single** `docs/BUG_REPORTS/SUMMARY.md`; do not put bug tickets in the roadmap. If no bug was found, say so in the implementation report without a fake report.
6. Log noticeable changes in `CHANGELOG.md`. The root roadmap only tracks implemented vs. pending features: mark an item `[x]` **after the code is merged and accepted**, not because a plan/test exists.
7. Prefer two small reviewable PRs (report then confirmation) or one narrowly scoped PR if the owning UI/test surface overlaps. Do not change battle mathematics, diplomacy, resource accounting, or worker protocol without a proven need.

## 1. Verified present architecture

| Concern | Existing owner / persisted source | Implication |
|---|---|---|
| Village defeated/terminal | `src/game/raidAftermath.ts`: `beginRaidRecovery`, `tickRaidRecovery`; `WorldState.raidRecovery` | Terminal transition is one-time and immutable; never compute the report during every tick |
| Battle outcome | `src/game/frontierCombat.ts`: `persistBattleAftermath`, `resolveRaidVictory`; `raidBattleReports[]` | Existing report has `raidId`, `leaderId`, deaths, damaged structures and loot; no new battle result object |
| Final overlay | `src/components/WarfareStatus.tsx` | Current overlay has village name/year/day, losses, survivors, export/Chronicle/new village/menu |
| Rival fate dialog | `src/App.tsx`, the `razeConfirmationId === pending.raidId` branch | Second confirmation already exists, but copy only says "Raze <name>?" |
| Fate state | `WorldState.pendingRaidVictories[]` and `src/game/simWorker/commands.ts` | Keep the existing `resolveRaidVictory` worker action and pending-id guard |
| Canonical history | `WorldState.eventLog`, `src/game/eventLog.ts`, `src/game/EventLogPanel.tsx` | Normal Chronicle already has `combat` filter; all raid stages must be in it and survive save/worker transport |
| Historical chapters | `WorldState.chronicleChapters`, `src/game/valleyChronicle.ts` | Show previously reached chapters **as history only**, never a new reward, achievement tally or win condition |
| Deleted settlers | `WorldState.genealogyRegistry.people[String(id)]`, `src/game/genealogyRegistry.ts` | This may retain deceased leader names; use the stable `raidBattleReports[].leaderId`, not the current village leader |
| Save and worker transport | `saveSchema.ts`, `saveLoad.ts`, `simBuffers/simDelta.ts`, `simWorker/simPrep.ts` | All currently persist `raidRecovery`, `raidBattleReports`, `eventLog`, `chronicleChapters`; **no save version bump needed for a backward-compatible optional field** |

**Correctness risk A:** `beginRaidRecovery` can establish `raidRecovery.status === 'destroyed'` **before** `persistBattleAftermath` creates its battle report during the same resolution. Never require that report to exist at the instant of the terminal-state write. Build a minimal terminal snapshot only from facts available at that instant, then attach missing report-derived fields once, after the report is actually recorded, or derive from the persisted report at read-time.

**Correctness risk B:** deceased settlers may already have been removed from `entities`; a genealogy record can contain a name, but not necessarily the original surname formatting. If there is no trustworthy identity, render "Last leader not recorded". Never use the next leader as fallback.

**Correctness risk C:** `eventLog` is newest-first and capped at `EVENT_LOG_MAX_ENTRIES = 20000`. The report must not claim to show the colony's complete lifetime history if old entries have been trimmed.

## 2. Feature 2 — final settlement report

### 2.1 Display contract

Show a readable, scrollable `Settlement fallen` dialog with the following **existing** data, in this order:

1. `villageName`, year/day, attacker `raidRecovery.rivalName` and recorded defeat reason.
2. Last battle leader (name or explicit `Last leader not recorded`), taken by `raidId` from the original `raidBattleReports[].leaderId`, then from a trustworthy genealogy/entity record. A dead leader does not become the successor.
3. Losses, surviving villagers, named player fallen; optional enemy losses and material damage only when present in the relevant report. Respect the existing distinction between identifiable people and abstract counts.
4. A small **history** section: up to 5 real notable `eventLog` records, newest-first or chronological with a clearly consistent label; prefer major combat, leadership, deaths and milestone records. Exclude uninformative repeated chatter, and deduplicate by **event ID**, not guessed message text. State `No retained Chronicle highlights` if empty.
5. Previously reached `chronicleChapters` presented as historical chapter names from `VALLEY_CHAPTERS` (not `achievements`, not a completed/total score). Unknown IDs in old saves should be ignored for display but retained in persisted data.
6. Keep the four functioning buttons: `Export final save`, `View / export Chronicle`, `Export & start new village`, and `Return to main menu`. No `Continue` action; do not delete earlier saves.

Do **not** introduce Legacy Goals, medal counters, completion rewards or a final victory screen. These mechanics contradict the sandbox model.

### 2.2 Minimal state and data-flow design

**Default: zero additional persisted fields.** The existing `raidRecovery.raidId`, `raidBattleReports`, `genealogyRegistry`, `eventLog` and `chronicleChapters` should suffice. First write a regression fixture where the leader died, was removed from `entities`, and survives in `genealogyRegistry`. If this is reliable, derive the leader's display name from the report's `leaderId` and registry record.

If the regression demonstrates a **real historical-data gap**, add *only* an optional `terminalSummary?: { leaderId: number | null; leaderName?: string }` nested in `raidRecovery` (or an equivalent small type owned there). Do not snapshot all events, settlers, buildings, statistics or the entire world. Capture the original leader identity at the earliest **authoritative** point where it exists, not after dead-entity cleanup. A battle-start leader ID is already recorded as `leaderIdAtBattleStart` on raid events; a stable name can come from genealogy / the corresponding original person. Ensure the terminal snapshot remains tied to `raidId` and never overwrites an earlier terminal outcome.

For the UI projection, scan at most once per **report render** (or memoize on a reliable terminal-state identity). `eventLog` is a **mutated-in-place** array: do **not** use `useMemo([world.eventLog])` to cache a live report that can change invisibly. Instead, once the state is terminal and no further ticks run, compute the bounded highlights in a pure projection; either scan the retained log once (O(N), N≤20000) on overlay mount, or use an immutable terminal revision key. Avoid sorting/copying the full log on every frame.

### 2.3 Save migration — exact decision table

**Case A: save has no `raidRecovery` (ordinary existing colony).**
- Keep it absent. Do not create a terminal screen, status field, snapshot or Chronicle entries. Continue normal play.

**Case B: old save has `raidRecovery.status === 'recovering'`.**
- Keep all current targets, repairs, timer, stored raid ID and current simulation state. Do not create a `terminalSummary` and do not re-run any historic battle.
- Recovery may complete through the existing owner only.

**Case C: old save has `raidRecovery.status === 'destroyed'` but no new optional snapshot.**
- Continue to load **without rejection**. The loader already forces `paused = true` and the game tick guard makes destruction terminal; preserve both.
- Resolve old `raidBattleReports`, genealogy, existing event log and chapters **read-only** to fill the UI.
- If identity is not trustworthy, show the explicit fallback. Do **not** backfill a fabricated leader name, replay a fight, issue a new merit award or append duplicate event entries.
- If a migration snapshot is genuinely required, build it only from already persisted facts and set it at most once; report which facts were absent. Do not record a new `appliedSaveMigrations` marker for a purely derived projection.

**Case D: new save has an optional valid `terminalSummary`.**
- Retain it unchanged through save→load→save, simulation worker deltas and rollback prep. Validate that `leaderId` is `null` or a finite safe persisted ID, and `leaderName` (if present) is a bounded string. Reject malformed provided snapshots rather than interpreting invalid values as credible history.
- Never allow a stale `terminalSummary` belonging to a different `raidId` to override the actual terminal outcome.

**Case E: game version or container invalid.**
- Keep the existing compatible-version gate (currently accepts `GAME_VERSION` and `0.6.5.0`); no broad version changes, no silent coercion of malformed saves, no compatibility shims in a second parser.

**Files to modify only if a real optional snapshot is added:**
1. `src/game/gameTypes.ts` — add the optional nested, bounded field.
2. `src/game/raidAftermath.ts` (or real combat-start owner if the identity must be caught earlier) — write it once upon actual terminal transition.
3. `src/game/saveLoad.ts` — extend existing `findInvalidWarfareState` validation; keep it optional in the restore and default paths, and do not alter `COMPATIBLE_SAVE_VERSIONS`.
4. `src/game/saveSchema.ts` — `raidRecovery` is already a top-level persisted key: **do not add redundant top-level keys**; update only if a nested-field allowlist actually requires it.
5. `src/game/simBuffers/simDelta.ts` and `src/game/simWorker/simPrep.ts` already clone/transport the **whole `raidRecovery` object**. Verify the new optional nested data passes through unchanged; do not duplicate it in an additional worker channel.
6. `tests/warfare.lifecycle.test.ts` / save+worker tests — verify old/new cases, rollback, and no duplicate mutation.

**Removing Legacy Goals requires no save migration**: the old `collectLegacyGoals` projection was calculated on demand and had no dedicated save field. Preserve normal `eventLog`, `chronicleChapters`, yearly stats and genealogy.

### 2.4 Performance and correctness constraints

- Never `structuredClone(world)` solely to build the UI; never add per-tick scans just for a terminal report.
- Select at most 5 log highlights by a **bounded single pass**, O(N) time / O(5) selection space, with N≤20,000. Do not `sort()` the entire log; it is already newest-first.
- Chapter rendering uses the fixed existing chapter definitions; use a `Set` of saved IDs, not nested scans of the whole world.
- All derived data is read-only; no extra state writes from React, no reward unlocks and no new logging during render.
- Overlays must support smaller screens, scrolling and keyboard navigation; do not remount heavy world UI or trigger a 20,000-row DOM render.
- Prefer a small, pure function with a verified single owner. Register the function in `OWNERSHIP_OVERVIEW.md`; register any new decision in `decisionRegistry.ts` with its actual write set (read-only projections use `writes: []`).
- Avoid copying/reformatting huge `eventLog` or historical statistics into an additional persisted summary.

### 2.5 Tests: explicit bot checklist

- [ ] `destroyed`: correct survivor count, enemy name, recorded casualties, retained chapters and up to five retained actual history events.
- [ ] Original leader died, is removed from live entities, and exists in genealogy — render the original identity, not successor; missing genealogy/report yields fallback.
- [ ] No chapters/events / truncated log — safe fallback, no fake achievements.
- [ ] Reopen overlay, export, reload, export again — no duplicate Chronicle, rewards, casualties or merit; original save never deleted.
- [ ] `recovering` is not terminal; ordinary saves never render the terminal dialog.
- [ ] If optional snapshot used: five migration cases above + worker delta / simPrep rollback / validation of malformed nested data.
- [ ] Run the narrow existing combat/save/worker tests, typecheck and build; report commands and actual PASS/FAIL/NOT RUN honestly.

## 3. Feature 3 — raze confirmation copy and interaction

### 3.1 Text and data contract

In `src/App.tsx`, the existing `razeConfirmationId === pending.raidId` branch must identify the current `pending.rivalName` and `pending.enemySurvivors` and say:

> **Raze <settlement>?**  
> This removes the rival settlement from the current saved world and cancels its pending activities. Its <N> surviving inhabitants are recorded as displaced, **not killed by this decision**. Nearby witnesses can change their diplomatic attitude and future behavior.  
> **Confirm raze** / **Cancel**

Factual, neutral copy only. No moral approval/disapproval, promised numeric reputation/merit points, automatic victory claim or invented choice. Keep the existing `Withdraw` and `Demand one-time tribute` routes untouched.

### 3.2 Smallest correct code change

- Change **only** the current confirmation block and any strictly necessary UI guard. Reuse `razeConfirmationId` and `pendingRaidVictories`; confirmation should be displayed only while a matching pending raid exists.
- Clicking `Cancel` clears UI-local confirmation state and changes **nothing** in `WorldState`, diplomacy, resources, prisoners, armies, Chronicle or pending decision.
- Clicking `Confirm raze` dispatches the **existing** worker command `{proto: 1, op: 'resolveRaidVictory', eventId: pending.raidId, choiceId: 'raze'}`. Do not call `resolveRaidVictory` in React or invent a separate command.
- Keep authoritative once-only checks inside `resolveRaidVictory`, which already consumes `pendingRaidVictories` and records the outcome in the normal `eventLog`.
- An in-flight double click must not produce two effectful command dispatches. Prefer disabling the confirmation immediately on the first dispatch if the surrounding UI offers a safe existing pattern; the domain-side missing-pending guard remains authoritative.
- No new save field is required for a confirmation dialog; confirmation state is **not persisted** and is not restored after reload.

### 3.3 Tests and acceptance

- [ ] Name and remaining population come from the real pending record; text explains one-time permanent removal, displaced survivors and situational witnesses.
- [ ] Cancel/reopen does not alter the world; old-saved pending decisions still work.
- [ ] Confirm performs exactly one authoritative fate transition; retry, reload or rapid input cannot apply it twice.
- [ ] Razing is represented in the normal Chronicle, not solely in the battle report. Names and combat metadata are correct where the owner writes them.
- [ ] Mercy and tribute work identically before and after this change.

## 4. Delivery gate and file registration

| Owner | Concrete change |
|---|---|
| `WarfareStatus.tsx` + a single existing read-only domain/UI selector if necessary | Terminal report view and bounded event/chapter projection |
| `App.tsx` | Neutral second raze confirmation |
| `frontierCombat.ts`, `raidAftermath.ts`, `warPrisoners.ts`, `eventLog.ts` | Only fill **proven** missing normal-Chronicle raid events; preserve one authoritative log |
| `gameTypes.ts`, `saveLoad.ts`, `saveSchema.ts`, sim delta/prep owners | Only if the optional terminal identity snapshot has demonstrated necessity; use the migration table above |
| `OWNERSHIP_OVERVIEW.md` **and** `simulation/decisionRegistry.ts` | Always reconcile the actual functions, their owners, cadences, callers, writes and test references |
| `docs/bug_report/`, `docs/BUG_REPORTS/SUMMARY.md` | Record and index each **real** newly discovered bug using repository protocol; never manufacture bug entries |
| `CHANGELOG.md` | Small, factual implementation entry |
| `roadmap_V.0.6.5.2.md` | Check off only merged/accepted features 2 and 3; no implementation steps inside roadmap |

**Definition of done:** the two UI improvements display accurate, persisted facts, preserve old saves without a version bump or simulation replay, avoid hot-path performance costs, maintain the ordinary combat Chronicle, and introduce no gameplay end goal. Required tests and registries must agree with the actual implementation.