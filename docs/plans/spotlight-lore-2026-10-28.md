# Wilderfolk — The Look: rare juvenile spotlight lore (0.6.5.2)

**Document type:** feature architecture and executable codebot implementation contract, derived from [CODEBOT_FEATURE_TEMPLATE.md](CODEBOT_FEATURE_TEMPLATE.md).  
**Status:** PLANNED, NOT IMPLEMENTED. This document does not claim tests or runtime behavior have passed.  
**Authority:** AGENTS.md, docs/command.md, OWNERSHIP_OVERVIEW.md and simulation/decisionRegistry.ts.  
**Evidence:** examined main at 688047375fb9a9ed966059d66c25add867912297 on 28 October 2026. Verify the live base again before editing.

## 0. Feature contract

| Item | Decision |
| --- | --- |
| Name | The Look — spontaneous village spotlight |
| Result | Rarely, an eligible girl aged 12–17 is unexpectedly celebrated by 6–10 actual nearby villagers; they gather, the camera follows, and a comic call-and-response performance unfolds at a relaxed real-time pace. |
| Origin | Direct user request, 28 October 2026; user explicitly allows pausing the simulation. |
| Target version | 0.6.5.2 per current AGENTS.md; working baseline 0.6.5.1. |
| Status | NOT IMPLEMENTED. The existing election gathering, dialogue bubbles and camera movement are reusable, but there is no spotlight event. |
| Simulation owner | NEW focused src/game/spotlightLore.ts for eligibility, phase state and triggering; existing humanTick remains the movement writer. |
| State | New optional WorldState.spotlightLore and spotlightLoreLastDay; no new per-entity fields. |
| Save compatibility | Existing 0.6.5.0 and current-version saves continue to load via canonical migration and validation, in the PR introducing the fields. |
| Delivery | One coherent implementation PR after this planning artifact, because incomplete half-scenes must not reach main. |
| Scope excluded | Gameplay benefits/penalties, romance, relationship changes, music playback, new audio assets, achievements, permanent career effects, artificial victory conditions and a standalone scene map. |

**User intention:** pure lore and comedy, not a quest. The featured juvenile is a person, not a reward, stat or romantic target. Adults act as the chorus. Source inspiration was the song text provided in the user request; create an original comic in-world adaptation rather than silently embedding unlicensed original music or implying singing playback exists.

**Scene contract:** Camera smoothly centers the real girl without opening a full-screen window. Her town remains visible. Available villagers walk over via genuine simulation movement and form a loose half-circle, rather than teleporting or being replaced with cloned sprites. Once gathered, the game may pause *simulation ticks* but the performance runs on a dedicated presentation wall-clock timeline, not on sim ticks. Lines appear one at a time, readable and not rushed. The event ends or skips without changing AI goals, work assignments, school data, relationships, traits, resources, health, or world tick during the paused portion. Original pause/speed/camera/favorite settings are restored safely.

**Done means:** Rare deterministic trigger; bounded eligibility; real gathering; centered camera; sequential lines with comic beats and readable bubbles; pause/skip/resume; old-save and worker parity; no new gameplay effects; no performance cliff in large colonies.

### 0.1 Invariants and guardrails

- Never force children into adult romantic behavior. Keep comedy about swagger, clumsiness, fashion and villagers' overenthusiastic reactions, not sexualization.
- Only juveniles aged **12 through 17** can be chosen as the focal girl. If the girl ages out, dies, transforms or leaves before the scene is ready, abort cleanly. At the paused presentation phase, simulate no passage of age/time.
- Performers are consenting *available* living player settlers (adult >=18), not prisoners, deployed soldiers, foreign captives or active emergency participants. Exclude school, medical crises, election ceremonies, active combat/raids near scene and other critical scripted gatherings. Never interrupt an on-duty shift.
- No forced dialogue through the gameplay chat writer while paused: the presentation owns only its temporary on-screen bubbles. Existing ambient dialogue sessions and their owners remain untouched.
- Never overwrite a player-created pause state or camera change without checking the current scene ownership token.
- No repeated trigger on reload in the same colony day; no hidden state in global module singletons or browser localStorage as a substitute for saved WorldState.

