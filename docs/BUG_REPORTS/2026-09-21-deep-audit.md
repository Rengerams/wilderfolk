# Name of file: 2026-09-21

- Bug: Deep audit — twenty defects across the sim worker, simulation, save/load, rendering and UI (twelve in the first pass, eight more worked in the follow-up)
- Status: resolved
- Date discovered: 2026-09-21
- Version/build: 0.6.4.1
- Reporter: deep audit pass (five area audits against a green baseline)
- Area: worker | Play | Truth | save/migration | UI | performance
- Owner module: `simWorker/GameWorkerHost.ts`, `villageAnchor.ts`, `groupEvents.ts`, `civilStatus.ts`, `simHelpers.ts`, `spatialGrid.ts`, `saveLoad.ts`, `saveSchema.ts`, `simPrep.ts`, `worldRuntimeCaches.ts`, `gameLoop.ts`, `useGamePersistence.ts`, `logisticsOverlayData.ts`, `beautyGrid.ts`, `App.tsx`, `MomentTitleCard.tsx`, `IntroScreen.tsx`, `GameBuildRail.tsx`, `BigNewsBanner.tsx`, `GameDashboard.tsx`, `tsconfig.node.json`

## Status history

- 2026-09-21 — open (five independent area audits: sim worker boundary, renderer + hot paths, simulation domain, save/load + persistence, React UI/hooks, plus a semantic-duplication sweep)
- 2026-09-21 — investigating (first batch of twelve repaired; twelve further findings recorded with evidence and deliberately left open)
- 2026-09-21 — resolved (eight of those twelve worked in a follow-up pass; the remaining four are recorded below with the reason each is still open)
- 2026-09-21 — owner-reported defect added and repaired (finding 13: the mini-map was hidden under the open build catalogue — occlusion, not deletion)
- 2026-09-21 — **regression in this pass's own D-9 repair, found and corrected.** D-9b removed the two authored-decision cards' `absolute left-1/2 top-4 z-10 -translate-x-1/2` and added `pt-4` to `GameOverlays` to replace it — but the cards do **not** render inside `GameOverlays`; they render in the map stage's own `absolute inset-0 z-10` overlay (`App.tsx:1362`), which is not a flex container. The `pt-4` therefore offset the wrong box and the cards were left as flow children of a non-flex absolute box, i.e. in its top-left corner. The guard written for D-9 asserted the class string and named that same wrong parent, so it stayed green. Both cards now share one anchored centred column inside the overlay they actually render in, and the guard asserts the ordering instead of a class string. Root cause in one sentence: a fix that assumed the parent from a *component name* instead of reading the JSX tree, with a test that encoded the same assumption.

**The tree was green before this pass.** Baseline: `tsc` clean on both projects, `npm run lint` 0
warnings / 0 errors, `npx vitest run` **264 files / 1420 passed, 2 skipped / 0 failed**,
`npm run audit:deps` 0 runtime cycles, `npm run dup` 23 clones. Every finding below is therefore a
**latent defect the existing suite did not catch**, not a failing test. That is the most important
fact in this report: the suite was green on a tree where a reload could refund a day of winter, a
command could tear down the simulation worker, and a caravan could not sell stone.

Three of the findings were **user-reported or owner-approved** rather than audit-only, and are marked
as such: stone had no visitor-trade route (owner-approved repair), and the raid-card and
village-request-card affordances were found by the UI pass.

## Observed behavior

Thirteen defects, grouped by where they bite — twelve from the audit, plus finding 13, which the owner
reported against a running build while the pass was in progress:

### Worker boundary

**1 — A command's render refresh could exhaust the worker's render-buffer pool, and exhaustion is fatal.**
`RENDER_BUFFER_POOL_SIZE = 5`; `MAX_PIPELINE_DEPTH = pool - 1` reserved one slot for the display buffer
held on main, but **none** for the command's own render refresh, and `canPipelineTick()` did not count a
command in flight. With three ticks packaged but unhandled plus the held display buffer, 4 of 5 slots
were out; a player command took the 5th, the frame loop was still allowed to post a 4th tick, and the
worker — finding nothing free — rolled the tick back and posted a `tick`-sourced error, which the host
treats as fatal and answers with `fallbackFromWorker`. **The simulation worker was torn down
mid-session**, that tick's accumulated time was lost, and the loop fell back to main-thread ticks.

**2 — `EntitySpatialGrid.insert` dropped every refreshed object that had not changed cell.**
The worker's render path builds a **fresh shim object** per slot per tick but gives it the same id and
the same cell when the entity has not moved. `insert` early-returned on `existingIdx === newIdx`, so the
grass render grid kept the first tick's objects forever: any field that changes without a cell change
(`flash`, `size`, `chatTicks`) could never reach the renderer, and N shims per tick were allocated
purely as garbage.

### Simulation truth

**3 — Stone had no visitor-trade route at all.** `VISITOR_TRADE_COSTS` offered food/wood/iron buys and
food/wood/iron sells. Stone — a building, repair, upgrade, forge and research input — could be neither
bought nor sold from a caravan, although `tradeRoutes` could already import it. A player short of stone
had no visitor-facing way to get it.

**4 — The yearly Marriages statistic could never rise.** `stats.recordYearlyStats` counted
`relationshipStatus === 'married'`, but conception sets **both** partners to `'expecting'` for the
pregnancy. `marriagesThisYear = floor((marriedHumans - prevMarried) / 2)` therefore had both arriving
partners cancelled by both departing ones: marry a couple (10 → 12) and conceive them the same year
(→ 10) and the year closed at zero, so the lifetime **Marriages** total never moved while the People
screen showed the couple as married.

**5 — The leader-honored banner was retired at max reputation.** `addReputation` **clamps** to 0–100, and
the banner was gated on `state.villageReputation > before`. Once reputation sat at 100 the delta was
necessarily zero, so every later leader-led raid victory silently lost its "👑 Leader honored"
announcement for the rest of the game.

**6 — A multi-resource trade float announced only the last resource.** In `tradeWithVisitors`,
`receivedLabel` was assigned inside the per-resource loop instead of accumulated, so a deal carrying two
resources (`trade_3` pays gold *and* iron, `trade_7` stone *and* gold) showed only the final key and
silently dropped the rest.

**7 — One nameless settler had three names.** `workforce.formatSettlerName` fell back to `'Settler'`
("Settler was released from prison") while `villageLeadership.formatSettlerName` fell back to
`'Unknown'` (election notices, the HUD leader label), and the owner in `citizenId` says `'A settler'`.
Both were `.ts` domain copies, invisible to the existing guard, which walks only `.tsx`.

### Save / load

**8 — A reload refunded the rest of a cold winter day.** `villageCanHeat` — what `tickWinterHeating`
computes once per day and the *simulation* reads for the rest of that day to decide whether every
settler takes the 1.5× unheated-winter energy penalty — was absent from `WORLD_STATE_SAVE_KEYS`. After
a reload the field was `undefined`, `!= false` read as "heated", and the penalty was skipped.

