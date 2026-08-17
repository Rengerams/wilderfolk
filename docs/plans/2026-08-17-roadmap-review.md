# Wilderfolk — State of the Game & Future Roadmap Review (2026-08-17)

**Serves as the future roadmap.** Written from the driver's seat after: game-feel plan Phases 0–4 shipped (pathfinding → painted valley → economy ledger → quests/trade/elections → weather → 2.5D relief → App split), victory paths removed for redesign (sandbox), economy audited (`ECONOMY_AUDIT_2026-08-17.md`) with a real iron chain added, build-menu/EM-8 fixed.

---

## 1. Where we stand — honest scorecard

| Pillar | Grade | What's strong | What's weak |
|---|---|---|---|
| **Ecology / food chain** | A− | "Don't kill all the wolves" is a genuine hook: grass→prey→predators→people in one loop; valley stages (Stable→Collapse); Passing Herds memory | The player has no tool to *see* the loop (no charts, no species counts); hunting quotas would help |
| **Settlers / society** | A− | 14 traits inherited DNA-style; affairs, gossip, scandals, elections, titles; family lines, prison, marriages | Drama is event-driven, not relationship-driven; no feuds/rivalries between families |
| **Economy** | B+ | Real chain now: wood/stone/iron/gold/food; storage, spoilage, adjacency, trade routes, forge, taxes | Gold still uncapped/snowballs; food banking impossible (3%/day rot); wood cap too small for winter; challenge rewards still lumpy |
| **Frontier / diplomacy** | B | Rivals with raids/treaties/reputation; visitor camps with trade/talks/refugees; trade routes | Rivals are one-note (raid or peace); no alliances, embargoes, marriage pacts, or caravan management |
| **Graphics / presentation** | B+ | 2.5D painted relief is a real identity; wide rivers, seasons, night glows, AO, particles, walk sheets | Building sprites inconsistent (wall/gate reserved, Hotel JPEG-with-.png); no construction animation; no cinematic camera |
| **Audio** | C+ | Work ambience, surface footsteps, click sounds | No adaptive music, no weather ambience layers, no story beats in sound |
| **UX / onboarding** | B− | Focus hints, contextual tutorial, guide, multi-select, good hotkeys | First-spring clarity is the retention gate; build catalog is dense; no pause-suggested builds |
| **Performance** | B | 150 tests green, gates clean, index-build optimization done | v0.6 capacity (1,200+ @ 10×) is the named next perf work; actions still deep-clone (~25–30 ms/click) |
| **Meta / content goals** | C+ | Challenges, village portrait, chronicle log | Victory paths removed — sandbox needs a *story* replacement (chapter goals), not win/lose |

**Identity check:** Wilderfolk is a **cozy frontier eco-sim about people living inside a food chain**. Its three pillars are: (1) the living valley, (2) the people and their drama, (3) the frontier you share with others. Every future feature should serve at least one pillar.

---

## 2. Core loop evaluation