## 1. Mandatory AS-IS reconnaissance

Read AGENTS.md + docs/command.md in full, verify shell first, and inspect current package.json scripts, ownership overview and registry. The following facts were verified on the cited main commit; re-read each exact file before editing.

| Responsibility | Verified current owner / entrypoint | Live cadence / output | Reuse |
| --- | --- | --- | --- |
| Main simulation | src/game/gameLoop.ts GameLoop; src/game/gameTick.ts gameTick | Sim tick; authoritative worker when enabled, fallback main-thread | KEEP |
| Human behavior | src/game/tickLayerRealtime.ts tickLayerRealtime → src/game/humanTick.ts tickHumans | Every sim tick; decides movement and calls chat | MODIFY small existing priority branch only |
| Gathering precedent | src/game/villageLeadership.ts isCeremonyAttendee / getElectionGatherTarget | Election participants and positions; humanTick steering at roughly lines 868–882 | Reuse pattern, **do not** make spotlight depend on election rules |
| Velocity/steering | humanTick.ts uses movementSteering and its existing config.speed, position updates | Every active human movement tick | KEEP canonical writer |
| Speech | src/game/humanChat.ts sayHumanChatPhrase, formatChatLine, wrapChatLines, tickHumanChat | Worker-owned chatPhrase/chatTicks; renderer/humans.ts drawSpeechBubble | Reuse text wrap/visual style, but no new paused chat mutation |
| Human sprites | src/game/humanSprites.ts getHumanSpriteFrame / getJuvenileSpriteFrame | Existing real render layer | KEEP; no visual doubles |
| Camera | src/game/viewState.ts focusCameraOn, clampCameraTarget, updateView; src/App.tsx follows favorite | Smooth camera target interpolation on render frame | MODIFY App controller; do not install second camera owner |
| Pause | src/App.tsx togglePause → GameLoop.mutateWorld; gameLoop.ts mutateWorld sends paused/speed to worker | UI command path | Reuse; restore previous paused/speed |
| Log | src/game/eventLog.ts logEvent | Canonical WorldState.eventLog | Log event start/completion once, without separate lore log |
| Save / worker | src/game/saveSchema.ts WORLD_STATE_SAVE_KEYS; saveLoad.ts; simWorker/simPrep.ts; simBuffers/simDelta.ts | Persist/clone/rollback/transport | MODIFY all necessary field lists in same PR |
| Calendar | src/game/dayCycleClock.ts getAbsoluteCalendarDay, TICKS_PER_DAY, getHourOfDay | 72 ticks per in-game day | KEEP |

### 1.1 Current architecture — AS-IS

~~~text
GameLoop → gameTick → tickLayerRealtime
                         └─ tickHumans → movementSteering / humanChat
                              └─ electionCeremony is a separate established gathering path
WorldState → renderer/humans.ts → existing overhead chat bubbles
App.tsx → GameLoop.view → viewState focusCameraOn → camera lerp
GameLoop.mutateWorld(paused) → workerHost.setPaused / main-thread pause
saveSchema + saveLoad + simPrep + simDelta → durable simulation/worker boundary

No spotlight chooser, dedicated gathering state, chorus line script, scene controller, wall-clock dialogue or skip command currently exists.
~~~

Current camera favorite-follow in App.tsx is invoked on each world tick; a spotlight controller must suspend its conflicting target while the scene owns the camera. The election predicate is designed for election participants and can scan the population per participant; **do not** reuse that O(N) predicate in a new population-wide tick loop.

### 1.2 Protected behavior

| Contract | Evidence | Protection / test |
| --- | --- | --- |
| Work wins over festivals | humanTick.ts onJobShift / festivalGathering | Only free, safe performers; tests/festival.behavior.test.ts |
| Election precedence | humanTick.ts inElectionCeremony/getElectionGatherTarget | Do not begin or steal election participants; election tests |
| Dialogue session ownership | humanChat.ts paired sessions / sayHumanChatPhrase | No forced sim chat while paused; tests/pairDialogue.orphanReclaim.test.ts |
| Camera target / clamp | viewState.ts; App.tsx favorite follow | Previous state restored; existing camera tests |
| Worker truth | gameLoop.ts; simBuffers/simDelta.ts | No client-side mutation of simulated entity positions |
| Save versions | saveLoad.ts COMPATIBLE_SAVE_VERSIONS = current + 0.6.5.0 | Preserve both; no invented history |

