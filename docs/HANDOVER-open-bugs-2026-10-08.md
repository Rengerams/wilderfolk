# Handover — open bugs at the end of 2026-10-08

Written at the end of a long session whose context was nearly exhausted. Everything **landed** is recorded in
`CHANGELOG.md`, the `BUG_REPORTS/SUMMARY.md` register and `OWNERSHIP_OVERVIEW.md`; this file exists only for what
was **in flight or unresolved**, so the next session starts from evidence instead of re-deriving it.

## 1. In flight when this was written (two agents, findings not yet returned)

- **Worker hang / "one place back" jitter — BOTH halves diagnosed and fixed (jitter by the render agent, the 106 s
  "hang" by the staffing/loop session).**
  Owner-observed symptom: movers step forward then snap one place back, repeatedly; it happens to **animals as
  well as settlers**, and it **continues while paused**. Console evidence the owner supplied:
  ```
  [SpeedDiag] speed=2x … fps=76-100 frameMs=10-13                     ← healthy
  [GameLoop] Worker silent 105837ms with 1 tick(s) in flight (threshold 10000ms, last measured tick latency 31ms)
  [GameLoop] Worker tick stalled — falling back to main-thread ticks
  [GameLoop] Sim worker recovered automatically
  [SpeedDiag] speed=10x … fps=4.3  frameMs=230.7 frameMax=489
  [SpeedDiag] speed=3x  … fps=1.4  frameMs=1033.3 frameMax=2533
  ```
  **The two lines are two separate defects — do not conflate them again.** (a) The jitter never needed the hang,
  and is **not** the fallback-then-delta overlap this section used to propose: that path is exclusive by
  construction (`fallbackFromWorker` disposes the host, so no late delta can land). It was **two writers of
  `x`/`y`/`vx`/`vy` on the same `Entity` objects**: the tick delta, and `patchCatalogKinematicsFromRenderSoA`, which
  copied the **render SoA** onto the catalog — and the catalog holds the live world's own objects. A render buffer
  is a snapshot of a past tick, so on every refresh it dragged the display world back one buffer and the next tick
  corrected it. It survives a pause because a camera lerp rebuilds the snapshot and re-runs the patch. Measured
  before the fix: live world at `x=110` became `100` after the patch. A second, independent defect on the same
  symptom: `updateRenderSoABuckets` keyed its cache on the tick alone, so a command's render refresh — which
  arrives at an **unchanged tick** — was answered from the previous buffer (measured: `x` stayed `10` where the
  fresh buffer held `11`). Both fixed, each with a labelled regression test in
  `tests/renderer.soaPositionOwnership.test.ts`. **"The worker's deltas land during the main-thread fallback" is
  refuted** — do not implement a fallback-exclusivity change on its account.
  (b) **Why the worker went silent for 106 s — ANSWERED (2026-10-08, later session): the number is a PAUSE, not a
  hang, and the fallback was a false positive.** The watchdog asked `now - lastWorkerActivity > threshold` while a
  tick was in flight, but a paused loop posts no tick, so `lastWorkerActivity` ages for the whole pause; the first
  frame after resume sees a tick in flight against that stale clock and tears down a healthy worker. That is
  exactly the logged line: `silent 105837ms … threshold 10000ms, last measured tick latency 31ms` — a 31 ms worker
  reported as silent for 106 s, and the ~96 s between the threshold and the log is explained because no tick was in
  flight while paused (the check is skipped), not by a blocked main thread. `hidden=0` and the post-fallback frame
  times (main-thread ticks) both follow. Fixed in `gameLoop` by measuring silence from
  `max(lastWorkerActivity, lastWorkerTickRequest)` — silence counts only while ticks are being asked for — with a
  regression test that fails before the change (a 15 s pause disposed the host) and passes after. The escalated
  90-day runs above never pause, which is why they could not reproduce it; the lesson for the next outlier hunt is
  to **pause-resume in the harness**, not to escalate population further. Original measurements kept below.
  Escalated
  measurements on a Huge map, `producers`, seed 12345, against this tree: 90 in-process days — tick p50 9.75 ms,
  p95 36.05 ms, p99 93.95 ms, **max 514 ms**, 0 stalled ≥1000 ms; the real worker over **90 days / 6480 ticks** —
  `fallbackCount=0`, `stalledTicks=0`, max inter-result gap **3257 ms** against a 10 s watchdog. The existing
  `scripts/repro-worker-stall.mts` does **not** reproduce a hang either (it exits on pool exhaustion —
  `Render buffer pool exhausted` ×5995, a harness artefact: it never returns buffers). The owner's display is
  **180 Hz** and every sample showed `hidden=0`, so the >60 fps readings are
  legitimate and neither vsync nor background throttling is involved — the post-fallback frame times are real.

