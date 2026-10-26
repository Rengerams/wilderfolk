# Wilderfolk v0.6.6.0 — Warfare, Survival & Reputation Roadmap

**Target version:** 0.6.6.0  
**Scope:** Raid gameplay, settlement destruction and recovery, player choices, valley diplomacy, named battle casualties, and leadership merit.

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
- [ ] Verify the live world-map UI in browser and Windows desktop builds; automated checks alone do not complete this gameplay gate.
- [ ] Advance active battles on **game-hour ticks**, independently of daily rival growth/diplomacy/cooldowns. Battle duration is a separate named tuning value; six game hours is proposed for playtesting, not implemented by the founding change.
- [ ] Repair deployment cleanup when an expedition is cancelled or its rival is razed, and clear declared-war state when peace is signed. These remain separate audit findings.

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
| **Demand tribute / Terms** | Rival survives under a defined agreement, resources or truce; refusal may be possible if the terms are unreasonable | Mixed reputation; potential ongoing revenue, resentment and future instability |
| **Raze the settlement** | Rival is permanently eliminated, its remaining structures/events are removed; survivor/refugee outcome must be handled explicitly | Strong negative mercy/diplomacy effect, fear in hostile camps, increased tension or retaliation |

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
| Spare a surrendered rival | **+10 civic prestige** | Additional diplomacy/reputation gain, not a second military victory |
| Reckless offensive defeat | **−20 to −40** | Significant avoidable losses |
| Devastating failed defense | **−25** | Unless circumstances merit a different assessment |
| Raze a surrendered rival | **No automatic civic bonus** | Military success already scored; valley reputation receives the consequence |

These numbers are **proposals**, not current game mechanics. The current election-merit model already combines career, leadership record and other factors, so add these through the established election owner instead of creating a parallel uncapped score.

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
10. **Versioning/docs:** ship this only when verified; move future features from this roadmap into v0.6.6.0 release notes once working.

## 9. Test and acceptance checklist

- [ ] Incoming raid repelled: appropriate losses and supplies; no settlement destruction.
- [ ] Incoming defeat: village survives with persistent, recoverable damage.
- [ ] Overwhelming incoming breach: valid terminal settlement result, reliable end screen and archived save.
- [ ] Strong attackers **cannot** wipe an intact city purely from an attacker/defender ratio.
- [ ] Outgoing overwhelming victory: rival still exists while the player decision is pending.
- [ ] Mercy: rival survives; diplomatic outcome persists.
- [ ] Tribute/terms: meaningful, enforceable implementation; no fake option.
- [ ] Raze: second confirmation, one permanent deletion of rival and its queued events, appropriate reputation change.
- [ ] Reload during the post-battle decision: player is prompted again; no duplicate loot/casualties.
- [ ] Raid overview: named village dead green; named enemy dead red; off-map losses displayed without fake names.
- [ ] Graveyard never stores new enemy records; older saves are handled consistently.
- [ ] Defending leader gains substantial, bounded election merit; successful offensive raid grants a smaller risk-adjusted reward.
- [ ] All leadership/reputation rewards occur once per unique battle.
- [ ] Families, buildings, Chronicle, notifications and save/load remain consistent after victory, defeat and destruction.
- [ ] Performance: large settlements remain responsive during an active raid; no per-frame scans of all entities for the casualty panel.
- [ ] Automated unit and integration tests plus a real Windows desktop and browser playthrough pass.

## 10. Definition of done

v0.6.6.0 is ready to announce these mechanics only when **the game logic, user choice, visual feedback, recovery/game-over flow, reputation consequences, leadership scoring, persistence, automated tests and actual gameplay checks** all agree.

**No gameplay changes are made by this roadmap document.**

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

### 11.4 Compatibility, rollout and tests

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

#### Acceptance criteria

- [ ] Two settlers with different DNA but similar circumstances display measurably different patterns of leisure, friendships, family priorities and romance over long simulations.
- [ ] Cheating is possible but not predetermined by any single trait; faithful relationships remain common and credible.
- [ ] Traits influence affair-related temptation and reactions, **without bypassing adulthood or existing consent/relationship guards**.
- [ ] Friendship formation, decay, feuds, reconciliation and family care remain consistent and non-duplicated.
- [ ] Important events create persistent, understandable consequences instead of one-off random text.
- [ ] Players can see why settlers value different things, without micromanaging every personal decision.
- [ ] Loading v0.6.5.1 saves retains existing relationship histories and activates new derived tendencies without rerolling DNA.
- [ ] Large colonies retain acceptable performance through per-event decisions, cached context and bounded social updates.

