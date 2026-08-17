# Changelog

## [0.6] — 2026-08-17
---

- **Build, flow, and grow: watch the valley transform.**

- `GAME_VERSION` **0.6** · ⚠️ **beta save policy: this build loads only 0.6 saves** (historical-save compatibility dropped — a save from any other build is rejected; start a new settlement)

### Added
- **🎣 Fishing Spot (Phase 6: rivers feed)** — a new Food building that must straddle water (a dock): staffed fishers haul `8 + 4×workers` food per day, thin in winter (55%), rich in fall (115%). Safer than hunting — no wolves fight back. Generated sprite `fishingspot.png`
- **🌳 Wildlife Preserve (Phase 6: ecology tools)** — a new Community building: fenced wild grove that **restores ecosystem health +4** and shows the valley you're giving back. No workers
- **📜 Valley Chronicle (Phase 7: people become history)** — the victory-path replacement: **9 chapter milestones** (The Foundation → The First Harvest → The Great Hunt → The River's Gift → The Iron Age → The Market Opens → Keeper of the Wild → The Alliance → A Century). Each unlocks once, logs to the chronicle, grants a small reward, and appears as a **center-screen title card**. Progress lives in Progress → Goals. No win/lose — the valley just keeps living
- **🌄 Cinematic moments (Phase 8: feel)** — a title card marks your **founding** and every **chronicle chapter** unlock; **construction now builds up** visually — scaffolds grow from 45% to full size as progress rises
- **🤝 Relationships (Phase 7: relationship webs)** — settlers build **friendships** from shared work, shared homes and childhood school bonds (become friends at 60); **feuds** start when a spouse catches a cheater with a paramour, drain energy daily, and slowly heal. Friends lift each other's energy; the chronicle log tells both stories
- **🎓 Apprenticeships (Phase 7: skills pass on)** — a master (skill ≥ 40) at a staffed production building takes on the nearest juvenile; the apprentice learns fast under a good master and **graduates at skill 50** into the trade. Building panels show who is teaching whom
- **👑 Dynasties (Phase 7: family legacy)** — the Goals tab lists **living dynasties** (surnames across generations), and a true **three-generation dynasty unlocks a Valley Chronicle chapter** ("A Dynasty", +200 gold)
- **🗳️ Elections are real ballots (Phase 7: vote-support)** — every adult settler votes; **merit stays the strongest force** (a candidate ahead by >15 points wins every ballot), while **friendships boost and feuds can cancel a vote** — bonds only tip close races. Results log as "X of Y ballots", and the announcement reads "Elected by ballot"
- **🔩 Iron — a real resource at last** — the economy audit found "iron" gear was secretly paid in wood+stone+gold; now **iron is a true fifth resource**: the **Mine gains an Extract mode (🪨 Stone / 🔩 Iron)**, and all **Blacksmith forge orders cost iron** (Spears → Ballistae, ~15–40 each). Iron shows in the header (lg+), forge cost chips, challenge rewards, and the Ironport trade route pays iron. Mine iron mode yields ~21/day; the forge is now an iron sink, not a gold sink. (Audit → `docs/private/ECONOMY_AUDIT_2026-08-17.md`)
- **🎓 First-spring guide** — a living, step-by-step tutorial walks new players through their first year (build a house → plant a farm → assign workers → secure wood/meat → earn gold → prepare for winter → year two). It's a **non-modal banner** that auto-advances as you actually do each thing, and can be **skipped at any time**. New-settlement screen has a **First-spring guide On/Off choice** (remembered) — turn it off to start completely free, no tutorial at all
- **🏚️ Wood Storehouse** — a new Resources building (`storehouse_wood.png`) that shelters **+800 wood storage** for winter fuel; the base wood cap is 500 → **800**, so a 50-pop village can finally bank a winter (~900 needed)
- **🍞 Food keeps longer** — spoilage drops **3% → 2%/day** and the base food cap rises to 800 (silos still cut further); banking food for winter is now viable
- **💰 Gold has a cap** — 20,000 (was uncapped); the late-game snowball stops and the header shows the cap
- **🌾 Farms reward workers** — farm output now scales `12 + 5×workers` (was a flat 22), so a fully-staffed farm out-produces an empty one

### Changed
- **Great City challenge reward nerfed** — 1,000×4 + 500 iron → **400×4 + 200 iron** (the mid-game economy eraser is gone)
- **Placement is unambiguous (external review P0)** — placing a building now floats **`🔨 House · −40w −10s −5g · 2d`** at the site: cost charged now, build time shown, so the click's commit is obvious; header resource badges now **pop on decrease too** (rose ring) so spending is visible
- **One primary prompt (external review P0)** — while the first-spring guide's "build a house" step is live, the duplicate "Build shelter" focus hint is suppressed; the guide is the single call to action
- **Version/save docs corrected (external review P1)** — README, in-game roadmap and `ARCHITECTURE.md` now all state the current `0.5.4.2` + exact-version save policy (no more stale `0.5.4.1`/`0.4…0.5.1` claims)
- **Hygiene (external review P1/P2)** — "5 valleys" copy fixed to 6; stray `Wilderfolk - Snelkoppeling.lnk` removed from `src/game/`
- **Quality**   pathfinding, painted valley, economy ledger, quests, trade, elections, multi-select, decor, SFX, weather, App split updated
- **Charts subtab (Progress tab)** — a rolling ~40-day view that makes the valley legible: the **food chain** (humans/wolves/rabbits/deer/foxes on one chart), **ecosystem health & pollution**, and **gold/food/wood/stone trends** — the loop you could only feel before, you can now read
- **Victory paths removed** (redesign) — the four hard win conditions (Eco-Utopia, Great City, Trade Empire, Harmony) are gone: they were not well thought out as end conditions and locked the sandbox into arbitrary targets. The game is now a **pure frontier sandbox** — no forced win, no victory banners; optional Challenges keep rewarding milestones, and the **village portrait** ("how history sees you") remains the live story readout. The system is slated for a proper redesign later.

### Performance
- **Quality**   pathfinding, painted valley, economy ledger, quests, trade, elections, multi-select, decor, SFX, weather, App split updated

---

## [0.5.4.2] — 2026-08-15

**The valley rises — painted relief, rivers that run, and upgrades you can see.**

- `GAME_VERSION` **0.5.4.2** · ⚠️ **beta save policy: this build loads only 0.5.4.2 saves** (historical-save compatibility dropped — a save from any other build is rejected; start a new settlement)

### Added
- **🦌 The Passing Herds** — every autumn a herd of deer crosses the valley: they graze, they are huntable, and they leave after a week. **The herds remember** — every deer you take this year makes next year's herd smaller (feast now, thinner autumns later); let them pass unharmed and they come back fat as ever
- **🎉 Seasonal festivals** — the village now holds a 5-day festival at the start of every season (Spring Revel · Midsummer Feast · Harvest Festival · Frostfall Feast): **20 guaranteed festival days per year**, with the old random festivals on top
- **🍺 Taverns never close during festivals** — the innkeeper works all day and night while the party is on, so the pub stays open around the clock
- **🌷 Decor & village beauty** — new **Decor** build tab (garden, statue, lamp, wooden fence, all procedural art). Decor stamps neighborhood beauty: settlers drift toward pretty spots in free time (and a 💐 mood lift), and the Population panel shows a **Village mood** readout fed by how much beauty surrounds your settlers
- **⛈️ Weather with real consequences** (game-feel Phase 3.4) — weather is no longer just a tint. Storm days slowly damage your buildings (recoverable with the 🔧 Repair button, halved by Fortification research, never destroying a building); **Drought cuts farm & greenhouse harvests to half**, Rain gives them a small boost
- **See the storm bite** — when a storm batters your buildings, the damage is now visible on the map: debris particles fly and a ⛈️ warning floats up from each battered roof (not just a toast)
- **🏔️ 2.5D painted relief** — the valley now reads as a landscape, not colored blocks. Coastlines and rivers get **hand-painted shores** from a painted grass-biome tileset (blob-autotiled grass↔water transitions, mirror-flipped to fill every corner), and **hills and peaks physically rise** out of the plain: raised surfaces with sun-lit edges and shaded cliff faces dropping to the lowland and water below. Buildings, settlers and props **ride the terrain** — nothing floats on slopes. Flat ground, water shimmer, season wash and zoom LOD all unchanged
- **🪵 Painted dirt hills** — Hills, Rocky and Mountain relief surfaces stamp a hand-painted seamless soil texture (matching the painted coasts)
- **🔨 Upgrades you can see** — an upgraded building now reads at a glance: **Lv2** grows a warm new roof and a chimney, **Lv3** a stronger roof, a soft gold rim, and a gentle glow at night (on top of the existing gold trim + pennant)

### Fixed
- **The herds survive a save/load** — a save made mid-migration used to drop the active herd and its year-to-year memory (the deer then lingered forever as permanent strays); the migration state now rides in the save schema, pinned by a regression test
- **No double election gossip during ceremonies** — the daily gossip roll ran *and* the ceremony's own tick gates rolled again on day-boundary ticks (72 % 18 = 0, 72 % 24 = 0), so a ceremony's gossip/tension phases fired twice on boundary days; the daily layer now stands down while a ceremony is running
- **The valley is lit at founding** — the colony now starts at 08:00 instead of midnight, so the founding scene no longer opens in pitch darkness (settlers arrive to a lit valley with visible water)
- **Rivers look like rivers** (new maps) — a river now carves a **whole-tile water band 3–5 tiles across** (wider at confluences) instead of a 1-tile thread, and the old thin blue "stream" stroke is gone — the painted water and painted shores carry the look. **Riverlands and Coastal maps finally get rivers**: river sources now form at ~70% of each preset's reachable elevation, so low-lying valleys no longer come up dry
- **Build menu switching works** — with a building tool selected you can now jump to any other build category and pick a different building directly; previously the category tab was pinned to the selected tool, so you had to cancel before switching (EM-8)

### Performance
- **One entity index build per tick instead of three** (cadence audit) — the entity-by-type index was rebuilt twice inside `gameTick` plus once for the render catalog; ticks without births/deaths/type-changes now reuse identity-stable buckets and the catalog skips its rebuild. Small measured win (~3% at 1,200 settlers), groundwork for the v0.6 capacity work

### Technical
- **App.tsx split (Phase 4)** — `VisitorCampPanel`, `SelectedEntityPanel`, `BigNewsBanner`, `ActiveEventBanner` and `ShortcutsOverlay` extracted into `src/components/`; App.tsx 2917 → 2270 lines
- **Beta save policy** — dropped the historical-save gate (`COMPATIBLE_SAVE_VERSIONS`); `parseSaveJson` now accepts only the exact current `_version`. A save from any other build is rejected with a clear message; `saveVersion.gate.test.ts` pins the new gate

---

## [0.5.4] — 2026-08-11 

**Six valleys to settle — painted lands, walking pioneers, and a frontier that breathes.**

`GAME_VERSION` **0.5.4** · continue colonies from **0.4.x – 0.5.3**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Added
- **Choose your land** — the new-settlement screen is a painted gallery: each of the **six valleys** (Verdant, Mountainous, Coastal, Arid, Harsh, and the new **Riverlands** marshland) is a tiny landscape card, and map size is a slim segmented control
- **Settlers walk properly** — human sprites can now be **4-frame walk sheets** (landscape PNGs) and the renderer animates real leg-swing frames; single-frame art still works as before. Unset outfit variants now spread across the village instead of everyone wearing outfit 0
- **Human sprite pack** — **8 outfits per gender** (was 4) and dedicated **toddler art** for kids (no more shrunk adults); a settler's standing pose now matches their outfit
- **Pavement roads** — roads and their junctions tile the seamless `tile_pavement` texture (with a flat-fill fallback while it loads)
- **The valley got painted** — procedural decor pass: snow mounds, beach ripples, clustered rocks, and tiny meadow flowers (no new art needed)
- **Titles sway elections** — settlers who earned a title (**Moonslayer**, **Howlerbane**) carry **+8 merit** into leadership votes; the title shows in the race standings and announcements
- **Schools are your call now** — teachers are **manually assigned** (no auto-fill, so you pick the personality shaping the kids), and each school caps attendance at **10 children** — a full classroom means building a second school
- **Kids are gossip couriers** — a child at school whose parent carries an established affair may let it slip, exposing the scandal as a rumor (🤫 whispered…). One slip per child per day — the schoolyard does the church's gossip work
- **Schoolyard bonds** — kids at school befriend classmates (👫 every ~5 school days, up to 3 friends); those childhood bonds follow them into adulthood and nudge who they court — a friend counts as half the distance
- **Multi-select workers** — shift-click settlers to select several at once (every selected settler shows a ring); select a building and one button assigns them all
- **Sound of the work** — the village has ambience now: soft work sounds (chopping, mining, hammering, farming, gathering) whenever staffed production is active, and quiet footsteps pitched by the surface underfoot (grass, stone, snow, forest, water). Throttled and unobtrusive — the dramatic sounds (hunts, deaths, the Moon Howler) were already wired

### Fixed
- **Saves from the current build now load** — v0.5.3 tagged its saves with a version the loader rejected, so a save made in the current build could never be read back (colony lost on refresh). The version gate accepts the current version, and a test now pins it for every future bump
- **Worker-command validation tests are running again** — three regression tests (pinning the forge/trade command validator to the real catalogs) sat outside the test suite and silently never ran; they're back in the gate
- **The hotel renders as a building** — its sprite was a JPEG wearing a `.png` name (no transparency), so it drew as a rectangle box; converted to a real transparent RGBA sprite
- **Rivers are rivers** (new maps) — the channel used to carve exactly one tile wide (a trickle); now it widens into a 2–4 tile channel in the lowlands and narrows to a stream on slopes. Existing saves keep their old terrain
- **Animals respect the water** — wildlife wades shallow water but slides along riverbanks instead of walking straight through rivers and deep water
- **The valley stops crying wolf** — three false "nature is hurt" alarms fixed: a **full meadow** no longer reads as overgrazed (it has regrow potential), a map that simply **spawned no wolves** is a caution instead of an instant crisis, and the stage now needs a **3-day warning window** before it escalates instead of dropping after one day

---

## [0.5.3] — 2026-08-07

**The night hunts back — Moon Howler exorcism overhaul, personality traits, and the deepest playtest pass yet.**

- `GAME_VERSION` **0.5.3** · continue colonies from **0.4.x – 0.5.2**.  
- Feature table → [ROADMAP.md](ROADMAP.md) · Moon Howler release notes → [docs/marketing/moon-howler-overhaul.md](docs/marketing/moon-howler-overhaul.md)

### Fixed
- **Rivers actually flow** — world-gen rivers now follow a smoothed elevation gradient from mountain peaks (with a basin-bypass fallback) and carve their channel into real water tiles; before, greedy descents died on spiky noise and rivers rendered as land on every preset
- **Clicking a citizen selects them again** — grass tiles (spawned first, 10.8px hit radius) won the click hit-test race over settlers standing on them; scenery is no longer click-selectable
- **Eco metrics no longer over-tick** — pollution / ecosystem health / biodiversity refresh once per day instead of 18×/day (pure waste removed)
- **Build hints respect tutorials-off** — the floating “Placing X” banner and the Build panel strip keep their functional bits (Done/Cancel, Rotate) but drop the how-to sentences once tutorials are disabled
- **Placement hint shows once ever** — the “Click map repeatedly to place more” text appears for the first-ever build session (tutorials on), is remembered in localStorage, and never nags per building again
- **No empty ring when zoomed out** — the camera clamp now accounts for the visible viewport: zooming out on a small map pins the view to the world center instead of exposing empty space around it (3 regression tests)
- **Moon Howler exorcism window documented correctly** — the sim breaks the curse on the **full-moon night** (20:00 → before 06:00) while the settler is still in 🌝 form, not at 7am work start; the tutorial said "dawn" and no test locked the window in. Tutorial copy now says the night window, and `moonHowler.cureWindow.test.ts` locks the window + the 7am skip (also fixed the stale "revert at 7am" note — it's 6am)

### Added
- **Placement banner removed** — building placement is now shown by the ghost on the map only; a thin "Placing X — Esc / right-click stops" line in the build panel keeps the exit discoverable (the old green banner is gone)
- **Slower baseline pacing** — a full in-game day now takes ~48 real seconds at 1× speed (was 24s); 72 ticks/day is unchanged, all speeds scale (0.5× ≈ 96s, 2× ≈ 24s)
- **Hospital is worth building** — pregnant and low-energy settlers now take clinic visits *during work hours* (walk to the ward + get treated on arrival), not just in free time or by chance proximity
- **Arrow flight FX for free-roam hunts** — hungry settlers chasing deer/rabbits now show the same dashed-arrow animation as Hunting Spots
- **New-settler notification** — immigrants arriving at the village now raise a header toast (with camera focus), not just floating text
- **Visitor intent made visible** — arrival toasts say what the group offers and clicking one selects the camp, opening the inspector with its talk / trade / refugee actions
- **No visitors in week 1** — the first visitor group now arrives day 7–14 instead of day 3–7, so the founding burst is undisturbed
- **Settler personality traits** — every villager carries **three** traits from a pool of **14** (💪 Hardy, 🛡️ Brave, 🗣️ Gregarious, 🐇 Timid, 🌿 Greenthumb, 🍀 Lucky, 💗 Nurturing, 🔮 Insightful, 🦁 Chivalrous, 🔨 Resourceful, 🏔️ Stoic, ✨ Graceful, 🦉 Intuitive, 🔥 Fierce) that subtly shape how they live: energy burn, hunting range, courtship pace, winter cold, conception luck, research speed, child maturation, militia strength, construction speed, grief recovery, and workplace banter. Children inherit each parent trait by a 50% chance (DNA-style) — a child can take after mom, dad, both, or neither. Assignment is softly gender-weighted: community & wisdom traits (nurturing, insightful, gregarious, graceful, intuitive, fierce) skew toward women; frontier traits (hardy, brave, chivalrous, resourceful, stoic) toward men — everyone can still draw any trait. Traits show in the inspector with tooltips
- **Clickable mini-map** — the map widget now jumps the camera to wherever you click, so scouting and panning are one click away (also listed in the ? shortcuts overlay)
- **New games default to Small** — new-game setup preselects Small (800×600), the size the landscape renders best at; Medium stays selectable
- **Auto-staff confirms itself** — the Auto-staff button toasts ⚒️ how many settlers it assigned, or an info note when everything is already staffed / nobody is available (2 regression tests)
- **Right-drag pan documented** — the ? shortcuts overlay now lists right-click drag as a panning shortcut
- **Moon Howler exorcism overhaul** — churches hold **up to 4 priests** (cure chance 35% → 71%); on full-moon nights priests leave home to **hunt the howler** — the rite fires when they close in (range-gated, no teleport), and a howler that stays away survives the night. A failed rite can kill the priest, but **Barracks guards nearby roll to save them** (extra roll, not guaranteed); a fallen priest scares the survivors into retreating. Active Moon Howlers show as a **pulsing red dot** on the minimap + a red ring on the map, and any howler that slips indoors is dragged back out to hunt. Settlers who **slay a Moon Howler earn the title *Moonslayer***; priests who break a curse earn ***Howlerbane*** (shown after their name)

### Performance
- **Two redundant O(n) scans removed per sim tick** — the moon-Howler cycle reuses the entity-by-type index `gameTick` already builds (rebuilding only when moon forms actually transform/revert), and the realtime layer reuses the tick-start alive-entity list instead of re-filtering `state.entities`. Behavior unchanged, verified by regression tests (40 tests)

---

## [0.5.2] — 2026-08-06

**A game-feel and depth pass — flowing water, living light, real trade, and elections that matter.**

`GAME_VERSION` **0.5.2** · continue colonies from **0.4.x – 0.5.1**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Added
- **Water & terrain** — own seamless shallow/deep water sprites, flowing wave bands, shore reflection, zoom-5 terrain LOD, per-tile terrain-atlas variation (softer bevels, painted coasts), own seamless wooden bridge sprite
- **Light & season** — warm light pools on the plaza at night, season-transition lerp, ambient particles (footstep dust, sawdust), ambient-occlusion pools under trees and buildings, water shimmer + fall leaves / winter snow-dust
- **Elections every 2 years** — 3 months of gossip buildup before the vote; the elected head makes a promise — keeping it pays
- **Real visitor trade** — visitor groups carry gold purses (no minted gold); reputation now shifts prices and raid odds, with tooltips on the ⭐ badge
- **Traveling smith quest** — a visitor asks for 20 wood, pays gold and reputation
- **Economy ledger** — "Food this day": production vs consumption in the Village tab
- **Grid pathfinding** — settlers and visitors route around water and mountains
- **Click-to-focus notifications** — toasts jump the camera to the subject
- **Favorite citizen follow** + closer zoom (max 5)
- **Level-based building visuals** — gold trim (Lv2+) and pennant (Lv3+)
- **Hunting Spot prey selection** (auto / deer / rabbit / wolf) + arrow-flight visuals
- **Village portrait** — richer Progress → Goals panel
- **Founding & tutorial polish** — no instant visitors at founding; "Show tutorial tips" toggle; dismissed tips persist; tips auto-acknowledge after 20s (never nag)

### Changed
- **Renderer** — a PixiJS v8 GPU renderer was tried, then removed: the game is **Canvas 2D only**, with baked terrain layers and a camera-decoupled entity layer; the sim worker is opt-in (`VITE_USE_GAME_WORKER=1`), main-thread ticks by default
- **Weather** — re-rolls every ~2.8 colony days (was ~60 — rain was almost never seen)
- **Hotels** — lodging is free (no gold minted from nothing); the "Hotel full" toast fires whenever at capacity
- **Build** — trees are cleared under new footprints (no more forests inside walls); collapsible building panel

### Fixed
- **Command validation drift** — Iron Swords / Scale Mail / Tower Ballistae forge orders and the "Sell wood" visitor trade now work (the validator silently dropped them); the worker advertises the real `GAME_VERSION`
- Buildings drew 2×margin px right/down (entity-layer blit sign error)
- Rival camp buildings no longer count as the player's
- Recruits spawn on valid land (never water or mountains)
- Wildlife tick skipped an entity after every in-tick death (splice during iteration)
- Quick-start tutorial no longer re-shows after skipping

### Tech
- Housing assignment builds family units once (was 24×/pass); remaining O(H²) scans removed in tickHumans
- Smoother render loop — cached layout, snapshot dirty-flag, camera-decoupled entity layer; nature tab scans only when open
- Command validation derives allowed values from source catalogs; 13 non-null assertions hardened; 26 redundant casts removed; `gameTypes` imports hoisted

### Saves
- Continues from **0.4.x – 0.5.1**

---

## [0.5.1] — 2026-07-30

**The valley feels truer and clearer.**

`GAME_VERSION` **0.5.1** · continue colonies from **0.4.x / 0.5.0**.  
Feature table → [ROADMAP.md](ROADMAP.md)

### Changed
- **Raid gold** — outgoing spoils stay grounded (no unbounded free gold)
- **Outgoing raid marches** — clearer lines on the map
- **Strained valley** — hunters and Nature signal when game runs thin

### Saves
- Continues from **0.4.x** and **0.5.0**

---

## [0.5.0] — 2026-07-30

**The valley scales — kin, beasts, and forge-steel.**

`GAME_VERSION` **0.5.0** · continue colonies from **0.4**.  
Marketing kit → [docs/archive/MARKETING_v0.5.0.md](docs/archive/MARKETING_v0.5.0.md) · Feature table → [ROADMAP.md](ROADMAP.md) · Archive → [docs/archive/ROADMAP_0.5.0.md](docs/archive/ROADMAP_0.5.0.md)

### Added
- **Forge tier 5** — Iron Swords, Scale Mail, Bastion Towers
- Intro **v0.5 milestone ribbon** + version tagline
- README **v0.5.0** hero — scale, trust, steel, life
- Spatial grids, Web Worker sim, OffscreenCanvas layers, leaner tick paths

### Fixed — sim trust
- **Moon Howlers** — job/home/prison restore; load form resync; howl cadence; cure housing
- **Raids** — counter-raid pairing; lost-raid deaths; immigration respects pop cap
- **Housing** — faster assign; household minors; orphans on death; father-first custody
- **Life / hunt** — honest meals, prison days, prey cleanup, day-scaled patrol & leisure

### Changed
- Forge progression, multi-smith pace, layout toasts, full Armament checklist
- Smoother large-valley foundation for towns that grow

### Also in this era — living valley & clearer days (July 30, 2026)

A big playability and presentation pass: the map reads as a place, the day has room to breathe, and the village’s people and ecology show up more clearly on screen.

#### Map & landscape
- **Painted ground** — seamless grass, dirt, sand, and water fills replace flat color blocks
- **Soft biome edges** — neighboring terrain blends (meadows into hills, shores into water) with a light shore lip
- **Living clutter** — bushes, stumps, grass tufts, and rock flecks scatter by terrain; forests and meadows feel fuller
- **Richer woods** — denser tree clusters, extra trees on forest tiles, more undergrowth near trunks
- **Seasons on the land** — spring/summer/fall/winter wash the whole ground layer (not a permanent “spring” bake)
- **Quieter grid & light** — play-mode grid and sun wash step back so the painted map leads

#### Day, work & lodging
- **Richer day clock** — 72 sim steps per day (3 per clock hour) so people can walk, work, and socialize without the day vanishing
- **Hotel** — build a staffed inn (2 Hoteliers); up to **4 visitors** pay gold for a bed and leave after morning
- **Tavern evenings** — Innkeepers work the evening shift; the pub stays a night-life hub
- **Remarriage** — after divorce (or when single again), settlers can court and marry cleanly

#### Ecology you can read
- **Valley stages** on the Nature tab: **Stable → Strained → Damaged → Collapse**
- Clear **drivers** (grazing, predators/prey, hunting pressure, town footprint) and short “what helps” tips
- **Focus & alerts** when the valley needs care — light pressure first, serious outcomes only if you keep ignoring the wild
- Hunt and farm yields respond gently at higher strain so the food chain stays part of the story

#### Leadership & civic life
- **Village head on the map** — crown, gold ring, name plate; header chip to find them; minimap marker
- **Five-year terms** — founding lead until Year 5, then merit elections every 5 years (ceremony, gossip, revelry)
- **Town Hall & Hospital** keep richer people-facing roles (petitions, care) alongside production

#### Build & quality-of-life
- **Build hotkeys 1–9** pick real building types for faster placement
- **Market-gated trade** — long routes need a completed Market (commerce as a real milestone)
- **Player-facing docs** — root `README.md` covers hotel, valley stages, elections, day length, and leadership

#### For developers (tooling)
- **knip** + **dependency-cruiser** — `npm run audit:knip` / `audit:deps` / `audit`
- Focused regression tests for day cadence, hotel checkout, leadership, and build hotkeys
- **Flat repo layout** — game package lives at the repository root (`src/`, `public/`, `package.json`); no nested `app/` folder

---

### Fixed — social interaction system (July 20, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) — chat/dialogue cleanup + groupEvents perf pass

- **`humanChat.ts`** — `cleanupEntityDialogueState()` removes a dead settler's dialogue session and clears `chatDialogueSessionKey` / `chatPartnerId` / `chatPhrase` / `chatTicks`
- **`dayCycle.ts`** — death cleanup now calls `cleanupEntityDialogueState()` via `finalizeHumanDeath()`, fixing stale session leaks when chat partners die
- **`dialogueTrees.ts`** — `treesById` Map replaces O(n) `.find()` in `getDialogueTreeById()` for the 95 dialogue trees
- **`humanChat.ts` bubble wrap** — `wrapChatLines()` now appends `…` to the last visible line when text overflows 3 lines instead of silently dropping words
- **`lifeSimulation.ts`** — marriage "Yes!" bubbles go through `sayHumanChatPhrase()`; duplicated divorce residence reassignment consolidated into `reassignDivorcedResidences()`
- **`groupEvents.ts`** — visitor/rival tick loops use alive-entity Map + deer cursor instead of repeated `allAlive.find()` scans; `rollYearlyWorldEvent()` guards against empty event pool; refugee admission computes `playerHumanCount()` once

### Added — spatial perf & query metrics (July 8, 2026)

**Priority 1–4 implemented; #5 (skip mobile rebuild) and #6 (type-partitioned buckets) deferred until profiling shows need.**

- **Hunt reverse index** — `buildHuntTargetByPreyIndex(byType)` built once per tick → `ctx.huntTargetByPreyId`; `clearHuntersTargetingPrey` uses `Map<preyId, Set<hunterId>>` instead of full `entityById` scans
- **`AdjacencyIndex` event-driven** (`adjacencyIndex.ts`) — sparse 80px cell map for barn/road/market placement bonuses; lives on `WorldState.adjacency`; `syncAdjacency` on completion, `unindexAdjacency` on demolish; production loop reuses index (no per-tick full rebuild); lookups only for production consumer types
- **Tree/grass grids event-driven** — `syncTreeSimGrid` / `syncGrassRenderGrid` skip rebuild when grid instance is reused; mid-tick updates via `syncSpatialGridEntity`
- **Mobile grid unchanged** — `syncMobileSimGrid` still full `rebuild()` every tick (runs first at tick start)
- **Influence layer removed** — deprecated `EntitySpatialGrid.influence` API
- **`entityById` event-driven index** (`entityIndex.ts`) — `WorldState.entityById` Map reused across ticks (not saved); `indexEntity` on birth, `unindexEntity` / `killHuman` delete on death; `ensureEntityByIdMap` only rebuilds once after load/init; no per-tick O(n) reconcile; `worldEvents`, `defenseStructures`, `frontierCombat` use persisted map

**Spatial query metrics — gateway (`tickQueries.ts`):**

- Sim hot-path queries via `findClosestInEntityGrid`, `forEachInEntityGrid`, `queryIsNearRoad`, `queryRoadAvoidance`
- **`lifeSimulation.ts`** — no direct `withSpatialQuery` / `recordSpatialCandidate` branches

### Removed — farm proximity energy bonus (July 8, 2026)

- **Farm field grazing** — removed passive +120 energy / 15% tick when near farm/greenhouse (bypassed `state.resources.food`, no design doc); meals + farm production + hunting remain
- **`BuildingProximityIndex`** — deleted (`buildingProximityIndex.ts`); only consumer was the removed bonus; `building_near` metrics category removed

### Fixed — engine & loop bugs (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch EA #1–#7

- **EA-1** — `computeRoadLayoutStamp(roads)` replaces count-only `roadAvoidanceStamp`; road demolish clears avoidance index
- **EA-2** — building repair requires **alive** occupants (`entityById`), not `occupants.length`
- **EA-3** — workshop `Needs worker` path verified reachable (workshop omits `staffed` guard)
- **EA-4** — grass reproduction allows `x/y ∈ [0, width/height]` (no border dead zones)
- **EA-5** — `setSession` / `setWorld` notify UI after worker `importSave` completes
- **EA-6** — redundant building proximity ensure resolved by removing farm proximity index
- **EA-7** — `spawnGrassPatch` bounds aligned with sim reproduction check

### Fixed — spatial perf audit follow-ups (July 8, 2026)

- **`tickHumans` social pool** — `allHumans` includes same-tick `newEntities` humans (deduped by id)
- **`tickWildlife` tamed hunt** — removed redundant pre-query `syncSpatialGridEntity`
- **`buildWildlifePopulationSnapshot`** — `newByType` zero-initialized per wildlife type

### Fixed — audit mass-fix session (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) — **429** registry IDs (**391 fixed**, **24 info**, **0 open/partial**); Batches Q, S, U, V, W, T (87), AP (8)

- **simWorker (W):** command/render desync — delta always applied on command success; headless commands; per-op validation; `sendCommand()` rejects on failure; `applySimTickDelta` before render parse
- **simBuffers (V):** `safeF32` NaN guard; screen-shake cleared in draw loop; `RESIDENCE_BUILDING_NONE` sentinel; bucket cache keyed on tick + meta
- **UI (S + AP):** stale `worldRef` canvas clicks; panel crash guards; stable `GameHeader` callbacks; single big-news dismiss; `getBuildingConfig()` fallback
- **Simulation (Q + T):** werewolf occupant/residence sync; rival building placement block; combined challenge progress; affair/hunt/divorce fixes; skills + `moonHowlerSaved` persisted on save
- **Engine (U):** education graduation guard; wildlife counts exclude humans; `byType` rebuild after church cure
- **Renderer (T):** entity cache rebuilds on camera pan; building glow from sim occupants; `finalizeMoonHowlerDeath` on kill
- **Affairs (T-M14/T-M41):** scandal sentence extends when already imprisoned for scandal; `tryExposeCaughtAffairForPair` routes caught rolls through lower entity id
- **Tests:** **390/390** vitest (71 files) — affair/prison/social integration hardened; test debt cleared (`stats.test.ts` founding `birthYear: -1`; `lifeSimulation.prison.test.ts` `withRepeatingRandom` soak)
- **Founding wildlife:** init spawns keep `birthYear: -1`; runtime replenish sets `recordBirthYear: true`
- **Hygiene:** shared `nodeRuntime.ts` disk loader; `overlapsPlayerBuilding` delegates to `overlapsAnyBuilding`; ESLint clean (`IntroScreen` purity, App hook deps, perf scripts)

### Changed — town perf script (`perf-97.ts`, July 8, 2026)

- **Reproducible spawns:** mulberry32 seed 42 (was `Math.random()`)
- **Diagnostics:** per-tick alive min/final; map/`nextEntityId` guards; optional dialogue preload (`SIM_PRELOAD_DIALOGUE=1`)
- **Focus:** `SIM_FULL_SIM=1` disables viewport culling; `process.exitCode` on failure

### Fixed — city benchmark gate (`benchmark-city.ts`, July 8, 2026)

- **Gate metric:** PASS/FAIL uses **steady-state p95** (all post-warmup ticks), not sparse `PERF_SAMPLE_EVERY` samples
- **Loop hygiene:** single `maintainCityBenchmarkState` after tick; `getSimFocus` per tick; alive sampled before maintenance
- **Metrics:** spatial query instrumentation starts at first steady tick (after warmup)
- **CI:** `process.exitCode` instead of `process.exit()`; `BENCHMARK_GATE` enabled when unset or `'1'`
- **Percentile:** nearest-rank p95 documented (differs from Excel/Numpy interpolation)

### Added — frontier raid response & balance (July 8, 2026)

- **Outgoing raid phase** — `launchRaidOnRival()` dispatches a war-band; rival may **offer tribute** or **choose to fight**; player always gets **Accept tribute** / **Decline — attack anyway** or **Press the attack** (`pendingOutgoingRaidEvents`, `respondToOutgoingRaidEvent`)
- **Raid vs counter-raid labels** — proactive strike = “Raid their camp”; retaliation after an incoming war-band = “Counter-raid their camp” (`isCounterRaidOnRival`, `getOutgoingRaidActionLabel`)
- **Population-scaled raid casualties** — victories and barricade holds always cost lives; tiers scale with village size (`getRaidCasualtyBounds`)
- **Raid loot bundles** — incoming defense can lose food/wood/stone/gold; outgoing wins grant multi-resource spoils (`RaidLootBundle`, `formatRaidLootSummary` on banners)
- **Peace + outgoing marches** — treaties recall in-flight player war-bands (`cancelPendingOutgoingRaidsForRival`)
- **Raid participant rewards** — everyone who fights earns **Guard** skill XP (`rewardRaidParticipants`, `getRaidParticipants`); tier scales with outcome (decisive win 1.1 → defeat 0.4 / outgoing success 1.0 → fail 0.45 / tribute march 0.3)
- **Leader raid glory** — sitting village head who was in the fight gets **+0.45** extra Guard XP; on a win they also gain **village reputation** (+1 meager / +2 narrow / +3 outgoing success / +4 decisive)
- **Raid XP → merit elections** (`villageLeadership.ts`, `skills.ts`):
  - **Personal merit (all candidates)** — each fighter's Guard XP stacks like any job skill; at election `getLeadershipScoreBreakdown()` adds `skillPoints = round(sum(all job skills) × 2)` — challengers and incumbent alike
  - **Incumbent record only** — raid rep bonuses feed `getIncumbentRecordAssessment()` economy/village-health thresholds; **recordPoints** capped at **+8** positive; challengers have no record score
  - **No XP without fighting** — incoming pay-off grants no Guard XP; barricade/defend/outgoing fights do
- **Vitest** — **358** tests, **67** files (`frontierCombat.test.ts` — outgoing tribute + raid XP/rep; `moonHowler.cycle.test.ts`; `entityLayer.test.ts` — outgoing raid cache key)
- **`RenderSnapshot`** — `pendingOutgoingRaidEvents` mirrored from `WorldState` (fixes `entityLayer.test.ts` / `tsc` typecheck)

### Changed — victory goals & trade empire (July 8, 2026)

- **Population victory targets raised** — Eco-Utopia **250** humans; Great City **400** humans + **60** buildings; challenge `great_city` **250** + **35** buildings; `thriving_town` **50** (`VICTORY_TARGETS` in `victory.ts`)
- **Harmony path fixed** — counts **untamed** wolves only (`tamedBy == null`); **8** wild wolves + **15** wildkin — coexistence, not taming
- **Walking trade caravans** — `tradeCaravans.ts`: merchants walk from Market/Store/Town Hall to partner edge and back; goods exchange at partner (export) and village (import); map **🚚** lines in `renderer.ts`; Progress tab status in `App.tsx`
- **Trade Empire victory harder** — all **7** routes (added Spice Coast, Granite Reach), **40** round-trips, **50,000** gold from caravan trade (`lifetimeStats.goldFromTradeRoutes`)
- **Instant abstract trade removed** — `updateTradeRoutes()` replaced by `tickTradeCaravans()` in `gameEngine.ts`
- **Tests** — `victory.test.ts`, `tradeCaravans.test.ts`

### Fixed — Moon Howler 14-day cycle & Church cure (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch N #1–#7

- **Recurring hunts** — uncured settlers now transform at **8pm** on full-moon colony days (0, 14, 28…) and revert at **6am** the next morning; no longer reverts on arbitrary daytime ticks (`isMoonHowlerTransformTick` / `isMoonHowlerRevertTick` in `moonHowler.ts`)
- **Calendar** — moon logic uses `getAbsoluteCalendarDay(state.tick)` so the 14-day cadence stays aligned with the sim clock
- **New curse** — when no active Moon Howler curse exists and population > 5, one settler is cursed on the next full moon (replaces 8% RNG); transforms the same night
- **Church cure** — staffed Church rolls **~18%** on the **full-moon night** (20:00 → before 06:00) while the settler is still in werewolf form; village-wide, no proximity check (`tryMoonHowlerChurchCures`)
- **Alerts & debug** — “Full Moon!” fires when Moon Howlers are abroad at 8pm even if the transform tick was missed; debug spawn transforms on the current full-moon night
- **Tests** — `moonHowler.cycle.test.ts` (hunt days 0/14/28/42); `moonHowler.test.ts` (dawn cure RNG, new-curse gate)
- **UI** — Church panel, help tab, and building hints describe the full-moon-night (20:00–06:00) exorcism in 🌝 form (~18%, village-wide), not a "dawn (7am)" cure

### Fixed — caught-affair divorce after imprisonment (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch P #1–#3

- **Divorce after imprison** — caught affairs imprisoned the cheater first (teleport to prison), then required the spouse within 40px for divorce — so marriages almost never ended despite scandal + prison logs. Caught-in-act path skips the proximity check and always divorces
- **Either spouse** — men and women can cheat; husbands and wives can both initiate divorce (`dissolveMarriage` in `nameLoader.ts`)
- **Notifications** — `formatCaughtCheaterDivorceDetail()` — maiden-name line only when the cheating partner is a woman with a stored maiden surname
- **Tests** — `lifeSimulation.affair.test.ts` (**18** tests): prison-far teleport divorce; husband divorces imprisoned wife

### Fixed — orphaned marriages, vitest dialogue preload, prison flake (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch O #1–#3

- **Orphaned marriages** — end-of-tick `allAlive` prunes dead entities; survivors could keep `partnerId` pointing at a removed id (`human 285 married partner 831 missing or dead` on seed-42 day 29). `reconcileOrphanedMarriages()` in `dayCycle.ts` runs before `state.entities = allAlive` (accepts human **or** cursed 🌝 form as valid partner)
- **Vitest dialogue bank** — top-level `await preloadDialogueBank()` in `src/test/setup.ts` (disk load via dynamic `import()` like `nameLoader.ts`); fixes parallel-worker race with async `beforeAll`
- **Prison integration flake** — `lifeSimulation.prison.test.ts` uses `withRepeatingRandom(0.1)`, calendar-day pin, mortality mock, and two-pass fixture wiring; surfaces caught or rumor scandal over 120 days
- **Tests** — `lifeSimulation.mortality.test.ts` (`reconcileOrphanedMarriages` ×3); social integration seed-42 (30/60 day) green

### Fixed — scandal imprisonment (July 8, 2026)

- Only **married** affair offenders are imprisoned; single paramours are not jailed (`isMarriedScandalOffender`); arrest runs before divorce clears marital status

### Added — settler dialogue trees (July 8, 2026)

- **Dialogue-tree chat** — `sim_dialogue_trees.json` (95 trees, 3-line paired banter); `dialogueTrees.ts` + dialogue-first `humanChat.ts` with session advance and multiline bubbles
- **Legacy line migration** — old `humanChat` one-liners converted to `wf_*` trees (`migrate-legacy-dialogue.py`); Sims-style `dt_*` trees retained
- **Chat wiring** — `lifeSimulation.ts` partner-aware `settlerChat` / `settlerPairChat`; `foodLow` / juvenile `child` context; `resetDialogueSessions()` on render cache reset
- **Chat tests** — `humanChat.test.ts` (17), election gossip/winner in `villageLeadership.test.ts`, marriage `Yes!` in `lifeSimulation.courtship.test.ts`

### Added — scale, worker, quality (July 8, 2026)

- **Dual-layer spatial grid** (`spatialGrid.ts`) — **grass 56px** (graze only) + **mobile 80px** (flee/hunt/social); `RoadAvoidanceIndex` 128px; each hot path uses the correct layer — [TECHNICAL.md](TECHNICAL.md#dual-layer-spatial-grid); `USE_SPATIAL_GRID` on by default (`VITE_USE_SPATIAL_GRID=0` for A/B)
- **Spatial query metrics** (`spatialQueryMetrics.ts`) — per-tick candidate/query counters; reported in `npm run bench` / city sims; A/B via `benchmark-spatial-ab.ts` (July 2026 city: graze **~99%**, flee **~88%** reduction vs naive)
- **Web Worker simulation** (`simWorker/`) — optional `gameTick` off main thread (`VITE_USE_GAME_WORKER=1`); `GameWorkerHost`, render SoA ping-pong (`simBuffers/`), `WORKER_PROTO` negotiation, headless tick path
- **Entity catalog** (`entityCatalog.ts`) — O(1) citizen lookup; main-thread `catalog` state synced from `GameLoop.subscribe`
- **Save schema allow-list** (`saveSchema.ts`, `viewState.ts`) — `pickWorldFieldsForSave()` trims save bloat; camera pan preserved on load
- **Vitest suite** — **358** tests across 67 files (`npm test` / `npm run test:all`); helpers in `src/test/` (housing, social, worker parity, ecosystemPressure, packRenderSoA, protocol, dialogue chat, Moon Howler cycle)
- **Build catalog sidebar** — `BuildCatalogPanel.tsx` + `buildCatalog.ts` category rail (replaces deleted `BuildHotbar.tsx`)
- **Resource badges** — `ResourceIcons.tsx`, `ResourceBadge.tsx`, `resourceLabels.ts`
- **Citizen IDs** — `#id` search, death log age suffix (`citizenId.ts`)

### Fixed — comprehensive bug pass (July 7–8, 2026)

**226 tracker items closed** (130 master + 96 batches A–J, July 8 bug pass). Highlights:

- **Sim/UI:** ecosystemPressure shared thresholds (#3–7), viewState camera + save merge (#3/#5), packRenderSoA overflow top-k (#17), protocol feature handshake (#13)
- **Life/save:** `lastProcessedCalendarDay` on load, affair conception site (no hour gate), population snapshot single-pass, weather particles on canvas resize
- **Worker:** `GameWorkerHost` `commandChain`, headless `tickResult`, proto guards on all responses
- **Renderer:** SoA shim safety, night-glow cull, walk threshold, terrain dispose, rain batch, grid viewport
- **Tooling:** production `tsc -b` clean; **ESLint 0 errors** (was 70 — App.tsx ref/`useLayoutEffect` sync, test unused imports, React hooks rules)

### Fixed — marriage integrity + Moon Howler spouses (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch I #1–#3

- **`killHuman` / `finalizeHumanDeath` (`dayCycle.ts`)** — single death cleanup entry for player settlers (`isKillableSettlerEntity`: human **or** cursed full-moon werewolf): sets `alive = false`, strips building occupants (`homeBuildingId`, `residenceBuildingId`, prison fields), and **widows the survivor** — clears `partner.partnerId`, sets `relationshipStatus` to `single` (or `expecting` if pregnant)
- **Death paths unified** — all production human kills now call `killHuman(..., entityById)` instead of bare `alive = false`:
  - `tryDailyHumanMortality` — old age + sudden illness (`lifeSimulation.ts`)
  - exhaustion — active and off-screen throttled paths (`lifeSimulation.ts`)
  - childbirth energy depletion (`lifeSimulation.ts`)
  - predator kill — Moon Howler / wolf hunt on human prey (`lifeSimulation.ts`)
  - raid defense casualties (`frontierCombat.ts`)
  - disaster / plague (`worldEvents.ts`)
- **Moon Howler marriage false-negative (root cause of seed-42 social sim failure)** — on full moon, `transformToWerewolfForm` sets `type = EntityType.Werewolf` while marriage fields remain in `moonHowlerSaved`; `livingHumanAt` and `assertSimInvariants` only accepted `EntityType.Human`, so EOD day 29 reported `human 20 married partner 120 missing or dead` although id 120 was alive as a cursed werewolf with `partnerId: 20`
- **`isSettlerRelationshipEntity` (`moonHowler.ts`)** — returns true for alive humans **or** alive `EntityType.Werewolf` with `moonHowlerCursed`; wired into `livingHumanAt`, `resolveChatPartner`, and `assertSimInvariants`
- **Test fixture id collision** — `lifeSimulation.social.integration.test.ts` no longer hardcodes ids `20`/`120`/`121` (collided with `initGame` auto-spawn, e.g. tree id 120); lovers/spouses allocated via `state.nextEntityId++`
- **Werewolf-form deaths** — `tickWildlife` old-age and starvation paths call `markWildlifeDead` → `killHuman` for cursed settlers (not bare `alive = false`)
- **Tests** — `lifeSimulation.mortality.test.ts` (widow on human + werewolf-form death), `moonHowler.test.ts` (werewolf-form spouse valid), `lifeSimulation.social.integration.test.ts` (30-day seed 42 green)
- **Vitest typecheck** — 17 pre-existing `tsconfig.vitest.json` errors fixed in test helpers (`canvasPolyfill`, `gameLoopTestUtils`, `placementUtils`, `entityLayer`, `frontierCombat`, `contextualTutorial`, `lifeSimulation.wildlife`); now part of `npm test`

### Fixed — pairwise sim hotspots (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch I #4–#9 · details in [docs/private/OPEN_PROBLEMS.md](docs/private/OPEN_PROBLEMS.md)

- **`tickQueries.ts` (new)** — per-tick shared helpers: `getLivingEntity`, `buildResidenceOccupantIndex`, `getHousemates`, `findClosestEntityInRadius`, `forEachEntityInRadius`, `buildWildlifePopulationSnapshot`, `recordWildlifeBirth`, `buildGrassPopulationSnapshot`, `recordGrassBirth` / `recordGrassDeath`
- **Social scans → indexed queries** (`lifeSimulation.ts`):
  - housemate chat — `buildResidenceOccupantIndex` + `getHousemates` (was `playerHumans.filter` per settler)
  - courtship — `findCourtshipPartner` + spatial closest-single query
  - affair paramour — `findClosestEntityInRadius`; site checks use `entityById` / `buildingById` maps
  - idle socialize — `findClosestEntityInRadius` over map-span radius
- **Wildlife scans → built-once indexes** (`spatialGrid.ts`, `lifeSimulation.ts`):
  - `RoadAvoidanceIndex` — `isNearRoad` + `applyAvoidance` replaces per-entity `roadBuildings.some`; shared on `TickContext` for human road-speed mult
  - mate search — `findClosestEntityInRadius` on `mobileGrid`
  - population cap — `buildWildlifePopulationSnapshot` + `recordWildlifeBirth` (was per-animal `byType.filter`)
  - tamed hunt assist — grid sync + `findClosestEntityInRadius`
- **Edge scans** — idle tree wander (`buildTreeGrid` once per `tickHumans`); grass repro cap (`buildGrassPopulationSnapshot`)
- **`gameEngine.ts`** — `syncMobileSimGrid` reuses `state.mobileGrid` instead of allocating each tick
- **Affair / reproduction tests** — `lifeSimulation.affair.test.ts`, `lifeSimulation.reproduction.test.ts` updated for `entityById` maps and `tryDailyConception` signature
- **A/B flag** — `VITE_USE_SPATIAL_GRID=0` restores legacy full-list prey/predator scans for perf comparison only

### Changed — npm scripts & test gate (July 8, 2026)

**Bug tracker:** [docs/private/BUGS_TRACKER.md](docs/private/BUGS_TRACKER.md) Batch J

- **`npm test`** — `vitest run` (**358** tests, **67** files, **0 skipped**)
- **`npm run test:all`** — vitest + `tsc -p tsconfig.vitest.json --noEmit`; **`npm run test:types`** — typecheck only
- **Vitest default config** — browser Web Worker suites (`gameLoop.worker.test.ts`, `gameWorkerHost.test.ts`) excluded from default run (Node has no `globalThis.Worker`); optional `npx vitest run --config vitest.browser-worker.config.ts`
- **`npm run` shortened (app)** — 24 scripts → **8**: `dev`, `build`, `test`, `test:watch`, `lint`, `preview`, `sim`, `bench`
- **`sim` CLI** (`scripts/sim-cli.mjs`) — `npm run sim` lists profiles; `npm run sim -- <profile>` replaces `simulate`, `simulate:30min`, `simulate:20year`, `simulate:social`, `simulate:housing`, `simulate:housing:ticks`, `simulate:family`, `simulate:10year`, `simulate:10year:worker`, `simulate:20year:worker`, `balance:militia`, `benchmark:city`, `simulate:30min:city`, `sim:kill` (aliases: `simulate` → `5min`, `balance` → `militia`)
- **`bench`** — `npm run bench` replaces `npm run benchmark:gate` (CI benchmark gate)
- **Repo root** — forwards `test`, `sim`, `bench` into `app/`; dropped five `simulate:*` forwards

### Changed (July 8, 2026)

- **`App.tsx`** — `catalog` + `hasPlacedHouse` + `villageStats` state from loop subscribe; callback refs synced in `useLayoutEffect` (eslint `react-hooks/refs` compliant)
- **`useContextualTutorial`** — queue head = active tip; dismiss advances queue
- **`BuildCatalogPanel`** — category follows selected building without `useEffect` setState

### Added
- **Housing & population UI** — header + Village tab show **🛏️ beds** and open slots separately from **immigration cap** (`populationGrowth.ts`, `GameHeader.tsx`, `App.tsx`)
- **Housing assignment overhaul** (`dayCycle.ts`) — `buildHousingUnits`, custodian chain, shortage sharing, orphan adoption
  - **Cap vs beds** — recruitment/immigration uses `maxHumanPopulation` (houses + rep + base 5); physical slots = sum of completed House/Mansion capacity (upgrades included)
  - **Singles** — may share a house; stay until **marriage**, then `syncPartnerResidence` moves the couple to their own home (empty preferred)
  - **Children** — follow **mother** → **father**; **bastards** with no mother → **maternal grandma** → **paternal grandma**; then **father**
  - **Orphans** — no kin left → random **married couple** adopts; if none, placed in **any house with room**
  - **18+** — inspector button **Move to own home** when an empty house exists (`moveOutOfFamilyHome` in `buildingActions.ts`)
  - **Housing shortage** — when no empty homes (or all beds full), **families stay together** in shared houses instead of splitting
- **Election day ceremony** (`villageLeadership.ts`) — founding **first male** leads until Year 10; merit elections every 10 years; leader death → election **2 years later** (no instant succession); ceremony phases gather → gossip → tension → reveal + 3-day *Election Revelry* festival
- **Election buildup** — year-before notification (`tickElectionBuildup`); ongoing settler gossip during buildup, election year, and ceremony (`tickElectionGossip`)
- **Incumbent always runs** — `getElectionRaceCandidates()` keeps sitting head in race lineup, gossip, and Leadership standings even when merit rank drops below top 4
- **Incumbent record score** — modest election bonus/penalty for sitting head only: economy (+4/−5), clean record (+3) vs scandals (−5 each), village health (+3/−6); **+8 positive cap** so high-merit challengers can still win; penalties uncapped
- **Leadership UI** — `VillageLeadershipPanel` shows record breakdown; standings show record modifier; tutorial + focus hints updated

### Planned (remaining for v0.5.0 tag)
- **P0** — renderer cache reuse, settler count denorm, benchmark gate exit codes; incremental `entityById`, `buildingActions` scan cleanup, grass render buckets, App tab split, pooling; OffscreenCanvas terrain/entity layers; logical invariant checks; **`npm run sim -- 20year` full 172800-tick PASS**; `GAME_VERSION` **0.5.0** + save migration
- **Done in code (pre-tag):** spatial grid ✅, dead-entity compaction ✅, Web Worker `gameTick` ✅ (opt-in), big bug checkup ✅ (252 tracker items, Batch O), `npm run test:all` ✅ (358 + types)
- **P1** — election playtest at Year 10/20; counter-raid militia march visuals; large-map playtests; reputation arc UI; footstep SFX; one visitor quest chain; `npm run bench`

## [0.4.2] - 2026-07-05

**Early Alpha v0.4.2** — 6-tab UI, Blacksmith forge, walls/towers/barracks, frontier raid prep UX, 10-year balance pass, 10-user beta playtest. `GAME_VERSION` and save format bumped; `0.4.1` saves migrate on load.

### Added

#### Beta playtest follow-up (July 5, 2026)
- **Raid prep copy** — raids test preparation, not a battle screen (`RAID_PREPARATION_HINT`, Frontier readiness card, README)
- **Eco breakdown** — Nature tab “Why this score” (`ecoBreakdown.ts`)
- **Population growth report** — Village tab cap/food/rep messaging (`populationGrowth.ts`)
- **Rival labels** — “Distant camp” when on-map pop is 0 (`rivalDisplay.ts`)
- **Juice toggle** — Game menu ✨ Juice on/off (confetti, camera nudge, night glow)
- **Chronicle / combat log** — death filter hints; larger combat log text

### UI / UX overhaul (settlement-sim patterns)

Inspired by **RimWorld** (priority alerts, contextual inspector), **Banished** (bottom build hotbar), and **Frostpunk** (resource urgency). Goal: lower cognitive load, faster routing to urgent issues, map stays visible while building.

- **`AlertBar`** — clickable priority strip under header (raids, diplomacy, low food, shelter warning, trade ready, active challenge); capped at 4 alerts (`priorityAlerts.ts`, `AlertBar.tsx`).
- **`BuildHotbar`** — Banished-style bottom map strip: House, Farm, Lumber Mill, Quarry, Well, Road with hotkey badges (`BuildHotbar.tsx`).
- **`GameMenu`** — ☰ header menu for save, load, auto-save, audio, reset (`GameMenu.tsx`).
- **`FrontierPanel`** — visitors, rivals, raids moved out of overcrowded Village tab (`FrontierPanel.tsx`).
- **`ChallengesPanel`** — daily challenges under Progress → Goals (`ChallengesPanel.tsx`).
- **`CollapsibleSection`** — reusable accordion for dense sidebar panels (`CollapsibleSection.tsx`).
- **Tab hotkeys** — `V` Village · `F` Frontier · `N` Nature · `P` Progress · `L` Log · `M` More.
- **Focus hint actions** — `Go →` buttons on key hints (open Goals, Frontier, Trade, Research, build house/farm) (`focusHints.ts`, `FocusPanel.tsx`).
- **Progress subnav badges** — amber dot when research active; cyan count when trade routes are ready to establish.
- **Frontier tab badge** — count of pending raids + diplomacy events on sidebar tab.

#### Changed
- **Sidebar tabs** — 8 → **6**: Village, Frontier, Nature, Progress (Research / Trade / Goals sub-tabs), Log, More (Guide / Roadmap sub-tabs).
- **Inspector** — collapsible; auto-expands when you click the map; slimmer when collapsed.
- **Header** — save/audio/reset moved into ☰ menu; food badge **pulses** when critically low.
- **Village tab** — decluttered: focus hints, population, leadership, armament only (frontier/diplomacy → Frontier; challenges → Progress → Goals).
- **Collapsed build rail** — duplicate quick-build buttons removed; bottom hotbar handles common placement; collapsed left rail = grid toggle, cancel (when placing), expand full catalog (`B`).
- **Right sidebar** — widened to `22rem` for readability.
- **In-game Guide** — Interface Overview and Controls updated for new layout, alert strip, hotbar, and tab hotkeys.

#### Blacksmith forge / visible crafting queue
- **`villageForge` state** — iron spears & shields require Defense research **and** a staffed Blacksmith forge run (`forge.ts`).
- **Forge orders** — Iron Spears (35🪵 25🪨 40💰) · Iron Shields (40🪵 30🪨 45💰); ~6 in-game days with staffed smith; progress bar + map float text.
- **`BlacksmithForgePanel`** — queue orders in Blacksmith inspector; armament checklist shows forge %.
- **Save migration** — existing saves with iron tech + Blacksmith keep forged status; new games must forge.
- **Combat** — `hasIronSpears` / `hasIronShields` now require `villageForge.spearsReady` / `shieldsReady`.
- **Forge UX polish** — `AlertBar` + focus hints jump to Blacksmith (`focus_building`); “Forge paused” when unstaffed; research complete notification says **queue forge** (not “armament upgraded”); Armament checklist **Open Blacksmith →** buttons; Defense/Iron copy updated.

#### UX polish (first-priority follow-up)
- **Quick Start tutorial** — 5 steps: bottom hotbar, alerts, tab hotkeys, `?` shortcuts overlay
- **Header ⭐ reputation badge** — clickable tooltip; opens Progress → Trade
- **Focus hints** — **Go →** on challenges, victory paths, visitors, rivals, elections, armament, research
- **Progress tab badge** — trade-ready count or research dot on main sidebar tab
- **Frontier raid button** — `🏹 Raid` on each rival card in Frontier tab (`canLaunchRaidOnRival`)
- **Pay-off vs counter-raid hint** — combat preview when tribute &lt; march provisions
- **Roads + armament copy** — Infra category hint in build catalog; armament explainer in Village tab
- **`?` keyboard overlay** — full shortcut reference (ESC to close)

#### Performance (simulation + UI)
- **Duplicate work removed** — `byType` built once per tick; entity array compacted in one pass (no triple `.filter()`).
- **Off-screen throttling** — humans every 8 ticks; wildlife AI every 8 ticks; grass growth/repro every 4 ticks off-screen. Viewport entities still run full sim every tick (`OFFSCREEN_HUMAN_THROTTLE`, `OFFSCREEN_WILDLIFE_THROTTLE`, `OFFSCREEN_GRASS_THROTTLE`).
- **O(1) lookups** — per-tick `entityById` and `buildingById` maps for hunt targets, prison, tamed-owner resolution.
- **Wildlife simulation** — `tickWildlife` iterates `byType` buckets instead of all `state.entities`; predator list hoisted once per tick for flee logic.
- **Denormalized counts** — `world.wildlifeCounts` updated each tick; Nature tab reads counts without scanning entities (`entityCounts.ts`).
- **React UI** — single-pass `villageStats`; narrowed `priorityAlerts` memo deps; `React.memo` on `WildlifeBar`, `StatBadge`, `FrontierPanel`, `ChallengesPanel`.
- **Headless benchmark** — `simulate:30min` logs avg/p50/p95/max ms per tick + entity samples (`SIM_MINUTES`, `PERF_SAMPLE_EVERY` env vars).
- **Module fix** — `combatTech.ts` extracts `COMBAT_TECH` to break forge ↔ combat circular import (headless sim runner).
- **Event log unchanged** — full chronicle kept in saves (no cap).

#### Technical (new / touched files)
- `app/src/game/priorityAlerts.ts` — alert derivation + click routing actions
- `app/src/components/AlertBar.tsx`, `BuildHotbar.tsx`, `GameMenu.tsx`, `FrontierPanel.tsx`, `ChallengesPanel.tsx`, `CollapsibleSection.tsx`
- `app/src/App.tsx`, `app/src/App.css` — shell wiring, sidebar tab grid, progress subnav styles
- `app/src/game/focusHints.ts`, `app/src/game/FocusPanel.tsx` — actionable hints
- `app/src/game/frontierCombat.ts` — `canLaunchRaidOnRival()`
- `app/src/game/entityCounts.ts`, `app/src/game/combatTech.ts` — wildlife counts helper; combat tech constants
- `app/src/game/gameEngine.ts`, `app/src/game/lifeSimulation.ts` — tick perf (maps, throttles, wildlife loop)
- `app/scripts/simulate-30min.ts` — perf metrics output
- `app/README.md`, `TECHNICAL.md`, `roadmapContent.ts` — player + dev docs

#### Frontier raid polish
- **Distance-scaled raid deadline** — incoming raids get **2–6 days** to respond based on camp distance (`expiresAtTick`, `marchDistanceTiles` on `RaidEvent`).
- **War-band march speed** — rival settlers march slower from farther camps (`lifeSimulation.ts`).
- **UI** — banner, alerts, Frontier/Village tabs show `formatRaidDeadline`; save migration backfills old raids.

#### Fixed / hygiene (July 2026)
- **Lint** — July 4: unused imports + inspector handlers; July 8: **70 ESLint errors → 0** (`App.tsx` ref sync, `BuildCatalogPanel`, `GameMenu`, tests, scripts); `argsIgnorePattern: '^_'` for intentional unused params.
- **Sanity check** — `npm run build` pass; `npm test` **317 passed** (3 skipped); `/check-work` PASS (July 8, 2026). July 4 headless baseline: avg **1.81 ms/tick**, p95 **4.83 ms/tick** @ ~557 entities.
- **Docs sync** — all project `*.md` files aligned with v0.4.2 + July 8 bug-pass status.

#### P1 defense & combat log (July 2026)
- **Defense buildings** — Wall, Wall Corner, Wall Gate (+8 barricade/segment, cap +72), Watchtower (+15), Barracks (manual Guards, +12 militia each); unlocked via Fortification / Stone Spears research.
- **Guard patrols** — staffed Barracks guards orbit the village core during work hours; 🪖 icon on map.
- **Combat log panel** — Log tab **Combat** sub-tab with raid stats and .txt/.json/.csv export.
- **Raid map overlay** — dashed red march lines from rival camp to village when raids are pending.
- **Sprites** — `barracks`, `watchtower`, `wall_straight`, `wall_corner`, `wall_gate` processed to RGBA.
- **Spear tiers** — combat preview breakdown aligned with militia math: iron replaces stone (not stacked).

#### Juice pass (July 2026)
- **Night glow** — warm windows + chimney ember/smoke on houses/mansions when residents are home; staffed Church/Blacksmith/Hospital get door glow.
- **Build complete** — confetti burst (stars/sparkles), `✨ Built!` float text, sprite scale pop, screen shake.
- **Camera nudge** — clicking settlers/buildings gently pans the camera toward them (28% lerp).

#### Road rotation (July 2026)
- **R key** while placing rotates Road, Wall, and Wall Gate horizontal ↔ vertical.

#### Intro screen refine (July 2026)
- **`IntroScreen.tsx`** — ~20s unhurried timeline (aurora → logo → title → subtitle → hook → food chain → ready).
- **Skip** — click or press any key after the logo appears to jump to village setup.
- **Progress bar** — subtle fill along the bottom during the opening beat.
- **No hidden pops** — sections fade in on schedule instead of toggling `hidden` mid-animation.
- **`App.css`** — slower intro keyframes (`intro-*` classes) for logo float, chain reveal, aurora drift.

#### Spear / militia balance (July 2026)
- **`militiaBalance.ts`** — single source for militia & barricade strength; tuned constants (`MILITIA_BALANCE`).
- **Iron replaces stone** spears (×1.52, not stacked on ×1.3).
- **Iron replaces wooden** shields (+9/adult, not +9+4).
- **Barracks guards** — +14 per staffed guard (was +12).
- **Barricade fix** — `respondToRaidEvent` barricade now uses `getBarricadeStrength` (walls/towers were missing in resolve).
- **Combat preview** — armament label, tier hint, breakdown matches resolve math.
- **`npm run balance:militia`** — scenario table for playtest review.

#### Bug fixes — comprehensive pass (July 4, 2026)

Four code-review rounds (~40 fixes). Verified: `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`, `/check-work` PASS.

##### P0 — Critical
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Map setup / GameLoop desync | `App.tsx` | New game from map setup never called `setSession`; sim ran throwaway world while setup open |
| Faction human ages | `groupEvents.ts` | Visitors/rivals spawned at ~7k–14k “days”; died instantly vs 400-day lifespan cap |
| Welcomed refugees killed on departure | `groupEvents.ts` | Admitted settlers stayed in `group.entityIds`; camp leave set `alive = false` for all IDs |
| Eco Master 24× per year | `gameEngine.ts` | `ecoHealthYearsAbove80` incremented every tick of calendar day 0 (~24×/year) |

##### P1 — High
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Off-screen double aging | `lifeSimulation.ts` | Inactive humans aged twice per calendar day |
| Winter heating | `gameEngine.ts` | Wood cost counted visitors/rivals, not player settlers only |
| Prison demolish | `buildingActions.ts` | Demolishing prison left `prisonBuildingId` / prisoners stuck |
| Challenge timing | `gameEngine.ts`, `challengeProgress.ts` | `eco_master` / year challenges evaluated before year rollover + eco streak update |
| `growing_village` UI | `challengeProgress.ts` | Progress showed year only, not building requirement |
| `great_city` challenge | `gameTypes.ts`, `saveLoad.ts` | Missing `targetBuildings: 20` — completed at 100 pop alone |
| Diplomacy event loss | `groupEvents.ts` | Failed choices (insufficient resources) still removed pending event |
| Peace vs active raids | `groupEvents.ts`, `frontierCombat.ts` | Peace treaty did not cancel in-flight `pendingRaidEvents` |
| Rival raid strength | `groupEvents.ts` | `rival.population` never decremented on deaths; strength stayed inflated |
| Workshop at gold cap | `gameEngine.ts` | Consumed inputs when gold storage full |
| Trade at storage cap | `economy.ts` | Deducted exports when receives added 0 |
| Raid deadline lag | `gameEngine.ts` | `tickPendingRaidEvents` only on calendar-day ticks (up to ~24 tick delay) |
| Save year desync | `saveLoad.ts` | `year` from save could disagree with `tick`-derived calendar |
| Save migrations | `saveLoad.ts` | Missing defaults for `challenges`, `yearlyStats`, `lifetimeStats` on old saves |
| Refugee food at cap | `groupEvents.ts`, `App.tsx` | Welcome charged 40🍖 even when nobody could join |

##### P2 — Medium (UI, stats, edge cases)
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Placement footprint | `buildingActions.ts`, `placementUtils.ts` | Center could be on-map while footprint extended off-map |
| Build ghost stale | `App.tsx` | Placement preview used stale React `world` instead of loop world |
| Raid defend no-op | `App.tsx`, `frontierCombat.ts` | Defend/payoff/barricade failed silently; buttons now disabled + float text |
| Guard bonus constant | `defenseStructures.ts` | Hardcoded ×12 vs `militiaBalance` ×14 |
| Rival diplomacy silent | `groupEvents.ts` | Gift/pact/militia/peace returned unchanged state with no feedback |
| Diplomacy banner UX | `groupEvents.ts`, `App.tsx` | `getDiplomacyChoiceEligibility()` — disable + tooltips in banner and rival inspector |
| Visitor trade silent | `groupEvents.ts` | Insufficient gold/food returned with no float text |
| Victory Great City buildings | `victory.ts` | Counted rival camp structures toward 50-building leg |
| Eco health penalty | `gameEngine.ts` | Rival/incomplete buildings lowered player eco score |
| Prison ghost workers | `lifeSimulation.ts`, `gameEngine.ts` | Imprisoned settlers kept job assignments; still counted as staffed |
| Forge queue silent | `forge.ts` | Blocked queue returned state with no notification |
| Forge production tick | `forge.ts` | Local midnight tick vs shared `isProductionTick` (7am) |
| Moon howler hunt leak | `moonHowler.ts`, `gameTypes.ts` | `huntTargetId` / `combatTicks` not cleared on revert |
| Age display | `worldGen.ts` | `getAgeInYears` used wrong birth-year math; pioneers now age 30/28 |
| Leadership experience | `villageLeadership.ts` | Day-based age treated as years; all adults maxed by day 60 |
| Yearly stats humans | `stats.ts` | Population history counted visitors/rivals |
| Yearly births stat | `stats.ts` | Broken ternary; now `birthYear === state.year` |
| `disastersSurvived` stat | `stats.ts`, `worldEvents.ts` | Was set to `state.year`, not disaster count |
| FrontierPanel | `FrontierPanel.tsx` | Fragile non-null assertion on pending raid lookup |
| IntroScreen lint | `IntroScreen.tsx` | `useRef(Date.now())` → init in `useEffect` |

##### Intentional (not changed)
- **School juvenile `age++`** at staffed school — accelerates childhood; not the off-screen duplicate bug.

### Ship checklist (closed)
- [x] 10-year balance pass — town PASS 2026-07-04 (`npm run simulate:10year`, 9/9 gates)
- [x] Spear / militia balance review (`militiaBalance.ts`, `balance:militia`)
- [x] External playtests — 10 sessions ([TECHNICAL.md](TECHNICAL.md#playtest-report))
- [x] `GAME_VERSION` **0.4.2** + `COMPATIBLE_SAVE_VERSIONS` migration
- [x] Docs + in-game Roadmap sync

## [0.4.1] - 2026-07-04

**Early Alpha v0.4.1** — tribes, raids, diplomacy, four victory paths, village leadership. `GAME_VERSION` and save format bumped; `0.4` saves migrate on load.

### Added
- Tribe diplomacy v2, frontier raids + combat preview, peace treaties, visitor leader talk
- Trade Empire + Harmony victories active; Silkmarket trade route
- Village head merit elections (founding election at start, decennial, succession on death) — *superseded in [Unreleased] by founding male + Year 10 ceremony + 2-year vacancy*
- In-game Roadmap tab, Nature grazing warning, Prison + Guard, chronicle export

## [0.4.1] - Village leadership & merit elections (2026-07-04)

*Historical — leadership rules superseded in **[Unreleased]** (founding male until Year 10, ceremony, 2-year vacancy, record score).*

### Added
- **Village head elections** (`villageLeadership.ts`) — merit score from job skills (×2), experience, Town Hall service (+15), married (+5); ties break on age, then entity id.
- **Founding election** at game start; **decennial elections** every 10 years (years 10, 20, …); **succession** on leader death or imprisonment.
- **State fields** — `villageLeaderId`, `leaderSinceYear`, `lastElectionYear` on `WorldState`; save migration in `saveLoad.ts`.
- **Village Leadership panel** — Village tab shows 👑 leader, years until next election, ranked candidates (`VillageLeadershipPanel.tsx`).
- **Map & UI** — 👑 on leader in header, map icon, Population panel, and entity inspector; focus hints mention leadership.

### Technical
- `tickDecennialElection` in `gameEngine.ts`; `validateVillageLeaderOnLoad` on load. *(Ceremony / vacancy flow → `villageLeadership.ts` in [Unreleased].)*

## [0.4.1] - Peace treaties, visitor leader talk & four victory paths (2026-07-04)

### Added
- **Peace treaties** — `signPeaceTreaty()` halts raids for 60 days (30💰 + 20🍖); `peaceTreatyDays` on rivals; `peace_treaty` diplomacy event choices; 🕊️ button in rival inspector; raids blocked while at peace (`isRivalAtPeace`, `frontierCombat.ts`).
- **Visitor leader talk** — `talkToVisitorLeader()` per caravan kind (traders, pilgrims, scholars, hunters, nomads, performers, refugees); `leaderTalked` on `VisitorGroup`; UI in visitor camp panel (`getVisitorLeaderTalkMeta`).
- **Trade Empire + Harmony victories** — moved to `ACTIVE_VICTORY_PATHS` (4 active paths in Goals tab); 5th trade route **Silkmarket** in `economy.ts`; `ensureFullTradeRoutes()` on load.

### Changed
- **Goals tab** — Eco-Utopia, Great City, Trade Empire, and Harmony all trackable; `COMING_SOON_VICTORY_PATHS` empty.

## [0.4.1] - Frontier raid balance & combat preview (2026-07-04)

### Added
- **Combat preview panel** (`CombatPreviewPanel.tsx`, `getCombatPreview()`) — militia breakdown, rival strength, defend/barricade/pay-off forecasts, and outgoing raid forecast in raid banner, Village tab, and rival inspector.
- **Distance to rival camps** — tiles from village anchor (Town Hall → House → settlers); shown in preview, Village tab rival list, incoming raid banner, and rival inspector.
- **Distance-scaled raid provisions** — `getOutgoingRaidFoodCost()` (22–50🍖 by march distance); raid button and preview show exact cost per rival.
- **Home-turf defense** — `getRivalDefenseStrength()` (+25% when you raid their camp); outgoing thresholds **≥135%** full spoils, **≥100%** meager, below = repelled (+15🍖 extra on fail).
- **Split ratio hints** — `DEFENSE_RATIO_HINT` vs `COUNTER_RAID_RATIO_HINT` in preview (no longer one misleading footer).

### Changed
- **Incoming vs outgoing clarity** — UI labels: “If they raid your village” vs “If you raid their camp”; pay-off tribute amount shown in preview; incoming banner does not show counter-raid section.
- **Counter-raid forecast gated** — preview shows outcome only when spears, 8+ pop, enough food, and non-friendly relations; otherwise a specific blocker message.
- **Stable village anchor** — `getPlayerCampCenter()` prefers Town Hall / House over wandering settler centroid (shared with `groupEvents.ts` spawn distance).
- **Focus hint** — counter-raid note mentions distance-scaled food (not flat 30🍖).

## [0.4.1] - Frontier raids & militia combat (2026-07-04)

### Added
- **Incoming raids** from tense/competitive rivals (`maybeQueueRaid` in `frontierCombat.ts`) — red banner + rival inspector with 3-day deadline.
- **Defend choices**: militia fight (stone/iron spears), barricade (20 wood + 10 stone), or pay food tribute.
- **Combat resolution** — militia vs raid strength (population, spears, shields); outcomes from decisive victory to defeat with loot, building damage, casualties.
- **Counter-raid** — `launchRaidOnRival()` from rival inspector (provisions + spears + 8+ pop); seize supplies or risk repelled raid + counter-attack.
- **Visible war-bands** — rival settlers march toward your village while a raid is pending; combat flashes on map.
- **Combat chronicle** — new `combat` event-log type + Log tab filter.

### Technical
- `pendingRaidEvents` on `WorldState`; `raidCooldownDays` on `RivalSettlement`.
- `frontierCombat.ts` — strength helpers, raid tick/expiry, response handlers.

## [0.4.1] - Docs: TODO + roadmap sync (2026-07-04)

### Added
- **`ROADMAP_0.5.0.md`** — open work checklist (frontier raid polish, perf, architecture).
- **In-game roadmap** — `ROADMAP_OPEN_FIXES` section in Roadmap tab (“Still to fix / implement”).

### Changed
- **`CHANGELOG.md`**, **`ROADMAP.md`**, **`roadmapContent.ts`**, **`TECHNICAL.md`** — frontier raids MVP + combat preview marked shipped; remaining combat/craft/polish items listed.

## [0.4.1] - In-game roadmap tab (2026-07-04)

### Added
- **Roadmap tab** — eighth sidebar tab with read-only v0.4.1 slice: shipped features, open/partial P0–P2 items, next dev priorities (`RoadmapPanel.tsx`, `roadmapContent.ts`).
- **Guide → Roadmap** shortcut button at top of Guide tab.

### Technical
- `roadmapContent.ts` mirrors `ROADMAP.md` priorities; update when shipping v0.4.1 items.

## [0.4.1] - Tribe interaction v2 + Nature grazing warning (2026-07-04)

v0.4.1 partial — deeper frontier diplomacy and ecosystem coaching.

### Added
- **Rival diplomacy event cards**: `DiplomacyEvent` queue on `WorldState.pendingDiplomacyEvents` — tribute demands, border disputes, and alliance offers spawned from `tickRivalSettlements()`. Players respond via top-of-map banner (2–3 choices) or rival inspector panel (`respondToDiplomacyEvent()` in `groupEvents.ts`).
- **Rival map diplomacy panel**: Click a rival **camp marker** or **rival building** on the map to open the inspector with gifts, trade pact, militia, pending events, and **Ping camp on map** (camera focus + pulsing ring).
- **Visitor camp diplomacy**: Click visitor **camp markers** for trade UI (`tradeWithVisitors()` — buy food/wood, sell food) on traders, nomads, and hunters.
- **Refugee negotiate screen**: Refugee caravans no longer auto-join; player chooses welcome (40🍖), screen (20🍖), or turn away (`negotiateRefugees()`). Visitor entity inspector links to camp panel.
- **Camp hit-testing**: `hitTestCamp()` in `groupEvents.ts`; canvas click handler in `App.tsx` focuses camera and sets `highlightedCampKey` / `selectedCampKey` on `ViewState`.
- **Nature tab grazing pressure warning**: `ecosystemPressure.ts` computes deer grazing demand vs grass recovery (season/weather aware). Amber/rose alert card when pressure is **caution** or **critical**, with actionable advice (wolves, overgrazing, drought/winter).

### Changed
- **VisitorGroup** fields: `tradesCompleted`, `refugeeResolved` (save/load migrated in `saveLoad.ts`).
- **Frontier neighbors** (Village tab): Focus camp buttons; diplomacy hints when events are pending.
- **Guide tab**: Documents map-click diplomacy and visitor trade/refugee negotiate (no longer Village-tab-only).
- **Active event banner**: Yields to pending diplomacy cards when rivals need a response.

### Technical
- New types in `gameTypes.ts`: `DiplomacyEvent`, `DiplomacyChoice`, `DiplomacyEventKind`; `pendingDiplomacyEvents` on `WorldState`.
- `viewState.ts`: `highlightedCampKey`, `selectedCampKey` for camp selection and map ping.
- `renderSnapshot.ts` / `renderer.ts`: Pulsing highlight ring on focused rival/visitor camps.
- `gameEngine.ts` re-exports: `respondToDiplomacyEvent`, `tradeWithVisitors`, `negotiateRefugees`, `hitTestCamp`, `getGrazingPressureReport`.
- `worldGen.ts` initializes `pendingDiplomacyEvents: []`.
- Pending diplomacy events expire after 14 in-game days if unanswered (`tickPendingDiplomacyEvents`).

## [0.4] - Early alpha (June 2026) ✅

Verified in codebase — all shipped before **v0.4.1** (2026-07-04). Verbose dev-log entries removed; only the top `## [Unreleased]` section tracks in-flight **v0.5.0** work.

- [x] **Event log** — uncapped saves, 500-entry UI cap, `.txt`/`.json`/`.csv` export (`eventLog.ts`, `eventLogExport.ts`, `EventLogPanel.tsx`)
- [x] **Prison + Guard** — arrest on caught affairs, prisoner state, `isImprisoned()` (`BuildingType.Prison`, `lifeSimulation.ts`, `dayCycle.ts`)
- [x] **Terrain** — real terrain render, tile-sized cache, preset variety, coastal camp clearing (`renderer.ts`, `terrainGen.ts`)
- [x] **Audio credits** — [TECHNICAL.md](TECHNICAL.md#audio-credits)
- [x] **Shared event log module** — `logEvent()`, `syncEventLogIdFromState()` (`eventLog.ts`)
- [x] **Building foundation pads** — category colors, pad shapes, season tint, hover/selection (`renderer.ts`, `BUILDING_CONFIGS`)
- [x] **Simulation upgrade** — storage caps, food spoilage, terrain/adjacency efficiency, wolf pack bonuses (`economy.ts`, `gameEngine.ts`, `lifeSimulation.ts`)
- [x] **Werewolf + Wildkin + Big News** — moon howler, wildkin births, dismissible banner (`moonHowler.ts`, `lifeSimulation.ts`, `gameEngine.ts`)
- [x] **Taming, visitors, festivals** — Taming Post, caravans, `festival` state, economic rebalance (`buildingActions.ts`, `groupEvents.ts`, `worldGen.ts`)