**9 — A payload that would load into a permanently broken world was accepted.** A same-version save with
a non-finite `tick` loaded successfully into a world whose calendar was `NaN`; because
`tick % TICKS_PER_DAY` is then never 0, **the daily layer never ran again** — no days, seasons, aging or
births — and the clock read "Year NaN". A `resources` object missing a key was the same class of damage
more quietly: every affordability rule is `resources.wood >= cost.wood`, a comparison against
`undefined` is permanently `false`, so the colony could never build, repair or research again, and the
next save wrote the broken state back.

**10 — A rollback restored already-mutated presentation state.** `extractSimPrep` spread `floatingTexts`
and `deathParticles` **shallowly**, while the realtime layer decays those elements in place
(`ft.y -= 0.7; ft.life--`, `p.x += p.vx; p.life--`). The "backup" therefore held the live objects, so a
failed tick's rollback restored post-tick values — a partial no-op that aged every popup and particle
twice.

**11 — `beautyGrid` was not dropped by the runtime-cache owner.** `invalidateWorldRuntimeCaches` dropped
the spatial grids, road index and adjacency but not `beautyGrid`, although the save path strips it as a
runtime field and the census test lists it as one. A live `Int16Array` could ride an export clone the
rest of the pipeline assumes is cache-free.

### UI affordances

**12 — Two action gates failed open.** `VillageRequestCard` declares and renders an
`acceptBlockedReason` prop, but `App.tsx` never passed it, so the `disabled` gate was always false: an
unaffordable offer rendered as an **enabled** Accept button carrying the *positive* "Pay 15 gold →
receive 30 food" detail, and the real refusal arrived only as a toast after the click. Separately, the
raid card re-derived the raid owner's gate inline, and its defend branch tested
`hasIronSpears || hasStoneSpears` where the owner tests `hasMilitiaWeapons` = spears **or swords**,
with refusal copy that had already drifted from the rule it described.

### HUD occlusion (owner-reported, 2026-09-21)

**13 — The mini-map was hidden under the open build catalogue.** Reported by the owner as "the
minimap is gone ?" and then "it's totally gone", with a screenshot of a 1848×923 window whose build
catalogue was open. It was **neither deleted nor failing to render**: `GameMapStage` mounts `<MiniMap>`
unconditionally (`GameMapStage.tsx:169`). It was **painted over**. `.game-view-drawer` is
`position: absolute; top: 0.75rem; bottom: 0.75rem; z-index: 30` (`App.css:424-436`) — and an
absolutely-positioned flex child takes **no flow space**, so `<main class="map-stage">` in
`GamePlayLayout.tsx:28-32` still begins at x = 0 and the catalogue is a full-height panel covering the
map's left edge (`left: 0.75rem; width: min(26rem, calc(100vw - 2rem))`, `App.css:444-448`). The
mini-map is `absolute bottom-4 left-4` (`MiniMap.tsx:183`) with **no z-index of its own**, so a
`z-index: 30` sibling paints above it. The collapsed rail (`--rail`) never caused this, which is why
it presented as a deletion: it is `bottom: auto; min-height: 20rem` (`App.css:483-488`) — top-anchored,
ending well above the bottom-left corner. Only the *open* catalogue reaches that corner, and
`buildPanelOpen` is persisted in `localStorage` (`useGameShellState.ts:161,216`), so a player whose
catalogue was open never saw the mini-map again. This is the same class of defect as the 2026-09-17
logistics-toggle/mini-map collision already recorded in `CHANGELOG.md`: **two HUD elements anchored to
the same corner, with only one of them carrying a stacking order.**

## Expected behavior

- A player command must not be able to exhaust the render-buffer pool, and pool exhaustion must not tear
  down the simulation worker.
- A spatial index must reflect the objects most recently handed to it, including when the cell is
  unchanged.
- Every `ResourceKey` the economy spends must be obtainable through the trading systems that exist.
- A statistic must count the state the simulation actually uses; a status that the sim sets for a
  pregnancy is still a marriage.
- A banner that promises "reputation rises" must fire exactly when reputation rose.
- A trade notice must name every resource the deal carried.
- A settler with no name must read the same everywhere.
- Every field the simulation reads across a save boundary must be saved.
- A payload that cannot produce a working world must be **refused by name**, not loaded.
- A rollback must restore pre-tick values, including nested element values.
- The owner that strips runtime caches must strip all of them.
- A blocked action must show the owner's own reason and be visibly disabled.
- A save must be a **read** of the authority, never a switch of it, and loading must not mutate its input.
- A derived cache must be reconstituted wherever the world is reconstituted, not a day later.
- A keyboard claim and an Escape handler are one contract: an overlay that covers the screen owns the
  keyboard, and a control that Space/Enter activates normally keeps those keys.
- An overlay that covers a region must not silently swallow the HUD anchored there: a persistent
  control the player is meant to use at any time stays visible (or is deliberately moved), rather than
  disappearing because it has no stacking order of its own.

## Priority 1 — the first batch (twelve repaired)

