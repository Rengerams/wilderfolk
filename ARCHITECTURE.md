# Wilderfolk — technical architecture

**How the game is wired** (player-facing pitch stays in `README.md`).  
Stack: **React + TypeScript + Vite + Canvas 2D**, client-only, optional **Web Worker** sim.

---

## Big picture

```mermaid
flowchart TB
  subgraph UI["React UI"]
    App["App.tsx"]
    Panels["Tabs · menus · inspector"]
    Canvas["Canvas map"]
  end

  subgraph Loop["GameLoop"]
    Host["Main thread host"]
    Worker["Optional sim worker"]
  end

  subgraph Sim["Simulation"]
    Tick["gameTick"]
    Layers["4 tick layers"]
    Domain["Domain modules"]
  end

  subgraph Present["Presentation"]
    Snap["RenderSnapshot"]
    Draw["renderer.ts + layers"]
    Audio["audio/ director"]
  end

  subgraph Persist["Saves"]
    LS["localStorage"]
    File[".json file download/upload"]
  end

  App --> Host
  Panels --> Host
  Host --> Tick
  Worker --> Tick
  Tick --> Layers
  Layers --> Domain
  Host --> Snap
  Snap --> Draw
  Draw --> Canvas
  Host --> Audio
  Host --> LS
  Host --> File
  App --> LS
  App --> File
```

**Idea:** UI never mutates the world ad-hoc during play. It sends **commands** into `GameLoop`; the loop runs **ticks**, then publishes a **snapshot** for React + canvas.

---

## Main loop

```mermaid
sequenceDiagram
  participant R as React / input
  participant L as GameLoop
  participant W as WorldState
  participant T as gameTick
  participant C as Canvas renderer

  R->>L: applyCommand / patchView
  L->>W: mutate or worker message
  loop while running
    L->>T: gameTick(world)
    T->>W: advance sim
    L->>R: subscribe(session)
    L->>C: RenderSnapshot
    C->>C: draw frame
  end
  R->>L: save / load
```

| Piece | Role |
|-------|------|
| `App.tsx` | Shell: tabs, banners, build mode, menu, wiring |
| `gameLoop.ts` | Clock, pause/speed, commands, worker optional, notify UI |
| `gameTick.ts` | One sim step: calendar + **four layers** |
| `viewState.ts` | Camera, selection, build ghost, favorite follow (not sim truth) |
| `saveLoad.ts` | Browser slot + **file** `.json` |

---

## Simulation: four tick layers

Work is split so not everything runs every tick (`TICKS_PER_DAY = 288`, 12 ticks per hour).

```mermaid
flowchart LR
  Tick["tick++"] --> RT["Realtime"]
  Tick --> SYS["Systems<br/>every ~4 ticks"]
  Tick --> ASG["Assign<br/>cadence"]
  Tick --> DAY["Daily phases<br/>00 / 06 / 12 / 18"]

  RT --> Chat["chat · courtship · move"]
  SYS --> Wild["wildlife · weather · research · caravans"]
  ASG --> Jobs["housing · jobs · workforce"]
  DAY --> Cal["raids tick · immigration · forge day · eco stage"]
```

| Layer | File | Typical work |
|-------|------|----------------|
| **Realtime** | `tickLayerRealtime.ts` | Humans move, social, meals, combat chase |
| **Systems** | `tickLayerSystems.ts` | Wildlife AI, weather, research progress, trade walkers |
| **Assign** | `tickLayerAssign.ts` | Fill jobs/homes (not every frame) |
| **Daily** | `tickLayerDaily.ts` | 00:00 visitors, idle skills, year rollover and fatigue; 06:00 relationships; 12:00 empty; 18:00 production, ecology, immigration and other world events |

Domain logic lives in modules, not one mega-file:

| Module | Owns |
|--------|------|
| `humanTick.ts` | Human tick bodies (animal AI: `tickLayerSystems`) |
| `dayCycle.ts` | Calendar, housing, age, family helpers |
| `frontierCombat.ts` | Raids (abstract ratios, not a battle screen) |
| `groupEvents.ts` | Visitors, rivals, living camps, diplomacy |
| `moonHowler.ts` | Curse / transform / church |
| `forge.ts` + `combat.ts` | Blacksmith orders → village gear **tiers** |
| `ecologyStage.ts` | Valley stable → strained → … |
| `worldGen.ts` | New map, entities, wildlife spawn/replenish |
| `settlerTraits.ts` | One genome per settler: fourteen inherited allele pairs, founder draw, birth inheritance, deterministic old-save backfill |
| `personalMarks.ts` | Born or earned personal marks (`lucky`, `pretty`, `scarred`, `sickly`) — never inherited, never rerolled |
| `personality/` | The one signed activity table and the one bounded evaluator |

