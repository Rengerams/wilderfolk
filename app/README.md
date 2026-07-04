# Wilderfolk

<p align="center">
  <img src="public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Early Alpha · v0.4.2 shipped · targeting v0.4.3</em>
</p>

---

## Latest update — v0.4.2 (July 5, 2026)

**Shipped.** You are on **v0.4.2** (`GAME_VERSION` in saves). `0.4.1` saves migrate on load. Full notes → [CHANGELOG](CHANGELOG.md) `[0.4.2]`.

| Area | Highlights |
|------|------------|
| **UI** | 6-tab sidebar, alert strip, map build hotbar, tab hotkeys `V/F/N/P/L/M` |
| **Defense** | Walls, towers, barracks, guard patrols; **Log → Combat** raid history |
| **Raids** | Preparation-focused — combat preview + Frontier readiness card; **no battle screen** |
| **Craft** | Blacksmith forge queue for iron spears & shields (research + staffed smith) |
| **Polish** | **R** to rotate roads/walls/gates; night glow, confetti, camera nudge (toggle in ☰) |
| **Balance** | 10-year town PASS (9/9 gates) · [10-user beta](docs/PLAYTEST_BETA_10_USERS.md) |
| **Fixes** | ~40 bug fixes (July 4) + beta UX feedback |

### What's coming

| Version | Target | What it means for you |
|---------|--------|------------------------|
| **v0.4.3** | Sep 2026 | **Bigger villages, smoother sim** — large maps and 100+ settlers without lag ([plan](../ROADMAP_0.4.3.md)) |
| **v0.4.4** | Nov 2026 | **Snappier UI at city scale** — sidebars stay fast; map polish ([plan](../ROADMAP_0.4.4.md)) |
| **v0.5.0** | Q1 2027 | Deeper engine work for huge maps and high game speed |
| **Steam / installer** | Later | Download and play — no terminal setup |

Check **More → Roadmap** in-game for the live slice, or the full plan at [ROADMAP.md](../ROADMAP.md).

**Later (not next):** tactical map battles, multiplayer, fog of war, full disease/hospital loop.

---

### You wanted a frontier. You got a food chain.

Every settlement game tells you to tame the wild. **Wilderfolk** tells you to move into it — and not wreck the neighborhood on your way in.

Build homes. Assign workers. Watch families grow. Keep the grass alive. Let the rabbits breed. Let the wolves hunt. Let the deer *not* eat your entire valley because you got trigger-happy with the traps.

```
   🌿  →  🐰 🦌  →  🐺 🦊  →  🏹  →  🏘️
        grass    prey    predators   you   your village
```

**Kill all the wolves?** You'll feel clever for a season. Then the deer explode. The grass vanishes. Your hunters come home empty-handed. You didn't lose to a raid — you lost to ecology.

Caravans camp on the edge of your map. Rival settlements stake their own claim on the same land. Winter always comes. Pollution creeps in if you pave paradise too fast.

> **Early alpha playtest** — not a finished game. Things will break, look rough, and change between updates. Save often. Your feedback shapes what ships for real.

**Don't kill all the wolves.** Seriously. That's the whole game in one sentence.

## How to Play

1. Open the game in your browser.
2. Pick a **map size** and **land type**, name your village, and press start.
3. Follow the **Quick Start** tutorial — **build a house before the first night** (8pm on day one).
4. Build a **Farm** and assign workers.
5. Click people and buildings on the map — their details always show at the top of the right panel.
6. Open the **Nature** tab and keep an eye on ecosystem health.

Your game saves automatically. You can also save and load manually from the top bar.

### Opening sequence

When you launch the game, a short **intro** plays before village setup (~20 seconds if you let it run):

| Beat | What you see |
|------|----------------|
| Aurora + particles | Soft night sky, drifting embers and leaves |
| Logo | Wilderfolk mark fades in |
| Title + subtitle | Letter-by-letter title, then *Where Beasts and Kin Unite* |
| Hook | *Don't kill all the wolves.* + food-chain reminder |
| Food chain | Grass → rabbits → deer → wolves → humans → village |
| Ready | **Begin your settlement** — map size, land type, village name |

**Skip:** click anywhere or press any key **after the logo appears** to jump straight to setup. A thin progress bar along the bottom shows how far through the intro you are.

### Play on your computer