- **Uniform terrain — "every preset looks the same" + "settlers walk over water".** Established facts:
  `App.tsx:1005` does `initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName })`,
  `MapSetupScreen` is a controlled component, and `tests/terrain.mapVariety.test.ts` **passes** — its stdout shows
  all ten presets with distinct biome mixes at seed 1234. So the preset reaches the generator and the generator
  honours it — **so neither the generator nor the ground fills is at fault.** The hypothesis this section
  originally carried (`bakeTerrainLayer` flooding grassland, `drawTerrainFill` returning false on a missing sprite)
  was **wrong and has been withdrawn**. The terrain agent's measured interim finding supersedes it — live pixels off
  `canvas[aria-label="Valley map"]`, via `scripts/autoplay_playwright_probe.py` extended with
  `--ground-presets` / `--ground-zoom`:
  - **`bakeTerrainLayer` is NOT on the live path.** `renderer/terrain.ts:279` returns into the **Whittaker baker**
    whenever `hasContinuousFields(map)` — always true for a generated map. The `terrainChunkCache` /
    `bakeTerrainLayer` branch after it has no test and is **legacy-save-only**, so the fill table, the dead atlas
    (§4) and the `mountain.png` fill all sit on a path the shipping game never takes.
  - **"The same map whatever I choose" is a CAMERA fact, not a terrain fact.** At zoom 0.5 the presets are clearly
    distinct (Islands **64.8 %** water-blue vs Meadows **3.4 %**, matching the generator's 62.6 % / 2.4 % water
    cells); at the game's own `CAMERA_ZOOM_DEFAULT` (1.45) they are nearly indistinguishable (7.3 % vs 8.3 % blue,
    mean rgb(87,124,73) vs rgb(95,125,80)), with no console errors. The default camera opens close on the camp
    clearing, so the first view of every valley looks the same and the preset's character appears only on zoom-out.
    **This is a UX bug** — fix the opening camera, or give the choice an establishing view.
  - Consequence: **"settlers walk over water" is not a rendering defect either** — water paints as water. It points
    at walkability/pathing in the simulation, the same area as the worker hang in §1.

## 2. Failing tests — all three DIAGNOSED AND FIXED (2026-10-08, later session)

```
× guards the unmount cleanup on the loop ref
× still detaches a settler from the building they actually work at
× raises exactly one card per jailed offender, and jails someone      (71 s — reads like a timeout)
```

- **`guards the unmount cleanup on the loop ref` (BRITTLE-TEST).** The save change in §3 was not the cause: the
  cleanup still returns early when no loop owns a colony, it just reads the live ref into a local (`if (!loop)
  return;`) and then gates the exit save on the `autoSave` preference. The case pinned the literal
  `if (!loopRef.current) return;`, so it broke on an equivalent rewrite — and the production comment argues
  explicitly against the eslint remedy a literal guard would force. Rewritten to assert the guard's meaning
  (an early return that tests the loop ref, ordered before the save) instead of its spelling.
