# Wilderfolk v0.6.5.2 — Feature Implementation Roadmap

**Target version:** 0.6.5.2  
**Scope:** Warfare and rivals, housing and families, human needs and food, roads and fortifications, terrain/biomes, village life, simulation performance and graphics.

**Acceptance policy: merged = accepted.** Features implemented by a PR merged into `main` are marked `[x]`. See [§21](#21-merged-feature-implementation-register--28-october-2026) for the implementation register.

## Version 0.6.5.2 — feature implementation overview (28 October 2026)

This roadmap tracks **features and implemented behavior**, not a test or verification checklist. `[x]` means the feature was merged into `main`; `[ ]` means its listed implementation is not merged or remains to be built. Merged work is accepted. The sections below describe scope and how the features work.

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

### Remaining feature scope

The previously pending features in #72, #75, #76, #77 and #79 are now implemented and listed above. Additional, not-yet-implemented gameplay features remain in §§11–18 and the feature backlog in §21.1.

## 1. Design goals

A raid should create a story rather than merely subtract resources. Players should understand why they won or lost, know who died, make consequential decisions after winning, and have meaningful recovery choices after a defeat.

Core principles:

1. **Both sides follow comparable rules:** the player's village and rival settlements can win, lose, suffer permanent losses, recover, or be destroyed.
2. **Loss is not always game over:** most lost defenses damage a village, not erase it. Total destruction is an exceptional, clearly communicated outcome.
3. **Destruction is a choice for the victor:** after a decisive *outgoing* victory, the player must explicitly choose whether to destroy the rival village. Never auto-destroy it.
4. **Mercy has consequences too:** sparing a rival can improve the valley's opinion, influence diplomacy and create future opportunities or risks.
5. **People matter:** named casualties, family impact, mourning, and leadership recognition must connect to existing settlement simulation.
6. **No exploit loops:** rewards and election merit reflect risk, casualties, and real accomplishment, not repeated farming of weak camps.

## 2. The raid lifecycle

Each raid progresses through explicit states:

**Warning / preparation → march / approach → engagement → pressure / breach → outcome → player decision (when appropriate) → aftermath → recovery or game-over.**

- Incoming raids create an actionable warning when detected. Warning lead time depends on scouting and visibility; surprise attacks remain possible but should be exceptionally clear when they occur.
- The live raid overview gives readable phase-by-phase updates, current estimated strength, defending forces, fortifications, losses and stakes.
- The final outcome is resolved once by the combat owner and written to the Chronicle. Do not reapply casualties, loot or rewards when loading or reopening an interface.
- Battles need not become tactical minigames; the existing simulation decides combat, while the UI explains it.

### 2.1 Strategic neighbors — confirmed scope (26 October 2026)

- Settlements belong only to the world map. Founding must never add rival buildings or settlers to the player's village map.
- Allow at most **six friends and rivals combined** through one authoritative creation guard. Friendly diplomacy does not free a slot.
- The existing daily rival owner supplies founding opportunities from colony day 10, every 30 days, when at least six player settlers are alive. Keep the general yearly event pool separate.
- Existing saves retain settlement IDs, populations, relationships, treaties and pending outcomes. Colonies without neighbors can acquire them on a future founding opportunity without restarting.
- Preserve older saves with more than six settlements; block additional founding instead of deleting existing neighbors.
- [x] Implement strategic-only founding and the combined cap; cover daily game-tick integration, capacity and real save/load regression cases.
- [x] Advance incoming and outgoing battles on game-hour ticks over six game hours, independently of daily rival growth and diplomacy; persist midpoint casualties and reserved troops.
- [x] Release deployments when expeditions are cancelled or their rival is razed; peace clears declared-war state.

## 3. Battle outcomes and settlement survival

Treat **military outcome** and **settlement fate** as separate decisions. A lost battle does not necessarily destroy a settlement.

| Outcome | Suggested gameplay effect | Settlement fate |
|---|---|---|
| Defended / repelled | Invaders retreat; some injuries, casualties or minor damage possible | Survives |
| Costly defense / stalemate | Both sides lose people or supplies; buildings may be damaged | Survives |
| Lost defense | Resources stolen, significant casualties, building damage, disruption | Survives; recovery needed |
| Devastating defeat | Heavy losses, damaged/destroyed infrastructure, major morale/reputation effects | Survives if core population and habitable infrastructure remain |
| Overwhelming defeat with failed last defense | Enemy breaches all resistance and can raze the settlement | **Potential total destruction**, never determined by strength ratio alone |

### 3.1 Proposed devastation model

Use a testable battle-result object, not an arbitrary random wipe:

- **Force ratio:** effective attacker strength / defender strength, with defenders receiving documented fortification, equipment, terrain and preparation modifiers.
- **Actual battle result:** whether the defenders were routed or able to retreat; a numerical disadvantage alone cannot trigger destruction.
- **Defensive infrastructure:** intact walls, barracks and remaining defenses reduce the chance of a complete breach.
- **Survivors and shelter:** population alive, functioning housing and the ability to support a meaningful surviving settlement.
- **Enemy intent:** whether attackers came to raid for goods, punish, occupy or raze; not every hostile camp fights to exterminate.
- **Deterministic outcome resolution:** use the game's seeded simulation RNG and persist the outcome so reloads cannot reroll a loss.

**Initial balancing proposal, to be playtested rather than treated as final constants:** total destruction is only eligible after a decisive breach by an exceptionally superior force **and** failed remaining resistance; do not automatically destroy at a fixed 2× or 4× ratio. Give the player understandable advance signals and make expensive defenses genuinely useful.

### 3.2 Recovery after a defeat

A surviving city enters a **Recovery** state, not a game-over screen:

- Buildings retain actual damage and may require repairs; some can be ruined, but not all by default.
- Survivors keep their identity, families, jobs and housing links where valid.
- Families mourn fallen villagers. Graveyards memorialize **only player villagers**, subject to capacity.
- Refugees, shortages, fear, reduced production and morale may create a difficult rebuilding period, using existing systems where possible.
- Provide a clear recovery panel: people lost, buildings damaged, supplies stolen, repair priorities and current threats.
- A temporary defensive truce / raid cooldown is worth evaluating to avoid an unrecoverable chain of raids; it must not guarantee permanent safety.
- Recovering successfully should be a viable and satisfying path, not an artificially delayed inevitable defeat.

### 3.3 Total destruction of the player's village

A complete enemy victory can destroy the player's settlement, **but only after the overwhelming-defeat requirements above are met**.

- Present a distinct end-of-settlement screen with the final battle report, leader, surviving/fallen population, village age, achievements and Chronicle highlights.
- Stop the simulation cleanly and persist a terminal state to prevent accidentally resuming a destroyed colony.
- Provide **View Chronicle / Final Report**, **Start New Village**, and **Return to Main Menu**.
- Do **not** silently delete save files. Preserve an archived read-only/final-state save or provide a deliberate export.
- Avoid presenting a meaningless “Continue” option if no functional settlement remains.
- Design separately whether surviving refugees can found a new settlement in a future expansion; do not pretend that system exists in this release.

## 4. Player decision after defeating a rival settlement

**Mandatory design rule:** even if the player's war-band wins overwhelmingly, it does **not** automatically destroy the rival village. Pause final disposition and ask the player what to do.

Suggested dialog:

> **The rival settlement has surrendered.**  
> Your forces have broken its defenses. Its remaining families await your decision. What will you do?

| Choice | Result | Reputation and future implications |
|---|---|---|
| **Show mercy / Withdraw** | Rival survives; end the assault and withdraw, with any already-earned lawful loot defined by battle terms | Positive mercy/reputation, possible diplomatic opening; rival may recover |
| **Demand tribute / Terms** | Rival survives under a defined agreement, resources or truce; refusal may be possible if the terms are unreasonable | Civic response depends on residents and war history; rival resentment or future bargaining remains possible |
| **Raze the settlement** | Rival is permanently eliminated, its remaining structures/events are removed; survivor/refugee outcome must be handled explicitly | Local support is situational; nearby settlements remember the destruction and can react through fear, tension or retaliation |

Optional *occupation / vassalage* is **out of scope** unless a persistent control/tribute implementation is also designed and tested. Do not display an option that does nothing.

Interaction requirements:

- The decision is a deliberate, clearly labeled confirmation, **not an easy-to-miss toast**.
- **Raze** requires a second confirmation indicating the irreversible result and diplomatic cost.
- Provide casualty and survivor counts before the player chooses.
- The choice must be saved reliably if the player closes the game during the decision.
- Choosing mercy should be strategically viable, not objectively worse than razing.
- Existing rival settlements cannot be removed before a player's Raze decision is committed.
- A rival that has already been destroyed cannot be “destroyed again” for duplicate rewards.

## 5. The valley remembers: diplomacy, fear and reputation

Track the consequences of the outcome **separately**:

- **Trust / standing:** nearby neutral and peaceful settlements may respect mercy and resent extermination.
- **Fear:** hostile camps may be deterred temporarily by a feared victor while neutral camps become less willing to cooperate.
- **Grievance:** the defeated camp or its allies may hold grudges after excessive destruction or tribute.
- **War prestige:** a successful and proportionate defense is admired; reckless aggression is not automatically celebrated.

Valley reactions should depend on who knows about the raid, existing relationships and the victor's choice. Do not instantly inform every camp if information has no believable route.

Examples:

- **Defend your home successfully:** improved standing among local allies and villagers, reduced enemy confidence.
- **Win and show mercy:** modest prestige plus meaningful diplomatic goodwill.
- **Win and demand tribute:** income and power, balanced with resentment.
- **Raze a defenseless, defeated settlement:** significant fear and negative standing with peaceful neighbors, potential revenge events.
- **Lose and survive:** short-term vulnerability; potential sympathy or aid from friends.

Prevent reputation exploits by counting each actual battle and final disposition once, with cooldowns or diminishing returns for repeatedly attacking the same weakened rival. Show reputation changes in the Chronicle, diplomacy panel, and the post-battle summary.

## 6. Live raid overview: named casualties and clear colors

During **incoming and outgoing raids**, show named casualties from **both sides as the battle is progressing**, where the simulation has actual identifiable characters.

- **Green:** named people from the **player's village**.
- **Red:** named **enemy** fighters.
- Always label the sides in text/icons as well as color, for color-blind accessibility.
- Distinguish **Killed**, **Wounded** (only if the game has a real persisted wounded state), **Missing** (only if implemented) and **Unknown / off-map losses**.
- Do **not invent names** for abstract/off-map rival population losses; display those as counts.
- Make the casualty list update from stable event records so killed people appear once and stay visible when phases change.
- Provide a final summary by side, a chronological battle feed, and links/focus controls for real world entities where appropriate.
- Never put enemies into a player-owned Graveyard; enemy deaths may be recorded in combat logs/Chronicle only.
- Graveyard UI must only display player graves, and any previously saved erroneous enemy memorials need a deliberate save-migration policy.

## 7. Leadership merit: reward defending the town

Successfully defending the village should be a **major achievement** for its leader, and should significantly affect future elections.

### 7.1 Merit policy (initial balancing values, subject to testing)

| Event | Proposed leadership merit | Conditions |
|---|---:|---|
| Repel a serious incoming attack | **+40** | Meaningful enemy threat, village remains standing |
| Repel overwhelming odds | **+60** | Exceptional defense with real risks |
| Win a costly defense | **+20** | Defense succeeds but village suffers substantial losses |
| Successful offensive raid | **+15 to +30** | Scaled by relative strength, objective completed and losses |
| Spare a surrendered rival | **Contextual civic response** | Villager traits and the recent conflict can raise, lower or leave leadership standing unchanged; no second victory award |
| Reckless offensive defeat | **−20 to −40** | Significant avoidable losses |
| Devastating failed defense | **−25** | Unless circumstances merit a different assessment |
| Raze a surrendered rival | **Contextual civic response** | Local support can rise, fall or remain neutral; neighbors retain independent fear and grievance |

The numerical battle awards above are **initial balancing proposals**. Settlement-fate civic responses are implemented as bounded, contextual reactions rather than automatic ethical rewards or penalties; they feed the existing election score, not a second unlimited tally.

### 7.2 Guardrails

- Award the merit to the **leader in office when the battle resolves**; track that ID as part of the raid state.
- Credit **one result per raid ID**, including across reloads, duplicated log events and repeated UI opening.
- Scale merit by **credible threat level**: repeatedly defeating trivial raiding parties cannot generate unlimited votes.
- Bound the total contribution to election merit within the existing leadership scoring system.
- Make defense especially valuable because the leader preserved homes and residents, not merely because an enemy retreated.
- Successful offensive raids reward competent planning but should not outweigh prolonged good governance or be more valuable than saving the city.
- Chronicle entries should clearly explain why the leader gained or lost standing.
- If the leader dies in the battle, record their sacrifice appropriately; do not award points to an unrelated successor retroactively.

## 8. Integration guidance

Implement inside the existing game owners where possible; avoid parallel raid or election logic:

1. **Combat resolution:** extend the existing frontier-combat raid result/state model with explicit survival and disposition outcomes. Preserve current ratio, loot and casualty mechanics unless the redesign intentionally replaces them.
2. **Persistent state:** define typed and versioned pending post-victory choice, battle casualty events, terminal settlement status and scored-raid IDs; validate these on save/load.
3. **Raid UI:** update the existing live raid / combat overview with phase updates, casualty sides, colors and final decision.
4. **Rival lifecycle:** only call rival settlement removal on an explicitly confirmed Raze decision; retain rivals for mercy or tribute.
5. **Player settlement lifecycle:** handle building destruction, survivors, recovery or terminal state without corrupting building/workplace/family references.
6. **Politics/diplomacy:** use the existing reputation and election-merit owners; avoid duplicate rewards in event handlers.
7. **Death/memorials:** keep player burial logic separate from enemy combat casualty recording.
8. **Chronicle/alerts:** log events once, distinguish raid phases and consequences, make crucial decisions persistent and visible.
9. **Save migration:** consider saves containing enemy graves or already-pending raid outcomes and design safe defaults rather than silently erasing records.
10. **Versioning/docs:** ship this only when verified; move future features from this roadmap into v0.6.5.2 release notes once working.

### Implementation checkpoint — 26 October 2026

The existing combat, prison, election, worker and save owners now handle hourly incoming/outgoing battles, durable reports and victory decisions, bounded leadership rewards, recovery and terminal settlement state. Recovery requires actual food and repair progress; destruction requires a razing intent and a breached last defense, not strength ratio alone.

Only identifiable adult enemy soldiers can become prisoners, subject to real cells and escorts. Release and escape preserve living identities; recruitment requires consent, capacity and housing; execution requires confirmation and does not create player graves. Mercy, tribute and razing retain their existing consequences and add bounded witnessed diplomatic memory. Legacy saves receive safe defaults while retaining old grave history.

Audit corrections preserve midpoint casualties in surrender choices and final announcements after normal tick cleanup and reload. Overlapping defeats retain the highest outstanding repair and food targets; completing repairs early does not cancel the seven-day raid protection. Natural captive deaths close custody history and never create village graves, while executions remain distinct.

Mass destruction uses one building-removal batch and one housing/staffing/storage reconciliation, with bounded visual effects. The live troop count uses a single cached population pass, and captive housing availability is calculated once per world update. An opt-in lifecycle benchmark (`WARFARE_PERF_OUTPUT`) exercises 100/400/1,000 damaged structures through the real raid owner. A local 12-inhabitant run reduced 1,000-structure destruction from about 167 ms to under 3 ms; this is a focused measurement, not a large-colony or Windows acceptance result. These changes do not complete the large-colony performance gate.

Automated lifecycle and migration checks cover these transitions. Browser checks exercise recovery, terminal export and captive decisions through the normal load interface. The checklist below remains the release acceptance gate: Windows desktop playthroughs and large-colony performance/soak validation are still outstanding.

## 9. Raid feature implementation overview

The core raid overhaul is merged ([#58](https://github.com/Rengerams/wilderfolk/pull/58)). The implementation includes:

- [x] **Battle lifecycle:** incoming defense and outgoing expeditions progress through saved phases; casualties and deployed troops persist.
- [x] **Defeat and survival:** settlement damage, food/repair recovery and a distinct terminal outcome when last resistance fails.
- [x] **Post-victory choices:** the defeated rival remains until mercy, tribute or razing is chosen; confirmed razing removes the rival permanently.
- [x] **Captives:** adult fighters can be imprisoned, released, recruited voluntarily or executed with distinct outcomes.
- [x] **Persistent aftermath:** graves, named casualties, family consequences, Chronicle and save/worker transitions retain the battle outcome.
- [x] **Diplomacy and leadership:** witnessed reputation effects and bounded earned merit apply once to a real outcome.
- [x] **Wartime social context:** consequences of surrender and prisoner decisions reflect current war and resident values ([#70](https://github.com/Rengerams/wilderfolk/pull/70)).
- [ ] **Advanced simulated siege outcomes:** optional deeper aggregate gate/wall breach and fortification-damage consequences, plus clearer aftermath reporting, remain future scope. Existing Watchtowers and passive tower upgrades are implemented. No active tower fire, real-time unit combat or tactical minigame is planned.

## 10. Implemented warfare scope

The merged warfare implementation includes the combat lifecycle, player choices, aftermath and recovery, reputation and election consequences, and persistent saves. Watchtowers already contribute passive defense strength and detect approaching raiders. Any additional siege depth belongs to abstract simulation results and post-battle explanations, not real-time fighting (§9, §13).

## 11. DNA traits — strengths, weaknesses and whole-game influence

Every inherited DNA/personality trait must have meaningful **positive (+)** and **negative (−)** influences. Traits should affect the entire simulation wherever relevant, rather than being cosmetic labels or bonuses limited to one profession. A strong settler may excel at physically demanding mining while an insightful/intuitive settler may do better at teaching or research, but each advantage comes with a plausible trade-off.

### 11.1 Core gameplay rules

- Keep the existing **three inherited traits from the pool of fourteen** as the character's identity. Build the new modifiers around the current DNA/trait ownership, not a second unrelated stat generator.
- Give **each of the fourteen traits at least one benefit and at least one drawback**, documented in one authoritative, typed modifier table. Do not assume a trait name is the same as an existing numeric attribute; review existing behavior before choosing modifiers.
- Apply trait modifiers to **all relevant systems**: resource production, mining, lumber, farming, fishing, hunting, crafting, construction, teaching, learning, research, healthcare, leadership, diplomacy, trading, combat, defense, movement, fatigue, social bonds, parenting and other activities where a meaningful connection exists.
- Effects must reflect **what the character is actually doing**. A mining bonus applies while mining, not to every job; teaching aptitude should help education, not magically increase unrelated production.
- Distinguish **efficiency, output quality, accuracy, experience gain, energy/fatigue, risk and social effects**. Not every bonus should be a flat production multiplier.
- Make bonuses and penalties **transparent in the character inspector and workplace details**, including the source trait and expected effect. Do not rely on color alone to distinguish + from −.
- Preserve meaningful personality diversity: there should be **no universally best DNA combination**, and a character with an apparent occupational disadvantage can still learn and succeed.
- Inheritance remains stable; do not reroll existing settlers' DNA when old saves are loaded. Modifiers are derived from the traits already stored in the save.

### 11.2 Examples to balance (not final stats)

| Trait / aptitude example | Positive influence | Negative influence / trade-off |
|---|---|---|
| Hardy / physically strong | More effective mining, quarrying and heavy construction; resists physical fatigue | Less suited to delicate precision tasks or slower to recover from overexertion, depending on balance |
| Insightful / naturally analytical | Better teaching, research and learning | Can be less productive at repetitive manual work or tire more quickly in physically demanding work |
| Brave | More effective defense and dangerous expeditions | Higher risk-taking can increase injury or reckless decisions |
| Timid | More cautious in risky situations; can avoid harm | Lower willingness or effectiveness in battle and dangerous jobs |
| Greenthumb | Better farming and ecosystem stewardship | Less effective outside nature-related work |
| Gregarious | Stronger social ties, negotiation and trade | May be distracted in solitary, precision-focused tasks |

The table illustrates the intended *design pattern*, **not the final canonical mapping**. The final implementation must explicitly cover **all fourteen existing traits** (Hardy, Brave, Gregarious, Timid, Greenthumb, Lucky, Nurturing, Insightful, Chivalrous, Resourceful, Stoic, Graceful, Intuitive and Fierce) with distinct benefits and drawbacks. Avoid simplistic or implausible disadvantages added solely to force symmetry; use context-dependent opportunity costs when appropriate.

### 11.3 Stacking, skill and balance

- Combine three traits through a **bounded, deterministic formula**; prevent extreme stacking from breaking production, combat or education. Consider diminishing returns for related effects.
- Traits represent **aptitude**; job skill, training, tools, buildings, conditions and available resources still matter. A high-skill miner without Hardy DNA should remain viable, and a strong novice should not outperform a trained expert automatically.
- Positive and negative effects apply symmetrically to player settlers and comparable simulated characters where that mechanic exists.
- Derive effective values on demand or via owned caches; avoid recomputing every modifier in hot loops or persisting redundant derived numbers in large save files.
- Expose traits in hiring/worker assignment decisions as **recommendations, not compulsory job restrictions**. Players retain control over where settlers work.
- Log only noteworthy trait-driven events, not constant per-tick noise.

### 11.4 Compatibility and rollout

- **Existing saves remain compatible:** retain DNA, skills, relationships, residences and careers. Loading an old save simply activates the new derived trait modifiers; no retroactive reroll or skill reset.
- Centralize the effects in a typed trait-modifier owner and integrate with existing skill, staffing, output, movement, relationship, education, combat and diplomacy rules instead of copying calculations into interfaces.
- Audit all fourteen traits and each gameplay system for coverage, with a documented no-effect rationale where a trait logically does not apply.
- Add unit tests for each trait's +/− modifiers, combinations, effect caps, apprentice/education interactions, and modifiers on actual simulated actions; run long-population performance and save/load regression tests.
- Check outcomes across differently skilled settlers and multiple generations to ensure inheritance matters without creating an unbeatable lineage.

**Definition of done:** players can inspect a settler and understand *why* their DNA makes them better at certain activities and worse at others, and these strengths and weaknesses are measurably present throughout relevant game systems.


### 11.5 Personality shapes an entire life — not just a job

DNA affects **what a settler cares about, who they connect with and which choices they tend to make**. It must integrate with the existing friendship, feud, courtship, marriage, affair, parenting, leisure and life-event owners rather than adding a disconnected random-behavior system.

- **Personal priorities:** traits influence how a settler balances family, romance, friendship, ambition, work, safety, status, community, faith or solitude when competing opportunities arise. These are tendencies, not an identical schedule for every character with the same trait.
- **Friendship:** compatibility, shared values, time together and past experiences affect how quickly friendships start, deepen or fade; trait clashes may create believable tension without predetermining feuds.
- **Romance and fidelity:** traits influence attraction, attachment, loyalty, impulsiveness, temptation and responses to relationship dissatisfaction. **No trait guarantees cheating or guarantees faithfulness.** Existing partner bonds, personal history, opportunities and choices remain central.
- **Affairs and consequences:** distinguish temptation, choosing to begin an affair, secrecy, rumours, exposure, remorse, forgiveness, separation and reconciliation. Both participants have agency; effects ripple into spouses, children, friends, rivals and community standing.
- **Family and parenting:** settlers vary in affection, caregiving, protectiveness, time spent with children and willingness to prioritize family over professional ambition. Preserve existing child safety, age rules and school progression.
- **Social life and solitude:** some settlers seek taverns, festivals, friendships and community work; others prefer home, nature, quiet places or a small trusted circle. The town should not become one uniform crowd.
- **Reactions to events:** betrayal, death, victory, election losses, hunger, danger and acts of mercy should be interpreted through traits, relationships and personal history, changing future decisions.
- **Change over time:** experiences can shape preferences, trust and relationships even while inherited DNA stays fixed. Allow nuanced individual variation across generations.

#### Character examples (illustrative, not hard-coded outcomes)

| Example trait | Likely tendency (+) | Possible tension (−) |
|---|---|---|
| Gregarious | Seeks company, forms bonds more readily | Feels isolation more strongly; may overcommit socially |
| Nurturing | Invests in family, care and support | May neglect personal ambitions or tire from over-caring |
| Brave | Stands up for friends and partners under pressure | Can choose confrontations over compromise |
| Fierce | Strong passion, loyalty to chosen allies | More intense jealousy or impulsive conflict under stress |
| Timid | Values security and trusted, stable relationships | Hesitates to pursue romance or resolve conflict directly |
| Insightful | Notices subtle changes in others' moods | Can overthink uncertainty or become more sensitive to betrayal |
| Stoic | Remains composed in crises | May struggle to communicate feelings, even when caring deeply |

All fourteen traits need thoughtful coverage. **Avoid a direct “Fierce = cheats” or “Nurturing = never cheats” rule.** A person's actions should emerge from multiple influences, not one stereotype.

#### Decision model and feedback

1. Derive **bounded preferences and sensitivities** from the settler's three inherited traits; combine these with current mood, relationships, memories, obligations, age and available opportunities.
2. Use these values only when evaluating a **real relevant situation** (meeting a friend, deciding whether to flirt, responding to betrayal, visiting family, choosing free time). Do not randomly reroll character personalities each tick.
3. Preserve meaningful randomness through the seeded simulation RNG, with understandable probabilities and cooldowns; don't let a trait force or prohibit an outcome.
4. Maintain **reciprocity and causality**: friendships, romances and conflicts must update both sides consistently, and behaviour should not contradict existing relationships or age restrictions.
5. Expose meaningful tendencies and recent reasons in the settler inspector, without revealing every hidden probability or overwhelming the Chronicle with trivial activity.
6. Reuse existing social relationship state and history; keep saved personalities, friendships, marriages, children, affair progress and memories intact when loading older saves.

#### Feature implementation status

The whole-game personality expansion described here is still planned; existing traits and social systems are not evidence that this complete expansion has shipped.

- [ ] Apply derived DNA preferences to leisure, friendships, conflict, romance, family priorities and relationship fidelity.
- [ ] Make temptation, reactions, reconciliation and social memory context-sensitive rather than determined by a single trait.
- [ ] Display relevant personality tendencies and understandable reasons to the player.
- [ ] Preserve established histories and inherited traits when older saves activate the new behavior.
- [ ] Integrate these rules through existing social and family owners rather than a second personality engine.

**Design principle:** DNA influences *who a settler tends to become*, but lived experience and relationships decide *what they actually do*.


## 12. Raid prisoners — captivity, mercy, execution and recruitment

After a raid, the victor may capture surviving enemy combatants instead of automatically killing or releasing them. This is **separate from the choice to spare, demand terms from, or raze the rival settlement**. Prisoners are living characters with identities, affiliations and relationships where the simulation represents them individually. Abstract off-map troop losses must not be converted into invented prisoners.

**Implementation: [x] merged and accepted.** Capture, prison capacity, guard-dependent custody, individual Keep/Release/Offer to Join/Execute actions, persistence and contextual community/valley reactions are implemented by the existing warfare owners (`warPrisoners.ts`, `warPrisonerCustody.ts`, `raidAftermath.ts`, `WarfareStatus.tsx`). The following sections document existing behavior plus possible refinements; they are not separate unimplemented prisoner systems.

### 12.1 Taking captives — implemented

- Prisoners can be taken after a successful raid or a surrendered/repelled attack when survivors are available; winning does not guarantee a captive.
- Make capture depend on the outcome, survival, surrender, the forces available to escort captives, and available **Prison** capacity. Do not silently exceed cell capacity or teleport arbitrary civilians into cells.
- Record identity, faction of origin, captor, raid ID and custody state. Prisoners appear in the existing prison roster, with distinct labels for captured raiders versus residents jailed for village offences.
- Captives remain alive, require food and guards, and can escape under the existing prison-watch mechanics. A missing guard is meaningful.
- Capture decisions and prisoner fate must survive save/load, and cannot be awarded twice when a raid event or interface is replayed.

### 12.2 What to do with prisoners — implemented

At the end of a raid, present a **Prisoners of War** decision showing identifiable captives, their condition and available prison space. Provide actions without previews of reputation, election scores or moral judgements. Allow an action for each individual or a confirmed group action when appropriate.

| Choice | Gameplay outcome | Likely valley reaction |
|---|---|---|
| **Keep imprisoned** | Captives remain in secure cells, consuming food and guard capacity; possible escape, bargaining or future release | Hostile camps may see it as a threat; long or cruel detention damages trust |
| **Release** | Let captives return to their settlement, or depart as free people if their camp no longer exists | Village support may rise, fall or remain unchanged; rival relationships and future encounters still respond |
| **Offer to join the village** | Try to persuade an individual captive to settle voluntarily; joining is **not guaranteed** | Can improve standing when genuinely voluntary, but rivals may distrust recruitment of their people |
| **Execute** | Permanently kill selected captives after a neutral confirmation and record the deaths in the battle/Chronicle | Villagers may support, oppose or ignore the decision; rival camps remember the killing and may respond through fear or grievance |

**Recruitment must be a choice made by the captive**, not an automatic conversion of enemy units into player settlers. Consider existing loyalty to home, bonds, conditions in custody, demonstrated mercy, personality, village attractiveness, and the history of the conflict. A refusal leaves the captive eligible for release or continued detention; repeated attempts must have cooldowns and diminishing chances. No prisoner decision should be universally optimal; outcomes depend on village composition and events.

### 12.3 Individual and community consequences — implemented core

- Friends and relatives may care about a captured or executed character; releasing a known captive can change diplomatic relations and future encounters.
- The player's villagers should react to cruelty or generosity, influenced by their DNA traits, personal priorities and existing social bonds. Not everyone agrees with the leader's decision.
- **Executing a prisoner is different from killing an armed opponent during combat**, but it carries no automatic local reputation or election penalty: public reaction depends on villagers, active war and recent raids. The origin settlement retains separate diplomatic memory.
- Taking civilians or children prisoner is **out of scope** for this feature; restrict capture to eligible surviving enemy combatants and guard against age-inappropriate actions.
- Captured enemies and executed prisoners **are not buried in the player's Graveyard**. Their names remain in the raid overview and Chronicle, with enemy labels distinct from villagers.
- Prisoners may have an opportunity to join the player's settlement only as **adult, willing recruits**; on joining, carefully migrate faction, occupancy, employer eligibility, relationship links, and village citizenship without cloning the entity.

### 12.4 Valley-wide reputation and political consequences — implemented core

The valley remembers **how a victory was handled**, not just who won:

- **Capture rather than kill in battle:** a modest mercy signal when real surrender was accepted.
- **Humane custody / later release:** improved trust and potential diplomatic openings.
- **Voluntary integration:** potential goodwill among some settlements and resentment among others, based on prior relationships and whether the recruit chose freely.
- **Execution after surrender:** rival fear and grievances can increase, while local civic standing may rise, fall or stay neutral depending on current threats and resident traits.
- **Repeated executions:** persistent rival history can increase retaliation risk; later releases cannot erase existing diplomatic memories.
- Reactions should be mediated by witnesses, reputation propagation and each rival's relationship with the player, rather than changing every faction uniformly or instantly.
- Leadership merit and election support must reflect villagers' reactions, not simply award positive points for capturing or killing opponents.

### 12.5 Prisoner interaction design — individual actions implemented

- Include a **post-raid outcome panel** with casualty lists (player names green, enemy names red) and a separate **Captured** section for survivors; never render a captured or released character as dead.
- Provide **Keep**, **Release**, **Offer to Join** and **Execute** actions with clear availability rules and visible consequences.
- Require a **neutral confirmation for execution** that identifies the captive without outcome predictions, penalties or moral commentary.
- Show why a recruit refuses, why no prison place exists, or why an option is unavailable.
- Do not force players to resolve every captive immediately if the game can persist a pending choice; however, ensure a sensible, safe custody default.
- Avoid breaking the game when a captured character's home settlement is destroyed in the same raid; release, recruitment and imprisonment must still remain logically consistent.

### 12.6 Existing integration and game-state transitions — implemented

- Reuse existing **Prison** capacity, guard shifts, escape rules, citizenship/faction owners, relationship rules, Chronicle and diplomacy systems; do not create a disconnected prison simulation.
- Model captured, imprisoned, released, recruited, escaped and executed as explicit, validated transitions, with one durable event ID per decision.
- Prevent duplicate captures, invisible prisoners, prisoner-as-guard staffing, repeated execution, repeated recruitment rewards, capacity overflow and save/load rerolls.
- Test incoming and outgoing raids, prisons full/empty, surrender, no available survivors, leader changes, camp destruction, prisoner escapes, release, refusal to join and successful voluntary integration.
- Verify diplomacy and leadership merit respond to each distinct choice exactly once, and persist correctly after reload.
- Test large raids and large settlements without per-render full-population scans.

**Definition of done:** the player can take legitimate combatant prisoners, choose their fate, see individual and valley-wide consequences, and potentially gain willing new villagers—while every decision respects existing prison capacity, living characters, social systems and save compatibility.


## 13. Roads, walls and towers — implemented construction, navigation and passive defense

The player should be able to build an attractive, connected settlement where roads genuinely guide travel and walls and towers genuinely defend it. Construction must feel precise and rewarding: visually connected pieces, useful previews, understandable costs, and predictable behavior after placement.

**PR #59 merged and is accepted (27 October 2026), with corrective PRs #65 and #66 also merged.** Road terrain policy, physical junction footprints, bridge-only water clearance, exact road-surface speed, gate replacement accounting and legacy infrastructure round trips are implemented. The annual check, scripts typecheck and three-zoom browser inspection now pass; full responsiveness at 1,800 settlers and a real historical save are not required for this PR; test evidence is recorded in the infrastructure implementation brief.

### 13.1 Road building and editing

- Support intuitive **click-and-drag road painting** with straight runs, corners and optional route preview; avoid having to place every individual tile.
- Allow road placement to snap cleanly to the terrain grid and connect to existing roads, junctions, bridges, gates and building entrances.
- Show before confirmation the proposed path, tile count, resource cost, blocked segments, slopes, bridge requirements and whether the connection actually reaches a destination.
- Provide easy removal, replacement, upgrades and repairing without accidentally demolishing unrelated structures.
- Distinguish planned, under-construction, completed, damaged and blocked roads; builders must complete segments in an understandable order.
- Let players choose sensible road widths/types when supported by gameplay; avoid offering cosmetic variants that break route connectivity.
- Construction tools must handle long roads without huge material costs being charged repeatedly on pointer movement or after cancelling a preview.

### 13.2 Roads must actually affect settlement life

- Settlers should **prefer usable roads** when they provide a faster route, but may walk off-road when appropriate; do not force ridiculous detours to stay on paths.
- Road travel time depends on traversable terrain and actual completed road/bridge surfaces through the existing pathfinding and movement rules.
- Roads should improve access to workplaces and services (schools, hospitals, wells, emergency response), not merely increase a vague settlement-wide score.
- Bridges and gates must be genuine traversable connectors. A visually continuous road is **not** necessarily a reachable one if a gate is locked or the bridge is damaged.
- Provide an **accessibility / route-debug overlay** showing disconnected buildings and unreachable walking routes.
- Keep pathfinding performant in villages with 1,800+ settlers: graph updates on construction changes, bounded searches, caching/invalidation and no whole-map recalculation every tick.

### 13.3 Better road graphics

- Use visually seamless **auto-tiling** for straight sections, bends, T-junctions, crossroads, dead ends, bridge joins and connections to building doors.
- Make road edges fit the terrain with believable dirt, cobblestone, paving and subtle vegetation transitions as appropriate to the selected type.
- Align bridges, slopes, shadows, lighting and isometric perspective with the current world art style.
- Keep the collision/navigation footprint aligned with the graphic: no road that looks walkable but is blocked, and no hidden gaps at corners.
- Rendering and auto-tiling must update when neighboring tiles are placed, upgraded, damaged or removed.

### 13.4 Buildable walls, gates and existing Watchtowers

- Improve **wall drawing** with drag placement, automatic connected sections, corners, end caps and clear snapping to gates, towers and existing fortifications.
- Preview resource costs, construction time, collision and whether a proposed wall actually seals an approach; warn clearly about unconnected gaps.
- Offer functional **gates** through walls so villagers, merchants and militia can enter or leave; gate state must affect routes and attack behavior consistently.
- [x] **Existing Watchtowers:** placeable buildings with a passive barricade bonus (+15, or +27 after forged Tower Ballistae) and early warning of marching raiders within 260 world units. These are simulated bonuses, not weapon ranges or line-of-sight projectile attacks. Tower staffing is not a requirement for this passive bonus.
- Allow repair and rebuilding after raids; damage should visibly affect wall and tower condition.
- Keep construction rules coherent at waterways, cliffs, bridges and steep terrain so fortifications cannot exploit invalid or inaccessible placements.

### 13.5 Fortifications in simulated raids — no real-time battles

- **Simulation-only combat:** raids resolve through existing aggregate combat and outcome rules. The player does not manually fight, towers never fire projectiles, and there is no real-time tactical battle or physical wall-breaching minigame.
- [x] **Existing passive defense:** completed Watchtowers already raise simulated barricade strength, and forged Tower Ballistae increase that value. Watchtowers also provide early raid detection.
- [x] **Existing infrastructure:** road/wall/gate connectivity and collision apply to normal map movement; these are not evidence of simulated projectiles or active tower targeting.
- [ ] **Optional deeper siege outcomes:** if expanded, use the existing raid owner to determine abstract gate/wall damage, breach severity and recovery effects once per raid. Describe causes in the battle report without creating an active tactical combat layer.
- Keep fortified towns harder to defeat within the v0.6.5.2 devastation model, while allowing extreme defeats and meaningful recovery.
- Avoid double-counting the already implemented tower/wall barricade bonuses or creating a second independent combat resolver.

### 13.6 Building UX and visual polish

- One coherent construction tool family for roads, walls, gates and towers, with predictable rotate / drag / confirm / cancel / demolish behavior.
- Clearly show the footprint, entrances, range, terrain obstructions, required materials and connectivity **before** committing construction.
- Draw clear construction and upgrade stages, material changes, scaffolding/damage and completion transitions.
- Display concise, factual explanations such as *Disconnected road*, *Gate blocks route*, *Watchtower provides passive defense*, *No resources*, or *Blocked terrain*. Do not imply tower guards, projectile range or active firing.
- Maintain legible outlines, shadows, sorting and selection hitboxes at varying zoom levels and when structures overlap vegetation.
- Make any optional decoration or visual quality controls independent of the underlying pathfinding/combat simulation.

### 13.7 Save compatibility and implementation

- Keep old saves compatible: existing roads, walls, bridges, gates and towers must retain their identity, location, health, upgrades and assigned workers.
- Derive any new adjacency/autotile/route caches on load; do **not** replace placed infrastructure or change valid paths without an explicit migration.
- Integrate with existing placement, terrain, building state, pathfinding, rendering, workforce, defense and frontier combat owners instead of creating parallel simulations.
- Test road dragging across valid/invalid tiles, costs/refunds, crossings, bridges, junctions, undo/cancel, demolition, map borders and terrain changes.
- Preserve pathfinding correctness before and after construction, with destroyed bridges, open/closed gates and disconnected schools or workplaces.
- Preserve the existing build, save, wall/gate navigation and simulated Watchtower bonuses. Any later siege-outcome feature should test aggregate damage, recovery and once-only outcome application, not tower range attacks or unit combat.
- Confirm visuals match pathfinding and collision, plus large-map performance at various zoom levels.
- Run save → load → simulate → save → reload regression checks using existing settlements, including large cities.

**Definition of done:** roads are easy to draw, visibly join correctly and improve travel; walls and gates retain their map/navigation roles, and existing Watchtowers contribute passive defense and early warning to simulated raids. There is no active or tactical combat layer.


## 14. Districts and neighbourhood identity

Give large settlements a sense of place without requiring micromanagement.

- Let players designate **districts** (e.g. Residential, Industrial, Farming, Civic or Defensive) with editable names and optional priorities. Districts are planning tools, not hard restrictions.
- Show each district's population, workplaces, food access, school coverage, safety, beauty and happiness.
- Add **neighbourhood identity**: residents form friendships through repeated local encounters, value well-maintained public spaces and remember major local events.
- Support district-focused policies only when they can be integrated into existing workforce and resource owners; avoid contradictory global/local overrides.
- Add a clear overlay and compact inspector, with no per-tick scanning of entire districts when nothing changed.
- Preserve all buildings and residences when upgrading an older save: unassigned buildings simply belong to the default district.

**Acceptance:** Players can understand *which part* of the city has a problem and respond locally.

## 15. Seasons, resilience and village emergencies

Make weather and seasonal preparation more meaningful, with counterplay.

- Build a clear **Seasonal Preparedness** panel showing expected food and fuel demand, shelter, healing capacity and critical supply buffers.
- Add rare, telegraphed **local emergencies** appropriate to the simulation: building fires, blocked roads, storm damage or illness pressure. No unavoidable random village wipeouts.
- Builders, guards and available workers can be assigned **emergency priorities** such as repairing a bridge, containing fire or restoring essential facilities.
- Villagers react to dangerous conditions based on their traits, family bonds and practical ability; children should not automatically be assigned dangerous work.
- Chronicle reports noteworthy emergencies, successful rescues and recovery, without flooding the log with small events.
- Tie emergency routing to real roads, gates, walls and reachable destinations.

**Acceptance:** A prepared player has understandable ways to prevent or mitigate harm, and recovery remains possible.

## 16. More meaningful professions, education and career paths

Build on age-18 adulthood and the selective apprenticeship rules.

- School remains available from **ages 6–17**; formal graduation and adult employment begin at **18**.
- Let adult settlers develop a **work history**: experience in trades, notable successes and training milestones. Skills and DNA aptitude both matter, but neither permanently locks a person into a profession.
- Offer **optional apprenticeships** to qualified young adults when a suitable master, capacity and opportunity exist. Ordinary employment remains a valid and common path.
- Add sensible **career progression** for experienced teachers, medics, craftspeople, builders and defenders, using existing job skill and leadership systems.
- Show the player a short **Why this worker?** explanation when matching vacancies: skills, distance, availability, interests and relevant DNA benefits/penalties.
- Avoid automatically moving every highly skilled settler to a different job or sending every graduate into an apprenticeship.
- Add tests for progression, transfers, unemployment, reaching age 18 and reloads of old colonies.

**Acceptance:** Two settlers can pursue different, credible life paths even when they are the same age and went to the same school.

## 17. Simulation performance and large-colony scalability

Preserve responsiveness as population and roads grow.

### 17.1 Measure before optimizing

- Create repeatable benchmarks for **250, 750, 1,800 and 3,000 settlers** on equivalent hardware and seeds, with browser and Windows desktop profiles.
- Report **simulation tick duration (p50/p95/p99), dropped/over-budget ticks, UI frame time, render time, memory use and save/load duration** separately.
- Use the existing performance profiler as the source of measurement; track before/after results for every major change.
- Define a performance budget around the game's **one-second tick at 1×**, while ensuring UI animation stays responsive independently.

### 17.2 Targeted improvements

- **Incremental spatial indexing:** use cached neighbourhood queries for social encounters, schooling, workplace selection, prisons, combat and services. Invalidate only affected regions.
- **Event-driven building caches:** update housing, road connectivity, staffing availability and service coverage when relevant structures or assignments change.
- **Pathfinding jobs:** prioritize nearby/visible or time-sensitive routes, cache shared routes, coalesce repeated requests and set bounds for unreachable destinations.
- **Rendering:** cull off-screen terrain and decorations; batch identical assets where the renderer permits; prevent unnecessary React inspector rerenders and costly object allocation during drawing.
- **Tick workloads:** spread nonurgent scans over several ticks while retaining predictable daily effects and correct game outcomes.
- **Worker transfers:** reduce redundant serialization and large state copies between simulation and UI; use deltas carefully and test worker fallback equivalence.
- **Memory and garbage collection:** reuse transient buffers, bound event histories and caches, and clean up entity links after deaths or building removal.
- **Saves:** profile serialization size and time, retain a versioned migration path, and perform safe atomic/validated writes where the platform allows.

### 17.3 Do not trade correctness for speed

- Maintain deterministic gameplay for a given seed and action sequence where the engine currently guarantees it.
- Avoid a simulation that behaves differently simply because the camera is elsewhere or the game is minimized.
- No optimization may skip a school day, duplicate production, lose a family relation or silently skip an incoming raid.
- Add long-run soak tests, headless simulation invariants, profiler regression thresholds and **load → simulate → save → reload** checks using real large-colony saves (with appropriate fixture size controls in CI).
- Document actual benchmark improvements instead of claiming speed gains without measurements.

**Acceptance:** Large colonies have fewer long-frame stalls and stable memory use, while simulation outcomes remain correct and reproducible.

## 18. Player tools: explainability, alerts and safe automation

Improve usability without making the game play itself.

- Add a **Why is this happening?** detail for production, housing, school seats, inactivity, unemployment, road access and defensive strength; ground explanations in live simulation data.
- Let players configure meaningful **alerts**: food reserves below target, a school without a teacher, houses without road access, unguarded prisons, approaching enemies and damaged fortifications.
- Support an optional **Repair Priority queue** for roads, bridges, gates, towers and essential buildings, with clear resource requirements and manual overrides.
- Provide a **Before / After** preview for policy or construction changes when reliable estimates can be computed; mark uncertain predictions as estimates.
- Add fast filters and bulk-selection controls that remain responsive with thousands of residents and hundreds of buildings.
- Keep notifications concise, accessible and rate-limited; do not fill the Chronicle with repetitive alerts.

**Acceptance:** The game tells the player both *what* is wrong and *what they can do about it*, without confusing predictions with certainties.

## 19. Feature implementation order

Suggested implementation sequence to reduce integration risk:

1. **Foundation:** benchmarks, event IDs, stable save migrations and shared typed APIs for traits, pathfinding and outcomes.
2. **Simulation reliability:** incremental caches, performance profiling and save/load regression coverage.
3. **Infrastructure:** road construction, connections, gates, walls and tower interactions (issue #49).
4. **Village life:** human physiology and food-economy balance (issue #61), districts, careers and personality-driven priorities.
5. **Warfare:** raid states, prisoner decisions, diplomacy, leadership merit and consequences.
6. **Polish:** graphics, overlays, tutorials, accessibility, balancing and real-game playtesting.

Split these milestones into independently testable changes with regression coverage and save compatibility checks. **Accepted foundation PRs:** #40 (housing), #58 (warfare), #59/#65/#66 (roads, walls and gates), #62 (human needs), #63 (terrain), #64 (state-copy performance), #67 (ownership cleanup), #68 (compatibility migration). Later release goals are distinct from acceptance of these merged PRs.


## 20. Human needs and food economy — Issue #61 (26 October 2026)

**Priority:** high. **Implementation: [x] MERGED AND ACCEPTED (27 October 2026; PR #62).** [Issue #61](https://github.com/Rengerams/wilderfolk/issues/61) preserves the original design and [PR #62](https://github.com/Rengerams/wilderfolk/pull/62) contains the accepted implementation. Unchecked items below are post-merge validation/extension targets, **not** an unaccepted or draft PR.

**Goal:** replace the combined player-human `energy` hunger/exhaustion model with three independent, serialized needs (**nutrition**, **rest**, **stamina**) integrated into existing health, activity, attendance, work output, food, death, persistence and UI. Preserve nonhuman energy rules and prevent visitors/rivals from charging the player's larder.

### 20.1 One authoritative physiology and behavior pipeline

- [x] **Canonical saved state:** bounded, normalized 0–100 nutrition/rest/stamina with old-save migration, deterministic worker delta/save round-trip and explicit Moonhowler/human transformation behavior. Do not save redundant derived statuses or keep two writable stamina representations.
- [x] **Exactly one update per interval:** advance physiology from observed elapsed sim time, duty, activity/movement and *verified* sleep once per player human before offscreen throttling. Ensure fast-forward, camera visibility, save/reload and worker execution cannot change physiological or food outcomes.
- [x] **Distinct effects:** nutrition drains over time and effort, food restores only nutrition; rest drains while awake and recovers only during eligible sleep, including off-shift sleep; stamina drains with exertion and recovers through actual breaks/inactivity/sleep. No instant death from one missed meal, zero stamina, or lack of sleep.
- [x] **Decision/action split:** deterministic nutrition, sleep and break intents with enter/exit thresholds and hysteresis; existing movement, emergency, labor, housing/hotel occupancy, ledger, hospital and death owners enforce feasible actions. Avoid repeated eating, fake sleep, flickering intents and lost emergency priorities.
- [x] **Work/health integration (implemented; further long-run tuning remains):** retain real attendance, `scheduleFatigue` as a distinct workload measure, and appropriate health/production consequences without stacking duplicate fatigue penalties. Reconcile legacy perks, wounds, exposure, wells and activity modifiers.

### 20.2 Food economy and quantitative calibration

- [x] **Atomic meals:** one successful inventory debit in the existing food ledger restores nutrition exactly once; failed meals do nothing. Replace the legacy energy-threshold meal rule, prevent repeated per-tick consumption and eliminate duplicate daily food charges.
- [ ] **Food and needs balancing improvements:** refine meal quantities, sleep, stamina, and prolonged deprivation using the existing physiology/food model.
- [x] **Production and forecast reconciliation:** derive colony food demand, production, spoilage, stock depletion, reserve-days forecast and automated farm planning from consistent parameters and observed worker output, for adults/children and special duties. Update planning/UI assumptions if actual demand differs.

### 20.3 Acceptance and merge gate

- [x] Present three independent needs and grounded reasons for eat/sleep/break/work interruptions in the settler inspector/status; UI must not mutate authoritative needs.
- [x] **PR acceptance:** #62 merged into `main` on 27 October 2026 and is accepted by the project owner.

**Definition of done:** villagers eat, sleep and rest for different reasons; starvation is gradual and meaningful; work and health respond coherently; food consumed matches food planned and produced; old saves, worker mode, offscreen simulation and nonhuman energy retain their established behavior. Issue #61 is the detailed specification where this roadmap is a summary.

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
| Terrain relief and 2.5D display | [#76](https://github.com/Rengerams/wilderfolk/pull/76), [#77](https://github.com/Rengerams/wilderfolk/pull/77) | Ridgeline and valley shading, elevated cached mesh chunks, grounded vegetation and accurate inverse-picking of raised surfaces | `src/game/terrainAtlas.ts`, `docs/TERRAIN_HEIGHT_MESH.md` |
| Biome transitions and nature artwork | [#79](https://github.com/Rengerams/wilderfolk/pull/79) | Climate-weighted ecotones, textured vegetation and bundled licensed terrain/nature assets for new generation-v4 maps | `src/game/renderer/`, `public/sprites/nature/`, `THIRD_PARTY_NOTICES.md` |
| CI workflow configuration | [#74](https://github.com/Rengerams/wilderfolk/pull/74) | Node workflow dependency caching and lockfile setup corrected | `.github/workflows/` |

### 21.1 Feature backlog beyond merged scope

These describe **unimplemented or incomplete feature scope**, not test activities. Previously merged implementations remain accepted.

- [ ] **Whole-life DNA personalities:** contextual leisure, relationships, fidelity, parental priorities and persistent experiences (§11).
- [ ] **District identity:** neighborhoods, local amenities and meaningful residential identity (§14).
- [ ] **Seasons and emergencies:** deeper seasonal resilience, disasters and village responses (§15).
- [ ] **Professions and education:** expanded careers, meaningful skill development and settlement specialization (§16).
- [ ] **Additional scalable simulation architecture:** incremental topology/cache updates, event-driven heavy workloads and bounded worker transfers (§17).
- [ ] **Player explainability:** actionable alerts and clear reasons for autonomous decisions (§18).
- [ ] **Optional deeper simulated siege outcomes:** additional aggregate gate/wall damage and breach consequences with clearer battle reports, within the existing raid simulation (§13). Watchtowers and their defensive bonuses are already implemented; no active tower fire or real-time combat.

### 21.2 Canonical document and implementation boundary

The root `roadmap_V.0.6.5.2.md` is canonical. The redundant `docs/` roadmap copy was removed to prevent contradictory status reports. Older architecture descriptions retain historical value, but pre-merge draft language must not override accepted merged implementation.