**Design principle:** DNA influences *who a settler tends to become*, but lived experience and relationships decide *what they actually do*.


## 12. Raid prisoners — captivity, mercy, execution and recruitment

After a raid, the victor may capture surviving enemy combatants instead of automatically killing or releasing them. This is **separate from the choice to spare, demand terms from, or raze the rival settlement**. Prisoners are living characters with identities, affiliations and relationships where the simulation represents them individually. Abstract off-map troop losses must not be converted into invented prisoners.

### 12.1 Taking captives

- Prisoners can be taken after a successful raid or a surrendered/repelled attack when survivors are available; winning does not guarantee a captive.
- Make capture depend on the outcome, survival, surrender, the forces available to escort captives, and available **Prison** capacity. Do not silently exceed cell capacity or teleport arbitrary civilians into cells.
- Record identity, faction of origin, captor, raid ID and custody state. Prisoners appear in the existing prison roster, with distinct labels for captured raiders versus residents jailed for village offences.
- Captives remain alive, require food and guards, and can escape under the existing prison-watch mechanics. A missing guard is meaningful.
- Capture decisions and prisoner fate must survive save/load, and cannot be awarded twice when a raid event or interface is replayed.

### 12.2 What to do with prisoners

At the end of a raid, present a **Prisoners of War** decision showing how many identifiable captives were taken, their condition, available prison space and the diplomatic consequences of each action. Allow an action for each individual or a confirmed group action when appropriate.

| Choice | Gameplay outcome | Likely valley reaction |
|---|---|---|
| **Keep imprisoned** | Captives remain in secure cells, consuming food and guard capacity; possible escape, bargaining or future release | Hostile camps may see it as a threat; long or cruel detention damages trust |
| **Release / Show mercy** | Let captives return to their settlement, or depart as free people if their camp no longer exists | Increases mercy and trust, may improve relations, but former enemies could return later |
| **Offer to join the village** | Try to persuade an individual captive to settle voluntarily; joining is **not guaranteed** | Can improve standing when genuinely voluntary, but rivals may distrust recruitment of their people |
| **Execute** | Permanently kill selected captives after explicit confirmation and record the deaths in the battle/Chronicle | Major negative effect on trust and mercy, increases fear, may trigger resentment, retaliation or diplomatic isolation |

**Recruitment must be a choice made by the captive**, not an automatic conversion of enemy units into player settlers. Consider existing loyalty to home, bonds, conditions in custody, demonstrated mercy, personality, village attractiveness, and the history of the conflict. A refusal leaves the captive eligible for release or continued detention; repeated attempts must have cooldowns and diminishing chances. Never present execution as the most efficient universal choice.

### 12.3 Individual and community consequences

- Friends and relatives may care about a captured or executed character; releasing a known captive can change diplomatic relations and future encounters.
- The player's villagers should react to cruelty or generosity, influenced by their DNA traits, personal priorities and existing social bonds. Not everyone agrees with the leader's decision.
- **Executing a prisoner is different from killing an armed opponent during combat** and should carry a distinctly greater reputation penalty.
- Taking civilians or children prisoner is **out of scope** for this feature; restrict capture to eligible surviving enemy combatants and guard against age-inappropriate actions.
- Captured enemies and executed prisoners **are not buried in the player's Graveyard**. Their names remain in the raid overview and Chronicle, with enemy labels distinct from villagers.
- Prisoners may have an opportunity to join the player's settlement only as **adult, willing recruits**; on joining, carefully migrate faction, occupancy, employer eligibility, relationship links, and village citizenship without cloning the entity.

### 12.4 Valley-wide reputation and political consequences

The valley remembers **how a victory was handled**, not just who won:

- **Capture rather than kill in battle:** a modest mercy signal when real surrender was accepted.
- **Humane custody / later release:** improved trust and potential diplomatic openings.
- **Voluntary integration:** potential goodwill among some settlements and resentment among others, based on prior relationships and whether the recruit chose freely.
- **Execution after surrender:** strong fear and severe negative trust, with possible revenge or coalition behavior by other camps.
- **Repeated prisoner abuse:** escalating, cumulative consequences; prevent reputation laundering through trivial releases after repeated executions.
- Reactions should be mediated by witnesses, reputation propagation and each rival's relationship with the player, rather than changing every faction uniformly or instantly.
- Leadership merit and election support must reflect villagers' reactions, not simply award positive points for capturing or killing opponents.

### 12.5 Prisoner interaction design

