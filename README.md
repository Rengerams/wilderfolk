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

**Build homes. Assign workers. Watch families grow.** Every settler carries three personality traits from a pool of fourteen — 💪 Hardy, 🛡️ Brave, 🗣️ Gregarious, 🐇 Timid, 🌿 Greenthumb, 🍀 Lucky, 💗 Nurturing, 🔮 Insightful, 🦁 Chivalrous, 🔨 Resourceful, 🏔️ Stoic, ✨ Graceful, 🦉 Intuitive, 🔥 Fierce — inherited from their parents, DNA-style, so the brave father's daughter carries his fire. Meet neighbor tribes on the map, queue iron at the Blacksmith, survive Moon Howlers, and shape your own legacy. The valley feels alive because the sim treats predators, prey, and people as one system.

> **Early alpha today** — playtest the trail in your browser. **Installer and Steam** are the destination; this repo is the open development build.

| You get | Why it matters |
|---------|----------------|
| **Living food chain** | Grass, prey, predators, and your village share one ecology — balance or collapse |
| **Settlers with personalities** | Three traits each from a pool of fourteen, inherited DNA-style; day jobs, courtship, scandals, families, drama |
| **Frontier diplomacy** | Visitor caravans with real gold purses, rival camps, trade, peace treaties, incoming raids you can *prepare* for |
| **Craft & defense** | Forge tier 5 — iron swords, scale mail, tower ballistae; walls, towers, barracks, guard patrols |
| **Clear goals** | Focus hints, alert strip, sidebar tabs, valley stages — you always know what to do next |
| **Sandbox with goals** | No forced win conditions — optional challenges reward milestones, and a living village portrait writes your story as you play |

**Don't kill all the wolves.** Seriously. That's the whole game in one sentence.

---

## Latest update — v0.6.1 (August 17, 2026)

**The valley thinks faster — 1,200 settlers at ~38 ms/tick.**

* `GAME_VERSION` **0.6.1**
* ⚠️ **Beta Save Policy:** This build loads only 0.6.1 saves.
* **Compatibility Dropped:** Historical-save compatibility is no longer supported.
* **New Start Required:** Saves from other builds (including 0.6) are rejected, so please start a new settlement.

| Area | Highlights |
|------|------------|
| 🚀 **Perf gate passed** | 1,200 humans **~192 ms → ~38 ms/tick** (p95 362 → 65 ms); every tier 200–2,600 is ACCEPTABLE |
| 🧮 **Smarter social sim** | social queries use a **living-humans-only grid**, **adaptive grid-vs-array scanning**, **staggered ambient scans** (banter/greetings 1-in-6 ticks) and **behavior-specific radii** — the valley feels the same, runs much lighter |
| 🧩 **Cleaner sim code** | `lifeSimulation.ts` split into domain modules (`simulation/types · entities · relationships`, `humanTick`), grass lives in the daily tick layer, wildlife in the systems layer |

**Performance**

| Humans | avg tick | p95 tick | Gate |
|--------|----------|----------|------|
| 200 | 4.8 ms | 8.1 ms | ✅ ACCEPTABLE |
| 400 | 7.5 ms | 13.3 ms | ✅ ACCEPTABLE |
| 600 | 11.7 ms | 18.6 ms | ✅ ACCEPTABLE |
| 800 | 18.7 ms | 34.0 ms | ✅ ACCEPTABLE |
| 1,000 | 27.3 ms | 56.0 ms | ✅ ACCEPTABLE |
| 1,200 | 38.0 ms | 64.8 ms | ✅ ACCEPTABLE |
| 1,400 | 49.0 ms | 90.9 ms | ✅ ACCEPTABLE |
| 1,600 | 64.3 ms | 121.0 ms | ✅ ACCEPTABLE |
| 1,800 | 79.1 ms | 152.8 ms | ✅ ACCEPTABLE |
| 2,000 | 103.9 ms | 195.0 ms | ✅ ACCEPTABLE |
| 2,200 | 121.8 ms | 231.5 ms | ✅ ACCEPTABLE |
| 2,400 | 135.3 ms | 270.6 ms | ✅ ACCEPTABLE |
| 2,600 | 172.2 ms | 329.3 ms | ✅ ACCEPTABLE |
| 2,800 | 183.8 ms | 362.9 ms | ⚠️ WATCH |

**Capacity ceiling** 
- **2,600 settlers** stay ACCEPTABLE (p95 329 ms) — the engine can now run almost 100% more citizens.



---
## v0.6 (August 17, 2026)

**Build, flow, and grow: watch the valley transform.**

* `GAME_VERSION` **0.6**
* ⚠️ **Beta Save Policy:** This build loads only 0.6 saves.
* **Compatibility Dropped:** Historical-save compatibility is no longer supported.
* **New Start Required:** Saves from other builds are rejected, so please start a new settlement.
* **`V0.6 perf Gate:`** **PASSED**

