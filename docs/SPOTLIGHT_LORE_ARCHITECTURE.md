# Spotlight Lore Architecture — The Look (v0.6.5.2)

**Status:** implemented on development PR [#91](https://github.com/Rengerams/wilderfolk/pull/91), **not merged**. This describes the actual branch-level design, including deliberate differences from the original [feature implementation plan](plans/spotlight-lore-2026-10-28.md), not a claim of passing release or browser verification.

**Authority:** `AGENTS.md` · `OWNERSHIP_OVERVIEW.md` · `src/game/simulation/decisionRegistry.ts` · `docs/command.md`. The roadmap is a merged-feature implementation register, not a test ledger.

## Purpose

Occasionally, an eligible female juvenile (12–17 years old) becomes the accidental center of attention. Six to ten available adult residents approach the real person on the town map, gather in a semicircle, and perform a deliberately awkward, comedic call-and-response. The map remains visible; the camera centers on the girl. The simulation can pause for slow readable spoken captions, independently of game speed; skip and natural completion return the simulation to its prior settings. Pure lore: no material reward, affection/romance side effect, career change, reputation or resource mutation from presentation.

## Canonical implementation ownership

| Concern | Sole authority | Data and cadence |
| --- | --- | --- |
| Rare event rule, eligibility, deterministic lineup and slots | `src/game/spotlightLore.ts` | `maybeStartSpotlightLore`: O(1) inactive guard, deterministic daily roll at weekend 16:00, selection scan only when rare roll passes |
| Gathering progression, clean abort, one-time Chronicle event | `src/game/spotlightLore.ts` | `tickSpotlightGathering`, `finishSpotlightLore` |
| Physical movement | `src/game/humanTick.ts` | `tickHumans` remains **the only** simulated x/y and velocity integrator |
| Scheduling | `src/game/tickLayerRealtime.ts` | Calls start before `tickHumans` and checks arrival after it |
| Saved model | `src/game/gameTypes.ts`, `src/game/saveSchema.ts`, `src/game/saveLoad.ts` | Optional `WorldState.spotlightLore` + `spotlightLoreLastDay`; loads validate and normalize |
| Worker/fallback parity | `src/game/simWorker/simPrep.ts`, `src/game/simBuffers/simDelta.ts`, `src/game/simWorker/commands.ts` | Delta + deep rollback projection and idempotent typed finish command |
| Camera, pause and session lifecycle | `src/App.tsx` | Existing `GameLoop` camera focus and `mutateWorld` pause; captures previous controls |
| Caption timing and on-map presentation | `src/components/SpotlightLoreOverlay.tsx` | React wall-clock timeouts and position conversion; **does not** write simulation chat state |
| Old view snapshot consumption | `src/components/spotlightReturnState.ts` | `takeSpotlightReturn` consumes once; `discardSpotlightReturn` invalidates on session replacement |

**Dependencies:** `gameTick → tickLayerRealtime → spotlightLore → logEvent`; `tickLayerRealtime → tickHumans` (read-only scene target); `App → GameLoop + SpotlightLoreOverlay`. No UI import in the simulation. No separate movement update loop. Do not add a duplicate lore/raid event log.

## State machine and clocks

```text
No active scene
  └─ weekend 16:00 + no conflict + 90-day cooldown + seeded rare roll
      └─ eligible girl + 6–10 nearby adult players + walkable distinct slots
          └─ scene.phase = gathering, scene.startedAtTick = world.tick
              ├─ danger / invalid participant / timeout ⇒ abort + clear scene
              └─ EVERY selected speaker reaches slot ⇒ scene.phase = ready
                  └─ App focuses camera and pauses GameLoop simulation ticks
                      └─ independently timed screen-space dialog captions
                          ├─ user Skip ⇒ finishSpotlightLore(skipped)
                          └─ closing applause ⇒ finishSpotlightLore(complete)
                              └─ scene = null, Chronicle entry on completion
                                  └─ restore prior camera/favorite/pause/speed ONCE
```

The girl stays at her actual in-world location. The performer IDs and target coordinates live in one small saved scene record. Only the <11 world-unit arrival threshold and original movement integrator decide who arrives. The current branch waits for **every selected performer**, not merely the minimum of six. At most 65 simulation ticks are allowed for gathering, after which it aborts; the ready phase has a bounded 150-tick headless fallback. During the UI performance, game ticks pause and captions advance by **real wall-clock time**.

The stage's current script contains 31 sequential caption lines. Durations are 3.0–5.3 real seconds per line with opening silence (2.4 s) and a closing applause (2.8 s). It includes recognizable lines from the owner-provided lyrics interspersed with original villager jokes. There is **no music playback or new audio asset**.

### Movement priority (Codex P2 #4401308618)

Ordinary home preference, home/hotel commute, school/work relocation, social/free roam, secondary hunting, child leisure, patient movement and idle stamina-break movement must not overwrite the scripted gathering vector of selected participants. `humanTick` resolves a single `inSpotlightGathering` flag from the saved participant IDs. That flag protects only the participating entities: nonparticipants' AI is unchanged. Genuine danger and flee behavior retain higher priority, and unsafe events should abort the scene rather than transport characters. This resolves the source-level P2 bug where weekend stay-home logic took over movement after the spotlight branch. Regression uses a weekend home-preferring resident and the **real `gameTick` path**.

### Live render-camera positioning (Codex third P2)

The existing GameLoop keeps smoothing its rendered camera while paused. React's `view.camera` may be stale because the game session intentionally skips React updates for presentation-only frames. The spotlight stage therefore reads the current `loop.getView().camera` through an accessor each animation frame; it projects the **already resolved** speaker/heroine positions using the canonical `worldToScreen` and updates three HTML styles only (halo, ring and speech bubble). This animation frame belongs solely to the mounted stage and is cancelled on unmount. It does not rerender React, scan every settler, write entity movement or advance the simulation.

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

- `tests/spotlightLore.test.ts`: deterministic trigger, unique gathering targets, all participants arrive, completion idempotence, load normalization, worker deltas, rollback; a real `gameTick` regression for home-preferring actors.
- `tests/spotlightReturnState.test.ts`: snapshot consume-once, discard before saved-game/new-game replacement.
- Existing ownership, import cycle, TypeScript, standard tests and build: rely on **finished CI status**, not assumed PASS.
- Full browser run with active worker, viewport zoom, pause/skip, actual actor movement, load-during-scene and fresh-session controls remains a release gate.

Relevant reviewed bug reports: [premature six-of-eight staging](bug_report/2026-10-28-spotlight-chorus-starts-before-all-arrive; [camera easing projection](bug_report/2026-10-28-spotlight-overlay-camera-projection-stale.md).md), [home-commute override](bug_report/2026-10-28-spotlight-home-commute-overwrites-gathering.md), [old-colony UI restoration](bug_report/2026-10-28-spotlight-restores-old-colony-camera-on-load.md).

**Acceptance:** keep the roadmap item **unchecked** until PR #91 is merged into `main`. Architecture describes the branch; it is not evidence of production readiness.
