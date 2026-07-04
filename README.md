# Wilderfolk

**Where Beasts and Kin Unite** · *Early Alpha*

## Latest update — v0.4.2 (July 5, 2026)

**Shipped.** `GAME_VERSION` is **0.4.2**; `0.4.1` saves migrate on load. Full notes → [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]`.

| Area | Highlights |
|------|------------|
| **UI** | 6-tab sidebar, alert strip, map build hotbar, tab hotkeys `V/F/N/P/L/M` |
| **Defense** | Walls, towers, barracks, guard patrols; **Log → Combat** raid history |
| **Raids** | Preparation-focused — combat preview + Frontier readiness card; **no battle screen** |
| **Craft** | Blacksmith forge queue for iron spears & shields (research + staffed smith) |
| **Polish** | **R** to rotate roads/walls/gates; night glow, confetti, camera nudge (toggle in ☰) |
| **Balance** | 10-year town PASS (9/9 gates) · [10-user beta](app/docs/PLAYTEST_BETA_10_USERS.md) |
| **Fixes** | ~40 bug fixes (July 4) + beta UX feedback |

**Next:** **[v0.5.0](ROADMAP_0.5.0.md)** (end July 2026) — scale, UI split, Web Worker, canvas layers. In-game: **More → Roadmap**.

## How to install

*Early alpha — you need **Node.js** for now. A normal installer or **Steam** build is planned later.*

### Requirements

- **[Node.js 20+](https://nodejs.org)** (LTS recommended)
- A modern browser (Chrome, Firefox, Edge, Safari)
- ~500 MB free disk space for dependencies

### Quick start

1. **Get the code**
   - **With Git:** `git clone https://github.com/Rengerams/Wilderfolk.git`
   - **Without Git:** on GitHub, click **Code → Download ZIP**, unzip the folder

2. **Open a terminal** in the project root (the folder that contains `app/` and `package.json`)

3. **Install and run:**

```bash
npm install
npm start
```

4. **Play** — open **http://localhost:5173** in your browser (or the URL shown in the terminal)

5. **Stop** — press `Ctrl+C` in the terminal

Running `npm install` at the repo root also installs the `app/` package (via `postinstall`).

### Troubleshooting

| Problem | Try this |
|---------|----------|
| `npm` not found | Install Node.js from [nodejs.org](https://nodejs.org), then **restart the terminal** |
| Port already in use | Close other copies of the game; check the terminal for another port |
| Blank or stale page | Hard-refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) |
| Install fails | Delete `node_modules` in the root **and** in `app/`, then run `npm install` again |

Player guide (controls, tips, first day) → **[app/README.md](app/README.md)**

---

### Build your village inside a living food chain — or watch it collapse.

You are not conquering nature. You are **moving into it**. Grass, rabbits, deer, wolves, foxes, Moon Howlers, rival camps, and winter all have opinions about your town hall.

```
🌿 → 🐰 🦌 → 🐺 🦊 → 🏹 → 🏘️
```

**Don't kill all the wolves.** That's not a cute tagline — it's a warning. Wipe out the predators and your village starves two seasons later.

> **Early alpha** — bugs, rough edges, and features in flux. You're playtesting the trail before installer / Steam.

## What's coming

| Version | When (target) | Theme | Highlights |
|---------|---------------|-------|------------|
| **0.5.0** | **End Jul 2026** | Scale + quality | Spatial grid, App tab split, Web Worker, canvas layers, **bug audit + sim gates** → [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md) |
| **1.0 / Steam** | TBD | Real release | Installer or Steam — no Node.js, no terminal |

**Not on the near-term list:** real-time tactical battles on the map, multiplayer, fog of war, hospital disease loop — [ROADMAP.md](ROADMAP.md).

## Documentation

| Doc | For |
|-----|-----|
| **[app/README.md](app/README.md)** | Players — how to play, tips, controls |
| **[TECHNICAL.md](TECHNICAL.md)** | Developers — architecture, tick model, file map |
| **[ROADMAP.md](ROADMAP.md)** | Plan — alpha → v1 → Steam |
| **[ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)** | **v0.5.0** — scale + architecture (end Jul 2026) |
| **[SESSION_SUMMARY.md](SESSION_SUMMARY.md)** | Dev log — what shipped, when |
| **[app/AUDIO_CREDITS.md](app/AUDIO_CREDITS.md)** | Music & SFX — OpenGameArt sources and licenses |

## Prior release — v0.4.1

- **PNG walk-sheet settlers** — 4-frame animation, 4 outfit variants per gender
- **First-night tutorial** — Quick Start walks you through building a house before 8pm
- **Visible hunting** — chase lines, floating hunt/combat text, predator prey dynamics on the map
- **Weapons & shields** — Defense research (stone spears → iron gear at the Blacksmith)
- **Frontier raids** — defend, barricade, pay tribute, counter-raid; combat preview with distance-scaled provisions
- **Tribe diplomacy v2** — map camp panels, rival events, visitor trade, refugee negotiate, peace treaties, talk to visitor leaders
- **Village leadership** — merit-based elections every 10 years (👑 village head)
- **Day/night schedule** — settlers sleep at home, work during the day
- **Food chain sim** — wolves, deer, grass, pollution, seasons
- **Visitors & rival camps** on the same map
- **Moon Howlers**, festivals, disasters
- **Four active victory paths** — Eco-Utopia, Great City, Trade Empire, Harmony
- **Terrain-aware building** — can't place on water, mountains, or snow

## Coming soon: install & play (or Steam)

The goal is a **normal game release** — download an installer or grab it on **Steam**, launch it, done. No Node.js, no command line.

That's the target. Until then, use **[How to install](#how-to-install)** above.

### Optional (developers)

```bash
npm run build      # production build
npm run lint       # ESLint
npm run sprites:humans   # regenerate human outfit variant PNGs
```