Measured performance baseline: NOT MEASURED. The target adds O(1) inactive-path checks to hot ticks, at most one O(N) candidate scan per eligible **day**, and movement of <=10 participants.

## 2. TO-BE canonical architecture

~~~text
KEEP: gameTick → tickLayerRealtime
  └─ NEW: spotlightLore.maybeStartSpotlightLore(state, day/hour)
     └─ narrow candidate projection + deterministic day gate
     └─ NEW: WorldState.spotlightLore = { heroineId, performerIds, phase, positions, startTick ... }
  └─ MODIFY: humanTick.tickHumans
     └─ during gathering, <=10 participants steer to assigned valid positions
     └─ all others use existing behavior unchanged
  └─ NEW: spotlightLore.tickSpotlightGathering(state, indexed humans)
     └─ ready on arrivals or bounded timeout; logEvent exactly once
        |
        v existing SimTickDelta / worker projection
MODIFY: App.tsx (or a focused UI hook called from App)
  └─ focusCameraOn + clampCameraTarget → smooth camera follow
  └─ ready: GameLoop.mutateWorld(w => { w.paused = true })
  └─ NEW: SpotlightLoreOverlay (real-world screen coords, original on-map humans)
      └─ paced wall-clock original comic dialogue (no sim tick required)
      └─ skip / complete → typed worker command finishSpotlightLore
           └─ spotlightLore.finishSpotlightLore (single state writer + chronicle ending)
           └─ camera, prior paused and speed restored, only if controller still owns them
~~~

### 2.1 Module and field ownership

| File | Action | Responsibility, public contract | Writes | Caller |
| --- | --- | --- | --- | --- |
| src/game/spotlightLore.ts | CREATE | Pure eligibility and rare-day rule; start/advance/end state via maybeStartSpotlightLore / tickSpotlightGathering / finishSpotlightLore; getSpotlightGatherTarget read-only | spotlightLore; spotlightLoreLastDay; eventLog via logEvent delegate | tickLayerRealtime; humanTick; commands |
| src/game/gameTypes.ts | EDIT | SpotlightLoreState type and optional world fields, no per-human state | types only | Save/worker consumers |
| src/game/tickLayerRealtime.ts | EDIT | One authoritative call site after preparation / human movement | No new independent owner | gameTick |
| src/game/humanTick.ts | EDIT | Existing movement priority honors spotlight IDs and targets during gathering | Existing movement fields x/y/vx/vy only | tickHumans |
| src/game/simWorker/commands.ts | EDIT | Typed finish/skip command delegates to spotlight owner | Delegate only | UI action |
| src/game/saveSchema.ts + saveLoad.ts | EDIT | Persist and validate optional scene/cooldown | Saved scene + day only | Existing save flow |
| src/game/simWorker/simPrep.ts + src/game/simBuffers/simDelta.ts | EDIT | Rollback, transport and worker/fallback parity; no duplicate entity transport | Transport only | Existing worker host |
| src/components/SpotlightLoreOverlay.tsx | CREATE | Timed speech captions and restrained spotlight UI, skip button | View-only local UI state | App |
| src/App.tsx | EDIT | Own camera/pause capture/restore; invoke typed finish command; abort on session change | ViewState and world.paused only via existing GameLoop APIs | Existing world subscription |
| OWNERSHIP_OVERVIEW.md + simulation/decisionRegistry.ts | EDIT | Declare single scene decision owner, read-only projection and real caller/cadence | Metadata only | Architecture checks |

**New data contract (proposed):**

~~~ts
interface SpotlightLoreState {
  id: string;                       // stable day + heroine id
  heroineId: number;
  performerIds: number[];           // 6..10 distinct eligible adults
  phase: 'gathering' | 'ready';
  startedAtTick: number;
  readyAtTick?: number;
  gatherX: number;
  gatherY: number;
  slots: Array<{ humanId: number; x: number; y: number }>; // <=10, valid walkable targets
}
interface WorldState {
  spotlightLore?: SpotlightLoreState | null;
  spotlightLoreLastDay?: number;    // neutral default: absent
}
~~~ 

