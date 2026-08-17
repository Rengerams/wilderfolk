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

**Build homes. Assign workers. Watch families grow.** Every settler carries three personality traits from a pool of fourteen — 💪 Hardy, 🛡️ Brave, 🗣️ Gregarious, 🐇 Timid, 🌿 Greenthumb, 🍀 Lucky, 💗 Nurturing, 🔮 Insightful, 🦁 Chivalrous, 🔨 Resourceful, 🏔️ Stoic, ✨ Graceful, 🦉 Intuitive, 🔥 Fierce — inherited from their parents, DNA-style, so the brave father's daughter carries his fire. Meet neighbor tribes on the map, queue iron at the Blacksmith, survive Moon Howlers, and chase four victory paths — from Eco-Utopia to Trade Empire. The valley feels alive because the sim treats predators, prey, and people as one system.

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

## Latest update — v0.5.4.1 (August 17, 2026)

**Playing `GAME_VERSION` 0.5.4.1** — ⚠️ **beta save policy: this build loads only 0.5.4.1 saves** (historical-save compatibility dropped — a save from any older build is rejected; start a new settlement). Full notes → [CHANGELOG.md](CHANGELOG.md)

| Area | Highlights |
|------|------------|
| **🏔️ 2.5D painted relief** | The valley reads as a landscape, not colored blocks. **Hand-painted shores** (a painted grass-biome tileset, blob-autotiled) line every coast and river, and **hills and peaks physically rise** out of the plain — raised surfaces with sun-lit edges and shaded cliff faces. Buildings, settlers and props **ride the terrain**; nothing floats on slopes |
| **🌊 Rivers look like rivers** | New maps carve **whole-tile water bands 3–5 tiles across** (not 1-tile threads), the thin blue "stream" stroke is gone, and **Riverlands & Coastal valleys finally get rivers** at all |
| **🔨 Upgrades you can see** | Lv2 buildings grow a warm new roof + chimney, Lv3 a stronger roof, a gold rim and a soft glow at night — upgrades read at a glance |
| **🪵 Painted dirt** | Hills, Rocky and Mountain relief surfaces use a hand-painted soil texture, matching the painted coasts |
| **⛈️ Storm damage you can see** | When a storm batters buildings, debris flies and a warning floats up from each battered roof — and the colony now **founds at 08:00**, not midnight |

### Previous release — v0.5.4 (August 13)

| Area | Highlights |
|------|------------|
| **🗺️ Choose your land** | The new-settlement screen is a **painted gallery** — six valleys (Verdant, Mountainous, Coastal, Arid, Harsh, **Riverlands** marshland) as tiny landscape cards; map size is a slim segmented control |
| **🎭 People & drama** | **Titles sway elections** (+8 merit for Moonslayer/Howlerbane); schools are **yours to staff** (no auto-teachers, up to **10 kids** per school); kids **gossip** their parents' affairs at school and form **childhood bonds** that shape who they court as adults |
| **👥 Multi-select workers** | Shift-click several settlers at once, then assign them all to one building in a single click |
| **🚶 Real walking** | Human sprites support **4-frame walk sheets** — settlers swing their legs instead of bobbing; outfit variants now spread across the village |
| **🎨 Painted valley** | Procedural decor (snow mounds, beach ripples, rock clusters, meadow flowers) + **work ambience** — the village sounds like work: chopping, mining, hammering, and footsteps pitched by the surface underfoot |
| **🦌 The Passing Herds** | Every autumn a herd of deer crosses the valley — they graze, they're huntable, they leave. **The herds remember:** every deer you take this year makes next year's herd smaller; let them pass and they come back fat as ever |
| **🎉 Seasonal festivals** | **20 guaranteed festival days/year** — Spring Revel, Midsummer Feast, Harvest Festival, Frostfall Feast (5 days each, plus the random ones). Production, courtship & immigration boost; the tavern stays open day and night |
| **🌷 Decor & village beauty** | A **Decor** build tab — gardens, statues, lamps, wooden fences (no art needed, all procedural). Decor stamps neighborhood beauty: settlers drift toward pretty spots in free time, and the Population panel shows a **Village mood** readout |
| **Quality** | Every **0.5.x save loads** (version-gate test pins it); worker-command tests back in the gate; the code hub slimmed 1,489 → 1,072 lines |

### What's next

The **game-feel plan is complete** (Phases 0–4 — pathfinding, painted valley, economy ledger, quests, trade, elections, multi-select, decor, SFX, weather, App split; renames + clone-delta parked with evidence). On the table: hand-painted **wall/gate building sprites** and v0.6 entity-capacity performance. → [docs/archive/2026-08-03-game-feel-plan.md](docs/archive/2026-08-03-game-feel-plan.md)

### Prior release — v0.5.3

The night hunts back: Moon Howler exorcism overhaul — up to 4 priests, active night hunts, red-dot howlers, guard saves, and the **Moonslayer / Howlerbane** titles. Details → [ROADMAP.md](ROADMAP.md).

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