**Genetics and marks — one pipeline.** A settler's genotype is `GenomeV2`; marks are separate personal state, not alleles. `activityAptitudes.ts` is the only weight table: every typed activity lists signed aptitude weights and may list signed mark weights. `evaluateAptitudeInfluence` combines the settler's deviation from their own fourteen-dimension mean with any carried mark weight, clamps once and caps once (`1 ± cap`). Every consumer — work, school, danger, social, civic, physiology, conception — multiplies that single factor into its own baseline and keeps sole write authority. No owner keeps a private weight table, the evaluator draws no RNG, and the inspector reads the same result. Conception carries no aptitude weights, so only an acquired `lucky` mark can move it.

**World truth** = `WorldState` in `gameTypes.ts` (entities, buildings, resources, events, …).

---

## Render path

```mermaid
flowchart TB
  W["WorldState"] --> Prep["Render snapshot / SoA pack"]
  V["ViewState camera"] --> Prep
  Prep --> R["renderer.ts"]
  R --> T["terrain bake cache"]
  R --> E["entities / buildings"]
  R --> UI["ghost · grid · march lines"]
  T --> Canvas["&lt;canvas&gt;"]
  E --> Canvas
  UI --> Canvas
```

- **Sim** does not draw.
- Terrain can be **baked** and only rebuilt when map/season changes.
- Optional **simBuffers** pack entity data for cheaper draws / worker transfer.

---

## Input & UI

```mermaid
flowchart LR
  Mouse["Canvas clicks"] --> Hooks["hooks/"]
  Keys["Keyboard"] --> Hooks
  Hooks --> Loop["GameLoop commands"]
  Tabs["Village · Frontier · Nature · Progress · Log · More"] --> Read["read world + view"]
  Inspector["Selected entity/building"] --> Cmd["staff · forge · raid · favorite"]
  Cmd --> Loop
```

| Area | Notes |
|------|--------|
| **Village** | Pop, families, armament steps, leadership |
| **Frontier** | Visitors, rivals, raid UI |
| **Nature** | Wildlife counts, eco health, season |
| **Progress** | Research, trade, **legend portrait** (not hard win) |
| **More** | Guide (searchable help), roadmap |

---

## Audio

```mermaid
flowchart LR
  Intro["Intro track"] --> GP["Gameplay bed<br/>one continuous loop"]
  GP --> Amb["Soft ambient birds"]
  Dir["director.ts"] --> Intro
  Dir --> GP
  Dir --> Amb
```

Day/night **does not swap** music beds anymore (that was jarring). Mute/volume via menu.

Tracks live in `public/audio/` and are registered in `src/audio/tracks.ts`.

---

## Saves

```mermaid
flowchart TB
  World --> Build["buildSaveData"]
  View --> Build
  Build --> LS["localStorage slot"]
  Build --> DL["Download .json file"]
  LS --> Load["loadGame"]
  File["User .json"] --> LoadF["loadGameFromFileText"]
  Load --> Hydrate["migrate + rebuild indexes"]
  LoadF --> Hydrate
  Hydrate --> Session["GameLoop.setSession"]
```

- **Browser save** = convenient, can vanish with cache wipe.  
- **Save to file** = real backup you keep.  
- **Beta save policy (since 2026-08-16):** only the **exact current `GAME_VERSION`'s** saves load — historical-save compatibility is dropped (`saveLoad.ts` `parseSaveJson` rejects any other `_version`; the app explains this on load).

---

## Optional worker

```mermaid
flowchart LR
  Main["Main: UI + render"] <-->|commands / deltas| Worker["Worker: gameTick"]
  Worker --> WorldW["World copy"]
  Main --> Shadow["Shadow world for draw"]
```

If the worker fails to init, **main-thread ticks** still run. Same `gameTick` either way.

---

## Repo map (short)

```
src/
  App.tsx                 UI shell
  components/             React panels
  hooks/                  canvas / keyboard / audio hooks
  audio/                  music + ambient
  game/
    gameLoop.ts           session clock
    gameTick.ts           tick orchestrator
    tickLayer*.ts         four layers
    humanTick.ts          people & beasts
    settlerTraits.ts      inherited aptitudes (one genome)
    personalMarks.ts      born/earned marks (not inherited)
    personality/          activity weights + one evaluator
    renderer.ts           Canvas draw
    saveLoad.ts           persist
    frontierCombat.ts     war abstract
    groupEvents.ts        visitors & rivals
    simWorker/            optional off-main sim
    simBuffers/           render packing
```

Genetics detail: [DNA aptitudes architecture](docs/DNA_APTITUDES_ARCHITECTURE.md).

---

## Mental model (one sentence)

> **React shows a snapshot of a tick-based colony sim; the map is Canvas; saves are JSON; drama (families, raids, moon, neighbors) is systems on a calendar, not a separate multiplayer server.**

---

*Update this file when tick layers, worker, or save paths change in a big way.*