**Atomic loop (second-to-second):** select settler/building → read need → act (build/assign/place). ✓ solid.
**Hour loop:** produce → eat → grow → build. ✓ solid.
**Day loop:** assign workers → jobs run → night falls (werewolves, light pools). ✓ solid.
**Season loop:** plant → harvest → winter heating → festivals. ✓ solid, is the best layer.
**Year/meta loop:** population grows → valley stresses → new needs → new buildings → bigger events. ⚠️ **fraying at 60–120 pop** — after Town Hall + forge, the next *dramatic* question is "what for?" (victory paths were that answer; now it's empty).

**The gap the roadmap must fill: a mid/late-game "story spine" that is NOT a win condition.** The village portrait already gestures at it ("how history sees you"). Grow that into a **Valley Chronicle** — chapter milestones (First Winter, The Famine, The Iron Age, The Great Hunt, The Alliance) that unlock content and shift the valley, without ever saying "you lost."

---

## 3. Future features by pillar

### ⚙️ Simulation depth
- **Water becomes a resource** — wells are currently a flat energy trick; make rivers/fishing/irrigation meaningful (fish from rivers, irrigation vs drought, floods as a disaster).
- **Winter survival depth** — wood storehouse (audit #4), food cellars/preserves (audit #6), blizzards that ground travel, ice fishing.
- **Ecology tools** — species population charts, hunting quotas per species, wildlife preserves (harmony without a "win"), predator-prey cycle visuals.
- **Disease & medicine** — make hospitals matter: outbreaks, herbalism, quarantine choices (plague immunity exists but is passive).
- **Economy rebalance from the audit** — gold upkeep/cap, reward lumps, farm worker scaling (audit recommendations #2/#3/#5).

### 👥 People & culture
- **Family lines deepen** — ancestor memorials, family crests, dynasties, inherited property.
- **Apprenticeships** — master→apprentice skills, workshop specializations (a village known for its smiths).
- **Relationship webs** — feuds, friendships, rivalries (not just romance/affairs); gossip as gameplay (intel on rivals!).
- **Religion & ceremonies** — deepen festivals with rituals, moon-howler church culture.

### 🏕️ Frontier & diplomacy
- **Rival alliances** — marriage pacts, trade embargoes, joint festivals, "cold war" tension instead of raid-or-peace.
- **Caravan management** — send YOUR caravan out (choose route, risk, goods), not just receive visitors.
- **Visitor quest lines** — the traveling-smith quest exists; expand to multi-step camp stories.

### 🎨 Graphics & presentation
- **Sprite consistency pass** — wall/gate sprites (reserved), Hotel fix, all buildings matching the painted terrain.
- **Construction animation** — building stages visible (foundation → frame → roof → done).
- **Work visible** — settlers visibly chopping/mining/smithing at their job.
- **Night & season identity** — snow on roofs, autumn leaves, lantern-lit streets, frozen river tint.
- **Cinematic camera** — scripted moments: founding pan, first festival, full-moon night, raid approach (mild, skippable).

### 🔊 Audio
- **Adaptive music** — day/night, season, tension layers (raid), festival theme.
- **Weather ambience** — storm howl, rain on roofs, wind in the valley.
- **Story beats** — stingers for big news, election, festival start.

### 🧭 UX / onboarding
- **First-spring tutorial campaign** — scripted guidance: build a house, a farm, hunt, survive winter — taught by the game, not a manual.
- **Build-catalog UX** — search, favorite recipes, "why can't I afford this?" breakdown.
- **Charts tab** — population, food, ecology, gold over years (we already draw line charts in stats).
- **Settings** — keybind remap, font size, colorblind mode, reduced motion.

### 🚀 Performance / tech (v0.6)
- **Entity-capacity plan** — 1,200+ settlers @ 10× (the named `2026-08-08-entity-capacity-perf-plan.md`).
- **Action-clone delta** — measured 25–30 ms/click; worth revisiting after capacity work.

### 📦 Meta / launch
- **Installer / Steam** — the stated destination; current beta save policy (exact-version) is fine until then, but plan a migration story.
- **Achievements** — cheap, sandbox-friendly, replayable (Eco-Master, Iron Tycoon, Century Mark).
- **Modding** — data-driven buildings/events/recipes would extend the sandbox enormously (defer).

---

## 4. The prioritized roadmap

### Phase 5 — Foundation (next; in-flight)
1. **v0.6 entity-capacity perf** — the named plan; gates the whole scale question.
2. **Onboarding tutorial campaign** (first spring) — the retention gate; biggest player-facing win per effort.
3. **Winter/material fixes from the audit** — wood storehouse, food cellar/preserves, gold upkeep cap, challenge-reward lumps.
4. **Sprite consistency** — wall/gate sprites, Hotel fix, building art pass to match painted terrain.
5. **Charts tab** — population/food/ecology/gold history (we have the drawing primitives).

### Phase 6 — The valley breathes deeper
6. **Water as a resource** (rivers matter: fish, irrigation, floods).
7. **Ecology tools** (species charts, hunting quotas, preserves).
8. **Winter depth** (blizzards, ice fishing, heating infrastructure).
9. **Rival alliances & diplomacy depth** (pacts, embargoes, marriage pacts).

### Phase 7 — People become history
10. **Valley Chronicle chapter goals** (the victory-path replacement — story milestones, no win/lose).
11. **Apprenticeships & workshop identity.**
12. **Family legacy** (memorials, crests, dynasties).
13. **Relationship webs** (feuds, friendships, rivalries).

### Phase 8 — Feel & launch
14. **Adaptive music + weather ambience.**
15. **Cinematic camera moments.**
16. **Construction & work animations.**
17. **Installer/Steam + achievements + settings/accessibility.**

---

## 5. Risks & things to NOT do

- **Don't add more systems on top of the tutorial gap** — onboard first or every new feature is lost on new players.
- **Don't rebuild the win-condition trap** — chapter goals should shift the world, not end it.
- **Don't chase PvP** — the game's soul is coexistence; keep raids as *preparation tests*, not slugfests.
- **Don't let gold stay uncapped** — the economy audit's distortion will only grow with more content.
- **Don't multiply entities before the v0.6 capacity work** — performance gates content density.

---

*This review is the working roadmap; the repo's `ROADMAP.md`/`CHANGELOG.md` track shipped reality. Next concrete step: Phase 5.1 (v0.6 entity-capacity) or 5.2 (tutorial campaign) — both are ready to scope.*
