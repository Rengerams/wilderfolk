# Save, rollback and migration edge defects — audit remediation (2026-11-11)

- Bug: a failed delta post could strand terrain overrides on the worker; profile writes escaped the delta revision; rollback snapshots shared dialogue-history containers; legacy tick timelines were only partly scaled; immigration and hunting used the footprint corner and mis-reported rewards; a legacy rival departure skipped all death bookkeeping.
- Status: resolved
- Severity: medium (W-126), medium (W-127), low-medium (W-128/W-129/W-138/W-139/W-146)
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.5 (rollback/migration edges, round 2)
- Area: terrain transport, rollback prep, save migration, immigration, hunting, rival retirement
- Owner module: `terrain/terrainGrid.ts`, `personalMarks.ts`, `simWorker/simPrep.ts`, `saveLoad.ts`, `dailyPopulation.ts`, `humanHuntingBehavior.ts`, `rivalEvents.ts`

## Status history
- 2026-11-11 — resolved: at-least-once terrain delivery, revision-bumped profile marks, deep-copied dialogue history, complete tick-timer scaling, doorway arrivals, accepted-amount hunt rewards, full rival departure bookkeeping. W-137/W-147 verified already fixed.

## Observed behavior

- **W-126** `extractSimTickDelta` drained the tile queue before the delta was posted; if packing/posting threw, the world rolled back but `worldMap` did not, and the replica never received the tiles — permanent display/walkability divergence until reload.
- **W-127** A granted mark could be hidden from the replica for up to 240 ticks because `stripUnchangedProfile` only ships profile fields whose revision changed.
- **W-128** The rollback snapshot shallow-copied entities whose `dialogueRecentScenes`/`dialogueRecentLines` maps the dialogue owner mutates in place, so a rolled-back tick's cooldown survived and suppressed unseen lines.
- **W-129** `migrateTickTimeline` scaled pregnancy/job timers but not `severeHungerTicks`, `combatTicks`, `chatTicks`, `schoolTicksToday`, work-attendance ticks or `huntingSpotInReachTick`.
- **W-138** Immigration spawned the newcomer at centre + half footprint, so the pin/arrival landed half a footprint south-east of the door.
- **W-139** Free-roam hunting floated the nominal food gain while the ledger recorded the storage-accepted amount, and the kill call omitted the death owner's state.
- **W-146** The legacy rival-roster kill path only set `alive = false` — no unindex, no departure marker, no splice.
- **W-137/W-147** Verified already correct in the tree (placed-count herd memory; configured Wildkin spawn energy).

## Expected behavior

A committed delta must carry every mutation it drained; a rollback must restore the exact pre-tick behaviour including derived caches; legacy timers must keep their meaning; arrivals and rewards must match the authoritative state.

## Reproduction steps

1. Throw during delta pack/post after a terrain patch: pre-fix the retried delta carried no `terrainPatches`.
2. Grant a raid-survival mark and inspect the next delta: pre-fix the mark was absent.
3. Record a dialogue cooldown in a tick, force a rollback, replay: pre-fix the line stayed suppressed.
4. Load a 72-tick/day save and compare the timer fields: pre-fix several were unscaled.

## Evidence

Audit traces (`simDelta.ts:474`, `terrainGrid.ts:323-327`, `personalMarks.ts:85`, `simPrep.ts:149-175`, `saveLoad.ts:648-663`, `dailyPopulation.ts:115-116`, `humanHuntingBehavior.ts:126/158-177`, `rivalEvents.ts:119`); pre-fix observations recorded by the regressions (missing patches, missing mark, `scene_a → scene_b`, pin 580/422 vs 560/434, "+52" floated while 7 stored).

## Root cause

A drain-before-commit ordering, a profile writer that bypassed the revision contract, a shallow rollback copy of mutable containers, an incomplete migration table, and two callers that used pre-centre geometry or nominal amounts.

## Fix / proposed fix

- `takeTerrainPatches` retains the last drained batch and re-offers it on the next extraction (idempotent, retires after the second delta), so a failed post cannot strand the replica.
- `grantMark` (and the award wrappers) write through `entityRevision.bumpRevision(..., PROFILE_REVISION)`; `settlerTraits.establishCitizenIdentity` bumps when it sets a genome.
- Prep deep-copies the two dialogue-history containers per entity.
- `migrateTickTimeline` scales every elapsed-tick counter now carried by entities, needs and buildings.
- Immigration uses `buildingAccessPoint(home)` for the arrival point and label.
- Hunting floats the accepted amount and calls `markWildlifeDead(ctx, prey, undefined, state.tick, state)`; the year death tally credits the kill.
- `departRivalEntity` is the shared departure owner (alive=false, departedAlive, unindex) used by both the orphan pruner and the legacy roster path, which now also splices.

## Save/migration impact

Legacy saves keep their data; the migration now scales the additional timer fields. A 72-tick/day round trip is covered by `tests/saveLoad.tickResolution.test.ts`.

## Verification result

- 10 directly touched files: **60 passed**; broader 22-file save/rollback/worker/rival/hunt set: **181 passed**.
- Each regression was observed failing on the pre-fix code before the change (agent-recorded).
- `npx tsc -p tsconfig.app.json --noEmit`: **PASS**; oxlint: **0**; cycle gate: **PASS**.
- `tsconfig.vitest.json` was blocked only by another agent's in-progress test file at the time; re-run during integration.
