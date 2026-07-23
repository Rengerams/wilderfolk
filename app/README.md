<!-- ⚠️ This README has been generated from the file(s) "blueprint.md" ⚠️-->
[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#wilderfolk)

# ➤ Wilderfolk

<p align="center">
  <img src="public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Don't kill the wolves!</em><br>
  <em>Early Alpha · v0.4.2 shipped · v0.5.0 in progress (July 8, 2026)</em>
</p>

> **Install + how to play** (this file). Repo overview → **[README.md](../README.md)** · developer docs → **[TECHNICAL.md](../TECHNICAL.md)**.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#latest-update--v042-shipped--v050-in-progress-july-8-2026)

## ➤ Latest update — v0.4.2 shipped · v0.5.0 in progress (July 8, 2026)

**Playing v0.4.2** (`GAME_VERSION` in saves). `0.4.1` saves migrate on load. Unreleased scale/quality work is in the repo pre-**0.5.0** tag. Full notes → [CHANGELOG](../CHANGELOG.md) `[Unreleased]` + `[0.4.2]`.

| Area | Highlights |
|------|------------|
| **UI** | 6-tab sidebar, alert strip, **left build catalog** (category rail), tab hotkeys `V/F/N/P/L/M` |
| **Climate** | Header shows **season + daily °C**; Nature tab **Season & Climate** — winter gameplay from day 270 |
| **Defense** | Walls, towers, barracks, guard patrols; **Log → Combat** raid history |
| **Raids** | Preparation-focused — combat preview + Frontier readiness card; **no battle screen** |
| **Craft** | Blacksmith forge queue for iron spears & shields (research + staffed smith) |
| **Social** | **80+ interaction paths** — **95** three-line dialogue trees across **19** chat contexts; visitor leader talks, diplomacy, elections, festivals |
| **Polish** | **R** to rotate roads/walls/gates; night glow, confetti, camera nudge (toggle in ☰) |
| **Fixes** | ~40 (July 4) + **252** tracker items (July 7–8, Batch O) |

### What's coming — v0.5.0 (end July 2026)

All open perf, UI, and architecture work ships in one release. Full plan → [ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md).

| Track | What it means for you |
|-------|------------------------|
| **Performance** | Smoother zoom and pan on large villages |
| **UI at city size** | Sidebar tabs stay fast; clearer Village / Nature / Progress panels |
| **Social** | More settler dialogue — paired 3-line banter at work, home, and festivals |
| **Polish** | Election ceremony at Year 10 and Year 20 |
| **Steam / installer** | After v0.5.0 — download and play, no terminal |

Check **More → Roadmap** in-game for the live slice, or the full plan at [ROADMAP.md](../ROADMAP.md).


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#how-to-install)

## ➤ How to install

*Early alpha — you need **Node.js** for now. A normal installer or **Steam** build is planned later.*

### Requirements

- **[Node.js 20+](https://nodejs.org)** (LTS recommended)
- A modern browser (Chrome, Firefox, Edge, Safari)

### Quick start

1. **Get the code**
   - **With Git:** `git clone https://github.com/Rengerams/Wilderfolk.git`
   - **Without Git:** on GitHub, click **Code → Download ZIP**, unzip the folder

2. **Open a terminal** in the **repo root** — the folder that contains `app/` and `package.json` (not inside `app/` alone)

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
| Install fails | Delete `node_modules` in the root **and** in `app/`, then run `npm install` again |

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


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#fun-options--ways-to-play)

## ➤ Fun options & ways to play

Wilderfolk is a sandbox inside a food chain — pick how you want to win, who you befriend, and how wild you let the valley stay.

### Frontier setup

| Choice | What it changes |
|--------|-----------------|
| **Map size** — Small · Medium · Large | How far you can spread before rivals and wildlife compete for the same hills |
| **Land type** — Verdant · Mountainous · Coastal · Arid · Harsh | Rivers, hills, forests, and how forgiving the terrain feels |
| **Village name** | Shows in the header, saves, and chronicle exports |
| **Game speed** — 0.5× · 1× · 2× · 3× · 5× · 10× | Header speed buttons; **Space** pauses anytime |

### Four victory legacies (pick your path — or ignore them)

| Path | The challenge |
|------|----------------|
| **🌿 Eco-Utopia** | 250 people + 80%+ ecosystem health for 20 years |
| **🏰 Great City** | 400 people + 60 finished buildings |
| **💰 Trade Empire** | All 7 trade routes, 40 merchant round-trips, 50,000 gold from caravan trade |
| **🐺 Harmony** | 8 **wild** wolves (untamed) + 15 wildkin — coexistence, not taming |

Track progress in **Progress → Goals**. Mid-game **challenges** nudge you toward milestones without forcing one play style.

### Neighbors, visitors & drama

| Who | Fun things to do |
|-----|------------------|
| **Visitors** (cyan camps) | Trade with **Traders**; bless with **Pilgrims**; research boost from **Scholars**; **Performers** spark **Visitor Revelry**; **Nomads** gift timber; decide **Refugee** fate; negotiate **Hunter** shared grounds |
| **Rival camps** (indigo) | Send gifts, sign **peace treaties** (60-day calm), trade pacts, **raid their camp**, or **counter-raid** when they march on you |
| **Merchant trade routes** | Unlock in **Progress → Trade**; watch gold dashed **🚚** lines when merchants walk exports and imports |

### Life in the village

**80+ social interactions** — dialogue trees, visitor talks, diplomacy, elections, festivals — in **[Village social life](#village-social-life)** below.

| System | What to watch for |
|--------|-------------------|
| **Moon Howlers** 🌝 | Full-moon hunts every ~2 weeks; shields block, Church may break the curse at dawn |
| **Taming** | **Taming Post** near wildlife — Harmony victory needs **untamed** wolves |
| **Forge queue** | Queue **Iron Spears** or **Iron Shields** at a staffed **Blacksmith** (~6 in-game days per order) |

### Map spectacle (toggle in ☰ menu)

Chase lines on hunts and raids, night window glow, confetti on build complete, camera nudge on click, status badges (🏹 🛡️ 🪖 ⚔️). Turn **Juice effects** off if you prefer a calmer map.


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#how-to-play)

## ➤ How to Play

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

See **[How to install](#how-to-install)** at the top of this page. When the real release lands, you'll download an installer or grab it on **Steam** — no terminal required.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#the-big-idea)

## ➤ The Big Idea

Everything is connected:

**Grass → Rabbits & Deer → Wolves & Foxes → Your Hunters & Farms → Your Village**

If you wipe out the wolves, deer multiply until they eat all the grass. Then the rabbits starve. Then your people have nothing to hunt. Balance is everything.

You can farm for steadier food, but building too much raises **pollution** and hurts the wild. Grow smart, not just fast.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#hunting--combat-watch-it-happen)

## ➤ Hunting & Combat (watch it happen)

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
| **Frontier tab** | Rival cards + `🏹 Raid their camp` (or **Counter-raid** if they attacked first) |
| **Orange banner** (outgoing) | Your war-band at their gates — accept tribute or fight |
| **Map** | **Red dashed line** ⚔️ from rival camp → your village; rival settlers **march** toward you (slower from far camps) |
| **Combat preview** | Militia vs attacker strength, defend/barricade/pay-off forecasts, outgoing raid cost & tiers |

**Response window:** Farther rival camps get **more days** to respond (2–6 days). Their war-band also **marches slower** — use the time to arm up, barricade, or negotiate.

#### Your three defenses (incoming raid)

| Choice | Cost | Needs | Outcome |
|--------|------|-------|---------|
| **Defend with militia** | — | **Stone Spears** or **Iron Spears** research | Open battle — militia strength vs war-band; walls/towers/barracks/guards add to militia |
| **Barricade** | 20🪵 + 10🪨 | — | Hold without spears; wall/tower bonuses stack; weaker than full militia |
| **Pay off** | Rival's food demand | Enough 🍖 in storage | They leave; no fight |

**Combat preview** (rival inspector or raid banner) shows ratio hints: decisive / narrow / stalemate / defeat tiers for defend and barricade. A **cyan hint** appears when paying **their** tribute costs **less food** than raiding back (counter-raid context only).

After you choose **Defend** or **Barricade**, settlers flash ⚔️ briefly (`flashMilitia`) — you see the fight resolved, not a turn-by-turn battle. **Even victories cost lives** — casualties scale with village population.

#### Raid their camp (you attack them)

From a rival camp panel (Frontier tab or map click):

- Needs **Stone Spears** or **Iron Spears**, **8+ population**, enough food for **provisions** (22–50🍖 by distance)
- **Two labels:**
  - **Raid their camp** — proactive first strike (they have not attacked you)
  - **Counter-raid their camp** — only when their war-band is already marching on you
- **March phase:** provisions are spent when you launch; an **orange banner** appears when your war-band reaches their camp (2–6 day window, distance-scaled)
- **Rival response:** they may **offer tribute** (food/wood/stone/gold) or **refuse and fight** — you always choose:
  - **Accept their tribute** — loot, no fight, no casualties
  - **Decline — attack anyway** — strength-ratio battle
  - **Press the attack** — when they chose to fight instead of paying
- **Home-turf bonus:** their camp defends at **+25%** strength vs your militia
- **Fight outcomes:** success (multi-resource spoils), meager spoils, or repelled (extra food loss, casualties, they may raid back)
- **Peace treaties** (🕊️) block incoming raids, outgoing marches, and recall war-bands for **60 days**

#### Raid rewards — Guard XP & elections

Everyone who **fights** in a raid (defend, barricade, or outgoing march) earns **Guard** skill experience. Better outcomes give more XP; paying tribute without a fight gives a small march XP only to the war-band.

| Fight outcome | Guard XP (each fighter) |
|---------------|-------------------------|
| Decisive defense win | 1.1 |
| Narrow / costly win | 0.85 |
| Stalemate | 0.55 |
| Defeat | 0.4 |
| Outgoing raid — success | 1.0 |
| Outgoing raid — meager / fail | 0.7 / 0.45 |

The **village head** 👑 who was in the fight gets **+0.45 extra Guard XP**. On a **win**, they also raise **village reputation** (+1 to +4 depending on how decisive the victory was).

**How this ties into elections** (Village tab → Village head):

1. **Personal merit** — Guard XP is a job skill like Farmer or Hunter. At each merit election (every 10 years from Year 10), **all** skills are summed and ×2 into your **skill** score. Raid veterans — leader or challenger — climb the standings.
2. **Leader record** — only the **sitting** head gets record bonus/penalty from economy, scandals, and village health. Raid wins that boost **village reputation** help that record at the next election (reputation thresholds in economy/health assessment). Challengers do **not** get record points — they win on personal merit alone.

Paying off an incoming raid without fighting gives **no** Guard XP.

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
- Combat preview + pay-off vs raid hint; raid vs counter-raid labels
- Outgoing raid tribute offer (accept / decline) or rival fights
- Population-scaled raid casualties; multi-resource loot on raids
- Raid fighters earn Guard XP; leader gets extra XP + reputation on wins (feeds merit elections)
- Village + Frontier respond UI, map banner, alert strip
- **Walls, wall corners, wall gates, watchtowers, barracks** — full Defense build category; barricade bonuses in combat; **R** to rotate walls/gates
- **Barracks guards** — manual assign; patrol village core (🪖); +14 militia strength each
- **Log → Combat** sub-tab + export
- Settler map badges — 🏹 hunt, 🛡️ shields, 🪖 guard, ⚔️ combat
- **Bug-fix pass (July 4)** — ~40 fixes — full list in [CHANGELOG.md](../CHANGELOG.md)

**How raids work:** You prepare (walls, forge tier, militia, tribute math), then pick defend, barricade, pay-off, raid their camp, or counter-raid after they hit you. When you attack, rivals may buy you off — you can always refuse and fight. Outcomes resolve abstractly — there is no tactical battle screen. March lines and banners are **deadline warnings** to decide before time runs out.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#your-first-day)

## ➤ Your First Day

| Do this | Why |
|---------|-----|
| **Build a House before 8pm** | Quick Start tutorial — settlers need shelter before night |
| Build a **Farm** | Steady food beats hoping rabbits show up |
| Click your **Farm** → **+ Assign** | Buildings need workers to produce |
| Open **Nature** | Watch wolves, deer, and grass — your early warning system |
| Research **Stone Spears** | See hunting improve on the map |
| Pause with **Space** | Take a breath, plan, save |

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#the-world)

## ➤ The World

### Map choices

| Size | Feel |
|------|------|
| **Small** | Cozy, faster to cross |
| **Medium** | A good default frontier |
| **Large** | Epic valleys, more room to spread |

**Land types:** Verdant · Mountainous · Coastal · Arid · Harsh — each changes rivers, hills, forests, and how forgiving the land feels.

**Building placement:** You cannot build on water, mountains, or snow. Farms and industry work better on matching terrain (grassland for farms, forest for lumber mills, etc.).

### Seasons & climate

The calendar runs **360 days per year**. The header and **Nature → Season & Climate** show the **season name** and **daily temperature (°C)**. The map stays green year-round; winter is felt through **gameplay**, not a snow overlay.

| Season | Days | Gameplay feel |
|--------|------|---------------|
| **Spring** | 0–89 | Grass grows fast, reproduction up — best time to expand |
| **Summer** | 90–179 | Steady warmth, normal growth |
| **Fall** | 180–269 | Harvest weather, slower grass |
| **Winter** | 270–359 | Grass barely grows; settlers **burn wood for heating**; extra energy drain |

**Winter prep:** stock **food** and **wood** before day 270. A contextual tip fires on your first winter.

**Weather** shifts too: rain, snow, storms, fog, drought. Rain helps grass; storms hurt buildings. Drought starves the land unless you've researched irrigation.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#who-lives-here)

## ➤ Who Lives Here

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

Every person has a **name**, a **family**, a **job**, and a story. They **walk** (PNG animation), **chat** in short back-and-forth **dialogue trees** (three lines per exchange — at work, home, courting, fleeing wolves, festivals, and more), and **live on a schedule**.

- Singles **court** nearby singles (watch for 💕 and speech bubbles — paired banter when they stand close)
- Couples **marry** (💍), have **children** (🤰), pass down **surnames**
- Click anyone to see their family, outfit, armament, and food-chain role
- New settlers arrive when you have housing and a good reputation — or recruit from the Village tab
- **Four outfit styles** per gender — brown/tan pioneer looks, assigned by settler ID

### Housing & families

The header and **Village → Population** show two different numbers:

| Number | What it means |
|--------|----------------|
| **15/100** (example) | Settlers / **immigration cap** — who can still arrive or be recruited |
| **🛏️ 84** | **Physical beds** in completed houses (upgrades count) |

Births can push population above the cap or bed count for a while — build more houses to catch up.

**Who lives where**

- **Couples & kids** prefer their own empty house when one is free
- **Singles** may share a house together (or bunk with a couple if every home is occupied)
- When someone **marries**, the couple moves into their own home
- **Children** stay with **mother**, then **father** if she’s gone; **bastards** may go to **grandma** if mother is gone
- **Orphans** with no kin are adopted by a random married couple, or given a bed in any house with space
- Adults **18+** still at home can use **Move to own home** in their inspector when an empty house exists
- If **all houses are full**, families **stay together** in shared homes rather than splitting up

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


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#village-social-life)

## ➤ Village social life

Wilderfolk is as much about **people** as ecology. The valley has **more than 80 different social interaction possibilities** — settler banter alone draws from **95 unique three-line dialogue scripts**, and that's before visitor camps, rival diplomacy, elections, festivals, scandals, and recruitment.

Families form, gossip spreads, elections matter, and the **Log → Chronicle** becomes the story of your valley.

### 80+ interactions — what's in the mix

| Layer | Count | Examples |
|-------|-------|----------|
| **Dialogue trees** | **95** scripts | Paired 3-line banter — work gripes, home life, courtship, fear, festivals, elections, affairs |
| **Chat contexts** | **19** triggers | Work, home, courtship, hunt, fear, festival, election, winter, pregnant, child, school, affair, visitor, rival, guard, food, sleep, renffr, social |
| **Dialogue categories** | **6** pools | Work · needs · social · existential · chaos · environment (season, weather, and low food shift picks) |
| **Visitor camps** | **7** kinds | Traders · pilgrims · scholars · hunters · nomads · refugees · performers — each with a **once-per-visit leader talk** |
| **Refugee negotiate** | **3** choices | Welcome all · screen applicants · turn away |
| **Visitor trade** | **3** actions | Buy food · buy wood · sell food |
| **Rival diplomacy cards** | **4** event types | Tribute · border dispute · alliance · peace treaty — **3 response options** each |
| **Rival camp actions** | **6+** | Food gift · trade pact · peace treaty · show militia · raid · counter-raid |
| **Election ceremony** | **4** phases | Gathering · gossip · tension · reveal (+ ranked candidate chatter) |
| **Festivals** | **5+** sources | Random village parties · Visitor Revelry · Election Revelry · Town Hall hosted · performer toasts |
| **Life events** | many | Courtship chase, marriage `Yes!`, pregnancy chat, bastard gossip, divorce, scandal, prison, recruit settler, Moon Howler panic |

You don't pick these from a menu — they **fire from what settlers are doing**, who's on the map, and what you chose at camps and election time. Zoom in and read the bubbles.

### Settler chat & dialogue trees

Settlers don't stand around silently — they **talk on the map** in short **three-line dialogue trees** (paired banter when two people stand close). The game rotates through **95 different scripts** so repeat play stays fresh.

| Context | When it fires |
|---------|----------------|
| **Work** | At assigned farms, mills, forges, guard posts |
| **Home** | Evening and night around their house |
| **Courtship** | Singles chasing each other — high chance when close |
| **Fear** | Wolf chases, Moon Howler panic |
| **Festival** | During any active village party |
| **Election** | Merit vote ceremonies |
| **Winter** | Cold-season grumbling |
| **Pregnant / child / school** | Family milestones and school days |
| **Affair** | Secret romance drama (chaos category) |
| **Visitor / rival** | Frontier camps on the map |
| **Guard / hunt / food / sleep** | Barracks patrol, hunting trips, hunger, bedtime |
| **Renffr** | Rare omen nights — existential whispers |

**95 dialogue trees** × **19 contexts** × **6 categories** = hundreds of in-game combinations. Season, weather, low food, and active festivals nudge which script plays next.

**Watch for:** speech bubbles above settlers, paired exchanges when they meet, and scripted peaks — the marriage **`Yes!`** moment when a couple ties the knot.

### Courtship & marriage

| Stage | What happens |
|-------|----------------|
| **Single** | Off-duty adults seek a nearby single of the opposite gender |
| **Courting** | 💕 hearts, chase lines, courtship chat — both need **100% progress** |
| **Married** | 💍 shared home, **surnames** sync, `Married!` float text, chronicle entry |

**Courtship speed boosts:**

| Boost | Effect |
|-------|--------|
| **Staffed Church** | Faster progress (priest on duty) |
| **Active festival** | ×2 courtship rate |
| **Visitor performers** | ×1.35 while troupe is camped |
| **Living together** | ×1.5 when courting singles share a home |

Build a **Church** (Community) and staff it to speed matches. **Performers** visiting your map can spark revelry that helps love along.

### Affairs, scandals & the Prison

Married life isn't always quiet.

- Married settlers can pursue **secret affairs** off-screen and near workplaces
- **Caught cheating** → village gossip, **reputation loss**, possible **divorce** (spouse may leave and restore a maiden name)
- **Bastard births** can trigger gossip about who the real father is
- Repeat or serious scandal can send someone to the **Prison** (Community building, Architecture research)
- A staffed **Town Hall** softens scandal reputation damage — functioning civic leadership matters

Check **Log → Chronicle** (filter scandals and marriages) when the village gets dramatic.

### Families, children & schools

| Topic | Rule of thumb |
|-------|----------------|
| **Pregnancy** | Married couples (and some affairs) can expect children — 🤰 on the map |
| **Birth** | Mother keeps the child; chronicle logs the name and family |
| **Children** | Juveniles live with **mother**, then **father** if she's gone |
| **Bastards** | May go to **grandma** if the mother is unavailable |
| **Orphans** | Adopted by a random married couple, or any house with a free bed |
| **School** | Staff a **School** — children gain education ticks that help them grow up |
| **Adults 18+** | Still at home? Use **Move to own home** in their inspector when a house is empty |

Population can exceed beds or immigration cap briefly after a baby boom — build more **Houses** to catch up.

### Reputation, immigration & recruitment

**Reputation ⭐** (header — click to open Trade) is the village's social standing.

| Reputation helps… | How to raise it |
|-------------------|-----------------|
| **Trade routes** | Unlock partners in **Progress → Trade** (15–95 ⭐ depending on route) |
| **Immigration** | New families arrive when housing, food, and rep are healthy |
| **Visitor welcome** | Pilgrims bless you; performers lift spirits; refugee choices matter |

| Number | Meaning |
|--------|---------|
| **15/100** (example) | Settlers / **immigration cap** — housing raises the cap |
| **Natural arrivals** | Pause when food is low, beds are full, or cap is hit |
| **📯 Recruit settler** | **Village** tab — costs **30 food + 20 gold** when under cap |

**Town Hall** (Urban Planning research): staff **officials** for taxes, **+trade** on active routes, **+immigration** rolls, election site, scandal buffer, and **hosted festivals**.

### Village leadership & elections 👑

| Phase | Detail |
|-------|--------|
| **Founding** | First male pioneer leads until **Year 10** |
| **Merit elections** | Every **10 years** from Year 10 — highest merit score wins |
| **Ceremony** | Settlers **gather → gossip → tension → reveal** on the map (watch the bubbles) |
| **Election Revelry** | **3-day festival** after the vote |
| **Vacancy** | Leader dies or jailed? Next merit election in **2 years** — no instant replacement |

**Merit score** (Village → leadership panel):

| Factor | Points |
|--------|--------|
| **Job skills** | Sum of all skills × **2** (Farmer, Hunter, Guard, Official, …) |
| **Age / experience** | Older adults edge slightly |
| **Town Hall service** | **+15** if serving as official |
| **Married** | **+5** community standing |
| **Incumbent record** | Sitting head only: economy, scandals, village health (modest bonus or penalty — challengers can still win on merit) |

**Raid veterans** climb standings via **Guard XP**. Wins while 👑 head also nudge **record assessment** through reputation — see **[Frontier raids & militia](#frontier-raids--militia)**.

### Festivals & social boosts

**Festivals** (🎉 in the header) are village mood multipliers:

| Source | Examples |
|--------|----------|
| **Random** | Harvest Festival, Moonlight Feast, Founders Day, Spring Revel, Trade Fair |
| **Visitors** | **Visitor Revelry** from performers (once per troupe visit) |
| **Elections** | **Election Revelry** after a merit vote |
| **You** | **Town Hall → Host town festival** (25 food + 20 gold, 14 days, cooldown between parties) |

During festivals: **×1.5 production**, faster **courtship**, better **immigration** rolls, and more social chat.

### Frontier visitors (social choices)

**Seven visitor kinds** camp on the map (cyan markers). Each has a **unique leader talk** (once per visit) plus camp-specific actions:

| Visitor | Leader talk | Other social actions |
|---------|-------------|----------------------|
| **Traders** | Caravan master — bonus gold + trade gossip (+rep) | Buy food · buy wood · sell food |
| **Pilgrims** | Elder blessing (+8 rep) | Passive daily reputation while camped |
| **Scholars** | Head scholar — +25 research (or gold if idle) | — |
| **Hunters** | Hunt captain — shared grounds (+5 rep, less poaching) | — |
| **Nomads** | Clan head — gift wood + stories (+2 rep) | — |
| **Performers** | Troupe toast — mini **Visitor Revelry** festival (+6 rep) | Courtship boost while troupe is near |
| **Refugees** | Spokesman opens negotiate | **Welcome all** (40 food, up to 2) · **screen** (20 food, maybe 1) · **turn away** |

**Rival diplomacy** (indigo camps) adds another **12+ response buttons** across tribute demands, border disputes, alliance offers, and peace treaties — plus gifts, trade pacts, militia parades, and raid/counter-raid choices from the Frontier tab.

### Skills, jobs & community buildings

Every adult has **job skills** that rise with work (and raids for Guards). Skills feed **election merit** and building output.

| Building | Social role |
|----------|-------------|
| **Church** | Courtship speed; **Moon Howler** dawn exorcism (~18% per staffed church after full-moon hunt) |
| **School** | Educates children on the day shift |
| **Hospital** | Health and reputation over time when staffed |
| **Town Hall** | Civic hub — taxes, trade, immigration, elections, festivals |
| **Prison** | Holds scandal sentences |
| **Taming Post** | Social with wildlife — tame wolves, foxes, deer, rabbits (Harmony path needs **wild** wolves) |

Click any settler on the map — the **Inspector** shows family, job, skills, outfit, armament, and their place in the food chain.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#buildings-at-a-glance)

## ➤ Buildings at a Glance

Open the **Build** panel on the left (press **B** to collapse for more map space). Categories: Housing, Food, Resources, Industry, Community, Defense.

| You need… | Build… |
|-----------|--------|
| More people | **House**, **Mansion** |
| Food | **Farm**, **Greenhouse**, **Barn**, **Mill** |
| Wood & stone | **Lumber Mill**, **Quarry**, **Mine** |
| Gold | **Workshop**, **Store**, **Market** |
| Health & growth | **Hospital**, **School**, **Town Hall** |
| Love & Moon Howlers | **Church** (speeds courtship; dawn exorcism after full-moon hunts) |
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


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#moon-howlers-)

## ➤ Moon Howlers 🌝

Sometimes a grown settler is **cursed as a Moon Howler**.

They look and act like normal humans **most nights**. On a **full moon** (about every 2 weeks), they transform and **hunt settlers** — you'll see settlers flee (🏠 / panic chat) and chase lines on the map.

- Keep settlers **indoors at night** during full moons when possible
- Research **Wooden Shields** or **Iron Shields** for a chance to block strikes
- Research **Iron Spears** so settlers can fight back
- Staff a **Church** with a priest — at **dawn (7am)** after each full-moon hunt, the priest may break the curse while the settler is still in 🌝 form (~18% chance, village-wide)
- Uncured Moon Howlers return every **14 days** until cured

Watch the header and big-news alerts for full-moon warnings.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#other-groups-on-the-map)

## ➤ Other Groups on the Map

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

**Frontier raids:** Tense or competitive rivals may attack — see **[Frontier raids & militia](#frontier-raids--militia)** above for defend/pay-off, proactive raids, counter-raids, and rival tribute offers.

Be a good neighbor — or at least a careful one.

### Village leadership 👑

Merit elections, ceremony phases, scandal record, and Guard XP on the ballot — see **[Village social life → Village leadership & elections](#village-leadership--elections-)**. The **Village** tab shows the current 👑 head, record breakdown, and ranked candidates.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#events-festivals--disasters)

## ➤ Events, Festivals & Disasters

**Every couple of years**, something big happens: wolf migrations, bumper harvests, merchant caravans, superblooms, new rivals moving in, royal surveyors, surprise visitors, and more.

**Festivals** (🎉 in the header) boost production, courtship, and immigration — random village parties, **Visitor Revelry** from performers, **Election Revelry** after merit votes, and **Town Hall** festivals you host yourself.

**Disasters** strike without warning: fire, flood, tornado, earthquake, plague. Research **Medicine** and **Defense** to survive the worst.

The **Log** tab has two views:

| Sub-tab | What's inside |
|---------|----------------|
| **Chronicle** | Births, marriages, hunts, diplomacy, disasters, howls — filterable, copyable, export `.txt` / `.json` / `.csv` |
| **Combat** | Raid history, militia outcomes, barricade results — stats summary plus the same export formats |

Use Chronicle for the story of your village; use Combat when you want raid tallies without scrolling past baby announcements.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#winning-if-you-want-to)

## ➤ Winning (If You Want To)

Track progress in the **Goals** tab. **Four victory paths** are active:

| Path | What it takes |
|------|----------------|
| **🌿 Eco-Utopia** | 250 people + healthy ecosystem for 20 years |
| **🏰 Great City** | 400 people + 60 finished buildings |
| **💰 Trade Empire** | All 7 routes open + 40 merchant round-trips + 50,000 gold from caravan trade |
| **🐺 Harmony** | 8 **wild** wolves (untamed) + 15 wildkin — coexistence, not taming |

Unlock trade routes in the **Trade** tab as reputation grows. Once a route is **active**, a **merchant walks** from your Market/Store/Town Hall to the partner settlement and back — exports leave at the partner, imports arrive when they return (gold dashed **🚚** line on the map). Distant routes (**Silkmarket**, **Spice Coast**, **Granite Reach**) need high reputation. You can keep playing after you win.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#controls)

## ➤ Controls

| | |
|---|---|
| **WASD / drag** | Move the camera |
| **Scroll wheel** | Zoom |
| **Space** | Pause / resume |
| **Speed buttons** | 0.5× · 1× · 2× · 3× · 5× · 10× (header) |
| **Season · °C · Y/D · time** | Season, daily temperature, year/day, hour, weather, festival 🎉 |
| **Click** | Select or build |
| **ESC** | Cancel building / clear selection |
| **B** | Show/hide left build panel |
| **G** | Toggle placement grid |
| **R** | Rotate Road / Wall / Wall Gate while placing (horizontal ↔ vertical) |
| **1–9** | Quick-pick buildings |
| **V / F / N / P / L / M** | Jump to sidebar tabs (Village, Frontier, Nature, Progress, Log, More) |
| **?** | Keyboard shortcuts overlay |
| **⭐ (header)** | Reputation — click to open Trade routes |

**Map overlays:** the **alert strip** under the header jumps you to raids, diplomacy, low food, and ready trade routes. Press **B** to open the full build catalog; keys **1–9** quick-pick common buildings when the panel is open.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#the-panels-right-side)

## ➤ The Panels (Right Side)

| Tab | What's inside |
|-----|----------------|
| **Inspector** (collapsible, auto-opens on map click) | Whoever or whatever you clicked |
| **Village** | Focus hints with **Go →** actions, population, 👑 leadership, armament |
| **Frontier** | Visitors, rivals, raids, diplomacy |
| **Nature** | **Season & Climate**, ecosystem health, wildlife counts, disasters |
| **Progress → Research** | Tech tree (amber dot when researching) |
| **Progress → Trade** | Trade routes (badge when routes are ready to open) |
| **Progress → Goals** | Victory progress, challenges & stats |
| **Log → Chronicle** | Births, marriages, hunts, diplomacy, disasters, howls — filter, copy, export |
| **Log → Combat** | Raid and militia history with stats + export |
| **More → Guide** | Full help + replay the tutorial |
| **More → Roadmap** | v0.4.2 shipped · targeting v0.5.0 ([index](../ROADMAP.md)) |

**Left side:** collapsible **Build** catalog (category rail + building cards).

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#tips-from-the-trail)

## ➤ Tips From the Trail

1. **Don't kill all the wolves.** Seriously.
2. **House before night → farm → workers.** That order works.
3. **Winter is coming (day 270).** Stock food **and wood** — settlers burn wood to heat homes.
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


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#secrets-no-spoilers-barely)

## ➤ Secrets (no spoilers, barely)

Some nights, if the higher gods are in a mood, something **golden** might cross the sky. If you see a name you don't recognize, check the **Log**. The letters never stay friends for long.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#whats-next)

## ➤ What's Next?

Wilderfolk keeps growing — more events, more neighbors, more ways to share the valley. Rival camps and visiting caravans are a taste of a busier frontier.

**Near term:** **[v0.5.0](../ROADMAP_0.5.0.md)** (end July 2026) — all open scale, UI, and architecture work. See [Latest update](#latest-update--v042-shipped--v050-in-progress-july-8-2026) for what's in the build today.

**Long term:** ship properly as an **installer or on Steam** — no terminal, no Node.js. This browser alpha is the trail; the boxed (or Steam) version is the destination.

For now: name your settlement, respect the wolves, and try not to pave the whole paradise.

---


[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#feedback--questions)

## ➤ Feedback & questions

**Feedback and questions are appreciated!** You're playtesting the trail — your notes shape what ships next.

- **Email:** [info@autosolid.nl](mailto:info@autosolid.nl)
- **In-game:** Log → Chronicle → **Download .txt** and send what confused you, what felt great, or what you'd love next
- **Bugs:** [GitHub Issues](https://github.com/Rengerams/Wilderfolk/issues)

---

<p align="center">
  <strong>Wilderfolk</strong><br>
  <em>Don't kill the wolves!</em><br>
  <em>Build inside the food chain — or watch it collapse.</em>
</p>