# Wilderfolk v0.6.5.2 — Feature Implementation Roadmap

**Target version:** 0.6.5.2  
**Updated:** 28 October 2026  
**Purpose:** record which gameplay features have been implemented and which feature scope remains open. This is **not** an implementation plan, test checklist or release-verification log.

**Acceptance policy: merged = accepted.** `[x]` means the feature is present in code merged into `main`; `[ ]` means the described additional feature remains incomplete or has not been merged. A finished core feature is not reopened merely because optional extensions remain. See [§21](#21-merged-feature-implementation-register--28-october-2026) for accepted PRs and canonical owners.

## Version 0.6.5.2 — merged feature overview

### Merged and implemented

- [x] **Housing and family lifecycle:** ordered housing ownership, custody, reserved beds, fixed 20-bed leader home and linked annex ([#40](https://github.com/Rengerams/wilderfolk/pull/40), [#56](https://github.com/Rengerams/wilderfolk/pull/56)).
- [x] **Raids and rivals:** strategic world-map settlements, six-hour battles, persistent casualties, surrender choices, recovery, destruction, prisoners and civic merit ([#58](https://github.com/Rengerams/wilderfolk/pull/58)).
- [x] **Roads, walls and navigation:** continuous drag construction/demolition, junctions, gates, collision, entrance snapping, terrain-based path costs and road speed ([#59](https://github.com/Rengerams/wilderfolk/pull/59), [#65](https://github.com/Rengerams/wilderfolk/pull/65), [#66](https://github.com/Rengerams/wilderfolk/pull/66)).
- [x] **Watchtowers — simulated, passive defense:** buildable Watchtowers provide +15 barricade strength each (+27 after forged Tower Ballistae), detect marching raiders within 260 world units, and can be built by the Virtual Player. These bonuses are simulation parameters; no towers shoot projectiles or initiate real-time combat (`defenseStructures.ts`, `watchtowerDetection.ts`, `virtualPlayer.ts`).
- [x] **Indoor presentation:** hide settlers who are physically inside buildings while maintaining their simulation activity ([#60](https://github.com/Rengerams/wilderfolk/pull/60)).
- [x] **Human needs and food systems:** separate persistent nutrition/rest/stamina, real meals and sleep, workforce and automated farm adjustments ([#62](https://github.com/Rengerams/wilderfolk/pull/62)).
- [x] **Distinct biomes and map presets:** terrain-based habitats, consistent rivers/scenery, original-site production bonuses and generator compatibility ([#63](https://github.com/Rengerams/wilderfolk/pull/63)).
- [x] **Reduced simulation copying:** fewer whole-world copies, smaller unchanged-history worker deltas and rollback profiling ([#64](https://github.com/Rengerams/wilderfolk/pull/64)).
- [x] **Canonical engineering ownership:** consolidate duplicate aliases and remove obsolete compatibility-only facades ([#67](https://github.com/Rengerams/wilderfolk/pull/67), [#68](https://github.com/Rengerams/wilderfolk/pull/68)).
- [x] **Situational wartime morality:** surrender, mercy and executions affect standing in context rather than assigning universal moral rewards ([#70](https://github.com/Rengerams/wilderfolk/pull/70)).
- [x] **Workforce performance:** reuse staffing indexes and avoid unnecessary reassignment passes ([#71](https://github.com/Rengerams/wilderfolk/pull/71)).
- [x] **Natural riverbanks and forest groves (terrain v3):** riparian transitions, flow-shaped river footprints and biome-weighted vegetation ([#73](https://github.com/Rengerams/wilderfolk/pull/73)).
- [x] **Build workflow maintenance:** repair GitHub Actions dependency lockfile and npm caching setup ([#74](https://github.com/Rengerams/wilderfolk/pull/74)).
- [x] **Food-chain autoplayer:** curb nonessential housing during deficits, improve staffed food-production upgrades, and select feasible Greenhouses, Fishing Spots, Hunting Spots and Farms ([#72](https://github.com/Rengerams/wilderfolk/pull/72)).
- [x] **River surface effects:** flow-aligned water glints, localized waterfall whitewater and varied sediment banks ([#75](https://github.com/Rengerams/wilderfolk/pull/75)).
- [x] **Richer terrain relief:** ridge/valley shading, exposed rock materials and terrain-grounded vegetation ([#76](https://github.com/Rengerams/wilderfolk/pull/76)).
- [x] **2.5D ground mesh:** cached raised terrain chunks, terrain-aligned objects and inverse pointer picking; older save projections stay intact ([#77](https://github.com/Rengerams/wilderfolk/pull/77)).
- [x] **Continuous ecotones and licensed nature art:** smoothly blended biome materials and vegetation with bundled, credited sprites for world generation v4 ([#79](https://github.com/Rengerams/wilderfolk/pull/79)).
- [x] **Silo expansion on storage pressure:** build additional Silos when food storage reaches 90% occupancy, without treating food shortages as a reason for expansion ([#81](https://github.com/Rengerams/wilderfolk/pull/81)).
- [x] **Food-first workforce protection:** preserve staffed food producers, allow transferable Quarry surplus and keep the Virtual Player's donor rule consistent with actual staffing ([#82](https://github.com/Rengerams/wilderfolk/pull/82)).

## 1. Warfare design goals — implemented

- [x] Raids produce persistent casualties, losses, reports and consequences rather than only resource deductions.
- [x] A lost defense need not destroy the village; defeated settlements can recover.
- [x] An outgoing victory never automatically razes its rival; the player chooses its fate.
- [x] War remains **simulation-only**. No real-time fighting, projectile-firing towers or tactical minigame is planned.

## 2. Raid lifecycle and strategic rivals — implemented

- [x] Incoming raid warning, preparation, defense choices and six-game-hour combat phases.
- [x] Outgoing march, engagement, six-game-hour battle and return, including reserved soldiers and durable midpoint casualties.
- [x] Raid phases and outcomes are recorded in the **ordinary Chronicle event log** as well as supplemental battle reports, with one resolved result across reloads.
- [x] Up to **six strategic settlements total** (friendly and hostile combined) on the **world map only**. Founding opportunities begin on colony day 10, recur every 30 days and require six living player settlers; older saves above the cap remain intact.
- [x] Cancelled expeditions and razed rivals release deployed troops; peace clears war state.

## 3. Battle outcomes, village survival and recovery — implemented

- [x] Distinct defended, costly, lost and devastating outcomes; battle outcome is separate from village survival.
- [x] Destruction is conditional on razing intent, overwhelming force, failed last resistance and insufficient remaining shelter/defenses — **not strength ratio alone**.
- [x] Survivors, damaged buildings, food shortages and repair needs persist through a recovery state. A seven-day raid-protection interval limits immediate repeat attacks.
- [x] Persisted terminal state stops the simulation, preserves saves and offers final-state export, Chronicle, a new village or main menu.
- [x] Terminal screen includes the last recorded battle leader (or an explicit unavailable fallback), reached Chronicle chapters and up to five saved historical highlights, alongside existing outcome and export controls.

## 4. Victory decisions for a defeated rival — implemented

- [x] Persistent pending decision after a successful outgoing raid: **Withdraw / mercy**, **one-time tribute**, or **Raze settlement**.
- [x] Razing requires a separate confirmation, removes the rival once and cancels its pending events. Mercy and tribute leave it alive with distinct truces and consequences.
- [x] The battle report shows player/enemy losses and surviving rival population before a fate decision.
- [x] Separate raze confirmation factually describes permanent removal, displaced survivors and possible diplomatic reactions by witnesses, without moral judgement.

## 5. Valley diplomacy and consequences — implemented

- [x] Persistent **trust, fear and grievance** memory; nearby witnesses react to a settlement's fate.
- [x] Mercy, tribute, destruction and captive outcomes affect diplomatic relations, future hostility/raid timing and civic responses.
- [x] Effects depend on context and the village population; neither mercy nor execution receives a universal moral reward or penalty.
- [x] Repeated low-risk victories cannot farm unlimited leadership merit.

## 6. Live raid reports and casualties — implemented

- [x] Live event commentary for both sides, with stable records for confirmed casualties.
- [x] Named **village dead in green** and **enemy dead in red**, also identified in text.
- [x] Abstract/off-map enemy losses are shown as counts; no invented enemy names or prisoners.
- [x] Historical battle reports include losses, damaged buildings, stolen supplies and leadership merit.
- [x] Only player villagers occupy the player's graveyard. Existing saves with enemy memorial history preserve the history without using player grave capacity.

## 7. Leadership merit — implemented

- [x] Battle merit is assigned at resolution to the leader who served during the battle, with no retroactive credit to a successor.
- [x] Significant defenses award up to **+60** merit; successful credible offensive raids award **+15 to +30**, while major failed defenses and reckless losses can reduce merit.
- [x] One award per raid ID, a 30-day repeat-victory cooldown per rival and a bounded total election contribution.
- [x] Civic reactions to prisoner treatment and settlement fate are situational rather than automatic approval or condemnation.

## 8. Warfare integration — implemented

- [x] The existing simulation owners handle raids (`frontierCombat.ts`), recovery and diplomatic memory (`raidAftermath.ts`), captives (`warPrisoners.ts`), world-state persistence, and the game UI.
- [x] Save/load and worker state preserve relevant pending decisions, casualties, recovery, scoring and prisoner custody. A terminal outcome cannot restart simulation through ordinary actions.

## 9. Raid feature implementation status

- [x] **Expanded final-settlement report:** last recorded leader, Chronicle chapters and retained historical highlights (§3); merged PR [#89](https://github.com/Rengerams/wilderfolk/pull/89).
- [x] **Clearer raze confirmation:** permanent rival removal, displacement and contextual diplomatic reactions (§4); merged PR [#89](https://github.com/Rengerams/wilderfolk/pull/89).
- [x] Strategic rivals, six-hour raids, player choice, aftermath, recovery, terminal defeat, captives, diplomatic memory and leadership merit are in merged PR [#58](https://github.com/Rengerams/wilderfolk/pull/58).
- [x] Civic wartime decisions were extended in merged PR [#70](https://github.com/Rengerams/wilderfolk/pull/70).

## 10. Warfare scope boundary

The raid overhaul is an implemented **aggregate simulation**, not a tactical battle system. Existing Watchtowers already contribute passive barricade defense and early warning. Active turret fire, projectile combat, manual combat and physical siege minigames are **not planned**.

## 11. DNA traits — strengths, weaknesses and whole-game influence

**Codebot implementation:** [Executable PR tickets A–E](docs/plans/personality-career-codebot-tasks-0.6.5.2.md) · [architecture](docs/plans/personality-career-single-pipeline-0.6.5.2.md). Every PR must update both ownership registries and follow [the bug-report protocol](docs/bug_report/readme.md).

- [x] The existing inherited identity system assigns **three DNA traits from fourteen**, with established selected trait effects.
- [ ] Every trait gains meaningful, bounded, context-relevant positive and negative influences across applicable production, skills, education, combat, diplomacy and social systems.
- [ ] Trait aptitudes and acquired experience combine without permanently locking professions or making one DNA set universally superior.
- [ ] Personality influences leisure, friendships, romance, fidelity, parenting, reactions to life events and personal development; existing relationships and experiences remain important rather than one trait determining a choice.
- [ ] Inspectors explain applicable DNA strengths, disadvantages and contextual behavior using the character's existing traits and history.

## 12. Raid prisoners — implemented

- [x] **12.1 Taking captives:** only identifiable eligible adult enemy combatants; capture depends on real survivors, escort availability and prison capacity.
- [x] **12.2 Prisoner decisions:** keep imprisoned, release, offer voluntary recruitment or execute after confirmation. Recruitment may be refused and has a cooldown.
- [x] **12.3 Community consequences:** situational reactions to prisoner treatment; enemy casualties and executions never create player graves.
- [x] **12.4 Valley consequences:** persistent trust, fear, grievance and relationship changes, witnessed in context.
- [x] **12.5 Prisoner interaction:** separate prisoner-of-war interface, identity, custody, availability and confirmation for execution.
- [x] **12.6 Simulation integration:** guards, food, cell capacity, custody outcomes, safe departures, citizenship on recruitment and save/load state reuse existing game systems.

## 13. Roads, walls and towers — implemented core

- [x] **13.1 Construction:** drag-to-build roads and walls, geometry-aware joins, demolition, bridges, gates, entrance snapping and appropriate resource/collision rules ([#59](https://github.com/Rengerams/wilderfolk/pull/59), [#65](https://github.com/Rengerams/wilderfolk/pull/65), [#66](https://github.com/Rengerams/wilderfolk/pull/66)).
- [x] **13.2 Travel and access:** real road surfaces affect pathfinding and travel speed; gates, bridges and terrain affect routes.
- [x] **13.3 Visuals:** connected infrastructure geometry, previews and compatible terrain rendering.
- [x] **13.4 Watchtowers:** passive **+15** barricade strength each (**+27** with forged Tower Ballistae); approaching raiders detected within **260 world units**. The Virtual Player can construct them.
- [x] **13.5 Combat boundary:** walls/gates/towers contribute to simulated defense, not active attacks.
- [x] **13.6 Persistence:** infrastructure remains compatible with existing save data.

## 14. Districts and neighbourhood identity — not yet implemented

- [ ] Editable residential, farming, industrial, civic or defensive districts and a district map/inspector.
- [ ] District-level population, work, access, safety and happiness summaries, with meaningful neighbourhood identity and optional local priorities.

## 15. Seasons, resilience and village emergencies — additional features open

- [x] The existing game already has seasons and seasonal simulation effects.
- [ ] Seasonal preparedness view for food, fuel, shelter and critical reserves.
- [ ] Rare, understandable simulated emergencies (fires, storm/road damage, illness pressure) with practical recovery and emergency work priorities.

## 16. More meaningful professions, education and career paths — additional features open

**Codebot implementation:** [Executable DNA + career PR tickets A–E](docs/plans/personality-career-codebot-tasks-0.6.5.2.md). Shared trait evaluation, separate bounded career-history owner; no aliases or re-exports.

- [x] Existing school-age rules, age-18 adulthood, job skills, employment and selective apprenticeship mechanics remain the foundation.
- [ ] Persistent adult work histories, experience milestones and meaningful progression for teachers, medics, builders, craftspeople and defenders.
- [ ] Contextual **Why this worker?** explanations integrating skill, aptitude, distance, availability and interests.
- [ ] DNA aptitude and career development influence opportunities without constant involuntary workplace reshuffling or mandatory apprenticeship.

## 17. Simulation performance and large-colony scalability — partially implemented

- [x] Reduced world-state copies and unchanged worker history transfers ([#64](https://github.com/Rengerams/wilderfolk/pull/64)).
- [x] More efficient workforce indexes and fewer redundant reassignment passes ([#71](https://github.com/Rengerams/wilderfolk/pull/71)).
- [ ] Further incremental spatial/topology indexing, event-driven caches and bounded pathfinding/rendering work for very large colonies.
- [ ] Additional memory, save/load and worker-transfer scalability improvements beyond the merged changes.

## 18. Player tools and explainability — additional features open

- [ ] Consolidated **Why is this happening?** explanations for staffing, food, school places, inactivity, housing, roads and defense.
- [ ] Configurable actionable alerts and repair-priority controls.
- [ ] Reliable, clearly labeled previews for the effect of planned policies and infrastructure changes.
- [ ] Responsive bulk selection and filtering for large settlements.

## 19. Implementation status policy

This roadmap records **feature availability only**. Specifications and implementation plans stay in their separate documents. Neither acceptance tests nor performance benchmarks are tracked as roadmap tasks; only unfinished gameplay or engineering features appear unchecked.

## 20. Human needs and food economy — implemented core

- [x] Independent persistent **nutrition**, **rest** and **stamina** for player humans, replacing the old combined hunger/exhaustion mechanic ([#62](https://github.com/Rengerams/wilderfolk/pull/62)).
- [x] Actual meals debit the food ledger once; sleep, exertion, activity and break behaviors affect the correct needs.
- [x] Distinct work/health consequences, gradual deprivation, visible needs and save/worker compatibility.
- [x] Food demand, forecast and production planning integrate with human needs. The Virtual Player has food-first construction/staffing improvements ([#72](https://github.com/Rengerams/wilderfolk/pull/72), [#81](https://github.com/Rengerams/wilderfolk/pull/81), [#82](https://github.com/Rengerams/wilderfolk/pull/82)).
- [ ] **Further gameplay balancing:** meal quantities, sleep/stamina pacing and prolonged deprivation effects.

## 21. Merged feature implementation register — 28 October 2026

**Project rule: merged = accepted.** This register lists implemented features from merged code on `main`, not proposals or draft status. Future enhancements stay in the feature backlog; this roadmap is an implementation overview, not a test/verification register.

| Area | Merged and accepted PRs | Added/changed behavior in current code | Primary references |
| --- | --- | --- | --- |
| Housing and families | [#40](https://github.com/Rengerams/wilderfolk/pull/40), [#56](https://github.com/Rengerams/wilderfolk/pull/56) | Ordered housing ledger and phase pipeline; protected prisoner beds; 20-bed leader home and one linked annex; adult-child independence, deterministic divorce custody and distance-aware family relocation | [Housing architecture](docs/HOUSING_ARCHITECTURE.md), `residencyReconciliation.ts`, `leaderHouseExpansion.ts` |
| Raids, strategic rivals, prisoners | [#58](https://github.com/Rengerams/wilderfolk/pull/58) | Up to six strategic-only rivals, six-hour incoming/outgoing battles, durable casualties, victory choice/mercy/tribute/razing, settlement recovery/destruction, captive outcomes, diplomatic memory and bounded leadership merit | `frontierCombat.ts`, `raidAftermath.ts`, `rivalSettlements.ts`, `warPrisoners.ts` |
| Roads, walls, gates and navigation | [#59](https://github.com/Rengerams/wilderfolk/pull/59), [#65](https://github.com/Rengerams/wilderfolk/pull/65), [#66](https://github.com/Rengerams/wilderfolk/pull/66) | Drag road/wall build and demolition, geometry-aware joins and building-entrance snapping, gate open/close and collision, A* road-cost preference and speed only on real road surfaces; corrected previews and legacy save tests | [Brief](docs/plans/roads-walls-navigation-overhaul.md), [Architecture](docs/ROADS_WALLS_NAVIGATION_ARCHITECTURE.md), `stripTopology.ts`, `pathfinding.ts` |
| Existing Watchtowers — passive simulation | Existing `BuildingType.Watchtower` system | Buildable and Virtual Player-buildable; +15 passive barricade strength each or +27 with forged Tower Ballistae; early warning at 260 world units; no active firing or real-time combat | `src/game/defenseStructures.ts`, `src/game/watchtowerDetection.ts`, `src/game/virtualPlayer.ts` |
| Human needs and food | [#62](https://github.com/Rengerams/wilderfolk/pull/62) | Serialized nutrition/rest/stamina for player humans, one physiology update before offscreen branching, meal ledger integration, gradual deprivation, shift/rest behavior, Moon Howler restoration, UI readouts, food-production bot/staffing fixes and regressions | [Needs architecture](docs/HUMAN_NEEDS_ARCHITECTURE.md), [PR mapping](docs/architecture/human-needs-pr62.md), `simulation/humanPhysiology.ts`, `simulation/humanNeeds.ts` |
| Map terrain/biomes | [#63](https://github.com/Rengerams/wilderfolk/pull/63) | Map presets with distinct relief, habitats and scenery; connected waterways, consistent terrain classification, original-site production bonuses, versioned generator/save behavior, terrain regressions | [Terrain architecture](docs/TERRAIN_ARCHITECTURE.md), `terrain/terragen.ts`, `terrain/terrainGrid.ts`, `renderer/terrain.ts` |
| World-copy overhead | [#64](https://github.com/Rengerams/wilderfolk/pull/64) | Narrower world/building copying, fingerprinted and omitted unchanged worker histories, leaner save serialization, rollback snapshot profiling | [Optimization note](docs/plans/world-copy-optimization-2026-10-27.md), `simBuffers/simDelta.ts`, `simWorker/simPrep.ts` |
| Canonical names, ownership, compatibility | [#67](https://github.com/Rengerams/wilderfolk/pull/67), [#68](https://github.com/Rengerams/wilderfolk/pull/68) | Removed redundant aliases, strengthened ownership/decision checks, introduced a guarded facade migration script, removed the `buildingActions.ts` and `rendererLoader.ts` compatibility-only files, rewired imports directly to owners | [Migration](docs/COMPATIBILITY_FACADE_MIGRATION.md), `OWNERSHIP_OVERVIEW.md`, `scripts/migrate-compat-facades.mjs` |
| Indoor settler rendering | [#60](https://github.com/Rengerams/wilderfolk/pull/60) | No outdoor settler sprite while inside a building, without pausing work, healthcare or other simulation progression | `humanTick.ts` and related renderer tests |
| Food-chain planning and Silo capacity | [#72](https://github.com/Rengerams/wilderfolk/pull/72), [#81](https://github.com/Rengerams/wilderfolk/pull/81) | Food-first Virtual Player decisions, productive site selection, housing restraint during shortages and additional Silos at 90% food-storage occupancy | `src/game/virtualPlayer.ts`, `workforcePolicy.ts` |
| Food-production workforce coverage | [#82](https://github.com/Rengerams/wilderfolk/pull/82) | Preserve essential Farm, Greenhouse, Hunting Spot and Fishing Spot staffing; borrow from eligible Quarry surplus; no repeated ineligible transfer commands | `src/game/workforce.ts`, `src/game/virtualPlayer.ts` |
| Raid civic consequences | [#70](https://github.com/Rengerams/wilderfolk/pull/70) | Contextual social and diplomatic reactions to mercy, execution, surrender and razing, rather than universal moral scores | Raid, diplomacy and leadership owners |
| Workforce assignment efficiency | [#71](https://github.com/Rengerams/wilderfolk/pull/71) | Reuse worker and donor indexes across assignments and avoid redundant workforce work | `src/game/workforce.ts` |
| Rivers and terrain ecology | [#73](https://github.com/Rengerams/wilderfolk/pull/73), [#75](https://github.com/Rengerams/wilderfolk/pull/75) | Flow-shaped rivers, riparian transitions, forest groves, directional water surfaces, localized whitewater and sediment banks | `src/game/renderer/whittakerTerrain.ts`, `src/game/terrain/` |
| Terrain relief and 2.5D display | [#76](https://github.com/Rengerams/wilderfolk/pull/76), [#77](https://github.com/Rengerams/wilderfolk/pull/77) | Ridgeline and valley shading, elevated cached mesh chunks, grounded vegetation and accurate inverse-picking of raised surfaces | `src/game/terrainAtlas.ts`, `docs/TERRAIN_ARCHITECTURE.md` |
| Biome transitions and nature artwork | [#79](https://github.com/Rengerams/wilderfolk/pull/79) | Climate-weighted ecotones, textured vegetation and bundled licensed terrain/nature assets for new generation-v4 maps | `src/game/renderer/`, `public/sprites/nature/`, `THIRD_PARTY_NOTICES.md` |
| CI workflow configuration | [#74](https://github.com/Rengerams/wilderfolk/pull/74) | Node workflow dependency caching and lockfile setup corrected | `.github/workflows/` |

### 21.1 Feature backlog beyond merged scope

These describe **unimplemented or incomplete features**, not test activities or implementation plans. Previously merged implementations remain accepted.

- [ ] **Whole-life DNA personalities:** contextual leisure, relationships, fidelity, parental priorities and persistent experiences (§11).
- [ ] **District identity:** neighborhoods, local amenities and meaningful residential identity (§14).
- [ ] **Seasons and emergencies:** deeper seasonal resilience, disasters and village responses (§15).
- [ ] **Professions and education:** expanded careers, meaningful skill development and settlement specialization (§16).
- [ ] **Additional scalable simulation architecture:** incremental topology/cache updates, event-driven heavy workloads and bounded worker transfers (§17).
- [ ] **Player explainability:** actionable alerts and clear reasons for autonomous decisions (§18).

### 21.2 Canonical document and implementation boundary

The root `roadmap_V.0.6.5.2.md` is canonical. The redundant `docs/` roadmap copy was removed to prevent contradictory status reports. Older architecture descriptions retain historical value, but pre-merge draft language must not override accepted merged implementation.
