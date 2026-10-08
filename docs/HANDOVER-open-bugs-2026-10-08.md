# Handover — open bugs at the end of 2026-10-08

Written at the end of a long session whose context was nearly exhausted. Everything **landed** is recorded in
`CHANGELOG.md`, the `BUG_REPORTS/SUMMARY.md` register and `OWNERSHIP_OVERVIEW.md`; this file exists only for what
was **in flight or unresolved**, so the next session starts from evidence instead of re-deriving it.

## 1. In flight when this was written (two agents, findings not yet returned)

- **Worker hang / "one place back" jitter.** Owner-observed symptom: movers step forward then snap one place
  back, repeatedly; it happens to **animals as well as settlers**, and it **continues while paused**.
  Root cause is believed to be upstream of the renderer. Console evidence the owner supplied:
  ```
  [SpeedDiag] speed=2x … fps=76-100 frameMs=10-13                     ← healthy
  [GameLoop] Worker silent 105837ms with 1 tick(s) in flight (threshold 10000ms, last measured tick latency 31ms)
  [GameLoop] Worker tick stalled — falling back to main-thread ticks
  [GameLoop] Sim worker recovered automatically
  [SpeedDiag] speed=10x … fps=4.3  frameMs=230.7 frameMax=489
  [SpeedDiag] speed=3x  … fps=1.4  frameMs=1033.3 frameMax=2533
  ```
  Hypothesis: the worker hung for ~106 s; the main-thread fallback then ran **while the worker's authoritative
  deltas still landed**, giving two writers of entity positions — which is the jitter, and why pausing does not
  stop it. The owner's display is **180 Hz** and every sample showed `hidden=0`, so the >60 fps readings are
  legitimate and neither vsync nor background throttling is involved — the post-fallback frame times are real.
  The question to answer first is **why the worker hung for 106 s** (not a slow tick: normal latency is 31 ms).
  Remove the fallback-then-delta overlap only after that.

- **Uniform terrain — "every preset looks the same" + "settlers walk over water".** Established facts:
  `App.tsx:1005` does `initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName })`,
  `MapSetupScreen` is a controlled component, and `tests/terrain.mapVariety.test.ts` **passes** — its stdout shows
  all ten presets with distinct biome mixes at seed 1234. So the preset reaches the generator and the generator
  honours it; the defect is in the **ground rendering**. Prime hypothesis: `bakeTerrainLayer`
  (`src/game/terrainLayer.ts`) floods the surface with grassland, then per tile either takes the atlas path
  (**dead** — see §4), takes `if (raise > 0) { reliefTiles.push(...); continue; }`, or calls `drawTerrainFill`,
  which **returns false and paints nothing** when `getSprite(path)` is null. A biome whose fill does not stamp
  therefore keeps the grass underlay: water renders as grass, and every preset converges on the same green field
  with only the dirt/rock fills showing. Next step is to **measure per-terrain-type stamping outcome** and the
  distribution of `reliefY`'s `raise` values by terrain type against the current elevation scale.

## 2. Failing tests (full suite: 3 failed / 1900 passed / 2 skipped)

```
× guards the unmount cleanup on the loop ref
× still detaches a settler from the building they actually work at
× raises exactly one card per jailed offender, and jails someone      (71 s — reads like a timeout)
```

The first is very likely caused by the save change in §3 (the unmount save is now gated on the `autoSave`
preference, and that test asserts the previous unconditional behaviour). The other two were not diagnosed.

## 3. Landed earlier the same day (verified; listed so they are not re-litigated)

Auto-assign is now the default for every workplace (`workforce.isManualStaffBuilding` and its
`MANUAL_STAFF_BUILDINGS` set are deleted; a per-building `staffingMode: 'manual'` still blocks the auto pass) ·
the 30 s autosave is gone and a manual save always exports a JSON file with the toggle meaning "Save on exit" ·
toasts are no longer written into a save · the build catalogue reads the cost owner and disables an unaffordable
tile with the shortfall named · the title screen leads with the hook · hotel and hospital inspectors gained
rosters (hospital with the reason for care) · a hospital takes five doctors · `scripts/archive/**` deleted ·
the `mountain.jpg` fill path repointed to the shipped PNG.

Two regressions were found and fixed in the process: `gameTick.ts:312` dereferenced
`lifetimeStats.largestPopulation` unguarded (committed in `1fc65c3`; **17 test fixtures** use the
`lifetimeStats: {}` idiom, so every tick-based test crashed), and `clampSpeechBubbleTailY` subtracted its 3 px
gap unconditionally.

## 4. Misdiagnoses — already ruled out, do not re-walk

- **The terrain atlas is dead code, not a bug.** `/sprites/tileset_grass.png` is never preloaded
  (`preloadAllSprites` does not list it; `preloadRenderer` is a no-op returning `Promise.resolve()`), and
  `getSprite` is a pure cache read — so `terrainAtlasReady()` is always false and `atlasPick` is always null.
  `atlasFamily` covers only grass/forest/dark-forest/riverbank/desert + the three water types, so hills, mountains,
  rocky, beach and snow **always** fall through to the legacy fill table. The whole `terrainAtlas.ts` path is
  unreachable at runtime **except `reliefY`, which is live** (`terrainLayer.ts:471`) — any removal must be surgical.
  The owner has approved removing the dead path; it was in flight.