- Include a **post-raid outcome panel** with casualty lists (player names green, enemy names red) and a separate **Captured** section for survivors; never render a captured or released character as dead.
- Provide **Keep**, **Release**, **Offer to Join** and **Execute** actions with clear availability rules and visible consequences.
- Require a **second irreversible-action confirmation for execution**, including the character's name and likely reputation impact.
- Show why a recruit refuses, why no prison place exists, or why an option is unavailable.
- Do not force players to resolve every captive immediately if the game can persist a pending choice; however, ensure a sensible, safe custody default.
- Avoid breaking the game when a captured character's home settlement is destroyed in the same raid; release, recruitment and imprisonment must still remain logically consistent.

### 12.6 Implementation and regression criteria

- Reuse existing **Prison** capacity, guard shifts, escape rules, citizenship/faction owners, relationship rules, Chronicle and diplomacy systems; do not create a disconnected prison simulation.
- Model captured, imprisoned, released, recruited, escaped and executed as explicit, validated transitions, with one durable event ID per decision.
- Prevent duplicate captures, invisible prisoners, prisoner-as-guard staffing, repeated execution, repeated recruitment rewards, capacity overflow and save/load rerolls.
- Test incoming and outgoing raids, prisons full/empty, surrender, no available survivors, leader changes, camp destruction, prisoner escapes, release, refusal to join and successful voluntary integration.
- Verify diplomacy and leadership merit respond to each distinct choice exactly once, and persist correctly after reload.
- Test large raids and large settlements without per-render full-population scans.

**Definition of done:** the player can take legitimate combatant prisoners, choose their fate, see individual and valley-wide consequences, and potentially gain willing new villagers—while every decision respects existing prison capacity, living characters, social systems and save compatibility.


## 13. Roads, walls and towers — construction, visuals and real gameplay use

The player should be able to build an attractive, connected settlement where roads genuinely guide travel and walls and towers genuinely defend it. Construction must feel precise and rewarding: visually connected pieces, useful previews, understandable costs, and predictable behavior after placement.

### 13.1 Road building and editing

- Support intuitive **click-and-drag road painting** with straight runs, corners and optional route preview; avoid having to place every individual tile.
- Allow road placement to snap cleanly to the terrain grid and connect to existing roads, junctions, bridges, gates and building entrances.
- Show before confirmation the proposed path, tile count, resource cost, blocked segments, slopes, bridge requirements and whether the connection actually reaches a destination.
- Provide easy removal, replacement, upgrades and repairing without accidentally demolishing unrelated structures.
- Distinguish planned, under-construction, completed, damaged and blocked roads; builders must complete segments in an understandable order.
- Let players choose sensible road widths/types when supported by gameplay; avoid offering cosmetic variants that break route connectivity.
- Construction tools must handle long roads without huge material costs being charged repeatedly on pointer movement or after cancelling a preview.

### 13.2 Roads must actually affect settlement life

- Settlers and carts should **prefer usable roads** when they provide a faster or safer route, but may walk off-road when appropriate; do not force ridiculous detours to stay on paths.
- Road surface quality, width, condition, congestion, weather and terrain may influence travel speed and reliability within bounded, explainable limits.
- Transporting goods from resource sites to workshops, stores, markets and residences should benefit from connected roads, where the existing logistics simulation supports that.
- Roads should improve access to workplaces and services (schools, hospitals, wells, emergency response), not merely increase a vague settlement-wide score.
- Bridges and gates must be genuine traversable connectors. A visually continuous road is **not** necessarily a reachable one if a gate is locked or the bridge is damaged.
- Provide an **accessibility / route-debug overlay** showing disconnected buildings, bottlenecks, unreachable segments and frequently travelled routes.
- Keep pathfinding performant in villages with 1,800+ settlers: graph updates on construction changes, bounded searches, caching/invalidation and no whole-map recalculation every tick.

### 13.3 Better road graphics

- Use visually seamless **auto-tiling** for straight sections, bends, T-junctions, crossroads, dead ends, bridge joins and connections to building doors.
- Make road edges fit the terrain with believable dirt, cobblestone, paving, mud, wear, wheel ruts and subtle vegetation transitions as appropriate to the selected type.
- Align bridges, slopes, shadows, lighting and isometric perspective with the current world art style.
- Show subtle signs of use and weathering without making busy towns visually noisy or obscuring characters.
- Keep the collision/navigation footprint aligned with the graphic: no road that looks walkable but is blocked, and no hidden gaps at corners.
- Rendering and auto-tiling must update when neighboring tiles are placed, upgraded, damaged or removed.

