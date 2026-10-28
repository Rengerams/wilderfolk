# Wilderfolk — The Look: rare juvenile spotlight lore (0.6.5.2)

**Document type:** feature architecture and executable codebot implementation contract, derived from [CODEBOT_FEATURE_TEMPLATE.md](CODEBOT_FEATURE_TEMPLATE.md).  
**Status:** Base Spotlight event and choreography implemented on PR #91 branch (not merged); PR #93 canonical parser/binder integrated, focused tests authored, CI and browser not yet verified. Historical AS-IS describes main before this feature; the new choreography contract at the top supersedes conflicting historical TO-BE details.  
**Authority:** AGENTS.md, docs/command.md, OWNERSHIP_OVERVIEW.md and simulation/decisionRegistry.ts.  
**Evidence:** examined main at 688047375fb9a9ed966059d66c25add867912297 on 28 October 2026. Verify the live base again before editing.

## Cinematic reveal and soundtrack (28 October 2026)

**Implemented in source, pending full audio asset deployment:** the show starts only after all selected villagers arrive. Timeline: **0 ms full-viewport blackout; 500 ms hidden camera focus; 1450 ms spotlight on heroine; 1650 ms instrumental playback request; 1850–4800 ms light gradually returns; 4800 ms first adult caption**. The existing 44 dialogue captions, two seven-second show-offs, hearts and kiss marks, exit camera follow and 6.4-second applause are unchanged. All presentation time is wall-clock only; never tick the simulation or modify world positions. The real instrumental lasts **232.53 seconds**, longer than the scene, so fade its music at applause rather than stretching every caption or looping a second song. `src/audio/spotlightMusic.ts` temporarily replaces gameplay music and restores previous settings safely at skip/finish. The soundtrack file must exist at `public/audio/music/spotlight-lore.ogg`; asset delivery is outstanding, despite the completed source integration.

## Choreography change request — implementation contract, 28 October 2026

**Status: IMPLEMENTED IN PR #91 SOURCE, NOT YET CI/BROWSER VERIFIED.** This section is the authoritative coding contract for the choreography implemented on the PR #91 branch. The trigger stays **Saturday/Sunday 19:00, 7.5% deterministic roll and 90-day cooldown**. Do not merge or mark release-complete without verified tests and browser playthrough. The earlier AS-IS and original TO-BE below are retained as historical context; where they disagree on timing, dialogue ownership or staging, **this choreography specification takes precedence**.

### A. Required chronological screenplay

The girl is a real **12–17-year-old** settler, and the 6–10 gathered **adult men** are the actual chorus. The performance is whimsical and age-appropriate, not romance, attraction or gameplay courtship. The user-provided refrain anchors below indicate **specific beats**, not a license to attach music, alter fertility/relationship state or add a new simulation system. The user-provided instrumental begins behind a black-screen camera reveal and plays under the spoken sequence; it stops before the separate real applause recording.

