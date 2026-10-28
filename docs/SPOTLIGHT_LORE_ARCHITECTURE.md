# Spotlight Lore Architecture — The Look (v0.6.5.2)

**Status:** implemented on development PR [#91](https://github.com/Rengerams/wilderfolk/pull/91), **not merged**. This describes the actual branch-level design, including deliberate differences from the original [feature implementation plan](plans/spotlight-lore-2026-10-28.md), not a claim of passing release or browser verification.

**Authority:** `AGENTS.md` · `OWNERSHIP_OVERVIEW.md` · `src/game/simulation/decisionRegistry.ts` · `docs/command.md`. The roadmap is a merged-feature implementation register, not a test ledger.

## Purpose

Occasionally, an eligible female juvenile (12–17 years old) becomes the accidental center of attention. Six to ten available adult residents approach the real person on the town map, gather in a semicircle, and perform a deliberately awkward, comedic call-and-response. The map remains visible; the camera centers on the girl. The simulation can pause for slow readable spoken captions, independently of game speed; skip and natural completion return the simulation to its prior settings. Pure lore: no material reward, affection/romance side effect, career change, reputation or resource mutation from presentation.

## Choreographed Spotlight finale (implemented on PR #91 branch, CI not verified)

**Source of requirements:** [Spotlight feature implementation plan — choreography change request](plans/spotlight-lore-2026-10-28.md#choreography-change-request--implementation-contract-28-october-2026). This section describes the **PR #91 implementation** on the unmerged branch. The hardcoded React `LINES` mirror has been removed: `spotlight-lore.json` now provides all 44 captions (including the heroine). The renderer has frame-local positioning for the existing sprite, both poses, particles and a safe visual farewell. **No CI or browser verification has been completed in this pass.**

### Recorded applause — 28 October 2026

The previous 2.8-second text-only applause has been replaced with a **real 6.1-second excerpt** from the user's uploaded `freesound_community-crowd-cheering-6229.mp3` (original 12.912 s). The sound starts exactly at the 6.4-second applause phase after the heroine's final caption. It is stored as a real **8.2 KB** local Ogg/Opus asset at `public/audio/sfx/spotlight-applause.ogg`, registered in `src/audio/tracks.ts`, and decoded by `src/audio/spotlightApplause.ts` into the game's existing Web Audio SFX bus. The audio honors mute and soft/normal/loud presets and can be stopped immediately by Skip, unmount or a colony replacement. Chorus members gain transient, screen-space clapping indicators; the original heroine sprite makes a small display-only bow. No worker/WorldState changes.

**Source and license:** [“Crowd Cheering” by SoundsExciting (Freesound), via Pixabay](https://pixabay.com/sound-effects/people-crowd-cheering-6229/), supplied by the user; free use subject to the Pixabay Content License. The six-second game excerpt is mono Opus, audio fade-out over its final 0.5 seconds. The player-supplied original remains untouched; the compact game excerpt has a SHA-256 checksum pinned by `tests/spotlightApplause.test.ts`. **Runtime/browser checks remain pending.**

### Ordered visual storyboard

1. **Opening and heroine comeback:** existing dialogue proceeds one adult at a time; directly after the early juvenile-scam caption the girl herself adds “Yes, Juvenile Scam! But look at me!” The explicit `heroine` speaker role binds to `spotlightLore.heroineId`, distinct from six-to-ten adult `speaker_1..speaker_10` roles.
2. **First look caption:** after the **first** look refrain, pause the next caption for a **7-second** small circular, proud “look at me” walk. Return the girl's visible position exactly to the starting point before continuing the text.
3. **First call-and-response chorus:** adult look-refrain responses plus the blue/you/la-la-la passages. Show playful **cartoon heart and kiss-mark particles** originating around the girl's *displayed* sprite and drifting toward the male chorus in a purely theatrical, age-appropriate effect. No courtship/affair/relationship fields or interactions.
4. **Second look caption:** after the **later** “She goes” + look refrain, repeat the **7-second** circular solo, again withholding the next caption until the solo finishes. It must trigger on this exact second cue, not on every repeated refrain.
5. **Bridge and renewed hearts:** later blue/you/la-la-la passages restart the hearts and kiss marks around the heroine. Unlike the first chorus, they **remain active through the rest of the finale**.
6. **Walking finale:** on the final later look refrain the girl slowly leaves the semicircle. The camera follows her projected walking position smoothly while the adults continue the repeated “She goes”/look refrain and she visibly moves away.
7. **Final girl's punchline:** on the final “She goes” beat, **the heroine**, not an adult, says “I've got the looks!” as the final spoken line. Visual effects disappear as the 6.4-second audible applause begins; an actual crowd cheer plays while the adults show animated clapping indicators and the girl makes a small bow. The existing typed finish command ends the scene and returns control to the prior view/speed/pause once.

Each cue must have a **stable symbolic ID** such as `juvenile-reply`, `first-look-pose`, `first-chorus`, `second-look-pose`, `bridge-hearts`, `farewell-walk` and `final-heroine`. Resolve cue IDs once against canonical JSON captions with strict validation, not substring matching or ambiguous repeated phrases. A script that lacks a required beat, changes its order or assigns a heroine line to an adult must fail its tests rather than silently dropping an animation.

### Contract boundaries for implementers

| Owner | Required behavior | What it must never do |
| --- | --- | --- |
| `src/game/data/dialogue/spotlight-lore.json` (PR #93 adapter integrated) | Canonical source of 44 captions, stable IDs, cue tags and adult/heroine roles. Parsed once using the merged PR #93 `readPresentationDialogue`; cue timing stays in `spotlightChoreography.ts` | Maintain a second text array in JSX or copy lyric strings into timing logic |
| Spotlight-specific typed presentation adapter | Bind **exactly 6–10 distinct adult IDs** plus the independently bound **heroine ID**; all selected adults speak. Uses PR #93's strict schema 1.3 validation and heroine-aware deterministic binder | Relax global solo/pair bank constraints or identify the heroine as `speaker_11` |
| `src/components/spotlightChoreography.ts` (implemented cue manifest/timing owner) | Stable caption-to-animation cue mapping, deterministic beat ordering, exactly two 7,000 ms pose steps, variable normal line lengths | Become a parallel dialogue writer or touch `WorldState` |
| Existing map renderer + `SpotlightLoreOverlay.tsx` | One visible heroine rendered with a presentation-only position/rotation transform; timed circles, safely validated slow farewell and **bounded** heart/kiss-mark particles | Draw a second heroine, directly mutate `Entity.x/y`, create a gameplay tick, or run music |
| `App.tsx` + GameLoop existing camera/view APIs | Remains sole live camera/pause state owner; follow *presentation-space* heroine position smoothly, clamp to world, restore snapshot once | Spawn independent camera loop/owner, overwrite newer session's settings or issue worker commands per video frame |
| `src/game/spotlightLore.ts` / `humanTick.ts` | Continue to own the weekend 19:00 event gate and actual gathering movement. No persistent changes for the paused show | Move a girl in saved gameplay during 7-second poses or emit simulated romance effects |

**Clocks:** The scene still starts by a deterministic 7.5% weekend **19:00** gate with a **90-day** cooldown, gathers with the existing **65 sim-tick** limit, and presents itself by real wall-clock time while simulation ticks are paused. The completed choreography adds two exclusive **7,000 ms** holds to the otherwise length-scaled 3.0–5.3 second captions. The intro remains 2.4 seconds, and the final applause is now **6.4 seconds** (a **6.1-second uploaded crowd cheering excerpt** plus a short tail). Because new JSON captions are required, **the final real-world duration must be measured again**, not copied from the original 31-line timing.

**Visual movement while paused:** The game's authoritative `Entity` remains at her saved location. The presenter derives a presentation-only offset and optional orientation for the *existing drawn figure*, with the source position restored exactly after each circle and the end of the scene; the camera and bubble/halo/particles consume the exact same projection. Do not let visual offsets survive load, skip or session change. Prevalidate the farewell corridor against the existing path grid; keep the departure small (approximately 20–35 world units, bounded by remaining captions), choose a clear corridor or perform a safe theatrical departure on the spot. No duplicate sprite or worker-owned world mutation.

**Effects/performance:** Use a single deterministic emitter only in specified intervals, at most **6** new hearts/kiss marks per real second and **24** live elements. Mark icons noninteractive. Cancel its clock and clear the buffer on component teardown, skip, replacement or completed applause. Avoid full-world entity scans or React state writes every frame; use the presentational animation frame that already positions bubbles and halo.

**Source changes exist; execution verification pending:** Verify every choreographic event and exact ordering with a fake monotonic clock, JSON 1.3/heroine-role binding for cast sizes 6–10, both 7,000 ms pauses, single-figure draw ownership, no collision crossings, live smooth camera follow, continuous final effects, actual worker/fallback presentation after pause, skip and reload cleanup, and untouched gameplay/world positions/needs/relationships. A real browser run on the map is mandatory before this can be marked implemented. The coding plan contains the full test matrix and PR governance requirements.

---

## Canonical implementation ownership

| Concern | Sole authority | Data and cadence |
| --- | --- | --- |
| Rare event rule, eligibility, deterministic lineup and slots | `src/game/spotlightLore.ts` | `maybeStartSpotlightLore`: O(1) inactive guard, deterministic daily roll at weekend 19:00, selection scan only when rare roll passes |
| Gathering progression, clean abort, one-time Chronicle event | `src/game/spotlightLore.ts` | `tickSpotlightGathering`, `finishSpotlightLore` |
| Physical movement | `src/game/humanTick.ts` | `tickHumans` remains **the only** simulated x/y and velocity integrator |
| Scheduling | `src/game/tickLayerRealtime.ts` | Calls start before `tickHumans` and checks arrival after it |
| Saved model | `src/game/gameTypes.ts`, `src/game/saveSchema.ts`, `src/game/saveLoad.ts` | Optional `WorldState.spotlightLore` + `spotlightLoreLastDay`; loads validate shape and participant eligibility |
| Worker/fallback parity | `src/game/simWorker/simPrep.ts`, `src/game/simBuffers/simDelta.ts`, `src/game/simWorker/commands.ts` | Delta + deep rollback projection and idempotent typed finish command |
| Camera, pause and session lifecycle | `src/App.tsx` | Existing `GameLoop` camera focus and `mutateWorld` pause; captures previous controls; session revision forces recapture and remount on same-scene reload |
| Caption timing and on-map presentation | `src/components/SpotlightLoreOverlay.tsx`, `src/components/spotlightChoreography.ts`, `src/components/spotlightFarewell.ts` | Single real-time RAF cue timeline, 44 JSON captions, 7-second loops, safe walk, 24 capped decorative particles and live camera/bubble projection; **does not** write simulation chat state |
| Old view snapshot consumption | `src/components/spotlightReturnState.ts` | `takeSpotlightReturn` consumes once; `discardSpotlightReturn` invalidates on session replacement |

**Dependencies:** `gameTick → tickLayerRealtime → spotlightLore → logEvent`; `tickLayerRealtime → tickHumans` (read-only scene target); `App → GameLoop + SpotlightLoreOverlay`. No UI import in the simulation. No separate movement update loop. Do not add a duplicate lore/raid event log.

## State machine and clocks

```text
No active scene
  └─ weekend 19:00 + no conflict + 90-day cooldown + seeded rare roll
      └─ eligible girl + 6–10 nearby adult players + walkable distinct slots
          └─ scene.phase = gathering, scene.startedAtTick = world.tick
              ├─ danger / invalid participant / timeout ⇒ abort + clear scene
              └─ EVERY selected speaker and the heroine reach their slots ⇒ scene.phase = ready
                  └─ App focuses camera and pauses GameLoop simulation ticks
                      └─ independently timed screen-space dialog captions
                          ├─ user Skip ⇒ finishSpotlightLore(skipped)
                          └─ closing applause ⇒ finishSpotlightLore(complete)
                              └─ scene = null, Chronicle entry on completion
                                  └─ restore prior camera/favorite/pause/speed ONCE
```

The girl stays at her actual in-world location. The performer IDs and target coordinates live in one small saved scene record. Only the <=11 world-unit arrival threshold and original movement integrator decide who arrives. The current branch waits for **every selected performer and the heroine**, not merely the minimum of six. Stage targets remain active through the ready phase so catch-up ticks cannot send participants home before the UI pauses. Eligibility and physical stage attendance are checked in ready; if emergency movement displaces a singer or the heroine before the UI pauses, the scene aborts rather than starting with a missing actor. Saved ready scenes with dispersed casts are rejected during load normalization, but valid gathering saves continue to resume walking. A new festival also aborts the scene. At most 65 simulation ticks are allowed for gathering, after which it aborts; the ready phase has a bounded 150-tick headless fallback. During the UI performance, game ticks pause and captions advance by **real wall-clock time**.

**Current PR #91 choreography:** The stage reads 44 canonical JSON 1.3 captions at 3.0–5.3 seconds each, including the two heroine lines, with two separate 7-second visual solo holds, a 2.4-second introduction and 2.8-second applause. The computed wall-clock duration at this commit is approximately **2 minutes 46 seconds** excluding gathering. No music playback. One user-provided crowd-cheering SFX excerpt (Opus, 6.1 seconds) is stored as a local Ogg asset and played over the existing SFX bus. The legacy `const LINES` JSX mirror has been removed.

### Movement priority (Codex P2 #4401308618)

Ordinary home preference, home/hotel commute, school/work relocation, social/free roam, secondary hunting, child leisure, patient movement and idle stamina-break movement must not overwrite the scripted gathering vector of selected participants. `humanTick` resolves a single `inSpotlightGathering` flag from the saved participant IDs. That flag protects only the participating entities: nonparticipants' AI is unchanged. Genuine danger and flee behavior retain higher priority, and unsafe events should abort the scene rather than transport characters. This resolves the source-level P2 bug where weekend stay-home logic took over movement after the spotlight branch. Regression uses a weekend home-preferring resident and the **real `gameTick` path**.

### Obstacle-aware stage travel (Codex P2 #4404687464)

A selected participant still owns only one movement decision in `humanTick.tickHumans`. Its scene-and-actor-stable path key passes the exact saved stage point to `pathfinding.steerWithPath`, which reuses the existing cached, bounded A* route only when the straight leg is obstructed or an existing road detour is useful. Routed velocity survives untouched; on an open direct leg the original `config.speed * 1.2` vector remains. An unreachable leg stops rather than forcing motion through the barrier. `applyHumanWalkStep` integrates the velocity exactly once and checks the same wall/water grid. The 9-pixel steering stop, 11-pixel ready radius, 65-tick gathering timeout, 90-day cooldown, danger priority and saved scene schema are unchanged. Two real `gameTick` regressions put a completed wall or river cell between one actor and their slot and assert arrival with no obstacle crossing or doubled steps. CI/browser verification pending.

### Live render-camera positioning (Codex third P2)

The existing GameLoop keeps smoothing its rendered camera while paused. React's `view.camera` may be stale because the game session intentionally skips React updates for presentation-only frames. The spotlight stage therefore reads the current `loop.getView().camera` through an accessor each animation frame; it projects the **already resolved** speaker/heroine positions using the canonical `worldToScreen` and updates three HTML styles only (halo, ring and speech bubble). This animation frame belongs solely to the mounted stage and is cancelled on unmount. It does not rerender React, scan every settler, write entity movement or advance the simulation.

### Established-affair steering (Codex P2 #4401703334)

A chorus actor may already have a mutual `affairPartnerId`; the later established-affair tryst route is independent of the new-affair branch and previously overwrote the scene's velocity. Both paths now exclude `inSpotlightGathering`; actual social relationship state remains in its existing owner and is not reset. A real-tick regression puts the lover opposite the spotlight slot, confirms the affair is otherwise eligible, then asserts the stage-directed velocity survives.

### Session isolation (Codex P2 #4401308629)

`spotlightReturnRef` belongs to the **current running colony session**, never to global save data. `App.tsx` invalidates it **before** either `replaceSession` call (new game or loaded save), because otherwise the subsequent `!scene` effect would mistakenly treat a loaded world as the old scene completing. Ordinary completion consumes the snapshot one time via `takeSpotlightReturn`. The loaded world's view and pause/speed must remain untouched. `tests/spotlightReturnState.test.ts` covers one-shot consumption and invalidation; the real React load flow still needs browser verification.

## Persisted contract

```ts
type SpotlightLoreState = {
  id: string;
  heroineId: number;
  performerIds: number[];
  phase: 'gathering' | 'ready';
  startedAtTick: number;
  readyAtTick?: number;
  gatherX: number;
  gatherY: number;
  slots: Array<{ humanId: number; x: number; y: number }>;
};
type AddedWorldFields = {
  spotlightLore?: SpotlightLoreState | null;
  spotlightLoreLastDay?: number;
};
```

All other data are derived or temporary. The optional fields are saved and normalized on load, carried through worker tick deltas and deep-copied for rollback. Old saves need no synthetic backstory. The client finish/skip command carries the scene ID; mismatching IDs cannot finish a newer scene. Changes to in-world population/needs are never driven by caption timers.

## Deviations from the original plan — explicit comparison

| Original intention in feature plan | Actual PR #91 design | Rationale / limitation |
| --- | --- | --- |
| Use existing renderer's overhead speech bubble | Screen-space React overlay positioned using `worldToScreen`, visually resembling chat; the renderer chat fields remain untouched | Pausing simulation would freeze tick-driven chat lifetimes; overlay is genuinely independent. Visually validate anchoring and zoom in browser |
| Separate skip/complete scene controller | `App.tsx` owns camera/pause transitions, a small snapshot helper owns consume/discard | Avoid a second camera/worker state owner; snapshot must be invalidated before session switch |
| No visible interruption of work and life | Per-actor movement exclusion while gathering (home preference and leisure included), with higher-priority emergency paths remaining | Fixes codex P2 and avoids a half-gathered chorus; selected agents temporarily defer ordinary free-time destinations |
| Abort after about 40 gathering ticks | Hard bound 65 ticks | Provides more time for genuine walking from the initial 100-unit local selection radius; still bounded. Consider adjusting after measured browser runs |
| Create an original in-world comic adaptation | User-supplied lyrical lines plus original comedic interruptions | Current screenplay mixes requested material with additional jokes; no audio license is claimed |
| Pace around 90–120 seconds | Fixed 31 line durations (3.0–5.3s) + intro/outro | Presentation is deliberately unhurried; actual duration may exceed the original rough target. Validate with human viewing |
| Real actor speech on map | Position-tracked HTML captions for one selected speaker at a time | No clone sprites, no sim chat mutation; speech **not** drawn by `renderer/humans.ts` |
| Automatically revert to previous view/pause on finish | Restore only normal same-session completion; discard on new/load session | Required to preserve loaded save's own state, Codex P2 #4401308629 |

## Non-goals and limitations

This does not create romance, XP, relationships, physical voice audio, special spells, a gameplay minigame, a new map or a win condition. The current code uses a simple per-tick age/status check and blocks if there is an election, festival or raid. It has not demonstrated perfect availability filtering for every advanced duty type in a browser colony. The camera is centered on the subject but the stage still needs visual accessibility/viewport checks. Save while `ready`, worker-command delivery while paused, and fast session changes must also be verified with an actual running application before marking merged.

## Tests, reviews and release rule

- `tests/spotlightLore.test.ts`: deterministic trigger, unique gathering targets, all participants arrive, completion idempotence, load normalization, worker deltas, rollback; real `gameTick` regressions for home-preferring actors and completed-wall/water detours. The real-tick fixture must rebuild `entityById` and invalidate entity-type buckets when it replaces `initGame()`'s founder/wildlife population; use consistent actor birth dates and afternoon calendar markers. CI previously failed on stale test indexes, not on an observed live-scene abort. A subsequent PR-head CI run also found a test-only `ready` fixture that placed performers outside their stage arrival radius; the real-tick regression now uses stage-attending adults and a selected performer 10 units from their slot, preserving both movement checks and the 11-unit abort invariant. CI rerun is required.
- `tests/spotlightReturnState.test.ts`: snapshot consume-once, discard before saved-game/new-game replacement.
- Existing ownership, import cycle, TypeScript, standard tests and build: rely on **finished CI status**, not assumed PASS.
- Full browser run with active worker, viewport zoom, pause/skip, actual actor movement, load-during-scene and fresh-session controls remains a release gate.

Relevant reviewed bug reports: [premature six-of-eight staging](bug_report/2026-10-28-spotlight-chorus-starts-before-all-arrive.md), [home-commute override](bug_report/2026-10-28-spotlight-home-commute-overwrites-gathering.md), [old-colony UI restoration](bug_report/2026-10-28-spotlight-restores-old-colony-camera-on-load.md), and [camera easing projection](bug_report/2026-10-28-spotlight-overlay-camera-projection-stale.md), and [established-affair movement](bug_report/2026-10-28-spotlight-established-affair-overrides-movement.md).

**Acceptance:** keep the roadmap item **unchecked** until PR #91 is merged into `main`. Architecture describes the branch; it is not evidence of production readiness.