### 13.4 Buildable walls, gates and defensive towers

- Improve **wall drawing** with drag placement, automatic connected sections, corners, end caps and clear snapping to gates, towers and existing fortifications.
- Preview resource costs, construction time, collision and whether a proposed wall actually seals an approach; warn clearly about unconnected gaps.
- Offer functional **gates** through walls so villagers, merchants and militia can enter or leave; gate state must affect routes and attack behavior consistently.
- Provide intuitive tower placement and upgrading, with clear coverage/range previews, line-of-sight limits and staffing requirements where the combat model calls for guards.
- Allow repair and rebuilding after raids; damage should visibly affect wall and tower condition.
- Keep construction rules coherent at waterways, cliffs, bridges and steep terrain so fortifications cannot exploit invalid or inaccessible placements.

### 13.5 Fortifications in raids

- Walls should slow, redirect or block attackers until breached; towers should contribute defense according to real range, line of sight, garrison, equipment and condition.
- Raiders must be able to target **gates, weak sections and breach points**, rather than treating a fully enclosed city as magically invulnerable.
- Defenders need reachable positions and routes. A wall without a workable gate should not trap the entire village or create free defense points.
- The raid overview should explain which tower provided support, where a breach occurred, and how fortifications affected the result.
- Fortifications should contribute to the **v0.6.6.0 devastation model**: well-defended towns are harder to wipe out, but sufficiently strong enemies can still destroy walls and towers.
- Do not duplicate the existing aggregate militia/defense score with an unbounded second bonus. Balance physical defense effects against current combat resolution.

### 13.6 Building UX and visual polish

- One coherent construction tool family for roads, walls, gates and towers, with predictable rotate / drag / confirm / cancel / demolish behavior.
- Clearly show the footprint, entrances, range, terrain obstructions, required materials and connectivity **before** committing construction.
- Draw clear construction and upgrade stages, material changes, scaffolding/damage and completion transitions.
- Display concise explanations such as *Disconnected road*, *Gate blocks route*, *Tower has no guard*, *Outside tower range*, *No resources*, or *Blocked terrain*.
- Maintain legible outlines, shadows, sorting and selection hitboxes at varying zoom levels and when structures overlap vegetation.
- Make any optional decoration or visual quality controls independent of the underlying pathfinding/combat simulation.

### 13.7 Save compatibility, implementation and acceptance tests

- Keep old saves compatible: existing roads, walls, bridges, gates and towers must retain their identity, location, health, upgrades and assigned workers.
- Derive any new adjacency/autotile/route caches on load; do **not** replace placed infrastructure or change valid paths without an explicit migration.
- Integrate with existing placement, terrain, building state, pathfinding, rendering, workforce, defense and frontier combat owners instead of creating parallel simulations.
- Test road dragging across valid/invalid tiles, costs/refunds, crossings, bridges, junctions, undo/cancel, demolition, map borders and terrain changes.
- Test pathfinding before and after construction, a destroyed bridge, an open/closed gate, traffic congestion and a disconnected school/workplace.
- Test wall corners and gaps, tower range and staffing, raider gate attack, breach, rebuilding and a fully enclosed village.
- Confirm visuals match pathfinding and collision, plus large-map performance at various zoom levels.
- Run save → load → simulate → save → reload regression checks using existing settlements, including large cities.

**Definition of done:** roads are easy to draw, visibly join correctly and make travel/logistics better; walls, gates and towers are pleasant to construct and materially influence raids; existing villages still load and play correctly.


## 14. Village logistics — supply routes, warehouses and bottlenecks

Make transport and storage a real, readable part of managing a growing settlement.

- Introduce **delivery priorities** for food, fuel, building materials and medical supplies. Essential consumption should not be blocked by a nonessential workshop requesting the same goods.
- Give warehouses and markets meaningful **service areas** and transfer routes, integrated with the improved road network in Section 13. Avoid magically moving stock between distant buildings when the existing logistics model can represent transport.
- Provide a **Supply Routes overlay**: shortage locations, overstocked stores, disconnected producers, average delivery distance and traffic choke points.
- Allow sensible stock targets per warehouse or district, with an uncomplicated default mode for casual players.
- Villagers should notice chronic shortages and adapt their daily routines; shortages can affect morale, work and health without arbitrary sudden deaths.
- Optimize repeated producer/consumer matching with spatial indices and event-driven invalidation instead of rescanning every building for each villager.

