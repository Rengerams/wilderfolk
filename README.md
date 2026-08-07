<p align="center">
  <img src="public/logo.png" alt="Wilderfolk" width="160" />
</p>

<h1 align="center">Wilderfolk</h1>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Don't kill all the wolves.</em>
</p>

<p align="center">
  <strong>v0.5.2</strong> · Early Alpha · <a href="#play-early-alpha">Play it in your browser</a>
</p>

---

## A cozy frontier colony sim — inside the food chain, not on top of it

Most colony games ask you to **conquer** the wild. **Wilderfolk** asks you to **move into it** — and live with the consequences.

```
🌿 grass  →  🐰 🦌 prey  →  🐺 🦊 predators  →  🏹 you  →  🏘️ village
```

That loop is the heart of the game. Farms, walls, taverns, elections, and trade are how you stay **human** inside it.

- 🌿 **The valley is alive.** Deer eat the grass. Wolves eat the deer. Your hunters want the same trails. Wipe out the wolves and the deer explode, the meadows die, and the hunting packs come home empty. You didn't lose to a raid. **You lost to ecology.**
- 👨‍👩‍👧 **People who refuse to be statistics.** Every settler carries three personality traits from a pool of fourteen — Hardy, Brave, Lucky, Fierce, Nurturing… — inherited from their parents DNA-style, and shaping how they live, love, and fight. They court, marry, argue at work, sneak out for affairs (hello, prison), divorce, remarry, and grieve. Orphans get adopted.
- 🌕 **The night has teeth.** On full moons, cursed kin become **Moon Howlers** and hunt through the dark. The Church has until dawn.
- 🏛️ **The crown is never safe.** Elections every two years. The village head makes a promise — keeping it pays, and everyone remembers.
- 🛠️ **Steel for the frontier.** The forge reaches tier 5: iron swords, scale mail, tower ballistae. Raids you *prepare* for, not lose to.
- 🏨 **A frontier that visits you.** Seven kinds of visitors with real gold purses, reputation that shifts prices, and a traveling-smith quest. Hotel beds, tavern evenings, trade caravans across the map.
- 🌊 **A valley that looks alive.** Flowing rivers, painted ground, seasons washing the land, night light pools, clickable mini-map, and a day that breathes (72 ticks).

---

## Your first hour

House → farm → watch a workday → open the Nature tab → stock wood for winter → talk to a visitor camp → **leave some wolves alive.**

## What you'll actually do

1. **Shelter before night** — house first, or the cold will teach you.
2. **Staff the valley** — farms, mills, smiths; people walk to work and back.
3. **Watch them live** — chat bubbles, courtship, scandals, kids, remarriage.
4. **Mind the wild** — Nature tab: Stable → Strained → Damaged → Collapse. Listen early.
5. **Meet the frontier** — visitors, rivals, trade (build a **Market** for long routes), raids you prepare for.
6. **Chase a legacy** — Eco-Utopia, Great City, Trade Empire, or Harmony — or just the chronicle.

## Controls

| | |
|--|--|
| Click | Select people, buildings, camps |
| Drag / scroll | Pan / zoom (right-drag also pans) |
| **B** | Build · **1–9** quick buildings · **R** rotate strips |
| **Space** | Pause · speed buttons in the header |
| **V F N P L M** | Village · Frontier · Nature · Progress · Log · More |
| **Esc** | Cancel / clear |

## Good first checklist

- [ ] House before night one
- [ ] Farm staffed, food stable
- [ ] Valley still "alive" on Nature (Stable or Strained is fine)
- [ ] Hosted — or deliberately refused — a visitor group
- [ ] First winter with wood and food
- [ ] A few wolves still roaming
- [ ] Found the village head 👑 (map crown or header chip)
- [ ] Peeked at Progress → Goals

---

## Play (Early Alpha)

*Browser build for now — Steam / installer later.*

**Need:** [Node.js 20+](https://nodejs.org) · a modern browser

```bash
npm install
npm start
```

Open the URL the terminal prints (usually **http://localhost:5173**). Stop with `Ctrl+C`.

Early alpha: balance moves, saves migrate, edges are rough. Your "that felt unfair" notes are how the frontier improves. Colonies continue across updates (0.4 → 0.5.x saves).

**Don't kill all the wolves.** Tutorial, thesis, and warning label in one line.

## What's new in v0.5.2

The valley comes alive — flowing water and season light, real visitor trade with gold purses, elections every two years, personality traits on every settler, and people who route around rivers. Full notes → [CHANGELOG.md](CHANGELOG.md) · Roadmap → [ROADMAP.md](ROADMAP.md)

---

## For builders

The player docs end here — this README is the storefront. For the technical side:

- Architecture & sim design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Agent guide (build, test, commit conventions): [AGENTS.md](AGENTS.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md) · Roadmap: [ROADMAP.md](ROADMAP.md)
- Marketing assets: [docs/marketing/](docs/marketing/)

---

<p align="center">
  <strong>Wilderfolk</strong> · Where Beasts and Kin Unite<br>
  <em>Build the village. Guard the balance. Tell the story.</em>
</p>
