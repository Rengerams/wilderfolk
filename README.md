# Wilderfolk

<p align="center">
  <img src="public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Don't kill all the wolves.</em><br>
  <em>A cozy frontier settlement sim — built inside the food chain, not on top of it.</em>
</p>

---

## What is Wilderfolk?

Most settlement games ask you to **tame** the wild. Wilderfolk asks you to **move into it** — and not wreck the neighborhood on your way in.

You are not conquering a blank map. You are sharing a valley with grass, rabbits, deer, wolves, rival camps, caravans, winter, and the occasional curse under a full moon. Every choice ripples through the chain: wipe out the wolves and your hunters go hungry two seasons later. Pave too fast and the ecosystem buckles. Arm your militia, sign a peace treaty, or pay tribute — but **raids test preparation**, not a fancy battle screen.

```
🌿 → 🐰 🦌 → 🐺 🦊 → 🏹 → 🏘️
```

**Build homes. Assign workers. Watch families grow.** Every settler carries three personality traits from a pool of fourteen — inherited from their parents, DNA-style — so the brave father's daughter carries his fire. Meet neighbor tribes on the map, queue iron at the Blacksmith, survive Moon Howlers, and chase four victory paths — from Eco-Utopia to Trade Empire. The valley feels alive because the sim treats predators, prey, and people as one system.

> **Early alpha today** — playtest the trail in your browser. **Installer and Steam** are the destination; this repo is the open development build.

| You get | Why it matters |
|---------|----------------|
| **Living food chain** | Grass, prey, predators, and your village share one ecology — balance or collapse |
| **Settlers with personalities** | Three traits each from a pool of fourteen, inherited DNA-style; day jobs, courtship, scandals, families, drama |
| **Frontier diplomacy** | Visitor caravans with real gold purses, rival camps, trade, peace treaties, incoming raids you can *prepare* for |
| **Craft & defense** | Forge tier 5 — iron swords, scale mail, tower ballistae; walls, towers, barracks, guard patrols |
| **Clear goals** | Focus hints, alert strip, sidebar tabs, valley stages — you always know what to do next |
| **Four victory paths** | Eco-Utopia, Great City, Trade Empire, Harmony — plus a full village chronicle |

**Don't kill all the wolves.** Seriously. That's the whole game in one sentence.

---

## Latest update — v0.5.2 shipped (August 6, 2026)

**Playing `GAME_VERSION` 0.5.2** — colonies continue from **0.4 / 0.5.0 / 0.5.1** saves. Full notes → [CHANGELOG.md](CHANGELOG.md) `[0.5.2]`.

| Area | Highlights |
|------|------------|
| **Water & terrain** | Rivers carve real channels from the peaks and actually flow; seamless water sprites with shore reflection; wooden bridge; zoom-5 terrain LOD |
| **Light & seasons** | Season lerp across spring → winter; warm light pools on the plaza at night; footstep dust, sawdust, ambient-occlusion pools |
| **People** | **Personality traits** (3 of 14 per settler, children inherit each parent trait 50/50); hospital visits during work hours; hunt arrow FX; click-to-focus toasts |
| **Elections** | Every **two years** — the elected head makes a promise, keeping it pays; gossip season before the vote |
| **Trade** | Visitors carry **real gold purses** (no minted gold); reputation shifts prices and raid odds; traveling-smith quest; Market-gated trade routes |
| **Life & map** | Grid pathfinding (people walk around water & mountains); clickable mini-map; no visitors in week 1; new games default to Small |
| **Quality** | Eco metrics once per day; two redundant scans removed per tick; camera clamp fixed; auto-staff confirms itself |

### What's next — game-feel Phase 3

Multi-select workers, decorations & beauty, sound effects, and weather with real consequences → [docs/plans/2026-08-03-game-feel-plan.md](docs/plans/2026-08-03-game-feel-plan.md).

### Prior release — v0.5.1

Fairer raid spoils, clearer marches, and stronger cues when the wild runs thin. Details → [ROADMAP.md](ROADMAP.md).

---

## How to install

*Early alpha — you need **Node.js** for now. A normal installer or **Steam** build is planned.*

### Requirements

- **[Node.js 20+](https://nodejs.org)** (LTS recommended)
- A modern browser (Chrome, Firefox, Edge, Safari)
- ~500 MB free disk space for dependencies

### Quick start

1. **Get the code**
   - **With Git:** `git clone https://github.com/Rengerams/Wilderfolk.git`
   - **Without Git:** on GitHub, click **Code → Download ZIP**, unzip the folder

2. **Open a terminal** in the project root (the folder that contains `package.json`)

3. **Install and run:**

```bash
npm install
npm start
```

4. **Play** — open **http://localhost:5173** in your browser (or the URL shown in the terminal)

5. **Stop** — press `Ctrl+C` in the terminal

### Troubleshooting

| Problem | Try this |
|---------|----------|
| `npm` not found | Install Node.js from [nodejs.org](https://nodejs.org), then **restart the terminal** |
| Port already in use | Close other copies of the game; check the terminal for another port |
| Blank or stale page | Hard-refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) |
| Install fails | Delete `node_modules`, then run `npm install` again |

---

## Documentation

| Doc | For |
|-----|-----|
| **[CHANGELOG.md](CHANGELOG.md)** | Detailed change log by version |
| **[ROADMAP.md](ROADMAP.md)** | Shipped features by version |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Developers — how the game is wired (command/snapshot loop, sim layers) |
| **[AGENTS.md](AGENTS.md)** | Developers — build, test, lint, audit, commit conventions |
| **[docs/marketing/](docs/marketing/)** | Marketing assets (sneak-preview package, launch copy) |

### Optional (developers)

```bash
npm run build       # production build (tsc + vite) → dist/
npm run preview     # serve production build locally
npm run lint        # ESLint
npm test            # Vitest
npm run audit       # dead code (knip) + import cycles (dependency-cruiser)
```

---

## Feedback & questions

**Feedback and questions are appreciated!** You're helping shape what ships for real.

- **Email:** [info@autosolid.nl](mailto:info@autosolid.nl)
- **Playtest notes:** export your village chronicle (Log → Chronicle → Download .txt) and mention what confused you or what you'd love next
- **Issues:** [GitHub Issues](https://github.com/Rengerams/Wilderfolk/issues) for bugs and reproducible steps

## License

Source code is [MIT](LICENSE) — Copyright (c) 2026 Renffr. Audio assets have separate CC licenses.

<p align="center">
  <strong>Wilderfolk</strong><br>
  <em>Don't kill all the wolves.</em><br>
  <em>Build inside the food chain — or watch it collapse.</em>
</p>