| Beat ID | Trigger/caption anchor, in strict sequence | Girl / chorus / presentation action | Timing and effects |
| --- | --- | --- | --- |
| `opening` | Existing opening captions | Adults each deliver their own line in the authored order | 4.8-second opening: black screen, hidden focus, spotlight, music cue and visual reveal, then readable captions |
| `juvenile-reply` | First “She's a juvenile scam!” | **Immediately next caption belongs to the heroine herself:** “Yes, Juvenile Scam! But look at me!”; then resume the next normal adult line | A complete caption with the heroine's name; no overlap or extra simulated chat |
| `first-look-pose` | **First** “She's got the look!” in the opening verse | Girl proudly makes a **small circular show-off walk**, returning to her stage origin | **Exactly 7,000 ms** dedicated pose after the current caption; freeze/hold subsequent captions, resume the next authored line only when the pose ends |
| `first-chorus` | Paired “She's got the look” call-and-response (two adult voices, repeated), the brown-eyed/blue, “I'll do for you”, and la-la-la responses | Adult chorus talks in turn. **Cartoon hearts and kiss-mark icons** originate visually near the girl and drift playfully toward the chorus while these captions play | Particle emitter on for this whole defined chorus interval only; no actual kisses or relationship interactions |
| `second-look-pose` | The later **“She goes (na na na na na na)” → “She's got the look”** exchange | Girl makes the **second small circular show-off walk**, then returns to her stage position | **Exactly 7,000 ms** after the specified later look caption; next text waits; no accidental trigger on every repeated refrain |
| `bridge-hearts` | Later “What in the world can make you so blue”, “I'll do for you” and “And I go la-la-la (na-na-na)” section | Hearts and cartoon kiss marks surround the girl and drift around the ring of adult singers | Restart/continue emitter through this segment; visual only |
| `farewell-walk` | Subsequent “She's got the look” leading into the repeated **“She goes” / “She's got the look”** outro | Girl begins **walking slowly away from the semicircle** while adults continue their authored lines, and the camera smoothly tracks **her**, not the stationary chorus; hearts and kiss marks **remain active until the finale** | No text delay for the final walk; it overlaps the final chorus. Smooth, bounded departure; keep the city visible |
| `final-heroine` | Last “She goes (na na na na na na)” and the **final ending**, no extra adult refrain after this beat | **Girl gets the last word:** “I've got the looks!” in her own caption; the chorus stops, and the scene proceeds to applause | Particles persist through her final line, fade out on applause; closing applause is now 6.4 seconds, including a 6.1-second real crowd-cheering SFX sample, visible clapping and a small heroine bow |
| `finish` | Applause/skip/scene replacement | Restore camera, favorite, pause and speed once if this session still owns them | Exactly one existing typed finish/skip command; no gameplay reward |

**Ordering rules:** The first look pose is attached to the first qualifying look caption, **not** every repeated look. The second look pose is attached only to the later `She goes` sequence. The girl must speak the juvenile comeback and final boast herself; do not assign these to `speaker_1`. Preserve the user's requested later sequence, even though the existing 31-line mixed joke script does not yet contain every specified “She goes”/outro beat. Existing humorous interruptions may remain only if they do not break the ordered required beats; the final spoken line must be the heroine's. Never encode a new verse or repeated caption in TypeScript.

### B. Content data, identity and pipeline contract

1. **One caption source of truth:** `src/game/data/dialogue/spotlight-lore.json` is the canonical JSON 1.3 authored text, including any newly requested scene lines and the heroine's two responses. The React overlay's current `const LINES = [...]` is temporary legacy and **must be removed at implementation**. Do not copy text into an animation file or component.
2. **Speaker contract:** `speaker_1` through `speaker_10` are distinct selected **adult male** chorus *roles*, assigned deterministically to the available six-to-ten adult IDs; all gathered adults must voice at least one line. Add the explicit **`heroine`** role to the scene and bind it to `scene.heroineId` using a Spotlight-specific read-only adapter. Never count the heroine as one of the required six adult voices, invent an extra actor, or select a random man to say her lines. Reuse the merged PR #93 `readPresentationDialogue` and `bindNumberedPresentationSpeakers` helpers; the optional heroine ID is checked independently from adult roles. If the current validator only accepts numbered speakers, update the validation and the Spotlight-specific adapter together; **do not weaken all dialogue tree validation**.
3. **Presentation cues** belong to one typed, read-only metadata manifest such as `src/components/spotlightChoreography.ts`, referenced by **stable cue IDs** and canonical caption identities. It contains no copied caption text: `first-look-pose` / `second-look-pose` (7,000 ms), `juvenile-reply`, particle interval begin/end, `farewell-walk`, `final-heroine`. Include a strict startup/test audit that all mandatory cues resolve **exactly once**, are ordered, point to existing captions and are non-overlapping where required. Don't use brittle hardcoded line numbers against future script edits. If stable caption IDs require extending schema 1.3, do it as a strictly typed, optional presentation-only field with tests in the pipeline owner.
4. **One deterministic timeline:** render only one visible speech bubble at once. Normal captions retain the current 3.0–5.3-second length-based timing; a pose has its own full seven-second wall-clock step **after** the relevant caption, without accelerating the next line. The comeback is a normal line, and the farewell walk and particle cues overlap captions. Intro 4.8 s / applause 6.4 s (real crowd recording on SFX bus, mute/volume aware). Use the same monotonic elapsed-time clock in pause, at 0.5× or 10×, and after React rerenders. Skip/unmount cancels all animation frames/timeouts. Total duration is **not** the old fixed 107 seconds: recompute from the final JSON and the two extra seven-second holds.
5. **Do not mix responsibilities:** the canonical dialogue bank owns words/roles, the Spotlight presentation manifest owns cue timing/sequence, `spotlightLore.ts` owns the persisted event/state, `humanTick.ts` owns ordinary world movement, `App.tsx` remains the sole pause/camera state controller and the overlay owns transient effects. No competing session writer or parallel full-song playback.