No per-entity lore flags, relationship fields, counters, new RNG registry, special village-wide aura or separate timer simulation. The only actor association is the <=10 persistent ID list. Any simulated creature removal is handled by revalidating participants and aborting as needed.

### 2.2 Trigger, eligibility, time and choreography

1. **Daily gate:** once at daytime (e.g. clock 16:00 on a free non-work day) only when no active spotlight. At most one candidate scan/day, and do not scan if cooldown <90 calendar days. Deterministic rare roll, e.g. ~1/80 eligible free days; do not consume global simulation RNG in UI. Validate a consistent seed/counter strategy with existing simRng or personDayRoll before choosing implementation. Cooldown begins only when a valid scene starts.
2. **Focal girl:** alive player human, gender female, integer/finite age 12–17, isJuvenile, not asleep, bedridden, imprisoned, deployed, indoor, fleeing or taking an essential obligation. Pick deterministically from eligible focal girls. If none, no scene and no cooldown spend.
3. **Chorus:** 6–10 adult >=18 available player humans in local range; choose stable nearest distance, tie by ID, and cap before planning slots. Reject on-duty workers, soldiers on post, school staff on duty, patients, prisoners, deployed, transforming howlers, active political gatherings and threats. Avoid forced reassignment of work, residence, job or social sessions. If fewer than six, do not fire.
4. **Gathering:** heroine remains herself at her real walkable position. Assign stable semicircle angles/radii around her, validate all target cells against canonical pathfinding/walkability, retry a bounded number of nearby points. No mass teleportation. Each actor follows original movement integration; no special second movement engine. Gather at reasonable speed and wait <=40 sim ticks; if not enough arrive, abort safely rather than trapping them in a permanent hold.
5. **Camera:** while gathering, smoothly focus on heroine at zoom ~1.65–1.9 clamped to map viewport. Keep town visible and show no separate panel. During scene, do not fight favorite-follow or user drag/zoom; lock relevant input or cancel scene on player intervention, clearly choose one behavior in implementation.
6. **Ready:** the authoritative simulation sets phase ready. The UI waits for the ready snapshot, saves camera/favorite/paused/speed, then pauses via GameLoop.mutateWorld. The UI timeline progresses by elapsed *monotonic wall-clock time*, not world.tick, so at 0.5x–10x no dialogue is rushed and no simulated day passes during narration. Use one bounded requestAnimationFrame or timer path with proper cleanup on session change/unmount. Detect loss of UI controller and make ready scenes auto-expire in headless mode after a bounded number of sim ticks.
7. **Lines:** about 25–30 short original comic lines, >=2.5–4.5 wall-clock seconds per line plus 0.25–0.65s breaths. Assign speakers in stable round-robin among selected 6–10 adult settlers. Show one visible bubble at a time above the actual speaking sprite, keep name readable and obey existing bubble wrap/overhead spacing/viewport clamp. Include at least three funny beats (late speaker, false-start grand entrance, and a literal-minded villager correcting the chorus). The girl's reactions stay non-sexual and optionally silent. Chorus can say a short recurring phrase reminiscent of the user's inspiration; no music playback or unlicensed sound file.
8. **End:** pause timeline ends after final flourish/applause, call ONE typed finish command, log one canonical chronicle ending in logEvent, clear scene, then restore captured camera/favorite and original paused/speed values. User skip invokes the same idempotent command, cannot double award anything (there are no rewards). If original pause was true, keep it true. If another overlay/session took control, do not restore stale camera or pause state.
9. **Headless/parity:** active gathering/ready state serializes and transports, even if there is no UI. A ready scene that is not actively paused by a presentation controller auto-ends after a bounded number of sim ticks. Loading a save mid-scene should allow re-entry/skip, or reject malformed partial state cleanly; never leave an unfinishable paused save.

### 2.3 Function migration and signatures