| Area | Highlights |
|------|------------|
| **🔩 Iron** | The Mine gains an **Extract mode (🪨 Stone / 🔩 Iron)** — switch it per mine in the inspector — and every **Blacksmith forge order now costs iron** (Spears → Ballistae). The forge is an iron sink, not a gold sink |
| **🎓 Guide**         | A living step-by-step guide walks you through your first year (house → farm → workers → wood/meat → gold → winter). It auto-advances as you do things, has a **Skip** button, and the new-settlement screen has an **On/Off choice** |
| **🏚️ Storehouse**     | A new Resources building that shelters **+800 wood storage** for winter; food spoilage drops to 2%/day, and gold is capped at 20,000 — the economy audit's fixes, all in |
| **🏔️ 2.5D Isometric** | The valley reads as a landscape, not colored blocks. **Hand-painted shores** (a painted grass-biome tileset, blob-autotiled) line every coast and river, and **hills and peaks physically rise** out of the plain — raised surfaces with sun-lit edges and shaded cliff faces. Buildings, settlers and props **ride the terrain**; nothing floats on slopes |
| **🌊 Rivers**      | New maps carve **whole-tile water bands 3–5 tiles across** (not 1-tile threads), the thin blue "stream" stroke is gone, and **Riverlands & Coastal valleys finally get rivers** at all |
| **🔨 Upgrades**     | Lv2 buildings grow a warm new roof + chimney, Lv3 a stronger roof, a gold rim and a soft glow at night — upgrades read at a glance |
| **⛈️ Storm damage** | When a storm batters buildings, debris flies and a warning floats up from each battered roof — and the colony now **founds at 08:00**, not midnight |

**And more**

### Extra features
- **🎣 Fishing Spot (Phase 6: rivers feed)** — a new Food building that must straddle water (a dock): staffed fishers haul `8 + 4×workers` food per day, thin in winter (55%), rich in fall (115%). Safer than hunting — no wolves fight back. Generated sprite `fishingspot.png`
- **🌳 Wildlife Preserve (Phase 6: ecology tools)** — a new Community building: fenced wild grove that **restores ecosystem health +4** and shows the valley you're giving back. No workers
- **📜 Valley Chronicle (Phase 7: people become history)** — the victory-path replacement: **9 chapter milestones** (The Foundation → The First Harvest → The Great Hunt → The River's Gift → The Iron Age → The Market Opens → Keeper of the Wild → The Alliance → A Century). Each unlocks once, logs to the chronicle, grants a small reward, and appears as a **center-screen title card**. Progress lives in Progress → Goals. No win/lose — the valley just keeps living
- **🌄 Cinematic moments (Phase 8: feel)** — a title card marks your **founding** and every **chronicle chapter** unlock; **construction now builds up** visually — scaffolds grow from 45% to full size as progress rises
- **🤝 Relationships (Phase 7: relationship webs)** — settlers build **friendships** from shared work, shared homes and childhood school bonds (become friends at 60); **feuds** start when a spouse catches a cheater with a paramour, drain energy daily, and slowly heal. Friends lift each other's energy; the chronicle log tells both stories
- **🎓 Apprenticeships (Phase 7: skills pass on)** — a master (skill ≥ 40) at a staffed production building takes on the nearest juvenile; the apprentice learns fast under a good master and **graduates at skill 50** into the trade. Building panels show who is teaching whom
- **👑 Dynasties (Phase 7: family legacy)** — the Goals tab lists **living dynasties** (surnames across generations), and a true **three-generation dynasty unlocks a Valley Chronicle chapter** ("A Dynasty", +200 gold)
- **🗳️ Elections are real ballots (Phase 7: vote-support)** — every adult settler votes; **merit stays the strongest force** (a candidate ahead by >15 points wins every ballot), while **friendships boost and feuds can cancel a vote** — bonds only tip close races. Results log as "X of Y ballots", and the announcement reads "Elected by ballot"
- **🍞 Food keeps longer** — spoilage drops **3% → 2%/day** and the base food cap rises to 800 (silos still cut further); banking food for winter is now viable
- **💰 Gold has a cap** — 20,000 (was uncapped); the late-game snowball stops and the header shows the cap
- **🌾 Farms reward workers** — farm output now scales `12 + 5×workers` (was a flat 22), so a fully-staffed farm out-produces an empty one


### Performance
- **Quality**   pathfinding, painted valley, economy ledger, quests, trade, elections, multi-select, decor, SFX, weather, App split updated

---

### Previous release — v0.5.4.1 (August 15, 2026)

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


### Prior release — v0.5.3 August 12, 2026)

The night hunts back: Moon Howler exorcism overhaul — up to 4 priests, active night hunts, red-dot howlers, guard saves, and the **Moonslayer / Howlerbane** titles. Details → [ROADMAP.md](ROADMAP.md).

---

### What's next

Soon...

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