**Acceptance:** A farm connected to a nearby market can supply it more reliably than a disconnected distant farm, and the player can see *why* a shortage occurs. Existing saves retain all stock.

## 15. Districts and neighbourhood identity

Give large settlements a sense of place without requiring micromanagement.

- Let players designate **districts** (e.g. Residential, Industrial, Farming, Civic or Defensive) with editable names and optional priorities. Districts are planning tools, not hard restrictions.
- Show each district's population, workplaces, food access, school coverage, safety, beauty, traffic and happiness.
- Add **neighbourhood identity**: residents form friendships through repeated local encounters, value well-maintained public spaces and remember major local events.
- Support district-focused policies only when they can be integrated into existing workforce and resource owners; avoid contradictory global/local overrides.
- Add a clear overlay and compact inspector, with no per-tick scanning of entire districts when nothing changed.
- Preserve all buildings and residences when upgrading an older save: unassigned buildings simply belong to the default district.

**Acceptance:** Players can understand *which part* of the city has a problem and respond locally.

## 16. Seasons, resilience and village emergencies

Make weather and seasonal preparation more meaningful, with counterplay.

- Build a clear **Seasonal Preparedness** panel showing expected food and fuel demand, shelter, healing capacity and critical supply buffers.
- Add rare, telegraphed **local emergencies** appropriate to the simulation: warehouse fires, blocked roads, storm damage or illness pressure. No unavoidable random village wipeouts.
- Builders, guards and available workers can be assigned **emergency priorities** such as repairing a bridge, containing fire or delivering food.
- Villagers react to dangerous conditions based on their traits, family bonds and practical ability; children should not automatically be assigned dangerous work.
- Chronicle reports noteworthy emergencies, successful rescues and recovery, without flooding the log with small events.
- Tie emergency routing to real roads, gates, walls and reachable destinations.

**Acceptance:** A prepared player has understandable ways to prevent or mitigate harm, and recovery remains possible.

## 17. More meaningful professions, education and career paths

Build on age-18 adulthood and the selective apprenticeship rules.

- School remains available from **ages 6–17**; formal graduation and adult employment begin at **18**.
- Let adult settlers develop a **work history**: experience in trades, notable successes and training milestones. Skills and DNA aptitude both matter, but neither permanently locks a person into a profession.
- Offer **optional apprenticeships** to qualified young adults when a suitable master, capacity and opportunity exist. Ordinary employment remains a valid and common path.
- Add sensible **career progression** for experienced teachers, medics, craftspeople, builders and defenders, using existing job skill and leadership systems.
- Show the player a short **Why this worker?** explanation when matching vacancies: skills, distance, availability, interests and relevant DNA benefits/penalties.
- Avoid automatically moving every highly skilled settler to a different job or sending every graduate into an apprenticeship.
- Add tests for progression, transfers, unemployment, reaching age 18 and reloads of old colonies.

**Acceptance:** Two settlers can pursue different, credible life paths even when they are the same age and went to the same school.

## 18. Simulation performance and large-colony scalability

Preserve responsiveness as population and roads grow.

### 18.1 Measure before optimizing

- Create repeatable benchmarks for **250, 750, 1,800 and 3,000 settlers** on equivalent hardware and seeds, with browser and Windows desktop profiles.
- Report **simulation tick duration (p50/p95/p99), dropped/over-budget ticks, UI frame time, render time, memory use and save/load duration** separately.
- Use the existing performance profiler as the source of measurement; track before/after results for every major change.
- Define a performance budget around the game's **one-second tick at 1×**, while ensuring UI animation stays responsive independently.

### 18.2 Targeted improvements

- **Incremental spatial indexing:** use cached neighbourhood queries for social encounters, schooling, workplace selection, prisons, combat and services. Invalidate only affected regions.
- **Event-driven building caches:** update housing, road connectivity, staffing availability and service coverage when relevant structures or assignments change.
- **Pathfinding jobs:** prioritize nearby/visible or time-sensitive routes, cache shared routes, coalesce repeated requests and set bounds for unreachable destinations.
- **Rendering:** cull off-screen terrain and decorations; batch identical assets where the renderer permits; prevent unnecessary React inspector rerenders and costly object allocation during drawing.
- **Tick workloads:** spread nonurgent scans over several ticks while retaining predictable daily effects and correct game outcomes.
- **Worker transfers:** reduce redundant serialization and large state copies between simulation and UI; use deltas carefully and test worker fallback equivalence.
- **Memory and garbage collection:** reuse transient buffers, bound event histories and caches, and clean up entity links after deaths or building removal.
- **Saves:** profile serialization size and time, retain a versioned migration path, and perform safe atomic/validated writes where the platform allows.