| AS-IS | Action | TO-BE call / ownership | Writes | Test |
| --- | --- | --- | --- | --- |
| No rare spotlight rule | NEW | spotlightLore.maybeStartSpotlightLore(state: WorldState, hour: number): boolean; called by tickLayerRealtime once per tick with O(1) guard | Scene fields; eventLog through owner | tests/spotlightLore.rules.test.ts |
| No active scene progression | NEW | spotlightLore.tickSpotlightGathering(state: WorldState, humanById: ReadonlyMap<number, Entity>): void; after humanTick | Scene.phase/readyAtTick, clear invalid | tests/spotlightLore.gathering.test.ts |
| No spotlight position lookup | NEW | spotlightLore.getSpotlightGatherTarget(scene: SpotlightLoreState, humanId: number): {x:number;y:number} | [] | tests/spotlightLore.gathering.test.ts |
| humanTick normal movement priority | MODIFY | humanTick.tickHumans: add narrow spotlight gathering branch for selected IDs, after flee/emergencies and before voluntary gathering | Existing x/y/vx/vy | tests/spotlightLore.gathering.test.ts |
| No finish command | NEW | spotlightLore.finishSpotlightLore(state: WorldState, id: string, reason: 'complete'|'skipped'|'aborted'): boolean | Clears scene, eventLog once | tests/spotlightLore.commands.test.ts |
| commands.ts existing typed union/dispatcher | MODIFY | add {proto:1,op:'finishSpotlightLore',id:string,reason:'complete'|'skipped'} and delegate to owner | Delegate | worker command roundtrip test |
| App camera and pause | MODIFY | App spotlight controller captures/restores view state and paused/speed once per scene ID | ViewState; world.paused | tests/spotlightLore.presentation.test.tsx |
| No scene display | NEW | SpotlightLoreOverlay({scene,actors,view,onFinish}) with locally timed line index; no simulation writes | [] | tests/spotlightLore.presentation.test.tsx |
| Save/worker omissions | MODIFY | saveSchema/saveLoad/simPrep/simDelta new fields in existing canonical structures | Transport/migration only | tests/spotlightLore.saveWorker.test.ts |

**No other owners:** spotlightLore must not import React/UI, control GameLoop, call any hidden tick, own work schedules or override relationship policy. UI must not change entity position/chat fields, call logEvent itself, or invent a second simulation scene. Existing humanTick remains the only movement owner.

### 2.4 Dependency and isolation proof

~~~text
gameTick → tickLayerRealtime → spotlightLore (authoritative scene state + event log delegate)
                         └─ humanTick → spotlightLore.getSpotlightGatherTarget (read only)
App → GameLoop camera/pause methods, SimTickDelta scene projection
    └─ SpotlightLoreOverlay → screenplay data + existing chat text formatting

saveLoad / saveSchema / simPrep / simDelta → plain SpotlightLoreState
commands → spotlightLore.finishSpotlightLore
No scene → UI → sim back-import; no UI direct writes to entities/chat.
~~~

**Import direction:** no UI dependency in game domain, no spotlightLore import of tickLayerRealtime, no domain import of React. Keep screenplay data in a focused presentation module or in the component if only one reader; no alias/re-export barrel. Decision registry contains one real 'spotlightLore' decision with cadence 'realtime' (daily start gate inside it), writes only spotlightLore, spotlightLoreLastDay, eventLog via delegation; exact actual caller and tests. UI presentation is read-only with no separate simulation decision.

### 2.5 Acceptance scenarios

- Seeded quiet village, Saturday afternoon, 1 valid girl and 8 available adults: exactly 1 gathering starts when rare roll hits, exactly 8 unique IDs, valid target cells; within bounded arrival window the screen camera smoothly targets her; after ready the sim pauses and adult speakers say short lines one at a time.
- Speed 10x or 0.5x when started: script pacing stays identical in wall time; speed restored (including 10x) at end. No in-game day or health change during paused performance.
- Interrupted by active raid, imprisonment, death, missing actress, election, <6 adults: no unsafe scene, no stuck movement, no repeated event log entry.
- Skip, double skip, component unmount, reload, worker failure/fallback: scene cleans up, no unintended unpause and no double scene.
- Large colony: candidate selection day-only, <=10 actor movement, no scene-wide repeated O(population) search per participant per frame.

## 3. Persistence, save migration and worker contract