| id | sev | status | finding | repair |
|---|---|---|---|---|
| **S-1** | HIGH | **FIXED** | A command's render refresh could exhaust the worker's render-buffer pool, and the worker answers pool exhaustion with a **fatal** `tick` fault — so issuing a command at high pipeline depth tore down the whole sim worker mid-session and fell back to main-thread ticks. `MAX_PIPELINE_DEPTH` reserved one slot for the display buffer but none for the command's, and `canPipelineTick()` did not count the command. | `GameWorkerHost.canPipelineTick()` now also requires `pendingCommand == null`, so the host stops posting ticks while a command is outstanding. The command is never dropped — `GameLoop.applyCommand` queues it on its own chain. |
| **S-2** | HIGH | **FIXED** | `renderer/humans.ts` carried a private `getPlayerCampCenterFromBuildings` whose no-hall/no-house branch returned the **first completed player building**, while the simulation's own rule falls through to the settlers' mean. On a colony whose only finished structure was a Barracks, the drawn raid march line and the simulated raid ended at different points. | The rule now lives once, in `src/game/villageAnchor.ts` (leaf, types-only imports); `frontierCombat` re-exports it and the renderer imports it. |
| **S-3** | HIGH | **FIXED** | **Stone had no visitor-trade route at all.** `VISITOR_TRADE_COSTS` offered food/wood/iron buys and sells; stone — a building, repair, upgrade, forge and research input — could not be bought or sold from a caravan, even though `tradeRoutes` could import it. | Added `buy_stone` (20 gold → 25 stone) and `sell_stone` (35 stone → 20 gold), priced against the wood/iron neighbours; both buttons wired into `VisitorCampPanel`; `buy_stone` added to the virtual player's shortage list under a named `LOW_STONE_STOCK`. **Owner-approved gameplay change.** |
| **S-4** | HIGH | **FIXED** | `workforce.formatSettlerName` fell back to `'Settler'` and `villageLeadership.formatSettlerName` to `'Unknown'`, while the owner (`citizenId`) says `'A settler'` — one nameless settler had three names depending on which log line mentioned them. Both were `.ts` domain copies, invisible to `tests/uiSingleOwner.test.ts`, which walks only `.tsx`. | Both delegate to `citizenId.humanDisplayName`; an all-`.ts` guard fails if any module re-types a nameless-settler fallback. |
| **S-5** | MEDIUM | **FIXED** | The yearly **Marriages** statistic counted `relationshipStatus === 'married'` only, but conception sets **both** partners to `'expecting'` — so `floor((married - lastYear) / 2)` could be cancelled exactly and the lifetime total never rose while the People screen showed the couple as married. | New owner `src/game/civilStatus.ts` (`isMarriedOrExpecting`) replaces the count and collapses the two private `isActivelyMarried` copies. |
| **S-6** | MEDIUM | **FIXED** | The leader-honored Big News banner was gated on `state.villageReputation > before`. `addReputation` **clamps**, so a victory that landed on 100 was never announced — and once at 100 the delta was always zero, retiring the announcement for the rest of the game. | `addReputation` now returns the amount actually applied; the banner is gated on `granted > 0` — true for a victory that reaches the cap, false only when the clamp delivered nothing. |
| **S-7** | MEDIUM | **FIXED** | A multi-resource trade float announced only the **last** resource: `receivedLabel` was assigned per loop pass instead of accumulated, so `trade_3` (gold *and* iron) showed only the iron. | The float reads `resourceTypes.formatResourceAmounts` over what actually landed. |
| **S-8** | MEDIUM | **FIXED** | `EntitySpatialGrid.insert` early-returned when the cell was unchanged, but the worker's render path builds a **fresh shim object** per slot per tick with the same id and cell — so the grass render grid kept the first tick's objects forever and any field that changed without a cell change never reached the renderer. | `insert` compares object identity in the same-cell branch and replaces the bucket entry, keeping the O(1) fast path for the simulation. |
| **S-9** | MEDIUM | **FIXED** | Two action gates failed open: `VillageRequestCard`'s `acceptBlockedReason` prop was declared and rendered but **never passed** by `App.tsx`, so an unaffordable Accept stayed enabled carrying the positive detail; and the raid card re-derived `getRaidChoiceEligibility` inline, testing `hasIronSpears \|\| hasStoneSpears` where the owner tests spears **or swords**. | `App.tsx` passes `getVillageRequestEligibility(...).blockReason` and calls `getRaidChoiceEligibility` (now exported through `gameEngine`) for both branches. |
| **S-10** | MEDIUM | **FIXED** | A save payload with a non-finite `tick` **loaded successfully** into a world whose calendar was `NaN` — `tick % TICKS_PER_DAY` is then never 0, so the daily layer never ran again. A `resources` object missing a key did the same class of damage more quietly: every affordability rule is `>=` against `undefined`, permanently false. | `findUnrestorableField` refuses both by name through the existing `unrestorable` refusal. |
| **S-11** | MEDIUM | **FIXED** | `villageCanHeat` was **not saved**, so a reload mid-winter-day read the field as "heated" (`!== false`) and refunded the rest of that day's 1.5× unheated-winter energy penalty. | Added to the allow-list (a plain boolean). |
| **S-12** | LOW-MED | **FIXED** | `extractSimPrep` spread `floatingTexts`/`deathParticles` **shallowly**, but the realtime layer decays those elements in place — so the "backup" held the live objects and the rollback restored already-mutated values. | Both arrays are mapped element-wise, the depth the entity/building clones already used. |

## Priority 2 — the follow-up batch (eight repaired)

