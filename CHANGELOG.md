# Changelog

## <u>[0.6.4.1]</u> — 2026-08-28

- **Large-file decommissioning — completed slices** — reduced the simulation’s largest god-file responsibilities by extracting building commands from `buildingActions.ts`, daily orchestration from `App.tsx`, daily-system ownership from `tickLayerDaily.ts`, and residency ownership from `residency.ts` into focused modules with compatibility facades where needed.
- **Residency ownership** — completed selection and scoring (`residencySelection.ts`) plus occupant, partner-transition, event/death/recruitment, and import/load reconciliation (`residencyReconciliation.ts`). The `residency.ts` compatibility facade was then **retired**: all nine callers now import the four focused owners directly (`residencyOccupancy.ts`, `householdComposition.ts`, `residencySelection.ts`, `residencyReconciliation.ts`) and `dayCycle.ts` keeps the compatibility re-exports, so no import path or save field changed.
- **Truth and regression coverage** — updated ownership governance and the decommissioning plan, preserved worker-command and save/load boundaries, and validated the completed residency slices with TypeScript, Oxlint, targeted simulation tests, deterministic long-run coverage, and production build checks.
- **Constants — one declared home per number** — `gameConstants.ts` is now the single source of truth, organised into named sections (`Time`, `Human`, `Animal`, `Prison`, `Social`, `Famine`, `ValleyEcology`) and imported by the modules that own the behaviour instead of being restated locally. Every entry states *why* it holds that value, including values that come from playtesting rather than a formula. `docs/CONSTANTS_GUIDELINE.md` records the standard and `docs/plans/constant-centralization-plan.md` tracks the migration; the remaining categories (ecology, settlement, production, world-gen, moon, story) are follow-up slices.
- **Colony larder — one meal rule, one owner** — the meal rule (1 food for 65 energy, hungry settler, meal-check hour) existed twice in `humanTick.ts` with different guards, and only one copy verified that the eater was a player settler. It is now `tryEatColonyMeal()` in `simulation/humanNeeds.ts`, so the player-settler gate belongs to the rule rather than to each call path, and the restore amount is `Human.MEAL_ENERGY_RESTORE`. The same pass extracted the exhaustion-death sequence (`killFromExhaustion()`), the map-edge clamp (`mapBounds.ts`, shared with `tickLayerSystems.ts`), and collapsed a duplicated leisure steer, removing all four `humanTick.ts` self-clones (duplicate scan 62 → 57 clones at default sensitivity, 0 at the project's configured thresholds). Death causes, food arithmetic, cadence, and map-boundary behaviour are unchanged.
- **Elections — the term token now tells the truth** — the scheduled election was named and stored as `decennial` ("every 10 years") long after terms had been shortened to 5 and then to `ELECTION_INTERVAL_YEARS` (2). The token is now `'term'` across the reason type, `ElectionCeremonyState`, and `tryStartTermElectionCeremony()`; the leadership panel's copy and the leadership type comments match the real cadence. Saves written under the old name are migrated on load (`validateVillageLeaderOnLoad` rewrites `decennial` → `term`), so **no save-version bump is required** and existing colonies keep their head of village.
- **Famine desperation — the foot-bite joke** — with the larder genuinely empty, a settler at or below 30% energy may lunge at a neighbour's foot (15% daily attempt, 40% to land). Deliberately **non-lethal**: nobody dies and nobody loses energy, but the victim is not amused, so the pair loses 8 friendship on a miss and 16 when it lands. The event is logged as a scandal, and the Traveling Theatre can stage *The Famine Foot* from it.
- **Prison guard duty — 24-hour coverage with a real consequence** — one staffed guard covers an 8-hour shift, so a completed Prison needs 3 `prison_guard`s for full coverage. While the Prison holds prisoners with coverage short, each unguarded hour carries a 5% escape chance; an escape frees one prisoner early rather than removing them from the colony. New daily owner `prisonGuardDuty.ts` on its own deterministic RNG stream.
- **Leader residency survives marriage changes** — a remarriage or divorce could leave the leader's household stranded outside the manor. `leaderHouse.ts` now runs an idempotent daily `syncLeaderHouseResidency()`: it evicts non-household occupants, moves the leader's household in, re-homes anyone evicted, and writes the change to the chronicle **once** (no repeat events on later days).
- **Leader's House sits on its ground** — the manor's sprite anchor moved `0.97 → 0.836` to match the painted art's base (~91.6% of frame) above its 86 px transparent bottom band, so the building no longer reads as offset from its footprint.
- **Valley ecology parked, not deleted** — the Stable → Strained → Damaged → Collapse ladder is dormant behind `ValleyEcology.ENABLED = false`, because its strain messages gave the player no agency and had no real consequence. While parked, the effective stage always reads `stable`: no transitions, notifications, focus hints, or hidden hunt/farm/illness effects, while wildlife counts and Nature information stay visible. The ladder is kept in code and re-enabling it is a one-flag change. The lumber-mill "nearby tree" yield multiplier was deleted outright (`treeProximity.ts` removed).
- **Female settler class ladder — ten characters** — the ten cut female portraits (Mudlark → Factory Hand → Scullery Maid → Pioneer → Shop Assistant → Governess → Merchant's Wife → Wealthy Gentry → High Society → Aristocrat) are wired as a weighted social ladder: about 47% of village women are the bottom two classes and about 1.5% the top two, so a grand court dress in the wilderness reads as a real event. Male settlers keep their existing eight variants until matching art exists.
- **Dead code and misleading aliases removed** — deleted the dead exports `ASSIGN_PULSES_PER_DAY`, `getTraitDef`, `hasTraits`, and the unused private `spatialGrid.cellIndex()`, dropped the orphaned `Entity`/`TICKS_PER_DAY` imports and the `YearlyStats.population.trees` field, and removed the re-export aliases that made unused names look used. Oxlint reports 0 warnings / 0 errors.
- **Fixed: speed and pause controls reverted on the next command** — choosing 5×, 10×, or 0.5× (or pausing) was undone by the next ordinary action, because every command rebuilt the display world from a deep clone of the worker's last received snapshot, and `speed`/`paused` are fields of that world. The snapshot predates the click (its `setSpeed`/`setPaused` message is still in flight), so the chosen value was silently replaced by the old one and never resent — `mutateWorld` only forwards a control when it changed. The two player-authored controls are now carried across the display rebuild (`carryPresentationControls`), so the choice outranks a stale snapshot while every authoritative simulation field still comes from the worker. Pause had the mirror-image failure (display read "playing" while the worker still ignored ticks). Regression test `tests/gameLoop.speedControl.test.ts` fails with `expected 1 to be 5` when the carry-over is removed.
- **Elections — term rationale recorded** — the reason `ELECTION_INTERVAL_YEARS` is 2 rather than 10 is now documented beside the constant: it is a session-length decision from playtesting, not a lore figure (a day is 48 real seconds at 1×, so a 10-year term spans many sittings at any speed a player sustains, and higher multipliers are nominal because at most `MAX_PIPELINE_DEPTH` = 4 worker ticks can be in flight).
- **Fixed: a jailed leader lost the office** — a scandal arrest stamped the offender's occupation to `settler` with no office guard, and `releasePrisoners()` emptied the prison fields without restoring anything, so a leader could leave prison as a plain settler while still holding `villageLeaderId` (caught by the full-year invariant gate at day 60, root-caused with a temporary per-tick probe to the exact arrest tick). The office now survives both transitions, ordinary work is re-assigned afterwards by the normal assignment layer, and the Moon Howler revert path — which had the same shape, defaulting the occupation to `settler` unless a job slot happened to be free — is hardened the same way. This is a regression fix for the 2026-08-28 leader-occupation report, whose earlier fix only stamped the office at handover and load.
- **Auto-play phase 2 — civic infrastructure** — new step 8 (`decideCivic`) builds the **Town Hall** and then a **Blacksmith**, first copy only and one at a time. The Town Hall is what made the old step 7 (festival) unreachable in practice, and carries taxes, trade, elections, and the scandal buffer; the Blacksmith is what gives the researched forge something to do and what gates the Mine in step 9. Both are research-gated and the gate is not restated — `canPlaceBuilding` refuses a locked building, so the step simply waits until the owner research lands (the placement owner requires the research *node* to be `researched`, not just listed in `unlockedTechs`). Two regression tests cover the build once `forestry_1` is researched and the wait before it.
- **Auto-play now builds the economy instead of idling** — the bot's ladder only ever built Houses and food producers, so it spent its opening wood and gold, `canAfford` then failed for every step, and it sat idle for the rest of the run; nothing in the ladder produced wood, stone, iron, or gold. New step 8 (`decideIndustry`) builds the first **Lumber Mill** when wood drops under 120, a **Quarry** under 60 stone, a **Mine** under 20 iron (only once a Blacksmith stands — there is nothing to forge otherwise) and a **Store** under 80 gold, one at a time, and only when `canAfford` and `canPlaceBuilding` agree, so a research-gated building simply waits its turn. Two regression tests cover the shortage build and the Mine's smith gate.
- **Fixed: notifications never left the screen on their own** — ordinary toasts had no timer, so they only disappeared when the player clicked the ✕ and otherwise piled up on screen; Big News already had a wall-clock auto-dismiss. `useTransientGameFeedback` now schedules one timer per visible notification (`NOTIFICATION_DISPLAY_MS = 12 s`) and dismisses it through the same durable `dismissedNotificationIds` path, without the click feedback a manual dismiss plays. Stale timers are cleared when a notification disappears and on unmount.
- **Fixed: settlers could be named from the 10-name boot fallback** — every naming site (`entityFactory`, `worldGen`, births, immigration) draws from whatever pool is installed *at that moment*, and the loader's eager load-on-import had been removed (so one test could observe the pre-load state), leaving those sites on the embedded fallback until something else called `loadNames()`. The load starts on import again; the explicit `await loadNames()` calls at app boot and in the worker are unchanged, and the loader's own test now imports a fresh module instance and asserts the contract that matters — census pool in, boot/legacy markers upgraded — instead of a transient pre-load state.
- **Fixed: the hunting arrow came out of the building** — a staffed Hunting Spot resolves its kill in the daily economy layer, and that used to emit the hunt visual from `building.x` / `building.y` with `hunterId: building.id`, so the shot read as an automatic tower firing (the defect half that survived the arrow-shape fix in `de98bd6`). The shot now leaves the **live assigned hunter's position**, and an unstaffed Hunting Spot emits nothing at all — kill resolution, damage, reward, and wildlife removal are untouched. Regression test `tests/huntVisuals.origin.test.ts` drives the real `initGame` + `gameTick` path and fails against the old building-anchored emission.
- **Fixed: three child sprites shipped with an opaque pale rectangle** — `child_boy_bakersboy.png`, `child_boy_merchantson.png`, and `child_girl_poorservant.png` were 100 % opaque with a pale matte baked into the pixels, so those children rendered as a pasted rectangle over the terrain. The matte was removed offline (border flood-fill matched to the art's own near-white tone, art-side as the report prescribes — no runtime keying was added): each file now measures 40–59 % transparent with under 0.25 % near-white opaque coverage, and enclosed light details survive. The requested asset-contract test is still missing (the Node test tier has no PNG decoder); how the sprites read over grass/forest/water/snow at play zoom is still a human check.
- **Developer: `npm run build` no longer writes `*.tsbuildinfo` — and no longer hunts for emitted `.js`** — the build ran `tsc -b`, whose up-to-date check looks for each project's *emitted* output, so a `noEmit` project was permanently "out of date because output file 'src/App.js' does not exist" (a full re-check on every run) while the incremental file was dropped beside the tsconfigs — `tsconfig.app.tsbuildinfo` and `tsconfig.node.tsbuildinfo` in the repository root. `build` now runs the two projects the same way `test:types` already runs the test project — `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit` — with identical coverage and no build-info file at all. The two stray root files were deleted, both configs still point `tsBuildInfoFile` at `node_modules/.cache/` so a manual `tsc -b` cannot litter the root again, and `*.tsbuildinfo` stays in `.gitignore` as a safety net.
- **Mine retune — ores only, and available from day one** — a Mine now extracts **iron or gold**, chosen per mine, and stone is the Quarry's job (the Quarry already produced stone only; the Mine's old `stone` default is gone). The Mine no longer requires the **Deep Mining** research, so a new colony can mine immediately, and it costs **30 wood · 15 stone · 15 gold** (was 40 · 20 · 25). `MINE_ORES` is the single list behind the picker, the worker command union, and the command validator; `mineOreForMode` returns gold only when the player chose it, so a save written while the Mine still had a `stone` mode extracts iron instead of minting gold. The two research labels that would otherwise lie were corrected: **Deep Mining** now reads "Quarry yield +20%" (it never unlocked the Mine again) and **Refining** reads "Mine output +30% · unlocks Iron Pickaxes forge order".
- **Fixed: the build was red — `assignResident` did not match its owner** — the working tree added a worker command `{ op: 'assignResident'; buildingId; humanId }` routed to `assignResidentToBuilding(...)`, but that residency owner takes only a building id (it re-runs *automatic* assignment; settlers pick homes themselves) and the main-thread route calls it two-argument. With no sender anywhere setting `humanId`, the command now matches its owner: the project typecheck exits 0 again. A future per-resident "assign this settler" action belongs in the residency owner first.
- **Fixed: the camera clamp showed an empty ring around the world again** — `viewState.clampCameraTarget` gained a `viewportW !== worldW` guard and a 5% margin, so a viewport exactly the size of the world skipped the viewport-aware branch (cap `worldW`, ring visible) and the overscroll allowance was 2.5× the documented value. The branch is now taken whenever a viewport is supplied, and the margin is back to the documented 2%; the three `tests/cameraClamp.viewport.test.ts` regression cases are green.
- **Fixed: the name loader started a file read as an import side effect** — `nameLoader.ts` ended with a module-level `loadNames()`, so importing it for any reason began an async disk/fetch load and raced the boot-fallback contract (a timing-dependent red in `tests/nameLoader.poolUpgrade.test.ts`). Removed: `App.tsx` (`Promise.all([preloadAllSprites(), loadNames(), …])` and the pre-`initGame` await) and `gameWorker.ts` already load names explicitly.
- **Tests: two contracts re-pinned to the implementations they cover** — `pathfinding.test.ts` now asserts the deliberate endpoint snapping (a blocked start or goal resolves to the walkable tile beside it, and a genuinely unreachable goal still returns `null`) instead of the old fail-outright contract, and `humanMovement.ts` again includes both endpoint tiles in the *no-entity* `commutePathCacheKey` fallback, so different commutes cannot collide while the per-entity key keeps its tile-stable behaviour for the sole caller.
- **Auto-play builds the Leader's House first** — the bot's first colony act is now the **free** Leader's House (`BUILDING_CONFIGS.LeaderHouse.cost` is all zeroes and the building is unique), which world generation never places, so a fresh colony gets its official residence before staffing, housing, or food. Cards are still answered first (that is the documented invariant), and the step retires itself the moment a house stands or is on the way.
- **Fixed: auto-play starved the colony ladder on an unanswerable card** — the bot proposed the card answer it *preferred* rather than one the card owner accepts. `respondToRaidEvent` refuses `defend` without spears and `payoff` without the tribute food, and `respondToStoryEvent` **re-queues** a refused answer, so the card stayed open while the bot re-proposed the same refused answer every in-game hour: no Farm, no staffing, no housing, no research — exactly the reported "doesn't build farms or other things". Each card owner now exposes its own answer eligibility (`getRaidChoiceEligibility` in `frontierCombat.ts` — which `respondToRaidEvent` itself now applies — plus `getStoryChoiceEligibility` in `storyEvents.ts`, fed by the theatre, deer-parliament, wedding, and invention-fair owners), the same contract `getDiplomacyChoiceEligibility` already provided, so no accept rule is restated in the bot. When no answer can land, the bot leaves the card and gets on with the colony.
- **Fixed: the Leader's House's beds counted as spare settler housing** — `decideHousing` asked `populationGrowth.getOpenBeds`, which counts every residence including the Leader's House. Its 12 beds are reserved for the leader's household (`leaderHouse.syncLeaderHouseResidency` evicts and re-homes anyone else), so once one stood the guard read "9 beds free" for three homeless settlers and the bot never built a House again. The new `getOpenPlayerBeds` counts only beds a settler may be assigned; `getOpenBeds` keeps its existing meaning for population and diagnostics.
- **New: in-app virtual player (🤖 Auto-play)** — a pure, stateless decision engine (`virtualPlayer.ts`) plus its driver hook (`useVirtualPlayer.ts`) that plays the real game **on screen**: at most one real `WorkerCommand` per in-game hour, dispatched through the player's own door (`applyGameAction`, so with the worker active it travels the real worker transport), never mutating `WorldState`. It answers open cards first (raid → outgoing war-band → diplomacy → Village Request → story), then staffs an empty workplace, houses the homeless, tops up food, starts affordable research, and hosts a festival; every placement is validated with the game's own `canPlaceBuilding` rules and anchored on `getPlayerCampCenter`, with tuning in a documented `gameConstants.VirtualPlayer` section. The header shows the current decision plus a five-act history, and the FPS meter — now reporting current / min / avg with a sample count — switches on with it beside a `settlers · buildings · acts` readout, so frame cost can be watched as the colony grows. The Auto-play toggle is **dev-only** (`import.meta.env.DEV`); Village Request / diplomacy answers now respect gold and eligibility gates so a failed accept cannot stall the hourly act.
- **New: Family tree in Valley Overview → Village** — browse settlers by surname, then open a stamboom for anyone: grandparents, aunts/uncles, parents, spouse, siblings, children, nephews/nieces, and grandchildren (English labels). “Find on map” jumps to the selected person.
- **Fixed: Village/dashboard “Go →” buttons did nothing** — `GameOverlays` uses `pointer-events-none`, and `GameDashboard` never re-enabled clicks, so concern Go buttons were dead. Dashboard now has `pointer-events-auto`, closes before navigating, and Valley overview Go/Place actions that need the map close the overlay first.
- **UI: one Overview button opens the Valley overview** — the right column is a single **Overview** control. Inside the overlay you pick Village, Frontier, Nature, Progress, Log, or More. Hotkeys (V/F/N/P/L/M) and alerts still jump to the matching panel. The narrow rail hides while the overlay is open.
- **Fixed: intro music kept playing into the game** — leaving the title screen only called `introMusic.stop()`, while bootstrap gesture listeners still invoked `ensureIntroAudio()` during map setup (director `gameplayActive` was still false), and an in-flight `start()` could finish after `stop()` and revive the track. Intro is now explicitly dismissed when leaving the title (`setIntroAudioAllowed(false)`), `ensureIntroAudio` respects that flag, and `stop()` bumps a generation so late starts cannot resume.
- **Fixed: settler names stayed on the tiny boot pool** — `ensureNamesLoaded()` installed a 10-name embedded fallback and `fixDefaultNames` only rewrote John/Mary/Smith, so after the full lists loaded most founding settlers kept Elijah/Batten-style defaults. Full-file loads now mark the pool as `full`, and `fixDefaultNames` upgrades boot-fallback names once those lists are ready. The boot markers were also changed to strings **absent from the census files** (the old set — including Whitaker — overlapped `last-names.txt`, so a real file draw looked like a default). Legacy overlapping boot names are upgraded once; later Whitaker/Elijah draws from the files are kept. New games await `loadNames()` before `initGame` so founders are named from the lists.
- **Fixed: Nature tab listed trees as wildlife** — trees are scenery/resources, not livable wildlife; the Trees bar is removed from the Nature wildlife population panel (yearly stats already dropped `population.trees`).
- **Fixed: missing mountain sprites no longer preload** — boot no longer requests `/sprites/mountains/*.png` until that art ships (stamp already no-ops when the image is absent).
- **Package manager** — `pnpm` removed from runtime `dependencies`; `packageManager` field set; conflicting `yarn.lock` / regenerated `package-lock.json` removed so `pnpm-lock.yaml` is the single lockfile.
- **Regression tests added in this working tree** — `tests/virtualPlayer.test.ts` (15 — the auto-play ladder and its once-per-in-game-hour cadence rule), `tests/conceptionEvent.labelling.test.ts` (4 — an expectation is no longer logged as a delivery), `tests/humanNeeds.mealRule.test.ts` (9 — every larder-meal gate, including the visitor refusal), `tests/gameLoop.speedControl.test.ts` (3 — speed and pause survive a display rebuild; fails `expected 1 to be 5` without the fix), `tests/villageLeadership.legacyElectionToken.test.ts` (3 — the `decennial` → `term` save migration), `tests/leaderRemarriage.residency.test.ts` (2 — the leader's household after a remarriage), `tests/famineDesperation.test.ts` (3 — the foot-bite is non-lethal). Updated: `tests/renderer.presentationLayout.test.ts` (the manor anchor is asserted against the old full-frame value no longer being used), `tests/huntLogic.test.ts` (the parked valley no longer cuts hunt yield), `tests/electionGossip.dedup.test.ts` (renamed term token). Suite: **95 files / 507 tests**, local-only — `tests/` is gitignored by design and is never committed or pushed.
- **Fixed: a conception was logged as a birth** — the "expecting" announcement re-used the `'birth'` event type, so every consumer that filters on births inherited the error: a 360-day run at seed 12345 reported **56** birth-typed events against **32** completed deliveries, the Chronicle's "Births" filter doubled up, and the council report, the `first_birth` tutorial watch, and the rumour ledger's family category all treated an expectation as a child. Expectations now carry their own `'conception'` type: the Chronicle gains a **Conceptions (expecting)** filter (🤰) beside **Births**, and the council report prints `Births N · Expecting M · …` from two separate buckets. The scope is the label, not the pregnancy — the conception owner and the daily cadence are unchanged, `birthsCompletedThisInterval` always counted deliveries, and the log passes through load unchanged, so **no save migration or version bump is required** (historical `'birth'` entries keep reading as births). The affair helper deliberately stays `'scandal'`: the secret is the event the Chronicle and scandal feed must show, and it never inflated births. `EventLogPanel`'s exhaustive `Record<GameEventLog['type'], …>` icon/colour maps mean a future event type cannot be added without deciding how it looks. Regression test `tests/conceptionEvent.labelling.test.ts` pins the married writer, the youth-love writer, the council line, and a real delivery.
- **Balance — affairs are rarer** — the per-pair daily tryst chance was halved (0.14 with a church, 0.20 without), because a same-seed year at the old values produced 55 established affairs, 176 scandal events, 60 exposures, 28 imprisonments and 67 divorces, so scandal drama dominated the social simulation. The multipliers (festival 1.4, performers 1.35, cohabiting 1.55) are deliberately unchanged so the size of the change is attributable to one knob, and every value now lives in `gameConstants.ts` as a documented `Relationship` section. Same-seed year after: 40 affairs, 84 marriages, 34 divorces, 20 caught scandals.
- **Known behaviour: courtship is a one-day process** — the courtship rate is ~96–144 progress per in-game day while marriage needs 100, and there is no cooldown after a divorce, so a settler can divorce and remarry within two days. Left as-is pending a decision: the candidate fixes are a post-divorce cooldown (mirroring the widow `griefUntilTick` pattern) and/or a slower courtship rate. Recorded, not changed.
- **Private bug records preserved** — reproducible defects found in this working tree (leader remarriage residency, Leader's House anchor, duplicated larder rule, stale election token, speed/pause revert, broken full-year gate, conception logged as a birth, jailed leader losing office, and the four missing mountain sprite paths) each have a local record under `BUG_REPORTS/` with root cause, fix, regression test, and save/migration impact. Three remain open and are documented as such: the three child sprites without an alpha channel, the Hunting Spot arrow still emitted from the building, and the unshipped `/sprites/mountains/*.png` art (found by the new browser tier).
- **Browser acceptance harness — a test tier the project did not have** — every existing check runs in Node (`vitest`, `tsc`, `oxlint`), so nothing could see the Pixi/WebGL terrain, the real DOM, real fonts, the viewport, or the module worker — and two of the three open defect records are pure presentation defects. `scripts/browser-smoke.mjs` now boots the **production build** in a real Chrome (the one already installed; **zero new dependencies** — Node's `fetch`, `WebSocket` and `zlib` plus the Chrome DevTools Protocol), walks the real player path (intro → "Settle the valley"), dismisses the Quick-start overlay, proves the freeze lifts, captures labelled screenshots plus a JSON report, surfaces the browser's own console errors, page exceptions, failed requests and 4xx/5xx responses, and decodes the PNGs itself to say whether the valley actually painted. It fails the run on anything new, and exits non-zero, so it gates like `npm test`. Measured on the real build: WebGL2 present (`ANGLE … D3D11`), 3 300–3 500 distinct sampled colours, HUD clock advancing `09:00 → 11:00` unprompted.
- **New defect found by the browser tier** — the first five runs reported one console error on every boot: `Failed to load sprite: /sprites/mountains/45.png`. `public/sprites/mountains/` does not exist, yet `spriteLoader.ts` preloads four directional mountain paths and `terrainLayer.ts` stamps them, so the game asks for art it does not ship and falls back silently. Recorded as `BUG_REPORTS/2026-09-10-mountain-sprites-missing.md` (open — the fix depends on whether the art is coming or abandoned), and listed in the harness's `KNOWN_CONSOLE_ERRORS` so the gate is green while the defect stays visible as `knownConsoleErrors`.
- **Determinism limit measured, not assumed** — a screenshot baseline is the obvious first idea and it does not work here: the shipping UI generates a random map every run (`worldGen.initGame`: `seed ?? Math.floor(Math.random() * 1_000_000)`, and `MapSetupScreen` never offers a seed). The harness therefore installs a deterministic PRNG before app scripts run to pin the **map layout**, and measures what is left: two same-seed runs drift **30.3 %** of sampled pixels over the full frame (water shimmer, foliage, camera easing) but only **0.5 %** over the HUD strip — so the baseline gate is region-scoped to the HUD and the full-frame number is reported as information. Pinning the map is also not pinning the colony: `nameLoader.ts:99` still draws settler names from the global `Math.random` stream, so two same-seed runs produced different village-head names (Jude Shah vs Paul Roach) — direct evidence for roadmap **T3**, whose job is exactly to move the remaining modules onto `simRng` owner streams.
- **Evaluation recorded** — `docs/plans/browser-testing-evaluation.md` answers the "is modern-web.dev something for us?" question with measurements: the *browser tier* is worth adopting, the *runner* (`@web/test-runner`) is not, because Vitest already is the Vite-native runner and a second one would duplicate config, module pipelines, coverage and mocking for no gain. The doc lists five slices (B1 smoke/console truth, B2 screenshot evidence, B3 viewport/DPI matrix, B4 worker-in-browser, B5 per-scene fixtures), the measured findings, the costs, and the honest limits of what the harness does not yet drive.
- **Auto-play phase 3 — the rest of the player action surface** — the bot's ladder grew from nine steps to seventeen so Auto-play can carry a normal game end to end, and every new step retires itself (already repaired, already queued, already set, nobody eligible) so nothing can monopolise its hourly act. After the existing colony work it now: **repairs** the worst-damaged completed player building below 80 % health (`decideRepairs`, priced by the maintenance owner's new `getRepairBuildingEligibility`); **queues forge orders** — iron spears → shields → pickaxes — for a staffed Blacksmith, gated on the forge owner's existing `getForgeBlockReason`, so research, the forge chain, a busy smith, an already-forged order and the iron cost stay the owner's call; **tunes buildings** (`decideBuildingTuning` — the Mine digs gold only while the treasury is under 80 and iron otherwise, the Hunting Spot keeps `auto` unless food is short and then takes deer, and the Workshop runs the richest recipe `canAffordWorkshopRecipe` allows); **recruits a settler** (`decideRecruitment` — one morning window a day at in-game hour 9, and only with two spare assignable beds, nobody homeless, a five-day larder and the new `getRecruitSettlerEligibility`); **works its visitors** (`decideVisitorRelations` — one audience per visit, the smith's deliver quest once the goods are in store, then a trade priced by the new `getVisitorTradeEligibility`); **fills manual workplaces** (`decideManualStaffing` — one explicit `assignWorker` for a Church/Prison/Barracks/School/Town Hall with an open slot and an idle adult, never a blanket `autoStaffWorkers`); **keeps the colony up** (`decideUpkeep` — expanding a standing home when settlers are homeless with no plot left to build on, and taming a creature a Taming Post can reach from a five-day larder); and **manages its neighbours** (`decideRivalRelations` — a food gift to a tense rival, then a truce, then an open trade route, and a raid only against a tense rival holding three times the march provisions, so the bot is not a warmonger). No game rule is restated in the bot: four owner modules gained the eligibility helper it needed (`getRepairBuildingEligibility` + `getBuildingUpgradeEligibility`, `getRecruitSettlerEligibility` + `getTameEntityEligibility`, `getVisitorTradeEligibility` + `getRivalGiftEligibility` + `getPeaceTreatyEligibility`, `canEstablishTradeRoute`), each mirroring `getRaidChoiceEligibility`, and each owner's own resolver now applies it, so a command the bot proposes is a command the owner accepts. **Behaviour change:** a manual workplace with a free slot is now staffed by the bot — "manual workplaces stay the player's call" still keeps *generic auto-staffing* out of them, and the bot is the player making that call explicitly. Deliberately not done: **road chains** (`placeStripChain` — no owner exposes a rule for where a corridor should run, and the only road owner validates a player-dragged corridor) and **move-out** (see the open defect below). Tuning lives in `gameConstants.VirtualPlayer`; 21 regression tests were added to `tests/virtualPlayer.test.ts` (48 total), and the repair, forge-order and manual-staffing tests were each proved load-bearing by disabling that step and watching the test fail.
- **Known behaviour: `moveOutOfFamilyHome` does nothing** — the player-facing move-out command accepts a valid grown child and moves the household into an empty house, and then the *same call's* residency reconciliation moves them straight back: `buildHousingUnits`/`collectOwnHousehold` keep an adult child inside their parent's `childrenIds` housing unit, so the split family fails `isFamilyHousingValid` and the convergence loop re-homes the unit together. Measured: `tryMoveOutOfFamilyHome(child, humans, residences)` returns `true` with the child in house 3, and the following `assignMissingResidences(humans, buildings, entities)` puts them back in the mother's house 1. Because the effect cannot stick, Auto-play does **not** propose a move-out (it would burn an in-game hour every hour until something else changed); recorded as `BUG_REPORTS/2026-09-13-move-out-reverted-by-residency-reconciliation.md` (resolved in this working tree — the manual button and command were deleted; see the move-out removal entry below).
- **Manual move-out removed — the residency owner already owns that behaviour** — the Settler Inspector's **Move to own home (18+)** button, its `onMoveOut` prop, the `moveOutOfFamilyHome` worker command (union member, `WORKER_COMMAND_OPS` entry, validator case, and route case) and the `buildingResidencyActions.moveOutOfFamilyHome` owner — plus its `buildingActions.ts` and `gameEngine.ts` compatibility re-exports — are deleted. Housing is fully automatic: the residency owner's `assignMissingResidences` runs every day from `tickLayerAssign.ts` and `dailyPopulation.ts` and already rebalances adult children out of the family home whenever an empty house is free (`rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`) plus a 24-pass convergence loop, so the manual command was a second, conflicting path that the same call's reconciliation undid inside the command and could never stick. The shared rules the automatic path needs stay exactly where they are: `residencySelection.canMoveOutOfFamilyHome` and `tryMoveOutOfFamilyHome` are unchanged, `dayCycle.ts` keeps its `tryMoveOutOfFamilyHome` compatibility re-export, no save field was written, and Auto-play still proposes nothing here — its `decideUpkeep` doc now records that housing is automatic instead of citing a deleted command. `BUG_REPORTS/2026-09-13-move-out-reverted-by-residency-reconciliation.md` is resolved by removing the manual surface, with the original diagnosis kept as history.
- **Auto-play parity — the bot can now do everything a player can** — the ladder grew from 17 steps to 23, closing the remaining command gap so Auto-play can be watched playing a normal game end to end. New visible acts: it **sets its own staffing mode** (a manual workplace whose crew the player placed is marked `manual` so a blanket auto-staff can never rearrange it; an empty workplace still holding a stale `manual` flag is released back to `auto`; a working workplace the player deliberately runs manually is left alone), **restores the colony work day** to the owner's standard 07:00–16:00 whenever it differs (no season rule invented — the owner models none), **keeps venue hours** on the owners' defaults (tavern 17:00–23:00, hotel 06:00–22:00) once that venue actually stands, **releases the least skilled hand** from a workplace holding more settlers than its posts (a surplus auto-staffing never creates, one release per act so the crew ends exactly at its cap), **lays a short road chain** (up to 12 tiles) from the village centre to a production building that stands at least a real walk away and has no road, routing along the game's own A* corridor (`getPathGrid`/`findPath`, which already treats buildings as blocked) and emitting only tiles the placement owner validated, with 200 wood kept back so paving never outranks real needs, and **clears room by demolishing** one empty duplicate outbuilding when the village is genuinely boxed in (homeless settlers, no free bed, no legal plot left) — never a home, never a unique building. Rival and visitor agency is complete: it **welcomes** a refugee camp from a deep larder with beds free, **screens** one it can merely feed, and never turns families away on its own initiative; it **parades the militia** past a tense neighbour when there is no food to gift but spears to show, and **signs a trade pact** for lasting friendship when a treaty is out of reach. Every step is gated on the owner's own rule — `getShowStrengthEligibility`, `getRivalTradePactEligibility` and `getRefugeeChoiceEligibility` were added to `groupEvents.ts` (mirroring `getRaidChoiceEligibility`) and their resolvers now apply them — so the bot can never spend an in-game hour on an action an owner would refuse; 34 of the 40 player commands are implemented and the remaining 6 are deliberately excluded (debug spawn, locked-building feedback, the scripted tutorial, and the inert automatic-housing pair). Tuning stayed in `gameConstants.VirtualPlayer`; 11 regression tests were added to `tests/virtualPlayer.test.ts` (59 total), and the staffing-mode, surplus-crew and road steps were each proved load-bearing by disabling them and watching their tests fail.
- **Buildings no longer cost their own product — the bootstrap rule** — four producers charged the very material they exist to supply: the Lumber Mill 35 wood, the Quarry 10 stone, and both the **Mine** (15 gold) and the **Store** (15 gold, whose own description is “Generates gold.”). A colony at 0 of a material could therefore not build its way back, and a measured 30-day auto-play run sat at 0 gold for eleven consecutive days — unable to raise either the Store that earns gold or the Mine. All four now charge only materials another producer makes: Lumber Mill `30 stone`, Quarry `30 wood`, Mine `35 wood + 25 stone`, Store `35 wood + 20 stone`. The timber and stone pair is deliberate — the Lumber Mill is paid in stone and the Quarry in wood, so either material alone can start the other. `tests/buildingCosts.bootstrap.test.ts` pins the invariant for every bootstrap producer.
- **Feeding and housing no longer depend on gold** — the Farm, Greenhouse, Fishing Spot, Hunting Spot and the House dropped their gold cost (5–15), because gold is the one material a colony can be *completely* out of and nothing else makes it early. The 5-gold House was the direct cause of the worst stretch in that measured run: three settlers homeless for ten days while research and recruiters had spent the treasury. Housing and food are survival, so they are paid in the materials a colony can always produce.
- **Trade routes can buy materials with coin** — every route exported materials *for* gold (Riverdale’s wood and food, Granite Reach’s stone), so coin could never become timber, and a colony with money and no materials had no way back. Three purchase routes were added: **Timberland Traders** (25 gold → 60 wood, **no reputation required**, so it is available on day one), **Stonefall Traders** (30 gold → 45 stone) and **Greenfields Traders** (35 gold → 60 food). `canEstablishTradeRoute` also lets a *purchase* route skip the Market requirement, since a Market costs 50 wood and 20 stone — exactly what the colony that needs this route does not have; export routes still require their Market. `ensureFullTradeRoutes` merges the new routes into existing saves, and `tests/tradeRoutes.bootstrap.test.ts` covers the lot.
- **New colonies start with 30 iron** — iron is the only material nothing a colony builds costs (its single sink is the Blacksmith’s forge orders, 10–40 each) and only the Mine produces it, so a new colony is handed one of the cheaper orders’ worth in `worldGen.initGame`. Saves written before iron existed keep the 0 they were backfilled with, so no existing colony is gifted it.
- **Auto-play (dev builds only) — five rule repairs and the wiring fix** — the in-app bot now: builds a food producer when the colony owns none, so it can no longer research “Advanced Farming” (`farm_yield ×1.2`, unlocks the Greenhouse) before owning a farm; **researches the gate behind the building it wants** instead of the first node in the game’s node list, which opens with the Agriculture chain — so it used to grind `agriculture_1 → _2 → …` and never reach `forestry_1`, the Blacksmith’s gate, while the civic step kept asking for a Blacksmith it could not place (the 30-day probe now researches Carpentry and raises the Blacksmith); proposes the Mine without waiting for a Blacksmith, a precondition the game itself does not have; digs **iron** while iron is short rather than gold, because the old rule keyed only on the treasury and a colony with 0 iron dug gold indefinitely; and asks the staffing question the command it issues actually answers — idle settlers, not the manual path’s donor transfer — which ended a loop in which 192 of 205 hourly acts were one no-op command with every later step queued behind it. The driving hook is keyed on `world.tick` instead of the world object (the loop mutates one `WorldState` in place, so the effect never re-ran and the button genuinely did nothing), and the status line next to the toggle is no longer hidden below a 640 px window.
- **Verification (auto-play and bootstrap balance pass)** — `tsc -b` exits 0; Oxlint reports 0 warnings / 0 errors across 320 files; the full local suite passes at 102 files / 583 tests; and the 30-day auto-play probe over one seed improved from eleven consecutive days at 0 gold with ten days of homeless settlers to a run where gold never idled for a day, homelessness cleared within a day, the Store stood from day 10 earning gold, and a second Farm was raised as the larder tightened.
- **Seedless randomness removed from the whole source tree** — every `Math.random()` call site in `src/` (286 of them, across 32 files: relationship and conception rolls, births, immigration, festivals, disasters, hunting, raids, rivals, wild grass, moon howlers, hospital and town-hall chatter, wildlife spawns, particles, weather, the intro, audio cues and screen shake) now draws from a named `simRng` owner stream, so the same seed and tick produce the same run. Decision gates that key an entity's fate are **stateless** — `personDayRoll(id, tick, salt)` where the file already used it, `seededRandomForRun('<domain>:<id>:<tick>')` otherwise — so a settler's conception, death, divorce, or a shot's outcome can no longer change because an unrelated system drew first; sequences inside one operation use `getSimRng('<module>')`, resolved per call because `setSimSeed` clears the cached streams. Presentation and audio draw from their own owners (`weatherFx`, `introScreen`, `juiceEffects`, `ambientAudio`, `sfx`, `rendererShake`), so they can never perturb a simulation stream. Two exceptions are deliberate and documented in code: `simRng`'s own `NATIVE_MATH_RANDOM` capture, and `nativeRandom()` — the host's real `Math.random` — which `worldGen.initGame` uses to pick a **new game's** seed, because drawing that through `Math.random` after a seed was installed took it from the previous game's stream, so a second new game in one session was not fresh. Tests that forced randomised branches by stubbing `Math.random` (`humanLifecycle`, `conceptionEvent.labelling`, `relationshipDiagnostics`, `affair.cadence`) now choose the **tick or day** whose real seeded roll takes that branch, so they exercise the production roll instead of a mock.
- **Fixed: the simulation worker and loaded saves now use the colony seed** — `setSimSeed` / `enableSeededGlobalRandom` were called only by `initGame`, so a realm that *received* a world never adopted its seed: the simulation worker is a separate realm whose `simRng` state began at the module default of seed 1, and the load path re-seeded nothing at all, so a loaded colony kept whatever seed the game created earlier in that page had used. Every `getSimRng(owner)` / `seededRandomForRun()` draw in those realms therefore came from the wrong stream (the worker ignored the map seed entirely, and two different seeds shared one set of streams). New `simRng.adoptSimSeedFromWorld()` is called by `gameWorker.resetWorkerSession` (init, import and world sync) and by `saveLoad.loadGameFromParsed`; `tests/simSeed.adoption.test.ts` proves it, including a real save round-trip that returns to the file's seed rather than the previous game's (which is exactly how the bug was measured: seed 4 instead of 31337), and `tests/gameWorker.seed.test.ts` drives the real worker module through a real `init` and `importSave` message to prove the realm adopted the seed and re-seeded on a swapped world.
- **Verification** — TypeScript (`tsc -b`), Oxlint (0 warnings / 0 errors), production build, and the full local suite (95 files / 507 tests) all pass; `npm run test:full-year` completes 360 days with the leader invariant satisfied and now reconciles births exactly (seed 12345: 30 deliveries, 30 `'birth'` events, 24 `'conception'` events — the 54 birth-typed events of the same-seed run before the fix were 30 deliveries plus exactly those 24 expectations); `npm run test:browser` passes against the production build; the duplicate-code scan reports 0 clones at the project's configured thresholds.
- **Scope note** — `humanTick.ts` remains an active follow-up decommissioning track; its remaining adult leisure, realtime social-runtime, work-boundary review, and coordinator-reduction slices are not included in this 6.4.1 entry.
- **Docs corrected — youth love begins at 12, as the code already did** — the youth-love minimum age was moved to 12 in `humanRelationships.ts` (`YOUTH_LOVE_MIN_AGE`; the upper bound is unchanged at `HUMAN_MOVE_OUT_MIN_AGE` = 18), but the governing documents still described the older age-14 gate, so an audit reported the constant as an invariant violation. The **documents** were the stale artifact and are now corrected to match the intended behaviour: `SIMULATION_AUTHORITY.md` §3 (the ownership row) and §5 (the youth-love invariant), `YOUTH_LOVE_FEATURE.md` (the age timeline, the start-eligibility age row, the daily age-protection step, and the automated-coverage row) and the README feature table. Fertility and the youth-conception gate are untouched and still begin at **14**, so the age-14 conception wording in the authority document remains correct. No code, save, or migration change — [the audit's H11 finding is withdrawn as intended behaviour](BUG_REPORTS/2026-09-13-youth-love-min-age-12-lets-12-13-year-olds-enter-youth-lov.md).
- **Fixed: a failed worker tick did not roll back the year-rollover and stats fields** — the worker takes a `SimPrepKeys` backup before every tick and undoes it when a layer throws (`gameWorker.ts`), then the host gives up on the worker and re-runs that same tick on the main thread (`fallbackFromWorker`). `yearlyStats`, `lifetimeStats` and `populationHistory` were missing from that payload, so a failed year-boundary tick left them advanced and the retried tick advanced them **again**: the closing year appeared twice in `yearlyStats` (permanently — `recordYearlyStats` appends without a per-year guard, the duplicate then becomes the next year's baseline, and both are persisted) and `lifetimeStats.totalMarriages` / `totalBuildingsUpgraded` double-counted, since `updateLifetimeStats` uses `+=` for those two while the born/died counters are recomputed from the array and therefore self-healed. All three fields are now in the payload and deep-cloned with `structuredClone`, because the tick mutates nested objects (`lifetimeStats.totalResourcesGathered`, yearly `population`/`births`/`resources`) and a shallow copy would leave the backup aliasing live state. New `tests/simPrep.rollbackClosure.test.ts` (3) drives a real `gameTick` at the production year boundary and asserts the rollback restores all three, plus a closure test that poisons every payload key in turn so a payload that claims a field its applier ignores cannot pass; recorded in `BUG_REPORTS/2026-09-13-worker-tick-rollback-leaves-stats.md`. No save-format or migration change — a pre-existing duplicate is left as history.
- **Age rules now describe one relationship route per age band (youth conception from 12, affairs 18+)** — youth love already began at 12 while the conception gate still started at 14 and an affair could take a 16–17-year-old paramour, so three age rules disagreed. They now form one ladder. **Youth conception** admits 12 and 13: `HUMAN_FERTILITY_START` is 12 (it is the same threshold that opens youth love) and `YOUTH_CONCEPTION_MULTIPLIERS` gained `12: 0.25` and `13: 0.25` — the base value 14 already used — while 14–17 keep their rebalanced multipliers (0.25 / 0.35 / 0.50 / 0.70), so a 12-year-old conceives at the same reduced rate as a 14-year-old and the nearby adult base chance is still multiplied, never replaced. **Fertility below 18 is reachable only through the youth gate** by construction: marriage requires `HUMAN_MOVE_OUT_MIN_AGE` = 18 and an affair now requires `Relationship.AFFAIR_MIN_AGE` = **18 on both sides** (`isValidAffairTarget` checks the paramour *and* the cheater, and `tryDailyAffairEncounter` uses the same constant instead of the 16-year courtship age), which also closes the audit's affair-conception finding — an adult could previously conceive with a 16–17-year-old paramour entirely outside the youth gate. Courtship eligibility, marriage, and every other use of `HUMAN_ADULT_MIN_AGE` = 16 are unchanged. Documents aligned: `SIMULATION_AUTHORITY.md` §5 now states fertility begins where youth love begins and adds an **Affair invariants** section (adult-only, establishment-only scandals), the age-14 conception rows in §3/§5 and the README feature table say 12, `YOUTH_LOVE_FEATURE.md` no longer claims youth love cannot lead to pregnancy (it states the reduced gate and the 18+ adult-only systems) and `FERTILITY_AGE14_F1.md` carries a "later amendments" note pointing at the current values while its original table stays as the slice's record. New `tests/youthConception.ageFloor.test.ts` (4: the 12 boundary, 11 still rejected, conception at 12 and 13 with lineage, and rejection for one-sided or absent links) and `tests/affairAge.adultOnly.test.ts` (4: 16/17 paramours and a 17-year-old cheater rejected, 18 accepted, lifespan ceiling intact). No save field, format, or migration change — the earlier row's sentence that fertility and the youth-conception gate are "untouched and still begin at 14" is superseded by this entry.
- **Fixed: tiered combat research no longer stacks into a guaranteed kill** — `researchedEffect(..., 'add')` summed every matching researched node, so Iron Spears (+0.45) plus Iron Swords (+0.55) gave `getCounterAttackChance` exactly **1.0**; `rollCounterAttack` rolls in [0, 0.999] and returns `roll < chance`, so every wolf, fox and Moon Howler that reached a settler died instead of killing them — the 45 %/55 % tiers and the `hasIronSwords ? 0.55 : 0.45` fallback were unreachable. Additive effects are **tiers**: the strongest researched value now applies (`Math.max`), which is the law `frontierCombat.ts` already states ("Weapon/armor tiers replace lower ones — do not stack"). `predator_block` had the same shape (0.35 + 0.6 + 0.72 = 1.67) and was only hidden by its 0.85 cap, which also made its forged-tier branches dead; it now applies the 0.72 scale-mail tier. `tests/combatTierEffects.test.ts` (3) pins both effects and that a counter-attack is still a roll.
- **Fixed: nobody ever graduated from childhood, so the whole education payoff was dead** — the daily age sync wrote `isJuvenile` itself and `humanTick` runs that sync *before* `tryGraduateHumanChild`, whose guard is `isJuvenile && age >= HUMAN_CHILDHOOD_DAYS`; the sync therefore cleared the flag on exactly the tick the age crossed 12, making graduation unsatisfiable. `entity.size`/`speed` stayed at child values and `applyEducationGraduation` — the only writer of `entity.educated` — never ran, so school days never became skill or max-energy bonuses and no settler was ever counted as educated. The sync now updates the calendar age only and the graduation transition owns the flag, firing once per settler. `tests/humanGraduation.education.test.ts` (3) drives the real call order (sync, then graduation with the education callback) and pins that a second tick is a no-op and that a child below the threshold is untouched.
- **Fixed: storage buildings did nothing — `updateStorageCaps` had no caller** — the function, the decision registry and `tests/economyAudit.storageCaps.test.ts` all described the storage formula, but nothing in `src/` called it, so `storageMax` stayed at the world-gen literals (`wood 1000 / stone 500 / food 1000 / gold 2000 / iron 500`) and `foodSpoilageRate` stayed 0.03 for the whole game: Barns (+300 wood, +400 food), Silos (+600 food and the spoilage cut), Wood Storehouses (+800 wood), Stores and Markets (+200 wood/stone, +100 iron) conferred nothing, and the audited gold cap of 20 000 was unreachable. It is now called once per colony day at the head of `tickStaticDaily`, before spoilage, in the same daily pass as `tickBuildingProgress` — so a Barn or Silo finished that day counts that day. `tests/storageCaps.dailyWiring.test.ts` (2) proves it through a real `gameTick` day boundary and against the pure formula. Caps change on purpose: base wood/food 800 and gold 20 000; resources above a new cap are not confiscated, they stop growing.
- **Fixed: trade-caravan carriers were deleted in the tick they spawned** — `spawnCaravan` pushed the carrier into `state.entities` only, but `gameTick` ends every tick by replacing `state.entities` with the `allAlive` snapshot it built from the pre-tick list plus `ctx.newEntities`. A carrier created in the systems layer was therefore dropped immediately, `hasActiveCarrier` saw nothing on the next pulse and restarted the route, and the export goods — deducted at departure — were simply lost. Caravans could never travel. The carrier now leaves through the canonical mid-tick spawn path `pushNewEntity(state, ctx, carrier)` (retained by the rebuild, indexed by id, added to the mobile spatial grid), and `tickTradeCaravans`/`tickLayerSystems` thread `ctx`. `tests/tradeCaravan.carrierRetention.test.ts` (2) covers both the layer call and a full `gameTick`, where the carrier is alive with `caravanLeg === 'outbound'`.
- **Fixed: affair gossip could jail and forcibly divorce an unwitnessed pair** — the daily gossip path chose its exposure reason with `pickAffairExposureReason`, which discarded its arguments and returned `'caught'` on a flat 22 % roll gated only by the existence of a staffed prison. `exposeAffair` treats `'caught'` as reputation −8 **plus arrest of both partners plus `tryDivorceOnCaughtCheater(..., caughtInAct = true)`**, which skips the `isSpouseNearby` gate and forces the divorce — so a pair that was merely gossiped about was jailed and divorced while the Chronicle claimed they were caught. The caught-in-the-act verdict is a spatial decision and already belongs to `tryExposeCaughtAffair`, which requires the spouse (or a walk-in at the marital home) to be present before it can expose anything; the daily gossip path now passes `'rumor'` and `pickAffairExposureReason`/`hasStaffedPrison` are deleted. `tests/affairExposure.rumour.test.ts` (1) sets up an established affair, a staffed prison and distant spouses, and asserts the "Whispers spread about …" rumour, no imprisonment, the marriage intact, reputation still lost and the affair cleared. Expected shift: more rumours, fewer imprisonments and divorces for the same gossip.
- **Fixed: civic petitions paid out every tick instead of once a day** — `resolveCivicPetition` is gated by a **day-stable** roll (`personDayRoll(id, tick, 821 + day)`), but two realtime paths called it every tick a settler or official stood at the hall: the free-time petition helper and `officialHandlePetitioners`. A roll that passed passed for all 72 ticks, so a loitering settler re-ran the whole outcome at tick rate — +0.06 Official skill for every hall occupant per tick, +1 reputation on the "heard" branch until reputation saturated, and food/gold aid spent per tick. Resolution is now the daily owner's alone (`tickTownHallAudiences`): the free-time helper is removed (the walking motive that sends settlers to the hall is untouched) and the on-duty official only greets. `tests/civicPetition.cadence.test.ts` (2) calls the official path twelve times at a hall with no state change, and still sees one daily pulse grant the petition effect.
- **Fixed: every travelling-theatre opening night cancelled the show** — `resolveTravelingTheatre` dispatched on `FLAG_STATUS` alone, but the Opening Night card is pushed without advancing that flag (`tickTravelingTheatre` only stamps `FLAG_STAGE3`), so `correct_story` / `let_legend_grow` / `interrupt` arrived while it still read `preparing` and were routed into `resolveStage2`. That switch has no case for them, so they fell through to `case 'cancel_show': default:` — the show was cancelled, "the troupe leaves offended" was posted, and `resolveStage3` (the +2/+3 "living legend", +1 "honest history" and −1 interruption) was unreachable. The resolver now dispatches on the answered card first, which is unambiguous because the three stages offer disjoint choice ids. `tests/travelingTheatre.stageRouting.test.ts` (3) drives the real offer → script → support → opening-night sequence and pins all three stage-3 outcomes plus an explicit stage-2 cancel.
- **Developer: the full-year gate's starter colony now provisions storage the way the game does** — `scripts/run-full-year.mts` relied on a 100 000-food larder with `foodSpoilageRate = 0`, both of which `updateStorageCaps` now owns, so the gate's colony starved (29 settlers, food 0 for the last third) once the caps went live. The harness builds eight Barn/Silo buildings, fills the larder to the cap the owner computes, and maintains food and wood at each 30-day checkpoint, because the gate tests the social/lifecycle/leadership systems rather than the economy. The 360-day run is healthy again (68 settlers, 30 births, 23 pregnancies, 16 caught scandals, invariants clean).
- **Fixed: the in-game Chronicle froze after a reload in worker mode** — `nextEventLogId` is module state, and a realm that *receives* a world (the simulation worker, or the main thread's optimistic display copy built from a worker snapshot) started it at 1 while the imported log already held ids 1..N. `applySimTickDelta` skips incoming tail entries whose id already exists, so every event that realm logged was silently discarded — the Chronicle stopped updating for hundreds-to-thousands of events while the simulation kept logging, and the display copy could mint ids the worker had already used (duplicate React keys). `logEvent` now derives the next id from the log it is writing to (the log is newest-first, so its head carries the highest id), which makes the allocator correct in any realm with no sync call at all; `tests/eventLog.idMonotonic.test.ts` (3) proves a log imported with ids up to 5000 continues at 5001, that successive writes stay unique and increasing, and that the 2000-entry bound still applies.
- **Fixed: an adult child's move-out was silently undone, and one settler could be claimed by two households** — two defects in `buildHousingUnits`. (1) The fallback unit came from `collectOwnHousehold`, which walks `childrenIds` with **no age filter**: for a parent whose children had all grown up it spanned the parents' house and the adult child's house, which can never be valid, so the residency convergence loop re-homed the whole unit together and the move-out could never persist. The fallback now uses the new `collectMinorHousehold` (settler + living partner + *dependent* children only). (2) The custodian loop guarded the partner and the children with `visited` but not the custodian itself, so a settler who was the custodian of one child *and* the partner of another custodian landed in two units — each unit's reassignment invalidated the other, `reassigned` never reached 0 and the loop burned all its passes 4×/day, leaving that settler housed away from half the family. The loop now reuses the unit that already holds the custodian (tracked per member), so the second custodian's children join their parent's household instead of forming a competing unit or being dropped. `tests/housingUnits.composition.test.ts` (3) pins one-settler-one-unit, both children housed, and a minor — but not an adult — child sharing the parent's unit.
- **Fixed: reloading the game stripped the player's priest** — the legacy "Church manual staffing" pass ran on **every** load (`loadGameFromParsed` is the browser- and file-load path), and it releases every occupant of a completed player Church, so a priest the player had assigned by hand was released on each reload; nothing refills the Church (`assignMissingWorkers` skips manual buildings), so its strength silently halved every time. The pass is now gated on its `church-manual-staffing` marker, which is stamped on the first load even when there was nothing to clear, so it runs exactly once per save.
- **Fixed: the traveling-smith quest existed only inside the simulation** — `visitorQuest` was created and expired by the worker but carried by neither the tick delta nor the worker prep/rollback payload, and it was missing from the save allow-list, so in worker mode the main thread's copy stayed `undefined`: the quest card never appeared and the quest was lost on a reload. It now round-trips through the delta, the prep payload and the save, and older saves simply start with no quest. Covered by the worker/save round-trip suites, including `tests/simPrep.rollbackClosure.test.ts` (which poisons every payload key and fails if a claimed key is not restored).
- **Fixed: "Humans Died" always read 0** — `recordYearlyStats` counted deaths by filtering `!e.alive` out of `state.entities`, but `gameTick` has already rebuilt that array from the living entities by the time a year closes, so the yearly `deaths` and `lifetimeStats.totalHumansDied` were permanently zero (and the code subtracted the previous year's per-year count from that cumulative-looking total, a unit mismatch masked by both sides being zero). `gameTick` now tallies deaths per tick — exactly the entities that were alive at the start of the tick and are not alive at the end of it, which is also independent of when the array is rebuilt — into the new world field `deathsThisYear` (saved, prepped and delta-carried), the yearly record reports that tally, and the lifetime total sums the yearly records. `tests/deathStatistics.test.ts` (3) proves the tally matches what died (with a deterministic wildlife death forced), that the yearly record reports it, and that the lifetime total sums across a reload.
- **Fixed: a vacant leadership campaign took up to a year instead of three months** — `tryStartVacancyElectionCeremony` compares `year + dayInYear / DAYS_PER_YEAR` against `pendingElectionYear`, but it was only called from the year-rollover branch of the daily layer: a leader who died on day 300 of year 3 stored a due date of 4.083, the year-4 rollover compared 4.0 < 4.083 and started nothing, and because `tryStartTermElectionCeremony` refuses while a vacancy is pending, that year's scheduled term election was skipped as well — the successor election only ran at the year-5 rollover. The daily layer now evaluates the pending campaign every day (the term election itself remains a year-rollover decision, and the ceremony news/notification fires for a mid-year vacancy too). `tests/vacancyElection.dueDate.test.ts` (2) drives a real `gameTick` day boundary and shows the ceremony starting on the due day while an earlier day starts nothing.

## <u>[0.6.4]</u> — 2026-08-27

- **Windows desktop distribution** — published the first standalone Wilderfolk Windows desktop build using Tauri v2. The release includes NSIS `.exe` and MSI installers, a bundled Wilderfolk icon, and maximized startup.
- **Developer desktop workflow** — added `npm run tauri:dev` for a separate Tauri development window with hot reload, plus `npm run tauri:dev:log` for a single timestamped development log under `logs/`.
- **Browser path preserved** — the existing Vite browser launch remains available for quick playtesting and web development.
- **Release verification** — the source-integrity guard, Oxlint, TypeScript checks, production browser build, and Windows x64 Tauri bundle build passed before publication.
- **Release assets** — Windows installers are available from the [GitHub Release for v0.6.4](https://github.com/Rengerams/wilderfolk/releases/tag/v0.6.4).
- **Scope note** — this release is limited to desktop distribution. The terrain overhaul, Settler Inspector, Oracle advice system, connected formations, and weather-layer work remain separate development tracks.

## <u>[0.6.3.1]</u> — 2026-08-28
-
-
-
-
-
-






## <u>[0.6.3]</u> — 2026-08-25

- **D1 — deterministic simulation seed** — added `simRng.ts` with per-owner mulberry32 streams and a seeded global fallback. `initGame({ seed })` reproduces the same world; world-gen/entity/terrain/migration use own streams. **Root-cause of the D1 deviation:** the random picks for ambient chats and social interactions consumed the same global seeded stream as the wildlife pass, so a small ordering shift in which citizen chatted first changed the stream and gave e.g. rabbit 417 a different movement roll at tick 20. Fixed by making chat/social rolls context-seeded via `seededRandomForRun()` (salts like `chat-roll:<entityId>:<tick>`, `chat-context`, `chat-partner`, `chat-bubble`), so they no longer shift the shared stream. Same-seed 100-tick replay is in the suite; a manual 300-tick replay was verified deterministic.
- **Gameworker transport — self-Proxy fix** — `tests/gameWorker.transport.test.ts` failed on the baseline with `l.Int8Array is not a constructor`. Root cause: the `self` polyfill in `gameWorker.node.ts` was an empty object, but the tsx loader uses `self` internally as its global object and needs typed arrays (`Int8Array`, `Uint8Array`) to parse worker bundles. Fixed by replacing the polyfill with a **Proxy over `globalThis`** that only overrides `postMessage`, `onmessage`, `addEventListener` and `removeEventListener`, letting every other property (including typed arrays) fall through to the real globals.
- **Code-quality — jscpd duplicate reduction (8→1)** — ran the jscpd duplicate-code detector and reduced duplicate blocks to a single remaining import-boilerplate clone. Centralized shared raid types (`RaidChoice`, `RaidEvent`, `RaidLootBundle`, `OutgoingRaidEvent`) into `gameTypes.ts` and created `storyHelpers.ts` with reusable `storyFlag()`, `setStoryFlags()` and `bumpVillageReputation()` shared across all five authored stories.
- **S1–S5 — full authored stories** — implemented The Deer Parliament, The Traveling Theatre Company, The Wedding That Nearly Started a War, The Apprentice’s Terrible Invention Fair, and The Rumour Ledger as full multi-stage chains per `docs/archive/story/STORY_*.md`, wired through `pendingStoryEvents` + daily ticks. C1 guided campaign now completes from the five real resolved flags (read-only projection verified). E1 election promises (deterministic selection of 2 promises per election; higher thresholds: food ≥400, walls ≥5, forge ≥3 orders; +3/−2 reputation) added.
- **A1 — post-taming animal care** — tamed animals consume **0.2 food/day each** (10% of human 2 food/day) from ordinary `resources.food`; global fed → warning → shortage → fed. Count-based per dev decision; no per-animal fields, no fish resource.
- **Balance — youth fertility + relationship chaos** — youth conception multipliers 14–17 raised to 0.25/0.35/0.50/0.70; normal pregnancy (home 0.18 / near 0.0045) and affair pregnancy (0.14) raised; affair rate, scandal exposure, and divorce-on-caught chances bumped. Added **amicable divorce** without cheating: real 7.5‰ marriages/year scaled ×10 for game pace (7.5%/year per couple, ~1 per 13 game years), one daily roll per couple, no scandal/prison/pregnancy drama.
- **U1 — UX/UI density and hierarchy** — UX-01..UX-07 implemented: sidebar aria labels, dominant Next Step CTA, demolish confirmation in Advanced actions, inspector hierarchy, Village Details disclosure, and disclosure-state memory (`CollapsibleSection storageKey`).
- **B2 — manual staffing truth** — auto mode hides the manual pick list; manual mode shows only unemployed adults and now has **per-worker Remove buttons** so a worker can be removed and reassigned elsewhere.
- **Human activity status** — clicking a human shows a read-only status derived from the nearest building label: Working at X / Commuting to X / Relaxing at Tavern / At home / Walking home / Hunting / At X / Idle.
- **Walls, gates and pathfinding** — removed the redundant `WallCorner` building type (walls are straight vertical/horizontal; corners emerge naturally). Completed player **walls now block pathfinding**; **WallGate is a passable opening**; water/mountains block at every distance (removed the 90 px direct-move shortcut and improved line sampling).
- **Build/toolchain repair** — fixed ~40 strict TypeScript build errors in the authored-story modules, restored the missing WallCorner catalog completeness, migrated Tailwind 4 to `@tailwindcss/postcss`, re-added the source-integrity shadow guard, moved `tsconfig.node.tsbuildinfo` into `node_modules/.tmp` and gitignored `*.tsbuildinfo`. The production circular-chunk warning is resolved; the `game` chunk is still 667 kB (>500 kB) and tracked as T1 open.
- **Children Shelter quest rework** — accepting no longer requires ten free beds upfront. The ten children must be sheltered (≥10 free beds) and fed 20 food/day (2 per child, same as ordinary city humans) for the full five days; if beds or food run out, the children die, the quest fails (−4 reputation) and the rival turns hostile. The success path still grants friendship + 180-day peace.
- **Human meals when hungry** — meals no longer use fixed 08–10/18–20 windows. A player human eats 1 food at the start of each 4-hour check (00/04/08/12/16/20) when energy drops below 80% max; visitors/rivals never drain the colony larder. This removes the illogical 08:00 meal that conflicted with the work shift.
- **Mountain terrain clusters + visible peaks** — mountains now form edge-connected regions like water (isolated single-tile peaks are downgraded to Rocky/Hills, high-elevation gaps between ridges are filled). Mountain tiles render the CC-BY-SA 3.0 Unknown Horizons `as_mountain5x5` peak sprites (4 rotations, see `public/sprites/mountains/CREDITS.txt`); the old unused `public/sprites/mountain.png` was removed.
- **Map sizes** — removed `Small` (800×600 was never played) and added `Huge` 2560×1920 (~49k tiles, comparable to AoE2 Large 220×220). New defaults: Medium 1200×900, Large 1600×1200, Huge 2560×1920; `initGame` defaults to Medium.
- **Starting area + building tree clearing** — the camp centre now clears Forest/DarkForest within a radius scaled to map size, so you don't start behind a dense wall of trees. Building footprints now convert forest terrain to grassland (tree entities were already removed).
- **More blueberries, winter pause** — blueberry bushes increased to Medium 4 / Large 6 / Huge 10; regrowth still pauses in winter (existing berries can be picked, but the yield does not regrow until spring).
- **Audit fixes (AUDIT_2026-08-25)** — story/campaign state (`storyFlags`, `pendingStoryEvents`, `guidedCampaign`) now travels through `SimTickDelta` and survives save/load; unaffordable story choices re-add the card instead of consuming it (Deer Parliament, Wedding Diplomacy, Traveling Theatre, Rumour Ledger); A1 animal-care now escalates warning → shortage and re-warns after recovery; A* pathfinding uses sparse maps instead of full-grid arrays (~59 MB saved per call on Huge maps); `vite.config.ts` uses `import.meta.dirname`.
- **Performance — worker building diff** — the worker now ships only changed/added/removed buildings in each `SimTickDelta` (fingerprint diff against the previous tick snapshot) instead of the full buildings array every tick. This reduces postMessage payload size significantly on larger maps; command/headless paths keep the full snapshot mode. Regression test covers diff round-trip.
- **Simulation — distance-aware worker assignment** — `assignWorkerInPlace` now prefers the closest available settler for each workplace (skill as tiebreaker), and `pickWorkerToTransfer` breaks ties by distance. On Medium/Large/Huge maps this prevents workers from commuting across the whole map when a closer settler is available. Regression test: a close low-skill settler is chosen over a distant expert.
- **Performance — terrain chunked rendering** — the terrain ground layer is now baked as lazy **1024px viewport chunks** instead of one full-map offscreen canvas. Only chunks intersecting the camera (plus one-chunk margin) are baked/drawn and cached; chunks outside the viewport are disposed. This cuts startup bake cost and memory on Large/Huge maps without changing terrain generation.
- **Story conditions audit** — authored stories already follow their doc conditions (minimum colony day, resource/flag gates, deer/ecology/rival prerequisites) and the shared `authored_story_cd_until` cooldown enforces a **minimum gap in days** between story offers (14–21 days depending on story).
- **Tamed-animal owner benefit** — a fed tamed animal now gives its owner +8 energy per day (per animal), so taming is more than a food sink. When the ration is missed the bonus stops.
- **terrainGen clone cleanup** — extracted a shared `forEachTileInRadius` helper used by `ensureCampClearing` and `clearStartAreaForest`; the reported duplicate block is gone.
- **Human speed audit** — base walk speed raised 2.55 → 3.0 px/tick (commute rush already scales up to 12× for long distances). Mid-village commutes fit a work morning; Huge-map travel stays bounded because worker assignment is now distance-aware.
- **Raid/frontier depth — static defenses matter** — walls and watchtowers now blunt a raid that is not answered in time: structure strength reduces loot taken, building damage, and casualties (`defenseFactor = 1 − structureBonus/240`, floor 0.3).
- **Food usage raised** — humans now eat at a higher hunger threshold (energy < 90% instead of < 80%), so meals happen more often; the human daily baseline used for animals/children rose from 2 → 3 food, and tamed animals now consume 15% of that (0.45 food/day per animal instead of 0.2). Children Shelter therefore costs 30 food/day (3 per child).
- **Natural landscape prop readiness** — corrected the terrain decoration readiness check so `bush.png`, `stump.png`, `grass.png`, and `grass2.png` are recognized by the existing terrain-baking path. Natural props remain cosmetic and simulation-independent.
- **Settler visual asset preview** — staged five cleaned adult male settlers, five cleaned adult female settlers from the v2 set, and four cleaned child settlers (two boys and two girls) as separate transparent PNGs. The temporary human sprite preview now uses the new adult portraits and the rerendered child files from `public/sprites/new_child_set/new/` while retaining legacy variants and the original child set as fallback. New portraits are rendered as static single-frame art until dedicated walk cycles exist; simulation, age logic, save data, movement, and Simulation Authority are unchanged. Final replacement remains subject to visual acceptance on the real map.
- **Unique Church and Moon Howler cure ceiling** — made the player Church unique, preserving its four-priest capacity, and aligned the authoritative cure calculation to the intended progression of 35% → 47% → 59% → 71%. Additional priest counts are now capped at 71%, preventing multiple Churches or excess priest assignments from producing an unreachable 78% outcome. Added focused regression coverage for the unique building rule and cure progression.
- **Split security roles** — separated the shared `Guard` job into `Soldier` for Barracks defense and `Prison Guard` for Prison staffing. Barracks defense, patrol behavior, Moon Howler soldier protection, raid skill gain, Prison staffing, combat status indicators, and workforce labels now use the correct role. Added deterministic migration for legacy `Guard` assignments based on workplace and focused role regression tests.
- **Hand-made footpath visual prototype** — staged the user's current straight, corner, T-junction, and cross-junction path pieces in `public/sprites/roads/`. Road rendering now uses the authored pieces where available, selects orientation from the detected straight/elbow/tee/cross topology, and falls back to the procedural pavement when an asset is unavailable. A tile with one connected neighbor is a valid road endpoint; a dedicated `road_end.png` asset is optional and is not required for endpoint behavior. The feature is cosmetic-only and does not alter simulation authority or movement rules. Road-connection test coverage remains pending. See `docs/CHILD_AND_RESIDENT_SPRITE_WIRING.md` for the wiring audit.
- **Per-building staffing control** — added reversible Auto/Manual staffing modes to staffed buildings. Auto-fill continues to provide convenience, while a manually controlled building is protected from automatic reassignment and can later be returned to Auto. Existing special-building defaults remain compatible.
- **Clearer workday and venue coverage** — ordinary work uses the agreed 9-hour default of 07:00–16:00, while the Tavern remains on its independent 17:00–23:00 service window and the Hotel retains its own long service window. Venue workers follow the service schedule rather than inheriting an unsuitable ordinary-work window.
- **Rerendered child sprite wiring** — updated `src/game/humanSprites.ts` and `src/game/spriteLoader.ts` to load the rerendered child assets from `public/sprites/new_child_set/new/`. The original child assets remain available for rollback. Adult male and female preview paths remain wired to the new sets with legacy variants retained. TypeScript validation passed; real-map visual acceptance remains pending. See `docs/CHILD_AND_RESIDENT_SPRITE_WIRING.md`.
- **More consistent long-running simulation** — the authoritative permanent-removal transition now clears stale child, partner, affair, and pregnancy-parent references from surviving settlers, while adoption and housing retain their existing owners. The cleanup is covered by the deterministic one-year invariant run (**seed 12345; 0 violations**) and the full suite (**88 files / 474 tests**).

## <u>[0.6.2.2]</u> — 2026-08-21

- **Defense art pass — wall, gate and watchtower assets** — audited the user-provided `wall_isometric.png`, `Gate .png`, and `watchtower.png` files. Preserved the original sources, generated compact transparent `gate_isometric.png` and `watchtower_isometric.png` variants, and applied a shared Wilderfolk defensive palette across the normalized wall, gate and tower outputs. Straight wall segments and gates now use the new isometric visuals while corner pieces remain procedural/logical and unchanged. The Watchtower remains its existing passive defense structure: +15 barricade strength per completed tower, with the existing forged ballista upgrade path; no new range, targeting or warning simulation was added. TypeScript, production build and diff checks passed; the known circular chunk and large game chunk remain open.
- **Guided Campaign foundation — The Valley Remembers** — added a separate persistent `GuidedCampaignState`, five ordered authored chapters, worker-authoritative start and choice commands, daily-boundary progression, chapter unlocks, memory tags, and a More → Campaign presentation panel. Sandbox random stories remain independent and continue to use the existing `pendingStoryEvents` path. Focused campaign coverage passed with 3 tests and the production build passed; the existing renderer/game circular-chunk warning and large `game` chunk remain open.
- **W1/T4 — player-set ordinary weekday work hours** — added an authoritative global ordinary-work window, defaulting to 07:00–18:00, with bounded typed `setWorkSchedule` validation, worker preparation/delta transport, backward-compatible save/load normalization, construction throughput scaling, ordinary workplace movement/social gating, and a new Hours sidebar panel. School, church, Town Hall, tavern, hotel, weekend, cadence, and save-version behavior remain unchanged; tavern/hotel scheduling is deferred to W2. Focused coverage is `tests/workSchedule.test.ts`; final validation passed with **70 test files / 404 tests**, TypeScript, production build, and Wilderfolk-only ESLint. The existing renderer circular-chunk warning remains.
- **T2 — five additional dependency-cycle reductions** — removed five measured import-boundary edges without changing simulation ownership or cadence: direct canonical trade exports from `tradeCaravans.ts`, a leaf `ecologyTypes.ts` for `ValleyStage`, direct challenge-catalog imports from `challenges.ts`, a pure `dayCycleClock.ts` leaf for tick/hour/weekday helpers, and direct clock-rate imports for `humanChat.ts`. The complete graph moved from two SCCs to one 21-module SCC. Focused coverage passed with **3 files / 20 tests**; the full suite passed with **70 test files / 404 tests**, together with TypeScript/build, Wilderfolk-only ESLint, and diff checks. The existing renderer circular-chunk warning and the known zero-module focused dependency-command discrepancy remain.
- **Dead-code cleanup — duplicate export harmonization** — removed the unused deprecated aliases `buildWorkTicks` in `dayCycle.ts` and `MOON_HOWLER_CHURCH_CURE_CHANCE` in `moonHowler.ts`. Canonical exports `buildWorkHours` and `MOON_HOWLER_OUTCOME_CURE` remain unchanged. Focused day-cycle and Moon Howler validation passed with **2 files / 17 tests**; production build and Wilderfolk-only lint passed. Knip now reports **3 remaining duplicate-export groups**.
- **Dead-code cleanup — spatial and sprite aliases** — removed the unused deprecated aliases `forEachEntityInRadius` and `generateHumanSprites`. Canonical runtime gateways remain `forEachInEntityGrid` and `loadHumanWalkSheets`. Focused day-cycle, Moon Howler, and renderer validation passed with **3 files / 24 tests**; the full suite passed with **70 files / 404 tests**, together with production build, Wilderfolk-only lint, and diff checks. Knip now reports only the remaining lifespan alias group in `dayCycle.ts`.
- **Dead-code cleanup — lifespan constant harmonization** — migrated all active `HUMAN_ADULT_MAX_AGE` callers to `HUMAN_MAX_LIFESPAN_YEARS` and removed both deprecated lifespan aliases, including the unused `HUMAN_MAX_LIFESPAN_DAYS`. Age values, reproduction gates, lifecycle behavior, and death thresholds are unchanged. Focused lifecycle and relationship validation passed with **4 files / 22 tests**; build and lint passed, and Knip now reports no duplicate-export groups.
- **Diagnostics and presentation tooling** — enhanced relationship diagnostics with active marriage, courtship, youth-love, affair, and pregnancy counts plus a bounded 30-snapshot history; added read-only housing diagnostics for capacity, pressure, unassigned residents, orphan references, occupant mismatches, and over-capacity homes; added a persisted Settings → Show FPS toggle with a requestAnimationFrame-based corner overlay. Diagnostics remain read-only and FPS remains presentation-only. Focused relationship and housing tests, TypeScript, production build, ESLint, and diff checks passed.
- **E1 — ten children at the gate shelter story** — added a one-time story event from colony day 10 onward when a rival exists. Ten children request five days of shelter; the player can help or refuse without being told the rival consequence. Helping requires ten free beds in completed player Houses/Mansions, excluding the Leader House and rival residences, and records a bounded temporary shelter reservation. After five days, helping makes the first rival friendly with a 180-day peace treaty; refusing makes it tense and clears its treaty so the existing frontier system can escalate. The focused story suite passes with **32 tests**, together with TypeScript, production build, ESLint, and diff checks. Full transient visitor-entity spawning remains deliberately deferred to preserve population, residence, workforce, and lifecycle invariants.
- **W2 — independent Tavern and Hotel service hours** — added separate bounded Tavern and Hotel service windows with defaults of 17:00–23:00 and 06:00–22:00. Settings controls use the typed `setVenueSchedule` worker command, with backward-compatible save/prep fields and the existing Tavern festival override preserved. Innkeepers and Hoteliers follow their venue schedule without changing School, Church, Town Hall, ordinary work, guest, staffing, or cadence behavior. W2 validation passed with **72 test files / 416 tests**, TypeScript, production build, ESLint, and diff checks.
- **W3 — bounded fatigue, recovery, and productivity consequences** — added optional per-human `scheduleWorkedTicksToday` and `scheduleFatigue` state. Realtime work ticks are resolved once per calendar day against an eight-hour neutral target; excess hours add bounded fatigue, shorter shifts recover it, and staffed production receives a capped 1.00–0.65 reliability multiplier. The Work hours panel shows colony fatigue status. No new tick layer or pregnancy, mortality, relationship, random-event, or automatic-staffing behavior was introduced. W3 validation passed with **73 test files / 420 tests**, TypeScript, production build, ESLint, and diff checks.
- **W4 — schedule feedback and workforce safeguards** — added read-only previews for expected hours, affected workplaces/venues, assigned staff, workload delta, and plain-language fatigue risk across ordinary, Tavern, and Hotel schedules. The panels distinguish **Blocked**, **Unchanged**, and **Accepted by bounds** before dispatch; Tavern festival override state is visible. Meaningful daily fatigue changes now create concise entries in the existing event-log/Chronicle stream. W4 validation passed with **74 test files / 423 tests**, TypeScript, production build, ESLint, and diff checks. UI remains presentation-only and School, Church, Town Hall, guest, staffing, and cadence behavior remain unchanged.
- **R1 — rival-camp profiles and persistent ledgers** — added deterministic bounded profiles for each rival camp: temperament, priority, food, wood, gold, morale, recovery, and contact count. New camps receive canonical defaults; legacy or malformed saves are normalized safely. The Frontier panel now shows the rival profile and ledger read-only, while the existing daily rival owner hydrates missing profiles. R2 daily actions, ledger spending/recovery, R3 diplomacy commands, and R4 history remain deferred. Focused R1 coverage passed with **2 files / 6 tests**, the isolated worker transport test passed, and TypeScript, production build, ESLint, and diff checks passed.
- **R2 — rival daily simulation** — added at most one bounded state-driven action per eligible rival at the existing daily cooldown: recover, gather, trade, fortify, scout, cool down, or no action when unaffordable. Rival-owned ledgers now spend or recover bounded food, wood, gold, morale, and recovery values; the latest successful action and concise reason are written to the event log and shown read-only in the Frontier panel. R2 does not spend player resources, guarantee raids, mutate diplomacy/relationships, or add a new tick layer. Validation passed with **75 test files / 429 tests** in the completed full-suite run, plus TypeScript, production build, ESLint, and diff checks.
- **R3 — rival diplomacy, demands, and consequence loop** — strengthened the existing typed diplomacy contact path with persisted `expiresAtTick` values and a 14-day legacy fallback, authoritative expiry removal, stale/idempotent event handling, bounded rival `contactCount` memory, and visible `Expires in N days` feedback in the rival inspector. Existing resource preflight and relationship/treaty/reputation consequences remain authoritative in `groupEvents.ts`; no parallel diplomacy owner or new tick layer was added. Focused R3 coverage passed with **4 files / 26 tests**, TypeScript, production build, ESLint, and diff checks.
- **R4 — rival-camp presence, Chronicle, and map readability** — added read-only `rivalPresence.ts` selectors for stance, current activity, latest contact and bounded recent history. FrontierPanel rival cards now explain whether a camp is trading, recovering, preparing, scouting, under treaty or quiet; rival map markers show population, relationship and current activity at readable zoom. No new simulation cadence, state field, worker command or mutation path was introduced. Focused R4/profile/diplomacy/render coverage passed with **3 files / 16 tests**, TypeScript, production build, ESLint, and diff checks.
- **T1 build-output cleanup — empty CommonJS helper chunk** — replaced the `vite-plugin-chunk-split` strategy with a direct Rollup `manualChunks` function covering React, router, game UI/data, renderer, and game logic. This removes the generated empty `__commonjsHelpers__` asset and its warning without post-build deletion or runtime changes. The honest 500 kB warning threshold is restored. The remaining renderer/game circular chunk and approximately 580.49 kB `game` chunk remain open because candidate boundary experiments either did not remove the warning or introduced additional cycles; those experiments were rolled back.
- **Q1 static-audit cleanup** — classified the current Knip baseline of 34 unused files, 105 unused exports, and 25 unused exported types. Audit/profiling scripts and compatibility types were retained rather than mass-deleted. Removed obsolete `vite-plugin-auto-chunk` and `vite-plugin-chunk-split` devDependencies after the direct Rollup migration. No simulation or save behavior changed.
- **Q2 worker/schedule/rival regression slice** — passed 10 focused files with 46 tests covering worker startup/tick/command/export round trips, invalid-command rejection and fallback, schedules, venue hours, fatigue, rival ledgers/actions, and diplomacy expiry. The final full validation then passed with **76 test files / 432 tests**, TypeScript, ESLint, and `git diff --check`. A real browser session against the attached desktop could not be reached from the sandbox browser, so live browser acceptance remains explicitly partial rather than being claimed as verified.

### Simulation Change Record

- **W1/T4 owner:** `src/game/workSchedule.ts` with `src/game/simWorker/commands.ts` as the typed command authority.
- **Decision changed:** Player-selected ordinary weekday start/end hours for adult workplaces and construction.
- **Cadence:** Existing human realtime ticks and daily construction batch; no new scheduler or tick layer.
- **State and persistence:** Optional `WorldState.workSchedule`, saved through `WORLD_STATE_SAVE_KEYS`, normalized to 07:00–16:00 for legacy or malformed saves, and carried through worker prep and sim deltas.
- **Protected schedules:** School, church, Town Hall, Tavern, and Hotel schedules remain independent of the ordinary 07:00–16:00 work window.
- **Rollback plan:** Remove the Hours panel, `setWorkSchedule` command, schedule field/transport, and ordinary-work query consumers; existing fixed venue predicates remain intact.

### T2 Dependency-Cycle Change Record

- **Owner boundary changed:** Compatibility exports and pure shared helpers were moved toward canonical leaf modules; no simulation owner, worker authority, save field, or tick layer was changed.
- **Decision changed:** None. These are structural import-boundary reductions only.
- **Cadence:** Unchanged. No new realtime or daily scheduler was introduced.
- **Measured result:** Complete dependency graph reduced from two SCCs—a 24-module primary SCC plus a 3-module economy/trade SCC—to one 21-module SCC.
- **Reductions:** Removed the `economy.ts` trade re-export edge; introduced `ecologyTypes.ts`; removed the `INITIAL_CHALLENGES` gameTypes re-export; introduced `dayCycleClock.ts`; and routed human-chat rate constants through the clock leaf.
- **Validation:** **70 test files / 404 tests** passed; focused schedule/worker/layer coverage passed with **3 files / 20 tests**; build and Wilderfolk-only lint passed. The focused cycle command still resolves zero modules, so the complete graph remains the authoritative measurement.
- **Rollback plan:** Restore the compatibility exports and direct day-cycle imports, then remove `ecologyTypes.ts` and `dayCycleClock.ts`; no save migration or gameplay rollback is required.

## <u>[0.6.2.1]</u> — 2026-08-21

**A village that listens, remembers, and gives one clear frontier decision.** Save compatibility: **0.6.2.1 exact-version policy** — begin a new settlement when updating from any other build.

- **Village Requests S1a — Caravan Provisions Offer** — `groupEvents.ts` now owns one bounded daily player decision. A live trader caravan can offer 30 food for 15 gold and +2 reputation; the player may accept, decline for -1 reputation, or let the offer expire when the caravan leaves. The card is read-only UI: it sends only the typed `resolveVillageRequest` command, whose worker/main-thread path delegates to the same owner.
- **One source of truth across saves and workers** — request state is persisted in `WorldState`, initialization, save allow-list, worker preparation/rollback, and sim delta reconciliation. One active request maximum, source validity, expiry, stale-command safety, and no-partial-payment behavior are documented in `SIMULATION_AUTHORITY.md`, `decisionRegistry.ts`, and `docs/VILLAGE_REQUESTS_S1A.md`.
- **Lifecycle golden contracts** — added `tests/humanLifecycle.test.ts` covering ordinary births, stillbirths, rare Wildkin outcomes, biological lineage/bastard outcomes, and pregnant-immigrant constructor invariants. These deterministic tests protect the lifecycle owner rather than inferring births from conception diagnostics.
- **Actual worker-runtime proof** — added `tests/gameWorker.transport.test.ts`, which launches the shared worker runtime through the Node `worker_threads` adapter and proves the ready handshake, headless tick, valid command, invalid-command rejection, and export transport end to end. Browser-host live verification remains a release checklist item rather than being misrepresented by fake-host unit tests.
- **Focused coverage** — added `tests/villageRequests.test.ts` for generation, cooldown, accepted/declined/expired outcomes, insufficient-resource/storage rejection, idempotence, command validation, worker prep, and delta reconciliation. Extended the decision-registry contract with the single Village Request owner.
- **Graphics Objective G1 — grounded 2.5D depth** — introduced `drawContactShadow()` in `renderer/spriteDrawing.ts` and applied it after existing viewport culling in the human, animal, tree, and completed-building passes. The shared helper adds a compact contact shadow and a restrained south-east cast tail; reduced cosmetic effects retain the compact anchor while suppressing the tail and lower stronger tree/building AO. No simulation fields, collision, pathing, click targets, worker state, or terrain/entity cache invalidation changed. `tests/renderer.presentationLayout.test.ts` now verifies the helper and all four subject renderers.
- **Blueberry Foraging F1 — scarce free-time food** — new maps now spawn exactly one, two, or three rare blueberry trees for small, medium, or large maps. They remain ordinary static tree entities in the existing tree grid, begin with six portions, regrow one portion every four non-winter days, and offer hungry off-duty non-hunters 4 stored food plus 45 energy per nearby pick. `blueberryForaging.ts` is the only harvest/regrowth owner; rendering uses the supplied `public/sprites/blueberry_tree.png` only while a tree is ripe. `tests/blueberryForaging.test.ts` pins scarcity, gates, yield, food/energy, winter pause, cap, and sprite wiring.
- **Age-14 Fertility F1 — low-probability youth conception** — the existing `tryDailyConception()` owner now permits a non-explicit pregnancy outcome from age 14 only when a living female settler has a mutual nearby youth-love partner aged at least 14, both satisfy energy gates, and the existing daily roll succeeds at a reduced age-based multiplier (14: 0.12; 15: 0.18; 16: 0.24; 17: 0.30 of the nearby adult rate). It preserves `pregnantById` lineage but does not create marriage, housing, work, or a second birth lifecycle. Adult married and affair rates remain unchanged. `tests/youthFertility.lifecycle.test.ts` pins the boundary, multiplier, valid mutual pair, rejection paths, and adult regression.
- **Tavern evening-hour regression repair** — restored `TAVERN_SHIFT_START` from 19:00 to the documented 17:00 boundary, retaining the exclusive 23:00 close and all-day festival override. This restores innkeeper availability at 18:00 through the one existing clock predicate; no state, save, worker, or cadence was added. `tests/dayCycle.tavern.test.ts` and the resolved report at `BUG REPORTS/2026-08-21-tavern-evening-service-opens-too-late.md` record the contract and evidence.
### Simulation Change Record

- **Owner module:** `src/game/groupEvents.ts`
- **Decision changed:** Generate, expire, and resolve the single `caravan_provisions` Village Request.
- **Cadence:** New-calendar-day after visitor advancement; player-command resolution through `commands.ts`.
- **State fields written:** `activeVillageRequest`, `villageRequestCooldownUntilDay`, `villageRequestHistory`, declared food/gold/reputation result, source caravan trade counter, ordinary Chronicle/feedback state.
- **Why the change is needed:** Visitor caravans and trade existed, but did not create a focused, named, timed decision that shows its result in the village story.
- **Player-visible behavior before:** Caravans could be selected and traded with, but offered no bounded village-level decision card.
- **Player-visible behavior after:** A trader can make one transparent provisions offer that can be accepted, declined, or allowed to expire with visible results.
- **Performance impact:** One daily scan over the bounded visitor-group list; no realtime population scan or new tick layer.
- **New or updated tests:** `tests/villageRequests.test.ts`, `tests/humanLifecycle.test.ts`, `tests/gameWorker.transport.test.ts`, and `tests/simulation.decisionRegistry.test.ts`.
- **Invariants checked:** One request maximum; live source; typed/stale/repeated command safety; storage/payment preflight; request state in worker rollback, delta, and saves.
- **Save/migration impact:** Added persisted request fields; exact-version beta policy requires a fresh settlement across builds.
- **Rollback plan:** Remove the daily request-owner hook, command, and card; existing visitor trade/caravan behavior remains intact.

### Blueberry Foraging Change Record

- **Owner module:** `src/game/blueberryForaging.ts`.
- **Decision changed:** Spawn rare blueberry trees, select a nearby ripe tree only while a non-hunter is free and hungry, resolve one pick, and replenish one portion on the daily cadence outside winter.
- **Cadence:** Staggered existing human realtime behavior for target/movement/pick; new-calendar-day regrowth from `tickLayerDaily.ts`.
- **State fields written:** Tree `forageKind`, `blueberryYield`, and `blueberryNextRegrowthDay`; transient human `blueberryForageTargetId`; existing capped food, energy, and floating feedback.
- **Performance impact:** Existing `treeGrid` lookup, staggered at 18 ticks, plus at most three blueberry trees per world; no map-wide tree scan per human per tick and no new tick layer.
- **Save/migration impact:** Tree identity/yield/regrowth are in the entity save allow-list and worker render-meta sidecar. Exact-version policy still requires a fresh settlement.
- **Rollback plan:** Remove the daily hook, human owner call, and marked rare trees; ordinary trees, hunting, farms, and food storage remain intact.

### Age-14 Fertility Change Record

- **Owner module:** `src/game/simulation/humanRelationships.ts`; birth remains exclusively in `src/game/simulation/humanLifecycle.ts`.
- **Decision changed:** Youth-love pairs may pass one lower-probability daily conception gate beginning at age 14.
- **Cadence:** Existing once-per-calendar-day conception call; no realtime relationship roll or new lifecycle path.
- **State fields written:** Existing pregnancy fields and `pregnantById` only; no marriage, residence, workforce, or youth-love field is created by conception.
- **Guardrails:** Mutual living player pair, female aged 14–17, male partner aged 14+, proximity under 22, energy gates, existing cooldown, and reduced age multiplier. Adult married and affair behavior is unchanged.
- **Rollback plan:** Remove the youth branch and fertility multiplier helper; adult conception and the lifecycle owner remain intact.

### Graphics Change Record

- **Render owners:** `renderer/spriteDrawing.ts`, `renderer/humans.ts`, `renderer/animals.ts`, `renderer/trees.ts`, and `renderer/buildings.ts`.
- **Change:** Shared contact/cast shadows and restrained AO intensity for visible subjects.
- **Cadence:** Presentation-only, after existing per-subject viewport culling in the cached entity passes.
- **Simulation impact:** None. No `WorldState` writes, worker messages, navigation, collision, click targets, or pathing changes.
- **Accessibility/performance:** Existing reduced cosmetic-effects preference removes the cast tail and reduces AO strength; no terrain or entity cache is invalidated solely for the effect.
- **Regression coverage:** `tests/renderer.presentationLayout.test.ts`.
- **Rollback plan:** Restore the former per-renderer ellipse calls; no save or migration work is required.

## <u>[0.6.2]</u> — 2026-08-21

**A village that works, celebrates, talks, and grows up.** This release promotes the player-facing work completed after v0.6.1.1: reliable worker commands, living festivals, readable social life, Chronicle parity, pathing and hunt repairs, clearer building presentation, expanded dialogue, and youth love. Save compatibility: **0.6.2 exact-version policy** — start a new settlement when updating from another build.

- **Post-v0.6.1.1 release highlights** — worker commands no longer wait behind a permanently busy worker pipeline; leaders can work and receive early housing; festivals visibly interrupt ordinary routines; Chronicle events arrive newest-first with a Milestones filter; building anchors, dialogue bubbles, hunting visuals, and commute paths are repaired; live right-side charts are removed; and the split dialogue bank now carries 115 trees across seven categories.
- **Youth love begins at 14** — eligible single settlers aged 14–17 can become mutual sweethearts. Shared school attendance and childhood friendships increase the chance; a relationship never creates a marriage, household, pregnancy, workforce assignment, or scandal.
- **First loves can end naturally** — youth pairs receive a daily, school-sensitive breakup check, allowing them to grow apart without affecting adult relationship state.
- **Growing up together is possible** — if both sweethearts reach 18, their mutual youth link converts once into the existing adult courtship path with carried progress. That path alone can create a marriage, so settlers now never marry before 18.
- **Authoritative daily ownership and save safety** — `humanRelationships.ts` owns youth state; `tickLayerDaily.ts` runs the bounded daily decision using the existing human social grid; optional entity fields preserve old saves structurally, while full-moon transformation also preserves active youth-love state. `simulationInvariants.ts` now reports one-sided or adult-overlapping youth links without mutating them.
- **Regression coverage** — added `tests/youthLove.lifecycle.test.ts` for the age gate, school influence, non-marital breakup, invariant reporting, and adult handoff. Extended the authority’s owner table, cadence contract, age ladder, and invariants. Validation: focused **3 files / 40 tests**, TypeScript, scoped ESLint, full suite **63 files / 371 tests**, and production build passed. The existing circular-chunk and large-bundle build warnings remain.

### Simulation Change Record

- **Owner module:** `src/game/simulation/humanRelationships.ts`
- **Decision changed:** Youth relationship formation, persistence, natural breakup, and transfer to adult courtship.
- **Cadence:** New-calendar-day through `tickLayerDaily.ts`.
- **State fields written:** `youthLovePartnerId`, `youthLoveProgress`, `youthLoveStartedDay`; existing `courtshipPartnerId` and `courtshipProgress` only at the age-18 handoff.
- **Why the change is needed:** Settlers previously skipped directly from childhood school bonds to adult courtship, with no visible first-love phase or school effect.
- **Player-visible behavior before:** School friendships only made a later adult candidate feel closer; marriage could occur from age 16.
- **Player-visible behavior after:** Teen sweethearts may form after age 14, may drift apart, and can become adult courtship at 18; marriage is not possible earlier.
- **Performance impact:** One daily pass over existing player-human arrays with local social-grid queries; no realtime full-population scan or new tick layer.
- **New or updated tests:** `tests/youthLove.lifecycle.test.ts`; existing school-bond and simulation-invariant coverage.
- **Invariants checked:** Mutual youth links, no adult partner overlap, no direct youth marriage/pregnancy/housing/workforce state, adult handoff only at 18.
- **Save/migration impact:** New fields are optional, but the beta build retains the project’s exact-version save policy and therefore requires a new settlement when moving between builds, including v0.6.1.1 and v0.6.1.2.
- **Rollback plan:** Remove the daily `advanceYouthLove` call and optional youth fields; existing adult courtship remains intact.

## <u>[0.6.1.1]</u> — 2026-08-20

**Simulation governance, workforce authority, worker reliability, relationship
truth, and Moon Howler rarity (Objectives 1–10 of the regression-proofing
plan), plus the leader-workforce and spawned-pregnancy fixes.** Save
compatibility: **0.6.1.1 exact-version policy** — only this build's saves load
(0.6.1 and earlier are rejected). Suite: **50 test files / 331 tests, 0
lint/type errors**, 12 bug reports filed — all verified or closed (won't-fix).

Post-program fixes (2026-08-20 session):
- **Ambient dialogue-bank humor expanded (2026-08-21)** — added one original three-line frontier exchange to every canonical category: work, needs, social, environment, existential, chaos, and festival. The new banter covers a wandering fence, courage stew, a well-dressed crow, council-outsmarting frogs, debt-collecting clouds, a grain-shed goat, and a prize turnip. All content stays in the canonical split JSON bank with no simulation or worker behavior change. Updated `tests/dialogueTrees.splitBank.test.ts` to pin **115** unique trees and **6** festival trees. Validation: focused regression, TypeScript, scoped ESLint, full suite **62 files / 366 tests**, and production build passed. Existing circular-chunk and large-bundle warnings remain.
- **Leader works like any other settler** — the office no longer strips a valid
  workplace: `applyLeaderOccupation` preserves it (stale-only repair),
  save-load keeps a manual/auto assignment, and auto-staff may assign an idle
  leader (removed the `allowLeader` option and every `occupation !==
  LEADER_OCCUPATION` candidate exclusion). Idle/working counts are truthful
  (office alone is not a job). Bug report:
  `2026-08-20-leader-cannot-hold-workplace.md`. Tests: `leaderHouse.workforce.test.ts`,
  `workforce.transitions.test.ts`.
- **Spawned-pregnancy invariant fix** — `entityFactory.createEntity({pregnant:true})`
  now sets `pregnancyDueProgress` (same 85%–115% term formula as the conception
  owner), closing a §5 invariant hole where immigrant expecting couples
  (world-gen/immigration spawn path) were created pregnant without due progress,
  silently masked to `PREGNANCY_TICKS` by the lifecycle fallback. Bug report:
  `2026-08-20-immigrant-pregnancy-missing-due-progress.md`. Regression tests:
  `tests/simulation.invariants.test.ts` (constructor + immigrant-couple paths).
- **Dead worker-test config removed** — `vitest.browser-worker.config.ts`
  referenced `src/test/game/simWorker/*` suites that never existed post-hoist
  and is not runnable in the node vitest env (no `globalThis.Worker`); worker
  command behavior stays proven by parity-by-construction through the shared
  `applyWorkerCommand` (`workerCommand.roundtrip.test.ts`,
  `gameLoop.commandDispatch.test.ts`). knip entry removed; CHANGELOG note
  updated.
- **Worker-stall optimistic-command rollback repaired** — when the watchdog
  falls back to the main thread, `gameLoop.ts` now restores the worker's
  authoritative world before disposing the worker host, so rejected optimistic
  assignments, demolitions, and other commands cannot remain visible. Added a
  regression test in `tests/gameLoop.commandDispatch.test.ts`; bug report:
  `BUG REPORTS/2026-08-20-worker-stall-optimistic-revert.md` (verified).
- **Movement ownership consolidated** — `src/game/humanMovement.ts` is now an
  explicit compatibility re-export of the authoritative
  `src/game/simulation/humanMovement.ts`, preventing the two movement copies
  from drifting. Added a legacy-import regression assertion in
  `tests/humanMovement.test.ts`; bug report:
  `BUG REPORTS/2026-08-20-duplicate-movement-owner.md` (verified).
- **Full-codebase audit recorded** — added `docs/FULL_CODEBASE_AUDIT_2026-08-20.md`,
  `docs/OBJECTIVE_PLAN_FULL_AUDIT_2026-08-20.md`, and
  `docs/WORKER_LOGIC_AUDIT_2026-08-20.md`. Remaining objectives cover lifecycle
  golden tests, real browser-worker integration coverage, dependency-cycle
  classification, and static-audit debt triage.
- **Session validation** — full suite: **51 test files / 336 tests passed**;
  TypeScript and ESLint passed.
- **Single developer playbook added** — created
  `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md` as the canonical operational workflow
  for audits, bug fixes, and new features. It consolidates ownership, cadence,
  worker authority, objective generation, bug reports, feature design, tests,
  change records, and end-of-session documentation requirements. The docs index
  now points to it as the starting document.
- **Feature-development process documented** — the playbook now requires a
  feature proposal, one owner and cadence, a smallest vertical slice, failure
  behavior, diagnostics, worker/main-thread parity, focused and full validation,
  save-impact review, changelog, and README updates.
- **Player/developer documentation separated** — the root `README.md` remains
  player-facing; developer workflow stays under `docs/`; `CHANGELOG.md` remains
  the versioned engineering record.
- **Documentation cleanup** — removed six disposable root-level audit output
  files (`audit-baseline.*`, `audit-knip-after-movement.*`, and
  `dependency-audit-baseline.*`) and removed the byte-identical duplicate
  `docs/THIRD_PARTY_NOTICES.md`; the canonical root `THIRD_PARTY_NOTICES.md`
  was preserved. No README changes were made.
- **Leadership invariant aligned with acting-head behavior** — the invariant
  collector now delegates leader identity validation to
  `isActingVillageHead()`, so a living elected leader remains valid during a
  temporary Moon Howler transformation while dead or invalid leaders remain
  rejected. Added the regression in `tests/simulation.invariants.test.ts` and
  governed report `BUG REPORTS/2026-08-20-leader-moonhowler-invariant-mismatch.md`.
  Focused leadership tests passed: **4 files / 42 tests**; full suite passed:
  **51 test files**.
- **Leader’s House pacing and temporary housing repaired** — changed the
  Leader’s House baseline from six to **two in-game work-days**, matching the
  normal House. Placing an unfinished Leader’s House now re-runs normal housing
  assignment so the leader’s household remains in an available completed home;
  the official manor move still occurs only after construction completes.
  Added `tests/leaderHouse.construction.test.ts` and verified
  `BUG REPORTS/2026-08-20-leader-house-build-duration.md`. Focused tests passed:
  **4 files / 39 tests**; full suite passed: **52 test files**.
- **Worker tick-error fallback repaired** — `GameWorkerHost` now reports tick-level
  faults through a typed callback, and `GameLoop` reuses the existing
  authoritative-shadow restore, worker disposal, and main-thread resume path used
  for stalls. Added regression coverage in
  `tests/gameLoop.commandDispatch.test.ts` and verified
  `BUG REPORTS/2026-08-21-worker-tick-error-does-not-fallback.md`. Focused worker
  tests passed: **2 files / 17 tests**; full suite passed: **51 files / 338 tests**.
  Scoped ESLint passed. TypeScript/build checks remain blocked by the existing
  `baseUrl` deprecation error in `tsconfig.app.json`.
- **Festivals now visibly interrupt ordinary routines** — from **15:00 through
  21:59** on an active festival day, non-innkeeper settlers leave normal work,
  school, guard patrols, commute snapping, home-stay, and free hunting to gather
  at performer camps, staffed Town Halls, or the village center. They drift and
  socialize on arrival; Moon Howler danger/priest duty and election ceremonies
  remain higher priority, while innkeepers continue running the festival tavern.
  The daily festival owner, assignments, jobs, occupants, production rules, and
  save schema are unchanged, so normal work resumes automatically at 22:00 or
  when the festival expires. Added `tests/festival.behavior.test.ts`, extended
  `tests/dayCycle.tavern.test.ts`, and verified
  `BUG REPORTS/2026-08-21-festival-participants-keep-working.md`. Validation:
  **52 test files / 341 tests**, TypeScript, and scoped ESLint passed.
- **Hunting cleanup authority and Hunt Visual lifecycle repaired** — a successful
  staffed Hunting Spot now delegates wildlife removal, reverse hunter-target
  cleanup, and spatial-index synchronization to the shared simulation helpers,
  instead of maintaining a partial daily-only death path. Hunt Visuals now prune
  against their 1.4-second wall-clock visibility window rather than 45 simulation
  ticks, preventing finished arrows from lingering in worker/render snapshots for
  speed-dependent durations. Added `tests/huntingSpot.cleanup.test.ts` and
  `tests/huntVisuals.lifecycle.test.ts`; verified reports:
  `BUG REPORTS/2026-08-21-hunting-spot-bypasses-wildlife-cleanup.md` and
  `BUG REPORTS/2026-08-21-hunt-visuals-expire-on-simulation-ticks.md`.
  Validation: **54 test files / 344 tests**, TypeScript, scoped ESLint, and the
  production build passed. Existing circular-chunk and large-bundle warnings
  remain.
- **Commute path-cache identity completed** — tile-local cache reuse now keys on
  both A* endpoint tiles, not only building/mode and the start tile. The earlier
  pixel-origin repair stopped almost-every-update cache misses; this follow-up
  prevents settlers with distinct deterministic stand tiles at the same building
  from sharing an incompatible cached route. Updated
  `tests/humanMovement.test.ts` and added the verified report
  `BUG REPORTS/2026-08-21-commute-path-cache-missing-target-tile.md`.
  Validation: focused movement/pathfinding **2 files / 9 tests**, TypeScript,
  scoped ESLint, full suite **54 files / 344 tests**, and production build passed.
- **Bug-report audit completed** — reviewed every active report under
  `BUG REPORTS/` against current owners, code, and tests. Restored the missing
  `tests/socialLife.dialogueBusy.test.ts` regression for the dialogue-busy
  predicate, then normalized the archive to a single **Resolved** status for
  solved bugs. Reports with an outstanding player-facing confirmation now say
  **Resolved — live verification pending**, while the caravan false positive
  remains **won't-fix**. Added `docs/BUG_STATUS_OVERVIEW.md`, a single full
  report table with the five remaining player test scenarios and closure steps.
  Audit suite: **55 test files / 347 tests**, TypeScript, and scoped ESLint
  passed.
- **Protected write-site ownership guard added** —
  `tests/simulation.writeOwnership.test.ts` now scans direct writes to
  pregnancy state, workplace/residence assignment, Moon Howler curse state,
  hunt targets, and village leadership. It freezes approved domain owners and
  documented delegates, requires the canonical owner for each non-transient
  decision, and confirms the legacy movement path remains a pure re-export.
- **Grid A-star upgraded without an engine migration** —
  `pathfinding.ts` keeps the sole realtime/worker-safe grid owner and now uses a
  deterministic binary min-heap instead of a linear open-set scan. This preserves
  8-way movement, blocked water/mountain cells, no diagonal corner-cutting, the
  node budget, path cache, and direct-movement fallback. EasyStar.js was not
  added because its asynchronous calculation queue would introduce a second
  scheduling contract; Phaser was not added because it is a renderer/engine
  migration rather than a pathfinding dependency. Added corner and budget
  regressions in `tests/pathfinding.test.ts`.
- **2.5D graphics roadmap added** — `docs/GRAPHICS_UPGRADE_ROADMAP.md`
  documents a cache-safe visual direction for the existing Canvas renderer. The
  first proposed bounded objective is contact shadows and occlusion depth;
  Phaser/WebGL migration and simulation-affecting visual roads are explicitly
  deferred pending measured need and separate ownership decisions.
- **Simulation depth roadmap added** — `docs/SIMULATION_DEPTH_ROADMAP.md`
  prioritizes player-readable village requests, festival outcomes, seasonal
  preparation, ecology signals, apprenticeship, and abstract expeditions. It
  defines the first bounded objective around existing `groupEvents.ts` ownership
  and explicitly keeps new content inside the worker-authoritative, fixed-cadence
  simulation contract.
- **Right-side live charts removed** — the Progress Charts view and live history
  graphs for population, ecosystem health, and pollution no longer appear in the
  player menu. Current village/resources values and lifetime records remain;
  underlying yearly statistics remain intact for save compatibility and internal
  diagnostics.
- **Chronicle worker propagation and filter parity repaired** — the event-log
  audit verified that 28 simulation modules use the canonical logger and cover
  all 13 supported Chronicle event categories. It also found and resolved two
  player-facing defects: worker deltas previously sent the oldest 128 entries
  and appended them in a newest-first log, so fresh authoritative worker events
  could be absent from the UI; deltas now send the newest prefix, merge it at the
  front without duplicate ids, and retain the shared 2,000-event bound. The UI
  now provides a direct **Milestones** filter, completing one filter per event
  category. Added `tests/simDelta.eventLog.test.ts` and
  `tests/eventLogPanel.filters.test.ts`; verified reports:
  `BUG REPORTS/2026-08-21-worker-event-log-tail-sends-oldest-events.md` and
  `BUG REPORTS/2026-08-21-chronicle-milestones-cannot-be-filtered.md`.
  Validation: **58 test files / 354 tests**, TypeScript, scoped ESLint, and the
  production build passed. Existing circular-chunk and large-bundle warnings
  remain.
- **Building footprint and dialogue readability repaired** — the Canvas audit
  found that one generic sprite anchor/scale made unusually framed building art
  look compressed or poorly grounded, and independent overhead labels could
  obscure conversations. `BuildingConfig` now supports render-only sprite scale
  and bottom-anchor metadata; the Leader’s House uses a tuned 1.32 scale and
  0.97 anchor consistently in preview, construction, and completed rendering.
  Dialogue remains directly above its speaker’s head, has priority over the
  temporary name plate, clears a leader crown, stacks nearby conversations, and
  renders above floating simulation notices. Added
  `tests/renderer.presentationLayout.test.ts`; verified reports:
  `BUG REPORTS/2026-08-21-building-sprites-use-generic-footprint-layout.md` and
  `BUG REPORTS/2026-08-21-overhead-dialogue-overlaps-labels-and-notices.md`.
  A live local playtest placed a standard House and confirmed that the running
  leader’s “Wood pile low.” dialogue bubble remained readable directly above the
  speaker. Validation: **59 test files / 359 tests**, TypeScript, scoped ESLint,
  and production build passed. Existing circular-chunk and large-bundle warnings
  remain.
- **Dialogue bubble lifetime normalized** — a short spoken phrase could remain
  above one citizen for most of an in-game day because `humanChat.ts` retained
  raw 24-tick-day display timers after the simulation moved to 72 ticks/day.
  Dialogue-tree lines now use an explicit 2.5-hour base plus 0.08 hours per
  character, while direct phrase callers convert their retained legacy duration
  at the single chat lifecycle boundary. This preserves social selection and
  simulation authority while making bubbles clear shortly after the line ends.
  Added `tests/humanChat.duration.test.ts`; report:
  `BUG REPORTS/2026-08-21-dialogue-bubbles-use-unscaled-legacy-ticks.md`.
  Validation: **60 test files / 361 tests**, TypeScript, scoped ESLint, and
  production build passed. A player live check is still pending.
- **Ambient dialogue now pairs nearby settlers** — ordinary social speech no
  longer randomly discards an available neighbor into a leader-only monologue.
  The existing dialogue bank already provides alternating two-speaker trees; the
  ambient entry point now always selects an eligible nearby participant when one
  exists, reserving solo lines for isolated settlers. Added
  `tests/humanChat.ambientPairing.test.ts`; report:
  `BUG REPORTS/2026-08-21-ambient-dialogue-often-becomes-leader-monologue.md`.
  Validation: **61 test files / 363 tests**, TypeScript, scoped ESLint, and
  production build passed. A player live check is still pending.
- **Dialogue content split into canonical categories** — the user-created
  `chaos`, `environment`, `existential`, `festival`, `needs`, `social`, and
  `work` files now form the only dialogue bank. The loader deterministically
  validates and merges all seven files for both the main thread and simulation
  worker; `festival` is now a first-class selection category. Five festival
  tree IDs/categories were normalized to prevent silent duplicate shadowing,
  and the retired `sim_dialogue_trees.json` monolith was deleted. Added
  `tests/dialogueTrees.splitBank.test.ts`; report:
  `BUG REPORTS/2026-08-21-split-dialogue-bank-has-duplicate-and-mismatched-categories.md`.
  Validation: **62 test files / 365 tests**, TypeScript, scoped ESLint, and
  production build passed.

Summary for this release:
- **Governance** — role-aware simulation invariants checker, static
  one-owner-per-decision registry, locked tick-layer order (realtime → systems
  every 4 → assign every 18 → daily every 72; 72 ticks/day).
- **Workforce** — named owner transitions (`assignWorkerTransition` /
  `removeWorkerTransition` / `addToConstructionCrew`), the leader participates
  in normal workforce assignment (may hold a workplace and be auto-staffed),
  Church manual-staffing save migration, demolition cleanup through
  the owner.
- **Worker commands** — dispatched immediately (no idle-wait dead clicks);
  FIFO ordering guarantees command results are never overwritten by stale tick
  deltas.
- **Truth fixes** — prisoners no longer wiped from prison occupants; truthful
  relationship diagnostics (interval vs active vs births); affair
  establishment/scandal moved out of the realtime path into the daily owner;
  Moon Howler replacement now a rare 15% roll (was guaranteed every full moon);
  spawned immigrant pregnancies carry a valid due progress.
- **UX commands apply instantly** — optimistic main-thread application with
  authoritative reconcile (see Fixed below).

### Technical
- **Simulation invariants (`src/game/simulation/simulationInvariants.ts`)** — new
  read-only `collectSimulationInvariantErrors(state)` + `assertSimulationInvariants()`
  enforcing SIMULATION_AUTHORITY.md §5: duplicate workplace assignment, worker/
  building mismatch (`homeBuildingId` ↔ occupants, role-aware for workplace /
  residence / prison / crew), stale demolished-building references, pregnancy
  without `pregnancyDueProgress`, non-pregnant humans retaining pregnancy state,
  at most one living Moon Howler, and leader residency. Reports errors; never
  repairs. Note: the collector is role-aware because a settler legitimately
  appears in one residence AND one workplace occupants list (the §10 sample
  would false-positive on every employed homeowner — documented in the file).
  Tests: `tests/simulation.invariants.test.ts` (27 tests).
- **Decision registry (`src/game/simulation/decisionRegistry.ts`)** — static
  one-owner-per-decision table (workforce, **housing**, construction, production,
  socialFeedback, courtship, affairs, conception, pregnancyBirth, moonHowler,
  leadership, commands) with cadence, written fields, scheduling point, and
  test files. No manager, no event bus, nothing imports it at runtime. Tests:
  `tests/simulation.decisionRegistry.test.ts` (4 tests).
- **Tick-layer schedule locked (`tests/gameTick.layerOrder.test.ts`)** — spies
  on the four layers drive the real `gameTick` and pin the order
  (realtime → systems every 4 → assign every 18 → daily every 72) and the
  per-interval counts; `TICKS_PER_DAY === 72` asserted explicitly. Comment
  added at the gameTick layer-call site.

### Changed
- **The leader can work (workforce authority).** Manual assignment now accepts
  the elected leader: they keep `occupation = "leader"` and manor residency
  while holding a normal workplace; auto-staff still never assigns the leader.
  `prepareWorkforce` no longer wipes a valid leader workplace (only stale ones).
- **Workforce writes consolidated into named transitions** in `workforce.ts` —
  `assignWorkerTransition`, `removeWorkerTransition`, `addToConstructionCrew`,
  plus the existing `transferWorkerBetweenBuildings`. `buildingActions.ts` now
  delegates manual assign/remove/builder-crew writes to these transitions
  instead of writing `occupants`/`homeBuildingId` directly; ~100 lines of
  duplicated helpers (`pickWorkerToTransfer`, `findOverstaffedDonorBuilding`,
  `completedJobBuildings`, `transferWorkerBetweenBuildings`,
  `AUTO_JOB_BUILDING_PRIORITY`, …) deleted. Duplicate-assignment prevention is
  now enforced at the transition, not just the candidate filter.
- **Manual-staff donor semantics unified** — the manual reassign path now uses
  the workforce donor list, which treats School and Town Hall as manual-staff
  buildings too (previously only Church/Prison/Barracks), so auto-rebalance
  never strips School/Town Hall workers. Perf (full sim, new transitions in the
  hot assign path): 200 pop avg 1.27 ms / p95 2.25 ms, 400 pop avg 1.64 ms /
  p95 2.82 ms — ACCEPTABLE (no regression).

### Fixed
- **Church removal verified** — removing a priest via the `removeWorker` command
  clears the Church and the daily auto-staff pass does not refill it (manual
  building rule). Covered by `tests/workforce.transitions.test.ts` (13 tests).
- **Church legacy saves reconciled (Objective 5)** — new one-time
  `church-manual-staffing` save migration (`clearAutoFilledChurches` in
  `saveLoad.ts`, tracked in `appliedSaveMigrations`): a legacy 0.6.1-line save
  whose Church was auto-filled before manual priest selection existed now loads
  with an empty Church (seats cleared through the workforce owner's
  `removeWorkerTransition`, so `homeBuildingId`/`occupation`/`job` stay
  consistent). The Church never auto-fills on the daily pass or via rebalance.
  Covered by `tests/church.manualStaffing.test.ts` (7 tests) and
  `BUG REPORTS/2026-08-20-church-auto-staffing.md` (verified).
- **Worker commands no longer wait for a busy pipeline (Objective 6)** —
  `GameLoop.applyCommand` previously dispatched only after `whenIdle()`; with
  4 ticks pipelined and refilled every frame, the worker could stay permanently
  busy and every click dead-waited (assignment / priest / demolition / repair /
  upgrade / modes). Commands now dispatch immediately — the worker processes
  messages FIFO, so the command applies to the post-tick authoritative state
  and its result arrives after older tick deltas (no stale overwrite).
  Full-world import/export still waits for idle (sanctioned). Covered by
  `tests/gameLoop.commandDispatch.test.ts` (3 tests) + `tests/workerCommand.roundtrip.test.ts`
  (9 tests: assignment, priest selection, reassignment, demolition, repair,
  upgrade, mine mode, workshop recipe) and
  `BUG REPORTS/2026-08-20-command-waits-for-worker-idle.md` (verified).
- **UX commands apply instantly (developer note resolved)** — `applyCommand`
  now applies every player command OPTIMISTICALLY to the display world through
  the same `applyWorkerCommand` domain implementation, so a click (e.g. manually
  choosing a worker for a building) shows its effect immediately instead of
  after the worker's FIFO queue drain. The authoritative `commandResult` (a
  full-snapshot delta) replaces the optimistic display on success and reverts
  to the authoritative world on failure; tick results arriving while a command
  is pending never overwrite the display; worker errors/disposal revert too.
  `SIMULATION_AUTHORITY.md` §2/§5 updated first (§13). Covered by
  `tests/gameLoop.commandDispatch.test.ts` (+3 tests: instant optimistic apply,
  tick-result non-overwrite + authoritative replace, revert on rejection).
- **Demolition repaired completely (Objective 7)** — `demolishBuilding` now
  cleans worker assignments through the workforce owner's
  `removeWorkerTransition` (single-writer law) instead of direct field writes,
  and decrements `totalBuildingsCompleted` for a completed player building so
  the in-session stat matches the load-time recompute. The building is removed
  once, stays removed across subsequent sim ticks (verified with 3 real days of
  `gameTick`), and the inspector is cleared. Covered by
  `tests/demolish.roundtrip.test.ts` (5 tests) and
  `BUG REPORTS/2026-08-20-demolish-command-failure.md` (verified).
- **Prisoners stay in prison occupants (discovered during demolition work)** —
  `syncJobBuildingOccupants` rebuilt every job building's occupants from
  `homeBuildingId` only, wiping prisoners (`prisonBuildingId`) from
  `prison.occupants` on every assign pass. Prisons are now special-cased:
  occupants = guards + prisoners. Covered by
  `tests/workforce.transitions.test.ts` (+2 tests) and
  `BUG REPORTS/2026-08-20-prisoner-occupants-wiped.md` (verified).
- **Relationship diagnostics are truthful (Objective 8)** — interval counters
  are now explicitly named (`conceptionCandidates`,
  `conceptionEligibilityRejected`, `conceptionProximityBlocked`,
  `conceptionEnergyBlocked`, `conceptionRollFailed`,
  `pregnanciesStartedThisInterval`, `birthsCompletedThisInterval`) and
  `activePregnancies` is computed from the authoritative state at flush (a
  seeded/earlier pregnancy is visible there, never inferred from the interval
  counters). `tryDailyConception` records the first gate that blocks each
  candidate (behavior preserved — probabilities untouched). Covered by
  `tests/relationshipDiagnostics.test.ts` (8 tests, incl. start→advance→birth
  lifecycle) and `BUG REPORTS/2026-08-20-diagnostics-ambiguous-counters.md`
  (verified).
- **Affair cadence resolved — no more realtime establishment (Objective 9)** —
  `SIMULATION_AUTHORITY.md` §3/§4 resolved (affair tryst progress = staggered;
  establishment/gossip/scandal decisions = new-calendar-day; realtime caught-in-
  the-act exposure only for established pairs). The realtime flirt path now
  advances tryst progress only (progress may begin before establishment) and
  never writes `affairPartnerId`; unestablished flirtation never rolls a
  scandal; `tryDailyAffairEncounter` (daily gate) is the sole establisher.
  Covered by `tests/affair.cadence.test.ts` (2 tests: golden no-establishment
  run + deterministic daily establishment) and
  `BUG REPORTS/2026-08-20-affair-establishment-dual-cadence.md` (verified).
  Measurement (`scripts/measure-relationship-feel.ts`, 60 seeded days):
  affairChecks/day 20.3, 27 establishments via the daily gate, 8 scandals,
  conception candidates/day 20.3, 1 pregnancy started, 3 births (2 from
  immigrant pregnancies — visible via activePregnancies), tick p50 0.4ms /
  p95 1.8ms; perf-all @100 pop: avg 1.24ms / p95 2.86ms ACCEPTABLE.
- **Moon Howler replacement is now rare, not guaranteed (Objective 10)** —
  `shouldApplyNewMoonHowlerCurse` required a rare replacement roll
  (`MOON_HOWLER_REPLACEMENT_CHANCE = 0.15`) on top of its base gates; RNG is
  injectable through `tickMoonHowlerCycle` so quiet moons, survivor returns,
  and rare replacements are deterministic in tests. A surviving Howler still
  returns on later full moons (never a second curse); after a kill/cure, full
  moons may be quiet. Covered by `tests/moonHowler.rare.test.ts` (7 tests) and
  `BUG REPORTS/2026-08-20-moon-howler-replacement-not-rare.md` (verified).

### Bug reports
- `BUG REPORTS/2026-08-20-moon-howler-replacement-not-rare.md` — **verified**.
- `BUG REPORTS/2026-08-20-diagnostics-ambiguous-counters.md` — **verified**.
- `BUG REPORTS/2026-08-20-demolish-command-failure.md` — **verified**.
- `BUG REPORTS/2026-08-20-prisoner-occupants-wiped.md` — **verified**.
- `BUG REPORTS/2026-08-20-command-waits-for-worker-idle.md` — **verified**
  (fixed: applyCommand dispatches immediately, no idle wait).
- `BUG REPORTS/2026-08-20-church-auto-staffing.md` — **verified** (fixed by the
  `church-manual-staffing` save migration).
- `BUG REPORTS/2026-08-20-caravan-clears-workforce-fields.md` — closed
  **won't-fix**: full-code audit proved caravan carriers are always spawned
  `trade_caravan`-faction entities (excluded from village job systems), so the
  flagged writes are entity creation/cleanup, not workforce mutations.
- `BUG REPORTS/2026-08-20-affair-establishment-dual-cadence.md` — **verified**
  (fixed: realtime path advances progress only; daily owner establishes).
- `BUG REPORTS/2026-08-20-housing-owner-not-declared.md` — **verified** (housing
  owner row added to SIMULATION_AUTHORITY.md §3 + decision registry `housing` key).

## <u>[0.6.1]</u> — 2026-08-17

**The valley thinks faster — 1,200 settlers at ~70 ms/tick.**

* `GAME_VERSION` **0.6.1**
* ⚠️ **Beta Save Policy:** this build loads only 0.6.1 saves.
* **New Start Required:** 0.6 and older saves are rejected — please start a new settlement.

### Performance
- **Human-only social grid** — social / greeting / courtship / affair queries no longer scan the wildlife-heavy mobile grid; a dedicated living-humans index (64-unit cells) makes the candidate set predictable
- **Adaptive spatial queries** — each radius query estimates grid-vs-array work and picks the cheaper strategy, so broad settlement-scale scans fall back to a plain array instead of bucket traversal
- **Staggered ambient social scans** — banter / greeting / impulse-pool / friend searches run 1-in-6 ticks per settler (deterministic buckets); courtship, affairs and gossip stay live
- **Behavior-specific radii** — greeting 48 · banter 72 · friendship 96 · courtship 90 · affair 120, instead of one population-scaled radius for everything
- **Result (benchmark, Large map, full sim):** 1,200 humans **~192 ms → ~70 ms avg** (p95 362 → 95 ms); every tier 200–1,200 passes the perf gate

### Technical
- `lifeSimulation.ts` split into domain modules — `simulation/simulationTypes` (TickContext), `simulation/simulationEntities` (entity bookkeeping), `simulation/humanRelationships` (affairs / courtship / scandal), `humanTick` (tickHumans); grass lives in `tickLayerDaily`, wildlife in `tickLayerSystems`; the monolith is gone
- `findClosestInRadius` delegates to `forEachInRadius` (single cell-walk implementation); `npm run dup` (jscpd) is clean
- `renderer.ts` split into focused renderer modules under `src/game/renderer/` — `grid`, `markers`, `particles`, `nightEffects`, `buildPreview`, `weather`, `scent`, `entityComposite`, and `overlay`; `renderer.ts` is now a thin render orchestrator
- Vite chunking updated so all renderer modules live in the `game-render` chunk

### Fixed
- **ES-1** — Night atmosphere and building glow were drawn twice per frame (once in `renderGame`, again inside `drawGameOverlay`), over-darkening nights and double-applying glow. The duplicate block was removed from `renderGame`; `drawGameOverlay` owns the full overlay pass.
- **ES-2** — Ecosystem connection lines (`drawEcoConnections`) only culled against the horizontal screen bounds, so off-screen vertical pairs could still be drawn. Vertical culling added.

### Saves
- Loads **0.6.1** saves only (exact-version policy); older saves are rejected — start a new settlement.

## <u>[0.6]</u> — 2026-08-17

**Build, flow, and grow: watch the valley transform.**

* `GAME_VERSION` **0.6**
* ⚠️ **Beta Save Policy:** This build loads only 0.6 saves.
* **Compatibility Dropped:** Historical-save compatibility is no longer supported.
* **New Start Required:** Saves from other builds are rejected, so please start a new settlement.

### Added
- **🎣 Fishing Spot (Phase 6: rivers feed)** — a new Food building that must straddle water (a dock): staffed fishers haul `8 + 4×workers` food per day, thin in winter (55%), rich in fall (115%). Safer than hunting — no wolves fight back. Generated sprite `fishingspot.png`
- **🌳 Wildlife Preserve (Phase 6: ecology tools)** — a new Community building: fenced wild grove that **restores ecosystem health +4** and shows the valley you're giving back. No workers
- **📜 Valley Chronicle (Phase 7: people become history)** — the victory-path replacement: **9 chapter milestones** (The Foundation → The First Harvest → The Great Hunt → The River's Gift → The Iron Age → The Market Opens → Keeper of the Wild → The Alliance → A Century). Each unlocks once, logs to the chronicle, grants a small reward, and appears as a **center-screen title card**. Progress lives in Progress → Goals. No win/lose — the valley just keeps living
- **🌄 Cinematic moments (Phase 8: feel)** — a title card marks your **founding** and every **chronicle chapter** unlock; **construction now builds up** visually — scaffolds grow from 45% to full size as progress rises
- **🤝 Relationships (Phase 7: relationship webs)** — settlers build **friendships** from shared work, shared homes and childhood school bonds (become friends at 60); **feuds** start when a spouse catches a cheater with a paramour, drain energy daily, and slowly heal. Friends lift each other's energy; the chronicle log tells both stories
- **🎓 Apprenticeships (Phase 7: skills pass on)** — a master (skill ≥ 40) at a staffed production building takes on the nearest juvenile; the apprentice learns fast under a good master and **graduates at skill 50** into the trade. Building panels show who is teaching whom
- **👑 Dynasties (Phase 7: family legacy)** — the Goals tab lists **living dynasties** (surnames across generations), and a true **three-generation dynasty unlocks a Valley Chronicle chapter** ("A Dynasty", +200 gold)
- **🗳️ Elections are real ballots (Phase 7: vote-support)** — every adult settler votes; **merit stays the strongest force** (a candidate ahead by >15 points wins every ballot), while **friendships boost and feuds can cancel a vote** — bonds only tip close races. Results log as "X of Y ballots", and the announcement reads "Elected by ballot"
- **🔩 Iron — a real resource at last** — the economy audit found "iron" gear was secretly paid in wood+stone+gold; now **iron is a true fifth resource**: the **Mine gains an Extract mode (🪨 Stone / 🔩 Iron)**, and all **Blacksmith forge orders cost iron** (Spears → Ballistae, ~15–40 each). Iron shows in the header (lg+), forge cost chips, challenge rewards, and the Ironport trade route pays iron. Mine iron mode yields ~21/day; the forge is now an iron sink, not a gold sink. (Audit → `docs/private/ECONOMY_AUDIT_2026-08-17.md`)
- **🎓 First-spring guide** — a living, step-by-step tutorial walks new players through their first year (build a house → plant a farm → assign workers → secure wood/meat → earn gold → prepare for winter → year two). It's a **non-modal banner** that auto-advances as you actually do each thing, and can be **skipped at any time**. New-settlement screen has a **First-spring guide On/Off choice** (remembered) — turn it off to start completely free, no tutorial at all
- **🏚️ Wood Storehouse** — a new Resources building (`storehouse_wood.png`) that shelters **+800 wood storage** for winter fuel; the base wood cap is 500 → **800**, so a 50-pop village can finally bank a winter (~900 needed)
- **🍞 Food keeps longer** — spoilage drops **3% → 2%/day** and the base food cap rises to 800 (silos still cut further); banking food for winter is now viable
- **💰 Gold has a cap** — 20,000 (was uncapped); the late-game snowball stops and the header shows the cap
- **🌾 Farms reward workers** — farm output now scales `12 + 5×workers` (was a flat 22), so a fully-staffed farm out-produces an empty one

### Changed
- **Great City challenge reward nerfed** — 1,000×4 + 500 iron → **400×4 + 200 iron** (the mid-game economy eraser is gone)
- **Placement is unambiguous (external review P0)** — placing a building now floats **`🔨 House · −40w −10s −5g · 2d`** at the site: cost charged now, build time shown, so the click's commit is obvious; header resource badges now **pop on decrease too** (rose ring) so spending is visible
- **One primary prompt (external review P0)** — while the first-spring guide's "build a house" step is live, the duplicate "Build shelter" focus hint is suppressed; the guide is the single call to action
- **Version/save docs corrected (external review P1)** — README, in-game roadmap and `ARCHITECTURE.md` now all state the current `0.5.4.2` + exact-version save policy (no more stale `0.5.4.1`/`0.4…0.5.1` claims)
- **Hygiene (external review P1/P2)** — "5 valleys" copy fixed to 6; stray `Wilderfolk - Snelkoppeling.lnk` removed from `src/game/`
- **Charts subtab (Progress tab)** — a rolling ~40-day view that makes the valley legible: the **food chain** (humans/wolves/rabbits/deer/foxes on one chart), **ecosystem health & pollution**, and **gold/food/wood/stone trends** — the loop you could only feel before, you can now read
- **Victory paths removed** (redesign) — the four hard win conditions (Eco-Utopia, Great City, Trade Empire, Harmony) are gone: they were not well thought out as end conditions and locked the sandbox into arbitrary targets. The game is now a **pure frontier sandbox** — no forced win, no victory banners; optional Challenges keep rewarding milestones, and the **village portrait** ("how history sees you") remains the live story readout. The system is slated for a proper redesign later.

### Performance
- **Quality**   pathfinding, painted valley, economy ledger, quests, trade, elections, multi-select, decor, SFX, weather, App split updated

---

## [0.5.4.2] — 2026-08-15

**The valley rises — painted relief, rivers that run, and upgrades you can see.**

- `GAME_VERSION` **0.5.4.2** · 

### Added
- **🦌 The Passing Herds** — every autumn a herd of deer crosses the valley: they graze, they are huntable, and they leave after a week. **The herds remember** — every deer you take this year makes next year's herd smaller (feast now, thinner autumns later); let them pass unharmed and they come back fat as ever
- **🎉 Seasonal festivals** — the village now holds a 5-day festival at the start of every season (Spring Revel · Midsummer Feast · Harvest Festival · Frostfall Feast): **20 guaranteed festival days per year**, with the old random festivals on top
- **🍺 Taverns never close during festivals** — the innkeeper works all day and night while the party is on, so the pub stays open around the clock
- **🌷 Decor & village beauty** — new **Decor** build tab (garden, statue, lamp, wooden fence, all procedural art). Decor stamps neighborhood beauty: settlers drift toward pretty spots in free time (and a 💐 mood lift), and the Population panel shows a **Village mood** readout fed by how much beauty surrounds your settlers
- **⛈️ Weather with real consequences** (game-feel Phase 3.4) — weather is no longer just a tint. Storm days slowly damage your buildings (recoverable with the 🔧 Repair button, halved by Fortification research, never destroying a building); **Drought cuts farm & greenhouse harvests to half**, Rain gives them a small boost
- **See the storm bite** — when a storm batters your buildings, the damage is now visible on the map: debris particles fly and a ⛈️ warning floats up from each battered roof (not just a toast)
- **🏔️ 2.5D painted relief** — the valley now reads as a landscape, not colored blocks. Coastlines and rivers get **hand-painted shores** from a painted grass-biome tileset (blob-autotiled grass↔water transitions, mirror-flipped to fill every corner), and **hills and peaks physically rise** out of the plain: raised surfaces with sun-lit edges and shaded cliff faces dropping to the lowland and water below. Buildings, settlers and props **ride the terrain** — nothing floats on slopes. Flat ground, water shimmer, season wash and zoom LOD all unchanged
- **🪵 Painted dirt hills** — Hills, Rocky and Mountain relief surfaces stamp a hand-painted seamless soil texture (matching the painted coasts)
- **🔨 Upgrades you can see** — an upgraded building now reads at a glance: **Lv2** grows a warm new roof and a chimney, **Lv3** a stronger roof, a soft gold rim, and a gentle glow at night (on top of the existing gold trim + pennant)

### Fixed
- **The herds survive a save/load** — a save made mid-migration used to drop the active herd and its year-to-year memory (the deer then lingered forever as permanent strays); the migration state now rides in the save schema, pinned by a regression test
- **No double election gossip during ceremonies** — the daily gossip roll ran *and* the ceremony's own tick gates rolled again on day-boundary ticks (72 % 18 = 0, 72 % 24 = 0), so a ceremony's gossip/tension phases fired twice on boundary days; the daily layer now stands down while a ceremony is running
- **The valley is lit at founding** — the colony now starts at 08:00 instead of midnight, so the founding scene no longer opens in pitch darkness (settlers arrive to a lit valley with visible water)
- **Rivers look like rivers** (new maps) — a river now carves a **whole-tile water band 3–5 tiles across** (wider at confluences) instead of a 1-tile thread, and the old thin blue "stream" stroke is gone — the painted water and painted shores carry the look. **Riverlands and Coastal maps finally get rivers**: river sources now form at ~70% of each preset's reachable elevation, so low-lying valleys no longer come up dry
- **Build menu switching works** — with a building tool selected you can now jump to any other build category and pick a different building directly; previously the category tab was pinned to the selected tool, so you had to cancel before switching (EM-8)

### Performance
- **One entity index build per tick instead of three** (cadence audit) — the entity-by-type index was rebuilt twice inside `gameTick` plus once for the render catalog; ticks without births/deaths/type-changes now reuse identity-stable buckets and the catalog skips its rebuild. Small measured win (~3% at 1,200 settlers), groundwork for the v0.6 capacity work

### Technical
- **App.tsx split (Phase 4)** — `VisitorCampPanel`, `SelectedEntityPanel`, `BigNewsBanner`, `ActiveEventBanner` and `ShortcutsOverlay` extracted into `src/components/`; App.tsx 2917 → 2270 lines
- **Beta save policy** — dropped the historical-save gate (`COMPATIBLE_SAVE_VERSIONS`); `parseSaveJson` now accepts only the exact current `_version`. A save from any other build is rejected with a clear message; `saveVersion.gate.test.ts` pins the new gate

---

## [0.5.4] — 2026-08-11 

**Six valleys to settle — painted lands, walking pioneers, and a frontier that breathes.**

`GAME_VERSION` **0.5.4** · continue colonies from **0.4.x – 0.5.3**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Added
- **Choose your land** — the new-settlement screen is a painted gallery: each of the **six valleys** (Verdant, Mountainous, Coastal, Arid, Harsh, and the new **Riverlands** marshland) is a tiny landscape card, and map size is a slim segmented control
- **Settlers walk properly** — human sprites can now be **4-frame walk sheets** (landscape PNGs) and the renderer animates real leg-swing frames; single-frame art still works as before. Unset outfit variants now spread across the village instead of everyone wearing outfit 0
- **Human sprite pack** — **8 outfits per gender** (was 4) and dedicated **toddler art** for kids (no more shrunk adults); a settler's standing pose now matches their outfit
- **Pavement roads** — roads and their junctions tile the seamless `tile_pavement` texture (with a flat-fill fallback while it loads)
- **The valley got painted** — procedural decor pass: snow mounds, beach ripples, clustered rocks, and tiny meadow flowers (no new art needed)
- **Titles sway elections** — settlers who earned a title (**Moonslayer**, **Howlerbane**) carry **+8 merit** into leadership votes; the title shows in the race standings and announcements
- **Schools are your call now** — teachers are **manually assigned** (no auto-fill, so you pick the personality shaping the kids), and each school caps attendance at **10 children** — a full classroom means building a second school
- **Kids are gossip couriers** — a child at school whose parent carries an established affair may let it slip, exposing the scandal as a rumor (🤫 whispered…). One slip per child per day — the schoolyard does the church's gossip work
- **Schoolyard bonds** — kids at school befriend classmates (👫 every ~5 school days, up to 3 friends); those childhood bonds follow them into adulthood and nudge who they court — a friend counts as half the distance
- **Multi-select workers** — shift-click settlers to select several at once (every selected settler shows a ring); select a building and one button assigns them all
- **Sound of the work** — the village has ambience now: soft work sounds (chopping, mining, hammering, farming, gathering) whenever staffed production is active, and quiet footsteps pitched by the surface underfoot (grass, stone, snow, forest, water). Throttled and unobtrusive — the dramatic sounds (hunts, deaths, the Moon Howler) were already wired

### Fixed
- **Saves from the current build now load** — v0.5.3 tagged its saves with a version the loader rejected, so a save made in the current build could never be read back (colony lost on refresh). The version gate accepts the current version, and a test now pins it for every future bump
- **Worker-command validation tests are running again** — three regression tests (pinning the forge/trade command validator to the real catalogs) sat outside the test suite and silently never ran; they're back in the gate
- **The hotel renders as a building** — its sprite was a JPEG wearing a `.png` name (no transparency), so it drew as a rectangle box; converted to a real transparent RGBA sprite
- **Rivers are rivers** (new maps) — the channel used to carve exactly one tile wide (a trickle); now it widens into a 2–4 tile channel in the lowlands and narrows to a stream on slopes. Existing saves keep their old terrain
- **Animals respect the water** — wildlife wades shallow water but slides along riverbanks instead of walking straight through rivers and deep water
- **The valley stops crying wolf** — three false "nature is hurt" alarms fixed: a **full meadow** no longer reads as overgrazed (it has regrow potential), a map that simply **spawned no wolves** is a caution instead of an instant crisis, and the stage now needs a **3-day warning window** before it escalates instead of dropping after one day

---

## [0.5.3] — 2026-08-07

**The night hunts back — Moon Howler exorcism overhaul, personality traits, and the deepest playtest pass yet.**

- `GAME_VERSION` **0.5.3** · continue colonies from **0.4.x – 0.5.2**.  
- Feature table → [ROADMAP.md](ROADMAP.md) · Moon Howler release notes → [docs/marketing/moon-howler-overhaul.md](docs/marketing/moon-howler-overhaul.md)

### Fixed
- **Rivers actually flow** — world-gen rivers now follow a smoothed elevation gradient from mountain peaks (with a basin-bypass fallback) and carve their channel into real water tiles; before, greedy descents died on spiky noise and rivers rendered as land on every preset
- **Clicking a citizen selects them again** — grass tiles (spawned first, 10.8px hit radius) won the click hit-test race over settlers standing on them; scenery is no longer click-selectable
- **Eco metrics no longer over-tick** — pollution / ecosystem health / biodiversity refresh once per day instead of 18×/day (pure waste removed)
- **Build hints respect tutorials-off** — the floating “Placing X” banner and the Build panel strip keep their functional bits (Done/Cancel, Rotate) but drop the how-to sentences once tutorials are disabled
- **Placement hint shows once ever** — the “Click map repeatedly to place more” text appears for the first-ever build session (tutorials on), is remembered in localStorage, and never nags per building again
- **No empty ring when zoomed out** — the camera clamp now accounts for the visible viewport: zooming out on a small map pins the view to the world center instead of exposing empty space around it (3 regression tests)
- **Moon Howler exorcism window documented correctly** — the sim breaks the curse on the **full-moon night** (20:00 → before 06:00) while the settler is still in 🌝 form, not at 7am work start; the tutorial said "dawn" and no test locked the window in. Tutorial copy now says the night window, and `moonHowler.cureWindow.test.ts` locks the window + the 7am skip (also fixed the stale "revert at 7am" note — it's 6am)

### Added
- **Placement banner removed** — building placement is now shown by the ghost on the map only; a thin "Placing X — Esc / right-click stops" line in the build panel keeps the exit discoverable (the old green banner is gone)
- **Slower baseline pacing** — a full in-game day now takes ~48 real seconds at 1× speed (was 24s); 72 ticks/day is unchanged, all speeds scale (0.5× ≈ 96s, 2× ≈ 24s)
- **Hospital is worth building** — pregnant and low-energy settlers now take clinic visits *during work hours* (walk to the ward + get treated on arrival), not just in free time or by chance proximity
- **Arrow flight FX for free-roam hunts** — hungry settlers chasing deer/rabbits now show the same dashed-arrow animation as Hunting Spots
- **New-settler notification** — immigrants arriving at the village now raise a header toast (with camera focus), not just floating text
- **Visitor intent made visible** — arrival toasts say what the group offers and clicking one selects the camp, opening the inspector with its talk / trade / refugee actions
- **No visitors in week 1** — the first visitor group now arrives day 7–14 instead of day 3–7, so the founding burst is undisturbed
- **Settler personality traits** — every villager carries **three** traits from a pool of **14** (💪 Hardy, 🛡️ Brave, 🗣️ Gregarious, 🐇 Timid, 🌿 Greenthumb, 🍀 Lucky, 💗 Nurturing, 🔮 Insightful, 🦁 Chivalrous, 🔨 Resourceful, 🏔️ Stoic, ✨ Graceful, 🦉 Intuitive, 🔥 Fierce) that subtly shape how they live: energy burn, hunting range, courtship pace, winter cold, conception luck, research speed, child maturation, militia strength, construction speed, grief recovery, and workplace banter. Children inherit each parent trait by a 50% chance (DNA-style) — a child can take after mom, dad, both, or neither. Assignment is softly gender-weighted: community & wisdom traits (nurturing, insightful, gregarious, graceful, intuitive, fierce) skew toward women; frontier traits (hardy, brave, chivalrous, resourceful, stoic) toward men — everyone can still draw any trait. Traits show in the inspector with tooltips
- **Clickable mini-map** — the map widget now jumps the camera to wherever you click, so scouting and panning are one click away (also listed in the ? shortcuts overlay)
- **New games default to Small** — new-game setup preselects Small (800×600), the size the landscape renders best at; Medium stays selectable
- **Auto-staff confirms itself** — the Auto-staff button toasts ⚒️ how many settlers it assigned, or an info note when everything is already staffed / nobody is available (2 regression tests)
- **Right-drag pan documented** — the ? shortcuts overlay now lists right-click drag as a panning shortcut
- **Moon Howler exorcism overhaul** — churches hold **up to 4 priests** (cure chance 35% → 71%); on full-moon nights priests leave home to **hunt the howler** — the rite fires when they close in (range-gated, no teleport), and a howler that stays away survives the night. A failed rite can kill the priest, but **Barracks guards nearby roll to save them** (extra roll, not guaranteed); a fallen priest scares the survivors into retreating. Active Moon Howlers show as a **pulsing red dot** on the minimap + a red ring on the map, and any howler that slips indoors is dragged back out to hunt. Settlers who **slay a Moon Howler earn the title *Moonslayer***; priests who break a curse earn ***Howlerbane*** (shown after their name)

### Performance
- **Two redundant O(n) scans removed per sim tick** — the moon-Howler cycle reuses the entity-by-type index `gameTick` already builds (rebuilding only when moon forms actually transform/revert), and the realtime layer reuses the tick-start alive-entity list instead of re-filtering `state.entities`. Behavior unchanged, verified by regression tests (40 tests)

---

## [0.5.2] — 2026-08-06

**A game-feel and depth pass — flowing water, living light, real trade, and elections that matter.**

`GAME_VERSION` **0.5.2** · continue colonies from **0.4.x – 0.5.1**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Added
- **Water & terrain** — own seamless shallow/deep water sprites, flowing wave bands, shore reflection, zoom-5 terrain LOD, per-tile terrain-atlas variation (softer bevels, painted coasts), own seamless wooden bridge sprite
- **Light & season** — warm light pools on the plaza at night, season-transition lerp, ambient particles (footstep dust, sawdust), ambient-occlusion pools under trees and buildings, water shimmer + fall leaves / winter snow-dust
- **Elections every 2 years** — 3 months of gossip buildup before the vote; the elected head makes a promise — keeping it pays
- **Real visitor trade** — visitor groups carry gold purses (no minted gold); reputation now shifts prices and raid odds, with tooltips on the ⭐ badge
- **Traveling smith quest** — a visitor asks for 20 wood, pays gold and reputation
- **Economy ledger** — "Food this day": production vs consumption in the Village tab
- **Grid pathfinding** — settlers and visitors route around water and mountains
- **Click-to-focus notifications** — toasts jump the camera to the subject
- **Favorite citizen follow** + closer zoom (max 5)
- **Level-based building visuals** — gold trim (Lv2+) and pennant (Lv3+)
- **Hunting Spot prey selection** (auto / deer / rabbit / wolf) + arrow-flight visuals
- **Village portrait** — richer Progress → Goals panel
- **Founding & tutorial polish** — no instant visitors at founding; "Show tutorial tips" toggle; dismissed tips persist; tips auto-acknowledge after 20s (never nag)

### Changed
- **Renderer** — a PixiJS v8 GPU renderer was tried, then removed: the game is **Canvas 2D only**, with baked terrain layers and a camera-decoupled entity layer; the sim worker is opt-in (`VITE_USE_GAME_WORKER=1`), main-thread ticks by default
- **Weather** — re-rolls every ~2.8 colony days (was ~60 — rain was almost never seen)
- **Hotels** — lodging is free (no gold minted from nothing); the "Hotel full" toast fires whenever at capacity
- **Build** — trees are cleared under new footprints (no more forests inside walls); collapsible building panel

### Fixed
- **Command validation drift** — Iron Swords / Scale Mail / Tower Ballistae forge orders and the "Sell wood" visitor trade now work (the validator silently dropped them); the worker advertises the real `GAME_VERSION`
- Buildings drew 2×margin px right/down (entity-layer blit sign error)
- Rival camp buildings no longer count as the player's
- Recruits spawn on valid land (never water or mountains)
- Wildlife tick skipped an entity after every in-tick death (splice during iteration)
- Quick-start tutorial no longer re-shows after skipping

### Tech
- Housing assignment builds family units once (was 24×/pass); remaining O(H²) scans removed in tickHumans
- Smoother render loop — cached layout, snapshot dirty-flag, camera-decoupled entity layer; nature tab scans only when open
- Command validation derives allowed values from source catalogs; 13 non-null assertions hardened; 26 redundant casts removed; `gameTypes` imports hoisted

### Saves
- Continues from **0.4.x – 0.5.1**

---

## [0.5.1] — 2026-07-30

**The valley feels truer and clearer.**

`GAME_VERSION` **0.5.1** · continue colonies from **0.4.x / 0.5.0**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Changed
- **Raid gold** — outgoing spoils stay grounded (no unbounded free gold)
- **Outgoing raid marches** — clearer lines on the map
- **Strained valley** — hunters and Nature signal when game runs thin

### Saves
- Continues from **0.4.x** and **0.5.0**

---

## [0.5.0] — 2026-07-30

**The valley scales — kin, beasts, and forge-steel.**

`GAME_VERSION` **0.5.0** · continue colonies from **0.4**.  
Marketing kit → [docs/archive/MARKETING_v0.5.0.md](docs/archive/MARKETING_v0.5.0.md) · Feature table → [ROADMAP.md](ROADMAP.md) · Archive → [docs/archive/ROADMAP_0.5.0.md](docs/archive/ROADMAP_0.5.0.md)

### Added
- **Forge tier 5** — Iron Swords, Scale Mail, Bastion Towers
- Intro **v0.5 milestone ribbon** + version tagline
- README **v0.5.0** hero — scale, trust, steel, life
- Spatial grids, Web Worker sim, OffscreenCanvas layers, leaner tick paths

### Fixed — sim trust
- **Moon Howlers** — job/home/prison restore; load form resync; howl cadence; cure housing
- **Raids** — counter-raid pairing; lost-raid deaths; immigration respects pop cap
- **Housing** — faster assign; household minors; orphans on death; father-first custody
- **Life / hunt** — honest meals, prison days, prey cleanup, day-scaled patrol & leisure

### Changed
- Forge progression, multi-smith pace, layout toasts, full Armament checklist
- Smoother large-valley foundation for towns that grow

### Also in this era — living valley & clearer days (July 30, 2026)

A big playability and presentation pass: the map reads as a place, the day has room to breathe, and the village’s people and ecology show up more clearly on screen.

#### Map & landscape
- **Painted ground** — seamless grass, dirt, sand, and water fills replace flat color blocks
- **Soft biome edges** — neighboring terrain blends (meadows into hills, shores into water) with a light shore lip
- **Living clutter** — bushes, stumps, grass tufts, and rock flecks scatter by terrain; forests and meadows feel fuller
- **Richer woods** — denser tree clusters, extra trees on forest tiles, more undergrowth near trunks
- **Seasons on the land** — spring/summer/fall/winter wash the whole ground layer (not a permanent “spring” bake)
- **Quieter grid & light** — play-mode grid and sun wash step back so the painted map leads

#### Day, work & lodging
- **Richer day clock** — 72 sim steps per day (3 per clock hour) so people can walk, work, and socialize without the day vanishing
- **Hotel** — build a staffed inn (2 Hoteliers); up to **4 visitors** pay gold for a bed and leave after morning
- **Tavern evenings** — Innkeepers work the evening shift; the pub stays a night-life hub
- **Remarriage** — after divorce (or when single again), settlers can court and marry cleanly

#### Ecology you can read
- **Valley stages** on the Nature tab: **Stable → Strained → Damaged → Collapse**
- Clear **drivers** (grazing, predators/prey, hunting pressure, town footprint) and short “what helps” tips
- **Focus & alerts** when the valley needs care — light pressure first, serious outcomes only if you keep ignoring the wild
- Hunt and farm yields respond gently at higher strain so the food chain stays part of the story

#### Leadership & civic life
- **Village head on the map** — crown, gold ring, name plate; header chip to find them; minimap marker
- **Five-year terms** — founding lead until Year 5, then merit elections every 5 years (ceremony, gossip, revelry)
- **Town Hall & Hospital** keep richer people-facing roles (petitions, care) alongside production

#### Build & quality-of-life
- **Build hotkeys 1–9** pick real building types for faster placement
- **Market-gated trade** — long routes need a completed Market (commerce as a real milestone)
- **Player-facing docs** — root `README.md` covers hotel, valley stages, elections, day length, and leadership

#### For developers (tooling)
- **knip** + **dependency-cruiser** — `npm run audit:knip` / `audit:deps` / `audit`
- Focused regression tests for day cadence, hotel checkout, leadership, and build hotkeys
- **Flat repo layout** — game package lives at the repository root (`src/`, `public/`, `package.json`); no nested `app/` folder

---

### Fixed — social interaction system (July 20, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) — chat/dialogue cleanup + groupEvents perf pass

- **`humanChat.ts`** — `cleanupEntityDialogueState()` removes a dead settler's dialogue session and clears `chatDialogueSessionKey` / `chatPartnerId` / `chatPhrase` / `chatTicks`
- **`dayCycle.ts`** — death cleanup now calls `cleanupEntityDialogueState()` via `finalizeHumanDeath()`, fixing stale session leaks when chat partners die
- **`dialogueTrees.ts`** — `treesById` Map replaces O(n) `.find()` in `getDialogueTreeById()` for the 95 dialogue trees
- **`humanChat.ts` bubble wrap** — `wrapChatLines()` now appends `…` to the last visible line when text overflows 3 lines instead of silently dropping words
- **`lifeSimulation.ts`** — marriage "Yes!" bubbles go through `sayHumanChatPhrase()`; duplicated divorce residence reassignment consolidated into `reassignDivorcedResidences()`
- **`groupEvents.ts`** — visitor/rival tick loops use alive-entity Map + deer cursor instead of repeated `allAlive.find()` scans; `rollYearlyWorldEvent()` guards against empty event pool; refugee admission computes `playerHumanCount()` once

### Added — spatial perf & query metrics (July 8, 2026)

**Priority 1–4 implemented; #5 (skip mobile rebuild) and #6 (type-partitioned buckets) deferred until profiling shows need.**

- **Hunt reverse index** — `buildHuntTargetByPreyIndex(byType)` built once per tick → `ctx.huntTargetByPreyId`; `clearHuntersTargetingPrey` uses `Map<preyId, Set<hunterId>>` instead of full `entityById` scans
- **`AdjacencyIndex` event-driven** (`adjacencyIndex.ts`) — sparse 80px cell map for barn/road/market placement bonuses; lives on `WorldState.adjacency`; `syncAdjacency` on completion, `unindexAdjacency` on demolish; production loop reuses index (no per-tick full rebuild); lookups only for production consumer types
- **Tree/grass grids event-driven** — `syncTreeSimGrid` / `syncGrassRenderGrid` skip rebuild when grid instance is reused; mid-tick updates via `syncSpatialGridEntity`
- **Mobile grid unchanged** — `syncMobileSimGrid` still full `rebuild()` every tick (runs first at tick start)
- **Influence layer removed** — deprecated `EntitySpatialGrid.influence` API
- **`entityById` event-driven index** (`entityIndex.ts`) — `WorldState.entityById` Map reused across ticks (not saved); `indexEntity` on birth, `unindexEntity` / `killHuman` delete on death; `ensureEntityByIdMap` only rebuilds once after load/init; no per-tick O(n) reconcile; `worldEvents`, `defenseStructures`, `frontierCombat` use persisted map

**Spatial query metrics — gateway (`tickQueries.ts`):**

- Sim hot-path queries via `findClosestInEntityGrid`, `forEachInEntityGrid`, `queryIsNearRoad`, `queryRoadAvoidance`
- **`lifeSimulation.ts`** — no direct `withSpatialQuery` / `recordSpatialCandidate` branches

### Removed — farm proximity energy bonus (July 8, 2026)

- **Farm field grazing** — removed passive +120 energy / 15% tick when near farm/greenhouse (bypassed `state.resources.food`, no design doc); meals + farm production + hunting remain
- **`BuildingProximityIndex`** — deleted (`buildingProximityIndex.ts`); only consumer was the removed bonus; `building_near` metrics category removed

### Fixed — engine & loop bugs (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch EA #1–#7

- **EA-1** — `computeRoadLayoutStamp(roads)` replaces count-only `roadAvoidanceStamp`; road demolish clears avoidance index
- **EA-2** — building repair requires **alive** occupants (`entityById`), not `occupants.length`
- **EA-3** — workshop `Needs worker` path verified reachable (workshop omits `staffed` guard)
- **EA-4** — grass reproduction allows `x/y ∈ [0, width/height]` (no border dead zones)
- **EA-5** — `setSession` / `setWorld` notify UI after worker `importSave` completes
- **EA-6** — redundant building proximity ensure resolved by removing farm proximity index
- **EA-7** — `spawnGrassPatch` bounds aligned with sim reproduction check

### Fixed — spatial perf audit follow-ups (July 8, 2026)

- **`tickHumans` social pool** — `allHumans` includes same-tick `newEntities` humans (deduped by id)
- **`tickWildlife` tamed hunt** — removed redundant pre-query `syncSpatialGridEntity`
- **`buildWildlifePopulationSnapshot`** — `newByType` zero-initialized per wildlife type

### Fixed — audit mass-fix session (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) — **429** registry IDs (**391 fixed**, **24 info**, **0 open/partial**); Batches Q, S, U, V, W, T (87), AP (8)

- **simWorker (W):** command/render desync — delta always applied on command success; headless commands; per-op validation; `sendCommand()` rejects on failure; `applySimTickDelta` before render parse
- **simBuffers (V):** `safeF32` NaN guard; screen-shake cleared in draw loop; `RESIDENCE_BUILDING_NONE` sentinel; bucket cache keyed on tick + meta
- **UI (S + AP):** stale `worldRef` canvas clicks; panel crash guards; stable `GameHeader` callbacks; single big-news dismiss; `getBuildingConfig()` fallback
- **Simulation (Q + T):** werewolf occupant/residence sync; rival building placement block; combined challenge progress; affair/hunt/divorce fixes; skills + `moonHowlerSaved` persisted on save
- **Engine (U):** education graduation guard; wildlife counts exclude humans; `byType` rebuild after church cure
- **Renderer (T):** entity cache rebuilds on camera pan; building glow from sim occupants; `finalizeMoonHowlerDeath` on kill
- **Affairs (T-M14/T-M41):** scandal sentence extends when already imprisoned for scandal; `tryExposeCaughtAffairForPair` routes caught rolls through lower entity id
- **Tests:** **390/390** vitest (71 files) — affair/prison/social integration hardened; test debt cleared (`stats.test.ts` founding `birthYear: -1`; `lifeSimulation.prison.test.ts` `withRepeatingRandom` soak)
- **Founding wildlife:** init spawns keep `birthYear: -1`; runtime replenish sets `recordBirthYear: true`
- **Hygiene:** shared `nodeRuntime.ts` disk loader; `overlapsPlayerBuilding` delegates to `overlapsAnyBuilding`; ESLint clean (`IntroScreen` purity, App hook deps, perf scripts)

### Changed — town perf script (`perf-97.ts`, July 8, 2026)

- **Reproducible spawns:** mulberry32 seed 42 (was `Math.random()`)
- **Diagnostics:** per-tick alive min/final; map/`nextEntityId` guards; optional dialogue preload (`SIM_PRELOAD_DIALOGUE=1`)
- **Focus:** `SIM_FULL_SIM=1` disables viewport culling; `process.exitCode` on failure

### Fixed — city benchmark gate (`benchmark-city.ts`, July 8, 2026)

- **Gate metric:** PASS/FAIL uses **steady-state p95** (all post-warmup ticks), not sparse `PERF_SAMPLE_EVERY` samples
- **Loop hygiene:** single `maintainCityBenchmarkState` after tick; `getSimFocus` per tick; alive sampled before maintenance
- **Metrics:** spatial query instrumentation starts at first steady tick (after warmup)
- **CI:** `process.exitCode` instead of `process.exit()`; `BENCHMARK_GATE` enabled when unset or `'1'`
- **Percentile:** nearest-rank p95 documented (differs from Excel/Numpy interpolation)

### Added — frontier raid response & balance (July 8, 2026)

- **Outgoing raid phase** — `launchRaidOnRival()` dispatches a war-band; rival may **offer tribute** or **choose to fight**; player always gets **Accept tribute** / **Decline — attack anyway** or **Press the attack** (`pendingOutgoingRaidEvents`, `respondToOutgoingRaidEvent`)
- **Raid vs counter-raid labels** — proactive strike = “Raid their camp”; retaliation after an incoming war-band = “Counter-raid their camp” (`isCounterRaidOnRival`, `getOutgoingRaidActionLabel`)
- **Population-scaled raid casualties** — victories and barricade holds always cost lives; tiers scale with village size (`getRaidCasualtyBounds`)
- **Raid loot bundles** — incoming defense can lose food/wood/stone/gold; outgoing wins grant multi-resource spoils (`RaidLootBundle`, `formatRaidLootSummary` on banners)
- **Peace + outgoing marches** — treaties recall in-flight player war-bands (`cancelPendingOutgoingRaidsForRival`)
- **Raid participant rewards** — everyone who fights earns **Guard** skill XP (`rewardRaidParticipants`, `getRaidParticipants`); tier scales with outcome (decisive win 1.1 → defeat 0.4 / outgoing success 1.0 → fail 0.45 / tribute march 0.3)
- **Leader raid glory** — sitting village head who was in the fight gets **+0.45** extra Guard XP; on a win they also gain **village reputation** (+1 meager / +2 narrow / +3 outgoing success / +4 decisive)
- **Raid XP → merit elections** (`villageLeadership.ts`, `skills.ts`):
  - **Personal merit (all candidates)** — each fighter's Guard XP stacks like any job skill; at election `getLeadershipScoreBreakdown()` adds `skillPoints = round(sum(all job skills) × 2)` — challengers and incumbent alike
  - **Incumbent record only** — raid rep bonuses feed `getIncumbentRecordAssessment()` economy/village-health thresholds; **recordPoints** capped at **+8** positive; challengers have no record score
  - **No XP without fighting** — incoming pay-off grants no Guard XP; barricade/defend/outgoing fights do
- **Vitest** — **358** tests, **67** files (`frontierCombat.test.ts` — outgoing tribute + raid XP/rep; `moonHowler.cycle.test.ts`; `entityLayer.test.ts` — outgoing raid cache key)
- **`RenderSnapshot`** — `pendingOutgoingRaidEvents` mirrored from `WorldState` (fixes `entityLayer.test.ts` / `tsc` typecheck)

### Changed — victory goals & trade empire (July 8, 2026)

- **Population victory targets raised** — Eco-Utopia **250** humans; Great City **400** humans + **60** buildings; challenge `great_city` **250** + **35** buildings; `thriving_town` **50** (`VICTORY_TARGETS` in `victory.ts`)
- **Harmony path fixed** — counts **untamed** wolves only (`tamedBy == null`); **8** wild wolves + **15** wildkin — coexistence, not taming
- **Walking trade caravans** — `tradeCaravans.ts`: merchants walk from Market/Store/Town Hall to partner edge and back; goods exchange at partner (export) and village (import); map **🚚** lines in `renderer.ts`; Progress tab status in `App.tsx`
- **Trade Empire victory harder** — all **7** routes (added Spice Coast, Granite Reach), **40** round-trips, **50,000** gold from caravan trade (`lifetimeStats.goldFromTradeRoutes`)
- **Instant abstract trade removed** — `updateTradeRoutes()` replaced by `tickTradeCaravans()` in `gameEngine.ts`
- **Tests** — `victory.test.ts`, `tradeCaravans.test.ts`

### Fixed — Moon Howler 14-day cycle & Church cure (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch N #1–#7

- **Recurring hunts** — uncured settlers now transform at **8pm** on full-moon colony days (0, 14, 28…) and revert at **6am** the next morning; no longer reverts on arbitrary daytime ticks (`isMoonHowlerTransformTick` / `isMoonHowlerRevertTick` in `moonHowler.ts`)
- **Calendar** — moon logic uses `getAbsoluteCalendarDay(state.tick)` so the 14-day cadence stays aligned with the sim clock
- **New curse** — when no active Moon Howler curse exists and population > 5, one settler is cursed on the next full moon (replaces 8% RNG); transforms the same night
- **Church cure** — staffed Church rolls **~18%** on the **full-moon night** (20:00 → before 06:00) while the settler is still in werewolf form; village-wide, no proximity check (`tryMoonHowlerChurchCures`)
- **Alerts & debug** — “Full Moon!” fires when Moon Howlers are abroad at 8pm even if the transform tick was missed; debug spawn transforms on the current full-moon night
- **Tests** — `moonHowler.cycle.test.ts` (hunt days 0/14/28/42); `moonHowler.test.ts` (dawn cure RNG, new-curse gate)
- **UI** — Church panel, help tab, and building hints describe the full-moon-night (20:00–06:00) exorcism in 🌝 form (~18%, village-wide), not a "dawn (7am)" cure

### Fixed — caught-affair divorce after imprisonment (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch P #1–#3

- **Divorce after imprison** — caught affairs imprisoned the cheater first (teleport to prison), then required the spouse within 40px for divorce — so marriages almost never ended despite scandal + prison logs. Caught-in-act path skips the proximity check and always divorces
- **Either spouse** — men and women can cheat; husbands and wives can both initiate divorce (`dissolveMarriage` in `nameLoader.ts`)
- **Notifications** — `formatCaughtCheaterDivorceDetail()` — maiden-name line only when the cheating partner is a woman with a stored maiden surname
- **Tests** — `lifeSimulation.affair.test.ts` (**18** tests): prison-far teleport divorce; husband divorces imprisoned wife

### Fixed — orphaned marriages, vitest dialogue preload, prison flake (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch O #1–#3

- **Orphaned marriages** — end-of-tick `allAlive` prunes dead entities; survivors could keep `partnerId` pointing at a removed id (`human 285 married partner 831 missing or dead` on seed-42 day 29). `reconcileOrphanedMarriages()` in `dayCycle.ts` runs before `state.entities = allAlive` (accepts human **or** cursed 🌝 form as valid partner)
- **Vitest dialogue bank** — top-level `await preloadDialogueBank()` in `src/test/setup.ts` (disk load via dynamic `import()` like `nameLoader.ts`); fixes parallel-worker race with async `beforeAll`
- **Prison integration flake** — `lifeSimulation.prison.test.ts` uses `withRepeatingRandom(0.1)`, calendar-day pin, mortality mock, and two-pass fixture wiring; surfaces caught or rumor scandal over 120 days
- **Tests** — `lifeSimulation.mortality.test.ts` (`reconcileOrphanedMarriages` ×3); social integration seed-42 (30/60 day) green

### Fixed — scandal imprisonment (July 8, 2026)

- Only **married** affair offenders are imprisoned; single paramours are not jailed (`isMarriedScandalOffender`); arrest runs before divorce clears marital status

### Added — settler dialogue trees (July 8, 2026)

- **Dialogue-tree chat** — `sim_dialogue_trees.json` (95 trees, 3-line paired banter); `dialogueTrees.ts` + dialogue-first `humanChat.ts` with session advance and multiline bubbles
- **Legacy line migration** — old `humanChat` one-liners converted to `wf_*` trees (`migrate-legacy-dialogue.py`); Sims-style `dt_*` trees retained
- **Chat wiring** — `lifeSimulation.ts` partner-aware `settlerChat` / `settlerPairChat`; `foodLow` / juvenile `child` context; `resetDialogueSessions()` on render cache reset
- **Chat tests** — `humanChat.test.ts` (17), election gossip/winner in `villageLeadership.test.ts`, marriage `Yes!` in `lifeSimulation.courtship.test.ts`

### Added — scale, worker, quality (July 8, 2026)

- **Dual-layer spatial grid** (`spatialGrid.ts`) — **grass 56px** (graze only) + **mobile 80px** (flee/hunt/social); `RoadAvoidanceIndex` 128px; each hot path uses the correct layer — [TECHNICAL.md](TECHNICAL.md#dual-layer-spatial-grid); `USE_SPATIAL_GRID` on by default (`VITE_USE_SPATIAL_GRID=0` for A/B)
- **Spatial query metrics** (`spatialQueryMetrics.ts`) — per-tick candidate/query counters; reported in `npm run bench` / city sims; A/B via `benchmark-spatial-ab.ts` (July 2026 city: graze **~99%**, flee **~88%** reduction vs naive)
- **Web Worker simulation** (`simWorker/`) — optional `gameTick` off main thread (`VITE_USE_GAME_WORKER=1`); `GameWorkerHost`, render SoA ping-pong (`simBuffers/`), `WORKER_PROTO` negotiation, headless tick path
- **Entity catalog** (`entityCatalog.ts`) — O(1) citizen lookup; main-thread `catalog` state synced from `GameLoop.subscribe`
- **Save schema allow-list** (`saveSchema.ts`, `viewState.ts`) — `pickWorldFieldsForSave()` trims save bloat; camera pan preserved on load
- **Vitest suite** — **358** tests across 67 files (`npm test` / `npm run test:all`); helpers in `src/test/` (housing, social, worker parity, ecosystemPressure, packRenderSoA, protocol, dialogue chat, Moon Howler cycle)
- **Build catalog sidebar** — `BuildCatalogPanel.tsx` + `buildCatalog.ts` category rail (replaces deleted `BuildHotbar.tsx`)
- **Resource badges** — `ResourceIcons.tsx`, `ResourceBadge.tsx`, `resourceLabels.ts`
- **Citizen IDs** — `#id` search, death log age suffix (`citizenId.ts`)

### Fixed — comprehensive bug pass (July 7–8, 2026)

**226 tracker items closed** (130 master + 96 batches A–J, July 8 bug pass). Highlights:

- **Sim/UI:** ecosystemPressure shared thresholds (#3–7), viewState camera + save merge (#3/#5), packRenderSoA overflow top-k (#17), protocol feature handshake (#13)
- **Life/save:** `lastProcessedCalendarDay` on load, affair conception site (no hour gate), population snapshot single-pass, weather particles on canvas resize
- **Worker:** `GameWorkerHost` `commandChain`, headless `tickResult`, proto guards on all responses
- **Renderer:** SoA shim safety, night-glow cull, walk threshold, terrain dispose, rain batch, grid viewport
- **Tooling:** production `tsc -b` clean; **ESLint 0 errors** (was 70 — App.tsx ref/`useLayoutEffect` sync, test unused imports, React hooks rules)

### Fixed — marriage integrity + Moon Howler spouses (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch I #1–#3

- **`killHuman` / `finalizeHumanDeath` (`dayCycle.ts`)** — single death cleanup entry for player settlers (`isKillableSettlerEntity`: human **or** cursed full-moon werewolf): sets `alive = false`, strips building occupants (`homeBuildingId`, `residenceBuildingId`, prison fields), and **widows the survivor** — clears `partner.partnerId`, sets `relationshipStatus` to `single` (or `expecting` if pregnant)
- **Death paths unified** — all production human kills now call `killHuman(..., entityById)` instead of bare `alive = false`:
  - `tryDailyHumanMortality` — old age + sudden illness (`lifeSimulation.ts`)
  - exhaustion — active and off-screen throttled paths (`lifeSimulation.ts`)
  - childbirth energy depletion (`lifeSimulation.ts`)
  - predator kill — Moon Howler / wolf hunt on human prey (`lifeSimulation.ts`)
  - raid defense casualties (`frontierCombat.ts`)
  - disaster / plague (`worldEvents.ts`)
- **Moon Howler marriage false-negative (root cause of seed-42 social sim failure)** — on full moon, `transformToWerewolfForm` sets `type = EntityType.Werewolf` while marriage fields remain in `moonHowlerSaved`; `livingHumanAt` and `assertSimInvariants` only accepted `EntityType.Human`, so EOD day 29 reported `human 20 married partner 120 missing or dead` although id 120 was alive as a cursed werewolf with `partnerId: 20`
- **`isSettlerRelationshipEntity` (`moonHowler.ts`)** — returns true for alive humans **or** alive `EntityType.Werewolf` with `moonHowlerCursed`; wired into `livingHumanAt`, `resolveChatPartner`, and `assertSimInvariants`
- **Test fixture id collision** — `lifeSimulation.social.integration.test.ts` no longer hardcodes ids `20`/`120`/`121` (collided with `initGame` auto-spawn, e.g. tree id 120); lovers/spouses allocated via `state.nextEntityId++`
- **Werewolf-form deaths** — `tickWildlife` old-age and starvation paths call `markWildlifeDead` → `killHuman` for cursed settlers (not bare `alive = false`)
- **Tests** — `lifeSimulation.mortality.test.ts` (widow on human + werewolf-form death), `moonHowler.test.ts` (werewolf-form spouse valid), `lifeSimulation.social.integration.test.ts` (30-day seed 42 green)
- **Vitest typecheck** — 17 pre-existing `tsconfig.vitest.json` errors fixed in test helpers (`canvasPolyfill`, `gameLoopTestUtils`, `placementUtils`, `entityLayer`, `frontierCombat`, `contextualTutorial`, `lifeSimulation.wildlife`); now part of `npm test`

### Fixed — pairwise sim hotspots (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch I #4–#9 · details in [docs/private/OPEN_PROBLEMS.md](docs/private/OPEN_PROBLEMS.md)

- **`tickQueries.ts` (new)** — per-tick shared helpers: `getLivingEntity`, `buildResidenceOccupantIndex`, `getHousemates`, `findClosestEntityInRadius`, `forEachEntityInRadius`, `buildWildlifePopulationSnapshot`, `recordWildlifeBirth`, `buildGrassPopulationSnapshot`, `recordGrassBirth` / `recordGrassDeath`
- **Social scans → indexed queries** (`lifeSimulation.ts`):
  - housemate chat — `buildResidenceOccupantIndex` + `getHousemates` (was `playerHumans.filter` per settler)
  - courtship — `findCourtshipPartner` + spatial closest-single query
  - affair paramour — `findClosestEntityInRadius`; site checks use `entityById` / `buildingById` maps
  - idle socialize — `findClosestEntityInRadius` over map-span radius
- **Wildlife scans → built-once indexes** (`spatialGrid.ts`, `lifeSimulation.ts`):
  - `RoadAvoidanceIndex` — `isNearRoad` + `applyAvoidance` replaces per-entity `roadBuildings.some`; shared on `TickContext` for human road-speed mult
  - mate search — `findClosestEntityInRadius` on `mobileGrid`
  - population cap — `buildWildlifePopulationSnapshot` + `recordWildlifeBirth` (was per-animal `byType.filter`)
  - tamed hunt assist — grid sync + `findClosestEntityInRadius`
- **Edge scans** — idle tree wander (`buildTreeGrid` once per `tickHumans`); grass repro cap (`buildGrassPopulationSnapshot`)
- **`gameEngine.ts`** — `syncMobileSimGrid` reuses `state.mobileGrid` instead of allocating each tick
- **Affair / reproduction tests** — `lifeSimulation.affair.test.ts`, `lifeSimulation.reproduction.test.ts` updated for `entityById` maps and `tryDailyConception` signature
- **A/B flag** — `VITE_USE_SPATIAL_GRID=0` restores legacy full-list prey/predator scans for perf comparison only

### Changed — npm scripts & test gate (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch J

- **`npm test`** — `vitest run` (**358** tests, **67** files, **0 skipped**)
- **`npm run test:all`** — vitest + `tsc -p tsconfig.vitest.json --noEmit`; **`npm run test:types`** — typecheck only
- **Vitest default config** — browser Web Worker suites (`gameLoop.worker.test.ts`, `gameWorkerHost.test.ts`) excluded from default run (Node has no `globalThis.Worker`); worker command behavior is proven by parity-by-construction through the shared `applyWorkerCommand` domain implementation (`workerCommand.roundtrip.test.ts`, `gameLoop.commandDispatch.test.ts`)
- **`npm run` shortened (app)** — 24 scripts → **8**: `dev`, `build`, `test`, `test:watch`, `lint`, `preview`, `sim`, `bench`
- **`sim` CLI** (`scripts/sim-cli.mjs`) — `npm run sim` lists profiles; `npm run sim -- <profile>` replaces `simulate`, `simulate:30min`, `simulate:20year`, `simulate:social`, `simulate:housing`, `simulate:housing:ticks`, `simulate:family`, `simulate:10year`, `simulate:10year:worker`, `simulate:20year:worker`, `balance:militia`, `benchmark:city`, `simulate:30min:city`, `sim:kill` (aliases: `simulate` → `5min`, `balance` → `militia`)
- **`bench`** — `npm run bench` replaces `npm run benchmark:gate` (CI benchmark gate)
- **Repo root** — forwards `test`, `sim`, `bench` into `app/`; dropped five `simulate:*` forwards

### Changed (July 8, 2026)

- **`App.tsx`** — `catalog` + `hasPlacedHouse` + `villageStats` state from loop subscribe; callback refs synced in `useLayoutEffect` (eslint `react-hooks/refs` compliant)
- **`useContextualTutorial`** — queue head = active tip; dismiss advances queue
- **`BuildCatalogPanel`** — category follows selected building without `useEffect` setState

### Added
- **Housing & population UI** — header + Village tab show **🛏️ beds** and open slots separately from **immigration cap** (`populationGrowth.ts`, `GameHeader.tsx`, `App.tsx`)
- **Housing assignment overhaul** (`dayCycle.ts`) — `buildHousingUnits`, custodian chain, shortage sharing, orphan adoption
  - **Cap vs beds** — recruitment/immigration uses `maxHumanPopulation` (houses + rep + base 5); physical slots = sum of completed House/Mansion capacity (upgrades included)
  - **Singles** — may share a house; stay until **marriage**, then `syncPartnerResidence` moves the couple to their own home (empty preferred)
  - **Children** — follow **mother** → **father**; **bastards** with no mother → **maternal grandma** → **paternal grandma**; then **father**
  - **Orphans** — no kin left → random **married couple** adopts; if none, placed in **any house with room**
  - **18+** — inspector button **Move to own home** when an empty house exists (`moveOutOfFamilyHome` in `buildingActions.ts`)
  - **Housing shortage** — when no empty homes (or all beds full), **families stay together** in shared houses instead of splitting
- **Election day ceremony** (`villageLeadership.ts`) — founding **first male** leads until Year 10; merit elections every 10 years; leader death → election **2 years later** (no instant succession); ceremony phases gather → gossip → tension → reveal + 3-day *Election Revelry* festival
- **Election buildup** — year-before notification (`tickElectionBuildup`); ongoing settler gossip during buildup, election year, and ceremony (`tickElectionGossip`)
- **Incumbent always runs** — `getElectionRaceCandidates()` keeps sitting head in race lineup, gossip, and Leadership standings even when merit rank drops below top 4
- **Incumbent record score** — modest election bonus/penalty for sitting head only: economy (+4/−5), clean record (+3) vs scandals (−5 each), village health (+3/−6); **+8 positive cap** so high-merit challengers can still win; penalties uncapped
- **Leadership UI** — `VillageLeadershipPanel` shows record breakdown; standings show record modifier; tutorial + focus hints updated

### Planned (remaining for v0.5.0 tag)
- **P0** — renderer cache reuse, settler count denorm, benchmark gate exit codes; incremental `entityById`, `buildingActions` scan cleanup, grass render buckets, App tab split, pooling; OffscreenCanvas terrain/entity layers; logical invariant checks; **`npm run sim -- 20year` full 172800-tick PASS**; `GAME_VERSION` **0.5.0** + save migration
- **Done in code (pre-tag):** spatial grid ✅, dead-entity compaction ✅, Web Worker `gameTick` ✅ (opt-in), big bug checkup ✅ (252 tracker items, Batch O), `npm run test:all` ✅ (358 + types)
- **P1** — election playtest at Year 10/20; counter-raid militia march visuals; large-map playtests; reputation arc UI; footstep SFX; one visitor quest chain; `npm run bench`

## [0.4.2] - 2026-07-05

**Early Alpha v0.4.2** — 6-tab UI, Blacksmith forge, walls/towers/barracks, frontier raid prep UX, 10-year balance pass, 10-user beta playtest. `GAME_VERSION` and save format bumped; `0.4.1` saves migrate on load.

### Added

#### Beta playtest follow-up (July 5, 2026)
- **Raid prep copy** — raids test preparation, not a battle screen (`RAID_PREPARATION_HINT`, Frontier readiness card, README)
- **Eco breakdown** — Nature tab “Why this score” (`ecoBreakdown.ts`)
- **Population growth report** — Village tab cap/food/rep messaging (`populationGrowth.ts`)
- **Rival labels** — “Distant camp” when on-map pop is 0 (`rivalDisplay.ts`)
- **Juice toggle** — Game menu ✨ Juice on/off (confetti, camera nudge, night glow)
- **Chronicle / combat log** — death filter hints; larger combat log text

### UI / UX overhaul (settlement-sim patterns)

Inspired by **RimWorld** (priority alerts, contextual inspector), **Banished** (bottom build hotbar), and **Frostpunk** (resource urgency). Goal: lower cognitive load, faster routing to urgent issues, map stays visible while building.

- **`AlertBar`** — clickable priority strip under header (raids, diplomacy, low food, shelter warning, trade ready, active challenge); capped at 4 alerts (`priorityAlerts.ts`, `AlertBar.tsx`).
- **`BuildHotbar`** — Banished-style bottom map strip: House, Farm, Lumber Mill, Quarry, Well, Road with hotkey badges (`BuildHotbar.tsx`).
- **`GameMenu`** — ☰ header menu for save, load, auto-save, audio, reset (`GameMenu.tsx`).
- **`FrontierPanel`** — visitors, rivals, raids moved out of overcrowded Village tab (`FrontierPanel.tsx`).
- **`ChallengesPanel`** — daily challenges under Progress → Goals (`ChallengesPanel.tsx`).
- **`CollapsibleSection`** — reusable accordion for dense sidebar panels (`CollapsibleSection.tsx`).
- **Tab hotkeys** — `V` Village · `F` Frontier · `N` Nature · `P` Progress · `L` Log · `M` More.
- **Focus hint actions** — `Go →` buttons on key hints (open Goals, Frontier, Trade, Research, build house/farm) (`focusHints.ts`, `FocusPanel.tsx`).
- **Progress subnav badges** — amber dot when research active; cyan count when trade routes are ready to establish.
- **Frontier tab badge** — count of pending raids + diplomacy events on sidebar tab.

#### Changed
- **Sidebar tabs** — 8 → **6**: Village, Frontier, Nature, Progress (Research / Trade / Goals sub-tabs), Log, More (Guide / Roadmap sub-tabs).
- **Inspector** — collapsible; auto-expands when you click the map; slimmer when collapsed.
- **Header** — save/audio/reset moved into ☰ menu; food badge **pulses** when critically low.
- **Village tab** — decluttered: focus hints, population, leadership, armament only (frontier/diplomacy → Frontier; challenges → Progress → Goals).
- **Collapsed build rail** — duplicate quick-build buttons removed; bottom hotbar handles common placement; collapsed left rail = grid toggle, cancel (when placing), expand full catalog (`B`).
- **Right sidebar** — widened to `22rem` for readability.
- **In-game Guide** — Interface Overview and Controls updated for new layout, alert strip, hotbar, and tab hotkeys.

#### Blacksmith forge / visible crafting queue
- **`villageForge` state** — iron spears & shields require Defense research **and** a staffed Blacksmith forge run (`forge.ts`).
- **Forge orders** — Iron Spears (35🪵 25🪨 40💰) · Iron Shields (40🪵 30🪨 45💰); ~6 in-game days with staffed smith; progress bar + map float text.
- **`BlacksmithForgePanel`** — queue orders in Blacksmith inspector; armament checklist shows forge %.
- **Save migration** — existing saves with iron tech + Blacksmith keep forged status; new games must forge.
- **Combat** — `hasIronSpears` / `hasIronShields` now require `villageForge.spearsReady` / `shieldsReady`.
- **Forge UX polish** — `AlertBar` + focus hints jump to Blacksmith (`focus_building`); “Forge paused” when unstaffed; research complete notification says **queue forge** (not “armament upgraded”); Armament checklist **Open Blacksmith →** buttons; Defense/Iron copy updated.

#### UX polish (first-priority follow-up)
- **Quick Start tutorial** — 5 steps: bottom hotbar, alerts, tab hotkeys, `?` shortcuts overlay
- **Header ⭐ reputation badge** — clickable tooltip; opens Progress → Trade
- **Focus hints** — **Go →** on challenges, victory paths, visitors, rivals, elections, armament, research
- **Progress tab badge** — trade-ready count or research dot on main sidebar tab
- **Frontier raid button** — `🏹 Raid` on each rival card in Frontier tab (`canLaunchRaidOnRival`)
- **Pay-off vs counter-raid hint** — combat preview when tribute &lt; march provisions
- **Roads + armament copy** — Infra category hint in build catalog; armament explainer in Village tab
- **`?` keyboard overlay** — full shortcut reference (ESC to close)

#### Performance (simulation + UI)
- **Duplicate work removed** — `byType` built once per tick; entity array compacted in one pass (no triple `.filter()`).
- **Off-screen throttling** — humans every 8 ticks; wildlife AI every 8 ticks; grass growth/repro every 4 ticks off-screen. Viewport entities still run full sim every tick (`OFFSCREEN_HUMAN_THROTTLE`, `OFFSCREEN_WILDLIFE_THROTTLE`, `OFFSCREEN_GRASS_THROTTLE`).
- **O(1) lookups** — per-tick `entityById` and `buildingById` maps for hunt targets, prison, tamed-owner resolution.
- **Wildlife simulation** — `tickWildlife` iterates `byType` buckets instead of all `state.entities`; predator list hoisted once per tick for flee logic.
- **Denormalized counts** — `world.wildlifeCounts` updated each tick; Nature tab reads counts without scanning entities (`entityCounts.ts`).
- **React UI** — single-pass `villageStats`; narrowed `priorityAlerts` memo deps; `React.memo` on `WildlifeBar`, `StatBadge`, `FrontierPanel`, `ChallengesPanel`.
- **Headless benchmark** — `simulate:30min` logs avg/p50/p95/max ms per tick + entity samples (`SIM_MINUTES`, `PERF_SAMPLE_EVERY` env vars).
- **Module fix** — `combatTech.ts` extracts `COMBAT_TECH` to break forge ↔ combat circular import (headless sim runner).
- **Event log unchanged** — full chronicle kept in saves (no cap).

#### Technical (new / touched files)
- `app/src/game/priorityAlerts.ts` — alert derivation + click routing actions
- `app/src/components/AlertBar.tsx`, `BuildHotbar.tsx`, `GameMenu.tsx`, `FrontierPanel.tsx`, `ChallengesPanel.tsx`, `CollapsibleSection.tsx`
- `app/src/App.tsx`, `app/src/App.css` — shell wiring, sidebar tab grid, progress subnav styles
- `app/src/game/focusHints.ts`, `app/src/game/FocusPanel.tsx` — actionable hints
- `app/src/game/frontierCombat.ts` — `canLaunchRaidOnRival()`
- `app/src/game/entityCounts.ts`, `app/src/game/combatTech.ts` — wildlife counts helper; combat tech constants
- `app/src/game/gameEngine.ts`, `app/src/game/lifeSimulation.ts` — tick perf (maps, throttles, wildlife loop)
- `app/scripts/simulate-30min.ts` — perf metrics output
- `app/README.md`, `TECHNICAL.md`, `roadmapContent.ts` — player + dev docs

#### Frontier raid polish
- **Distance-scaled raid deadline** — incoming raids get **2–6 days** to respond based on camp distance (`expiresAtTick`, `marchDistanceTiles` on `RaidEvent`).
- **War-band march speed** — rival settlers march slower from farther camps (`lifeSimulation.ts`).
- **UI** — banner, alerts, Frontier/Village tabs show `formatRaidDeadline`; save migration backfills old raids.

#### Fixed / hygiene (July 2026)
- **Lint** — July 4: unused imports + inspector handlers; July 8: **70 ESLint errors → 0** (`App.tsx` ref sync, `BuildCatalogPanel`, `GameMenu`, tests, scripts); `argsIgnorePattern: '^_'` for intentional unused params.
- **Sanity check** — `npm run build` pass; `npm test` **317 passed** (3 skipped); `/check-work` PASS (July 8, 2026). July 4 headless baseline: avg **1.81 ms/tick**, p95 **4.83 ms/tick** @ ~557 entities.
- **Docs sync** — all project `*.md` files aligned with v0.4.2 + July 8 bug-pass status.

#### P1 defense & combat log (July 2026)
- **Defense buildings** — Wall, Wall Corner, Wall Gate (+8 barricade/segment, cap +72), Watchtower (+15), Barracks (manual Guards, +12 militia each); unlocked via Fortification / Stone Spears research.
- **Guard patrols** — staffed Barracks guards orbit the village core during work hours; 🪖 icon on map.
- **Combat log panel** — Log tab **Combat** sub-tab with raid stats and .txt/.json/.csv export.
- **Raid map overlay** — dashed red march lines from rival camp to village when raids are pending.
- **Sprites** — `barracks`, `watchtower`, `wall_straight`, `wall_corner`, `wall_gate` processed to RGBA.
- **Spear tiers** — combat preview breakdown aligned with militia math: iron replaces stone (not stacked).

#### Juice pass (July 2026)
- **Night glow** — warm windows + chimney ember/smoke on houses/mansions when residents are home; staffed Church/Blacksmith/Hospital get door glow.
- **Build complete** — confetti burst (stars/sparkles), `✨ Built!` float text, sprite scale pop, screen shake.
- **Camera nudge** — clicking settlers/buildings gently pans the camera toward them (28% lerp).

#### Road rotation (July 2026)
- **R key** while placing rotates Road, Wall, and Wall Gate horizontal ↔ vertical.

#### Intro screen refine (July 2026)
- **`IntroScreen.tsx`** — ~20s unhurried timeline (aurora → logo → title → subtitle → hook → food chain → ready).
- **Skip** — click or press any key after the logo appears to jump to village setup.
- **Progress bar** — subtle fill along the bottom during the opening beat.
- **No hidden pops** — sections fade in on schedule instead of toggling `hidden` mid-animation.
- **`App.css`** — slower intro keyframes (`intro-*` classes) for logo float, chain reveal, aurora drift.

#### Spear / militia balance (July 2026)
- **`militiaBalance.ts`** — single source for militia & barricade strength; tuned constants (`MILITIA_BALANCE`).
- **Iron replaces stone** spears (×1.52, not stacked on ×1.3).
- **Iron replaces wooden** shields (+9/adult, not +9+4).
- **Barracks guards** — +14 per staffed guard (was +12).
- **Barricade fix** — `respondToRaidEvent` barricade now uses `getBarricadeStrength` (walls/towers were missing in resolve).
- **Combat preview** — armament label, tier hint, breakdown matches resolve math.
- **`npm run balance:militia`** — scenario table for playtest review.

#### Bug fixes — comprehensive pass (July 4, 2026)

Four code-review rounds (~40 fixes). Verified: `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`, `/check-work` PASS.

##### P0 — Critical
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Map setup / GameLoop desync | `App.tsx` | New game from map setup never called `setSession`; sim ran throwaway world while setup open |
| Faction human ages | `groupEvents.ts` | Visitors/rivals spawned at ~7k–14k “days”; died instantly vs 400-day lifespan cap |
| Welcomed refugees killed on departure | `groupEvents.ts` | Admitted settlers stayed in `group.entityIds`; camp leave set `alive = false` for all IDs |
| Eco Master 24× per year | `gameEngine.ts` | `ecoHealthYearsAbove80` incremented every tick of calendar day 0 (~24×/year) |

##### P1 — High
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Off-screen double aging | `lifeSimulation.ts` | Inactive humans aged twice per calendar day |
| Winter heating | `gameEngine.ts` | Wood cost counted visitors/rivals, not player settlers only |
| Prison demolish | `buildingActions.ts` | Demolishing prison left `prisonBuildingId` / prisoners stuck |
| Challenge timing | `gameEngine.ts`, `challengeProgress.ts` | `eco_master` / year challenges evaluated before year rollover + eco streak update |
| `growing_village` UI | `challengeProgress.ts` | Progress showed year only, not building requirement |
| `great_city` challenge | `gameTypes.ts`, `saveLoad.ts` | Missing `targetBuildings: 20` — completed at 100 pop alone |
| Diplomacy event loss | `groupEvents.ts` | Failed choices (insufficient resources) still removed pending event |
| Peace vs active raids | `groupEvents.ts`, `frontierCombat.ts` | Peace treaty did not cancel in-flight `pendingRaidEvents` |
| Rival raid strength | `groupEvents.ts` | `rival.population` never decremented on deaths; strength stayed inflated |
| Workshop at gold cap | `gameEngine.ts` | Consumed inputs when gold storage full |
| Trade at storage cap | `economy.ts` | Deducted exports when receives added 0 |
| Raid deadline lag | `gameEngine.ts` | `tickPendingRaidEvents` only on calendar-day ticks (up to ~24 tick delay) |
| Save year desync | `saveLoad.ts` | `year` from save could disagree with `tick`-derived calendar |
| Save migrations | `saveLoad.ts` | Missing defaults for `challenges`, `yearlyStats`, `lifetimeStats` on old saves |
| Refugee food at cap | `groupEvents.ts`, `App.tsx` | Welcome charged 40🍖 even when nobody could join |

##### P2 — Medium (UI, stats, edge cases)
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Placement footprint | `buildingActions.ts`, `placementUtils.ts` | Center could be on-map while footprint extended off-map |
| Build ghost stale | `App.tsx` | Placement preview used stale React `world` instead of loop world |
| Raid defend no-op | `App.tsx`, `frontierCombat.ts` | Defend/payoff/barricade failed silently; buttons now disabled + float text |
| Guard bonus constant | `defenseStructures.ts` | Hardcoded ×12 vs `militiaBalance` ×14 |
| Rival diplomacy silent | `groupEvents.ts` | Gift/pact/militia/peace returned unchanged state with no feedback |
| Diplomacy banner UX | `groupEvents.ts`, `App.tsx` | `getDiplomacyChoiceEligibility()` — disable + tooltips in banner and rival inspector |
| Visitor trade silent | `groupEvents.ts` | Insufficient gold/food returned with no float text |
| Victory Great City buildings | `victory.ts` | Counted rival camp structures toward 50-building leg |
| Eco health penalty | `gameEngine.ts` | Rival/incomplete buildings lowered player eco score |
| Prison ghost workers | `lifeSimulation.ts`, `gameEngine.ts` | Imprisoned settlers kept job assignments; still counted as staffed |
| Forge queue silent | `forge.ts` | Blocked queue returned state with no notification |
| Forge production tick | `forge.ts` | Local midnight tick vs shared `isProductionTick` (7am) |
| Moon howler hunt leak | `moonHowler.ts`, `gameTypes.ts` | `huntTargetId` / `combatTicks` not cleared on revert |
| Age display | `worldGen.ts` | `getAgeInYears` used wrong birth-year math; pioneers now age 30/28 |
| Leadership experience | `villageLeadership.ts` | Day-based age treated as years; all adults maxed by day 60 |
| Yearly stats humans | `stats.ts` | Population history counted visitors/rivals |
| Yearly births stat | `stats.ts` | Broken ternary; now `birthYear === state.year` |
| `disastersSurvived` stat | `stats.ts`, `worldEvents.ts` | Was set to `state.year`, not disaster count |
| FrontierPanel | `FrontierPanel.tsx` | Fragile non-null assertion on pending raid lookup |
| IntroScreen lint | `IntroScreen.tsx` | `useRef(Date.now())` → init in `useEffect` |

##### Intentional (not changed)
- **School juvenile `age++`** at staffed school — accelerates childhood; not the off-screen duplicate bug.

### Ship checklist (closed)
- [x] 10-year balance pass — town PASS 2026-07-04 (`npm run simulate:10year`, 9/9 gates)
- [x] Spear / militia balance review (`militiaBalance.ts`, `balance:militia`)
- [x] External playtests — 10 sessions ([TECHNICAL.md](TECHNICAL.md#playtest-report))
- [x] `GAME_VERSION` **0.4.2** + `COMPATIBLE_SAVE_VERSIONS` migration
- [x] Docs + in-game Roadmap sync

## [0.4.1] - 2026-07-04

**Early Alpha v0.4.1** — tribes, raids, diplomacy, four victory paths, village leadership. `GAME_VERSION` and save format bumped; `0.4` saves migrate on load.

### Added
- Tribe diplomacy v2, frontier raids + combat preview, peace treaties, visitor leader talk
- Trade Empire + Harmony victories active; Silkmarket trade route
- Village head merit elections (founding election at start, decennial, succession on death) — *superseded in [Unreleased] by founding male + Year 10 ceremony + 2-year vacancy*
- In-game Roadmap tab, Nature grazing warning, Prison + Guard, chronicle export

## [0.4.1] - Village leadership & merit elections (2026-07-04)

*Historical — leadership rules superseded in **[Unreleased]** (founding male until Year 10, ceremony, 2-year vacancy, record score).*

### Added
- **Village head elections** (`villageLeadership.ts`) — merit score from job skills (×2), experience, Town Hall service (+15), married (+5); ties break on age, then entity id.
- **Founding election** at game start; **decennial elections** every 10 years (years 10, 20, …); **succession** on leader death or imprisonment.
- **State fields** — `villageLeaderId`, `leaderSinceYear`, `lastElectionYear` on `WorldState`; save migration in `saveLoad.ts`.
- **Village Leadership panel** — Village tab shows 👑 leader, years until next election, ranked candidates (`VillageLeadershipPanel.tsx`).
- **Map & UI** — 👑 on leader in header, map icon, Population panel, and entity inspector; focus hints mention leadership.

### Technical
- `tickDecennialElection` in `gameEngine.ts`; `validateVillageLeaderOnLoad` on load. *(Ceremony / vacancy flow → `villageLeadership.ts` in [Unreleased].)*

## [0.4.1] - Peace treaties, visitor leader talk & four victory paths (2026-07-04)

### Added
- **Peace treaties** — `signPeaceTreaty()` halts raids for 60 days (30💰 + 20🍖); `peaceTreatyDays` on rivals; `peace_treaty` diplomacy event choices; 🕊️ button in rival inspector; raids blocked while at peace (`isRivalAtPeace`, `frontierCombat.ts`).
- **Visitor leader talk** — `talkToVisitorLeader()` per caravan kind (traders, pilgrims, scholars, hunters, nomads, performers, refugees); `leaderTalked` on `VisitorGroup`; UI in visitor camp panel (`getVisitorLeaderTalkMeta`).
- **Trade Empire + Harmony victories** — moved to `ACTIVE_VICTORY_PATHS` (4 active paths in Goals tab); 5th trade route **Silkmarket** in `economy.ts`; `ensureFullTradeRoutes()` on load.

### Changed
- **Goals tab** — Eco-Utopia, Great City, Trade Empire, and Harmony all trackable; `COMING_SOON_VICTORY_PATHS` empty.

## [0.4.1] - Frontier raid balance & combat preview (2026-07-04)

### Added
- **Combat preview panel** (`CombatPreviewPanel.tsx`, `getCombatPreview()`) — militia breakdown, rival strength, defend/barricade/pay-off forecasts, and outgoing raid forecast in raid banner, Village tab, and rival inspector.
- **Distance to rival camps** — tiles from village anchor (Town Hall → House → settlers); shown in preview, Village tab rival list, incoming raid banner, and rival inspector.
- **Distance-scaled raid provisions** — `getOutgoingRaidFoodCost()` (22–50🍖 by march distance); raid button and preview show exact cost per rival.
- **Home-turf defense** — `getRivalDefenseStrength()` (+25% when you raid their camp); outgoing thresholds **≥135%** full spoils, **≥100%** meager, below = repelled (+15🍖 extra on fail).
- **Split ratio hints** — `DEFENSE_RATIO_HINT` vs `COUNTER_RAID_RATIO_HINT` in preview (no longer one misleading footer).

### Changed
- **Incoming vs outgoing clarity** — UI labels: “If they raid your village” vs “If you raid their camp”; pay-off tribute amount shown in preview; incoming banner does not show counter-raid section.
- **Counter-raid forecast gated** — preview shows outcome only when spears, 8+ pop, enough food, and non-friendly relations; otherwise a specific blocker message.
- **Stable village anchor** — `getPlayerCampCenter()` prefers Town Hall / House over wandering settler centroid (shared with `groupEvents.ts` spawn distance).
- **Focus hint** — counter-raid note mentions distance-scaled food (not flat 30🍖).

## [0.4.1] - Frontier raids & militia combat (2026-07-04)

### Added
- **Incoming raids** from tense/competitive rivals (`maybeQueueRaid` in `frontierCombat.ts`) — red banner + rival inspector with 3-day deadline.
- **Defend choices**: militia fight (stone/iron spears), barricade (20 wood + 10 stone), or pay food tribute.
- **Combat resolution** — militia vs raid strength (population, spears, shields); outcomes from decisive victory to defeat with loot, building damage, casualties.
- **Counter-raid** — `launchRaidOnRival()` from rival inspector (provisions + spears + 8+ pop); seize supplies or risk repelled raid + counter-attack.
- **Visible war-bands** — rival settlers march toward your village while a raid is pending; combat flashes on map.
- **Combat chronicle** — new `combat` event-log type + Log tab filter.

### Technical
- `pendingRaidEvents` on `WorldState`; `raidCooldownDays` on `RivalSettlement`.
- `frontierCombat.ts` — strength helpers, raid tick/expiry, response handlers.

## [0.4.1] - Docs: TODO + roadmap sync (2026-07-04)

### Added
- **`ROADMAP_0.5.0.md`** — open work checklist (frontier raid polish, perf, architecture).
- **In-game roadmap** — `ROADMAP_OPEN_FIXES` section in Roadmap tab (“Still to fix / implement”).

### Changed
- **`CHANGELOG.md`**, **`ROADMAP.md`**, **`roadmapContent.ts`**, **`TECHNICAL.md`** — frontier raids MVP + combat preview marked shipped; remaining combat/craft/polish items listed.

## [0.4.1] - In-game roadmap tab (2026-07-04)

### Added
- **Roadmap tab** — eighth sidebar tab with read-only v0.4.1 slice: shipped features, open/partial P0–P2 items, next dev priorities (`RoadmapPanel.tsx`, `roadmapContent.ts`).
- **Guide → Roadmap** shortcut button at top of Guide tab.

### Technical
- `roadmapContent.ts` mirrors `ROADMAP.md` priorities; update when shipping v0.4.1 items.

## [0.4.1] - Tribe interaction v2 + Nature grazing warning (2026-07-04)

v0.4.1 partial — deeper frontier diplomacy and ecosystem coaching.

### Added
- **Rival diplomacy event cards**: `DiplomacyEvent` queue on `WorldState.pendingDiplomacyEvents` — tribute demands, border disputes, and alliance offers spawned from `tickRivalSettlements()`. Players respond via top-of-map banner (2–3 choices) or rival inspector panel (`respondToDiplomacyEvent()` in `groupEvents.ts`).
- **Rival map diplomacy panel**: Click a rival **camp marker** or **rival building** on the map to open the inspector with gifts, trade pact, militia, pending events, and **Ping camp on map** (camera focus + pulsing ring).
- **Visitor camp diplomacy**: Click visitor **camp markers** for trade UI (`tradeWithVisitors()` — buy food/wood, sell food) on traders, nomads, and hunters.
- **Refugee negotiate screen**: Refugee caravans no longer auto-join; player chooses welcome (40🍖), screen (20🍖), or turn away (`negotiateRefugees()`). Visitor entity inspector links to camp panel.
- **Camp hit-testing**: `hitTestCamp()` in `groupEvents.ts`; canvas click handler in `App.tsx` focuses camera and sets `highlightedCampKey` / `selectedCampKey` on `ViewState`.
- **Nature tab grazing pressure warning**: `ecosystemPressure.ts` computes deer grazing demand vs grass recovery (season/weather aware). Amber/rose alert card when pressure is **caution** or **critical**, with actionable advice (wolves, overgrazing, drought/winter).

### Changed
- **VisitorGroup** fields: `tradesCompleted`, `refugeeResolved` (save/load migrated in `saveLoad.ts`).
- **Frontier neighbors** (Village tab): Focus camp buttons; diplomacy hints when events are pending.
- **Guide tab**: Documents map-click diplomacy and visitor trade/refugee negotiate (no longer Village-tab-only).
- **Active event banner**: Yields to pending diplomacy cards when rivals need a response.

### Technical
- New types in `gameTypes.ts`: `DiplomacyEvent`, `DiplomacyChoice`, `DiplomacyEventKind`; `pendingDiplomacyEvents` on `WorldState`.
- `viewState.ts`: `highlightedCampKey`, `selectedCampKey` for camp selection and map ping.
- `renderSnapshot.ts` / `renderer.ts`: Pulsing highlight ring on focused rival/visitor camps.
- `gameEngine.ts` re-exports: `respondToDiplomacyEvent`, `tradeWithVisitors`, `negotiateRefugees`, `hitTestCamp`, `getGrazingPressureReport`.
- `worldGen.ts` initializes `pendingDiplomacyEvents: []`.
- Pending diplomacy events expire after 14 in-game days if unanswered (`tickPendingDiplomacyEvents`).

## [0.4] - Early alpha (June 2026) ✅

Verified in codebase — all shipped before **v0.4.1** (2026-07-04). Verbose dev-log entries removed; only the top `## [Unreleased]` section tracks in-flight **v0.5.0** work.

- [x] **Event log** — uncapped saves, 500-entry UI cap, `.txt`/`.json`/`.csv` export (`eventLog.ts`, `eventLogExport.ts`, `EventLogPanel.tsx`)
- [x] **Prison + Guard** — arrest on caught affairs, prisoner state, `isImprisoned()` (`BuildingType.Prison`, `lifeSimulation.ts`, `dayCycle.ts`)
- [x] **Terrain** — real terrain render, tile-sized cache, preset variety, coastal camp clearing (`renderer.ts`, `terrainGen.ts`)
- [x] **Audio credits** — [TECHNICAL.md](TECHNICAL.md#audio-credits)
- [x] **Shared event log module** — `logEvent()`, `syncEventLogIdFromState()` (`eventLog.ts`)
- [x] **Building foundation pads** — category colors, pad shapes, season tint, hover/selection (`renderer.ts`, `BUILDING_CONFIGS`)
- [x] **Simulation upgrade** — storage caps, food spoilage, terrain/adjacency efficiency, wolf pack bonuses (`economy.ts`, `gameEngine.ts`, `lifeSimulation.ts`)
- [x] **Werewolf + Wildkin + Big News** — moon howler, wildkin births, dismissible banner (`moonHowler.ts`, `lifeSimulation.ts`, `gameEngine.ts`)
- [x] **Taming, visitors, festivals** — Taming Post, caravans, `festival` state, economic rebalance (`buildingActions.ts`, `groupEvents.ts`, `worldGen.ts`)