### C. Physical appearance, camera and collision contract

- **Stage circles (twice, seven seconds each):** Animate the *visible existing heroine* in a small loop around her real stage location, with an expressive “look at me” turn/pose. No teleport, no second permanent character, and no new world tick. Use a single presentation-only *render offset* derived from the wall-clock choreography (a smooth loop, bounded radius, exactly returns to its origin). The rendering path must draw her **once** using the existing juvenile art and must respect draw order and terrain occlusion. If reusing the existing render layer is necessary, pass a presentation transform into the render projection instead of mutating `Entity.x/y`, `WorldState` or worker-owned SoA.
- **Final walk:** During the repeated outro, interpolate a smooth slow *presentation-only* displacement away from the semicircle (bounded distance, e.g. 20–35 world units over the remaining finale, after evaluating unobstructed terrain). Validate a walkable departure corridor using the canonical world grid once; if blocked, choose a safe alternative or do an in-place theatrical exit. **Never pass through walls/water** and never consume gameplay movement speed or clock ticks. The authoritative girl remains at her previous saved x/y after completion/skip.
- **Camera follow:** `App.tsx` retains camera ownership, snapshot and restoration; while the farewell runs, the presentation sends only a bounded, latest **visual heroine target** to that controller. It uses existing `GameLoop` camera view/lerp/clamp at render cadence (not a React state update or worker command per animation frame). Avoid a second camera owner, avoid instant snapping, keep the girl and a little of the village visible. The speech bubble, halo and particles use the **same current presentation-space heroine coordinates and the live `loop.getView().camera`**, not a stale React snapshot.
- **Hearts and kiss marks:** purely comic, non-romantic stage particles. Emanate from the girl's displayed position; visually drift toward adult chorus / around the girl without conveying affection or triggering any relationship system. A single deterministic seeded emitter, capped at **24 concurrent elements** and at most **6 emitted per second**, with finite lifetimes and a viewport-bounded draw area. One user-provided applause audio excerpt is stored as a local Ogg asset for the final applause; no additional music or photo assets required. Particles begin in `first-chorus`, stop in the gap, resume in `bridge-hearts` and continue across `farewell-walk` to applause. CSS/DOM or an existing lightweight graphics owner is fine, but do not create unbounded React per-frame state updates.
- **Exit/cleanup:** exact scene ID + session revision govern the controller. Skip, app unmount, loss of actor, load/new game or world replacement stops both pose and particle effects and invalidates captured camera controls before restore. Preserve old-save/worker parity with **no new persisted fields**. No fertility, attraction, heart sprites in gameplay simulation, worker effects, pathfinding changes or permanent actor relocation.

### D. Mandatory implementation/tests and review evidence

