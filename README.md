# Wilderfolk

<p align="center">
  <img src="app/public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>A cozy frontier settlement sim — built inside the food chain, not on top of it.</em>
</p>

---

## What is Wilderfolk?

Most settlement games ask you to **tame** the wild. Wilderfolk asks you to **move into it** — and not wreck the neighborhood on your way in.

You are not conquering a blank map. You are sharing a valley with grass, rabbits, deer, wolves, rival camps, caravans, winter, and the occasional curse under a full moon. Every choice ripples through the chain: wipe out the wolves and your hunters go hungry two seasons later. Pave too fast and the ecosystem buckles. Arm your militia, sign a peace treaty, or pay tribute — but **raids test preparation**, not a fancy battle screen.

```
🌿 → 🐰 🦌 → 🐺 🦊 → 🏹 → 🏘️
```

**Build homes. Assign workers. Watch families grow.** Meet neighbor tribes on the map, queue iron at the Blacksmith, survive Moon Howlers, and chase four victory paths — from Eco-Utopia to Trade Empire. The valley feels alive because the sim treats predators, prey, and people as one system.

> **Early alpha today** — playtest the trail in your browser. **Installer and Steam** are the destination; this repo is the open development build.

| You get | Why it matters |
|---------|----------------|
| **Living food chain** | Grass, prey, predators, and your village share one ecology — balance or collapse |
| **Settlers with schedules** | Day jobs, nights at home, courtship, families, walk animations on the map |
| **Frontier diplomacy** | Visitor caravans, rival camps, trade, peace treaties, incoming raids you can *prepare* for |
| **Craft & defense** | Research tiers, Blacksmith forge queue, walls, towers, barracks, guard patrols |
| **Clear goals** | Focus hints, alert strip, six sidebar tabs — you always know what to do next |
| **Four victory paths** | Eco-Utopia, Great City, Trade Empire, Harmony — plus a full village chronicle |

**Don't kill all the wolves.** Seriously. That's the whole game in one sentence.

---

## Latest update — v0.4.2 (July 5, 2026)

**Shipped.** `GAME_VERSION` is **0.4.2**; `0.4.1` saves migrate on load. Full notes → [CHANGELOG.md](CHANGELOG.md) `[0.4.2]`.

| Area | Highlights |
|------|------------|
| **UI** | 6-tab sidebar, alert strip, map build hotbar, tab hotkeys `V/F/N/P/L/M` |
| **Defense** | Walls, towers, barracks, guard patrols; **Log → Combat** raid history |
| **Raids** | Preparation-focused — combat preview + Frontier readiness card; **no battle screen** |
| **Craft** | Blacksmith forge queue for iron spears & shields (research + staffed smith) |
| **Polish** | **R** to rotate roads/walls/gates; night glow, confetti, camera nudge (toggle in ☰) |
| **Balance** | 10-year town PASS (9/9 gates) · [10-user beta](TECHNICAL.md#playtest-report) |
| **Fixes** | ~40 bug fixes (July 4) + beta UX feedback |

### What's next — v0.5.0 (end July 2026)

All open scale, quality, and architecture work ships in one release → [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md). In-game: **More → Roadmap**.

| Track | Highlights |
|-------|------------|
| **Scale** | Spatial grid, large-map perf, Web Worker sim, canvas layers |
| **UI** | App tab split so city-size villages stay snappy |
| **Quality** | Big bug audit, logic checks, **`npm run simulate:20year` ship gatekeeper** |
| **Polish** | Counter-raid march visuals, reputation arc, visitor quests |
| **After v0.5** | Installer or **Steam** — download and play, no terminal |

**Not on the near-term list:** tactical map battles, multiplayer, fog of war, hospital disease loop — [ROADMAP.md](ROADMAP.md).

### Prior release — v0.4.1

Tribes & diplomacy v2, frontier raids, peace treaties, visitor leader talk, village leadership elections, four victory paths, population panel, chronicle export, and the in-game roadmap tab. Details → [ROADMAP.md](ROADMAP.md).

---

## How to install

*Early alpha — you need **Node.js** for now. A normal installer or **Steam** build is planned after v0.5.*

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

**Player guide** (first day, controls, raids, tips) → **[app/README.md](app/README.md)**

---

## Documentation

| Doc | For |
|-----|-----|
| **[app/README.md](app/README.md)** | Players — how to play, tips, controls *(only markdown in `app/`)* |
| **[TECHNICAL.md](TECHNICAL.md)** | Developers — architecture, dev log, playtests, audio credits |
| **[ROADMAP.md](ROADMAP.md)** | Plan — alpha → v1 → Steam |
| **[ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)** | **v0.5.0** — scale + architecture + open work (end July 2026) |
| **[CHANGELOG.md](CHANGELOG.md)** | Detailed change log by version |

### Optional (developers)

```bash
npm run build            # production build
npm run lint             # ESLint
npm run simulate:20year  # v0.5 ship gatekeeper (20 in-game years)
npm run sprites:humans   # regenerate human outfit variant PNGs
```

---

## Feedback & questions

**Feedback and questions are appreciated!** You're helping shape what ships for real.

- **Email:** [info@autosolid.nl](mailto:info@autosolid.nl)
- **Playtest notes:** export your village chronicle (Log → Chronicle → Download .txt) and mention what confused you or what you'd love next
- **Issues:** [GitHub Issues](https://github.com/Rengerams/Wilderfolk/issues) for bugs and reproducible steps

## License

Source code is [MIT](LICENSE) — Copyright (c) 2026 Renffr. Audio assets have separate CC licenses; see [TECHNICAL.md](TECHNICAL.md#audio-credits).

<p align="center">
  <strong>Wilderfolk</strong><br>
  <em>Build inside the food chain — or watch it collapse.</em>
</p>