### 18.3 Do not trade correctness for speed

- Maintain deterministic gameplay for a given seed and action sequence where the engine currently guarantees it.
- Avoid a simulation that behaves differently simply because the camera is elsewhere or the game is minimized.
- No optimization may skip a school day, duplicate production, lose a family relation or silently skip an incoming raid.
- Add long-run soak tests, headless simulation invariants, profiler regression thresholds and **load → simulate → save → reload** checks using real large-colony saves (with appropriate fixture size controls in CI).
- Document actual benchmark improvements instead of claiming speed gains without measurements.

**Acceptance:** Large colonies have fewer long-frame stalls and stable memory use, while simulation outcomes remain correct and reproducible.

## 19. Player tools: explainability, alerts and safe automation

Improve usability without making the game play itself.

- Add a **Why is this happening?** detail for production, housing, school seats, inactivity, unemployment, road access and defensive strength; ground explanations in live simulation data.
- Let players configure meaningful **alerts**: food reserves below target, a school without a teacher, houses without road access, unguarded prisons, approaching enemies and damaged fortifications.
- Support an optional **Repair Priority queue** for roads, bridges, gates, towers and essential buildings, with clear resource requirements and manual overrides.
- Provide a **Before / After** preview for policy or construction changes when reliable estimates can be computed; mark uncertain predictions as estimates.
- Add fast filters and bulk-selection controls that remain responsive with thousands of residents and hundreds of buildings.
- Keep notifications concise, accessible and rate-limited; do not fill the Chronicle with repetitive alerts.

**Acceptance:** The game tells the player both *what* is wrong and *what they can do about it*, without confusing predictions with certainties.

## 20. Release gates and development order

Suggested implementation sequence to reduce integration risk:

1. **Foundation:** benchmarks, event IDs, stable save migrations and shared typed APIs for traits, pathfinding and outcomes.
2. **Simulation reliability:** incremental caches, performance profiling and save/load regression coverage.
3. **Infrastructure:** road construction, connections, gates, walls and tower interactions.
4. **Village life:** districts, logistics, careers and personality-driven priorities.
5. **Warfare:** raid states, prisoner decisions, diplomacy, leadership merit and consequences.
6. **Polish:** graphics, overlays, tutorials, accessibility, balancing and real-game playtesting.

Split these milestones into independently testable changes with regression coverage and save compatibility checks.


## 21. Code-audited performance targets and developer-only diagnostics

**Audit basis:** inspected `src/game/pathfinding.ts`, `src/game/spatialGrid.ts`, `src/game/gameLoop.ts`, `src/game/performanceProfiler.ts`, `src/components/SimulationDiagnosticsPanel.tsx`, `src/components/PerformanceProfilerPanel.tsx` and `src/App.tsx` on 19 October 2026. These are **optimization hypotheses from actual code**, not measured bottlenecks.

### 21.1 Pathfinding allocations and invalidation — high priority

- `pathfinding.ts` currently creates new `Map<number, number>` instances for A* `gScore` and `came` during searches. Benchmark allocation/GC churn under many simultaneous commuters and consider reusable generation-stamped typed arrays for dense grid indices.
- The module already has a `pathCache`; inspect its key cardinality, hit rates, invalidation on road/bridge/gate construction, and memory bounds. Avoid implementing a second cache without evidence.
- Path graph construction loops across tiles and buildings. Cache stable terrain and static obstacle layers, and incrementally patch only affected regions after placement, demolition or damage.
- Measure route-replanning frequency by settler and failure reason. Coalesce identical requests and avoid repeated searches for unreachable goals until the relevant navigation topology changes.

### 21.2 Spatial-grid update costs — high priority

- `spatialGrid.ts` keeps per-entity cell mappings and provides spatial lookups already; do not replace it with another spatial index. Profile its **full synchronization/rebuild** versus incremental position updates and stale-entity sweeps.
- Reuse scratch storage when safe; benchmark `Map`/`Set` churn against simpler indexed arrays or typed buffers.
- Group repeated neighborhood lookups within one simulation stage and reuse immutable snapshots of nearby candidates; retain correctness when entities move or die mid-tick.
- Measure with wildlife and vegetation included, not just human population, because grid density and moving populations vary dramatically by map.

### 21.3 Rendering and state-transfer bottlenecks — high priority

