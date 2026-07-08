# Wilderfolk

<p align="center">
  <img src="public/logo.png" alt="Wilderfolk" width="120" />
</p>

<p align="center">
  <strong>Where Beasts and Kin Unite</strong><br>
  <em>Early Alpha · v0.4.2 shipped · v0.5.0 in progress (July 8, 2026)</em>
</p>

> **Player guide** — full how-to-play manual (this file). Repo pitch, doc index, and developer commands → **[README.md](../README.md)** (repo root).

---

## Latest update — v0.4.2 shipped · v0.5.0 in progress (July 8, 2026)

**Playing v0.4.2** (`GAME_VERSION` in saves). `0.4.1` saves migrate on load. Unreleased scale/quality work is in the repo pre-**0.5.0** tag. Full notes → [CHANGELOG](../CHANGELOG.md) `[Unreleased]` + `[0.4.2]`.

| Area | Highlights |
|------|------------|
| **UI** | 6-tab sidebar, alert strip, **left build catalog** (category rail), tab hotkeys `V/F/N/P/L/M` |
| **Defense** | Walls, towers, barracks, guard patrols; **Log → Combat** raid history |
| **Raids** | Preparation-focused — combat preview + Frontier readiness card; **no battle screen** |
| **Craft** | Blacksmith forge queue for iron spears & shields (research + staffed smith) |
| **Social** | Settlers chat in **3-line dialogue trees** (work, home, courtship, fear, festivals); election gossip + marriage `Yes!` scripted moments |
| **Scale (pre-tag)** | Dual-layer **spatial grid**; optional **Web Worker** sim; **OffscreenCanvas** terrain/entity layers (smoother zoom/pan) |
| **Polish** | **R** to rotate roads/walls/gates; night glow, confetti, camera nudge (toggle in ☰) |
| **Balance** | 10-year town PASS (9/9 gates) · [10-user beta](../TECHNICAL.md#playtest-report) |
| **Quality** | **390** automated tests (71 files) · lint **0 errors** · `npm run test:all` includes typecheck |
| **Fixes** | ~40 (July 4) + **252** tracker items (July 7–8, Batch O) |

### What's coming — v0.5.0 (end July 2026)

All open perf, UI, and architecture work ships in one release. Full plan → [ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md).

| Track | What it means for you |
|-------|------------------------|
| **Sim scale** | Dual spatial grid (grass 56px / mobile 80px) ✅; OffscreenCanvas layers ✅; benchmark gate — [TECHNICAL.md](../TECHNICAL.md#dual-layer-spatial-grid) |
| **UI at city size** | Sidebar tabs stay fast; App split for Village / Nature / Progress |
| **Architecture** | Web Worker sim ✅ (opt-in); render SoA buffers |
| **Social** | Dialogue-tree settler chat ✅ in code (95 JSON trees, paired 3-line banter) |
| **Quality** | Bug checkup ✅; **`simulate:20year` PASS** |
| **Polish** | Election ceremony ✅ in code (playtest Year 10/20) |
| **Steam / installer** | After v0.5.0 — download and play, no terminal |

Check **More → Roadmap** in-game for the live slice, or the full plan at [ROADMAP.md](../ROADMAP.md).

## How to install

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

See **[How to install](#how-to-install)** at the top of this page. When the real release lands, you'll download an installer or grab it on **Steam** — no terminal required.

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

## Buildings at a Glance

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

## Moon Howlers 🌝

Sometimes a grown settler is **cursed as a Moon Howler**.

They look and act like normal humans **most nights**. On a **full moon** (about every 2 weeks), they transform and **hunt settlers** — you'll see settlers flee (🏠 / panic chat) and chase lines on the map.

- Keep settlers **indoors at night** during full moons when possible
- Research **Wooden Shields** or **Iron Shields** for a chance to block strikes
- Research **Iron Spears** so settlers can fight back
- Staff a **Church** with a priest — at **dawn (7am)** after each full-moon hunt, the priest may break the curse while the settler is still in 🌝 form (~18% chance, village-wide)
- Uncured Moon Howlers return every **14 days** until cured

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

**Frontier raids:** Tense or competitive rivals may attack — see **[Frontier raids & militia](#frontier-raids--militia)** above for defend/pay-off, proactive raids, counter-raids, and rival tribute offers.

Be a good neighbor — or at least a careful one.

### Village leadership 👑

The **first male pioneer** leads at founding until **Year 10**. After that, settlers elect a **village head** by merit — job skills, experience, Town Hall service, and community standing. **Every 10 years** the village holds an election ceremony (gather, gossip, reveal, then a 3-day *Election Revelry* festival).

The **sitting head always runs** when still eligible. They get a **modest record bonus or penalty** from the village economy, scandals, and overall health — but a high-merit challenger can still win. **Raid victories** help the incumbent indirectly: Guard XP raises personal merit, and the leader’s reputation bonus on wins improves record assessment. If the head dies or is jailed, a **merit election is scheduled two years later** (no instant replacement).

See the **Village** tab leadership panel for the current 👑 head, record breakdown, years until the next election, and ranked candidates. The leader appears on the map and in the population panel.

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
| **🌿 Eco-Utopia** | 250 people + healthy ecosystem for 20 years |
| **🏰 Great City** | 400 people + 60 finished buildings |
| **💰 Trade Empire** | All 7 routes open + 40 merchant round-trips + 50,000 gold from caravan trade |
| **🐺 Harmony** | 8 **wild** wolves (untamed) + 15 wildkin — coexistence, not taming |

Unlock trade routes in the **Trade** tab as reputation grows. Once a route is **active**, a **merchant walks** from your Market/Store/Town Hall to the partner settlement and back — exports leave at the partner, imports arrive when they return (gold dashed **🚚** line on the map). Distant routes (**Silkmarket**, **Spice Coast**, **Granite Reach**) need high reputation. You can keep playing after you win.

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

**Map overlays:** the **alert strip** under the header jumps you to raids, diplomacy, low food, and ready trade routes. Press **B** to open the full build catalog; keys **1–9** quick-pick common buildings when the panel is open.

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
| **More → Roadmap** | v0.4.2 shipped · targeting v0.5.0 ([index](../ROADMAP.md)) |

**Left side:** collapsible **Build** catalog (category rail + building cards).

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

| Doc | For |
|-----|-----|
| **[README.md](../README.md)** | Repo landing — install, doc index, npm commands |
| **[TECHNICAL.md](../TECHNICAL.md)** | Architecture, tick model, dialogue trees, file map |
| **[ROADMAP.md](../ROADMAP.md)** · **[ROADMAP_0.5.0.md](../ROADMAP_0.5.0.md)** | Release plan |
| **[CHANGELOG.md](../CHANGELOG.md)** | Version history |


From the **repo root** (forwards into `app/`): `npm start`, `npm run build`, `npm run lint`, `npm run simulate:*`, `npm run sprites:humans`.

From **`app/`** (this folder): `npm test`, `npm run test:watch`, `npm run benchmark:gate`, and other sim/benchmark scripts. See [TECHNICAL.md § Running & building](../TECHNICAL.md#running--building).

---

## What's Next?

Wilderfolk keeps growing — more events, more neighbors, more ways to share the valley. Rival camps and visiting caravans are a taste of a busier frontier.

**Near term:** **[v0.5.0](../ROADMAP_0.5.0.md)** (end July 2026) — all open scale, UI, and architecture work. See [Latest update](#latest-update--v042-shipped--v050-in-progress-july-8-2026) for what's in the build today.

**Long term:** ship properly as an **installer or on Steam** — no terminal, no Node.js. This browser alpha is the trail; the boxed (or Steam) version is the destination.

For now: name your settlement, respect the wolves, and try not to pave the whole paradise.

---

## Feedback & questions

**Feedback and questions are appreciated!** You're playtesting the trail — your notes shape what ships next.

- **Email:** [info@autosolid.nl](mailto:info@autosolid.nl)
- **In-game:** Log → Chronicle → **Download .txt** and send what confused you, what felt great, or what you'd love next
- **Bugs:** [GitHub Issues](https://github.com/Rengerams/Wilderfolk/issues)

---

<p align="center">
  <strong>Wilderfolk</strong><br>
  <em>Build inside the food chain — or watch it collapse.</em>
</p>