| Test area | Required executable proof |
| --- | --- |
| Authored script | Final JSON source contains all specified sections in order, including exactly **one** `juvenile-reply` and **one** `final-heroine`, correct `heroine` role, complete role mapping for 6/7/8/9/10 adults; no hardcoded React duplicate of captions |
| Timing | Fake monotonic clock: first pose exactly 7,000 ms, second pose exactly 7,000 ms; no caption transition mid-pose; before/after boundaries checked; normal caption pacing maintained; skip cancels timers |
| Movement/visual | Two loops return exactly to origin, no extra world/entity movement or sprite double-render; final walk moves visibly *away*, stays on safe ground; camera smoothly follows projection |
| Heart cues | Emitter on exactly during first chorus + bridge through finale, off during gap; cap/lifetime enforced, all removed on skip, completed applause and session switch |
| State and parity | Identical presentation timing under speed 0.5×/10× and main/worker mode; world.tick, Entity positions, traits, needs, inventory and relationships unchanged during paused show; saved scene fields compatible |
| Real UI | Browser smoke on the real map: six and ten performers, heroine's visible two interjections, both seven-second circles, chorus effects, final walk/camera tracking, skip/finish/reload; camera restore confirmed |
| Governance | Update implementation architecture, owner overview, decision registry, `CHANGELOG.md` and PR #91 report after coding; bug reports and their index only when defects are actually confirmed; exact new/updated count in PR description |

**Release gates still outstanding:** focused presentation tests, schema/parser tests shared with PR #93, `npm run test:standard`, types, lint, production build, browser worker/fallback pause/skip/load smoke, and diff review for unrelated gameplay drift. Mark all as **NOT RUN** until results exist. Avoid code or test changes in PR #93 merely to stage this plan; integrate when both branches can share the same canonical dialogue contract.

---

## 0. Feature contract

| Item | Decision |
| --- | --- |
| Name | The Look — spontaneous village spotlight |
| Result | Rarely, an eligible girl aged 12–17 is unexpectedly celebrated by 6–10 actual nearby villagers; they gather, the camera follows, and a comic call-and-response performance unfolds at a relaxed real-time pace. |
| Origin | Direct user request, 28 October 2026; user explicitly allows pausing the simulation. |
| Target version | 0.6.5.2 per current AGENTS.md; working baseline 0.6.5.1. |
| Status | PR #91 branch implements the base gathering and new two seven-second show-off circles, heroine replies, bounded hearts/kisses and the visual walkaway finale; CI/browser validation still required. |
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
| Speech | src/game/humanChat.ts formatChatLine and worker-owned chat sessions; PR #93 dialogueTrees.ts supplies canonical JSON 1.3 event/presentation reader | Current overlay uses temporary hardcoded captions; game simulation owns speech only in normal ticks | Reuse presentation reader after PR #93 integration; no paused chat mutation, no duplicated JSX captions |
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