- `gameLoop.ts` drives a `requestAnimationFrame` render loop and exchanges simulation state with a worker. Profile worker message frequency, payload byte size, cloning cost and dropped frames.
- The repository already has `renderSnapshot.ts` and `simBuffers/renderSoAEntities.ts`/`renderBufferPool.ts`. Compare delta/SoA reuse against full snapshots before proposing a new transport.
- Profile viewport culling, per-entity sprite work, building sorting and compositing separately. Keep the existing rendering caches; optimize invalidation or hot loops that measurements identify.
- Avoid rerendering expensive inspector UI from unrelated tick changes; use stable selectors and update rates where doing so preserves timely game feedback.

### 21.4 Better performance measurement

- The existing profiler collects section totals, calls, average and max duration. Extend benchmark reporting with **p50/p95/p99** stage timings and simulation tick budgets, while keeping bounded memory.
- Compare cold startup, 5-minute warm run, accelerated simulation, active raids, large school populations, bad pathfinding situations, and save/reload.
- Run representative 250/750/1,800/3,000-settler datasets and report **actual** time saved plus correctness outcomes. Never claim a percentage improvement based solely on a code reading.
- Introduce performance regression gates with stable environment controls; avoid flaky timing assertions on shared CI runners.

### 21.5 Developer-only performance analyzer (release requirement)

**Player-facing production builds must not show a CPU profiler, diagnostics panel, or `?debug=1` backdoor.**

- Developer builds (`import.meta.env.DEV`) may display diagnostic controls and run opt-in detailed profiling.
- Production Windows installers and production web builds must hide the CPU profiler and diagnostic UI **regardless of query parameters or saved panel preferences**.
- The gameplay simulation and lightweight safety checks must continue to work in production; only developer inspection/control access is restricted.
- Ensure profiling is disabled by default, even in development, and causes no sampling overhead unless enabled.
- Follow up by **tree-shaking or conditional imports** of developer-only profiler UI/code when practical, and verify production bundle contents.
- Add release smoke tests that query `?debug=1` in production and assert the profiler/diagnostic controls remain absent, while the same tools remain usable in dev.
- README/release notes should not advertise a developer CPU analyzer as a feature available to ordinary players.

**Existing implementation (19 October 2026):** `src/App.tsx` now requires `import.meta.env.DEV` for `debugMode`; `PerformanceProfilerPanel.tsx` also returns `null` in non-development builds. Treat complete dev-only bundling and production smoke tests as still pending.

**Definition of done:** measured performance improvements with zero simulation correctness regressions and no player access to developer performance tooling in release builds.


### Performance implementation checkpoint — 20 October 2026

- [x] **21.1:** reuse generation-stamped A* score/parent storage; retain up to 4,096 routes in the existing cache with LRU eviction, target/origin validation and existing topology invalidation.
- [x] **18.2:** reuse staffing donor counts throughout rebalancing, updating eligibility after each transfer; avoid commute road scans when plain/road-speed bounds already decide eligibility.
- [x] **21.2 (partial):** synchronize the human social grid from the existing human bucket instead of scanning wildlife and vegetation too. Full spatial reconciliation remains unchanged.
- [x] **21.4 (partial):** report bounded per-stage p50/p95/p99 and one-second overruns; extend the existing population harness with fixed seeds, 250/750/1,800/3,000 tiers and optional save/reload checks.
- [x] **21.3 (command responsiveness):** expensive gameplay commands execute on the worker; bounded edits retain previews. Queued commands drain tick requests, and recovery holds simulation work off the UI thread.
- [x] **21.5 (bundling):** conditionally import developer panels only in development. Verify production output contains neither panel's unique UI strings.
- [ ] Remaining: browser/Windows timing profiles, production `?debug=1` live smoke test, long-run raid/school benchmarks, incremental terrain topology updates, worker transfer profiling, and remaining staffing/housing spikes. These are not marked complete by this checkpoint.

Measurements and limitations: `docs/plans/performance-roadmap-2026-10-20.md`.


### Housing architecture checkpoint — 25 October 2026 (PR #40)

This is a cross-cutting housing dependency for the release, not a new warfare feature. The implementation contract and detailed rules live in [docs/HOUSING_ARCHITECTURE.md](docs/HOUSING_ARCHITECTURE.md); do not duplicate the full design in this roadmap.