> **Coming later:** Wilderfolk is meant to ship as a normal install — download, double-click, play — or on **Steam**. No terminal, no Node.js, no setup wizard anxiety.
>
> **Right now (early alpha):** you run it locally while we build toward that. Think of this as a rough playtest for friends and testers — bugs and half-finished ideas included.

**Today (early alpha)**

You need **[Node.js](https://nodejs.org)** (version 20+) *only for this early version*. Install the LTS version, then:

1. Open a terminal in the **Wilderfolk** project folder (the one that contains the `app` folder).
2. Run:

```bash
npm install
npm start
```

3. Your browser should open at **http://localhost:5173** (or the port shown in the terminal).

**To stop:** press `Ctrl+C` in the terminal.

**Troubleshooting (playtest only)**

| Problem | Try this |
|---------|----------|
| `npm` not found | Install Node.js from nodejs.org, then restart the terminal |
| Port already in use | Close other copies of the game; check the terminal for another port (e.g. 3001) |
| Blank page | Hard-refresh the browser (`Ctrl+Shift+R`) |

When the real release lands, delete this section from your brain — you'll just install and play.

---

## The Big Idea

Everything is connected:

**Grass → Rabbits & Deer → Wolves & Foxes → Your Hunters & Farms → Your Village**

If you wipe out the wolves, deer multiply until they eat all the grass. Then the rabbits starve. Then your people have nothing to hunt. Balance is everything.

You can farm for steadier food, but building too much raises **pollution** and hurts the wild. Grow smart, not just fast.

---

## Hunting & Combat (watch it happen)

Hunting isn't hidden in the background — you can **see it on the map**:

| What you see | Meaning |
|--------------|---------|
| **Orange dashed line** 🏹 | A settler chasing deer or rabbit |
| **Grey dashed line** 🐾 | A wolf or fox chasing prey |
| **Floating text** | `Hunted Deer! +food`, `Wolf caught Rabbit!`, `Blocked!`, `Defended!`, `Slain!` |
| **Status badge** on settlers | 🏹 hunting, 🛡️ shields, 🪖 barracks guard, ⚔️ in combat |
| **Red dashed line** ⚔️ | Incoming raid — rival camp marching toward your village |

**Who hunts whom:**

- **Foxes** → rabbits
- **Wolves** → deer & rabbits (pack bonus extends range)
- **Settlers** → deer & rabbits when hungry and off-duty
- **Moon Howlers** → settlers, deer & rabbits on **full-moon nights** (~every 2 weeks)
- **Prey** flees when predators get close

### Weapons & shields (Research → Defense)

| Tech | What it does |
|------|----------------|
| **Stone Spears** | +hunt range, +food from hunts (available early) |
| **Wooden Shields** | Block Moon Howler strikes, flee faster (needs Fortification) |
| **Iron Spears** | Better hunting, fight back vs wolves (needs Blacksmith + mining + **forge queue**) |
| **Iron Shields** | Strong predator protection (needs Blacksmith + mining + **forge queue**) |

Research tech in the **Defense** tab (under Progress). Iron gear requires a completed, **staffed Blacksmith** — queue **Iron Spears** or **Iron Shields** in the Blacksmith inspector after research completes (~6 in-game days per order).

### Fortifications (walls, towers, barracks)

| Building | Unlock | What it does |
|----------|--------|--------------|
| **Wall / Corner / Gate** | Fortification research | +8 barricade strength per segment (max +72 total) |
| **Watchtower** | Fortification research | +15 barricade strength |
| **Barracks** | Stone Spears research | Assign **Guards** manually — each patrols the village (+12 militia strength) |

Find them in the **Defense** category of the build catalog. Barracks guards orbit your village core during work hours (🪖 on the map). Press **R** while placing wall segments and gates to run them vertically.

### Frontier raids & militia

Rival camps with **tense** or **competitive** mood can declare raids on your village.

> **Fighting is not the main goal — preparation is.** Raids test walls, forge tier, guards, militia strength, and food you already stockpiled. There is **no fancy fight screen**; outcomes resolve from strength ratios. Use the **combat preview**, **Frontier readiness** card, and **Log → Combat** as your prep checklist and after-action report.

Combat is **abstract** (strength ratios, not tactical battles on the map) — but you get clear UI and map feedback before you commit.

#### When a raid is declared

| Where to look | What you get |
|---------------|--------------|
| **Red banner** (top of map) | Raid title, **2–6 day** response window, choice buttons |
| **Alert strip** (under header) | Click to jump to the raid |
| **Village tab** | Incoming raid card with respond actions |
| **Frontier tab** | Rival cards + `🏹 Raid` for counter-attacks |
| **Map** | **Red dashed line** ⚔️ from rival camp → your village; rival settlers **march** toward you (slower from far camps) |
| **Combat preview** | Militia vs attacker strength, defend/barricade/pay-off forecasts, counter-raid cost |

**Response window:** Farther rival camps get **more days** to respond (2–6 days). Their war-band also **marches slower** — use the time to arm up, barricade, or negotiate.

#### Your three defenses (incoming raid)

| Choice | Cost | Needs | Outcome |
|--------|------|-------|---------|
| **Defend with militia** | — | **Stone Spears** or **Iron Spears** research | Open battle — militia strength vs war-band; walls/towers/barracks/guards add to militia |
| **Barricade** | 20🪵 + 10🪨 | — | Hold without spears; wall/tower bonuses stack; weaker than full militia |
| **Pay off** | Rival's food demand | Enough 🍖 in storage | They leave; no fight |

**Combat preview** (rival inspector or raid banner) shows ratio hints: decisive / narrow / stalemate / defeat tiers for defend and barricade. A **cyan hint** appears when paying tribute costs **less food** than counter-raiding.

After you choose **Defend** or **Barricade**, settlers flash ⚔️ briefly (`flashMilitia`) — you see the fight resolved, not a turn-by-turn battle.

#### Counter-raid (you attack them)

From a rival camp panel (Frontier tab or map click):

- Needs **Stone Spears** or **Iron Spears**, **8+ population**, enough food for **provisions** (22–50🍖 by distance)
- **Home-turf bonus:** their camp defends at **+25%** strength vs your militia
- Outcomes: success (loot), meager spoils, or repelled (possible casualty + they may raid back)
- **Peace treaties** (🕊️) block both incoming raids and counter-raids for **60 days**

#### Militia strength (what the preview counts)

Adult settlers contribute base strength; bonuses stack from:

- Stone spears (×1.3) or **iron spears (×1.52, replaces stone — not stacked)**
- Wooden shields (+4/adult) or **iron shields (+9/adult, replaces wooden)**
- Barracks **Guards** (+14 each, manual assign)
- Wall segments (+8 each, cap +72) and watchtowers (+15) — **barricade** path only; preview matches resolve

#### Combat log & history

**Log → Combat** — filtered raid/militia/barricade entries, summary stats (entries, raid-related, defenses), export `.txt` / `.json` / `.csv`. Full chronicle still lives under **Log → Chronicle**.

#### Shipped in v0.4.2 (raids & defense)

- Distance-scaled raid deadline (2–6 days) + slower war-band march from far rivals
- Raid march lines on the map + rival settlers marching toward your village
- Combat preview + pay-off vs counter-raid hint
- Village + Frontier respond UI, map banner, alert strip
- **Walls, wall corners, wall gates, watchtowers, barracks** — full Defense build category; barricade bonuses in combat; **R** to rotate walls/gates
- **Barracks guards** — manual assign; patrol village core (🪖); +14 militia strength each
- **Log → Combat** sub-tab + export
- Settler map badges — 🏹 hunt, 🛡️ shields, 🪖 guard, ⚔️ combat
- **Bug-fix pass (July 4)** — ~40 fixes — full list in [CHANGELOG.md](CHANGELOG.md)

**Intentionally not planned:**

- **Fancy fight screen / tactical battles** — preparation and abstract resolution only
- **Outgoing counter-raid march** as spectacle — incoming march line is a **warning to prep**, not battle entertainment ([v0.4.3](../ROADMAP_0.4.3.md) may add optional polish only)

---

## Your First Day

| Do this | Why |
|---------|-----|
| **Build a House before 8pm** | Quick Start tutorial — settlers need shelter before night |
| Build a **Farm** | Steady food beats hoping rabbits show up |
| Click your **Farm** → **+ Assign** | Buildings need workers to produce |
| Open **Nature** | Watch wolves, deer, and grass — your early warning system |
| Research **Stone Spears** | See hunting improve on the map |
| Pause with **Space** | Take a breath, plan, save |

---

## The World

### Map choices

| Size | Feel |
|------|------|
| **Small** | Cozy, faster to cross |
| **Medium** | A good default frontier |
| **Large** | Epic valleys, more room to spread |

**Land types:** Verdant · Mountainous · Coastal · Arid · Harsh — each changes rivers, hills, forests, and how forgiving the land feels.

**Building placement:** You cannot build on water, mountains, or snow. Farms and industry work better on matching terrain (grassland for farms, forest for lumber mills, etc.).

### Seasons

- **Spring** — Grass grows fast, babies everywhere. Best time to expand.
- **Summer** — Steady and warm.
- **Fall** — Harvest weather, slower growth.
- **Winter** — Grass barely grows. **Stock food** or people go hungry.

Weather shifts too: rain, snow, storms, fog, drought. Storms hurt buildings. Drought starves the land unless you've researched irrigation.

---

## Who Lives Here

### Wildlife

| Creature | What they do |
|----------|----------------|
| **Grass & trees** | Feed the valley; trees are home for everything |
| **Rabbits** | Eat grass, breed fast, feed foxes and wolves |
| **Deer** | Eat grass, feed wolves and your hunters |
| **Foxes** | Keep rabbits from overrunning everything |
| **Wolves** | Keep deer from eating the valley bare |
| **Wildkin** | Rare gentle half-deer folk who graze and wander |

**Rule of thumb:** If a predator vanishes, its prey explodes. If prey explodes, grass vanishes. If grass vanishes, everyone starves.

### Your settlers

Every person has a **name**, a **family**, a **job**, and a story. They **walk** (PNG animation), **chat**, and **live on a schedule**.

- Singles **court** nearby singles (watch for 💕 and speech bubbles)
- Couples **marry** (💍), have **children** (🤰), pass down **surnames**
- Click anyone to see their family, outfit, armament, and food-chain role
- New settlers arrive when you have housing and a good reputation — or recruit from the Village tab
- **Four outfit styles** per gender — brown/tan pioneer looks, assigned by settler ID

### Day & night

The header shows **time** (☀️ day / 🌙 night). **24 ticks = one calendar day.**

| When | What settlers do |
|------|------------------|
| **Night (8pm–6am)** | Go **home** to their house — you'll see 🏠 and maybe *"Zzz…"* |
| **Morning (6am–7am)** | Still at home |
| **Work hours (7am–7pm)** | If assigned to a building → commute there (🔨) |
| **Evening (7pm–8pm)** | Head home |

**Build houses first** — that's where they sleep. Assign workers to farms and mills for the day shift (click building → **+ Assign**).

During the day off-duty, they'll hunt, socialize, wander, and chat. At night the map darkens and the village settles down — unless Moon Howlers are abroad.

---

## Buildings at a Glance

Pick from the **Construction** panel on the left (press **B** to hide it for more map space).

| You need… | Build… |
|-----------|--------|
| More people | **House**, **Mansion** |
| Food | **Farm**, **Greenhouse**, **Barn**, **Mill** |
| Wood & stone | **Lumber Mill**, **Quarry**, **Mine** |
| Gold | **Workshop**, **Store**, **Market** |
| Health & growth | **Hospital**, **School**, **Town Hall** |
| Love & Moon Howlers | **Church** (speeds courtship, breaks curses) |
| Weapons (iron tier) | **Blacksmith** (required for iron spears & shields) |
| Raid defense | **Wall**, **Watchtower**, **Barracks** (Fortification + Stone Spears research) |
| Tame wildlife | **Taming Post** (wolves, foxes, deer, rabbits) |
| Faster travel | **Road** (but wildlife hates fragmented land) |

**Placing buildings:** Select one, click the map. Press **G** for the placement grid. **ESC** or right-click to cancel. Invalid terrain shows as blocked.

**Rotate while placing:** Press **R** to flip **Road**, **Wall**, and **Wall Gate** between horizontal and vertical. The ghost preview and footprint update before you click to place. Walls and gates share the same rotation — useful for lining up fortifications and running roads north–south.

**Keys 1–9** jump to common buildings when the panel is open or collapsed.

### Atmosphere & feedback (juice)

Small touches that make the valley feel lived-in:

| When | What happens |
|------|----------------|
| **Night** | Warm **window glow** and **chimney embers** on houses and mansions when residents are home; staffed Church, Blacksmith, and Hospital get a soft door glow |
| **Build complete** | Confetti burst, `✨ Built!` float text, sprite pop, light screen shake |
| **Map click** | Camera **nudges** ~28% toward the settler or building you selected (gentle pan, not a hard snap) |

Zoom in at night after everyone is home — you'll see the village glow while wolves still hunt in the dark.

---

## Moon Howlers 🌝

Sometimes a grown settler is **cursed as a Moon Howler**.

They look and act like normal humans **most nights**. On a **full moon** (about every 2 weeks), they transform and **hunt settlers** — you'll see settlers flee (🏠 / panic chat) and chase lines on the map.

- Keep settlers **indoors at night** during full moons when possible
- Research **Wooden Shields** or **Iron Shields** for a chance to block strikes
- Research **Iron Spears** so settlers can fight back
- Build a **Church** nearby to break the curse over time

Watch the header and big-news alerts for full-moon warnings.

---

## Other Groups on the Map

You are not alone on the frontier. **Click camp markers** on the map to open diplomacy panels.

### Visitors (they leave eventually)

Caravans camp **near your village** for a while:

- **Traders** bring gold and food — trade at their camp; **talk to the caravan master** for bonus gold and reputation
- **Pilgrims** boost your reputation — leader blessing for extra rep
- **Scholars** share knowledge — research boost or coin if nothing is active
- **Performers** lift spirits — can spark a short **Visitor Revelry** festival
- **Nomads** bring wood and stories — clan head may gift timber
- **Refugees** ask you to decide — welcome (40🍖), screen (20🍖), or turn away; speak with their spokesman first
- **Hunters** compete for deer — hunt captain marks shared grounds (+rep)

Look for **cyan camp markers** on the map. Open the camp panel to **trade**, **talk to the leader** (once per visit), or negotiate refugees.

### Rival settlements (they stay)

Another group can **found a camp** on the same map — their own houses, farms, and people. Up to two rival camps can exist at once.

They show up with **indigo buildings** and a camp name. **Click their camp marker or buildings** to open the rival inspector: send gifts, trade pacts, show militia, respond to diplomacy events, **sign peace treaties**, or **raid their camp**.

**How they treat you:**

| Mood | What to expect |
|------|----------------|
| **Friendly** | Trade gifts now and then |
| **Neutral** | Mostly keep to themselves |
| **Competitive** | Hunt the same deer, nudge pollution up; may raid |
| **Tense** | Grumble about borders, hurt your reputation; **incoming raids** likely |

**Frontier raids:** Tense or competitive rivals may attack — see **[Frontier raids & militia](#frontier-raids--militia)** above for the full respond flow, combat preview, and counter-raid rules.

Be a good neighbor — or at least a careful one.

### Village leadership 👑

Your settlers elect a **village head** by merit — job skills, experience, Town Hall service, and community standing. A **founding election** runs at the start; **every 10 years** the village votes again; if the leader dies or is jailed, a **succession** election picks a replacement.

See the **Village** tab leadership panel for the current 👑 head, years until the next election, and ranked candidates. The leader appears on the map and in the population panel.

---

## Events, Festivals & Disasters

**Every couple of years**, something big happens: wolf migrations, bumper harvests, merchant caravans, superblooms, new rivals moving in, royal surveyors, surprise visitors, and more.

**Festivals** (🎉 in the header) randomly boost production, love, and immigration for a stretch — Harvest Festival, Moonlight Feast, Founders Day, and others.

**Disasters** strike without warning: fire, flood, tornado, earthquake, plague. Research **Medicine** and **Defense** to survive the worst.

The **Log** tab has two views:

| Sub-tab | What's inside |
|---------|----------------|
| **Chronicle** | Births, marriages, hunts, diplomacy, disasters, howls — filterable, copyable, export `.txt` / `.json` / `.csv` |
| **Combat** | Raid history, militia outcomes, barricade results — stats summary plus the same export formats |

Use Chronicle for the story of your village; use Combat when you want raid tallies without scrolling past baby announcements.

---

## Winning (If You Want To)

Track progress in the **Goals** tab. **Four victory paths** are active:

| Path | What it takes |
|------|----------------|
| **🌿 Eco-Utopia** | 100 people + healthy ecosystem for 20 years |
| **🏰 Great City** | 200 people + 50 finished buildings |
| **💰 Trade Empire** | 5 active trade routes + 10,000 gold |
| **🐺 Harmony** | 10 befriended wolves + 50 wildkin in the valley |

Unlock trade routes in the **Trade** tab as reputation grows (the fifth route, **Silkmarket**, needs high reputation). You can keep playing after you win. The valley doesn't stop.

---

## Controls

| | |
|---|---|
| **WASD / drag** | Move the camera |
| **Scroll wheel** | Zoom |
| **Space** | Pause |
| **☀️ / 🌙 + time** | Current hour in the header |
| **Click** | Select or build |
| **ESC** | Cancel building / clear selection |
| **B** | Show/hide left build panel |
| **G** | Toggle placement grid |
| **R** | Rotate Road / Wall / Wall Gate while placing (horizontal ↔ vertical) |
| **1–9** | Quick-pick buildings |
| **V / F / N / P / L / M** | Jump to sidebar tabs (Village, Frontier, Nature, Progress, Log, More) |
| **?** | Keyboard shortcuts overlay |
| **⭐ (header)** | Reputation — click to open Trade routes |

**Map overlays:** a **bottom build hotbar** (Banished-style) keeps common buildings one click away; the **alert strip** under the header jumps you to raids, diplomacy, low food, and ready trade routes. When the left build panel is collapsed, it only shows grid toggle and catalog expand — quick-build lives on the hotbar, not duplicated on the rail.

---

## The Panels (Right Side)

| Tab | What's inside |
|-----|----------------|
| **Inspector** (collapsible, auto-opens on map click) | Whoever or whatever you clicked |
| **Village** | Focus hints with **Go →** actions, population, 👑 leadership, armament |
| **Frontier** | Visitors, rivals, raids, diplomacy |
| **Nature** | Ecosystem health, wildlife counts, disasters |
| **Progress → Research** | Tech tree (amber dot when researching) |
| **Progress → Trade** | Trade routes (badge when routes are ready to open) |
| **Progress → Goals** | Victory progress, challenges & stats |
| **Log → Chronicle** | Births, marriages, hunts, diplomacy, disasters, howls — filter, copy, export |
| **Log → Combat** | Raid and militia history with stats + export |
| **More → Guide** | Full help + replay the tutorial |
| **More → Roadmap** | v0.4.2 shipped · targeting v0.4.3 ([index](../ROADMAP.md)) |

**Left side:** collapsible **Construction** panel (full catalog) plus the map **build hotbar** for fast placement.

---

## Tips From the Trail

1. **Don't kill all the wolves.** Seriously.
2. **House before night → farm → workers.** That order works.
3. **Winter is coming.** Always have food in storage.
4. **Watch hunt lines** — if settlers aren't hunting, research Stone Spears or let them go off-duty hungry.
5. **Pollution is quiet until it isn't.** Don't overbuild early.
6. **Roads are fast for you, hard on wildlife.**
7. **Click everything once.** The Inspector explains the food chain role.
8. **Full moons are real.** Research shields before your second moon cycle.
9. **Assign workers** — buildings only produce when someone's on the day shift.
10. **Zoom in** — you'll see walk animation, speech bubbles, chase lines, and night glow on homes.
11. **Line up walls** — press **R** while placing to run segments vertically; corners and gates rotate too.
12. **After a raid** — check **Log → Combat** for outcomes instead of hunting through the full chronicle.

---

## Secrets (no spoilers, barely)

Some nights, if the higher gods are in a mood, something **golden** might cross the sky. If you see a name you don't recognize, check the **Log**. The letters never stay friends for long.

---

## For developers

Architecture, tick model, and file layout → **[TECHNICAL.md](../TECHNICAL.md)** (repo root).  
Music and sound-effect sources → **[AUDIO_CREDITS.md](AUDIO_CREDITS.md)**.  
Release plan → **[ROADMAP.md](../ROADMAP.md)** · **[v0.4.3](../ROADMAP_0.4.3.md)** · **[v0.4.4](../ROADMAP_0.4.4.md)**.  
What shipped → **[SESSION_SUMMARY.md](../SESSION_SUMMARY.md)**.

Regenerate human outfit sprites:

```bash
npm run sprites:humans
```

---

## What's Next?

Wilderfolk keeps growing — more events, more neighbors, more ways to share the valley. Rival camps and visiting caravans are a taste of a busier frontier.

**Near term:** **[v0.4.3](../ROADMAP_0.4.3.md)** (large-map performance) → **[v0.4.4](../ROADMAP_0.4.4.md)** (city-scale UI polish). See [Latest update](#latest-update--v042-july-5-2026) for what shipped in v0.4.2.

**Long term:** ship properly as an **installer or on Steam** — no terminal, no Node.js. This browser alpha is the trail; the boxed (or Steam) version is the destination.

For now: name your settlement, respect the wolves, and try not to pave the whole paradise.

---

<p align="center">
  <strong>Wilderfolk</strong><br>
  <em>Build inside the food chain — or watch it collapse.</em>
</p>