- **`still detaches a settler from the building they actually work at`.** A fixture that predates the auto-assign
  flip in §3, not a product defect. `removeStaffWorkerFromBuilding` releases the settler and then runs
  `assignMissingWorkers`, which re-offers the now-idle settler to the same open post — the contract the
  workforce-policy cases pin deliberately ("never a refusal of the removal itself"), and the one `tickLayerAssign`'s
  pulse would restore within a quarter-day in any case. A player never meets it: the panel renders its worker list
  and its **Remove** button only while the building is on **Manual**, and the auto pass skips manual buildings — so
  the removal a player can reach always sticks. The fix was therefore to say the mode in the fixture
  (`staffingMode: 'manual'` on the L8 Church), which is the precondition the panel enforces, leaving the auto
  contract alone. Note the first L8 case (a removal aimed at a building the settler does not work at) was never
  affected — it returns before the auto pass.
- **`raises exactly one card per jailed offender, and jails someone`.** Pure timeout, no behavioural failure: the
  case loops 40 seeds, and each seed builds a whole world (`initGame` ≈ 0.2 s in plain node, ≈ 1 s under vitest
  instrumentation) for ~38.6 s. All assertions pass at a longer timeout, so the case now carries an explicit
  `120_000` budget like the other heavy cases in the suite. The same was true of the new ground-look water/preset
  measurement (**~38.7 s**, ten full-map bakes) — also given an explicit budget; its printed numbers are the
  evidence that water paints as water and the presets stay distinct.

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

## 6. Reported and investigated — the prison-escape report is NOT reproducible in this tree

- **Prisoners escape even with 8 guards on the roster** (owner, end of session). Investigated 2026-10-08 (later
  session). **No defect found and no production change made.** The path as it stands:
  - The roster is **order-independent**: `prisonOnDutyGuards` sorts the crew by id before choosing, and
    `prisonRoster` maps the three on-duty crew places onto the three shifts, so a crew of any size ≥ 3 covers all
    24 hours (one shift each, rotating weekly). With a crew larger than three the remaining guards rest in turn.
  - The hourly sampler counts **any** guard near the post, not just the rostered one, so a relief standing there
    covers the hour — the committed change that fixed "a fully-staffed prison still freed prisoners".
  - Evidence: `tests/low-2-events-defense.test.ts` already pins the roster half (full crew → prisoner held over
    120 days; one shift short → leaks; roster assigned but never posted → all 24 hours open, which is the rule
    working). **Added:** `tests/prisonFestivalWorkContinuity.test.ts` now runs three real `gameTick` days with a
    **rotating four-guard crew** (the shape "8 guards on the roster" implies: three shifts named, the rest listed
    off duty) and asserts `uncoveredPrisonHours` is empty on every day — it passes.
  - An escape therefore requires an hour in which **nobody is near the post**; a crew that walks its shifts does not
    produce one. If it is reported again, read `prison.uncoveredPrisonHours` (and the sampler's own
    `[GameLoop]`-style logs) from the affected save first: that array — not the roster — is what the escape roll
    reads.
  - The one path this evidence does **not** cover is a guard who leaves the post mid-shift (needs, food, a walk
    home) and is absent at the top of a clock hour. That is the sampler's intended rule rather than a defect, but
    it is where a future report should look.
  - Original note kept for context: `tickPrisonGuardDuty` rolls one escape chance per **unguarded hour**, and a
    guard's shift comes from their place in `prisonGuardIds(state, prison.occupants ?? [])`. The former prime
    suspect here was the auto-assign flip in §3 (Prisons used to be manual-by-default); the ordering half of that
    suspicion is refuted above, and auto-staffing fills the same posts explicitly. Note
    `tests/prisonFestivalWorkContinuity.test.ts` — including "holds the post at 02:00 — an hour inside the night
    shift, outside the work window" — was failing only as collateral of the `largestPopulation` crash and passes
    again.

- **Every load used to black out the game** (fixed at the end of the session, recorded here for the shape of the
  class): removing `notifications` from the save's transient restore left `world.notifications` **undefined**, so
  `App.tsx:1366`'s `.slice(-4)` threw during render and React unmounted the tree. Fixed by restoring the field as an
  **empty array** (never the payload's) plus a guarded read. The empty array is the load-bearing half:
  `simEffects.addNotification` does `state.notifications.push(...)`, so an absent field would have thrown inside the
  simulation on the first toast after a load. **A field dropped from persistence must still exist as an empty value
  for every reader that treats it as a list.**
