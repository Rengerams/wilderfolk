# Bug report summary — one line per report

A flat register of every report in `BUG_REPORTS/`, oldest first: **date discovered → date solved**, the problem, and what actually fixed it. The individual report stays the source of truth — this file is the index you can scan in one pass. When you add a report, add its line here too.

Compiled 2026-09-16 from the 55 individual reports, plus fourteen 2026-09-16 reports that landed from concurrent audit passes and the follow-up work while this register was being written (69 total). **67 resolved**, **2 resolved with live verification pending** (speed/pause buttons, sand-water overlay art), **nothing open**. One more report landed 2026-09-25 (70 total, **68 resolved**). Two more landed 2026-09-29 (**72 total**, **69 resolved**, **1 open** — the open one is a harness coverage gap, not a gameplay defect). One more on 2026-09-29 (**73 total**, **69 resolved**, **2 open** — the second is `people-walk-through-water`, a gameplay defect reported from play). One more on 2026-09-30 (**74 total**, **70 resolved**, **2 open** — the same two: the coverage gap and `people-walk-through-water`). One more the same day (**75 total**, **70 resolved**, **3 open** — the coverage gap, `people-walk-through-water`, and a founding-year election that is stored as "no election"). One more the same day (**76 total**, **70 resolved**, **4 open** — a Town Hall whose officials no attendance system records).

Excluded on request: `2026-09-13-simulation-logic-audit.md` — the large audit document whose findings became the 2026-09-13 slice reports listed below.

## At a glance

| Discovered | Reports | Resolved | Still open / pending |
|---|---|---|---|
| 2026-08-28 | 11 | 11 | — |
| 2026-09-08 | 2 | 2 | — |
| 2026-09-10 | 7 | 6 resolved + 1 pending | speed/pause live check |
| 2026-09-13 | 22 | 22 | — |
| 2026-09-16 | 27 | 26 resolved + 1 pending | 1 pending |
| 2026-09-21 | 1 | 1 resolved | 12 follow-up findings recorded in the report, not fixed |
| 2026-09-24 | 3 | 2 | 1 open — worker/main-thread divergence on a finer terrain lattice |
| 2026-09-25 | 1 | 1 | — |
| 2026-09-30 | 3 | 1 | 2 open — a founding-year election stored as "no election", and Town Hall officials that no attendance system records |

**Open right now**

- [officials-never-recorded-on-shift](2026-09-30-officials-never-recorded-on-shift.md)
  — a Town Hall official is on shift for *serving* and off shift for *being counted*: `humanTick.ts:666`
  computes `onOfficialShift`, line 697 leaves it out of `onJobShift`, and line 1291 passes it downstream
  anyway, which is why the official serves normally. Measured on two of the owner's saves: **0.0 h for
  all three officials in both**, against farm 7.8 h and market 9.0 h. Energy (93 % everywhere, none under
  the hospital threshold) and distance (under-workers live *closer* to work) are both ruled out. The
  chronicle then reports the unrecorded day as *rest*, which is the class of line the owner questioned.
  **No fix applied** — the repair is one shared predicate, not another `||`.