- **The mountain asset was never a repo bug.** `public/sprites/terrain/mountain.jpg` is tracked and was
  byte-identical to HEAD; the *working tree* had drifted (tracked `.jpg` missing, an untracked `.png` with the same
  bytes in its place). The owner has since re-exported a genuine PNG at `terrain/mountain.png`, and the three
  references now point at it.
- **The intro was never missing.** It was gated on a persisted `wilderfolk-intro-seen` flag. F-UX-1's premise —
  "an unavoidable 23.6 s gate" — is **false**: the cinematic has always had a "Skip intro →" button. Worse, the
  intro's `onContinue` is what opens the map screen, so suppressing it also removed the valley choice on a return
  visit. Reverted; the cinematic plays every load again.
- **The register overstates what is open.** Verified already-fixed: F-UX-24, F-RND-5, F-RND-7, F-RND-8, F-RND-10,
  F-RND-14, F-RND-18, F-RND-20, F-RND-21, F-RND-27, F-RND-28, F-SIM-10, F-SIM-17, F-SIM-18 (refuted), ET-2, ET-4,
  and the "leadership vacuum" (handover item 4 — a *transient* vacancy, not a bug; guarded by
  `tests/vacancyElection.succession.test.ts`). F-SIM-15's "red by design" note is also stale: the verdict *is*
  wired, and the run collapses rather than stalls.
- **Uncommitted work from three agents that died mid-edit** was reconciled by a fourth: the ET-1 tamed-feral
  Chronicle line is complete (8 `killHuman` call sites threaded, determinism-safe), F-UX-28 is done, and nothing
  was left half-edited. Note `tests/eventLog.duplicatesAndNotifications.test.ts` and
  `tests/workerCommand.roundtrip.test.ts` are the **workforce** agent's `staffingMode` edits, not ET-1's.

## 5. Owner decisions still outstanding

- **F-RND-17** season legibility on the ground — restore, keep flat, or a palette tint.
- **F-SIM-15 / T-2 / A-4** — how the long-run gate should treat a colony that *collapses* rather than stalls
  (judge every checkpoint, add a population-decline rule, or run the `producers` scenario under `invariants`).
- **F-IX-4** a notification carries coordinates but no subject id, so it cannot deep-link — needs a small
  data-model addition.
- **F-IX-14** the Work card shows "N idle" as a count, never a list. Left deliberately until auto-assign landed:
  if the idle count now reads 0, this closes as a copy fix; if a residual number remains, that number is a real
  signal and the list should carry reasons and a one-click assign (the same data F-IX-13 needed).
- **ET-1's idle-skill-decay half** — decay is continuous (~0.017/day), not an event, so a per-event log line would
  spam. Deliberately left unlogged.
- **Not bugs, do not "fix":** the `deno` dependency in `package.json` is the owner's, and the game menu still has a
  redundant "Replay intro" entry (harmless now that the cinematic plays every load) — removal is the owner's call.

## 6. Reported but not yet investigated

- **Prisoners escape even with 8 guards on the roster** (owner, end of session). `tickPrisonGuardDuty`
  (`src/game/prisonGuardDuty.ts:110-122`) rolls one escape chance per **unguarded hour**, and a guard's shift comes
  from their **index** in `prisonGuardIds(state, prison.occupants ?? [])` (`:55`, consumed at `humanTick.ts:553`).
  **Prime suspect: the auto-assign flip in §3** — the Prison was one of the five manual-by-default types removed, so
  prisons now auto-staff, and a shift roster keyed off the *ordering* of an auto-filled `occupants` list is exactly
  what flips silently. Start at `prisonShiftsAtHour` (`prisonShifts.ts:80`), `tests/prisonShifts.test.ts`, and
  `tests/low-2-events-defense.test.ts:397-519` (`staffedPrison(guardCount)`). Note
  `tests/prisonFestivalWorkContinuity.test.ts` — including "holds the post at 02:00 — an hour inside the night
  shift, outside the work window" — was failing only as collateral of the `largestPopulation` crash and passes
  again; do not mistake it for this bug.

- **Every load used to black out the game** (fixed at the end of the session, recorded here for the shape of the
  class): removing `notifications` from the save's transient restore left `world.notifications` **undefined**, so
  `App.tsx:1366`'s `.slice(-4)` threw during render and React unmounted the tree. Fixed by restoring the field as an
  **empty array** (never the payload's) plus a guarded read. The empty array is the load-bearing half:
  `simEffects.addNotification` does `state.notifications.push(...)`, so an absent field would have thrown inside the
  simulation on the first toast after a load. **A field dropped from persistence must still exist as an empty value
  for every reader that treats it as a list.**
