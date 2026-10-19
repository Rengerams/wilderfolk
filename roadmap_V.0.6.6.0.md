# Wilderfolk v0.6.6.0 — Warfare, Survival & Reputation Roadmap

**Status:** Design proposal — NOT IMPLEMENTED  
**Target version:** 0.6.6.0  
**Scope:** Raid gameplay, settlement destruction and recovery, player choices, valley diplomacy, named battle casualties, and leadership merit.

> This is a roadmap for a future release. None of the features described here should be advertised as shipped in v0.6.5.1 until implemented, tested and verified.

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