- [founding-year-election-counts-as-no-election](2026-09-30-founding-year-election-counts-as-no-election.md)
  — reported from play (*"my leader died after 3 months no elections then after a year they where elections
  for the year 0 ?"*). **Reproduced against the shipped engine.** The 0.33-year vacancy delay is correct
  (measured: death day 91 → election day 213), so three other defects explain what the owner saw: the
  ceremony is refused **every day** while nobody is eligible and re-logs `Leadership election postponed …`
  each attempt; `lastElectionYear = 0` means both "never elected" and "elected in the founding year", so a
  load after a year-0 election silently installs a founder with **no** election armed; and
  `getActiveElectionPromises`/`tickElectionPromises` early-return on `year <= 0`, so a founding-year
  leader's promises are never shown and never judged. **No fix applied to the bug itself** — the
  sentinel repair needs an owner decision on existing saves, see the report. **Two of the owner's
  asks that came out of it did land (2026-09-30):** the cap is now **6 000** entries (~600 days at a
  busy colony's rate instead of ~200), and close friendships are capped at **6 per settler** — the
  mirror of the feud cap — taking a measured colony from **26.1 to 3.6 close bonds per settler**
  (max 54 to 7). Verified: `tsc` clean both projects, `npm test -- standard` **247 files / 1 511
  passed / 2 skipped / 0 failed**.
- [people-walk-through-water](2026-09-29-people-walk-through-water.md)
  — a settler crosses water when no route exists. The grid **does** block water
  (`pathfinding.ts:116-118`); the suspect is the documented fallback where a leg with no route is
  walked as a **straight line** (`RouteObstruction: 'blocked'`, `pathfinding.ts:481`) — the one
  steering path that never consults `blocked[]`. That would explain why the report is intermittent:
  the same river is impassable for a settler with a detour and passable for one without. **No fix
  attempted, and deliberately not guessed at** — the first step is to measure whether `'blocked'` is
  actually reached and whether any settler occupies a blocked tile, because a fallback that refused
  to move would also freeze a settler that is merely stuck, which is a worse bug.

- [worker-main-thread-divergence-on-finer-terrain-lattice](2026-09-24-worker-main-thread-divergence-on-finer-terrain-lattice.md)
  — the worker and the main thread persist different colonies for the same seed once the terrain
  lattice is made finer (`TERRAIN_CELL` 64 → 48). Latent on the shipping lattice: the parity test
  passes there, so what the coarser map does is avoid the codepath, not fix it. **No fix
  attempted** — the cause is not yet established and the resolution change that exposes it was
  made safe a different way (the water layer was split onto its own lattice first), so there was
  nothing to rush. Recorded so the first agent who reaches for a smaller cell size starts from
  this evidence instead of rediscovering it.
- The prior open report (the runtime import cycle of 9 modules) was fixed on 2026-09-16; the
  repaired gate `audit:deps:cycles:strict` now exits 0 on an acyclic runtime graph
  ([runtime-import-cycles-in-the-game-module-graph](2026-09-16-runtime-import-cycles-in-the-game-module-graph.md))

**Waiting on a live check**

- speed/pause buttons: code fixed, in-game confirmation not recorded — [speed-control-reverts-on-command](2026-09-10-speed-control-reverts-on-command.md)
- sand-water overlay: preload removed, the art itself is still unshipped — [sand-water-overlay-sprite-missing](2026-09-16-sand-water-overlay-sprite-missing.md)

## 2026-08-28

- **2026-08-28 → 2026-09-13** — Child sprites render with an opaque pale rectangle behind the figure. **Fix:** the baked pale matte was removed offline from the three affected child PNGs by border flood-fill to transparency; loader path and raw `drawImage` render path unchanged, no runtime keying added. [child-sprite-transparency](2026-08-28-child-sprite-transparency.md)
- **2026-08-28 → 2026-09-09** — Schedule fatigue floods the chronicle with duplicate zero-hour work events. **Fix:** daily fatigue is aggregated into at most one settlement-level summary per day (rise or short-shift recovery), zero-hour off-shift recovery is silent, individual fatigue still updates per schedule result (`dailyScheduleFatigue.ts`, commit `de98bd6`). [fatigue-log-spam](2026-08-28-fatigue-log-spam.md)
- **2026-08-28 → 2026-09-13** — Hunting Spot attacks read as a yellow paint streak rather than a hunter-fired arrow. **Fix:** the shot is emitted from the live assigned hunter's position with `hunterId: hunter.id`, and nothing is emitted when no living hunter is assigned; arrow art and kill/damage/reward logic untouched. [hunting-projectile-visual](2026-08-28-hunting-projectile-visual.md)
- **2026-08-28 → 2026-09-10** — The Leader's House sprite, shadow and placement footprint did not share an anchor. **Fix:** `house_leader.png` has an ~86 px transparent band under the painted base, so `spriteAnchorY` moved from 0.97 to 0.836 and the painted base now meets the same ground line as edge-to-edge buildings. [leader-house-render-anchor](2026-08-28-leader-house-render-anchor.md)
- **2026-08-28 → 2026-09-10** — A living leader could lose the `leader` occupation during a full-year run. **Fix:** `applyLeaderOccupation` stamps the office at handover and load and workforce transitions preserve it (`keepOffice`); the underlying leak — a scandal arrest stamping `'settler'` and a release never restoring it — was closed on 2026-09-10. [leader-occupation-invariant](2026-08-28-leader-occupation-invariant.md)
- **2026-08-28 → 2026-09-10** — The leader's new spouse was not moved into the Leader's House after remarriage. **Fix:** `tickLayerDaily` calls the idempotent `syncLeaderHouseResidency` every colony day after relationship reconciliation, so the new spouse and children join the manor and former members are re-housed. [leader-remarriage-residency](2026-08-28-leader-remarriage-residency.md)
- **2026-08-28 → 2026-09-09** — Settlers appeared to work rarely despite available work time. **Fix:** assigned settlers commute to reachable completed workplaces inside configured work hours, manual-staff buildings became staffable (`312ccef`), and the inspector shows Working/Commuting with blocking reasons. [low-settler-work-activity](2026-08-28-low-settler-work-activity.md)
- **2026-08-28 → 2026-09-09** — Manual worker selection was unavailable or unclear in building panels. **Fix:** `setBuildingStaffingMode` was declared but missing from the `WORKER_COMMAND_OPS` allow-list and silently rejected — added in `312ccef`; the panel now shows the mode, switches Auto/Manual, lists eligible workers with blocking reasons. [manual-building-staffing](2026-08-28-manual-building-staffing.md)
- **2026-08-28 → 2026-08-28** — Information panels stacked into a cramped gameplay corner. **Fix:** one single-active information view, panels moved into a right overlay drawer and the build catalogue into a left one, so panels cannot stack and the map no longer shrinks. [overlapping-information-panels](2026-08-28-overlapping-information-panels.md)
- **2026-08-28 → 2026-09-13** — The wolf repopulation floor was bypassed whenever prey and grass were healthy. **Fix:** `needsWolves` (`MIN_WOLVES = 5`, `TARGET_WOLVES = 6`) now feeds `needsWildlife`, so `replenishDepletedWildlife`'s early return counts wolves as depleted and a healthy-prey valley still tops them up (runs every 3 in-game days from `dailyWorldEvents.ts`). [wolf-repopulation-floor](2026-08-28-wolf-repopulation-floor.md)
- **2026-08-28 → 2026-09-13** — Worker-backed demolition crashed when the optimistic display's adjacency was a plain object. **Fix:** `ensureAdjacencyIndex` rebuilds unless the field is an `AdjacencyIndex`, `unindexAdjacency` always routes through it, `demolishBuilding` clears adjacency through the shared worker command, and optimistic display worlds are hydrated with adjacency stripped. [worker-demolition-adjacency-hydration](2026-08-28-worker-demolition-adjacency-hydration.md)

## 2026-09-08

- **2026-09-08 → 2026-09-08** — Generated JavaScript files under `src/` shadowed the authoritative TypeScript sources. **Fix:** deleted all 311 generated `src/**/*.js` twins plus the `config/vite.shared.js` and `knip.js` shadows, restored `challenges.ts` imports from HEAD, and expanded the shadow checker so `npm run check:source` passes. [generated-js-shadows-src](2026-09-08-generated-js-shadows-src.md)
- **2026-09-08 → 2026-09-08** — The big refactor commit `07cc936` left the TypeScript build broken with 21 errors across 16 files. **Fix:** re-added `createFallbackSimTickDelta`, corrected the `GameNotification`/`EntityType`/rabbit-yield/readonly/undefined-vs-null drift, made `isPlayerHuman` a plain boolean predicate, and removed stale code so `tsc -b --force` is clean. [post-refactor-typescript-build-breakage](2026-09-08-post-refactor-typescript-build-breakage.md)

## 2026-09-10

- **2026-09-10 → 2026-09-10** — Conception was logged as a `'birth'` event, so births were mislabelled and overcounted. **Fix:** new `'conception'` event type written by `startMarriedPregnancy` / `startYouthPregnancy`, its own Chronicle filter and icon/colour, a separate council `conceptions` bucket, the corrected `first_birth` tutorial, the `'family'` rumour mapping, and a `conceptions` count in the full-year script. [conception-logged-as-birth](2026-09-10-conception-logged-as-birth.md)
- **2026-09-10 → 2026-09-10** — Elections were still named "decennial" after the term became 2 years. **Fix:** token renamed to `'term'`, entry point renamed `tryStartTermElectionCeremony`, the reason union documented in `gameTypes.ts`, and a load-time migration in `validateVillageLeaderOnLoad` rewrites stored `'decennial'` values. [election-term-token-decennial](2026-09-10-election-term-token-decennial.md)
- **2026-09-10 → 2026-09-10** — The full-year gate died on tick 1 because `gameTick` read `import.meta.env` unguarded under the headless `tsx` runner. **Fix:** guarded as `typeof import.meta !== 'undefined' && import.meta.env?.DEV === true`, matching the rest of the codebase. [full-year-gate-import-meta-guard](2026-09-10-full-year-gate-import-meta-guard.md)
- **2026-09-10 → 2026-09-10** — The colony larder meal rule existed twice with different guards. **Fix:** single owner `tryEatColonyMeal(entity, state, hourOfDay)` in `humanNeeds.ts`, the 65-energy restore became `Human.MEAL_ENERGY_RESTORE`, and the same pass de-duplicated `killFromExhaustion`, `clampToMapBounds` and `steerToShop`. [larder-meal-rule-duplicated](2026-09-10-larder-meal-rule-duplicated.md)
- **2026-09-10 → 2026-09-10** — A scandal-imprisoned leader was released without the `leader` occupation. **Fix:** arrest preserves `LEADER_OCCUPATION` while still clearing workplace and job, `releasePrisoners` re-stamps a released settlement leader, and `revertToHumanForm` got the same hardening. [leader-office-lost-on-scandal-arrest](2026-09-10-leader-office-lost-on-scandal-arrest.md)
- **2026-09-10 → 2026-09-13** — Four mountain sprite paths were preloaded but the art does not exist, logging an asset error every session. **Fix:** the "art is abandoned" option — `MOUNTAIN_SPRITE_PATHS` is no longer preloaded and the ridge-peak stamp resolves cache-only, returning early on a miss; shipping directional mountain art remains a presentation follow-up. [mountain-sprites-missing](2026-09-10-mountain-sprites-missing.md)
- **2026-09-10 → 2026-09-10** (*live verification pending*) — Speed and pause controls silently reverted on the next command. **Fix:** `carryPresentationControls()` copies only `speed` and `paused` from the outgoing display world onto the fresh clone before optimistic commands are re-applied; in-game confirmation of the buttons still to be recorded. [speed-control-reverts-on-command](2026-09-10-speed-control-reverts-on-command.md)

## 2026-09-13

All 22 are the simulation-audit slices (the audit document itself is excluded from this register).

- **2026-09-13 → 2026-09-13** — Affair exposure ignored its inputs and always rolled a flat 22 % "caught", which jailed and forced a divorce. **Fix:** the daily gossip path now passes `'rumor'` unconditionally and `pickAffairExposureReason` (+ its prison helper) was deleted; the caught-in-the-act verdict stays a spatial decision owned by `tryExposeCaughtAffair`. [affair-exposure-reason-ignores-its-inputs-and-always-rolls](2026-09-13-affair-exposure-reason-ignores-its-inputs-and-always-rolls.md)
- **2026-09-13 → 2026-09-13** — Auto-play re-proposed card answers the owner refused, stalling the colony ladder on an unanswerable raid or story card. **Fix:** owner-side eligibility helpers (`getRaidChoiceEligibility`, `getStoryChoiceEligibility`, plus eligibility exported by the theatre/parliament/wedding/invention owners) and `pickEligibleRaidChoice` / `pickEligibleStoryChoice` now answer only what the owner accepts. [autoplay-card-answer-stall](2026-09-13-autoplay-card-answer-stall.md)
- **2026-09-13 → 2026-09-13** — Auto-play counted the Leader's House beds as spare settler housing and stopped building houses. **Fix:** new `getOpenPlayerBeds(state)` sums capacity minus residents over completed residences that are *not* the Leader's House, and `decideHousing` uses it. [autoplay-leader-house-bed-count](2026-09-13-autoplay-leader-house-bed-count.md)
- **2026-09-13 → 2026-09-13** — `tsc -b` failed because the new `assignResident` command did not match its owner's arity. **Fix:** the command now matches the owner's two-argument contract (`{ proto: 1; op: 'assignResident'; buildingId }` → `assignResidentToBuilding(world, cmd.buildingId)`) instead of inventing a per-resident rule. [build-broken-assign-resident-arity](2026-09-13-build-broken-assign-resident-arity.md)
- **2026-09-13 → 2026-09-13** — `buildHousingUnits` merged adult children into the parents' unit, undoing the adult-child move-out in the same pass. **Fix:** the fallback unit now uses `collectMinorHousehold` (settler + living partner + dependent children) instead of the age-blind `collectOwnHousehold` walk. [buildhousingunits-merges-adult-children-into-the-parents-h](2026-09-13-buildhousingunits-merges-adult-children-into-the-parents-h.md)
- **2026-09-13 → 2026-09-13** — `buildHousingUnits` never checked whether the custodian was already housed, so one settler could belong to two units in the same pass. **Fix:** `unitByMember` tracks the owning unit and the custodian's children join the household that already holds their parent, so nobody is duplicated or orphaned. [buildhousingunits-never-checks-whether-the-custodian-is-al](2026-09-13-buildhousingunits-never-checks-whether-the-custodian-is-al.md)
- **2026-09-13 → 2026-09-13** — Camera clamp regressed: zoomed out showed an empty ring because `clampCameraTarget` ignored the viewport-aware branch and doubled the overscroll margin. **Fix:** the viewport branch is taken whenever `viewportW/H` are supplied and positive, and the boundary margin is back to the documented 2 %. [camera-clamp-empty-ring-regression](2026-09-13-camera-clamp-empty-ring-regression.md)
- **2026-09-13 → 2026-09-13** — Civic petitions re-awarded every tick because per-day rolls were used as per-tick gates. **Fix:** petitions resolve only in the daily owner `tickTownHallAudiences`; the realtime callers (`tickHumanFreeTimeCivicPetition` and its `humanTick` site) were deleted, and `officialHandlePetitioners` keeps only its greeting. [civic-petitions-re-award-every-tick-per-day-rolls-are-used](2026-09-13-civic-petitions-re-award-every-tick-per-day-rolls-are-used.md)
- **2026-09-13 → 2026-09-13** — The event-log id allocator was per-realm and never re-synced on a worker hand-off, so worker chronicle entries were dropped by the delta dedupe. **Fix:** `logEvent` derives the next id from the log it writes to (`state.eventLog[0].id + 1`) instead of a module counter. [event-log-id-allocator-is-per-realm-and-is-never-re-synced](2026-09-13-event-log-id-allocator-is-per-realm-and-is-never-re-synced.md)
- **2026-09-13 → 2026-09-13** — `getCounterAttackChance` summed tiered bonuses, making every predator counter-attack a guaranteed kill. **Fix:** `researchedEffect(..., 'add')` keeps the strongest matching tier instead of summing, per the replace-lower-tiers law — 0.45 with Iron Spears, 0.55 with Iron Swords, never 1.0; block chance returns the 0.72 scale-mail tier. [getcounterattackchance-sums-tiered-adds-making-every-preda](2026-09-13-getcounterattackchance-sums-tiered-adds-making-every-preda.md)
- **2026-09-13 → 2026-09-13** — The legacy Church migration ran on every load and stripped a hand-assigned priest. **Fix:** the manual-staffing pass is gated on the church-manual-staffing marker, stamped on the first load even when nothing had to be cleared, and the marker round-trips through `appliedSaveMigrations`. [legacy-church-migration-runs-on-every-load-and-strips-the](2026-09-13-legacy-church-migration-runs-on-every-load-and-strips-the.md)
- **2026-09-13 → 2026-09-13** — A manual move-out was reverted by residency reconciliation inside the same command call. **Fix:** the manual move-out path was deleted (inspector button, prop, worker command, `buildingResidencyActions` owner and its re-exports) — housing stays fully automatic and `assignMissingResidences` rebalances the adult child into an empty house. [move-out-reverted-by-residency-reconciliation](2026-09-13-move-out-reverted-by-residency-reconciliation.md)
- **2026-09-13 → 2026-09-13** — The name pool was marked `full` on import because `nameLoader` kicked a load as a module side effect, racing the boot-fallback contract. **Fix:** the import-time `loadNames().catch(() => {})` was removed; both real entry points already load and await names explicitly. [name-pool-import-side-effect](2026-09-13-name-pool-import-side-effect.md)
- **2026-09-13 → 2026-09-13** — Opening-night answers were misrouted into stage 2, making `resolveStage3` unreachable and always applying "cancel the show". **Fix:** `resolveTravelingTheatre` dispatches on the answered card id first (the stages offer disjoint ids) and only then consults flags. [opening-night-answers-are-misrouted-into-stage-2-making-re](2026-09-13-opening-night-answers-are-misrouted-into-stage-2-making-re.md)
- **2026-09-13 → 2026-09-13** — `SimTickDelta` never carried `visitorQuest`, so the smith quest was invisible to the main thread in worker mode. **Fix:** `visitorQuest` is carried by the tick delta (extract + apply) and the prep payload/rollback, and added to `WORLD_STATE_SAVE_KEYS`, so it reaches the display world and survives save/load. [simtickdelta-never-carries-visitorquest-so-the-smith-quest](2026-09-13-simtickdelta-never-carries-visitorquest-so-the-smith-quest.md)
- **2026-09-13 → 2026-09-13** — `tryGraduateHumanChild` was unreachable because the daily age sync cleared `isJuvenile` first, so no child ever graduated. **Fix:** `syncHumanAgeFromCalendar` no longer writes `isJuvenile`; the graduation transition owns the flag, so `applyEducationGraduation` runs and `entity.educated` is set. [trygraduatehumanchild-is-unreachable-the-daily-age-sync-cl](2026-09-13-trygraduatehumanchild-is-unreachable-the-daily-age-sync-cl.md)
- **2026-09-13 → 2026-09-13** — `updateStorageCaps` had no call site, so storage caps and food spoilage never updated in a running game. **Fix:** `updateStorageCaps(state)` is now the first statement of `tickStaticDaily`, before spoilage is applied. [updatestoragecaps-has-no-call-site-storage-caps-and-food-s](2026-09-13-updatestoragecaps-has-no-call-site-storage-caps-and-food-s.md)
- **2026-09-13 → 2026-09-13** — The vacancy-election due check ran only at the New Year, stretching a declared 3-month campaign to ~1.4 years and sometimes swallowing a term election. **Fix:** the daily layer evaluates `tryStartVacancyElectionCeremony` every day; the term election stays a year-rollover decision. [vacancy-election-due-check-runs-only-at-the-new-year-so-th](2026-09-13-vacancy-election-due-check-runs-only-at-the-new-year-so-th.md)
- **2026-09-13 → 2026-09-13** — The wholesale `state.entities = allAlive` assignment discarded entities appended during the tick, including the trade-caravan carrier. **Fix:** `spawnCaravan` registers the carrier through the canonical `pushNewEntity(state, ctx, carrier)` path, so it is in `ctx.newEntities`, indexed by id and in the mobile grid. [wholesale-state-entities-allalive-discards-entities-append](2026-09-13-wholesale-state-entities-allalive-discards-entities-append.md)
- **2026-09-13 → 2026-09-13** — A failed worker tick did not roll back the year-rollover and stats fields, so the retried tick double-counted them. **Fix:** `yearlyStats`, `lifetimeStats` and `populationHistory` were added to `SimPrepKeys` and to both `extractSimPrep` and `applySimPrep` as deep clones, closing the prep payload over the tick's write set. [worker-tick-rollback-leaves-stats](2026-09-13-worker-tick-rollback-leaves-stats.md)
- **2026-09-13 → 2026-09-13** — `YearlyStats.deaths` subtracted a per-year count from a cumulative dead-entity count, so "Humans Died" was wrong. **Fix:** `gameTick` tallies deaths per tick into the new `deathsThisYear` field, `recordYearlyStats` reports it and `updateLifetimeStats` sums the yearly records; the field round-trips through save, prep and delta. [yearlystats-deaths-subtracts-a-per-year-count-from-a-cumul](2026-09-13-yearlystats-deaths-subtracts-a-per-year-count-from-a-cumul.md)
- **2026-09-13 → 2026-09-13** — `YOUTH_LOVE_MIN_AGE = 12` contradicted `SIMULATION_AUTHORITY.md` §5 ("from age 14") plus the age-14 wording in the feature doc and README. **Fix:** withdrawn as a code defect — the owner confirmed 12 was intended, so the documents were corrected to 12 and the age ladder was aligned in code (`HUMAN_FERTILITY_START` 14 → 12 with 12/13 multipliers, new `Relationship.AFFAIR_MIN_AGE = 18`). [youth-love-min-age-12-lets-12-13-year-olds-enter-youth-lov](2026-09-13-youth-love-min-age-12-lets-12-13-year-olds-enter-youth-lov.md)

## 2026-09-16

- **2026-09-16 → 2026-09-16** — The shipped "slower baseline pacing" was not in effect: `BASE_TICKS_PER_SECOND = 3` made an in-game day 24 real seconds at 1× instead of the documented 48. **Fix:** the constant is `1.5` again, so a day is ~48 s at 1× (0.5× ≈ 96 s, 2× ≈ 24 s); it is now exported and pinned by `tests/gameLoop.pacingContract.test.ts`, because no test observed the tick rate before — which is how the revert survived a fully green gate. Scheduler-only: 72 ticks/day, saves and every simulation cadence unchanged. [baseline-pacing-reverted-to-24s-day](2026-09-16-baseline-pacing-reverted-to-24s-day.md)
- **2026-09-16 → 2026-09-16** — The caught-in-the-act affair path was unreachable by construction, so no scandal could become a feud. **Fix:** an empty marital home is a valid tryst site (refused only when the spouse is within the 22 px `AFFAIR_SPOUSE_BLOCK_RADIUS`), the walk-in requires the spouse to be physically present inside the 55 px arrival window, and both `humanTick` guards use the new `isMaritalHomeOccupiedBySpouse`. The tryst rendezvous still sends pairs to the paramour's home, so the drama gain is not measurable yet. [caught-in-the-act-affair-route-unreachable](2026-09-16-caught-in-the-act-affair-route-unreachable.md)
- **2026-09-16 → 2026-09-16** — A compact save reloaded the valley at 1/100 scale, so the colony's settlers stood outside the map. **Fix:** `restoreWorldMapFromSave` multiplies the stored tile counts by `TERRAIN_TILE_SIZE` before `generateWorldMap`, and save refusals now name their real cause through `describeSaveReadFailure` instead of a guessed message. [compact-save-restores-valley-at-wrong-scale](2026-09-16-compact-save-restores-valley-at-wrong-scale.md)
- **2026-09-16 → 2026-09-16** — The adult floor was 16 while every document that states the age ladder says 18, so a 16–17 year old could enter adult courtship, be elected village head, count as a "single adult" for solo housing, act as an adoptive guardian (the EK-E3 fix was incomplete while the constant was 16) and be cursed/illness-rolled as an adult. **Fix:** `HUMAN_ADULT_MIN_AGE = 18` — the value the marriage floor and the affair floor already used; no consumer code changed, and `tests/adultFloor.age18.test.ts` pins the ladder relation plus the courtship, leadership, affair and adoption gates. [adult-floor-was-16-against-the-documented-18](2026-09-16-adult-floor-was-16-against-the-documented-18.md)
- **2026-09-16 → 2026-09-16** — The daily immigration spawn bypassed the spatial grid, so an admitted settler was invisible to social/hunt grid queries for the rest of the tick. **Fix:** the spawn goes through the canonical `pushNewEntity` path (newEntities + entityById + grids, as births already do), keeping the existing `state.entities` / `allAlive` / `indexLivingEntity` writes. [daily-immigrant-bypasses-the-spatial-grid](2026-09-16-daily-immigrant-bypasses-the-spatial-grid.md)
- **2026-09-16 → 2026-09-16** — The dependency-cruiser gate silently cruised zero modules, so import cycles were unchecked. **Fix:** all four `audit:deps*` commands run `scripts/check-import-cycles.mjs`, which parses the sources itself (321 modules / 1 463 runtime dependencies), runs Tarjan SCC, checks the not-to-test rule and **fails loudly if its own coverage is too small**; cycles are reported at the config's `warn` severity and `--strict` makes them fatal. `dependency-cruiser` and `.dependency-cruiser.cjs` are kept for the day it supports TypeScript 7. [dependency-cruiser-gate-cruises-zero-modules](2026-09-16-dependency-cruiser-gate-cruises-zero-modules.md)
- **2026-09-16 → 2026-09-16** — The diplomacy militia answer reported "Need weapons" instead of the owner's "Need spears". **Fix:** the `border_dispute`/`militia` gate in `getDiplomacyChoiceEligibility` returns `'Need spears'` again; the separate show-strength answer keeps its own wording. [diplomacy-militia-answer-reports-wrong-block-reason](2026-09-16-diplomacy-militia-answer-reports-wrong-block-reason.md)
- **2026-09-16 → 2026-09-16** — A feud against a removed settler was never pruned when the survivor had the higher id, so the record lived forever: never decayed, never deleted, no "settled their feud". **Fix:** the missing-counterpart deletion moved above the lead-only guard, so both sides prune while decay and the once-per-pair energy drain stay lead-only — exactly what the neighbouring friendship pass already does. [feud-against-a-removed-settler-never-pruned](2026-09-16-feud-against-a-removed-settler-never-pruned.md)
- **2026-09-16 → 2026-09-16** — `npm run graph` failed because `scripts/graph.mjs` imports `madge`, which is neither declared nor installed. **Fix:** the script is superseded tooling, so both the `graph` npm script and `scripts/graph.mjs` were deleted — dependency-cruiser (`audit:deps*`) and the cycle scripts are the declared import-graph surface, and knip's unlisted-dependency list is empty again. [graph-script-imports-unlisted-madge](2026-09-16-graph-script-imports-unlisted-madge.md)
- **2026-09-16 → 2026-09-16** — Loading a save mid-session set `workerBooting = true` and then queued an import that waited on that same flag while being the only code that cleared it, so the loaded village never posted the import, never ticked again, and deferred every player command forever (the worker kept simulating the old world while the UI showed the loaded one). **Fix:** the import chain waits on `GameWorkerHost.whenReady()` (new) instead of the flag it owns, and lowers the flag for the session that raised it in a `finally` — including a stop mid-import. [loading-a-save-freezes-the-sim-worker](2026-09-16-loading-a-save-freezes-the-sim-worker.md)
- **2026-09-16 → 2026-09-16** — The trade panel gated "Establish Route" on its own `marketOk && repOk` copy and never consulted the trade owner's `isMaterialPurchaseRoute` exemption, so the three coin→materials rescue routes (gold → wood/stone/food) were permanently disabled and labelled "Need Market", and `App.tsx` repeated the copy for `tradeReadyCount`. **Fix:** both call sites use `canEstablishTradeRoute(state, route.id)` and show the owner's own `blockReason`; the owner rule now has a test. [material-purchase-trade-routes-unreachable](2026-09-16-material-purchase-trade-routes-unreachable.md)
- **2026-09-16 → 2026-09-16** — The prep rollback missed `activeEvent` (written by the daily layer inside `gameTick`, shipped by the delta, but absent from `SimPrepKeys`/extract/apply) and `applySimPrep` destroyed the `scentGrid` — a simulation field, not an index — through `invalidateWorldRuntimeCaches`. **Fix:** `activeEvent` joined the payload with `structuredClone`; the live scent grid is carried across the cache rebuild. [prep-rollback-misses-the-active-event-and-the-scent-field](2026-09-16-prep-rollback-misses-the-active-event-and-the-scent-field.md)
- **2026-09-16 → 2026-09-16** — The production build was red with five compile errors plus two masked `any` casts. **Fix:** restored the missing closing brace of `launchRaidOnRival`, corrected the `GameWorkerHost` import casing, deleted the unused `simRng` type import, removed the two `pregnancyDueProgress` references on the referencing side, and deleted the two `as any` casts in `saveLoad.ts` (0-warning lint baseline back). [production-build-red-five-compile-errors](2026-09-16-production-build-red-five-compile-errors.md)
- **2026-09-16 → 2026-09-16** — The repaired import-graph gate reported a **9-module runtime import cycle** (`dayCycle → defenseStructures → forge → householdComposition → humanLifecycleCleanup → moonHowler → residencyReconciliation → residencySelection → workforce → dayCycle`) plus a 7-module type-only component. **Fix:** `householdComposition` takes `HUMAN_MOVE_OUT_MIN_AGE` from `residencyOccupancy` (its definer) instead of through the `dayCycle` facade, and the Moon Howler **form** rules (`revertToHumanForm`, `finalizeMoonHowlerDeath`, `isSettlerRelationshipEntity`, `HUMAN_FORM`) moved to the new `moonHowlerForm.ts` — below both the policy in `moonHowler.ts` and the death primitive in `humanLifecycleCleanup.ts`, which were importing each other. `audit:deps:cycles:strict` exits 0 on 322 modules / 1 470 edges with no runtime cycle; the type-only component stays a reported warning because `WorldState` holds class-typed grid fields that take `WorldState` back. [runtime-import-cycles-in-the-game-module-graph](2026-09-16-runtime-import-cycles-in-the-game-module-graph.md)
- **2026-09-16 → 2026-09-16** (*live verification pending*) — Boot preloaded `/sprites/terrain/sand_water_overlay.png`, which is not shipped, failing the browser tier on a console error. **Fix:** the preload no longer requests `SAND_WATER_OVERLAY_PATH` (reason recorded beside the list); the atlas stays on its no-overlay path until the art ships. [sand-water-overlay-sprite-missing](2026-09-16-sand-water-overlay-sprite-missing.md)
- **2026-09-16 → 2026-09-16** — A school day was credited from the `schoolTicksToday` **tick** counter compared against a threshold in **hours** (5.5), so ~1.7 in-game hours credited a whole day and `schoolDays` accrued ~3.3× too fast (early maturation boost, early graduation). **Fix:** the threshold is converted once into `SCHOOL_DAY_MIN_TICKS` (16 ticks at 3 ticks/hour) and compared in the unit the counter is actually stored in. [school-day-credited-from-a-tick-counter](2026-09-16-school-day-credited-from-a-tick-counter.md)
- **2026-09-16 → 2026-09-16** — Settlers kept talking and floating a speech bubble while asleep at home. **Fix:** `isAsleepAtHome` (night hour + residence proximity) gates the ambient chatter roll and ends a running ambient chat via `endAmbientHumanChat` (scripted dialogue exempt), and the renderer skips drawing an asleep settler unless selected. [settlers-talk-and-bubble-while-asleep-at-home](2026-09-16-settlers-talk-and-bubble-while-asleep-at-home.md)
- **2026-09-16 → 2026-09-16** — The daily "shared home" friendship bump was keyed on `homeBuildingId`, which is the **workplace** in this codebase, so settlers sharing a House (spouses included) never grew closer while coworkers in one building were counted through two paths. **Fix:** the pass now builds three groups from the three fields that mean what the rule says — residence, workplace building and job type — additively, so no friendship growth that already existed was removed. [shared-home-friendship-keyed-on-the-workplace](2026-09-16-shared-home-friendship-keyed-on-the-workplace.md)
- **2026-09-16 → 2026-09-16** — Simulation rolls silently fell back to raw `Math.random`, so a seeded run was not reproducible. **Fix:** every defaulted `rng` parameter now resolves to its domain's owner stream (`getSimRng('humanRelationships' | 'moonHowler' | 'rivalProfiles' | 'frontierCombat')`), signatures and injectability unchanged; a guard test keeps `Math.random(` out of `src/` outside `simRng.ts`. [simulation-rolls-fall-back-to-raw-math-random](2026-09-16-simulation-rolls-fall-back-to-raw-math-random.md)
- **2026-09-16 → 2026-09-16** — Three stale ZIP archives of live source files sat inside `src/` behind `.txt`/`.zip` names (seven members had drifted from the compiled sources). **Fix:** all three deleted — nothing read them and the live TypeScript is the only authority; `src/components/` and `src/hooks/` now contain only `.ts`/`.tsx`. [stale-source-archives-hidden-in-src](2026-09-16-stale-source-archives-hidden-in-src.md)
- **2026-09-16 → 2026-09-16** — Stray duplicated artifacts sat in the working tree: a byte-identical 1 MB PNG pair (`src/image.png`, `tests/log`), three stale `.mjs` script twins of live `.mts` scripts, and a 0-byte junk file. **Fix:** all six deleted; the `.mts` siblings and the real `scripts/perf-all.ts` are untouched. [stray-duplicate-artifacts](2026-09-16-stray-duplicate-artifacts.md)
- **2026-09-16 → 2026-09-16** — A stale `patchUi` overwrote worker-authored `bigNews`, `floatingTexts` and `activeEvent` (the host snapshot can be up to `MAX_PIPELINE_DEPTH` ticks behind), so a banner flashed for one tick and vanished and an event card could be replaced by `null` before it was answered; `nextFloatingTextId` could also rewind and reuse ids. **Fix:** the worker adopts only the player-authored fields (new pure `applyWorkerUiPatch`) and floors the id allocator at its own value. [ui-patch-rewinds-worker-authored-big-news](2026-09-16-ui-patch-rewinds-worker-authored-big-news.md)
- **2026-09-16 → 2026-09-16** — An unharmed autumn herd grew the remembered size, so "let them pass" no longer kept next year's herd intact. **Fix:** `tickMigration`'s departure block is back to the single `if (lost > 0)` shrink, and the now-unused `addNotification` import was removed. [unharmed-autumn-herd-grows-the-remembered-size](2026-09-16-unharmed-autumn-herd-grows-the-remembered-size.md)
- **2026-09-16 → 2026-09-16** — Two worker-boundary robustness holes: `patchUiState`/`setPaused`/`setSpeed` posted without a `try/catch`, so a `DataCloneError` escaped into a React event handler; and a session swap during worker boot disposed the worker without scheduling recovery, leaving the session on the main thread for good. **Fix:** one `postControl` helper for the three fire-and-forget messages (with the last-sent cache cleared when the post fails) and `scheduleWorkerRecovery()` on the abandoned-boot branch. [worker-control-posts-throw-and-boot-swap-drops-the-worker](2026-09-16-worker-control-posts-throw-and-boot-swap-drops-the-worker.md)
- **2026-09-16 → 2026-09-16** — Four worker-boundary drifts (audit F7/F8): two command variants (`assignResident`, `recordGuidedCampaignChoice`) validated and dispatched but sent by nobody, `GameLoop.stop()` wiping its listener set, the `workerBoundary.closure` header claiming the presentation slices are not compared while its key array compares them, and a hand-written `ENTITY_CODE_TO_TYPE` that a new `EntityType` could silently miss. **Fix:** both variants deleted from all four protocol sites; the listener set belongs to the instance; the header matches the array; the reverse wire-code map is derived from `ENTITY_TYPE_CODE`. [worker-protocol-and-guard-drift](2026-09-16-worker-protocol-and-guard-drift.md)
- **2026-09-16 → 2026-09-16** — The tick delta overstepped in two directions (audit F4/F6): applying it called `restoreSimRng` on the **worker's** snapshot, which deleted any stream the snapshot did not list and rewound the rest — including main-thread presentation streams the worker never draws (`rendererShake`, `weatherFx`, `sfx`, `ambientAudio`, `introScreen`), so weather respawn positions, screen shake and sfx variation restarted from the same values ~3×/s; and the delta shipped `diedIds` / `newEntities` computed from a pre-tick alive set and cloned every tick while nothing read them (their only consumer, `EntityCatalog.applyTickDelta`, had zero call sites). **Fix:** presentation randomness moved to its own registry (`getPresentationRng`) that snapshots never read or write, with all five consumers repointed; the two dead fields, the `aliveBefore` parameter that computed them, the now-unused `aliveIdSet` helper and the dead `applyTickDelta` consumer are deleted. [tick-delta-restores-presentation-rng-and-ships-dead-spawn-lists](2026-09-16-tick-delta-restores-presentation-rng-and-ships-dead-spawn-lists.md)
- **2026-09-16 → 2026-09-16** — Two relationship-path defects (audit F3/F5): the youth-love → courtship handoff was unreachable for any real age gap (the reconciliation cleared the link the moment the older partner passed 18, which for a one-year-apart pair is the same day the younger turns 18, so the documented "growing up together" promotion only fired for same-year birthdays and every other pair was dropped silently); and courtship links were neither exclusive nor cleaned up, so a third settler could be offered an already-courting partner, orphaning the previous link and its progress while the new pair inherited it — and death, divorce and removal left `courtshipPartnerId`/`courtshipProgress` behind. **Fix:** the age cap is gone and the handoff happens on the first day both partners are adults, bounded by the documented age-gap rule; a candidate must be free (`courtshipPartnerId == null || === the caller`), `bindCourtship` starts a new pair at zero, a new daily `reconcileCourtships` dissolves pairs that can no longer complete, and death/divorce/removal clear both halves. [youth-love-handoff-unreachable-and-courtship-not-exclusive](2026-09-16-youth-love-handoff-unreachable-and-courtship-not-exclusive.md)

## 2026-09-21

- **2026-09-21 → 2026-09-21** — A deep audit against an **already-green** baseline (264 files / 1420 tests) found twelve latent defects in six areas, i.e. none of them was a failing test. **Worker:** a command's render refresh could exhaust the render-buffer pool and the worker answers exhaustion with a *fatal* fault, so issuing a command at high pipeline depth tore the sim worker down mid-session; `EntitySpatialGrid.insert` dropped every refreshed object whose cell had not changed, so the grass render grid kept the first tick's shims forever. **Simulation:** stone had no visitor-trade route at all (neither buy nor sell, though `tradeRoutes` could import it); the yearly Marriages stat counted `=== 'married'` while conception sets both partners to `'expecting'`, so `floor(delta / 2)` cancelled the marriage exactly and the lifetime total never rose; the leader-honored banner was gated on a reputation delta that the 0–100 clamp makes zero at the cap, retiring it for the rest of the game; a multi-resource trade float announced only the last resource; a nameless settler read "Settler", "Unknown" and "A settler" depending on which log line named them. **Save/load:** `villageCanHeat` was not saved, so a reload mid-winter-day refunded the rest of that day's 1.5× cold penalty; a same-version payload with a non-finite `tick` loaded into a `NaN` calendar that never ran the daily layer again, and an incomplete `resources` object loaded into an economy where every affordability rule is permanently false. **Rollback/caches:** `extractSimPrep` spread `floatingTexts`/`deathParticles` shallowly while the realtime layer decays them in place, so a rollback restored post-tick values; `beautyGrid` was missing from the runtime-cache strip list. **UI:** the village-request card's `acceptBlockedReason` was declared but never passed, leaving Accept enabled on an unaffordable offer, and the raid card re-derived the owner's gate with drifted weapon logic and copy. **Fix:** eleven owner-level repairs plus `villageAnchor.ts`/`civilStatus.ts` as new single owners, `addReputation` now returns the applied delta, `gameLoop`-level buffer accounting closes (`canPipelineTick` counts a command in flight), the new `buy_stone`/`sell_stone` actions are priced against the wood/iron neighbours and wired into the panel and the bot, and the load path refuses an unloadable payload by name. **The audit's top suspicion was disproved rather than fixed:** a field-by-field probe over five tick phases including a year boundary found **zero** rollback gaps, so the existing payload is closed. Gates: `tsc` clean on both projects, `npm run lint` 0/0, `npx vitest run` **265 files / 1447 passed, 2 skipped, 0 failed**, `npm run build` exit 0, `npm run audit:deps` 339 modules / 0 runtime cycles, `npm run check:source` OK; `tests/audit2026-09-21.regression.test.ts` adds 27 cases, one per repair. No test was deleted, skipped or weakened. **Not run:** `test:full-year`, `test:browser`. Twelve further confirmed findings (renderer hot-path allocation, the autosave/display-world split, two overlapping saves, UI/a11y items) are recorded with evidence in the report and deliberately left unfixed. [2026-09-21-deep-audit](2026-09-21-deep-audit.md)

## 2026-09-24

- **2026-09-24 -> 2026-09-24** - The per-pixel ground bake coloured land on **absolute** elevation above sea (`e - seaLevel`) while `classifyTile` classifies on the **normalised** land range (`(e - seaLevel) / (1 - seaLevel)`), so the alpine half of its ramp sat above the map's own maximum height: measured, a 2560x1920 scandinavia map tops out at **1.077** while the old ramp only painted snow at **1.176**, so **0.0 % of the land could ever paint snow** while 1.0 % of its tiles were `Snow` - and its 2.9 % `rocky` / 1.2 % `mountains` tiles were painted lawn green. **Fix:** the band edges and the height axis are the classifier's (`LAND_BANDS`, `COLD_TEMPERATURE`, `BEACH_BAND_OF_LAND_RANGE`, `MOISTURE_DRY_BELOW_FOREST` are exported from `terrainGrid` and read by both), one continuous water ramp replaces two arms that did not meet at the shelf edge, the coastline and river bank are displaced on smooth contours instead of the 16 px lattice (the generator's river carve writes whole-cell plates, so the ground art now reads a 3x3-smoothed height while classification keeps the raw field), material detail moved off the nearest cell's biome label onto the smooth fields, shading reads a precomputed cell-resolution slope field, and the season shift is vegetation-weighted. Mean green-minus-red over alpine tiles: **~45 -> 0.58 / 1.03 / 0.79** (scandinavia / highland / continental). Bake cost +7...+12 %. [alpine-ground-painted-green](2026-09-24-alpine-ground-painted-green.md)

- **2026-09-24 -> 2026-09-24** - The per-pixel ground bake ran **whole-map, synchronously, on the main thread** (3.2-3.4 s Medium, 7.7-8.0 s Large), and its cache key carried `getTerrainRevision()`, which `buildingPlacementActions` bumps when it clears a building footprint - so **placing a building re-baked the entire world** to produce a byte-identical image. **Fix:** one 256 canvas-px chunk per visible viewport cell (fields built once per map, key = seed|preset|dims|season|step, no revision; the cache entry now stores the world rect it covers), plus `groundWorldStepForZoom` so the bake resolution follows the camera zoom instead of baking 1:1 for a 0.5x screen. A parallel first pass at chunking had used 1024 px chunks at a fixed 1:1 step and measured **worse than the whole-map bake** (Huge 16.8 Mpx / 11.0 s for a 0.7 Mpx view, 28.3 Mpx / 17.0 s at the overview); first frame after: Medium 3.34 -> 1.87 s, Large 8.24 -> 1.97 s, Huge 10.97 -> 2.01 s, and at 0.5x Medium 3.24 -> 0.90 s, Large 7.87 -> 1.91 s, Huge 17.00 -> 2.80 s. [whole-map-ground-bake-freezes-the-main-thread](2026-09-24-whole-map-ground-bake-freezes-the-main-thread.md)

## 2026-09-25

- **2026-09-25 -> 2026-09-25** - The ground bake's cast shadow was traced **down-light**, so it darkened the flank the hillshade was lighting: a cell was "shadowed" when the ground *down and to the right* of it stood higher, which is the definition of the lit face. Measured on the shipped bake (1600x1200, seed 12345, spring, one altitude band so biomes do not confound it), the cells the field darkened came out **+42.6 luma brighter** than the rest on highland (scandinavia +47.8) - a cast shadow making the ground brighter, not a weak shadow but an inverted one. A second defect sat in the same loop: the blocker test was a flat minimum rise (`heightDiff > 0`) with a `1/step` falloff, which is not a sun, so once the heading was corrected the same rule put **45 % of highland's land at full shadow** and merely dimmed the map. **Fix:** one source of truth for the light (`LIGHT_TOWARD_X/Y`, read by the hillshade and the trace alike), the trace walks toward the light 14 cells instead of 6, and a blocker must out-climb a **sun inclination** (`SHADOW_SUN_SLOPE` 0.035 per cell, measured against the terrain's own up-light rise of p50 0.007-0.021 / p90 0.048-0.074) with a distance falloff. After: shadow coverage over land **29 / 14 / 18 %** (> 0.05) and **11.6 / 4.7 / 6.1 %** (> 0.5), shadow depth **+31.1 / +36.6 / +31.3 luma**, field build 9-10 ms per map. [cast-shadow-falls-on-the-lit-flank](2026-09-25-cast-shadow-falls-on-the-lit-flank.md)

## 2026-09-29

- **2026-09-29 -> 2026-09-29** - Reported from play as *"some are totally missing like affairs"*, and the owner's own save proved it rather than a model of it: New Frontier (v0.6.5.0, Y0 D198-D279) logged **145 "Whispers spread" and 0 "began a secret affair"** - with it **0 "was caught with"**, **0 "imprisoned for scandal"** and **0 feuds**. The cause is an ordering inversion, not a tuning value: establishment needs both partners at `AFFAIR_PROGRESS_MAX` (100, bumped 16-27 per tryst at a 0.07/day roll) while `tryDailyAffairGossip` exposed a pair at **45** (church) or **85** (no church), and `exposeAffair` -> `clearAffairPair` set *both* progress values back to **0** - so a rumour undid the climb it interrupted and exposure almost always won. Every gate below establishment keys off `hasAffairPartner`, which only establishment sets, so caught-in-the-act, `arrestForScandal`, the imprisonment line, the forced divorce and the game's **only `startFeud` caller** were all unreachable; the 2026-09 rebalance (tryst chance 0.14 -> 0.07 with a church) widened the window. **Fix:** `tryDailyAffairGossip` returns unless `hasAffairPartner` (restoring `gameConstants.ts`'s own written rule, *"only establishment can produce a scandal"*, and `affair.cadence.test.ts`'s *"exposure requires an established affair"*), and `findAffairLover` resolves only an established mutual lover. **A/B on the real engine, HOUSED (60 houses placed first - housing is the variable that decides this bug, because a homeless settler passes `isAtMaritalHome` for the wrong reason), 360 days of shipped `gameTick`, both arms also run against pre-fix HEAD:** the church village went from **24.35 to 0.26 rumours per establishment** - establishments **17 -> 81**, rumours **414 -> 21**, caught **8 -> 49**, imprisoned **6 -> 35**, feuds **8 -> 44**, forced divorces **16 -> 82**. **The second half, without which a housed village still had nothing:** `tryDailyAffairEncounter` is the sole writer of `affairPartnerId` and ran on the global `isNewCalendarDayTick` gate - **00:00 for the whole settlement at once** - where it cannot pass its own gates (`canPursueSecretAffair` fails on `isSpouseNearby` 22 px, true for a couple asleep in the same room; `isAtMaritalHome` is true besides). It is now staggered to a per-settler hour across the waking day (`affairEncounterHourOfDay`, 06:00-19:00 from `NIGHT_END`/`NIGHT_START`), which **costs nothing in probability** because `personDayRoll` hashes `(entity, colony day, salt)` and not the tick-of-day - the same single roll at the same chance, sampled at an hour its gates can pass. `decisionRegistry` already declared this cadence "staggered/daily"; the implementation was the part that was not staggered. **Three measurement errors in my own probes are recorded with the numbers**, each of which produced a false reading: harvesting only `type === 'scandal'` although `"imprisoned for scandal"` is logged as `'event'`; a church-staffing step that stole the starter Prison Guard so the church arm could not arrest anyone; and an under-housed colony (7.56 vs 24.35 rumours per establishment). **No automated regression test ships**: two were written and deleted (a fixture test that hand-set `affairProgress`, and a bot-played test that took 214 s and needed a church the bot never builds), because the owner's ruling is that a test which invents its own precondition is not evidence. [affair-establishment-preempted-by-rumour-exposure](2026-09-29-affair-establishment-preempted-by-rumour-exposure.md)

- **2026-09-29 -> open** - **Why no automated run could have seen it, and the answer to "so many tests, so many flaws".** The only year-long gate (`scripts/run-full-year.mts`) **never builds anything**: it reports `buildings=18` at day 30 and still `buildings=18` at day 360, because `prepareColonyWorld` places a fixed *completed* skeleton (8 Houses + Tavern + Prison + 8 storage) and neither the harness nor any script it calls ever issues a construction command (a grep for `queueConstruction|buildingQueue|startConstruction|proposeBuild|virtualPlayer` **scoped to `colonyHealth.ts` and `run-full-year.mts`** returns nothing). Food and wood are additionally pinned at exactly 4800/2000 by the `restocked` checkpoint refill, so the economy is cancelled too. `getChurchStrength` is therefore **0 in every long automated run**, while a played village has a church - and the affair bug lived entirely in the `churchStrength > 0` branch. **The bots do play the game, and they are not the gate:** `scripts/autoplay-probe.mts` (300 ticks / ~4 days), `autoplay-food-probe.mts` (30 in-game days) and `autoplay-rules-probe.mts` drive the real decision engine against real `gameTick` worlds and the bot does build, but all three are headed *"Temporary probe (local-only, gitignored, safe to delete)"*, so none is a standing gate - and **none builds a church**, because `CIVIC_BUILD_ORDER` is TownHall + Blacksmith. Adding a Church to that ladder was tried and **reverted**: step 6 precedes roads, militia, diplomacy and refugee screening, so a church the colony can afford (45 wood / 35 stone / 20 gold) shadowed every later decision and broke **36 of 68** cases in `tests/virtualPlayer.test.ts`; closing the gap means reordering the ladder, not extending it. Two smaller gate defects recorded with it: `colonyHealth.ts:419` counts `rumorScandals` by `message.includes('rumor')`, which the actual line *"Whispers spread about X and Y"* never contains - so the gate printed `rumorScandals: 0` for a year in which 72-113 rumours fired - and `:422` counts any message containing "divorc" as a divorce. **Not fixed**: widening the gate's world changes what every recorded run means, so the route (add a church to the skeleton / reorder the bot ladder and wire it into the year run / both) is the owner's call. [automated-runs-never-build-a-church](2026-09-29-automated-runs-never-build-a-church.md)

## 2026-09-30

- **2026-09-30 -> open** - Found while measuring why a chronicle line claimed a settler had worked 0.7 h of a 9 h day. `humanTick.ts:666` computes `onOfficialShift` (Official job + completed Town Hall + `goWorkTime`); the recording gate at line 697 is `onDayJobShift || onTavernShift || onHotelShift || onMoonPriestShift` and **omits it**; and line 1291 passes `onDayJobShift || onOfficialShift` downstream, where `humanVenueBehavior.ts:83` uses it to let the official serve. So the official is on shift for serving and off shift for being counted. Measured on two of the owner's saves (`New Frontier` Y1 D44 and Y2 D63): the Town Hall records **0.0 h for all 3 officials, 100 % under 1 h, in both**, against farm 7.8 h (14 %) and market 9.0 h (0 %). Ruled out: energy (93 % of maximum on every adult, none below the 42 % hospital threshold in either save) and distance (under-workers live *closer* to their workplace - median 475 px against 710 px for full-day workers). Consequence: `dailyScheduleFatigue` treats the shortfall as *rest*, so those officials are the population behind the "Short shifts..." line. **Not fixed:** the repair is one shared predicate read by both paths, not `|| onOfficialShift` added to line 697. [officials-never-recorded-on-shift](2026-09-30-officials-never-recorded-on-shift.md)

- **2026-09-30 -> open** - Reported from play as *"my leader died after 3 months no elections then after a year they where elections for the year 0 ?"*, and reproduced with the shipped engine rather than reasoned about: killing the founder on day 90 of year 0 (`tmp/audit/repro-election-year0.mts`) produced an election at day 213 - so the **0.33-year vacancy delay works** (`VACANCY_ELECTION_DELAY_YEARS = 1/3`, 122 days measured) - and exposed three other defects instead. **(1)** The ceremony is refused while nobody is eligible and the vacancy path keeps the past-due `pendingElectionYear`, so it retries **every day**, writing `Leadership election postponed (Year X) - no eligible candidates` once per attempt: a colony whose remaining adults are dead, jailed (`isEligibleForLeadership` excludes `isImprisoned`) or under 18 sees no election for as long as that holds - a year, if the only heir is a child. **(2)** `lastElectionYear = 0` means both *"never elected"* (`appointFoundingLeader:571`, tested at `validateVillageLeaderOnLoad:1215`) and *"elected in the founding year"* (`runVillageElection:972`), while `worldGen`/`saveLoad` use **-1** for the same concept - three spellings, one collision. Loading with a dead leader after a year-0 election therefore takes the "never elected" branch and silently installs a founder: measured `villageLeaderId = 8912 (Gideon)`, `pendingElectionYear = null`, **no election armed**. **(3)** `getActiveElectionPromises:191` and `tickElectionPromises:235` both early-return on `year <= 0`, so a founding-year leader's campaign promises never appear in the panel and are **never judged** (no reputation swing). **Not fixed:** the sentinel repair needs an owner call on existing saves, where `lastElectionYear = 0` is genuinely ambiguous. Session cost so far: one repro script, no `src/` change. [founding-year-election-counts-as-no-election](2026-09-30-founding-year-election-counts-as-no-election.md)

- **2026-09-30 -> 2026-09-30** - The repository's test-project type gate failed on a duplicated object key, not on anything about the game: `npx tsc -p tsconfig.vitest.json --noEmit` exited **1** with exactly one line, `tests/familyTree.test.ts(87,7): error TS1117: An object literal cannot have multiple properties with the same name`, because the child fixture (id 8) set `isJuvenile: true` twice four lines apart when `age: 8` was introduced above it. The app project was clean in the same run, so only the test tier was affected - but it failed `npm run test:all` before a single test ran, and what it hid is a real pattern: TypeScript rejects the duplicate while JavaScript would have silently kept the last value. **Found while verifying an unrelated UI change (the Village-overview window) and first left unfixed per AGENTS.md §6**; the owner then ruled *"doesnt matter if your fault fix t he error"*. **Fix:** one duplicate line deleted. `tsc` exit=0 on both projects, `npm run test:standard` **245 files / 1493 passed / 2 skipped / 0 failed**. [familytree-fixture-duplicate-key](2026-09-30-familytree-fixture-duplicate-key.md)

# Bug tracker — master 130 (session)

Companion to `WORKER_AUDIT.md`, which holds the root cause, drift timeline,
fixes with code, retractions, open questions and suggested tests. This file
holds only the list.

Counts: **0 × P0 · 0 × P1 · 0 × P2 · 0 × P3**

Paths are relative to **`src/game/`**.

## The list

| # | P | File(s) | Issue | Fix | Status |
|---|---|---|---|---|---|
| 1 | **P0** | `gameTypes.ts` · `worldRuntimeCaches.ts` · `simWorker/GameWorkerHost.ts` · `buildingActions.ts` · `simWorker/commands.ts` | **Latent, not crashing.** `structuredClone` / `postMessage` strip the seven class-typed `WorldState` fields (`gameTypes.ts` 902–918) and `invalidateWorldRuntimeCaches` is never called before a world crosses the thread boundary. **The demolish crash this produced is already fixed** — remaining risk is the six fields with no guard, above all `roadAvoidance` (#20) | Call `invalidateWorldRuntimeCaches(world)` before every world-bearing `postMessage` [Proof: GameWorkerHost.ts:queueFullWorldUpload] | **FIXED** |
| 2 | **P0** | `simWorker/GameWorkerHost.ts` · `simBuffers/simDelta.ts` | `metaBySlot: delta.renderMetaBySlot ?? []` returns an **empty array**, not undefined. Command deltas are `headless: true`, so nameplates, chat bubbles and skills vanish after every command | Pass `undefined`, or pack the sidecar for the command path [Proof: GameWorkerHost.ts:buildRender returns undefined] | **FIXED** |
| 3 | **P0** | `simBuffers/renderSoAEntities.ts` · `simWorker/GameWorkerHost.ts` | Same line kills the bucket cache: `?? []` allocates a new array every tick, and the cache tests `cachedMetaBySlot === metaBySlot` by reference — so it never hits. Full shim rebuild + 3 sorts every frame | Fixed by #2 | **FIXED** |
| 4 | **P1** | `simWorker/GameWorkerHost.ts` | `Worker failed to start: unknown error`. Host *does* read `event.message`, so an empty message means **script load failure** (404 / chunk), not a module throw — but `event.filename` / `lineno` / `colno` are discarded | Add them to the reject message [Proof: GameWorkerHost.ts:onError includes colno] | **FIXED** |
| 5 | **P1** | `simWorker/commands.ts` | `setBuildingStaffingMode` missing from `WORKER_COMMAND_OPS` — silently rejected. Four-way check: union ✓ import ✓ validator ✓ dispatch ✓, gate set ✗. Op added 0.6.3 (Aug 25); gate set built 0.5.0 (Jul 30) | Add to set + `Exclude<>` exhaustiveness guard [Proof: commands.ts:WORKER_COMMAND_OPS + _EXHAUSTIVE_CHECK] | **FIXED** |
| 6 | **P1** | `simWorker/commands.ts` | `[WorkerCommand] Invalid command` logs the object but not the `op` or which rule failed. ×15+ in the live log, undiagnosable | Log `cmd.op` and the failing rule [Proof: commands.ts:isWorkerCommand logs op] | **FIXED** |
| 7 | **P1** | `simWorker/gameWorker.node.ts` | Node adapter dropped its message queue — `messageHandler?.()` is null until `await import('./gameWorker.ts')` resolves, so `init` can be **silently dropped** | Restore `queuedMessages` [Proof: gameWorker.node.ts:queuedMessages restored] | **FIXED** |
| 8 | **P2** | `simWorker/commands.ts` · `simBuffers/simDelta.ts` | `safeExtractCommandDelta`'s catch block is byte-identical to `extractCommandDelta`'s body — if extraction throws once it throws again, and the second throw escapes the function whose only job is being the failure-proof fallback | Return a minimal empty delta instead [Proof: commands.ts:safeExtractCommandDelta returns empty delta] | **FIXED** |
| 9 | **P2** | `gameLoop.ts` | `stop()` calls `listeners.clear()` — StrictMode subscribe→stop→start loses the subscription silently | Don't clear, or document the contract [Proof: gameLoop.ts:stop() does not clear listeners] | **FIXED** |
| 10 | **P2** | `gameLoop.ts` · `viewState.ts` · `renderSnapshot.ts` | Dropped the `e.alive` check (`!= null` instead). `applySimTickDelta` sets `world.entities = delta.aliveEntities`, so worker mode is clean — main-thread fallback leaves corpses selected. **Three sites, not one** | `!= null` → `?.alive === true` [Proof: gameLoop.ts/viewState.ts/renderSnapshot.ts check ent.alive] | **FIXED** |
| 11 | **P2** | `gameLoop.ts` · `simWorker/commands.ts` | `applyAction(closure)` logs `console.error` then returns without mutating — silently no-ops under the worker, and still compiles | Migrate call sites to `applyCommand` | **WONT-FIX (by design)** |
| 12 | **P2** | `buildingActions.ts` · `simWorker/commands.ts` | Three inconsistent mutation conventions: `recruitSettler` clones the whole world, `deliverVisitorQuest` mutates in place, `startGuidedCampaign` clones | Pick one. In-place is correct (worker is sole authority) and avoids a full-world deep clone per click [Proof: buildingActions.ts:recruitSettler mutates in place] | **FIXED** |
| 13 | **P3** | `simWorker/protocol.ts` · `simWorker/commands.ts` · `simFocus.ts` · `simBuffers/simDelta.ts` | Opaque protocol types shadow the real ones — `WorkerCommand = {proto:1; op:string}`, `SimTickDelta = unknown`, and a local `SimulationFocus` redefined instead of imported. No wire-level type checking | Rename to `WorkerCommandEnvelope` / `SimTickDeltaPayload` [Proof: protocol.ts:WorkerCommandEnvelope/SimTickDeltaPayload] | **FIXED** |
| 14 | **P3** | `simWorker/commands.ts` · `buildingRotation.ts` | `isBuildingRotation` accepts only `0` and `90` | Verify `BuildingRotation`; if 180/270 valid, same silent-rejection path as #5 [Proof: commands.ts:isBuildingRotation accepts 0/90/180/270] | **FIXED** |
| 15 | **P3** | `simBuffers/entityRenderMeta.ts` | `buildRenderEntityShim(): Entity` fabricates fields (`energy:0, age:0, speed:1`) and omits others (`job`, `occupation`, `pregnancyProgress`) while claiming the full `Entity` type | Return a narrower `RenderEntity` type [Proof: entityRenderMeta.ts:RenderEntity type exists] | **FIXED** |
| 16 | **P3** | `simBuffers/entityRenderMeta.ts` | `packEntityRenderMeta` aliases `skills` — reference, not copy (while the shim correctly does `{ ...meta.skills }`) | `{ ...entity.skills }` [Proof: entityRenderMeta.ts:skills copied] | **FIXED** |
| 17 | **P3** | `simBuffers/entityRenderMeta.ts` | `tamedBy: -1` sentinel loses the owner id — the flag only encodes `!= null`, so taming links that match on owner id never resolve | Store the real id in the sidecar [Proof: entityRenderMeta.ts:tamedBy uses real id] | **FIXED** |
| 18 | **P3** | `simWorker/simPrep.ts` | ~~Shallow copy, rollback a no-op~~ **Partly fixed.** Collections are now cloned (`[...state.entities]`, `{ ...state.resources }`, `structuredClone` for two fields) so array membership and scalars genuinely roll back. Still shallow at the **element** level — entity/building objects are shared, so `entity.x` / `building.occupants.push` survive. Source comment says "Shallow-clone" and is accurate | Accept as a documented tradeoff; deep-cloning 1500 entities per tick costs more than the failure it guards | **DOCUMENTED** |
| 19 | **P3** | `simWorker/protocol.ts` · `simWorker/gameWorker.ts` | `syncSimPrep` is dead — `GameWorkerHost` never sends it | Remove from protocol + worker [Proof: protocol.ts/gameWorker.ts:syncSimPrep removed] | **FIXED** |
| 20 | **P1** | `gameTypes.ts` · `spatialGrid.ts` (unconfirmed) | `roadAvoidance` is the one class-typed field with **no `instanceof` guard and no env gate**. `adjacency` is protected by `ensureAdjacencyIndex`; `scentGrid` and the four spatial grids are env-gated. Road demolish touches it — the same action that produced the adjacency crash | Grep first: `findstr /i /s "roadAvoidance" *.ts`. If it is a class, mirror the `ensureAdjacencyIndex` pattern [Proof: gameTick.ts:roadAvoidance guard with typeof check] | **FIXED** |

## Files touched, ranked

| File | Bugs |
|---|---|
| `simWorker/commands.ts` | #5, #6, #8, #11, #12, #13, #14 |
| `simWorker/GameWorkerHost.ts` | #1, #2, #3, #4 |
| `gameLoop.ts` | #9, #10, #11 |
| `simBuffers/entityRenderMeta.ts` | #15, #16, #17 |
| `simWorker/protocol.ts` | #13, #19 |
| `simBuffers/renderSoAEntities.ts` | #3 |
| `simBuffers/simDelta.ts` | #2, #8 |
| `gameWorker.node.ts` | #7 |
| `worldRuntimeCaches.ts` | #1 |
| `buildingActions.ts` | #1, #12 |
| `viewState.ts` / `renderSnapshot.ts` | #10 |
| `adjacencyIndex.ts` | *(source of the guard that fixed the crash — no open bugs)* |
| `gameTick.ts` | #20 (already fixed) |

`commands.ts` and `GameWorkerHost.ts` between them carry 11 of the 20.

## Fix order

1. **#20** — grep `roadAvoidance` first; it is the one place the original crash could still be live.
2. **#4** — surface `event.filename`. Nothing is diagnosable until "unknown error" has a URL attached.
3. **#5** — `setBuildingStaffingMode` + `Exclude<>` exhaustiveness guard.
4. **#2 / #3** — meta sidecar (also a real per-frame perf win).
5. **#6** — log the failing `op`.
6. **#7** — Node adapter queue.
7. Delete `src/game/gameworker.ts`; apply #10 to `gameLoop.ts` only.

## Three one-liners worth more than the rest

Every failure path in this system is silent. These make the worker boundary fail visibly:

```ts
reject(new Error(`Worker failed to start: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`));
console.warn('[WorkerCommand] Invalid command', cmd.op);
if (!isWorkerCommand(cmd)) throw new Error(`Unknown op ${cmd.op}`);
```


**Private · gitignored · not for GitHub**  
Index → [README.md](./README.md) · Open gaps → [OPEN_PROBLEMS.md](./OPEN_PROBLEMS.md)

**Source:** User master table (14 files, 130 items) + batches A–V below + [`bug_audit.md`](../../bug_audit.md).  
**Legend:** `fixed` | `partial` | `open` | `wontfix` | `info`  
**Last updated:** 2026-08-18 (Batch EQ — v0.6.1 stability session)

## Progress summary

| Status | Count | Notes |
|--------|------:|-------|
| fixed | **500s+** | +EJ-1..12; full EK agent tables; EI cycle breaks (playerHuman, entityFactory, rivalPeace, leaf imports) |
| partial | 0 | — |
| open | **0 functional + residual barrel hygiene** | ~0–3 hub notes only; EI multi-node mostly fixed/mitigated; remaining risk is `gameEngine` barrel re-exports, not player bugs |
| info | ~28 | landscape deferred; harness nits |
| **Total** | **~580** | see Batch EK |

### Batch index

| Batch | Items | Theme |
|-------|------:|-------|
| A | 8 | dayCycle, challenges, combat, moon, building preview |
| B | 22 | sprites, festival, forge, exports, worker sync, low-severity hygiene |
| C | 20 | lifeSimulation, worldEvents, stats, UI workforce, renderer |
| D | 17 | simBuffers — render SoA, simDelta, worker sync |
| E | 15 | simWorker — gameWorker, GameWorkerHost, commands, protocol |
| F | 12 | UI components — forge, build catalog, header, combat log, tutorials, menu |
| G | 10 | gameEngine, groupEvents, lifeSimulation, dayCycle, humanChat, App, gameTypes |
| H | 9 | renderer.ts — caches, grid, glow cull, walk threshold, SoA shims |
| I | 9 | marriage widow, Moon Howler partner lookup, pairwise sim hotspots, social test ids |
| J | 3 | werewolf-form killHuman, test:types hygiene, CHANGELOG doc accuracy |
| K | 6 | Renffr omen canvas stack, subtitle centering, `isPlayerHuman` semantics, seeded RNG, shuffle rename |
| L | 6 | Manual save silent fail, auto-save paused gate, load disabled after auto-save, worker export hang |
| M | 4 | `structuredClone` strips spatial grid methods; 10-year sim `grid.rebuild` crash |
| N | 7 | Moon Howler 14-day transform cycle, Church cure timing, full-moon scheduling |
| O | 3 | Orphaned marriages after entity prune; vitest dialogue-bank parallel race; prison integration flake |
| P | 3 | Caught-affair divorce blocked after prison teleport; wife-only divorce copy; gender-neutral `dissolveMarriage` |
| Q | 15 | dayCycle housing/werewolf sync; taming UX; challenge progress; forge crash; tutorial clone; wall strip unlock; perf + rival overlap — **fixed** |
| R | 6 | Renffr omen NL audit — cross-ref Batch K (canvas stack, subtitle, RNG, shuffle); **fixed** |
| S | 17 | App.tsx + panels NL audit — stale closures, bigNews dismiss, click refs, panel crashes, save race — **fixed** |
| T | 87 | [`bug_audit.md`](../../bug_audit.md) full import — **68 fixed**, 19 info, 0 partial |
| U | 14 | gameEngine/education/worker — **11 fixed**, 3 info |
| V | 15 | simBuffers/render SoA — **fixed** |
| W | 12 | simWorker protocol — **fixed** |
| X | 1 | storyEvents import cycle broke election-gossip mock — **fixed** (leaf resourceUtils import) |
| AP | 8 | App.tsx render perf — useMemo/callbacks, idle worker memo, audio guard, bigNews dismiss, `getBuildingConfig` — **fixed** |
| AA | 7 | Spatial grid layout reuse — `mapWidth`/`mapHeight`/`cellSize`; grass bypass; `RoadAvoidanceIndex`; tree stamp — **fixed** |
| AB | 9 | `tickQueries` population double-count + metrics narrow-phase + residence index — **fixed** |
| AC | 5 | `tickQueries` grid/fallback metrics parity + absorbed-id guards + `getHousemates` type check — **fixed** |
| AD | 8 | `viewState.ts` camera sanitize waste, save deserialization, `resolveEntity` O(n), merge state loss — **fixed** |
| AE | 6 | `populationGrowth.ts` paused/detail mismatch, cap copy, pop validation, scan cache, food guard — **fixed** |
| AF | 10 | simWorker — command validation, headless command delta, tick rollback, host counters, simPrep clone — **fixed** |
| EA | 7 | Engine audit — road avoidance stamp, repair workers, grass bounds, worker import race, proximity cleanup — **fixed** |
| EB | 7 | Playtest Jul 8 — scrambled terrain, sim build stall, HUD dismiss, Windows emoji `?` — **fixed** (EB-6 → EC-1 closed) |
| EC | 7 | Live playtest Jul 8 PM — dismiss / music / Market trade gate — **fixed** 2026-07-30 |
| ED | 5 | Playtest Jul 8 night — banners, auto-staff, chat, immigrant age — **fixed** 2026-07-30 |
| EG | 16 | Post-refactor runtime/lint pass — TICKS_PER_DAY TDZ chain, restored deleted modules, v0.5.0 roadmap features, lint clean — **fixed** |
| EH | 4 | Sidebar UI rehaul + audio concurrency + hunting-spot sprite — **fixed** (EH-4 preload typo 2026-07-30) |
| EI | 20 | Import-cycle cleanup — small fixed + multi-node largely **fixed/mitigated** (playerHuman, entityFactory, rivalPeace, leaf imports); residual barrel hygiene optional |
| EJ | 12 | Dual agent bug-hunt 2026-07-30 — day-length/ceremony/hotkeys/UI/migrate (see Batch EJ) |
| EK | 70+ | Parallel big-file sim audit 2026-07-30 — groupEvents, workforce, moon, frontier, dayCycle, lifeSim, gameTypes — **fixed** (G7 casing 2026-07-30) |
| EL | 1 | Rivers never form / render as land — greedy descent died on spiky noise; carved channels now water — **fixed** 2026-08-06 (see Batch EL) |
| EO | 2 | Cadence audit 2026-08-15 — election gossip double-fire on ceremony day boundaries + entity-by-type index built 3×/tick (see Batch EO) — **fixed** |
| EP | 2 | River feel 2026-08-16 — rivers carve whole-tile 3–5-wide water bands (no thin stream stroke); coastal & riverlands presets get river sources via preset-aware peaks (see Batch EP) — **fixed** |

**Annex (full tables):** [BATCH_T_AUDIT.md](./BATCH_T_AUDIT.md) · [BATCH_U_AUDIT.md](./BATCH_U_AUDIT.md) · [BATCH_V_AUDIT.md](./BATCH_V_AUDIT.md) · [BATCH_W_AUDIT.md](./BATCH_W_AUDIT.md)

---

## Batch EL — world-gen rivers (2026-08-06) **fixed**

**Files:** `terrainGen.ts` (+ regression `terrainGen.riverGeneration.test.ts`)  \
**Legend:** `fixed` | `open` | `info` · Sev 🔴 High · 🟠 Med · 🟡 Low

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| EL-1 | 🟠 | Rivers never form: `map.rivers` empty on every preset; river tiles render as land (greedy per-tile descent hit a local minimum within 1–2 tiles on spiky noise; even when traced, elevation never dropped below the strict River threshold) | **fixed** | rivers follow a 7×7 smoothed elevation gradient + basin-bypass fallback; carved channels forced to `TerrainType.River` regardless of elevation; source peak cell stays land |

---

## Batch EM — playtest Aug 6: selection, build hints, hospital, visitors (2026-08-06) **fixed**

**Files:** `useCanvasInteractions.ts` · `preferences.ts` · `App.tsx` · `BuildCatalogPanel.tsx` · `lifeSimulation.ts` · `tickLayerDaily.ts` · `huntvisuals.ts` usage · `groupEvents.ts` · `simEffects.ts` · `gameTypes.ts` (+ changelog)
**Legend:** `fixed` | `open` | `info` · Sev 🔴 High · 🟠 Med · 🟡 Low

| # | Sev | Bug / ask | Status | Fix |
|---|-----|-----------|--------|-----|
| EM-1 | 🟠 | Clicking a citizen always selects grass instead (hit-test iterated all entities in array order; grass spawned first with a 10.8px radius won before the human ellipse) | **fixed** | grass/trees are skipped entirely in the click loop — only humans, wildlife, wildkin selectable (`1bd4446`) |
| EM-2 | 🟡 | "Placing X · keep clicking…" hint nagged on every building | **fixed** | once-ever via `localStorage` (`preferences.ts`), respects tutorials-off (`ae84f7b`, `1f41d54`) |
| EM-3 | 🟠 | Eco metrics (pollution/health/biodiversity) computed 18×/day — pure waste | **fixed** | moved to daily layer, computed once before valley stage (`f02da05`) |
| EM-4 | 🟠 | Hospital had no purpose: pregnant/employed settlers never visited during work hours (`!onJobShift` + `workplace == null` gates) | **fixed** | `needsMedicalCare` settlers may walk to the ward and be treated on arrival during work hours (`008b2a8`) |
| EM-5 | 🟡 | Arrow-flight FX existed but only fired from Hunting Spots — free-roam hunts had no visual | **fixed** | `addHuntVisual` on free-roam kill path in `lifeSimulation` (`a8a4c16`) |
| EM-6 | 🟡 | New immigrants only got floating text, no header notification | **fixed** | `addNotification` with camera focus on arrival (`a8a4c16`) |
| EM-7 | 🟠 | Visitors felt useless/chaotic — intent hidden: no guidance on arrival, camp actions buried in inspector | **fixed** | arrival toast names the action + clicking selects the camp and opens inspector (`campKey` on `GameNotification`); first visitors moved day 3–7 → 7–14 (`e1a6d8c`) |
| EM-8 | 🟡 | Build menu: switching from one building tool to another reportedly needs a right-click first (user repro pending) | **fixed** | **reopened 2026-08-16** — earlier close was premature; user reproduced it live. Root cause: `BuildCatalogPanel` pinned the visible category to the *selected* type (`activeCategory = selected != null ? categoryFor(selected) : manual`), so while a build was selected the category tabs ignored clicks and you could only re-select the same category. Fix: tabs always follow manual navigation; a changed selection jumps the tab (adjust-state-during-render, no effect) — `123da89`, **player-confirmed 2026-08-16** |
| EN-1 | 🔴 | v0.5.3 saves rejected on load — `COMPATIBLE_SAVE_VERSIONS` missed `0.5.3`; save made in the current build could never load (colony lost on refresh) | **fixed** | `2fa015d` — gate accepts current version; regression test pins `GAME_VERSION` ∈ compatible list for every future bump |
| EN-2 | 🟠 | `commands.validation.test.ts` sat in `src/` outside vitest's `tests/**` include — 3 regression tests (forge/trade validator parity) silently never ran | **fixed** | `2fa015d` — moved to `tests/`, imports fixed; knip unused-file flag cleared |
| EN-3 | 🟢 | Multi-select primary/array desync — when the selected primary died, `selectedEntityId` went null while `selectedEntityIds` kept the rest | **fixed** | `2fa015d` — `pruneStaleSelection` re-derives the primary from the filtered array |

---

## Batch EO — cadence audit: double ticks & redundant index builds (2026-08-15) **fixed**

**Origin:** tick-cadence audit (bug-hunter scan) for double-running / over-running systems. Host loop + all 4 layers verified clean (disjoint call sets, correct gates); two real issues found. Also: weather consequences (3.4) shipped as a feature, not a bug.

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| EO-1 | 🟡 | **Election gossip fired twice on ceremony day boundaries** — daily layer (`tickStaticDaily`) rolled `tickElectionGossip` every day AND the ceremony's tick gates (`tick % 18` / `% 24` in `tickElectionCeremony`) rolled again; since 72 % 18 = 0 and 72 % 24 = 0, the boundary tick got two gossip rolls during gossip/tension phases | **fixed** | daily layer skips gossip while `state.electionCeremony` is active (ceremony gates already cover it); regression `tests/electionGossip.dedup.test.ts` pins the call count (`4245c72`) |
| EO-2 | 🟠 | **Entity-by-type index built 3× per tick** — `gameTick` built `byType` twice (tick start + end-of-tick `state.entityByType`) plus `gameLoop` `catalog.rebuild(world.entities)` every tick; ~2,800 entities → O(3n) bucket churn/tick | **fixed** | per-world WeakMap keeps identity-stable buckets; no-change ticks (no births/deaths/type-changes) reuse the tick-start `byType` and the catalog rebuilds only on identity change (`0b5f397`); P0 GC forensics (`f8f01b4`) showed allocations are not the superlinear tail (forced gc() is slower), so this stays a modest safe win — see `docs/plans/2026-08-08-entity-capacity-perf-plan.md` §6 |

### bug-hunter scan artifacts (2026-08-15) — folded into EO, directory removed

The `.bug-hunter/` scan output (hunter-findings + referee verdicts, both **REAL BUG**) is folded into this batch so no bug lives outside the tracker:

| bugId | Sev | Finding | Verdict | Mapped to |
|-------|-----|---------|---------|-----------|
| BUG-1 | 🟡 Low | `tickElectionGossip` fires twice on day-boundary ticks during an election ceremony's gossip/tension phases (72 % 18 = 0 and 72 % 24 = 0; no once-per-day guard) — `villageLeadership.ts:706-710`, callers `tickLayerDaily.ts:258` + `tickElectionCeremony` | REAL BUG (conf 82) | **EO-1** (fixed `4245c72`) |
| BUG-2 | 🟠 Medium | Entity-by-type index (12+ bucket arrays) built 3×/tick on the main-thread path — `gameTick.ts:115` (layers), `gameTick.ts:270` (`state.entityByType`), `gameLoop.ts:606` (`catalog.rebuild`) | REAL BUG (conf 90) | **EO-2** (fixed `0b5f397`) |

`.bug-hunter/` (hunter-findings.json, referee.json, triage.json) deleted 2026-08-17 after folding — all findings live here.

---

## Batch EP — rivers read as rivers (2026-08-16) **fixed**

**Origin:** playtest feedback — rivers looked like thin 1-tile streams ("a river should take the whole tile, it should look like a real river"). Two real issues: the carve was mostly 1 tile wide with a bright centerline stroke on top, and two presets never spawned rivers at all.
**Files:** `terrainGen.ts` · `terrainLayer.ts` (bakeTerrainDecor)

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| EP-1 | 🟠 | **Rivers render as 1-tile threads with a thin bright "stream" stroke** — the carve claimed only low orthogonal neighbours (+0.05 above water level) so most channels were 1 tile wide, and `bakeTerrainDecor` drew a 3.5px blue vein + highlight over the water | **fixed** | channel claims low **orthogonal + diagonal** neighbours (+0.08 above water level) → whole-tile water band **3–5 tiles across** (wider at confluences); the thin strokes replaced by a single faint 2px depth line; painted atlas water + painted shores carry the look (`6671281`) |
| EP-2 | 🟠 | **Coastal & Riverlands presets never spawn rivers** — river sources required an absolute peak elevation > 70, but low-elevation presets max out around 55–70 (coastal avg ~60), so most seeds had zero rivers | **fixed** | peak threshold = `max(48, 70% of the preset's reachable elevation (bias × scale))` — coastal 6/8 seeds, riverlands 7/8, land presets 8/8 (`2e5a076`) |

**Verified:** headless sweep across 6 presets × 8 seeds — avg per-tile river width 2.4–3.6 tiles; `terrainGen.riverGeneration.test.ts` green; 150 tests, tsc, lint green. **New maps only** (world-gen carve).

---

## Batch EK — parallel big-file sim audit (2026-07-30) **fixed**

**Method:** explore agents on non-overlapping scopes (biggest files first).  
**Day length:** 72 ticks/day (`TICKS_PER_HOUR=3`).  
**Legend:** `fixed` | `open` | `info` · Sev 🔴 High · 🟠 Med · 🟡 Low · **Status:** all agent sections closed 2026-07-30

### Agents / scopes

| Agent | Files |
|-------|--------|
| EK-A | `groupEvents.ts`, `factionWander.ts` |
| EK-B | `buildingActions.ts`, `workforce.ts` |
| EK-C | `moonHowler.ts`, death paths, `saveLoad` migrate |
| EK-D | `frontierCombat.ts`, `tickLayerDaily.ts`, hunt slices |
| EK-E | `dayCycle.ts`, `dayCycleConstants.ts` |
| EK-F | `lifeSimulation.ts` (full) |
| EK-G | `gameTypes.ts` |

### Already fixed this session (do not re-open)

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| EK-FIX-1 | 🔴 | Ambient/visitor chat 3× spam after day stretch | **fixed** | `* PER_TICK_RATE_SCALE` |
| EK-FIX-2 | 🔴 | Off-screen human throttle still 8 ticks | **fixed** | 24 (= 8 clock hours) |
| EK-FIX-3 | 🔴 | Free-roam hunt any faction / flat food | **fixed** | player-only; hunter vs starve; deer>rabbit; valley mult |
| EK-FIX-4 | 🔴 | Hunting Spot first entity in array | **fixed** | closest prey; carcass mult |
| EK-FIX-5 | 🔴 | Visitor/rival poach tamed deer | **fixed** | `tamedBy == null` + `killWildGameForPoach` |
| EK-FIX-6 | 🔴 | Odd-id prey never fled (`tick+id)%2`) | **fixed** | flee every wildlife pulse |
| EK-FIX-7 | 🔴 | Tamed assist kills tamed stock | **fixed** | `isValidHuntPrey` |
| EK-FIX-8 | 🔴 | Exorcism every 2 **ticks** not hours | **fixed** | × `TICKS_PER_HOUR` |
| EK-FIX-9 | 🔴 | Priest death partial cleanup | **fixed** | `killHuman` |
| EK-FIX-10 | 🔴 | Failed outgoing raid never strike-back | **fixed** | queue before cooldown |
| EK-FIX-11 | 🟠 | Rebalance strips Barracks/Prison guards | **fixed** | exclude manual-staff donors |
| EK-FIX-12 | 🟠 | Hunt Spot kills when stores full | **fixed** | kill only if meat stored |
| EK-FIX-13 | 🟠 | Wildlife wander under-fires on systems layer | **fixed** | `1-(1-p)**step` |
| EK-FIX-14 | 🟠 | `markWildlifeDead` used undefined `state` | **fixed** | pass `tick` |
| EK-FIX-15 | 🟡 | `isNearResidence` only array scan | **fixed** | Map path |

---

### EK-A — groupEvents / factionWander (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-A1 | 🔴 | Refugee admit **spawns new** humans; does not convert camp; sterile `reproductionCooldown=9999` | **fixed** | Convert camp members; clear groupId/cooldown |
| EK-A2 | 🟠 | Turn-away only zeros `daysLeft`; visitors linger until daily tick |**fixed** | exclude isOnConstructionCrew + alive/pregnant gates  | despawn immediately |
| EK-A3 | 🟡 | Hunter talk says “today” but lasts whole visit |**fixed** | assignMissingWorkers on release  | copy or day gate |
| EK-A4 | 🟡 | `visitorGroups.find` per visitor wander tick |**fixed** | HuntingSpot (+ tavern/hotel) on priority lists  | pass group / Map |
| EK-A5 | 🟡 | Admitted settlers keep visitor `groupId` |**fixed** | skip daysLeft-- on start tick  | clear on convert |

---

### EK-B — buildingActions / workforce (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-B1 | 🔴 | Job assign can double-book **construction crew** | **fixed** | exclude construction crew + alive/pregnant |
| EK-B2 | 🟠 | `releasePrisoners` rehouses only — no restaff | **fixed** | + assignMissingWorkers |
| EK-B3 | 🟠 | Manual canAssign construction vs apply disagree (soft-steal) |**fixed** | markWildlifeDead on counter-attack  | align UI/action |
| EK-B4 | 🟠 | Duplicated workforce helpers in buildingActions drift |**fixed** | fear/courtship chat scaled  | omit Tavern/Hotel in local prio |
| EK-B5 | 🟠 | HuntingSpot lowest auto-job priority (missing from lists) | **fixed** | HuntingSpot + Tavern/Hotel on lists |
| EK-B6 | 🟡 | Cap uses `occupants.length` vs `homeBuildingId` (prisoners inflate) |**fixed** | leisure energy * PER_TICK_RATE_SCALE  | |
| EK-B7 | 🟡 | Manual pick skips alive/pregnant gates vs auto |**fixed** | partner relationshipStatus expecting  | |

---

### EK-C — moonHowler / save (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-C1 | 🔴 | Transform clears job/home then reassignment steals slots; dawn restore over-cap | **fixed** | cap-aware dawn restore + assignMissing after revert |
| EK-C2 | 🔴 | Prison sentence wiped on transform, not in saved state | **fixed** | prison fields in moonHowlerSaved; forceOutside never wipes unsaved |
| EK-C3 | 🟠 | New-curse path skips force-outside / sync occupants | **fixed** | forceOutside + syncResidenceOccupants on new curse |
| EK-C4 | 🟠 | Load mid-hunt doesn’t resync form to clock | **fixed** | syncMoonHowlerForms on load uses full-moon window; no double-transform |
| EK-C5 | 🟠 | Nested `moonHowlerSaved.pregnancyProgress` not scaled on day migrate | **fixed** | scale nested snapshot with day length |
| EK-C6 | 🟡 | Cure success no immediate residence sync | **fixed** | cap-aware cure revert + sync/assignMissing after rite |
| EK-C7 | 🟡 | UI “dawn cure” vs full-moon-night window | **fixed** | PopulationPanel + tame float: full-moon night 20:00–06:00 |

---

### EK-D — frontier / daily / hunt leftovers (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-D1 | 🟠 | Outgoing casualty log always “defending” | **fixed** | `applyRaidCasualties` mode `defending` \| `raiding` |
| EK-D2 | 🟠 | Incoming + counter-raid can both stay live | **fixed** | cancel pair on counter-march / resolve |
| EK-D3 | 🟠 | Immigration couple can overshoot pop cap; float always +1 | **fixed** | createImmigrantSettler maxMembers; float shows admitted count |
| EK-D4 | 🟠 | Festival burns a day on start tick | **fixed** | skip daysLeft-- on start tick |
| EK-D5 | 🟡 | Outgoing success: no player casualties; gold uncapped | **fixed (gold cap)** | victory casualties + clampRaidGoldGain soft/per-raid cap |
| EK-D6 | 🟡 | Dead hunt prey linger in entities until next tick | **fixed** | markWildlifeDead + byType splice on hunt kill |

---

### EK-E — dayCycle / housing (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-E1 | 🔴 | Married **16–17** treated as housing minors → couples can split | **fixed** | partnerId emancipates for housing |
| EK-E2 | 🔴 | Housing assign superlinear (counts × residences × passes) | **fixed** | occupancy map once per pass + occupancyMove |
| EK-E3 | 🟠 | Adoptive “adults” can be age 12–17 | **fixed** | `listVillageSingleAdults` ≥ HUMAN_ADULT_MIN_AGE |
| EK-E4 | 🟠 | Age ladders 12 / 16 / 18 / fertility disagree | **fixed** | doc table in dayCycle.ts; intentional multi-threshold (E1/E3 gates) |
| EK-E5 | 🟠 | `syncPartnerResidence` moves couple only, not kids | **fixed** | full household (minors only) |
| EK-E6 | 🟠 | Bastard custody: grandmother before living father | **fixed** | father before grandmothers in getChildCustodian / hasLivingNaturalCustodian |
| EK-E7 | 🟡 | `buildWorkTicks` name vs hour units trap | **fixed** | renamed `buildWorkHours` (+ deprecated alias) |
| EK-E8 | 🟡 | `getCalendarDay` hardcodes 360 | **fixed** | use DAYS_PER_YEAR |
| EK-E9 | 🟡 | Death doesn’t immediately orphan-reassign | **fixed** | `reassignOrphansAfterDeath` in `killHuman` |

---

### EK-F — lifeSimulation (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-F1 | 🔴 | **Pregnant settlers freeze** whole pregnancy (`continue` before move) | **fixed** | movement before continue; death reason childbirth vs exhaustion |
| EK-F2 | 🔴 | Off-screen visitors/rivals **eat colony food** | **fixed** | meals/energy off-screen = player only |
| EK-F3 | 🔴 | Scandal prison sentence 60–140 ticks (~1–2 days not 2.5–6) | **fixed** | `ticksForDays(3+rand*4)` |
| EK-F4 | 🔴 | Counter-attack kill predator skips `markWildlifeDead` / howler cleanup | **fixed** | markWildlifeDead on defend kill |
| EK-F5 | 🔴 | Wildlife repro chance not step-scaled (~3× births) | **fixed** | `1-(1-p)**step` |
| EK-F6 | 🟠 | Fear/courtship/affair chat chances still unscaled | **fixed** | fear + courtship chat scaled |
| EK-F7 | 🟠 | Courtship progress double-applied (both partners) | **fixed** | lower-id only applies rate |
| EK-F8 | 🟠 | Werewolf howl `% 140` broken for systems interval | **fixed** | pulse stagger: `pulse % period === id % period`, period ≈ 2h / systems interval |
| EK-F9 | 🟠 | Leisure energy regen unscaled (~3×) | **fixed** | leisure + * PER_TICK_RATE_SCALE |
| EK-F10 | 🟡 | Married conception doesn’t set partner `'expecting'` | **fixed** | partner status expecting |
| EK-F11 | 🟡 | Guard patrol / leisure slot periods not day-scaled | **fixed** | patrol * PER_TICK_RATE_SCALE; leisure 80 * TICKS_PER_HOUR |

---

### EK-G — gameTypes (**fixed**)

| # | Sev | Bug | Status | Notes |
|---|-----|-----|--------|-------|
| EK-G1 | 🔴 | **Mill** `maxOccupants: 2` but no `BUILDING_JOB_TYPES` | **fixed** | description: passive mill; builders only while building |
| EK-G2 | 🔴 | **Taming Post** max 1, no job, sprite = wolf.png | **fixed** | stump sprite; no permanent staff copy |
| EK-G3 | 🟠 | `maxOccupants` overloaded (beds/staff/builders) undocumented | **fixed** | JSDoc on BuildingConfig.maxOccupants |
| EK-G4 | 🟡 | Dead `JobType.Housewife` | **fixed** | removed unused enum + JOB_LABELS entry |
| EK-G5 | 🟡 | Mansion copy “up to 8” but upgrades to 12 | **fixed** | base 8 / upgrades |
| EK-G6 | 🟡 | Hospital “Passiveed” typo | **fixed** | Staffed wards |
| EK-G7 | 🟡 | HuntingSpot sprite casing fragile on Linux | **fixed** | lowercase `/sprites/huntingspot.png` + file rename |

---

### Priority fix order (ship-relevant)

1. **EK-F1** pregnant freeze  
2. **EK-F2** visitor food leak  
3. **EK-A1** refugee admit convert  
4. **EK-C1/C2** moon job/home/prison  
5. **EK-E1** married teen housing split  
6. **EK-F3/F5** prison length + wildlife repro  
7. **EK-G1/G2** Mill + Taming Post config truth  
8. **EK-B1** construction double-book  

### Playtest smoke after EK fixes

- [ ] Pregnant settler still walks / works  
- [ ] Off-screen camp does not drain food  
- [ ] Welcome refugees → camp size down, no sterile ghosts  
- [ ] Full-moon night → job reserved or clean reassign at dawn  
- [ ] Married 16–17 stay together  
- [ ] Mill either passive or staffable as advertised  

---


---

## Batch EJ — dual agent hunt (2026-07-30)

Sim agent + UI agent. Day length is **72 ticks/day** (`TICKS_PER_HOUR=3`).

| # | Sev | Bug | Status | Fix / notes |
|---|-----|-----|--------|-------------|
| EJ-1 | 🔴 | Election ceremony only advanced on **daily** layer while phases use **tick** durations (~96 colony days freeze) | **fixed** | `tickElectionCeremony` → `tickLayerRealtime` every tick |
| EJ-2 | 🔴 | Build hotkeys `1`–`9` used numeric indices + falsy `0` (House never selected; crash risk) | **fixed** | `hotkeys.ts` → real `BuildingType` strings; `!= null` check |
| EJ-3 | 🟠 | First-night banner treated `NIGHT_START` (hour 20) as tick | **fixed** | `getHourOfDay` / `isNightHour` in `App.tsx` |
| EJ-4 | 🟠 | Quick-start said night at tick 240 | **fixed** | Tutorial: 20:00 |
| EJ-5 | 🟠 | Shelter tip `NIGHT_START - 48` always true | **fixed** | hour ≥ 16 on day 1 |
| EJ-6 | 🟠 | Save migrate skipped `nextDepartureTick` / `caravanWaitTicks` | **fixed** | `migrateTickTimeline` scales trade routes |
| EJ-7 | 🟠 | Save migrate skipped `pregnancyProgress` | **fixed** | scale with day length; leave chat/combat ticks unscaled |
| EJ-8 | 🟡 | Courtship/affair rates not `PER_TICK_RATE_SCALE` (~3× calendar speed) | **fixed** | multiply by scale in `lifeSimulation` |
| EJ-9 | 🟡 | Research/weather/disaster VFX still systems-pulse denser (~3× calendar) | **fixed** | `PER_TICK_RATE_SCALE` research; `systemsPulsesFromLegacy` weather/disasters |
| EJ-10 | 🟡 | Village head UI “No head” while leader is Moon Howler form | **fixed** | `isActingVillageHead` + werewolf crown/minimap; tests |
| EJ-11 | 🟡 | Multi-day `isProductionTick` + weekend skip thins store/market | **fixed** | multi-day on calendar days; daily still weekdays; tests |
| EJ-12 | 🟢 | Hotel stay = full day from check-in (not morning checkout) | **fixed** | `hotelCheckoutTick` → next `NIGHT_END`; tests |

**Import cycles (not EJ):** EI-1..15 largely **fixed/mitigated** (see Batch EI) — residual risk is `gameEngine` barrel re-exports only; not a player ship gate.

**Playtest residual:** year-5 election ceremony live check · large-map session (see OPEN_PROBLEMS).

**Test debt:** cleared — `tickQueries.test.ts` (6); `spatialGrid.test.ts` layout reuse; `saveLoad.test.ts` runtime strip — **37/37** targeted spatial/tickQueries pass; full suite ~395/399 (4 pre-existing `dayCycle` dev-constant flakes)

---

## App.tsx (14)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | Big-news auto-dismiss timer (world.tick in deps) | fixed |
| 2 | 🔴 | Left-click pan triggers map selection | fixed |
| 3 | 🟠 | Human emoji `'human'` string | fixed |
| 4 | 🟠 | MiniMap useEffect thrashes every tick | fixed (ref deps + rAF /5) |
| 5 | 🟡 | Keyboard shortcuts fire in form controls | fixed (`isEditableTarget` guard) |
| 6 | 🟡 | Global key listeners detach/reattach on build mode | fixed (stable `useEffect([])` + refs) |
| 7 | 🟡 | villageStats useMemo useless | fixed (stats from `loop.subscribe` + catalog) |
| 8 | 🟡 | Canvas callbacks recreated every tick | fixed (`useCallback` + `worldRef` / stable deps) |
| 9 | 🟡 | showFirstNightWarning 2-day persistence | fixed (`tick < TICKS_PER_DAY * 2`) |
| 10 | 🟢 | z-25 invalid Tailwind | fixed (`ContextualTutorialCard` uses `z-30`) |
| 11 | 🟢 | Unused containerRef | fixed (removed) |
| 12 | 🟢 | BigNewsBanner filtered twice | fixed (`activeBigNews` pre-filter) |
| 13 | 🟢 | Click loops don't break early | fixed (building/entity hit tests `break` on first match) |
| 14 | 🟢 | hasPlacedHouse useMemo waste | fixed (`hasPlacedHouse` state from loop subscribe — sticky latch) |

## humanChat.ts / dialogue trees (11)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟠 | Adults speak child lines with juveniles | fixed (`housemateChatContext` → `child` for juveniles) |
| 2 | 🟠 | Self as housemate chat partner | fixed (`filter id !== entity.id`) |
| 3 | 🟡 | Chat-dot duplicate frame | fixed (`chatTicks` cleared to `undefined`, not `0`) |
| 4 | 🟡 | Empty housemates modulo crash | fixed (solo `home`/`child` dialogue when alone) |
| 5 | 🟡 | Phrase pools not data-driven | fixed (JSON dialogue trees + `wf_*` legacy migration) |
| 6 | 🟡 | 3-beat dialogue not advancing | fixed (`tickHumanChat` + `resolveChatPartner` in `lifeSimulation.ts`) |
| 7 | 🟡 | `foodLow` hint unused | fixed (`resolveDialogueCategories` + `food` context) |
| 8 | 🟢 | Election/marriage chat untested | fixed (`villageLeadership.test.ts`, `lifeSimulation.courtship.test.ts`) |
| 9 | 🟢 | `resetDialogueSessions` missing on load | fixed (`resetRendererCaches`) |
| 10 | 🟢 | Stale TECHNICAL.md “phrase pools” | fixed (dialogue-tree docs) |
| 11 | 🟢 | No fallback for unknown context | fixed (`pickDialogueTree` category fallback → `social`) |

## gameEngine.ts (12)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | Dead settlers assigned residences | fixed (`e.alive` filter) |
| 2 | 🔴 | Children in predators array | fixed (`!isJuvenile`) |
| 3 | 🟠 | Workshop "Need materials" when unstaffed | fixed ("Needs worker" branch) |
| 4 | 🟠 | transferWorkerBetweenBuildings crash | fixed (`if (!job) return`) |
| 5 | 🟠 | Dead rivals in predators | fixed (`.alive` filter) |
| 6 | 🟡 | getAdjacencyMultiplier re-scanned all buildings per building | fixed (`buildAdjacencyIndex` once per tick / estimate) |
| 7 | 🟡 | addBigNews ID collision | fixed (monotonic `bn_${seq}`; legacy id parse kept) |
| 8 | 🟡 | Wolf migration spawn energy | fixed (`spawnWolf` passes `SPECIES_CONFIG` spawnEnergy) |
| 9 | 🟡 | Immigrant spawn in building footprint | fixed (`findHumanSpawnNear` + `isValidHumanSpawnPosition`) |
| 10 | 🟢 | releasePrisoners undefined vs null | fixed (clears with `undefined`) |
| 11 | 🟢 | isNewCalendarDay on load align | fixed (preserve `lastProcessedCalendarDay` on load) |
| 12 | 🟢 | totalBuildingsCompleted rival buildings | fixed (saveLoad recount excludes rival) |

## dayCycle.ts (10)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟠 | rebuildChildrenIds nested full-list passes | fixed (Set-based single pass) |
| 2 | 🟠 | Lone-single scoring trap | fixed (housing overhaul) |
| 3 | 🟡 | setHumanBirthFromAge birthMonth stale | fixed (month derived from explicit `day`) |
| 4 | 🟡 | Children as singles-only | fixed (`forbidSinglesOnly`, `residenceHasMinorOccupants`) |
| 5 | 🟡 | Rivals/visitors in housing capacity | fixed (`listPlayerResidences`, `syncResidenceOccupants` `!faction`) |
| 6 | 🟡 | isProductionTick interval < 7 | fixed (requires `WORK_START` hour) |
| 7 | 🟢 | getBirthDateString undefined month | fixed (`birthMonth` fallback) |
| 8 | 🟢 | Dead villagers in orphan adoption | fixed (`livingHuman` filters) |
| 9 | 🟢 | Orphan adult-single priority | fixed (`pickOrphanResidence` skips singles-only; `pickRandomAdoptiveGuardian`) |
| 10 | 🟢 | Late eviction homeless 1 tick | fixed (`fillHomelessAfterEviction` in rebalance loop) |

## GameLoop.ts (10)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | applyCommand skips this.world | fixed (`syncAfterWorkerMutation` + command handler bind) |
| 2 | 🔴 | applyAction races worker ticks | fixed (`commandChain` serializes `sendCommand`) |
| 3 | 🟠 | setPaused(false) 60×/sec | fixed (`lastPausedSentToWorker`) |
| 4 | 🟠 | Duplicate React notifications | fixed (`notify(..., force=true)` on commands) |
| 5 | 🟠 | Save uses stale shadow | fixed (`exportAuthoritativeWorld` syncs worker before export) |
| 6 | 🟡 | Async callbacks after stop | fixed (`sessionGen` on subscribe microtask + command handlers) |
| 7 | 🟡 | workerEnabled stale init promise | fixed (enabled only after init + `running` check) |
| 8 | 🟡 | mutateWorld silent divergence | fixed (warns + reverts entities/buildings from worker) |
| 9 | 🟢 | draw() zero-size canvas | fixed (layout + `getBoundingClientRect` guards) |
| 10 | 🟢 | subscribe immediate recurse | fixed (deliver only when `running`) |

## spatialGrid.ts (17)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | NaN coordinates crash | fixed |
| 2 | 🟠 | Dead entities in queries | fixed (`!entity.alive` in findClosest) |
| 3 | 🟠 | Invariant false positives on death | fixed (stale dead vs orphan classification) |
| 4 | 🟠 | insert without remove duplicates | fixed (`remove` + `update`) |
| 5 | 🟡 | Query methods no alive re-check | fixed (alive filter in queries + neighbor cells) |
| 6 | 🟡 | validateInvariant slow on dense cells | fixed (single `seen` set pass) |
| 7 | 🟡 | Factory hides influence layer | fixed (`BuildSpatialGridOptions.withInfluenceLayer`) |
| 8 | 🟢 | Env-var only '0' disables | fixed (`envFlagDisabled` + worker host) |
| 9 | 🟢 | forEachNeighborCell no return | fixed (returns `boolean`; early `false` stops) |
| 10 | 🟢 | No incremental update | fixed (swap-pop remove, same-cell skip, end-tick rebuild removed) |
| 11 | 🔴 | `isReusableSpatialGrid` ignores `mapWidth`/`mapHeight`/`cellSize` | fixed (Batch AA — `matchesLayout` + `resolveSpatialGrid`) |
| 12 | 🔴 | `RoadAvoidanceIndex` reuse without layout match | fixed (Batch AA) |
| 13 | 🟠 | `syncTreeSimGrid` count stamp skips identity change | fixed (Batch AA) |
| 14 | 🟠 | `collectGrassInViewport` stale layout grid | fixed (Batch AA) |
| 15 | 🟡 | `forEachInRadius` records broad-phase candidates | fixed (Batch AB/AC — narrow-phase only) |
| 16 | 🟡 | `findClosestInRadius` records all broad-phase hits | fixed (Batch AC — predicate-pass only) |
| 17 | 🟡 | `isNearRoad` / `applyAvoidance` candidate before filter | fixed (Batch AB) |

## tickQueries.ts (11)

| # | Sev | Locatie | Bug / impact | Status |
|---|-----|---------|--------------|--------|
| 1 | 🔴 | `buildGrassPopulationSnapshot` + `recordGrassBirth` | `newEntities` grass in `baselineAlive`; caller `recordGrassBirth` double-counts → grass cap too high | fixed (Batch AB `baselineAlive`/`bornAfterSnapshot`; Batch AC `absorbedEntityIds` + `entityId` guard) |
| 2 | 🔴 | `buildWildlifePopulationSnapshot` + `recordWildlifeBirth` | `newEntities` wildlife in `aliveByType`; caller `recordWildlifeBirth` double-counts → wildlife overpopulation | fixed (Batch AB `aliveByType`; Batch AC `absorbedEntityIds` + `entityId` guard) |
| 3 | 🟠 | `findClosestEntityInRadius` fallback | `recordSpatialCandidate` inside `predicate` + shrinking `bestDistSq`; grid path counted all broad-phase candidates → A/B benchmark wrong | fixed (Batch AC — grid predicate-pass only; fallback all in-radius predicate passes) |
| 4 | 🟠 | `forEachEntityInRadius` fallback | Fallback narrow-phase only; grid broad-phase → candidate counts diverge; benchmark data worthless | fixed (Batch AB/AC — both narrow-phase `distSq <= radiusSq`) |
| 5 | 🟡 | `getHousemates` | No Human / `isPlayerHuman` check — tamed creature with `residenceBuildingId` could query human housemates | fixed (Batch AC) |
| 6 | 🟠 | `findClosestEntityInRadius` fallback | `recordSpatialCandidate` before radius check | fixed (Batch AB) |
| 7 | 🟠 | `forEachEntityInRadius` fallback | `recordSpatialCandidate` before radius check | fixed (Batch AB) |
| 8 | 🟡 | `findClosestEntityInRadius` / `forEachEntityInRadius` | Mismatched default `metricCategory` (`social` vs `hunt`) | fixed (Batch AB — required `metricCategory`) |
| 9 | 🟡 | `buildResidenceOccupantIndex` | Missing `EntityType.Human` + `isPlayerHuman` guard | fixed (Batch AB) |
| 10 | 🟠 | `pushNewEntity` → `recordGrassBirth` | Mid-tick grass spawn must pass `entity.id` to avoid absorbed double-count | fixed (Batch AC — `lifeSimulation.ts`) |
| 11 | 🟠 | `pushNewEntity` → `recordWildlifeBirth` | Mid-tick wildlife spawn must pass `entity.id` to avoid absorbed double-count | fixed (Batch AC — `lifeSimulation.ts`) |

## worldGen.ts (10)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | 180°/270° rotation corrupt | fixed |
| 2 | 🟠 | Predators spawn when prey low | fixed (preyHealthyForPredators gate) |
| 3 | 🟠 | Wildlife ring border clamp | fixed (margin + fallback spawn) |
| 4 | 🟠 | Wildlife counts stale at init | fixed (`computeWildlifeCounts` after spawn rings) |
| 5 | 🟡 | Human age vs birth fields | fixed (`ageYears` + `setHumanBirthFromAge` in `createEntity`) |
| 6 | 🟡 | Wildlife spawns ignore terrain | fixed (`isPassableWildlifePosition` on ring/grass/random) |
| 7 | 🟡 | Log throttle hides replenishment | fixed (grass-only log; wildlife/grass split hysteresis) |
| 8 | 🟢 | getAgeInYears ignores calendar | fixed (`computeHumanAgeYears` for humans) |
| 9 | 🟢 | Pregnant immigrants no father | fixed (`createImmigrantSettler` links `pregnantById`) |
| 10 | 🟢 | Missing nextEventLogId | fixed (`syncEventLogIdFromState` on load/gen) |

## populationGrowth.ts (15)

| # | Sev | Locatie | Bug / impact | Status |
|---|-----|---------|--------------|--------|
| 1 | 🟠 | `getPopulationGrowthReport` tone | Overcrowding tone `'good'` | fixed (`pop > beds` always `warn`) |
| 2 | 🟠 | `snapshotPopulation` beds | Rival houses counted as player beds | fixed (`faction !== 'rival'`) |
| 3 | 🟠 | `getPopulationGrowthReport` tone | Fragile string tone matching | fixed (boolean flags) |
| 4 | 🟡 | `getPopulationGrowthReport` headline | Overcrowding headline understates | fixed |
| 5 | 🟡 | `getPopulationGrowthReport` detail | Detail ignores bed bottleneck | fixed |
| 6 | 🟡 | `getPopulationGrowthReport` reasons | Reason warns future not current | fixed |
| 7 | 🟢 | `snapshotPopulation` | Single-pass scan within one call | fixed (internal snapshot) |
| 8 | 🟢 | `getPopulationGrowthReport` | No paused state in report | fixed |
| 9 | 🟢 | `getPopulationGrowthReport` reasons | Vague residence tip | fixed |
| 10 | 🟠 | `getPopulationGrowthReport` — `detail` | `state.paused` overwrites `detail` entirely; overcrowding/food in `reasons` but detail only says paused | fixed (Batch AE — `buildGrowthDetail`) |
| 11 | 🟡 | `getPopulationGrowthReport` — blocked branch | Hardcoded `"Houses raise immigration cap (+4 each)"` — mansion cap differs (`getResidenceCapacity` / beds-driven cap) | fixed (Batch AE — `formatHousingCapReason`) |
| 12 | 🟡 | `getOpenBedsFromPop` | External `pop` not validated — wrong caller pop (visitors/rivals) desyncs open beds | fixed (Batch AE — clamp inflated pop to live) |
| 13 | 🟡 | `snapshotPopulation` | `getPopulationGrowthReport` + `getOpenBeds` + `getTotalBeds` each rescan — **3× O(n)** per UI tick | fixed (Batch AE — per-tick `WeakMap` cache) |
| 14 | 🟠 | `getPopulationGrowthReport` — food check | `state.resources.food < 40` — missing key → `undefined < 40` false, no warning at 0 food | fixed (Batch AE — `getFoodAmount`) |
| 15 | 🟡 | `getPopulationGrowthReport` — `openSlots` | `cap - pop` without `Math.max(0, …)` — float cap rounding can yield negative/fractional slots in detail | fixed (Batch AE — `openCapSlots`) |

## lifeSimulation.ts (17)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | Same-tick siblings vanish | fixed (rebuildChildrenIds + newEntities) |
| 2 | 🔴 | Rival/visitor births → player | fixed (`isPlayerHuman` on birth) |
| 3 | 🔴 | Tamed animals move twice | fixed (single x+=) |
| 4 | 🟠 | Hunt dead prey | fixed (alive in predicate) |
| 5 | 🟠 | Flee dead werewolves | fixed (grid alive check) |
| 6 | 🟠 | Off-screen skip mortality | fixed (mortality before !active) |
| 7 | 🟠 | Conception randomized by hour | fixed (`isValidAffairConceptionSite` — daily gate, no hour on conception) |
| 8 | 🟡 | Prisoners keep house key | fixed (arrest clears residence occupants) |
| 9 | 🟡 | Only husbands divorced | fixed (wife/husband args by cheater gender) |
| 10 | 🟡 | Children hunt wildlife | fixed (`!entity.isJuvenile` on hunt) |
| 11 | 🟡 | Visitors run player romance | fixed (visitor early continue) |
| 12 | 🟡 | Dead wolves pack bonus | fixed (`other.alive` + `wildlifeDeathsThisTick`) |
| 13 | 🟢 | allHumans stale dead | fixed (`livingHumanAt` via `entityById` + alive guard) |
| 14 | 🟢 | Juvenile grow-up duplicated | fixed (`tryGraduateHumanChild` in dayCycle) |
| 15 | 🟢 | Same-tick newborns wildlife cap | fixed (wildlifeSpawnParent) |
| 16 | 🟢 | Grass on water/mountains | fixed (`isValidGrassTerrain` on spread; test) |
| 17 | 🟢 | Predators not untargeted on counter-kill | fixed (werewolf hunt clear) |

## renderer.ts (16)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🔴 | Storm/rain drew one canvas stroke per drop | fixed (single path + one stroke) |
| 2 | 🔴 | Marriage lines husbands-only | fixed (`id < partnerId`) |
| 3 | 🟠 | Module cache leak between sessions | fixed (`resetRendererCaches`) |
| 4 | 🟠 | Status badges re-scanned all schools per human | fixed (`buildHumanStatusIconContext` pre-indexes schools) |
| 5 | 🟠 | _time frame-rate dependent | fixed (`dt` from `performance.now()` in `renderGame`) |
| 6 | 🟠 | Name width cache ignores zoom | fixed (cache key includes `zoom` + `fontSize`) |
| 7 | 🟠 | Unsafe RenderSnapshot cast | fixed (`entityFromSoASlot` + filter null shims) |
| 8 | 🟡 | Grid edge off-by-one | fixed (viewport extent from anchored `sx0`/`sy0`) |
| 9 | 🟡 | juiceEffects in building loop | fixed (night glow skips non-glow building types) |
| 10 | 🟡 | drawSpeechBubble textBaseline leak | fixed (restore + `ctx.save`) |
| 11 | 🟡 | Stationary humans walk frames | fixed (`HUMAN_WALK_SPEED_THRESHOLD` 0.12 sim + render) |
| 12 | 🟡 | Weather particles ignore resize | fixed (regenerate particle field on canvas resize) |
| 13 | 🟢 | Unbounded name width cache | fixed (`NAME_WIDTH_CACHE_MAX` 512 LRU) |
| 14 | 🟢 | Terrain canvas not disposed | fixed (`disposeTerrainLayer` in `resetRendererCaches`) |
| 15 | 🟢 | Fragile alpha reset | fixed (`ctx.save`/`restore` around flash draw) |
| 16 | — | (reserved) | — |

## entityCounts.ts (3)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟠 | No human guard moon howler | fixed |
| 2 | 🟡 | Humans unnecessary isActiveMoonHowler | fixed |
| 3 | 🟢 | Unknown types silently skipped | fixed (`console.warn` on unknown type) |

## groupEvents.ts (4)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟠 | Visitors/rivals age and die | fixed (ageYears + maxAge years) |
| 2 | 🟡 | Yearly wildlife stats vs SPECIES_CONFIG | fixed (`recordYearlyStats` uses `state.wildlifeCounts`) |
| 3 | 🟡 | Faction maxAge in days | fixed |
| 4 | 🟢 | Raw spawn omit optional fields | fixed (`SPECIES_CONFIG.spawnEnergy` on deer/tree/grass/wolf) |

## viewState.ts (13)

| # | Sev | Locatie | Bug / impact | Status |
|---|-----|---------|--------------|--------|
| 1 | 🟠 | `updateView` | Float equality jitter | fixed (CAMERA_EPS + return same ref) |
| 2 | 🟡 | `resolveEntity` | Dead entity selections | fixed (`!entity?.alive` → null) |
| 3 | 🟡 | `normalizeCameraForSave` | Camera pan lost on save | fixed (target coords + load snap) |
| 4 | 🟢 | `createViewFromSave` | NaN camera | fixed (`isFiniteNumber`) |
| 5 | 🟢 | `mergeForSave` | Payload bloat | fixed (`pickWorldFieldsForSave` allow-list) |
| 6 | 🟡 | `sanitizeCamera` → `normalizeCameraFromSave` | Computes `x`/`y` with fallback chains but `normalizeCameraForSave` overwrites with `targetX`/`targetY` — wasted complexity | fixed (Batch AD — target-only sanitize) |
| 7 | 🟡 | `createViewFromSave` | `hoveredBuildingId` from `data.hoveredBuilding?.id` without `resolveBuilding` — ghost hover on deleted building | fixed (Batch AD — `resolveSelectionIds`) |
| 8 | 🟠 | `resolveEntity` | `world.entities.find` O(n) — slow save-load sanitization at 10k+ entities | fixed (Batch AD — `WeakMap` entity index) |
| 9 | 🟠 | `createViewFromSave` | `as Entity` / `as Building` assertions on untrusted save data — crash on malformed plain objects | fixed (Batch AD — `parseIdFromLegacyRecord`) |
| 10 | 🟡 | `createViewFromSave` `buildRotation` | `(data.buildRotation as 0\|90) === 90` fails for JSON string `"90"` → rotation lost | fixed (Batch AD — `parseBuildRotation`) |
| 11 | 🟡 | `clampCameraTarget` | Mutates `cam` in-place — side-effect if caller passes `view.camera` ref without spread | fixed (Batch AD — returns new `Camera`; `App.tsx` updated) |
| 12 | 🟠 | `mergeForSave` | Hardcodes `screenShake: 0`, transient arrays empty; overrides `activeEvent` | fixed (Batch AD — persist view + world transient fields) |
| 13 | 🟡 | `createViewFromSave` | `showTechTree`, `highlightedCampKey`, `selectedCampKey` hardcoded `false`/`null` | fixed (Batch AD — restore from save) |

## ecosystemPressure.ts (7)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟠 | grassGrowthMultiplier duplicate logic | fixed (shared `getGrassGrowthMultiplier` in grassEcology) |
| 2 | 🟠 | Wildkin grazing ignored | fixed (in demand calc) |
| 3 | 🟡 | countAlive 4× scans | fixed (`state.wildlifeCounts` for grazer totals) |
| 4 | 🟡 | Grazing demand arbitrary units | fixed (`grazerGrassEnergyDemandPerDay` + `GRAZER_METABOLISM`) |
| 5 | 🟡 | grassRecovery assumes all growing | fixed (`countGrowingGrass` — only sub-max energy patches regrow) |
| 6 | 🟢 | False-positive wolf advice | fixed (wolf hints gated on `pastureTight`; winter+abundant stays stable) |
| 7 | 🟢 | Threshold inconsistency | fixed (shared `pastureTight`/`pastureCritical` for level + advice) |

## gameTypes.ts (4)

| # | Sev | Bug | Status |
|---|-----|-----|--------|
| 1 | 🟡 | moonHowlerSaved omits residence | fixed (`residenceBuildingId` saved/restored in moonHowler.ts) |
| 2 | 🟡 | WEATHER_CONFIGS dead fields | fixed (`label`/`emoji`/`overlayAlpha` wired; GameHeader uses config) |
| 3 | 🟢 | WEREWOLF_TAME_LINES mutable alias | fixed (`readonly string[]` copy) |
| 4 | 🟢 | BuildingConfig.category loose string | fixed (`buildCatalog.ts` canonical; `category` removed from `BuildingConfig`) |

---

## Batch A — dayCycle / challenges / combat (8)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | dayCycle.ts | 🔴 | `getBirthDateString` treats `birthDay` as day-of-month (day-of-year) | fixed (`birthDay % 30 + 1`) |
| 2 | dayCycle.ts | 🔴 | `rebuildChildrenIds` ignores adoptive parent IDs | fixed |
| 3 | buildingRotation.ts | 🔴 | `isEntityOnBuilding` uses center coords vs top-left | fixed |
| 4 | buildingActions.ts | 🔴 | `buildStripPreview` valid on replace without placement check | fixed (`getPlaceBuildingFailureReason`) |
| 5 | challengeProgress.ts | 🟡 | `great_city` flips metric when pop drops after buildings met | fixed |
| 6 | defenseStructures.ts | 🟡 | `getBarracksGuardCount` counts imprisoned guards | fixed |
| 7 | contextualTutorial.ts | 🟡 | `first_birth` on same-tick dead newborn | fixed (birth log + living) |
| 8 | dayCycle.ts / gameEngine | 🟡 | `isFullMoonNight` year-wrap (dayInYear vs colony day) | fixed (`getColonyDay`) |

## Batch B — maintenance pass (22)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | humanSprites.ts | 🔴 | `ready` true before walk sheets load | fixed (`ready = false` until load) |
| 2 | gameEngine.ts | 🔴 | Festival `daysLeft` not decremented on start day boundary | fixed (always decrement on day tick) |
| 3 | forge.ts | 🔴 | Corrupt `activeOrder` jams forge queue | fixed (clear order + progress) |
| 4 | eventLogExport.ts | 🟡 | CSV newlines in `message` break rows | fixed (`escapeCsvField`) |
| 5 | frontierCombat.ts | 🟡 | `maybeQueueRaid` ignores `rival.population <= 0` | fixed |
| 6 | gameLoop.ts | 🟡 | `setSession`/`setWorld` import before worker ready | fixed (`queueWorkerImport`) |
| 7 | EventLogPanel.tsx | 🟡 | Shared `downloaded` flag; only .txt shows Saved | fixed (per-format state) |
| 8 | gameEngine.ts | 🟡 | `counts.humans` before immigration → challenge 1-tick late | fixed (recompute at challenge check) |
| 9 | gameEngine.ts | 🟡 | `SPECIES_CONFIG` uses imports below declaration (TDZ risk) | fixed (imports moved up) |
| 10 | frontierCombat.ts | 🟡 | `tickPendingRaidEvents` uses stale `state.buildings` | fixed (`updatedBuildings` arg) |
| 11 | juiceEffects.ts | 🟢 | Confetti in `deathParticles` (misleading name) | fixed (`pushTransientParticle` + documented pool) |
| 12 | factionWander.ts | 🟢 | `wanderByEntity` leaks for dead entities | fixed (`pruneFactionWanderStates`) |
| 13 | gameEngine.ts | 🟢 | Auto-repair flat 2 wood when 1 HP needed | fixed (1 wood when ≤1 HP gap) |
| 14 | focusHints.ts / forge.ts | 🟢 | Forge hints read stale `state.buildings` mid-tick | fixed (`FocusPanel` passes `worldRef` buildings) |
| 15 | groupEvents.ts | 🟢 | Peace tribute +35 food ignores storage cap | fixed (`addCappedResource` + float) |
| 16 | gameEngine.ts | 🟢 | `townHallFestivalCooldownUntilTick` never read/written in sim | fixed (cooldown on random fest start/end) |
| 17 | gameTypes.ts | 🟢 | `JobType.Housewife` unused in workforce | fixed (removed; EK-G4) |
| 18 | grassEcology - kopie.ts | 🟢 | Duplicate ecology file | fixed (deleted) |
| 19 | humanChat - kopie.ts | 🟢 | Duplicate chat file | fixed (deleted) |
| 20 | gameEngine.ts | 🟢 | Redundant `.alive` filter on `aliveEntities` predators | fixed |
| 21 | frontierCombat.ts | 🟢 | Light raid tier can roll 0 deaths | fixed (`[1, 1]`) |
| 22 | gameEngine.ts | 🟢 | `addBigNews` uses `performance.now()` (Node crash) | fixed (`Date.now` fallback) |

## Batch C — sim / UI integrity (20)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | lifeSimulation.ts | **Critical** | `atHome` used but never declared in `tickHumans` | fixed (declared early in loop iteration) |
| 2 | worldEvents.ts | **Critical** | Plague immunity `return` aborts entire `updateDisasters` | fixed (rollable types exclude plague) |
| 3 | lifeSimulation.ts | 🔴 | Dead humans not removed from building `occupants` (age/illness/exhaustion) | fixed (`finalizeHumanDeath`) |
| 4 | worldEvents.ts | 🔴 | Fire kills entities; no `syncEntityGrids` or occupant cleanup | fixed (`finalizeHumanDeath` on human kills) |
| 5 | PopulationPanel.tsx | 🟡 | Construction workers counted as idle | fixed (construction worker Set) |
| 6 | stats.ts + `worldGen.ts` | 🟡 | Year 0 initial wildlife counted as `animalBirths` | fixed (founding `birthYear: -1` in `createEntity`; init spawns skip `recordBirthYear`; `replenishDepletedWildlife` passes `recordBirthYear: true`) |
| 7 | townHall.ts | 🟡 | `getTownHallGovernanceEfficiency` ignores dead leader | fixed (`getVillageLeader`) |
| 8 | renderer.ts | 🟡 | Name label `"undefined Smith"` when `name` missing | fixed (safe display name + surname-only) |
| 9 | lifeSimulation.ts | 🟡 | `tryDivorceOnCaughtCheater` skips married paramour | fixed (paramour spouse divorce path) |
| 10 | stripRender.ts | 🟢 | `drawProceduralWallCorner` vs `cornerArms` rotation mismatch | fixed (uses exported `cornerArms`) |
| 11 | lifeSimulation.ts | 🟢 | Off-screen throttle still applies energy/death | info (intentional sim quirk) |
| 12 | villageLeadership.ts | 🟢 | `getElectionGatherTarget` non-null assertion on ceremony | fixed (guard + `getElectionGatherSite` fallback) |
| 13 | terrainGen.ts | 🟢 | `findCampSite` fixed 20px spiral step misses narrow sites | fixed (10px spiral step) |
| 14 | saveLoad.ts | 🟢 | Migration log dedup scans full event log every load | fixed (`appliedSaveMigrations`) |
| 15 | renderer.ts | 🟢 | `campLabel` not on `Building` type; labels skipped | fixed (already on `Building`; renderer draws) |
| 16 | militiaBalance - kopie.ts | info | Duplicate of `militiaBalance.ts` | fixed (deleted) |
| 17 | worldGen.ts | info | `replenishDepletedWildlife` log when only grass spawned | fixed (log only when wildlife spawned) |
| 18 | renderer.ts | info | `wParts` not cleared on clear-weather transition | fixed (explicit Clear branch) |
| 19 | lifeSimulation.ts | info | `allLivingHumans` no dedup guard | fixed (Map by id) |
| 20 | stats.ts | info | `deaths.animals` lacks `age > 0` filter (unlike humans) | fixed |

## Batch D — simBuffers / render SoA (17)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | simDelta.ts | **Critical** | `renderMetaBySlot` built from all `aliveNow` but render SoA only packs priority subset (max 1500) — slot indices misaligned on overflow | fixed (`packRenderMetaForPacked`) |
| 2 | entityTypeCodes.ts | 🔴 | Unknown type code `255` silently maps to `EntityType.Grass` — masks corruption | fixed (`UNKNOWN_ENTITY_TYPE_CODE`, `codeToEntityType` → null) |
| 3 | simDelta.ts | 🔴 | `applySimTickDelta` assigns nested state by reference — delta mutations leak back | fixed (`structuredClone` on extract/apply) |
| 4 | applyKinematics.ts | 🟡 | `chatTicks = reader.chatTicks(slot) \|\| undefined` treats `0` as falsy | fixed (`> 0` check) |
| 5 | entityRenderMeta.ts | 🟡 | `tamedBy` falls back to `-1` when `TAMED` flag set but meta missing | fixed (meta-only; no magic `-1`) |
| 6 | entityRenderMeta.ts | 🟡 | `combatTicks` falls back to `8` when `COMBAT` flag set but meta missing | fixed (defaults to `1` when flag set) |
| 7 | packRenderSoA.ts | 🟡 | Tail slots only clear `id` + `flags` | fixed (`clearRenderSlot` zeroes full stride) |
| 8 | renderBufferPool.ts | 🟡 | `release` does not validate returned buffer `byteLength` | fixed (realloc when too small) |
| 9 | renderSoAEntities.ts | 🟡 | Bucket cache key `(reader, tick)` insufficient | fixed (`reader.buffer` key + invalidate on error) |
| 10 | simDelta.ts | 🟡 | `syncCatalogEntitiesToWorld` shallow `Object.assign` | fixed (`applyCatalogPatch` + `skills` clone) |
| 11 | entityRenderMeta.ts | 🟢 | `residenceBuildingId` `0` falls back to `meta.homeBuildingId` | fixed (`residenceId > 0` only) |
| 12 | packRenderSoA.ts | 🟢 | `entityFlags`: `if (entity.tamedBy)` falsy check skips `tamedBy === 0` | fixed (`tamedBy != null`) |
| 13 | schema.ts / packRenderSoA.ts | 🟢 | `RENDER_HEADER.maxSlot` written but never read | fixed (`RenderSoAReaderV1.maxSlot`) |
| 14 | renderSoAReader.ts | 🟢 | Header validation ignores `byteLength` vs stride | fixed (`validateRenderBufferLayout`) |
| 15 | renderSoAReader.ts | 🟢 | Getters no slot bounds check | fixed (`slotInRange`) |
| 16 | simDelta.ts | 🟢 | `eventLogTail` hardcoded `slice(-40)` | fixed (`EVENT_LOG_DELTA_TAIL_MAX = 128`) |
| 17 | packRenderSoA.ts | 🟢 | `selectRenderEntities` overflow alloc + sort | fixed (reused scratch + top-k partition, sort k only) |

## Batch E — simWorker pipeline (15)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | gameWorker.ts | 🔴 | `tick` exception: acquired buffer never `release()` → pool starvation | fixed (`try/finally` + `releaseAcquiredBuffer`) |
| 2 | GameWorkerHost.ts | 🔴 | Invalid render reader: buffer not returned to worker | fixed (`returnRenderBuffer` on invalid reader) |
| 3 | GameWorkerHost.ts | 🟠 | `dispose()` drops `heldRenderBuffer` without safe return | fixed (drop locally; no transfer to terminating worker) |
| 4 | gameWorker.ts | 🟠 | `packAndPostTickResult` early return when `!world` | fixed (releases buffer before return) |
| 5 | gameWorker.ts | 🟠 | `command` catch: acquired buffer not released | fixed (`finally` / catch release) |
| 6 | GameWorkerHost.ts | 🟠 | `applySimTickDelta` on failed commands (`ok === false`) | fixed (skip apply when `ok === false`) |
| 7 | gameWorker.node.ts | 🟡 | Missing `addEventListener`/`removeEventListener` polyfill | fixed |
| 8 | gameWorker.ts | 🟡 | `packRenderSoA` throw without buffer release | fixed (subset of #1) |
| 9 | GameWorkerHost.ts | 🟡 | Listener attached after `readyPromise` — race | fixed (single listener + pending queue) |
| 10 | GameWorkerHost.ts | 🟡 | `syncWorld`/`importSave` full clone, no transferables | fixed (`queueFullWorldUpload` after `whenIdle`; postMessage clone) |
| 11 | GameWorkerHost.ts | 🟡 | `isGameWorkerEnabled` only checks `'0'` | fixed (`false`/`off`/`no`) |
| 12 | commands.ts | 🟡 | No command param validation | fixed (`isWorkerCommand`) |
| 13 | protocol.ts | 🟡 | `WORKER_PROTO` hardcoded, no negotiation | fixed (`isWorkerProto` on all messages; feature handshake on `ready`) |
| 14 | gameWorker.ts | 🟡 | `lastFocus` not reset on init/syncWorld | fixed (`resetWorkerSession`) |
| 15 | GameWorkerHost.ts | 🟡 | `heldRenderBuffer` stale after `importSave` | fixed (`releaseHeldRenderBuffer` + GameLoop clears readers) |

## Batch F — UI component audit (12)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | BlacksmithForgePanel.tsx | 🔴 | Order button `disabled={!canQueue && !active}` — active orders stay clickable (`canQueue` true while forging) | fixed (`disabled={active \|\| !canQueue}`) |
| 2 | BuildCatalogPanel.tsx | 🔴 | `hotkeys[type]` — `BuildingType` union indexed into `Record<string, string>` without typed map | fixed (`Partial<Record<BuildingType, string>>`) |
| 3 | BlacksmithForgePanel.tsx | 🔴 | Staffed check reads `b.occupants.length` without optional guard — crash if `occupants` missing at runtime | fixed (`occupants?.length ?? 0`) |
| 4 | BuildCatalogPanel.tsx | 🟠 | `BUILDING_CONFIGS[type]` used without guard — undefined config crashes on stale `BuildingType` | fixed (null guard + footer check) |
| 5 | GameHeader.tsx | 🟠 | `speedOptions.map` uses numeric speed as React `key` — duplicate speeds cause key collisions | fixed (`speed-${index}-${s}`) |
| 6 | CombatLogPanel.tsx | 🟠 | Combat stats derived via `.toLowerCase()` string matching (`includes('raid')`, etc.) — breaks on message edits/locale | fixed (`combatKind` + `summarizeCombatEvents`) |
| 7 | ContextualTutorialCard.tsx | 🟠 | `tip.action!` non-null assertion inside onClick despite outer guard — fragile on refactor | fixed (local `action` binding) |
| 8 | ChallengesPanel.tsx | 🟢 | Progress bar color hardcoded to challenge id `'eco_master'` — silent styling break on rename | fixed (`progress.tone` from `challengeProgress`) |
| 9 | GameMenu.tsx | 🟢 | `createPortal(menuPanel, document.body)` assumes `document.body` exists — SSR/test crash | fixed (`portalRoot` state guard) |
| 10 | FrontierPanel.tsx | 🟢 | `pendingRaids[0]` destructured three times for `CombatPreviewPanel` — fragile if array mutates | fixed (`firstPendingRaid` const) |
| 11 | BuildCatalogPanel.tsx | 🟢 | Category `useEffect` only syncs when `selected` truthy — stale tab after cancel + hotkey | fixed (reset to default category on deselect) |
| 12 | GameHeader.tsx | 🟢 | `foodLow` computed locally (`< 20`) while `foodCritical` is a prop — duplicate food-alert thresholds | fixed (`isFoodAlert` in `resourceUtils`, single `foodAlert` prop) |

## Batch G — maintenance pass (10)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | gameEngine.ts | 🟡 | `addBigNews` ID collision on rapid same-tick inserts / hot reload | fixed (`bn_${seq}` monotonic) |
| 2 | groupEvents.ts | 🟡 | `wolf_migration` spawns wolves at default energy (not `spawnEnergy`) | fixed |
| 3 | lifeSimulation.ts | 🟢 | `allHumans.find` returns corpses after same-tick deaths | fixed (`livingHumanAt`) |
| 4 | dayCycle.ts + lifeSimulation.ts | 🟢 | Juvenile grow-up duplicated across age sync + tick | fixed (`tryGraduateHumanChild`) |
| 5 | humanChat.ts | 🟡 | Chat-dot duplicate frame when bubble expires | fixed (`chatTicks = undefined`) |
| 6 | App.tsx | 🟢 | `hasPlacedHouse` scans all buildings every React render | fixed (ref latch) |
| 7 | App.tsx | 🟢 | z-25 invalid Tailwind class | fixed (already `z-30` in tutorial card) |
| 8 | ecosystemPressure.ts | 🟠 | `grassGrowthMultiplier` duplicate logic | fixed (delegates to grassEcology) |
| 9 | gameTypes.ts | 🟢 | `WEREWOLF_TAME_LINES` mutable alias of cure lines | fixed (`readonly string[]`) |
| 10 | moonHowler.ts | 🟡 | `moonHowlerSaved` omits residence on transform | fixed (verified + typed) |

## Batch H — renderer pass (9)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | renderer.ts | 🟠 | Status badges re-scanned all schools per human | fixed (pre-indexed `childSchoolById`) |
| 2 | renderer.ts | 🟠 | SoA shim `get(slot)!` unsafe non-null | fixed (`entityFromSoASlot` filter) |
| 3 | renderer.ts | 🟡 | Grid viewport edge misses last line at bounds | fixed (anchored ceil extent) |
| 4 | renderer.ts | 🟡 | Night glow iterates all buildings | fixed (HOME/STAFFED type prefilter) |
| 5 | renderer.ts + humanSprites.ts | 🟡 | Stationary settlers show walk frames | fixed (`HUMAN_WALK_SPEED_THRESHOLD`) |
| 6 | renderer.ts | 🟢 | `resetRendererCaches` leaks terrain surface | fixed (`disposeTerrainLayer`) |
| 7 | renderer.ts | 🟢 | Flash draw leaves `globalAlpha` dirty | fixed (`save`/`restore`) |
| 8 | renderer.ts | 🟠 | `_time` tied to frame count | fixed (wall-clock `dt`) |
| 9 | renderer.ts | 🟢 | Name width cache unbounded / zoom | fixed (LRU cap + zoom in key) |

## Batch I — marriage integrity + pairwise hotspots (9)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `dayCycle.ts` + `lifeSimulation.ts` + `frontierCombat.ts` + `worldEvents.ts` | 🔴 | Human deaths set `alive = false` without clearing the survivor's `partnerId` / `relationshipStatus` — married settler could reference a dead spouse (`assertSimInvariants`: `human N married partner M missing or dead`) | fixed (`killHuman` → `finalizeHumanDeath`: clears `partnerId`, sets `single` or `expecting` if pregnant; wired through illness, exhaustion, childbirth, predator kill, raid defense, plague/disaster) |
| 2 | `moonHowler.ts` + `lifeSimulation.ts` + `simInvariants.ts` | 🔴 | `syncMoonHowlerForms` / `transformToWerewolfForm` changes cursed spouse `type` to `EntityType.Werewolf` while `partnerId` stays set — `livingHumanAt` and `assertSimInvariants` only accepted `EntityType.Human`, so EOD day 29 of seed-42 social sim failed even though spouse id 120 was alive as a werewolf (`partnerId: 20` preserved in `moonHowlerSaved`) | fixed (`isSettlerRelationshipEntity`: human **or** cursed werewolf form; used in `livingHumanAt`, `resolveChatPartner`, `assertSimInvariants`) |
| 3 | `lifeSimulation.social.integration.test.ts` | 🟡 | Fixture hardcoded ids `20` / `120` / `121` collided with `initGame` auto-spawn ids (e.g. **tree id 120** at `nextEntityId` progression) — duplicate `id` rows in `state.entities`; partner lookup and invariant checks ambiguous | fixed (lovers/spouses allocated via `state.nextEntityId++` after stripping default humans; pin map uses dynamic ids) |
| 4 | `tickQueries.ts` + `lifeSimulation.ts` | 🟠 | Evening housemate chat: `playerHumans.filter` per settler arriving home | fixed (`buildResidenceOccupantIndex` once per `tickHumans` + `getHousemates`) |
| 5 | `tickQueries.ts` + `lifeSimulation.ts` | 🟠 | Courtship partner pick, affair paramour pick, idle socialize: full human list filter/sort per eligible settler | fixed (`findClosestEntityInRadius` on `mobileGrid`; affair site helpers use `entityById` / `buildingById` maps) |
| 6 | `spatialGrid.ts` + `lifeSimulation.ts` | 🟠 | Wildlife road avoidance + human road-speed boost: `roadBuildings.some(...)` per entity per tick | fixed (`RoadAvoidanceIndex` built once per `tickWildlife`; `isNearRoad` + `applyAvoidance`; shared on `TickContext`) |
| 7 | `tickQueries.ts` + `lifeSimulation.ts` | 🟡 | Wildlife mate search + same-type population cap: `byType.filter` per reproducing animal | fixed (`buildWildlifePopulationSnapshot` + `recordWildlifeBirth`; mate via `findClosestEntityInRadius`) |
| 8 | `tickQueries.ts` + `lifeSimulation.ts` | 🟡 | Idle tree wander + grass reproduction cap: linear scan all trees / all grass per entity | fixed (`buildTreeGrid` once per `tickHumans`; `buildGrassPopulationSnapshot` + `recordGrassBirth` / `recordGrassDeath`) |
| 9 | `gameEngine.ts` | 🟢 | `syncMobileSimGrid` allocated a fresh `EntitySpatialGrid` every tick | fixed (reuse `state.mobileGrid` when `USE_SPATIAL_GRID`) |

**Tests added/updated:** `lifeSimulation.mortality.test.ts` (widow on `killHuman`), `moonHowler.test.ts` (`isSettlerRelationshipEntity`), `lifeSimulation.affair.test.ts` / `reproduction.test.ts` (entity maps), `lifeSimulation.social.integration.test.ts` (30-day seed 42 green).

## Batch J — check-work follow-ups (3)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `dayCycle.ts` + `lifeSimulation.ts` | 🟠 | `killHuman` rejected `EntityType.Werewolf` — cursed settlers dying in `tickWildlife` (old age / starvation) skipped widow cleanup | fixed (`isKillableSettlerEntity`; `markWildlifeDead` → `killHuman` in wildlife tick) |
| 2 | `src/test/**` (7 files) | 🟡 | `npm run test:types` (`tsc -p tsconfig.vitest.json`) — 17 TS errors in test infrastructure (stale mocks: `Camera`, `GameEventLog`, `RivalSettlement`, `SimulationFocus`, `ResearchNode`, `WorldMap.rivers`, `OffscreenCanvas` polyfill, `GameLoop` private fields) | fixed |
| 3 | `CHANGELOG.md` | 🟢 | Listed nonexistent `recordWildlifeDeath` in `tickQueries.ts` | fixed (docs only; implementation has `recordWildlifeBirth` only) |

## Batch K — Renffr omen renderer + chatter hygiene (6)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `renffrStar.ts` `drawRenffrOmen` | 🔴 | Extra `ctx.restore()` when `phase >= 1` — canvas state stack underflow corrupts renderer | fixed (single outer `save`/`restore` for letter block + subtitle; per-letter nested save/restore only) |
| 2 | `renffrStar.ts` `drawRenffrOmen` | 🔴 | Subtitle drawn after letter-loop `restore` — `font` / `fillStyle` / `shadowBlur` leak to caller | fixed (subtitle inside outer save/restore, before final `restore`) |
| 3 | `renffrStar.ts` `drawRenffrOmen` | 🟡 | Subtitle not centered — `textAlign` reset to `'start'` before subtitle draw | fixed (same as #2 — `textAlign: 'center'` still active for subtitle) |
| 4 | `renffrStar.ts` + `groupEvents.ts` | 🟡 | `isPlayerHuman(e)` name implies player character; implementation is colony human (`faction !== visitor/rival`) | fixed (JSDoc on `isPlayerHuman`; `beginRenffrSettlerChatter` uses filter only — drops redundant `EntityType.Human` check) |
| 5 | `renffrStar.ts` | 🟢 | `maybeTriggerRenffrOmen` + scatter used `Math.random()` — non-deterministic for replay/seeded worlds | fixed (`renffrRng(state, salt)` mulberry32 from `seed`+`tick`; `scatterUnit` for letter velocities) |
| 6 | `renffrStar.ts` | 🟢 | `shuffleHumans` generic Fisher-Yates with misleading domain name | fixed (renamed `shuffleArray(items, rng)`) |

**Tests added/updated:** `renffrStar.test.ts` — canvas stack balance, subtitle state leak, visitor/rival exclusion, deterministic trigger + scatter.

## Batch R — Renffr omen audit (NL report, cross-ref Batch K) (6)

**Status:** all **fixed** (implemented Batch K; code verified `renffrStar.ts` 2026-07-08). Logged as NL audit trail — not additional open bugs.

| # | Location | Issue | Sev | Fix | Status |
|---|----------|-------|-----|-----|--------|
| 1 | `drawRenffrOmen`, ~L192 | Extra `ctx.restore()` when `phase >= 1` — one `save()` (letters) but two `restore()` calls (after letter-loop + at end) → canvas state stack underflow, corrupt renderer | 🔴 | Remove trailing `restore()` on ~L192, **or** move subtitle block before letter-loop `restore()` (~L185) | fixed (Batch K #1 — single outer save/restore; subtitle before final restore) |
| 2 | `drawRenffrOmen`, subtitle block | Canvas state leak: subtitle (`…the higher gods, probably`) drawn **after** letter-loop `restore()` — `font`, `fillStyle`, `shadowBlur` not reset, leak to caller | 🔴 | Move subtitle block **before** letter-loop `restore()`, inside same save/restore | fixed (Batch K #2 — L233–239 inside outer save, L241 one restore) |
| 3 | `drawRenffrOmen`, subtitle block | Subtitle not centered: outside save/restore, `textAlign` already reset to `'start'` — text runs right from `cw*0.5` | 🟡 | Same as #2 — draw subtitle while `textAlign: 'center'` still active | fixed (Batch K #3) |
| 4 | `beginRenffrSettlerChatter` | `isPlayerHuman(e)` name suggests “is the player a human” vs “is this entity a colony human”; wrong mental model if implementation checks game player flag | 🟡 | Rename to `isHumanPlayer(e)` **or** verify `groupEvents` implementation | fixed (Batch K #4 — JSDoc clarifies `faction !== visitor/rival`; filter correct) |
| 5 | `maybeTriggerRenffrOmen` | `Math.random()` for trigger chance (`0.00035`) and shuffle — breaks replay/seed determinism | 🟢 | Use game seeded RNG | fixed (Batch K #5 — `renffrRng(state, salt)` mulberry32 from `seed`+`tick`) |
| 6 | `shuffleHumans` | Generic Fisher-Yates wrapper with domain-specific name — no real human logic | 🟢 | Rename to `shuffleArray` or use existing utility | fixed (Batch K #6 — `shuffleArray(items, rng)`) |

## Batch L — save / auto-save / load (6)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `App.tsx` `handleSave` | 🔴 | Manual save no-op when `loopRef` null or `exportAuthoritativeWorld` hung — no toast | fixed (`persistCurrentGame` falls back to `worldRef`; worker export timeout; error toasts) |
| 2 | `App.tsx` auto-save | 🔴 | Auto-save skipped while paused — players often pause to use menu | fixed (removed paused gate; still respects `autoSave` toggle) |
| 3 | `App.tsx` + `GameMenu` | 🟠 | Auto-save wrote disk but `hasSavedGame` stayed false — Load disabled until manual save | fixed (`setHasSavedGame(true)` on any successful persist; `hasSave()` OR state for Load button) |
| 4 | `App.tsx` `handleLoad` | 🟡 | Failed load silent — no user feedback | fixed (error toast; distinguishes missing vs corrupt save) |
| 5 | `gameLoop.ts` + `GameWorkerHost.ts` | 🟡 | Worker save could hang on `whenIdle` / concurrent `exportSave` | fixed (10s timeout + fallback shadow; `isIdle` includes `pendingExport`) |
| 6 | `saveLoad.ts` | 🟢 | Runtime `mobileGrid` / `entityByType` on world could break JSON stringify | fixed (`stripRuntimeWorldFields` before persist) |

**Tests added:** `saveLoad.test.ts` — round-trip + runtime field strip. **UX:** Ctrl+S / Cmd+S manual save.

## Batch M — spatial grid structuredClone (4)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `spatialGrid.ts` `syncMobileSimGrid` | 🔴 | `structuredClone` leaves truthy plain-object `mobileGrid` without `rebuild` — 10-year sim crash tick 2+ | fixed (`isReusableSpatialGrid`; allocate fresh grid when stale) |
| 2 | `spatialGrid.ts` `syncGrassRenderGrid` | 🔴 | Same stale-clone reuse path for grass render index | fixed (same guard) |
| 3 | `gameEngine.ts` | 🟠 | Tick start reused `state.grassGrid` without checking live class methods | fixed (`state.grassGrid?.rebuild` gate before reuse) |
| 4 | `simulate-10year.ts` `shallowCloneWorld` | 🟢 | Shallow spread carried stale runtime grid refs into spawn helpers | fixed (clear `mobileGrid`, `grassGrid`, `scentGrid`, `entityByType`) |

**Tests added:** `spatialGrid.test.ts` — structuredClone recovery (mobile + grass). **Smoke:** `SIM_MAX_TICKS=200` 10-year main-thread PASS.

**Note (Batch AA):** M #1–#3 fixed `structuredClone` / `?.rebuild` only — **not** map layout (`mapWidth`/`mapHeight`/`cellSize`). See Batch AA.

## Batch AA — spatial grid layout reuse (7)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `spatialGrid.ts` | 🔴 | `isReusableSpatialGrid` reused grid without matching `mapWidth`/`mapHeight`/`cellSize` | fixed |
| 2 | `gameEngine.ts` L1241–1246 | 🔴 | Grass grid bypasses sync helper; reuses on `?.rebuild` only | fixed |
| 3 | `spatialGrid.ts` `RoadAvoidanceIndex` | 🔴 | Reuse keyed on road count; no `mapWidth`/`mapHeight` | fixed |
| 4 | `spatialGrid.ts` `syncTreeSimGrid` | 🟠 | Count-only stamp skips rebuild when tree identity changes but count unchanged | fixed |
| 5 | `spatialGrid.ts` `collectGrassInViewport` | 🟠 | Uses `grassGrid` without layout validation | fixed |
| 6 | `saveLoad.ts` | 🟡 | `stripRuntimeWorldFields` omits `treeGrid`, `roadAvoidance`, stamps | fixed |
| 7 | `lifeSimulation.ts` | 🟡 | `syncSpatialGridEntity` never updates `treeGrid` | fixed |

## Batch AB — tickQueries population + spatial metrics (9)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `tickQueries.ts` | 🔴 | Grass snapshot + `recordGrassBirth` double-count risk | fixed (`baselineAlive` / `bornAfterSnapshot`) |
| 2 | `tickQueries.ts` | 🔴 | Wildlife snapshot + `recordWildlifeBirth` double-count in `newByType` | fixed (newEntities → `aliveByType`) |
| 3 | `tickQueries.ts` | 🟠 | Fallback `findClosest` records candidates before radius check | fixed |
| 4 | `tickQueries.ts` | 🟠 | Fallback `forEach` records candidates before radius check | fixed |
| 5 | `tickQueries.ts` | 🟡 | Mismatched default metric categories (`social` vs `hunt`) | fixed (required `metricCategory`) |
| 6 | `tickQueries.ts` | 🟡 | `buildResidenceOccupantIndex` missing Human type guard | fixed |
| 7 | `spatialGrid.ts` | 🟡 | `forEachInRadius` records candidates outside radius | fixed |
| 8 | `spatialGrid.ts` | 🟡 | `isNearRoad` records candidates before AABB hit | fixed |
| 9 | `spatialGrid.ts` | 🟡 | `applyAvoidance` records candidates before distance filter | fixed |

## Batch AC — tickQueries metrics parity + population guards (5)

*User table labeled `entityUtils` — implemented in `tickQueries.ts` + `spatialGrid.ts` + `lifeSimulation.ts` (`pushNewEntity`).*

| # | File | Locatie | Bug / logica-fout | Impact | Status |
|---|------|---------|-------------------|--------|--------|
| 1 | `tickQueries.ts` + `spatialGrid.ts` | `findClosestEntityInRadius` fallback | `recordSpatialCandidate` inside `predicate` + shrinking `bestDistSq`; grid path counted all broad-phase candidates regardless of predicate/distance | Grid vs fallback metrics incomparable; A/B benchmark wrong conclusions | fixed |
| 2 | `tickQueries.ts` + `spatialGrid.ts` | `forEachEntityInRadius` fallback | Fallback narrow-phase only (`distSq <= radiusSq`); grid counted broad-phase (all entities in overlapping cells) | Candidate counts diverge; benchmark data worthless | fixed |
| 3 | `tickQueries.ts` | `buildGrassPopulationSnapshot` + `recordGrassBirth` | `newEntities` grass in `baselineAlive`; no guard if caller also `recordGrassBirth` for same `newEntities` | Grass cap can still run too high; silent repro bug | fixed (`absorbedEntityIds`; `pushNewEntity` passes `entity.id`) |
| 4 | `tickQueries.ts` | `buildWildlifePopulationSnapshot` + `recordWildlifeBirth` | `newEntities` wildlife in `aliveByType`; no guard if caller also `recordWildlifeBirth` for same entities | Wildlife cap too high; overpopulation possible | fixed (`absorbedEntityIds`; `pushNewEntity` passes `entity.id`) |
| 5 | `tickQueries.ts` | `getHousemates` | No type check on `entity` — non-human with `residenceBuildingId` can query human housemates | Unintended behavior for tamed creatures with residence | fixed (`EntityType.Human` + `isPlayerHuman`) |

**Tests:** `tickQueries.test.ts` (6) — absorbed-id guards, grid/fallback metrics parity, `getHousemates` type check. **Commit:** `b5b6bd0`.

## Batch AD — viewState save/load + camera (8)

*User table labeled `view` — file `app/src/game/viewState.ts`; load path also touches `saveLoad.ts`.*

| # | File | Locatie | Bug / logica-fout | Impact | Status |
|---|------|---------|-------------------|--------|--------|
| 1 | `viewState.ts` | `sanitizeCamera` → `normalizeCameraFromSave` | `sanitizeCamera` computes `x`/`y` with complex fallback chains; `normalizeCameraForSave` overwrites them with `targetX`/`targetY` — calculation fully wasted | Unnecessary complexity; `sanitizeCamera` can simplify to target coords + clamp only | fixed |
| 2 | `viewState.ts` | `createViewFromSave` | `hoveredBuildingId` from `data.hoveredBuilding?.id` without validation against `world.buildings` | Can point at removed building; UI shows ghost hover | fixed |
| 3 | `viewState.ts` | `resolveEntity` | `world.entities.find((e) => e.id === id)` — O(n) linear scan | Save-load + view sanitization slow at 10k+ entities; should use `Map<number, Entity>` | fixed |
| 4 | `viewState.ts` | `createViewFromSave` (multiple lines) | `data.selectedEntity as Entity`, `data.selectedBuilding as Building`, etc. — type assertions on untrusted save data | Runtime crash if save contains plain object without expected shape; unsafe deserialization | fixed |
| 5 | `viewState.ts` | `createViewFromSave` — `buildRotation` | `(data.buildRotation as 0 \| 90) === 90` — JSON string `"90"` makes `"90" === 90` false → `0` | Rotation state lost on save/load when value serialized as string | fixed |
| 6 | `viewState.ts` | `clampCameraTarget` | Mutates `cam` in-place (`cam.targetX = ...`) | Side-effect bug if caller passes original `view.camera` ref without spread (`App.tsx` L522/802/814/924) | fixed |
| 7 | `viewState.ts` + `saveLoad.ts` | `mergeForSave` | `screenShake`, `deathParticles`, `floatingTexts`, `notifications`, `disasters`, `activeEvent` hardcoded empty/0 | Full state loss on save/load; shake gone, particles vanished; `activeEvent` from world overwritten | fixed |
| 8 | `viewState.ts` | `createViewFromSave` | `showTechTree`, `highlightedCampKey`, `selectedCampKey` hardcoded `false`/`null`; never restored from save | Player loses tech tree open state and camp selection on load | fixed |

**Tests:** `viewState.test.ts` (13) — `parseBuildRotation`, `clampCameraTarget` immutability, ghost hover, merge round-trip, UI state restore.

## Batch AE — populationGrowth report + scan hygiene (6)

| # | File | Locatie | Bug / logica-fout | Impact | Status |
|---|------|---------|-------------------|--------|--------|
| 1 | `populationGrowth.ts` | `getPopulationGrowthReport` — `detail` | `state.paused` overwrites `detail` string; concurrent overcrowding/food warnings only appear in `reasons` | UI mismatch — detail says growth frozen while housing/food crisis hidden | fixed |
| 2 | `populationGrowth.ts` | `getPopulationGrowthReport` — blocked branch | Hardcoded `"Houses raise immigration cap (+4 each)"` while cap uses `getResidenceCapacity` (mansion ≠ house) | Misleading copy — player thinks mansion also +4 cap | fixed |
| 3 | `populationGrowth.ts` | `getOpenBedsFromPop` | Takes `pop` externally without validation against live player population | Silent desync if caller passes visitors/rivals-inclusive count | fixed |
| 4 | `populationGrowth.ts` | `snapshotPopulation` | Full entity/building scan per call; panel calls report + open beds + total beds separately | 3× O(n) CPU per UI refresh on large worlds | fixed |
| 5 | `populationGrowth.ts` | `getPopulationGrowthReport` — food check | `state.resources.food < 40` — missing `food` key → no warning | Immigration looks fine at 0 food; hunger not signaled | fixed |
| 6 | `populationGrowth.ts` | `getPopulationGrowthReport` — `openSlots` | `const openSlots = cap - pop` without `Math.max(0, …)` | Negative/fractional slots in detail (`-0.3 slots until cap`) | fixed |

**Tests:** `populationGrowth.test.ts` (13) — paused+overcrowded detail, food missing, mansion cap copy, fractional cap, inflated pop, snapshot cache.

## Batch AF — simWorker command/tick hardening (10)

| # | File | Locatie | Bug / logica-fout | Impact | Status |
|---|------|---------|-------------------|--------|--------|
| 1 | `commands.ts` | `validateWorkerCommandShape` | `startResearch`/`establishTradeRoute` shared `researchId ?? routeId` validation | Wrong commands pass validation; worker applies wrong op | fixed |
| 2 | `commands.ts` | `extractCommandDelta` | No `headless: true` — packed render meta per command | O(n) render packing lag on every command | fixed |
| 3 | `gameWorker.ts` | `tick` case | `gameTick` before pack; failure leaves world 1 tick ahead | Main thread desync without delta | fixed (`extractSimPrep` rollback) |
| 4 | `gameWorker.ts` | `command` catch | Partial mutation on throw; corrupt world kept | Cascade failures on later ticks/commands | fixed (`applySimPrep` rollback) |
| 5 | `gameWorker.ts` | `command` catch | `extractCommandDelta` throw → generic `error` not `commandResult` | Host promise reject without structured failure | fixed (`safeExtractCommandDelta`) |
| 6 | `GameWorkerHost.ts` | `requestTick` | `ticksInFlight++` before `postMessage` | Counter leak on terminated worker → pipeline stall | fixed |
| 7 | `GameWorkerHost.ts` | `init` | `window.setTimeout` — fails in Node/test without jsdom | `ReferenceError` on worker init | fixed (`globalThis.setTimeout`) |
| 8 | `GameWorkerHost.ts` | `handleMessage` `error` | Always decrements `ticksInFlight` | Command/export errors skew pipeline depth | fixed (`error.source === 'tick'`) |
| 9 | `simPrep.ts` | `extractSimPrep` | `electionCeremony` not shallow-cloned | Shared mutable ref main ↔ worker | fixed |
| 10 | `gameWorker.node.ts` | top-level await | Startup imports without try/catch | Silent worker crash/hang | fixed (posts `error` to parent) |

**Tests:** `commands.test.ts` (5), `simPrep.test.ts` (1) — research/route validation, headless command delta, `electionCeremony` clone.

## Batch EA — engine audit & spatial cleanup (7)

| # | File | Locatie | Bug / logica-fout | Impact | Status |
|---|------|---------|-------------------|--------|--------|
| 1 | `gameEngine.ts` | Road avoidance rebuild (~r. 1206) | `roadStamp = roadBuildings.length` — demolish+rebuild at same count leaves stale avoidance index | Entities walk over removed roads or miss new segments | fixed (`computeRoadLayoutStamp`; road demolish clears `roadAvoidance`) |
| 2 | `gameEngine.ts` | Building repair (~r. 1118) | `building.occupants.length > 0` without alive check | Dead settlers repair buildings for free | fixed (alive occupants via `entityById`) |
| 3 | `gameEngine.ts` | Workshop productie (~r. 1446) | `Needs worker` reported unreachable under outer `staffed` guard | False positive audit item | info (workshop branch omits `staffed`; uses `workersByBuildingId`) |
| 4 | `lifeSimulation.ts` | Grass reproduction (~r. 2547) | Strict `> 0` / `< width` left permanent border dead zones | Grass never spawns on map edges | fixed (`x/y ∈ [0, width/height]`) |
| 5 | `gameLoop.ts` | Worker import race (~r. 152) | `setSession` notifies UI before async `importSave` completes | Stale UI while worker holds old world | fixed (`notify` in `queueWorkerImport` callback) |
| 6 | `gameEngine.ts` | Building proximity ensure (~r. 1280) | Redundant `ensureBuildingProximityIndex` + duplicate tick path | Wasted per-tick work | fixed (removed `BuildingProximityIndex` with farm proximity bonus) |
| 7 | `worldGen.ts` | Grass patch clamp (~r. 277) | `Math.min(width, …)` inconsistent with sim reproduction bounds | Edge spawns fail silently vs passable filter | fixed (explicit `[0, width/height]` reject) |

**Related (same session):** farm proximity energy bonus removed (no economy basis); event-driven `AdjacencyIndex` (`adjacencyIndex.ts`).

| — | `entityIndex.ts` | `entityById` incremental map | Was partial (two O(n) reconciles/tick, deaths not deleted); now event-driven index/unindex on birth/death | fixed (`entityIndex.ts`; `ensureEntityByIdMap` on load only) |

**Tests:** `spatialGrid.test.ts` (`computeRoadLayoutStamp`); `adjacencyIndex.test.ts` (3).

## Batch N — Moon Howler 14-day cycle & Church cure (7)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `moonHowler.ts` `syncMoonHowlerForms` | 🔴 | Uncured Moon Howlers did not reliably return every 14 days — revert ran on any non-full-moon tick (including daytime hours) instead of dawn-only, breaking the hunt cycle | fixed (`isMoonHowlerTransformTick` 8pm on `isFullMoonDay`; `isMoonHowlerRevertTick` 7am only) |
| 2 | `gameEngine.ts` | 🟠 | Full-moon scheduling used `getColonyDay(state)` (year × 360 + dayInYear) instead of tick calendar — long saves could drift off the 14-day cadence | fixed (`getAbsoluteCalendarDay(state.tick)` for moon logic) |
| 3 | `gameEngine.ts` | 🟠 | New Moon Howler curse only rolled **8%** per full moon — villages could go many cycles with no curse when none active | fixed (`shouldApplyNewMoonHowlerCurse`: guaranteed when no active curse and humans > 5) |
| 4 | `gameEngine.ts` + `moonHowler.ts` | 🟠 | Church cure required cursed settler within 140px and rolled at 7am production tick while still human — illogical vs werewolf form | fixed (village-wide dawn cure at 7am on active 🌝 form; `tryMoonHowlerChurchCures` ~18% RNG) |
| 5 | `gameEngine.ts` | 🟡 | New curse applied at end of tick — first hunt waited an extra 14 days; transform not same night | fixed (curse + `transformToWerewolfForm` immediately after `moonSync` on full-moon 8pm) |
| 6 | `moonHowler.ts` `nightFall` | 🟡 | “Full Moon!” banner only when `transformed.length > 0` on exact 8pm tick — missed if transform tick skipped | fixed (`nightFall` when hunters already abroad at 8pm on full-moon day) |
| 7 | `buildingActions.ts` `spawnMoonHowlerDebug` | 🟢 | Debug curse did not transform on current full-moon night | fixed (`isMoonHowlerTransformTick` + immediate `transformToWerewolfForm`) |

**Tests added:** `moonHowler.cycle.test.ts` (tick-accurate 0/14/28/42 hunt days); `moonHowler.test.ts` (`tryMoonHowlerChurchCures`, `shouldApplyNewMoonHowlerCurse`, dawn revert). **UI:** Church panel + help text — 14-day recurrence, dawn cure chance.

## Batch O — orphaned marriages + vitest dialogue preload + prison flake (3)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `gameEngine.ts` + `dayCycle.ts` | 🔴 | End-of-tick `allAlive` drops dead entities from `state.entities`; survivors could keep `partnerId` pointing at a removed id (`assertSimInvariants`: `human 285 married partner 831 missing or dead` on seed-42 day 29) — `killHuman` widowing did not always run before prune (immigration deaths, hunt kills, etc.) | fixed (`reconcileOrphanedMarriages` before `state.entities = allAlive`; accepts human **or** cursed 🌝 form as valid partner) |
| 2 | `dialogueTrees.ts` + `src/test/setup.ts` | 🟡 | `beforeAll(async () => preloadDialogueBank())` in setup — parallel vitest workers could start chat tests before JSON loaded (5 flaky dialogue-bank failures on first full run) | fixed (top-level `await preloadDialogueBank()` in setup module; disk load uses dynamic `import()` like `nameLoader.ts` — no `require()` in app tsconfig) |
| 3 | `lifeSimulation.prison.test.ts` | 🟡 | 120-day integration: `Math.random()===0` killed all adults on day 1 (`HUMAN_DAILY_ILLNESS_CHANCE`); pin timing missed calendar-day gossip; staffed prison + low roll always `caught` not `Whispers spread` | fixed (`withRepeatingRandom(0.1)`; `tryDailyHumanMortality` mock; pin before `tick % 24 === 0`; two-pass fixture wiring; `assignAllWorkers` on calendar boundary only; `_debug.prison.test.ts` removed) |

**Tests added/updated:** `lifeSimulation.mortality.test.ts` (`reconcileOrphanedMarriages`); `lifeSimulation.social.integration.test.ts` (30/60-day seed 42 green with dynamic fixture ids); `lifeSimulation.prison.test.ts` (`withRepeatingRandom`, `afterEach` mock restore); `seededRandom.ts` (`withRepeatingRandom`). **Related:** Batch I #2 (`isSettlerRelationshipEntity`) handles **alive** werewolf-form spouses; Batch O #1 handles **missing** partner rows after death prune.

## Batch P — caught-affair divorce after imprisonment (3)

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `lifeSimulation.ts` | 🔴 | `exposeAffair(..., 'caught')` called `arrestForScandal` before `tryDivorceOnCaughtCheater`; imprisonment teleported cheaters to prison, then `isSpouseNearby(cheater, 40)` failed — **divorce never fired** despite scandal + imprison log lines (playtest: “caught cheating and imprisoned, never a divorce”) | fixed (`caughtInAct` skips proximity check; caught-in-act divorce chance = 1) |
| 2 | `lifeSimulation.ts` | 🟡 | Divorce notification always said “maiden name restored” — implied only wives divorce; husbands divorcing cheating wives got wrong copy | fixed (`formatCaughtCheaterDivorceDetail` — maiden-name line only when the **cheater** is female with `maidenSurname`) |
| 3 | `nameLoader.ts` | 🟡 | `grantDivorce(wife, husband)` call sites duplicated gender branching; comment said “Wife may divorce after catching her husband cheating” | fixed (`dissolveMarriage(partnerA, partnerB)` — either spouse initiates; both genders cheat, either spouse divorces; woman’s maiden name restored on split) |

**Tests added/updated:** `lifeSimulation.affair.test.ts` — imprison + divorce assertions on male cheater; prison-far teleport divorce; **husband divorces + wife imprisoned** when wife cheats (**18** tests in file). **Related:** master `lifeSimulation.ts` #9 (wife/husband args by cheater gender); Batch C #9 (paramour spouse divorce).

## Batch Q — dayCycle housing, taming, challenges audit (15) **fixed**

| # | File | Location | Sev | Issue | Impact | Status |
|---|------|----------|-----|-------|--------|--------|
| 1 | `dayCycle.ts` | `syncPartnerResidence` | 🔴 | Both partners' `residenceBuildingId` cleared **before** a shared home is found | Married settlers homeless after partnering | fixed (verified correct in tree) |
| 2 | `dayCycle.ts` | `removeHumanFromBuildingOccupants` | 🔴 | Werewolf-form settlers not removed from occupant arrays on death | Ghost workers | fixed (`isResidenceOccupantEntity`) |
| 3 | `dayCycle.ts` | `syncResidenceOccupants` | 🟡 | Werewolf-form settlers excluded from residence sync | Housing drift | fixed |
| 4 | `buildingActions.ts` | `tameEntity` (Taming Post distance) | 🟡 | Distance uses top-left not center | Inconsistent taming | fixed (verified) |
| 5 | `buildingActions.ts` | `getTameFoodCost` → `tameEntity` | 🟡 | Silent return when cost null | No feedback | fixed (verified) |
| 6 | `challengeProgress.ts` | `great_city` & `growing_village` | 🟡 | Single-metric 100% progress | False near-done UI | fixed (combined %) |
| 7 | `defenseStructures.ts` | `getBarracksGuardBonus` | 🔴 | Missing `?? EMPTY_FORGE` | Runtime crash | fixed |
| 8 | `contextualTutorial.ts` | `markTutorialsSeen` | 🔴 | `structuredClone(state)` | DataCloneError | fixed (shallow spread) |
| 9 | `buildingActions.ts` | `placeStripChain` (segment unlock) | 🟡 | Per-segment unlock mismatch | Missing corners | fixed (`isStripSegmentTechUnlocked`) |
| 10 | `dayCycle.ts` | `rebalanceAdultChildren…` | 🟢 | O(n²) `emptyResidences` in loop | Lag spike | fixed (verified cached) |
| 11 | `combat.ts` | `mergeCombatResearchNodes` | 🟢 | Fresh nodes every call | GC churn | fixed (verified one-time migration) |
| 12 | `buildingActions.ts` | `startBuilding` / `canPlaceBuilding` | 🟡 | Rival buildings ignored | Clip into rival territory | fixed (`overlapsAnyBuilding`) |
| 13 | `dayCycle.ts` | `migrateHumanAges` | 🟡 | Legacy aging heuristic too aggressive | Valid ages overwritten | fixed (tighter guard) |
| 14 | `buildingActions.ts` | `assignIdleWorkerToBuilding` | 🟢 | Undefined skill keys | Serialization noise | fixed (verified) |
| 15 | `dayCycle.ts` | `rebuildChildrenIds` | 🟢 | Player-human subset only | Stale rival genealogy | fixed (`groupEvents` full pool) |

**Priority:** #1–#2, #7–#8 (bugs/crashes) → #3–#6, #9, #12–#13 (logic/UX) → #10–#11, #14–#15 (perf/minor).

## Batch S — App.tsx + panels audit (NL report, 17) **fixed**

| # | Location | Type | Issue | Impact | Status |
|---|----------|------|-------|--------|--------|
| 1 | `App.tsx` `handleCanvasClick` | 🔴 Stale closure | `worldRef.current` for hit-tests | Stale clicks | fixed |
| 2 | `App.tsx` `handleMouseUp` | 🔴 Ref leak | `clickOriginRef` cleared in `handleMouseUp` | Random click miss | fixed |
| 3 | `App.tsx` sprite `useEffect` | 🔴 State mutation | `fixDefaultNames` via `structuredClone` + `setWorld` | Missed re-renders | fixed |
| 4 | `App.tsx` `activeBigNews` `useMemo` | 🔴 Stale memo | Deps include `world.tick` | Dismissed news stuck | fixed |
| 5 | `App.tsx` bigNews auto-dismiss | 🟡 Interval restart | Stable `[]` deps interval | Timer resets | fixed |
| 6 | `App.tsx` `handleCanvasClick` | 🔴 Stale fallback | `worldRef` / `catalogRef` | Dead entities clickable | fixed |
| 7 | `SelectedBuildingPanel` | 🔴 Runtime crash | Workshop recipe guard | Crash | fixed |
| 8 | `SelectedBuildingPanel` | 🔴 Type cast | `formatRaidDeadlineSafe` | Crash | fixed |
| 9 | `VisitorCampPanel` | 🔴 Missing field | `refugeeResolved ?? false` | Crash | fixed |
| 10 | `MiniMap` draw loop | 🔴 Potential crash | Config guards | Crash | fixed |
| 11 | `App.tsx` `persistCurrentGame` | 🟡 Race condition | Early return if no view | Corrupt save | fixed |
| 12 | `App.tsx` `handleWheel` | 🟡 Passive event | `addEventListener` passive:false | Console warning | fixed |
| 13 | `App.tsx` `firstNightWarningMessage` | 🟢 Redundant logic | Simplified condition | Hygiene | fixed |
| 14 | `App.tsx` `handleCanvasClick` | 🟢 Non-null assertion | `focusTarget` union | Fragile `!` | fixed |
| 15 | `App.tsx` auto-save `useEffect` | 🟡 Double interval | `autoSaveIntervalRef` guard | Double timers | fixed |
| 16 | `SelectedBuildingPanel` | 🟡 Forge guard | `villageForge?.` | Crash | fixed |
| 17 | `App.tsx` `handleCanvasClick` | 🟡 Strip build UX | Single-click 1-tile strip | Drag only | fixed |

**Related (partial overlap):** master App.tsx #1 (bigNews timer deps — may not fix #4–#5); master App.tsx #4 (MiniMap rAF throttle — not #10 config guards); Batch L #1 (`persistCurrentGame` timeout/fallback — not #11 view race on unmount).

**Priority:** #1–#4, #6–#10 (clicks/crashes/stale UI) → #5, #11–#12, #15–#17 (logic/UX) → #13–#14 (hygiene).

## Batch T — `bug_audit.md` import (87)

**Full table:** [BATCH_T_AUDIT.md](./BATCH_T_AUDIT.md) · **Source:** [`../bug_audit.md`](../../bug_audit.md)

| Severity | Count | Fixed | Info | Partial |
|----------|------:|------:|-----:|--------:|
| High (T-H) | 23 | 15 | 8 | 0 |
| Medium (T-M) | 47 | 39 | 8 | 0 |
| Low (T-L) | 17 | 14 | 3 | 0 |
| **Total** | **87** | **68** | **19** | **0** |

**T-M14/T-M41 (closed):** scandal sentence extends when `prisonSentenceCrime === 'scandal'`; non-scandal terms unchanged. `tryExposeCaughtAffairForPair` routes caught rolls through lower entity id from either partner tick.

**Test debt:** cleared (see session log 2026-07-08 test-hardening).

## Batch U — gameEngine / education / worker (14)

**Full table:** [BATCH_U_AUDIT.md](./BATCH_U_AUDIT.md)

| ID | Sev | Summary | Status |
|----|-----|---------|--------|
| U-1 | 🔴 | `isNewCalendarDay` winter decay — **audit stale**; code uses `isNewCalendarDayTick(state)` | info |
| U-2 | 🔴 | `applyEducationGraduation` stacks bonuses without `educated` guard | fixed |
| U-3 | 🟡 | `wildlifeCounts` includes human count from `PopulationCounts` | fixed |
| U-4 | 🟡 | `byType` stale after Church cure (werewolf → human) | fixed |
| U-5 | 🟡 | Worker tick path never clears screen-shake impulse (see V-6) | fixed |
| U-6 | 🟡 | `entityLayer` cache key includes particle/float counts | fixed |
| U-7–U-12 | 🟢 | frontierCombat `allAlive`; raid log heuristic; dialogue retry; forge guard; eco false critical; housing hint | fixed |
| U-13–U-14 | ℹ️ | Well river bonus dead code; trade route redundant clone | info |

## Batch V — simBuffers / render SoA (15)

**Full table:** [BATCH_V_AUDIT.md](./BATCH_V_AUDIT.md)

| # | Summary | Status |
|---|---------|--------|
| V-1 | `simTickDeltaFromWorld` — optional `aliveBefore` | fixed |
| V-2 | `packRenderSoA` `safeF32()` NaN guard | fixed |
| V-3 | `renderSoAReader` alignment check before `Uint32Array` | fixed |
| V-4–V-5 | Bucket cache tick + `metaBySlot` key | fixed |
| V-6 | Screen shake cleared in `draw()`, not `applySimTickDelta` | fixed |
| V-7 | Event-log tail dedup within one apply | fixed |
| V-8 | `RESIDENCE_BUILDING_NONE = 0xffffffff` sentinel | fixed |
| V-9–V-15 | Tamed flag; alive slice; alive bit; catalog keys; buffer pool; layer bucket | fixed |

**Quick-win (audit):** V-1, V-2, V-3, V-5, V-6.

## Batch W — simWorker protocol audit (12)

**Full table:** [BATCH_W_AUDIT.md](./BATCH_W_AUDIT.md) · **Related:** Batch E (simWorker), Batch V (simDelta)

| # | Sev | Summary | Status |
|---|-----|---------|--------|
| W-1 | 🔴 Critical | Command/render split; delta always on command success | fixed |
| W-2 | 🔴 High | Headless commands (`!world` only) | fixed |
| W-3 | 🔴 High | Per-op `isWorkerCommand` validation | fixed |
| W-4 | 🔴 High | `applySimTickDelta` before render parse | fixed |
| W-5 | 🟡 Medium | `MAX_PIPELINE_DEPTH` + pool ≥ 2 at init | fixed |
| W-6 | 🟡 Medium | `sendCommand` rejects on `ok: false` | fixed |
| W-7 | 🟡 Medium | `simPrep` in-place array mutation | fixed |
| W-8–W-12 | 🟢 Low | `lastFocus`; MessageEvent stub; `rejectInFlight`; `Required<SimPrepPayload>`; single delta | fixed |

## Batch AP — App.tsx render perf audit (8) **fixed**

| # | Sev | Issue | Status |
|---|-----|-------|--------|
| 1 | 🔴 | `useMemo` with unstable `world` dep (`priorityAlerts`, `ecoBreakdown`) | fixed (direct call) |
| 2 | 🔴 | Inline `GameHeader` callbacks | fixed (`useCallback`) |
| 3 | 🟡 | `selectedBuildingIdleWorkerCount` IIFE every tick | fixed (`useMemo`) |
| 4 | 🟡 | `setSpeed` / `toggleAutoSave` not memoized | fixed |
| 5 | 🟢 | `beginAudio()` every left-click | fixed (`audioStartedRef`) |
| 6 | 🟢 | BigNews dismiss all items | fixed (visible item only) |
| 7 | 🟡 | Unguarded `BUILDING_CONFIGS` lookup | fixed (`getBuildingConfig`) |
| 8 | 🟢 | `BUILDING_HOTKEYS` unnecessary `useMemo` | fixed (module constant) |

## Batch EB — playtest Jul 8: terrain, sim build, HUD dismiss, emoji fonts (7) **fixed**

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `terrainGen.ts` + `renderer.ts` | 🟠 | Ground terrain looks **scrambled / checkerboard** — per-tile `variation: rng()` with ±5 RGB jitter on 10×10 blocks reads as random noise, not biomes | fixed (`noise()`-based smooth variation; reduced jitter; `TERRAIN_TILE_SIZE`) |
| 2 | `terrainLayer.ts` + `renderer.ts` | 🟡 | Terrain cache baked at **1 px per tile** then scaled 10× — blocky mosaic; decor cache at world pixels could misalign | fixed (world-pixel bake `state.width×height`; edge blend between tile types; draw 1:1 with `cam.zoom`) |
| 3 | `simulate-10year.ts` | 🔴 | After **player-rules** harness (no grants/cheats), headless sim **built nothing** | fixed (real `initGame` economy; `canAffordResourceCost`; construction pacing day 1 + every ~3 days) |
| 4 | `simulate-10year.ts` + `simBuildUtils.ts` | 🔴 | Sim places **one house + 1–2 farms** then stalls (wood/stone = 0, placement rings too tight, duplicate in-progress types) | fixed (`getSimBuildCenter`/`findBuildSpot` rings; lumber mill before extra farms; `needsAnotherFarm`; `listBuildPriorities` fallback) |
| 5 | `App.tsx` | 🟠 | **Floating notifications** had no dismiss — player clicks toast, nothing happens | fixed (click/× → `dismissNotification`; auto-fade after ~12s) |
| 6 | `App.tsx` + `simDelta.ts` + `gameLoop.ts` | 🔴 | **“Visitors Arrived!” / trader Big News** cannot be dismissed — click ×/`Got it` appears to do nothing; banner returns every tick | **fixed** — superseded by **EC-1** (`activeEvent` dismiss + bigNews mutual exclusivity) |
| 6b | `App.tsx` | 🟠 | Tutorial toasts / HUD overlays also hard to clear | fixed (save toast button; tutorial backdrop dismiss; HUD `pointer-events` layering; `markContextualTipSeen`; founding traders pre-marked in `tutorialSeen`) |
| 7 | `App.tsx` + HUD components | 🟡 | Main game UI emoji (✨/⚠️/📜, weather, alerts, events) show as **`?` on Windows** — system font lacks emoji glyphs; IntroScreen OK | fixed (`Emoji` + `.font-emoji` stack `Segoe UI Emoji` / `Noto Color Emoji`; Big News type badges `+`/`!`/`i` instead of emoji) |

**Repro notes:** fresh new game screenshot (`screen.JPG`) — blue squares = river tiles (not wells); beige checkered ground = terrain noise (EB-1/2). IntroScreen emoji unaffected (EB-7 scope = in-game HUD only).

**Files touched:** `terrainGen.ts`, `terrainLayer.ts`, `renderer.ts`, `gameTypes.ts` (`TERRAIN_TILE_SIZE`), `simulate-10year.ts`, `simBuildUtils.ts`, `App.tsx`, `index.css`, `components/Emoji.tsx`, `AlertBar.tsx`, `GameHeader.tsx`, `BuildCatalogPanel.tsx`, `ContextualTutorialCard.tsx`, `BlacksmithForgePanel.tsx`, `FocusPanel.tsx`, `MapSetupScreen.tsx`.

---

## Batch EC — live playtest Jul 8 PM (7) **fixed**

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `App.tsx` + `groupEvents.ts` | 🔴 | **Cannot dismiss visitor / traveling players** — EB-6 fixed `bigNews` only; `activeEvent` HUD had no ×/Esc; may show two banners | **fixed** — `ActiveEventBanner`, `dismissActiveEvent`, `dismissedActiveEventIds`, bigNews mutual exclusivity |
| 2 | `App.tsx` | 🟠 | EB-6 scope miss (sub-issue of #1) | **merged → EC-1** |
| 3 | `audio/*` | 🟠 | Music tracks stack | **fixed** — `ensurePromise` concurrency guards in `backgroundMusic.ts` / intro |
| 4 | `economy.ts` / `tradeCaravans.ts` | 🟡 | Trade routes without Market | **fixed** 2026-07-30 — `hasCompletedMarket` gate in `establishTradeRoute`; Progress/hints/alerts require Market |
| 5 | `App.tsx` | 🟡 | Hooks after conditional return | **fixed** |
| 6 | — | ℹ️ | Sim does not test dismiss | **info** |
| 7 | `BUGS_TRACKER.md` | ℹ️ | False **0 open** | **info** |

**Repro (EC-1):** new game → day 4–7 visitors → top banner `🎭 …` cannot dismiss; Big News dismiss also failed until EC-2.

**Files touched (EC):** `App.tsx`, `gameTypes.ts`, `saveSchema.ts`, `simDelta.ts`, `gameLoop.ts`, `simWorker/*`, `audio/introMusic.ts`, `audio/backgroundMusic.ts`, `audio/director.ts`, `audio/bootstrap.ts`, `audio/session.ts`.

---

## Batch ED — playtest Jul 8 night (5) **fixed**

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `App.tsx` | 🟠 | Event / Big News banners use `fixed inset-0` — feel full-screen, block map | **fixed** — compact `top-14` toast (`w-[min(100%-1.5rem,20rem)]`) |
| 2 | `buildingActions.ts` + `commands.ts` | 🟠 | Auto-assign to job buildings missing / one-click only adds one worker | **fixed** — `autoStaffAllWorkers` + `autoStaffWorkers` cmd + App wiring |
| 3 | `gameWorker.ts` + `humanChat.ts` | 🟠 | No citizen chat bubbles — worker never loaded dialogue bank | **fixed** — worker static-imports `sim_dialogue_trees.json`; UI `preloadDialogueBank` |
| 4 | `worldGen.ts` + `groupEvents.ts` | 🟡 | Immigrants show age 0 | **fixed** — `finalizeSettlerAge` on immigrant/recruit paths |
| 5 | — | ℹ️ | Vitest/sim do not cover these UI paths | **info** |

**Files touched (ED):** `App.tsx`, `buildingActions.ts`, `commands.ts`, `worldGen.ts`, `groupEvents.ts`, `simWorker/gameWorker.ts`, `dialogueTrees.ts`, `humanChat.ts`, `simDelta.ts`.

---

## Batch EH — sidebar UI rehaul + audio concurrency + hunting-spot sprite mismatch (4) **fixed**

| # | File | Sev | Bug | Status |
|---|------|-----|-----|--------|
| 1 | `App.tsx` | 🟠 | Sidebar single-active tab felt crowded; text too small to read comfortably | **fixed** — converted to independent open/close accordion panels; bumped tab labels, panel headers, and body text one size up |
| 2 | `audio/backgroundMusic.ts` + `audio/introMusic.ts` | 🟠 | Multiple music tracks could start simultaneously, causing songs to overlap | **fixed** — added `ensurePromise`/`startPromise` concurrency guards; corrected `tryAutoplay()` HTML-audio sample flag |
| 3 | `App.tsx` + tab panel components | 🟡 | Right-sidebar panels hard to scan at `text-[9px]`/`text-[10px]` | **fixed** — bumped panel body text to `text-[10px]`/`text-[11px]` and section headings to `text-sm`; panels: Village, Frontier, Nature, Progress, Log, More + imported panel components |
| 4 | Building sprites / renderer | 🟠 | Wrong building sprite connected to hunting spot — should be `huntingspot.png` | **fixed** 2026-07-30 — preload + casing: lowercase `/sprites/huntingspot.png` (file rename; was typo/`Huntingspot`) |

**Files touched (EH):** `App.tsx`, `src/components/tabPanels/*`, `src/game/FocusPanel.tsx`, `src/game/PopulationPanel.tsx`, `src/game/VillageLeadershipPanel.tsx`, `src/game/EventLogPanel.tsx`, `src/game/RoadmapPanel.tsx`, `src/game/StatisticsPanel.tsx`, `src/components/FrontierPanel.tsx`, `src/components/CombatLogPanel.tsx`, `src/components/ChallengesPanel.tsx`, `src/components/CollapsibleSection.tsx`, `src/audio/backgroundMusic.ts`, `src/audio/introMusic.ts`.

---

## Batch EI — import-cycle cleanup **mostly fixed/mitigated** (2026-07-30)

Most multi-node cycles **broken** via `playerHuman`, `entityFactory`, `rivalPeace`, and leaf imports for research/education/stats/buildingActions. **Remaining risk** is `gameEngine` barrel re-exports (architecture hygiene only — not player bugs).

### Early fixed pairs (session 2026-07-12)

| # | Cycle | Fix |
|---|-------|-----|
| 1 | `humanSprites` ↔ `spriteLoader` | sheets/readiness moved to `spriteLoader` |
| 2 | `protocol` → engine/delta/commands | pure contract module |
| 3 | `stripBuild` ↔ `stripTopology` | `EnclosedArea` ownership |
| 4 | `forge` ↔ `combat` | `hasCompletedBlacksmith` in forge |
| 5 | `militiaBalance` ↔ `defenseStructures` | constant ownership |
| 6 | `economy` ↔ `tradeCaravans` | `resourceUtils` + trade route ownership |
| 7 | `villageLeadership` ↔ `worldGen` | `getAgeInYears` → dayCycle |
| 8 | `dayCycle` ↔ `moonHowler` | `dayCycleConstants` leaf |

### Multi-node (EI-1..15) — status 2026-07-30

| # | Cycle (summary) | Status | Notes |
|---|-----------------|--------|-------|
| EI-1 | combat → forge → juice → groupEvents → combat | **fixed** | juice + `playerHuman` + entityFactory |
| EI-2 | juice → groupEvents → … → simEffects → juice | **fixed** | same leaf cuts |
| EI-3 | groupEvents ↔ townHall ↔ villageLeadership | **mitigated** | `isRivalAtPeace` leaf; election/visitor edges thinned |
| EI-4 | groupEvents → entityIndex → … → groupEvents | **fixed** | entityFactory / spatial leaves |
| EI-5 | groupEvents → worldGen → stats → groupEvents | **mitigated** | stats uses `gameTypes`; no juice barrel edge via groupEvents |
| EI-6 | groupEvents → worldGen → entityCounts → groupEvents | **fixed** | entityFactory / counts leaves |
| EI-7 | groupEvents ↔ worldGen | **fixed** | groupEvents no longer imports worldGen for `createEntity`; one-way worldGen→`spawnVisitorGroup` |
| EI-8 | forge → juice → groupEvents → worldGen → forge | **fixed** | juice + playerHuman + entityFactory |
| EI-9 | groupEvents → … → research → education → groupEvents | **mitigated** | research/education leaf imports (no groupEvents barrel for juice) |
| EI-10 | groupEvents → … → research → groupEvents | **mitigated** | same |
| EI-11 | combat … frontierCombat → combat | **fixed** | juice/playerHuman + rivalPeace + entityFactory |
| EI-12 | groupEvents → … → frontierCombat → groupEvents | **mitigated** | rivalPeace leaf; frontierCombat ↛ groupEvents |
| EI-13 | combat … militiaBalance → combat | **fixed** | same as EI-11 family |
| EI-14 | forge … defenseStructures → forge | **fixed** | same family |
| EI-15 | groupEvents … militiaBalance → groupEvents | **fixed** | rivalPeace + leaf cuts |

**Residual (optional):** re-export hygiene on `gameEngine` barrel — may still *appear* in static graphs without runtime player impact.

**Also:** `playerHuman` extract (`isPlayerHuman` / counts) so juice/sim helpers stop importing `groupEvents`.

## Batch X — storyEvents import cycle (1) **fixed**

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| X-1 | 🟠 |  (added for signature stories) imported  from , which imports  → cycle . Under the election-gossip test's , the cycle made  re-enter the mocked module mid-init, so  captured the real  and the spy never fired (daily gossip roll silently missing in the plain-world test) | **fixed** |  now imports  from  (leaf, types-only imports); cycle gone; regression caught by  |

## Session fix log

| When | What |
|------|------|
| 2026-07-07 | Created tracker; verified ~68 pre-existing fixes |
| 2026-07-07 | **Coded batch:** GameLoop `syncAfterWorkerMutation` + `commandChain` + `notify(force)`; `grantDivorce` wife-first when wife cheats; `rebuildChildrenIds` single-pass Set; renderer rain single-stroke batch; `pop > beds` → warn tone; affair cohabit mult; conception lover via `ctx.playerHumans` |
| 2026-07-07 | **Test hardening:** `seededRandom` + `simInvariants` helpers; GameLoop notify/catalog tests; birth same-tick integration; 30-day seeded social sim; wife-cheater maiden surname; visitor lover gate; prison integration de-flaked; `applyCommandLocal` force-notify fix |
| 2026-07-07 | **Batch A:** birth date, adoptive childrenIds, building footprint, strip replace validation, great_city progress, barracks guards, first_birth tutorial, full-moon colony day |
| 2026-07-07 | **Batch B (22):** humanSprites ready, festival daysLeft/cooldown, forge jam, CSV escape, raid queue, worker import, EventLogPanel feedback, challenge pop count, SPECIES_CONFIG imports, raid camp center, wander prune, repair wood, tribute cap, addBigNews Node-safe, light raid casualties; deleted kopie files |
| 2026-07-07 | **Tracker:** Added Batch C (20 sim/UI items) — mostly open; next priority #1–#4 critical/high |
| 2026-07-07 | **Batch C (20):** finalizeHumanDeath, plague roll filter, PopulationPanel construction workers, founding wildlife birthYear, townHall leader check, renderer names/weather, paramour divorce, cornerArms render, election guard, camp spiral, appliedSaveMigrations, replenish log guard, allLivingHumans dedup, animal death age filter |
| 2026-07-07 | **Tracker:** Added Batch D (17 simBuffers/render SoA items) — all open; priority #1–#3 critical/high |
| 2026-07-07 | **Batch D (17):** renderMeta alignment, structuredClone deltas, slot bounds, buffer pool, bucket cache — all fixed |
| 2026-07-07 | **Batch E (15):** worker buffer lifecycle, init race, command validation, proto check, importSave render invalidation |
| 2026-07-07 | **Master pass:** App villageStats/first-night/big-news, dayCycle production tick, adjacency index, tracker reconciliation |
| 2026-07-07 | **Tracker:** Added Batch F (12 UI component audit items) — forge disabled logic, build catalog types/guards, combat log parsing, menu portal, food alert duplication |
| 2026-07-07 | **Batch F (12):** forge disabled/occupants, build catalog hotkeys/guards/category, combatKind stats, tutorial action binding, challenge tone, menu portal, frontier raid const, unified food alert |
| 2026-07-07 | **Batch G (10):** addBigNews ids, wolf migration energy, livingHumanAt, tryGraduateHumanChild, chatTicks clear, hasPlacedHouse latch, grassEcology dedup, WEREWOLF_TAME_LINES readonly |
| 2026-07-07 | **Sim harness:** prison guard steal-from-any-worker, earlier church/prison build, imprison/release live log |
| 2026-07-07 | **Batch H (9):** renderer SoA shims, grid viewport, night-glow cull, walk threshold, terrain dispose, flash alpha |
| 2026-07-08 | **Remaining master items:** `saveLoad` calendar day, `populationGrowth` snapshot, affair conception site, weather particles on resize, `pushTransientParticle`, FocusPanel buildings, `GameWorkerHost` queue/upload/headless tick |
| 2026-07-08 | **Quality:** `npm run build` clean; `npm run lint` **0 errors** (70 fixed — App ref sync, catalog state, test imports); **317** vitest passed (3 skipped); dialogue-tree chat + tests; `/check-work` PASS |
| 2026-07-08 | **Batch I (9):** `killHuman` widow routing; `isSettlerRelationshipEntity` for Moon Howler marriages; `tickQueries.ts` pairwise hotspot elimination; collision-free social integration ids; **319** vitest passed |
| 2026-07-08 | **Batch J (3):** `isKillableSettlerEntity` + `markWildlifeDead`; `test:types` 17 errors fixed; CHANGELOG `recordWildlifeDeath` doc nit |
| 2026-07-08 | **Batch K (6):** `drawRenffrOmen` canvas save/restore + subtitle centering; `renffrRng` deterministic trigger/shuffle/scatter; `shuffleArray`; `isPlayerHuman` JSDoc |
| 2026-07-08 | **Batch L (6):** `persistCurrentGame`; auto-save while paused; Load after auto-save; load error toasts; worker export timeout; runtime field strip |
| 2026-07-08 | **Batch M (4):** `isReusableSpatialGrid`; `syncMobileSimGrid` / `syncGrassRenderGrid` stale-clone guard; `gameEngine` grass reuse gate; `shallowCloneWorld` runtime strip; **328** vitest |
| 2026-07-08 | **Batch N (7):** Moon Howler 14-day transform/revert schedule; tick-calendar full moons; guaranteed curse when none active; Church dawn cure (18% RNG); same-night transform; `nightFall` alert; debug spawn transform; **349+** vitest (`moonHowler.cycle.test.ts`) |
| 2026-07-08 | **Batch O (3):** `reconcileOrphanedMarriages` after entity prune; top-level `await preloadDialogueBank()` in vitest setup; prison test seed 123; social integration seed-42 green; **358** vitest |
| 2026-07-08 | **Batch P (3):** caught-affair divorce after prison teleport (`caughtInAct`); `dissolveMarriage` + `formatCaughtCheaterDivorceDetail`; husband/wife both cheat + either spouse divorces; affair.test **18** |
| 2026-07-08 | **Batch Q (15):** audit table logged — `syncPartnerResidence` homelessness; werewolf occupant sync; taming UX; challenge progress; forge/tutorial crash risks; wall strip unlock; perf + rival overlap (**open**) |
| 2026-07-08 | **Batch R (6):** Renffr omen NL audit — maps to Batch K #1–#6; `drawRenffrOmen` save/restore + subtitle; `renffrRng` + `shuffleArray` (**fixed**, cross-ref only) |
| 2026-07-08 | **Batch S (17):** App.tsx + panels NL audit — stale `handleCanvasClick`/`world` closure, `clickOriginRef`, `fixDefaultNames` mutation, bigNews dismiss memo/interval, panel crashes, save race (**open**) |
| 2026-07-08 | **Batch T (87):** imported from `bug_audit.md` → [BATCH_T_AUDIT.md](./BATCH_T_AUDIT.md) (**72 open**, 15 info) |
| 2026-07-08 | **Batch U (14):** gameEngine/education/worker audit → [BATCH_U_AUDIT.md](./BATCH_U_AUDIT.md); U-1 calendar day **verified fixed** in tree |
| 2026-07-08 | **Batch V (15):** simBuffers/render SoA audit → [BATCH_V_AUDIT.md](./BATCH_V_AUDIT.md) (**open**) |
| 2026-07-08 | **Batch W (12):** simWorker protocol — command/render split, headless commands, delta-before-render, `sendCommand` reject (**fixed**) |
| 2026-07-08 | **Batches Q/S/U/V/T + AP:** mass fix session — **148** items coded; tracker **0 open** / **2 partial**; **385/387** vitest; `lifeSimulation.batchT.test.ts`, `batchT.saveTradeGroup.test.ts`, dayCycle.* tests added |
| 2026-07-08 | **Test debt cleared:** `worldGen.ts` `recordBirthYear` opt for founding wildlife (`birthYear: -1`); `stats.test.ts` green; `lifeSimulation.prison.test.ts` audit fixes (`withRepeatingRandom`, calendar pin, mock cleanup); `_debug.prison.test.ts` deleted; **387/387** vitest |
| 2026-07-08 | **T-M14/T-M41 + tracker audit:** partial→fixed; Batch T **68/19/0**; affair.test +3; integration 60-day scandal assert dropped; **390/390** vitest; registry **415** status-closed / **429** IDs |
| 2026-07-08 | **`benchmark-city.ts` patch:** steady p95 gate; per-tick simFocus; metrics after warmup; `exitCode` CI — see `CHANGELOG_PRIVATE.md` |
| 2026-07-08 | **`perf-97.ts` patch:** seeded spawns, alive min/final, optional dialogue preload, `SIM_FULL_SIM` focus toggle |
| 2026-07-08 | **Batch AA (7) + AB (9) + AC (5):** spatial grid layout reuse; population snapshots + narrow-phase metrics; `absorbedEntityIds` guards; grid/fallback parity; `getHousemates` Human guard; `tickQueries.test.ts`; commit `b5b6bd0` pushed |
| 2026-07-08 | **Batch AD (8):** `viewState.ts` save/load — simplified `sanitizeCamera`, safe parsers, entity/building index, immutable `clampCameraTarget`, persist transient + UI overlay; `saveLoad.ts` restore; `viewState.test.ts` **13** tests (**fixed**) |
| 2026-07-08 | **Batch AE (6):** `populationGrowth.ts` — `buildGrowthDetail`, `formatHousingCapReason`, `getFoodAmount`, `openCapSlots`, per-tick snapshot cache, `getOpenBedsFromPop` clamp; `populationGrowth.test.ts` **11** (**fixed**) |
| 2026-07-08 | **Batch EA (7):** road layout stamp; alive repair workers; grass bounds; worker import notify; removed farm proximity + `BuildingProximityIndex`; event-driven `AdjacencyIndex`; `spawnGrassPatch` bounds |
| 2026-07-08 | **Batch EB (7):** playtest — terrain/sim/emoji coded; EB-6 dismiss marked fixed prematurely — only `bigNews` path; `activeEvent` still blocked play (EC-1) |
| 2026-07-08 | **Batch EC (7):** live playtest PM — EB-6 missed `activeEvent` path; music overlap; trade-route gate open; tracker falsely showed **0 open**; **no item closed without player confirm** |
| 2026-07-12 | **Batch EG (16):** post-refactor stabilization pass — `TICKS_PER_DAY` top-level TDZ fixed in `villageLeadership.ts`, `frontierCombat.ts`, `lifeSimulation.ts`, `tradeCaravans.ts`, `townHall.ts`, `speciesConfig.ts`; restored `backgroundMusic.ts` from git HEAD; recreated `simHelpers.ts`; deduplicated `simeffects.ts`/`simEffects.ts`; added missing exports (`CAMERA_ZOOM_PRESETS`, `loadShowSimTick`/`saveShowSimTick`, `challenges` rename); implemented settler-count denorm (`workingSettlers`/`idleSettlers` on `WorldState`); partner-id map for relationship lines; outgoing raid/counter-raid march lines in `renderer.ts`; lint clean in `huntrenderer.ts` and `simulate-10year.ts`; `npm run lint` and `npm run build` green |
| 2026-07-12 | **Roadmap decision:** `simulate:20year` full 172800-tick gate deferred — developer will validate long-term stability via actual play sessions; smoke test (8640 ticks) remains green |
| 2026-07-12 | **Batch EH (4):** sidebar accordion rehaul — independent open/close tabs, larger fonts/spacing; audio concurrency guards in `backgroundMusic.ts` + `introMusic.ts`; `npm run lint` and `npm run build` green |
| 2026-07-12 | **New open bug:** hunting spot uses wrong building sprite — expected `huntingspot.png` (reported during playtest) |

| 2026-07-12 | **Batch EI (8):** import-cycle cleanup — `humanSprites`↔`spriteLoader`, `simWorker/protocol` pure contract, `stripBuild`↔`stripTopology`, `forge`↔`combat`, `militiaBalance`↔`defenseStructures`, `economy`↔`tradeCaravans`, `villageLeadership`↔`worldGen`, `dayCycle`↔`moonHowler`; **15 open cycles** logged above; `graph.md` regenerated; lint/build green |
| 2026-07-30 | **Re-verify open/partial:** EH-4 **fixed** (`spriteLoader` preload typo). EC-1/EC-3 + ED-1..ED-4 **code present** (still partial until play confirm). **EC-4 still open** — trade routes no Market gate. EI-1..EI-15 still architecture debt (`groupEvents` hub; `tickQueries` renamed `simQueries`). |
| 2026-07-30 | **Close functional queue:** EC-1, EC-3, ED-1..ED-4 → **fixed**; **EC-4** Market gate in `tradeCaravans.establishTradeRoute` + Progress UI + hints/alerts; extract `playerHuman.ts` (`isPlayerHuman`/`playerHumanCount`) so juice/sim helpers stop importing `groupEvents`; `tsc --noEmit` green. EI multi-node cycles remain open. |
| 2026-07-30 | **Dual bug-hunt (sim + UI):** Batch **EJ** — fixed election ceremony realtime, build hotkeys, night UI/tutorials, save trade+pregnancy migrate, courtship scale, ecology wildlifeCounts before daily; README + OPEN_PROBLEMS sync. EJ-9..12 later closed (rate scale, leader UI, multi-day production, hotel overnight). |
| 2026-07-30 | **Tracker scrub:** EK-A..G headers **fixed**; EK-G7 lowercase `huntingspot.png` + rename; EB-6 → fixed (EC-1); EI-1..15 fixed/mitigated via playerHuman, entityFactory, rivalPeace, leaf imports (research/education/stats/buildingActions); open ≈ **0 functional + residual barrel hygiene**. Favorite citizen = separate WIP (not this tracker close-out). |
| 2026-08-16 | **Batch EP (2):** rivers read as rivers — whole-tile 3–5-wide water bands + no thin stream stroke (`6671281`); coastal & riverlands get river sources via preset-aware peak threshold (`2e5a076`). New maps only. Also this session (features, not bugs → CHANGELOG): 2.5D painted relief + painted dirt + visible building upgrades + storm-damage FX + 08:00 founding. |
| 2026-08-17 | **Fold .bug-hunter into tracker:** scan artifacts (hunter-findings.json + referee.json — BUG-1 election-gossip double-fire, BUG-2 3× index build; both REAL BUG) recorded under Batch EO as BUG-1 → EO-1, BUG-2 → EO-2; `.bug-hunter/` directory deleted. |
| 2026-08-17 | **Docs bug-audit (all *.md):** session logs 2026-08-03/06 checked — every fix already in tracker (rivers→EL-1; grass-select→EM-1; build hints→EM-2; eco metrics→EM-3; hospital→EM-4; hunt arrows→EM-5; immigrant notify→EM-6; visitor intent→EM-7; build-menu→EM-8); ROADMAP fix mentions map to tracked items (EM-8, EN-1). No un-tracked bugs found. Finished docs archived: game-feel plan (all phases done) → `docs/archive/`, marketing (v0.5.0) → `docs/archive/marketing/`, session logs → `docs/private/archive/`; links updated. |
| 2026-08-17 | **Feature removal (not a bug):** victory paths deleted for redesign (user: "not good thought") — `victory.ts` removed; WorldState `victories`/`victoryAchieved` dropped from types, save schema, simDelta, simPrep, gameTick scan, focus hints, contextual tutorial; game is now a pure sandbox (Challenges + village portrait remain). Version bumped 0.5.4.1 → 0.5.4.2 (save schema change). |
| 2026-08-17 | **Economy audit (no changes, no bump):** gold/wood/stone/food/"iron" balance reviewed → `docs/private/ECONOMY_AUDIT_2026-08-17.md`. Headlines: no iron resource exists (forge pays wood+stone+gold); gold uncapped + snowballs (+32/d measured at 50 pop); challenge reward +1000×4 erases mid-game tension; wood cap 500 too low for winter (~900 needed at 50 pop); food spoilage 3%/d + stores-full gating prevents banking food; farms don't scale with workers. |
| 2026-08-17 | **X-1 fixed:** `storyEvents → economy → gameEngine` import cycle broke the election-gossip mock (spy never fired). Fixed by importing `addCappedResource` from `resourceUtils` (leaf) instead of `economy`. Added with the signature-stories feature (commits e446d17, e6befbc). |
| 2026-08-17 | **Economy implementation (audit follow-up, no bump):** real iron resource — `iron` added to ResourceKey/Resources/storage caps; Mine gains Extract mode (stone | iron, per-mine toggle in the inspector via new `setMineMode` sim command); all 8 forge orders now cost iron (gold load cut ~455 → 125); Ironport trade route pays iron; iron badge in header + forge chips + challenge rewards. Smoke-verified: iron mode ~21/d, stone mode ~29/d, forge consumes iron. Version stays 0.5.4.2 (save backfill: `resources.iron`/`storageMax.iron` defaulted on load). |
| 2026-08-17 | **External review (Manus AI, 7.7/10):** verified every claim — version docs stale (README 0.5.4.1 vs 0.5.4.2; ARCHITECTURE said 0.4…0.5.1 compat), "5 valleys" copy, stray `.lnk`, 65 circular-dep warnings, 625 kB game chunk. **Fixed now:** placement commit feedback (float shows cost + build days; header badges pop on decrease), tutorial dedup (guide suppresses duplicate build-shelter hint), version/save-policy docs synced to 0.5.4.2 everywhere, valleys copy, .lnk removed. **Deferred (next milestone):** circular-dep ledger (65 warnings), chunk topology/lazy-loading (625 kB), module splits (lifeSimulation 4,002 / renderer 3,427 / dayCycle 1,952 / groupEvents 1,793 / frontierCombat 1,388), browser E2E for first 15 min, build-mode prop-fade readability. |
| 2026-08-18 | **Batch EQ (5) — v0.6.1 stability session (all fixed, reported during live play):** |
| 2026-08-18 | **EQ-1 fixed:** Title card ("New Frontier" / chapter moments) stuck permanently on screen — `onDone={() => setMomentCard(null)}` was a NEW function every render (App re-renders each tick: `world` is a fresh object), so `MomentTitleCard`'s effect cleaned up and re-ran its fade/dismiss timers every tick → never dismissed. Fixed: stable `dismissMomentCard` useCallback + chapter card derived purely in render (`pendingChapterCard` useMemo on `dismissedChapter` state — no per-tick effect, no refs-in-render). |
| 2026-08-18 | **EQ-2 fixed:** "Sunset is approaching" shown at 08:00 in the morning — the 08:00 founding (tick 24) broke `isFirstGameDay = world.tick < TICKS_PER_DAY` (compared against tick 0, so the whole morning of day 1 read as "first day, pre-sunset"). Fixed: first-game-day + warning window anchor at the founding tick (`TICKS_PER_DAY + TICKS_PER_HOUR * 8`), and the message only reads "Sunset is approaching" from 14:00 (`NIGHT_START - 4`) — mornings now show "Your pioneers need shelter" 🌙. |
| 2026-08-18 | **EQ-3 fixed:** `[GameLoop] Worker tick stalled — falling back to main-thread ticks` — flat `WORKER_STALL_TIMEOUT_MS = 2000` watchdog killed a busy-but-alive worker: high-pop ticks take 100–400 ms (and browser hiccups delay message delivery), so 2 s without a result falsely tripped the stall path. Fixed: latency-adaptive leash `max(2 s, 4× measured worker tick latency)` (latency smoothed 0.7/0.3 in the tick-result handler). |
| 2026-08-18 | **EQ-4 fixed:** `grassGrid.matchesLayout is not a function` crash (renderer, `collectGrassInViewport`) — `structuredClone` strips class methods; after the worker fallback the renderer used the cloned method-less `state.grassGrid` (worker path used the snapshot reader). The sim already rebuilds clone-stripped grids (`isReusableSpatialGrid` in `resolveSpatialGrid`); the renderer guard only checked truthiness. Fixed: `typeof grassGrid.matchesLayout === 'function'` guard (spatialGrid.ts). |
| 2026-08-18 | **EQ-5 fixed (reported via code review, EK-F1 follow-up):** pregnancy block ended in `continue` — pregnant settlers skipped work, social life, leisure, hospital and the single movement apply at the loop bottom; the EK-F1 duplicated-movement and the copied hospital block were band-aids around the hard exit. Fixed: pregnancy block is progress + birth only (falls through to the normal tick), a proper `pickHospitalWalkTarget` helper (hospitalCare.ts) + walk gate (free time, or >85% term even on shift), treatment condition accepts `entity.pregnant`; 4 regression tests (`tests/hospitalWalk.regression.test.ts`). |
| 2026-08-18 | **v0.6.1 perf + stability round (features, not bugs → CHANGELOG):** worker sim default-on (`VITE_USE_GAME_WORKER=0` to opt out); ambient-chat grid scan staggered 3× (chance tripled, identical dialogue rate); social-impulse scan radius 1.5→1.1×; relationships pair-bumps capped (`PAIR_BUDGET`); official sweep 1,200h 352→207 ms, 1,500h 715→384 ms; trees/grass stay entities (measured ~3% of tick; they already skip the mobile grid); `scripts/perf-all.ts` (consolidated benchmark), `scripts/prof-single-tier.ts`, `scripts/analyze-cpuprofile.mjs`; benchmark output excludes scenery counts. |
| 2026-08-18 | **Batch ER (12) — bug-hunter scan 2026-08-18 folded (11 fixed, 1 open):** |
| 2026-08-18 | **ER-1 (=BUG-1) fixed (Medium):** immigrants (tickImmigration) joined `allAlive`/`entityById` but not `ctx.newEntities` — with the stable-`byType` cache, new settlers were missing from sim layers/playerHumans/working-idle counts until an unrelated composition change rebuilt. Fixed in `gameTick.ts`: rebuild also when `deathsThisTick < 0` (untracked spawns grew the population). |
| 2026-08-18 | **ER-2 (=BUG-6) fixed (Medium):** same class for world-event spawns (visitors, rival settlers, wolves, deer, trees, grass in `groupEvents.ts`) — covered by the same `untrackedSpawns` cache-rebuild fix. |
| 2026-08-18 | **ER-3 (=BUG-12) fixed (Medium, feature-breaking):** `spawnHerdAtEdge` pushed migration deer into `state.entities` which `gameTick` replaces with `allAlive` after the daily layer — the herd never appeared, yet departure counted them as taken and shrank next year's herd. Fixed: `tickMigration(state, allAlive)` + push into `allAlive`. |
| 2026-08-18 | **ER-4 (=BUG-14) fixed (Medium):** `addReputation` only floored at 0, never capped at 100 (all other rep-gain sites cap) — over-100 rep inflated the population cap (+1 per 10 rep in `populationGrowth`). Fixed: `Math.min(100, ...)`. |
| 2026-08-18 | **ER-5 (=BUG-8) fixed (Medium):** `steerWithPath` cached paths by building/leg only, not entity origin — all settlers/visitors to one building reused the first entity's path (routing others through water/mountains). Fixed: cache keys now include `Math.round(x)_Math.round(y)` origin (humanTick `c_…` + hotelStay `h_…`). |
| 2026-08-18 | **ER-6 (=BUG-11) fixed (Low):** feuds stored on both sides → the daily decay loop drained energy 2×/day. Fixed: each feud processed from the lower-id side only (`if (p.id > otherId) continue`). |
| 2026-08-18 | **ER-7 (=BUG-10) fixed (Low):** `startFeud` applied the wronged party's `before` to both directions → reciprocal feud scores diverged (asymmetric election-vote bonds / energy drain). Fixed: each side grows from its own previous value. |
| 2026-08-18 | **ER-8 (=BUG-2) fixed (Low):** famine-hunt floating text labeled Fox/Wolf kills as "Rabbit" — now labels each prey type. |
| 2026-08-18 | **ER-9 (=BUG-3) fixed (Low):** `getCombatPreview` camp-defense breakdown showed the attacker's strength as the rival's defense base when `attackerStrength` was supplied (incoming-raid preview) — text now uses the rival's own raid strength. |
| 2026-08-18 | **ER-10 (=BUG-7) fixed (Low):** new-leader "food" promise target was a fixed 60 — a leader elected with ≥60 food kept it instantly (+3 rep, no effort). Fixed: `Math.max(60, currentFood + 3)` (improvement, like the buildings promise). |
| 2026-08-18 | **ER-11 (=BUG-4) fixed (Low, manual-review):** `downloadSaveFile` revoked the blob URL synchronously after `anchor.click()` — can cancel the download in Firefox/older Chromium. Fixed: revoke deferred via `setTimeout(0)`. |
| 2026-08-18 | **ER-12 (=BUG-5) fixed (product decision: reserve at departure, NO refund):** caravan export goods are now deducted at departure (the caravan loads them) — no double-spend window, no empty-hand walk, the merchant waits at home if goods are missing. At the partner only imports/storage are checked (exports already paid). If the carrier dies en route the goods are lost by design (route restarts, next departure pays again). |
| 2026-08-18 | **Housekeeping:** `.bug-hunter/` deleted after folding (standing rule). Gates: tsc + lint 0 + vitest + build green before commit. |

## Batch ES — renderer.ts split bugs (2026-08-18) **in progress**

**Files:** `renderer.ts` · `renderer/*`  \r
**Legend:** `fixed` | `open` | `info` · Sev 🔴 High · 🟠 Med · 🟡 Low

| # | Sev | Bug | Status | Fix |
|---|-----|-----|--------|-----|
| ES-1 | 🟡 | Night atmosphere and building glow are drawn twice per frame: `renderGame` called `drawNightAtmosphere`/`drawNightBuildingGlow`/`drawDayAtmosphere`, then called `drawGameOverlay` which called the same functions again. This over-darkened night scenes and double-applied glow. | **fixed** | Removed the duplicate atmosphere block from `renderGame`; `drawGameOverlay` in `src/game/renderer/overlay.ts` now owns the full overlay pass. |
| ES-2 | 🟡 | `drawEcoConnections` only checked horizontal screen bounds when culling marriage/relationship lines, so vertically off-screen pairs were still submitted for drawing. | **fixed** | Added vertical culling using the same bounding-span check (`midY ± halfSpan`) in `src/game/renderer/markers.ts`. |
