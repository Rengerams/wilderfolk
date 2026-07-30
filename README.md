# Wilderfolk

<p align="center">
  <img src="app/public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Don't kill the wolves!</em><br>
  <em>A cozy frontier settlement sim — built inside the food chain, not on top of it.</em>
</p>

---

## What is Wilderfolk?

Most settlement games ask you to **tame** the wild. Wilderfolk asks you to **move into it** — and not wreck the neighborhood on your way in.

You share a valley with grass, rabbits, deer, wolves, rivals, caravans, winter, and the occasional full-moon curse. Wipe the wolves and your hunters go hungry later. Pave too fast and the **valley stages** warn you — then bite back.

```
🌿 → 🐰 🦌 → 🐺 🦊 → 🏹 → 🏘️
```

**Build homes. Assign workers. Watch families grow.** Host visitors at the hotel, elect a village head, survive Moon Howlers, and chase Eco-Utopia, Great City, Trade Empire, or Harmony.

> **Early alpha** — play in the browser. Steam / installer later. This repo is the open development build.

| You get | Why it matters |
|---------|----------------|
| **Living food chain** | Ecology you can read — Nature tab valley stages |
| **Settlers with schedules** | Workdays, tavern nights, courtship, drama on the map |
| **Frontier** | Visitors, rivals, Market trade, raids you prepare for |
| **Leadership** | Village head 👑, merit elections |
| **Clear goals** | Focus hints, challenges, four victory paths |

**Don't kill all the wolves.** That's the whole game in one sentence.

---

## Play

```bash
cd app   # or repo root if your scripts point at app
npm install
npm start
```

Open the URL the terminal prints (usually http://localhost:5173).

**Player guide (fun read):** [app/README.md](app/README.md)  
**Changelog:** [CHANGELOG.md](CHANGELOG.md)  
**Roadmap:** [ROADMAP.md](ROADMAP.md) · [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md)

---

## For developers

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint (from `app/`) |
| `npm test` | Vitest |
| `npm run audit` | knip + dependency-cruiser |
| `npm run dup` | jscpd |

Sim code lives under `app/src/`. Private notes stay in `private/` (gitignored).