1. **Rare weekend gate (implemented):** check only at the start of **19:00 on Saturday/Sunday**, when no active spotlight. The deterministic `personDayRoll` threshold is **7.5%**, cooldown **90 calendar days** after a valid scene starts. At most one candidate scan per eligible day and no new global RNG or UI roll. The planned choreography changes none of these values.
2. **Focal girl:** alive player human, gender female, integer/finite age 12–17, isJuvenile, not asleep, bedridden, imprisoned, deployed, indoor, fleeing or taking an essential obligation. Pick deterministically from eligible focal girls. If none, no scene and no cooldown spend.
3. **Chorus:** 6–10 adult >=18 available player humans in local range; choose stable nearest distance, tie by ID, and cap before planning slots. Reject on-duty workers, soldiers on post, school staff on duty, patients, prisoners, deployed, transforming howlers, active political gatherings and threats. Avoid forced reassignment of work, residence, job or social sessions. If fewer than six, do not fire.
4. **Gathering (implemented):** heroine remains at her real walkable position while six to ten actual adults follow stable semicircle slots via existing pathfinding. No teleport, no second movement writer. The actual source timeout is **65 simulation ticks** (not the initial 40-tick proposal); wait for **every** selected performer and the heroine, else abort.
5. **Camera:** while gathering, smoothly focus on heroine at zoom ~1.65–1.9 clamped to map viewport. Keep town visible and show no separate panel. During scene, do not fight favorite-follow or user drag/zoom; lock relevant input or cancel scene on player intervention, clearly choose one behavior in implementation.
6. **Ready:** the authoritative simulation sets phase ready. The UI waits for the ready snapshot, saves camera/favorite/paused/speed, then pauses via GameLoop.mutateWorld. The UI timeline progresses by elapsed *monotonic wall-clock time*, not world.tick, so at 0.5x–10x no dialogue is rushed and no simulated day passes during narration. Use one bounded requestAnimationFrame or timer path with proper cleanup on session change/unmount. Detect loss of UI controller and make ready scenes auto-expire in headless mode after a bounded number of sim ticks.
7. **Lines and choreography (implementation required):** the baseline contains 31 original captions at 3.0–5.3 seconds each. Migrate them into the single canonical JSON source; incorporate the user's explicitly requested additional lines and two **spoken heroine replies**. Add the two exact seven-second circular solos, cue-limited stage particles and slow camera-followed exit exactly as specified in the top choreography chapter. Adult roles are six-to-ten distinct actual settlers, heroine independently bound; one visible bubble at a time. **Cinematic instrumental soundtrack plays only during the Spotlight presentation.**
8. **End:** pause timeline ends after final flourish/applause, call ONE typed finish command, log one canonical chronicle ending in logEvent, clear scene, then restore captured camera/favorite and original paused/speed values. User skip invokes the same idempotent command, cannot double award anything (there are no rewards). If original pause was true, keep it true. If another overlay/session took control, do not restore stale camera or pause state.
9. **Headless/parity:** active gathering/ready state serializes and transports, even if there is no UI. A ready scene that is not actively paused by a presentation controller auto-ends after a bounded number of sim ticks. Loading a save mid-scene should allow re-entry/skip, or reject malformed partial state cleanly; never leave an unfinishable paused save.

### 2.3 Function migration and signatures

| AS-IS | Action | TO-BE call / ownership | Writes | Test |
| --- | --- | --- | --- | --- |
| Rare spotlight trigger (already on PR #91) | KEEP | `spotlightLore.maybeStartSpotlightLore(state: WorldState): boolean`; 19:00 weekend start, 7.5% and 90-day cooldown | Scene fields; logEvent via owner | `tests/spotlightLore.test.ts` |
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

- Seeded quiet village, Saturday **19:00**, 1 valid girl and 8 available adults: exactly 1 gathering starts when rare roll hits, exactly 8 unique adult IDs, valid target cells; after every participant arrives the sim pauses and the complete scripted, heroine-inclusive chronology runs one caption at a time with bounded visual cues.
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
5. **Implemented in PR #91 (verification pending):** replaced the overlay's hardcoded `LINES` with canonical JSON 1.3 presentation reading, add explicit heroine binding and a separately typed ordered cue manifest, implement the two seven-second presentation-only loops, light comic stage particle effects and a safely bounded exit with camera following. Preserve the existing map, renderer, paused worker, live speaker positions and prior state restoration under skip/reload/switch/unmount. Full exact requirements are in the top choreography chapter.
6. Update BOTH ownership overview and decisionRegistry, linked tests, brief changelog entry (<=300 chars; no file/path essay), this architecture if reality differs, and roadmap as **not completed until merged**. Read docs/bug_report/readme.md, file confirmed defects, update docs/BUG_REPORTS/SUMMARY.md. Include exact new/updated bug counts in PR body (0 if none).
7. Run targeted Vitest, worker boundary, npm run test:standard, npm run test:types, npm run lint and npm run build only if currently declared; inspect npm scripts first. Check real browser/Playwright with overlays and worker enabled, 0.5x and 10x. Do not claim any check not actually run.
8. Report PR URL, test results, screenshot/observation, baseline performance, any blockers; do not merge before green and review.

**Target after implementation PR is verified and merged:** A complete, deterministic occasional lore scene using actual villagers, no gameplay effect or fake popup with cloned villagers. **Rollback:** reverting the feature PR restores the old pipeline; saves with unknown optional scene fields must be safely handled by the supported save-format policy.

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