**Applies in the same implementation PR as WorldState field introduction.**

1. Add both optional world fields in gameTypes.ts and WORLD_STATE_SAVE_KEYS in saveSchema.ts. Do **not** add anything to ENTITY_PERSISTED_FIELDS because no Entity schema changes.
2. In saveLoad.ts, normalize optional scene and last-day fields at the existing load hydration/normalization boundary. Absent scene => null/no scene. Absent last day => neutral no cooldown. Validate phase, finite bounded tick and coords, heroine ID, <=10 unique adult IDs, <=10 slots, world bounds, participant existence and uniqueness, known version; malformed scene => safely clear scene without inventing character histories; never mutate live RNG. Do not make old saves start a scene immediately.
3. Check COMPATIBLE_SAVE_VERSIONS (currently current game version and 0.6.5.0); preserve both. Idempotent load/save/load and stable RNG snapshot.
4. Add scene and last day to simWorker/simPrep.ts rollback keys; copy nested scene object, performerIds and slots deeply. Check simBuffers/simDelta.ts exact extraction/application and fallback transport; transport the two top-level fields once (no duplicate arrays or per-entity fields).
5. Save while gathering: continue if valid, else cancel. Save while ready: on reload resume/cancel via UI with no permanent pause trap; ensure normal safe recovery when no UI is mounted. The user-paused state is not a gameplay penalty. Skipping returns to previous settings where still owned.
6. Worker parity: commanded completion works while paused; test one real worker command roundtrip, host/fallback, stale scene-id command ignored, rollback equality, and observer delivery after command.

| Fixture | Expected behavior | Test |
| --- | --- | --- |
| New game | Scene absent; last-day neutral | spotlightLore.saveWorker.test.ts |
| 0.6.5.0 old save | No invented event; normal load | spotlightLore.saveWorker.test.ts |
| Current valid mid-gather save | Same heroine, actors, slots, progress | spotlightLore.saveWorker.test.ts |
| Corrupt scene / IDs / NaN / invalid phase | Scene cleared; not a global load crash | spotlightLore.saveWorker.test.ts |
| Double roundtrip | Same canonical fields, no new RNG use | spotlightLore.saveWorker.test.ts |
| Worker paused → finish | scene cleared in worker and display | spotlightLore.commands.test.ts |
| Failure rollback | Full deep restoration, no alias leaks | workerBoundary.closure.test.ts |

## 4. One coherent implementation PR — ordered work

**Starting architecture:** only elections/festivals have gatherings; no spotlight lore.

**Change and cutover:** Introduce the new distinct scene rule, one small movement integration in humanTick, one UI controller/overlay, one typed command, persistence/worker plumbing and documentation together. There is never an active partially implemented scene or a duplicate simulation writer in main.

1. Re-read all touched files and relevant tests from latest branch. Confirm scripts and shell. Resolve concurrent branches before writing.
2. Write the pure eligibility, rarity, performer selection and stable semicircle slot calculator with data-only unit tests. Use existing path walkability and stable seed utilities, no new global RNG.
3. Add types and world state, canonical save/load normalization, worker delta and deep rollback copies; add actual old-save/worker proof **in this same change**.
4. Wire one scheduler in tickLayerRealtime, movement in humanTick (normal AI and authoritative x/y writer), and idempotent typed finish/skip command; create real integration tests.
5. Wire App camera/pause ownership and spotlight overlay at map stage, using the existing real map and sprite layer. Present original humorous lines in a relaxed real-time script with only one speaker at once. Prior state restoration must be robust under reload/switch/unmount.
6. Update BOTH ownership overview and decisionRegistry, linked tests, brief changelog entry (<=300 chars; no file/path essay), this architecture if reality differs, and roadmap as **not completed until merged**. Read docs/bug_report/readme.md, file confirmed defects, update docs/BUG_REPORTS/SUMMARY.md. Include exact new/updated bug counts in PR body (0 if none).
7. Run targeted Vitest, worker boundary, npm run test:standard, npm run test:types, npm run lint and npm run build only if currently declared; inspect npm scripts first. Check real browser/Playwright with overlays and worker enabled, 0.5x and 10x. Do not claim any check not actually run.
8. Report PR URL, test results, screenshot/observation, baseline performance, any blockers; do not merge before green and review.