- [x] Consolidate ordinary housing decisions into the ordered `assignMissingResidences` pipeline with a shared `HousingLedger`: leader hold, integrity, guardianship, capacity, homeless placement, adult-child independence and commute optimization. Immediate leadership transitions retain a dedicated leader-only entry through the same move owner.
- [x] Route load, immigration and player residence reconciliation through the leader phase within the full housing ledger. Preserve prisoners' beds when capacity is rebalanced.
- [x] Set the original Leader's House to 20 fixed beds and allow at most one explicitly linked overflow annex after the main residence exceeds 20 occupants; do not promote an orphan annex to primary. The elected leader remains assigned to the original building.
- [x] Add targeted regression coverage for prisoner-bed retention, fixed manor capacity, overflow-annex eligibility and orphan-link handling; register helper ownership and update architectural documentation/changelog.
- [ ] **Merge gate:** current PR HEAD passes Node.js CI, housing performance, the 100-day producers scenario (seed 12345), and the independent 100-day restocked scenario (seed 67890), with both scenario comparisons exercising optimized PR code as well as baseline. Zero housing invariant violations.
- [ ] **Integration proof:** exercise primary + linked annex at 21+ occupants across construction/completion, leader succession, demolition/orphan handling, and full game save/load (not only a JSON object roundtrip). Verify the leader retains the primary home, guardianship and occupancy remain consistent.
- [ ] **Architecture enforcement:** verify every production residence writer is owned by the housing layer, and add regression/static coverage for unintended direct `residenceBuildingId` writes or duplicate housing schedulers. Do not equate passing unit tests with a completed repository-wide writer audit.

These checked items mean **implemented on PR #40**, not merged into `main`. Outstanding gates stay unchecked until supported by test evidence on the final commit.


### High priority — Roads, walls, gates and navigation overhaul (26 October 2026)

**Status: [ ] Proposed / not implemented.** One coordinated implementation pipeline in v0.6.6.0. The detailed technical audit supplied by the project owner is the implementation brief; the coding agent may improve its proposed architecture while preserving the mandatory behavior below. This is not a claim that the work has shipped.

- [ ] **Audit and architecture:** inspect `AGENTS.md`, `OWNERSHIP_OVERVIEW.md`, existing strip placement/topology/rendering, building commands, terrain rules, movement, existing saves and tests. Identify one authoritative owner per rule, root causes and the safest integration strategy.
- [ ] **Road construction UX:** click-and-drag produces one logical command, with continuous segments, reliable snapping, extensions, corners, T-junctions, crossroads, building entrances and faithful live previews. No silent gaps or mismatched preview/commit.
- [ ] **Terrain:** permit roads on ordinarily walkable ground without treating them as building foundations; retain impassable cliffs and water restrictions and explicit bridge rules.
- [ ] **Wall construction and gates:** easy continuous drag walls with exact visual/logical connections; insert gates into existing wall segments without manual demolition. Invalid insertion leaves the original wall intact.
- [ ] **Navigation correctness:** completed walls are impassable except through genuine openings/gates; no diagonal clipping, smoothing shortcuts or blocked-path straight-line fallback. No-path cases must stop or use established unreachable-target recovery.
- [ ] **Road travel benefit:** existing `ROAD_SPEED_MULT` applies only while traversing roads/bridges. Choose the fastest valid route using actual traversal costs, not simply the geometrically shortest line; preserve bounded-search performance, caching and determinism.
- [ ] **Bulk demolition:** single drag for many road/wall segments; one authoritative batch operation with accurate refunds, affected topology/collision/routes updated and ordinary buildings protected.
- [ ] **Rendering and assets:** topology-driven natural paths and connected defensive walls, including all corner/junction/end forms. Investigate current sprites first; any replacement assets must cost €0 and have verified commercial/redistribution licenses and appropriate registration.
- [ ] **Compatibility and scale:** keep older infrastructure saves loadable and IDs stable; validate deterministic rebuilding and repeat save/load, and benchmark at least 1,800 settlers. Preserve established performance budgets and avoid new global per-tick A* scans.
- [ ] **Single validation/merge gate:** test drag building/demolition, junctions, wall enclosure and gate traversal, road speed/path choices, worker commands, refunds, saves, simulation invariants, performance and full required CI. Update ownership docs, changelog and asset register where applicable.

**Required coding standards:** no re-exports, redundant aliases or competing authoritative systems; name nontrivial constants near the top of their owning modules; reuse existing code where suitable; keep gameplay deterministic. Free/open-source libraries and sprites may be evaluated, but introduce no paid assets. No major unrelated gameplay changes without approval.

**Definition of done:** connected roads work visually and logically; enclosed walls actually block movement; gates are passable; roads provide measured travel benefits; click-and-drag build and demolition are responsive; saves and performance remain sound. Leave all boxes unchecked until supported by implementation and validation evidence.