| id | sev | status | finding | repair |
|---|---|---|---|---|
| **D-2** | MEDIUM | **FIXED** | Pressing Save **moved the display world**. `exportAuthoritativeWorld` called `syncAfterWorkerMutation()` (which adopts the host's authoritative world into the display) and then assigned the exported clone to `this.world`. `applySimTickDelta` never writes `paused`/`speed`/`dismissed*Ids` and `mutateWorld` forwards a control only when it changes — so a pause or speed change made just before a save could be reverted on screen and could not be re-sent. | The export is now a **read**: the `syncAfterWorkerMutation()` call is gone (it was only ever appropriate for the command-failure paths, which have just been told the display is wrong) and the result is returned to the caller rather than adopted. `whenIdle()` already waits for every tick and command to settle. Pinned by `tests/gameLoop.exportAuthority.test.ts`. |
| **D-7** | LOW | **FIXED** | Two overlapping saves (the 30 s autosave and a Ctrl+S or the unmount save) made the second `exportSave` reject; the loop caught that and fell back to the **display shadow**, recording a world up to `MAX_PIPELINE_DEPTH` ticks behind **while reporting success**. | `persistGame` holds the in-flight save and makes a second caller await it. Coalescing rather than queueing: both callers want the most recent snapshot written to the same slot. Cleared in a `finally`, so a failure is still retryable. |
| **D-5** | LOW | **FIXED** | `loadGameFromParsed` mutated the payload it was handed: `pickWorldStateFromSave` copies top-level keys **by reference**, so the returned world's arrays were the caller's, and `migrateTickTimeline` scales tick-valued fields **in place**. Loading the same parsed object twice scaled it twice (`700 → 2100 → 7200`). | The load clones its input once at the entry point and works from that; every payload read goes through the copy. A clone that throws is reported in the existing `unrestorable` refusal shape. |
| **D-8** | LOW | **FIXED** | `beautyGrid` was neither rebuilt on load nor dropped by the runtime-cache owner, so a loaded colony ran up to a full game day with no beauty field — free-time settlers stopped being drawn toward decor and the beauty happiness nudge was skipped. | `rebuildBeautyGridFromWorld` (new, split out of `tickBeauty`) runs on load, and `beautyGrid` joins the drop list. The split is the point: `villageHappiness` is deliberately **not** recomputed, because it is in the save allow-list. A first cut used `tickBeauty` and `tests/medium-persistence.test.ts` failed on exactly that (`expected 50 to be 73`) — the test was right. |
| **D-1** | now LOW | **FIXED** | The F4 logistics projection was recomputed on every snapshot rebuild, and the snapshot key includes the camera, which lerps every frame — so panning re-ran the whole projection (road graph, bucket grid, one `classifyCommute` per settler) at frame rate. **Measured, and the original severity was too strong:** 0.072 ms/call on a 903-entity / 120-building world, i.e. ~4.3 ms/s while panning. Not a stutter; still ~12 000 commute objects/s of avoidable garbage. | `computeLogisticsOverlayCached` memoises on world **identity** plus the tick (identity catches an in-place mutation at an unchanged tick), and `resetRendererCaches` drops it. Pinned by `tests/logisticsOverlay.cache.test.ts`, which asserts equality with the uncached function first. |
| **D-9a** | MEDIUM | **FIXED** | `MomentTitleCard` covered the screen for ~4.8 s **without claiming the keyboard**, so every gameplay hotkey acted on the game behind it and Escape cleared the player's map selection instead of skipping the card. The card is not focusable, so its own `onKeyDown` caught nothing. | It now uses the shared `useOverlayKeyboard('moment-title-card', …)` pair. |
| **D-9b** | MEDIUM | **FIXED** | The story card and the diplomacy card both rendered at `absolute left-1/2 top-4 z-10 w-full max-w-lg -translate-x-1/2`, and diplomacy comes later in the DOM — so a pending diplomacy card painted over a story card's title and first choice. The diplomacy card's raid-aware `top-44` never considered a story card. | Both are flow children of `GameOverlays` (already a flex column) and stack: story above diplomacy. `pt-4` on the slot replaces the `top-4` they carried individually; every other card there is `absolute` and ignores it. |
| **D-9c** | MEDIUM | **FIXED** | `IntroScreen`'s window-level "press any key" handler had **no target check** while its click handler skipped `.intro-control`: Tab to the 🔊/🔇 button and pressing Enter or Space ran `handleContinue`, unmounting the intro before the button's own activation landed. | The key handler skips `isActivatableTarget(event.target)` (the shared "Space and Enter activate this natively" rule) and the `.intro-control` group. |
| **D-9d** | LOW | **FIXED** | Three icon-only build-rail buttons had only glyph text plus a `title`; the dashboard's settler rows were mouse-only (`<tr onClick>` with no role, tab stop or key handler) although they are the only route to the "Why this settler…" panel; and the Big News dismiss button carried `role="status"`, which overrides the native button role and hid the click-to-dismiss affordance. | `aria-label` on all three rail buttons (plus explicit `type="button"`); `role="button"` + `tabIndex` + Enter/Space + focus ring + an explicit accessible name on the settler rows; the live region moved onto the card's content wrapper. Pinned by `tests/ui-a11y.contract.test.ts`. |
| **D-4** | LOW | **FIXED** | `gameWorker.node.ts` belonged to no TypeScript project, so `npm run build` never type-checked the Node/Tauri worker entry. | It is now in `tsconfig.node.json` (with `DOM` and `vite/client` added to that project so the simulation modules the entry imports resolve). **Measured first: 0 errors**, so the gate arrived green rather than being widened for a red file. |

## Priority 3 — confirmed, and still open

| id | sev | status | finding | why still open |
|---|---|---|---|---|
| **D-3** | MEDIUM | **PART-FIXED** | Twelve renderer hot-path items, all measured-structure rather than wrong output: gradients re-created per frame and per grounded entity per repaint; per-frame coordinate-tuple allocation in the grid overlay; build-mode repaint at O(viewport tiles) × O(candidate cells × buildings); per-repaint array spreads, full-scene `Map`s and per-entity closures; `drawBuildings` re-filtering and re-sorting the whole list every repaint; snapshot rebuild copying the alive list and every by-type bucket including in the SoA path that never reads them; per-tick `JSON.stringify`/`structuredClone` over all buildings in the delta path. | Worked in the renderer batch (2026-09-21): the animal cull pad, the grid overlay tuples, the `drawBuildings` sort, the snapshot by-type copy, the build-grid occupancy index, the AO blob and the hunt-chase-lines allocations are fixed, each output-identical and the index proven equivalent by `tests/placementOverlapIndex.equivalence.test.ts`. **Deliberately left** (each stated in the report's "Still open" section): the per-frame viewport washes/vignette and per-particle smoke gradients (one per frame, not the per-entity cost, and caching a `CanvasGradient` across contexts is the regression risk), and the per-repaint `markers.ts`/`drawHuman`-closure items (LOW, and the fix is an inline refactor of the human draw loop rather than a cache). |
| **D-6** | LOW | **OPEN (design call)** | The manual-save "Game Saved! 💾" floating text is added via `loop.mutateWorld` to the **display** world, whose `floatingTexts` the next worker delta replaces wholesale — so it vanishes in ~0.3 s while unpaused, while paused nothing decays it so it stays. | The two honest fixes are opposite user-visible choices: route the confirmation through the worker (a protocol addition: a `showFloat` command), or drop the float and keep the toast alone (loses in-world confirmation). That is an owner call, not a mechanical repair. |

## Priority 4 — investigated and closed (not defects)

| id | status | claim | why closed |
|---|---|---|---|
| C-1 | **CLOSED** | "The rollback payload may miss fields a tick advances." | Disproved by a field-by-field probe over ticks 0/35/71/143/25919 and a fully populated world: **0 gaps**. Recorded so it is not re-derived. |
| C-2 | **CLOSED** | "`screenShakeImpulse` may be swallowed by the worker's one-shot clear." | The clear runs **after** `extractSimTickDelta` captures the value; the delta carries, applies and restores it. |
| C-3 | **CLOSED** | "`Math.random()` may have crept into the simulation." | The only occurrences under `src/` are inside `simRng.ts` itself plus a comment in `nameLoader.ts`. No rng draw in a render path. |
| C-4 | **CLOSED** | "Mutation-during-iteration may skip entities in the tick layers." | `tickWildlife` iterates a copy; `markWildlifeDead` splices only the bucket being walked; `dailyPopulation` prunes backwards; `staffConstructionCrews` mutates only the array it just collected. |
| C-5 | **CLOSED** | "The duplication gate may be reporting clones that have already drifted." | 22 of the 23 clone pairs are coincidence or shared boilerplate; the one semantic duplicate was S-2. The rest are triaged by category in the duplication sweep. |
| C-6 | **CLOSED** | "`package.json` may carry a duplicate dependency key." | It did (`@tauri-apps/cli` twice) — harmless at runtime because JSON keeps the last, but removed as a latent maintenance trap. |
| C-7 | **CLOSED** | "Two simulation invariants fire during a passing test." | Both are **test-fixture** artefacts, not product defects: `foodLedger.acceptedCatch` replaces `entities`/`buildings` with a minimal crew whose homes are deliberately unset. |
| C-8 | **CLOSED** | "Screen-shake impulses set during a tick may be lost between frames." | `syncScreenShakeFromWorld` takes the max and `updateView` decays it; the clear only resets the world's copy. |

## Reproduction steps

Each numbered finding below was reproduced directly; the steps are the shortest form.

1. **Pool exhaustion** — at 5×/10× in a large village, issue any command while three ticks are
   packaged but unhandled; observe `[GameLoop] Worker tick exceeded …` then
   `Worker tick stalled — falling back to main-thread ticks`.
2. **Stale shim** — `EntitySpatialGrid(100,100,10)`; `reconcile([human(1,{x:5,y:5})])` then
   `reconcile([human(1,{x:5,y:5,flash:9})])`; read the cell back: the grid returned the **first**
   object and `flash` was `0`.
3. **Stone** — open a trader camp's panel and read the trade list: no Buy stone, no Sell stone.
4. **Marriages** — `stats.recordYearlyStats` over a year in which a couple marries and conceives; the
   count stayed at the previous year's value.
5. **Leader honored** — set `villageReputation = 100`, win a leader-led raid; the event log records
   "led the raid against … — village reputation +4" but no Big News banner appears.
6. **Trade float** — any deal whose `resourcesReceived` has two positive keys; the float named one.
7. **Settler name** — an entity with no `name`: `workforce` logged "Settler …", `villageLeadership`
   rendered "Unknown", `citizenId` says "A settler".
8. **Winter save** — save mid-winter-day with `villageCanHeat === false`, reload, call
   `tickWinterHeating` for the same tick: it returned `true`.
9. **Broken payload** — `loadGameFromParsedOutcome` with `tick: 'not-a-number'` returned `ok: true`,
   `year: NaN`; with `resources: { gold: 5, iron: 0 }` it returned `ok: true`.
10. **Rollback decay** — snapshot with `life: 5`, apply the realtime layer's in-place decay, roll back:
    `life` read `4`.
11. **beautyGrid** — `invalidateWorldRuntimeCaches(world)` left `world.beautyGrid` set.
12. **Gates** — with `< 15` gold the village-request Accept button was enabled and carried the positive
    detail; a sword-armed colony saw Defend disabled with "Stone or iron spears required".
13. **Mini-map** — open the build catalogue (the `B` toggle, or reload with it already open, since the
    state is persisted) and look at the map's bottom-left corner: the mini-map is not visible. Close the
    catalogue and it is there, unmoved, which is what separates occlusion from a missing component.

## Evidence

**Worker boundary.** `src/game/simBuffers/renderBufferPool.ts:5` (`RENDER_BUFFER_POOL_SIZE = 5`);
`src/game/simWorker/GameWorkerHost.ts:70` (`MAX_PIPELINE_DEPTH = pool - 1`), `:271` (`canPipelineTick`);
`src/game/simWorker/gameWorker.ts:255` (the command acquires a slot), `:349-357` (tick rolls back and
posts a **fatal** `tick` error); `src/game/gameLoop.ts:357-360` (any fault → `fallbackFromWorker`).

**Spatial grid.** `src/game/spatialGrid.ts:175-178` (`if (existingIdx === newIdx) return;`);
`src/game/simBuffers/renderSoAEntities.ts:74` (a fresh shim per slot per tick), `:142-152`; the
`reconcile` path at `spatialGrid.ts:439`.

**Stone.** `src/game/groupEvents.ts:1270-1277` (the catalogue before the fix: six actions, no stone);
`grep -n stone src/game/groupEvents.ts` returned **zero** matches outside a comment, while
`resourceTypes.ts:1` lists `stone` in `ResourceKey`.

**Marriages.** `src/game/stats.ts:80` (`=== 'married'` only) vs `src/game/citizenOverview.ts:133`
(`'married' || 'expecting'`); conception sets both partners at
`src/game/simulation/humanRelationships.ts:764-766`.

**Leader honored.** `src/game/simHelpers.ts:131` (the clamp) and the guard at
`frontierCombat.ts` (`state.villageReputation > before`). An instrumented run printed the exact values:
`entry { leaderInFight: true, tier: 'decisive_win', repBonus: 4, victory: true, rep: 96 }` then
`guard 100 100 false` — the clamp delivered 96 → 100 and the old guard still refused to announce it.

**Trade float.** `src/game/groupEvents.ts:1437` (assignment inside the loop, before the fix).

**Settler name.** `src/game/workforce.ts:33-37` (`|| 'Settler'`),
`src/game/villageLeadership.ts:112-116` (`|| 'Unknown'`) vs `src/game/citizenId.ts:15,28-31`.

**Winter save.** `src/game/dailyBuildingEconomy.ts:137-139`
(`return state.villageCanHeat !== false;`), `src/game/simulation/humanNeeds.ts:141-143`
(`UNHEATED_WINTER_PENALTY` ×1.5), and `villageCanHeat` absent from `src/game/saveSchema.ts`.

**Broken payload.** `src/game/saveLoad.ts:473`
(`loadedTick = (worldData.tick ?? … ?? 0) as number` — a cast over an unchecked value) and
`findUnrestorableField` checking only that `resources` was an object.

**Rollback decay.** `src/game/simWorker/simPrep.ts:145-146` (`[...(state.floatingTexts ?? [])]`) vs
`src/game/tickLayerRealtime.ts:218-241` (in-place decay).

**Gates.** `src/components/VillageRequestCard.tsx:41,52` (the prop is real and rendered) vs
`src/App.tsx` (never passed); `src/game/frontierCombat.ts:930` (`hasMilitiaWeapons`) vs the inline
`hasIronSpears || hasStoneSpears` in the raid card.

**Mini-map occlusion (finding 13).** `src/App.css:424-436` (`position: absolute; top/bottom: 0.75rem;
z-index: 30`) and `:444-448` (`left: 0.75rem; width: min(26rem, calc(100vw - 2rem))`) against
`src/components/MiniMap.tsx:183` (`absolute bottom-4 left-4`, **no** z-index) and
`src/components/GameMapStage.tsx:169` (mounted unconditionally — so it was never removed).
`src/components/GamePlayLayout.tsx:28-32` proves the geometry: `{buildRail}` is a direct flex child and
is `absolute`, so it consumes no width and `<main class="map-stage">` starts at x = 0 — the drawer
overlays it rather than displacing it, which is the recorded intent of the rule ("open a clear, wide
destination over the map instead of permanently squeezing the playable world into side columns").
The collapsed rail is excluded by `App.css:483-488` (`bottom: auto; min-height: 20rem`).
Cascade checked in the built artifact: `dist/assets/index-*.css` emits the repair **unlayered** (brace
depth 0 immediately before it) while Tailwind's competing `.left-4` sits at depth 1 inside
`@layer utilities`, so the override wins without `!important`.

**Save versus display (D-2).** `src/game/gameLoop.ts`, `exportAuthoritativeWorld` — the removed
`this.syncAfterWorkerMutation()` and `this.world = hydrateWorldRuntimeCaches(exported)`;
`src/game/simBuffers/simDelta.ts:428-460` (`applySimTickDelta` never assigns `paused`/`speed`) and
`src/game/simWorker/GameWorkerHost.ts:382-398` (the control dedupe). Probed: with the display paused
and the export not, `loop.getWorld() === display` was `false` before the fix and `true` after, with
`loopPaused` following it.

**Overlapping saves (D-7).** `src/game/simWorker/GameWorkerHost.ts:459-461` (`'Export already in
flight'`), `src/game/gameLoop.ts` catch → `console.warn('exportSave failed — using main shadow')`, and
`src/hooks/useGamePersistence.ts` writing whatever `exportAuthoritativeWorld` returned.

**Payload mutation (D-5).** `src/game/saveLoad.ts:78-84` (`pickWorldStateFromSave` copies top-level
keys by reference) and `migrateTickTimeline`'s `scaleField`, which assigns into those references.
Probed: `createdAtTick` read `700 → 2100` after one load of the same payload.

**beautyGrid.** `src/game/worldRuntimeCaches.ts:18-28` (the drop list, before the fix) against
`saveLoad.ts:296` and `workerBoundary.closure.test.ts:86`; the load-path rebuild gap at
`saveLoad.ts:752` (`rebuildEntityByIdMap` was the only derived state reconstituted).

**Logistics projection (D-1).** `src/game/renderSnapshot.ts` (`computeLogisticsOverlay(world)` per
snapshot) against `src/game/gameLoop.ts:817-854` (`snapshotDirtyKey` includes the camera) and
`updateView`'s per-frame camera lerp. Measured at 0.072 ms/call on a 903-entity / 120-building world.

**UI keyboard and overlap (D-9).** `src/components/MomentTitleCard.tsx` (no `useOverlayKeyboard`),
`src/App.tsx` (both decision cards at `top-4 z-10 … -translate-x-1/2`), `src/game/IntroScreen.tsx:334-340`
(the target-less window key handler beside a target-checking click handler),
`src/components/GameBuildRail.tsx:62-88`, `src/components/dashboard/GameDashboard.tsx:195-201`,
`src/components/BigNewsBanner.tsx:41-49`.

## Root cause

Three distinct mechanisms, and it is worth separating them because only the first is "a typo":

1. **Fail-open vs fail-closed on a shared resource (1, 2, 12).** The pool, the spatial index and the two
   action gates each had a *silent* failure mode: an unaccounted-for consumer, a discarded refresh, an
   unpassed prop. None threw, none logged, none was exercised by a test that asserted the negative case.
2. **A rule stated twice (2, 3, 5, 6, 7, 12).** The village anchor, the trade catalogue, the reputation
   gate, the trade-float label, the settler-name fallback and the raid gate each existed in two places.
   The second copy was always the wrong one, and the architecture guard that exists to catch this walks
   only `.tsx`, so the two `.ts` copies of `formatSettlerName` were structurally invisible.
3. **A missing invariant at a boundary (8, 9, 10, 11).** The save allow-list, the load validator, the
   rollback payload and the runtime-cache strip are each a *list of fields*, and nothing compared those
   lists against what the simulation actually writes and reads. `simPrep.rollbackClosure` proves the
   payload round-trips; nothing proved its converse.

The audit also **disproved** the highest-priority suspicion it started with: a field-by-field probe over
ticks 0/35/71/143/25919 and a fully populated world found **zero** rollback gaps, so the rollback payload
is closed. That negative result is recorded so it is not re-derived.

## Regression test

Three new files, **65 cases** in total, one or more per repaired defect plus the owner guards the existing
suite could not express.

**`tests/audit2026-09-21.regression.test.ts` — 30 cases** (the first batch):

- stone trade: owner-quoted prices, both gates, catalogue/panel wiring, and that the command validator
  accepts the new ops;
- trade float: the accumulated multi-resource form, and a source guard that the loop cannot go back to
  per-key assignment;
- reputation: the rise that reaches the cap **is** announced, a clamped-to-zero victory is **not**, and
  `addReputation` reports the applied delta; plus the shared eligibility gate is unchanged;
- marriage predicate: both statuses, that `stats.ts` uses it and contains no `=== 'married'` count, and
  that no second `isActivelyMarried` declaration exists anywhere under `src/`;
- settler name: the owner's fallback and joins, that both former copies delegate, and an **all-`.ts`**
  scan that no module re-types a nameless-settler fallback (the check the `.tsx`-only guard missed);
- village anchor: hall → house → settler mean, that the building half declines when it must, the exact
  case the renderer's copy got wrong, and that the renderer holds no private copy;
- rollback: the snapshot is not aliased to the live elements and the pre-tick values come back;
- save refusal: a well-formed payload loads (non-vacuous control), and a non-finite `tick`, a non-finite
  dimension, an incomplete purse and a non-finite storage cap are each refused **by name**;
- payload isolation: loading does not write through to the caller's object, and a second load of the same
  payload produces the same world rather than scaling it twice;
- durability: `villageCanHeat` is in the save allow-list;
- beautyGrid: the grid is rebuilt on load while the saved happiness survives, and the cache owner drops it;
- spatial grid: a same-cell refresh replaces the stored object, and a real move still transfers cells.

**`tests/gameLoop.exportAuthority.test.ts` — 4 cases** (D-2): the display world object survives a save, a
later tick result does not undo it, the export still reports the authoritative world, and a failed export
still falls back to the main shadow.

**`tests/useGamePersistence.test.ts` — +3 cases** (D-7): a second save coalesces onto the one in flight
(deterministic — the export is held open, and one export plus one write is asserted), a later save is not
blocked, and a retry after a failure succeeds.

**`tests/logisticsOverlay.cache.test.ts` — 5 cases** (D-1): a same-revision hit returns the *same* object,
and a tick change, a world-identity change, an explicit reset and an in-place mutation each recompute —
each asserted equal to the uncached projection first.

**`tests/ui-a11y.contract.test.ts` — 9 cases** (D-9): the card claims the keyboard through the shared hook
(with a non-vacuity check that the claim really is that call), neither decision card pins itself to the
overlapping offset and both are flow children, the intro skips activatable targets and `.intro-control`
while keeping its click half, every icon-only rail button is named, the Big News button no longer carries
`role="status"` (checked on its own attribute list, not on the text between its tags — a greedy pattern
flagged the correct inner live region), and the dashboard rows are keyboard-reachable.

Each case names the defect it pins and the observable symptom, so reverting a fix fails here rather than
silently restoring the old behaviour.

Each case names the defect it pins and the observable symptom, so reverting a fix fails here rather than
silently restoring the old behaviour.

## Invariants checked

- **Rollback closure** — every field a tick advances is in the `simPrep` payload. Probed empirically;
  0 gaps (see Root cause).
- **Single owner** — the village anchor, the marriage predicate, the settler name, the reputation clamp,
  the trade label and the raid/village-request gates each have exactly one definition, with a guard.
- **Durability symmetry** — a field the simulation reads across a save boundary is written to the save.
- **Cache hygiene** — `invalidateWorldRuntimeCaches` drops every non-serializable runtime slot.
- **Determinism** — `Math.random` appears nowhere under `src/` outside `simRng.ts` itself.
- **Buffer accounting** — `1 (display) + ticks in flight + 1 (command refresh) ≤ RENDER_BUFFER_POOL_SIZE`.

## Save/migration impact

- `villageCanHeat` joins `WORLD_STATE_SAVE_KEYS`. Old saves simply lack it and read as "heated", which is
  the pre-fix behaviour for a loaded day — no migration is required, and no existing save is rejected.
- The stricter load validation **refuses** payloads that previously loaded into a broken world. That is
  the intent, but it is a behaviour change at the boundary worth naming: a save truncated mid-write now
  reports "unrestorable — resources" (or the failing field) instead of loading a colony that cannot
  build. Well-formed saves are unaffected, proven by the non-vacuous control case. The check is strict
  about the **purse**: a `resources`/`storageMax` key that is absent is a refusal, not a default, because
  `undefined` in the purse is precisely the permanent-false affordability state.
- Loading now reconstitutes `beautyGrid` and isolates its payload, so a load is a pure read of the parsed
  object and a second load of it cannot scale tick values twice.
- No save-format version bump; no migration was added or removed.

## Verification result

| Check | Command | Result |
|---|---|---|
| Types (app) | `npx tsc -p tsconfig.app.json --noEmit` | exit 0 |
| Types (tests) | `npx tsc -p tsconfig.vitest.json --noEmit` | exit 0 |
| Types (node) | `npx tsc -p tsconfig.node.json --noEmit` | exit 0 — **now covers `gameWorker.node.ts`**, which no project checked before (D-4) |
| Lint | `npm run lint` | 0 warnings, 0 errors |
| Tests | `npx vitest run --exclude tests/fullYear.integration.test.ts` | **269 files / 1476 passed, 2 skipped, 0 failed** |
| New regression files | `npx vitest run tests/audit2026-09-21.regression.test.ts tests/gameLoop.exportAuthority.test.ts tests/logisticsOverlay.cache.test.ts tests/ui-a11y.contract.test.ts tests/placementOverlapIndex.equivalence.test.ts` | 53 passed |
| Import cycles | `npm run audit:deps` | 339 modules, 0 runtime cycles |
| Source hygiene | `npm run check:source` | OK |
| Duplication | `npm run dup` | **23 → 22 clones** (0.22 % → 0.21 % of lines) |
| Build | `npm run build` | exit 0, 9.93 s |

Baseline for comparison: 264 files / 1420 passed, 2 skipped. **No test was deleted, skipped or
weakened.** The only edits to existing tests were two source guards re-pointed at the repaired shape and
disclosed here: `tests/logisticsOverlay.projection.test.ts`'s `PROJECTION_OWNER` now accepts the memoised
accessor the snapshot legitimately calls (with a new non-vacuity case for the new spelling), and a
`describe` name/case in `tests/useGamePersistence.test.ts` gained the three coalescing cases.
`tests/medium-persistence.test.ts` was **not** changed — it correctly rejected a first cut of D-8.
`tests/ui-a11y.contract.test.ts`'s second `describe` was **rewritten** (not weakened): its two cases
asserted class strings against a parent that was never the parent, and one of them passed while the
cards it guarded were in the wrong corner. It now asserts DOM ordering inside the box the cards really
render in, keeps both original negative assertions, and adds a case that fails if `GameOverlays` is
padded for them again (9 → 10 cases).

**Not run:** `npm run test:full-year` (the 360-day invariant harness) and `npm run test:browser` (needs
a prior build and a live browser). Neither is claimed as passing. D-9's four UI repairs and the renderer
batch's visual result were verified by source guard, typecheck and the overlap-index equivalence test —
not by a browser pass. **Finding 13's repair is also not browser-verified:** it rests on the CSS
geometry (an absolutely-positioned flex child consumes no flow width, so the map stage starts at x = 0)
and on the built stylesheet's cascade layers (`dist/assets/index-*.css` emits the rule unlayered, brace
depth 0, while Tailwind's `.left-4` sits at depth 1 inside `@layer utilities`). Both are checkable from
the artifact and were checked; neither is a rendered observation, so the owner's eyeball on a real
window remains the confirmation for it.

## Related commits or files

**Changed to fix:** `src/game/simWorker/GameWorkerHost.ts`, `src/game/spatialGrid.ts`,
`src/game/villageAnchor.ts` (new), `src/game/frontierCombat.ts`, `src/game/groupEvents.ts`,
`src/game/civilStatus.ts` (new), `src/game/simHelpers.ts`, `src/game/stats.ts`,
`src/game/citizenOverview.ts`, `src/game/familyTree.ts`, `src/game/socialLife.ts`,
`src/game/workforce.ts`, `src/game/villageLeadership.ts`, `src/game/renderer/humans.ts`,
`src/game/renderer/entityCache.ts`, `src/game/simBuffers/renderSoAEntities.ts`,
`src/game/simWorker/simPrep.ts`, `src/game/saveLoad.ts`, `src/game/saveSchema.ts`,
`src/game/worldRuntimeCaches.ts`, `src/game/virtualPlayer.ts`, `src/game/gameEngine.ts`,
`src/components/VisitorCampPanel.tsx`, `src/App.tsx`, `src/App.css` (finding 13),
`src/components/GameOverlays.tsx` (D-9b correction), `package.json`.

**Changed to verify:** `tests/audit2026-09-21.regression.test.ts` (new),
`tests/gameLoop.exportAuthority.test.ts` (new), `tests/logisticsOverlay.cache.test.ts` (new),
`tests/ui-a11y.contract.test.ts` (new), `tests/useGamePersistence.test.ts` (+3 cases),
`tests/logisticsOverlay.projection.test.ts` (one guard widened, disclosed above).

**Still open, with evidence, and NOT claimed as fixed** — the renderer batch closed most of D-3; what
remains open, deliberately rather than by omission:

- **D-3 residuals** — two LOW items: the per-frame viewport washes/vignette (`terrain.ts` void + sun,
  `overlay.ts` vignette) and the per-particle smoke gradient (`particles.ts`) — these are one gradient per
  frame or per few particles, not the per-entity cost the AO blob fixed, and caching a `CanvasGradient`
  across context recreation is the regression risk; and the per-repaint `markers.ts` id `Map` plus the
  `drawHuman` closure built per human per repaint in `humans.ts` — LOW, and the fix is an inline refactor
  of the human draw loop rather than a cache.
- **D-6** — the manual-save "Game Saved! 💾" floating text is written into the display world, whose
  `floatingTexts` the next worker delta replaces wholesale, so it vanishes in ~0.3 s while unpaused and
  never decays while paused. The two honest fixes are opposite user-visible choices (route the confirmation
  through the worker as a new protocol command, or drop the float and keep the toast), so it is an owner
  call rather than a mechanical repair.

**One observation noted, not fixed:** `BuildingRotation` is declared as `0 | 90` in `buildingRotation.ts`
(placement orientation) and as `0 | 90 | 180 | 270` in `buildings.ts` (strip/wall-corner orientation) —
two same-named types over two different domains. It compiles because the domains never mix, but a reader
cannot tell from the name which is which. Left untouched in this pass rather than renamed.

**Also not covered, stated so it is not mistaken for done:** `npm run test:full-year` and
`npm run test:browser` were not run; the renderer batch's visual result is reasoned from output-identical
changes and the overlap-index equivalence test, not a browser pass.

**Investigated and disproved** (recorded so they are not re-derived): the rollback payload is closed;
`screenShakeImpulse` is not swallowed by the worker's one-shot clear; no `Math.random` in the simulation
or a render path; no mutation-during-iteration in the tick layers; the two simulation invariants that
fire in `foodLedger.acceptedCatch` are test-fixture artefacts, not product defects; screen-shake
impulses are not lost between frames.

## Fix

Twelve repairs, each minimal and each pinned by a case:

1. `canPipelineTick()` also requires `pendingCommand == null`, so the host stops posting ticks while a
   command is outstanding and the `1 + ticks + 1` buffer accounting closes. The command is never dropped
   — `applyCommand` queues it on its own chain and posts as soon as the tick slot frees.
2. `insert` compares object identity in its same-cell branch and replaces the bucket entry, keeping the
   O(1) fast path for the simulation (stable identity) and refreshing the render path's new shims.
3. `buy_stone` (20 gold → 25 stone) and `sell_stone` (35 stone → 20 gold) added to
   `VISITOR_TRADE_COSTS`, priced against the wood/iron neighbours; both buttons wired into
   `VisitorCampPanel`; `buy_stone` added to the virtual player's shortage list under a named
   `LOW_STONE_STOCK` (the Quarry step's inline `60`, now named for its second reader).
4. New leaf module `civilStatus.ts` exports `isMarriedOrExpecting`; `stats.ts` counts with it and the two
   private `isActivelyMarried` copies in `familyTree`/`socialLife` are gone.
5. `addReputation` returns the amount actually applied; the banner is gated on `granted > 0`.
6. The float reads `resourceTypes.formatResourceAmounts` over what actually landed.
7. Both `formatSettlerName` copies delegate to `citizenId.humanDisplayName`.
8. `villageCanHeat` added to `WORLD_STATE_SAVE_KEYS`.
9. `findUnrestorableField` refuses a non-finite `tick`/`width`/`height`/`nextEntityId`/`nextBuildingId`
   and any `resources`/`storageMax` that is missing a key or carries a non-finite one.
10. `extractSimPrep` maps `floatingTexts`/`deathParticles` element-wise, the depth the entity and
    building clones already used.
11. `beautyGrid = undefined` added to `invalidateWorldRuntimeCaches`.
12. `App.tsx` passes `getVillageRequestEligibility(...).blockReason` and calls `getRaidChoiceEligibility`
    for both card branches, rendering the owner's own reason; the now-unused inline cost/weapon imports
    were removed.

**The follow-up batch — eight more, each minimal and each pinned:**

13. `exportAuthoritativeWorld` no longer calls `syncAfterWorkerMutation()` and no longer adopts the export;
    it returns the hydrated authoritative world and leaves `this.world` as the display left it (D-2).
14. `persistGame` holds the in-flight save in a module-scoped promise and makes a second caller await it,
    clearing it in a `finally` so a failure is still retryable (D-7).
15. `loadGameFromParsedOutcome` `structuredClone`s its input once at the entry point and reads every
    payload field through the copy; a clone failure is reported in the `unrestorable` shape (D-5).
16. `rebuildBeautyGridFromWorld` (new, split out of `tickBeauty` so happiness is not recomputed) runs on
    load, and `beautyGrid` joins `invalidateWorldRuntimeCaches` (D-8).
17. `computeLogisticsOverlayCached` memoises the projection on world identity plus the tick;
    `resetRendererCaches` drops the memo; `renderSnapshot` calls the cached accessor (D-1).
18. `MomentTitleCard` uses `useOverlayKeyboard('moment-title-card', …)` (D-9a); the story and diplomacy
    cards are flow children of **one anchored, centred column** inside the map stage's own
    `absolute inset-0 z-10` overlay — the box they actually render in — which stacks them and keeps
    them off its top-left corner (`pt-4` on `GameOverlays` was the wrong container and is removed;
    see the regression note in Status history) (D-9b); `IntroScreen`'s key handler skips
    `isActivatableTarget` and `.intro-control` (D-9c);
    `GameBuildRail`'s three icon-only buttons gained `aria-label` and `type="button"`,
    `GameDashboard`'s settler rows became keyboard-reachable buttons with an explicit name, and
    `BigNewsBanner`'s live region moved off the dismiss button onto its content wrapper (D-9d).
19. `tsconfig.node.json` now includes `src/game/simWorker/gameWorker.node.ts`, with `DOM` and
    `vite/client` added to that project so the modules it imports resolve (D-4).
20. `package.json`'s duplicated `@tauri-apps/cli` devDependency key removed (C-6).

**The renderer hot-path batch — D-3 worked to a recorded state, plus the tile-size single source:**

21. The animal viewport cull uses the sprite anchor's per-axis extents (`0.88` up, `0.12` down,
    `aspect/2` wide) instead of a symmetric `0.75 × spriteH` pad smaller than the upward extent (R-10).
22. `viewState` owns single-axis `worldToScreenX`/`worldToScreenY` (and `worldToScreen` delegates to them);
    the grid overlay calls them instead of allocating a `[x, y]` tuple per line (R-6).
23. `drawBuildings` caches the completed-depth list keyed on the buildings array identity plus the
    qualifying count, so it re-sorts only when a building is added/removed or completes (R-12).
24. `buildRenderSnapshot` skips `getEntityByType` in the SoA path (a shared frozen empty table) and uses
    the world's own alive array, so the worker path stops copying N references into ten fresh objects per
    frame (R-3).
25. `drawGroundAO` composites one cached pre-rasterized radial blob instead of a per-entity gradient;
    the fallback keeps the exact old gradient in a non-DOM environment (R-5, the per-entity half).
26. `canPlaceBuildingSnapshot` answers the overlap through a cached spatial occupancy index, equivalent to
    `overlapsAnyBuilding` and proven so by `tests/placementOverlapIndex.equivalence.test.ts` (R-7).
27. `RenderSoABuckets` carries `shimById` built once per tick, and `drawHuntChaseLines` reuses it and
    iterates the two draw buckets directly — no per-repaint id `Map` and no combined-array spread (R-11).
28. `PIXELS_PER_TILE` (frontierCombat) and `PLACEMENT_TILE_SIZE` (placementUtils) are removed in favour of
    the owner `TERRAIN_TILE_SIZE`, so the world-units-per-tile value has one definition; a source guard
    fails on their return.

**The owner-reported occlusion, and two corrections to this pass's own work:**

29. **The mini-map yields to the overlay, not the other way round** (finding 13). The catalogue's width
    is published once as `--build-drawer-width` on `.game-shell` and read by `.game-view-drawer--build`,
    so the drawer width has a single definition; one unlayered rule slides the mini-map clear while the
    catalogue is open —
    `@media (min-width: 721px) { .game-shell:has(.game-view-drawer--build.game-view-drawer--open) .minimap-frame { left: calc(0.75rem + var(--build-drawer-width) + 0.5rem) } }`.
    Below 721px the same media query already widens the drawer across the whole map (`App.css`), so there
    is no room beside it and the mini-map stays where it is. No `z-index` was raised: stacking the
    mini-map above the drawer would have hidden the catalogue's own controls instead.
30. **D-9b's parent was wrong and is corrected.** `GameOverlays.tsx` loses the `pt-4` it was given for
    cards it does not contain; `App.tsx` wraps both authored-decision cards in the anchored centred
    column described in item 18. `tests/ui-a11y.contract.test.ts`'s second `describe` now asserts DOM
    **ordering** — column, then story, then diplomacy, with exactly one column — instead of matching a
    class string against a container that was never the parent, and gains a case that fails if
    `GameOverlays` is padded for those cards again.
31. **A regression introduced by this pass's own S-8 repair, and its correction.** S-8's first cut
    replaced `if (existingIdx === newIdx) return;` with an unconditional `bucket.findIndex` in the
    same-cell branch — the per-entity hot path of every tick — so a stationary entity cost an O(bucket)
    walk every tick despite a comment claiming an identity fast path. `EntitySpatialGrid` now keeps
    `entityStored` (id → the object currently in its bucket) and the branch returns on a single `Map`
    read. The magnitude is measured and modest — `tmp/probe-tick-cost.mts` reported **0.837 ms/tick**
    for `gameTick` over 796 entities, and `7.63 ms` to reconcile 20 000 stable entities — which is a
    real regression but **not** enough to explain the owner's >10 s worker stall; that stall is
    pre-existing and is not claimed as caused by this. An equivalence test
    (`tests/audit.hotPathScans.equivalence.test.ts`) and the existing same-cell refresh case in
    `tests/audit2026-09-21.regression.test.ts` pin it.