**After this PR:** A complete, deterministic occasional lore scene using actual villagers, no gameplay effect or fake popup with cloned villagers. **Rollback:** reverting the feature PR restores the old pipeline; saves with unknown optional scene fields must be safely handled by the supported save-format policy.

## 5. Performance and determinism

- Hot tick when inactive: constant-time comparison and no allocations/scans; after start max 10 current participants.
- Eligibility and target assignment: once on candidate rare day after a cheap day/clock/cooldown guard; O(N) pass, stable sort only bounded nearby eligible adults (prefer cap with nearest-K).
- No O(N²) calls from the human loop; resolve scene participant index ONCE before iterating humans and pass a small lookup/Set from existing tick context, never re-scan world for each participant.
- Camera/text overlay: RAF only while active, and no full-world scan every rendered frame. Each speaker is ID-resolved through existing catalog/index; no full UI entity-array filters in animation loop.
- No new simulation RNG consumption for presentation. Original work outputs/career/needs must not change during a paused performance.
- Add a large-colony benchmark and compare active/inactive tick performance; report actual measured figures, not invented targets.

## 6. Tests

| Scenario | Test | Expected |
| --- | --- | --- |
| Rare deterministic trigger, eligibility and cooldown | tests/spotlightLore.rules.test.ts | Same day/seed same event; wrong age/gender and unavailable actors excluded |
| Gathered positions and real movement | tests/spotlightLore.gathering.test.ts | <=10 walkable unique slots; humans genuinely approach; no teleport |
| Existing work/election/emergency gates | tests/spotlightLore.gathering.test.ts + existing festival tests | No displacement of critical duties |
| Script pacing, camera and skip | tests/spotlightLore.presentation.test.tsx | Wall time independent of sim speed; focus/restore; original pause preserved |
| Typed finish/skip idempotence | tests/spotlightLore.commands.test.ts | One completion, no double log, stale IDs rejected |
| Old-save/worker/rollback | tests/spotlightLore.saveWorker.test.ts + workerBoundary.closure.test.ts | Parity, deep copies and no RNG shift |
| End-to-end | existing scripts/autoplay_playwright_probe.py (extend only as needed) | Visible scene and no stuck pause |
| Scale | existing simulation/performance harness after verification | Inactive near zero overhead, bounded active actor set |

## 7. Required documentation/bug gates

- **OWNERSHIP_OVERVIEW.md:** spotlightLore exported functions, humanTick movement integration, App camera and scene overlay.
- **src/game/simulation/decisionRegistry.ts:** spotlightLore decision, actual cadence, callsites, writes and tests; don't register hypothetical behavior.
- **CHANGELOG.md:** concise feature entry in current version.
- **roadmap_V.0.6.5.2.md:** feature added as pending during implementation, only checked when merged.
- **docs/bug_report/readme.md + docs/BUG_REPORTS/SUMMARY.md:** follow required report/index protocol on any actual bug; include new and updated counts in PR description.
- **This file:** keep AS-IS/TO-BE and migration map current with verified implementation decisions; do not create duplicate architecture documents.

## 8. End-of-PR handover

Report DONE/BLOCKED; PR/commit; implemented observable scene; each touched owner; worker/save migration; exact PASS/FAIL/NOT RUN checks; run-time screenshots/observations; performance measurements; changelog/roadmap status; bug report counts; cleanup; open risks. Do not report this planning-only PR as implementation.

## 9. Final review gate

- [ ] Full scene exists in code, not just this document.
- [ ] True actor walking and exact unique 6–10 adults, centered camera, relaxed readable one-by-one dialogue.
- [ ] Paused time is wall-clock driven and never modifies gameplay needs/social state.
- [ ] Proper transitions, completion/skip, original speed/pause/favorite/camera restoration.
- [ ] Existing worker, fallback, old saves, pause/resume and headless tests pass.
- [ ] No duplicated movement, dialogue, camera or event-log owner; no O(N²) tick loop.
- [ ] Both registries, changelog, roadmap and bug index correct; no unrun test claimed.
- [ ] Merged to main before marking roadmap complete.
