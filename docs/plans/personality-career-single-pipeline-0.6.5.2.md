# Wilderfolk 0.6.5.2 — DNA, personality and career progression: one trait pipeline

**Status: implementation proposal only. Nothing described here is implemented by this document.**

**Codebot: start with [the executable PR tickets and gates](personality-career-codebot-tasks-0.6.5.2.md).** They define exact files, stage ordering, mandatory updates to **both** `OWNERSHIP_OVERVIEW.md` **and** `src/game/simulation/decisionRegistry.ts` in **every** implementation PR, focused tests, stop conditions and required bug reporting using `docs/bug_report/readme.md` (including the single historical index). The present document defines the architecture and design decisions; the linked task sheet defines the work.
**Scope:** roadmap §11 (DNA and whole-life personality) plus §16 (professions, education and career paths; previously §17).
**Decision:** implement the two feature areas together through **one trait-effect evaluation pipeline**, while retaining distinct existing owners for social transitions, schooling, employment, apprenticeship, production, combat and save state. New rules live in dedicated new modules; old files receive only narrowly scoped, direct-import integration calls. No aliases, re-export barrels, second schedulers, parallel simulation state, or duplicated writers.

## 1. Evidence-based current state — read from main, 28 October 2026

| Component | Confirmed implementation | Gap or risk |
| --- | --- | --- |
| Trait identity and genetics | `src/game/settlerTraits.ts` defines 14 traits, weighted rolls, incompatible pairs, three slots, and 50% per-parent-trait inheritance; `entityFactory.ts` fills empty slots; `simulation/humanLifecycle.ts` passes inherited traits at birth. | No comprehensive effect model. Do not reroll DNA on load, introduce a parallel genotype, or reimplement inheritance. |
| Trait presentation | `SelectedEntityPanel.tsx` uses `TRAIT_DEFS` descriptions. | Inspector describes isolated effects rather than an inspectable, activity-specific balance of strengths and weaknesses. |
| Physical activity and hunting | `simulation/humanNeeds.ts` uses Hardy, Fierce and Greenthumb in legacy energy loss for foreign captives; `humanHuntingBehavior.ts` uses Brave; `humanTick.ts` uses Timid in fleeing. | The **old DNA multipliers can be removed** instead of preserved. Keep the foreign `humanNeeds` energy owner separate from the player `humanPhysiology` needs owner; only centralize trait rules at real applicable contexts. |
| Work and learning | `skills.ts` already tracks 0–100 skills and grants shift-based skill credit; `getWorkerSkillMultiplier` combines skill and a special Resourceful +10% per worker capped at +30%. `dailyBuildingEconomy.ts` owns actual production/build progression. | No consistent positive/negative effects by occupation. Do not apply a new Resourceful bonus *on top* of the existing one. |
| School/research | `education.ts` owns attendance, graduation at adulthood and school-derived skill/energy boosts; Insightful already increases research, and Nurturing contributes to school-age progress. | Need contextual teacher/pupil aptitude and explanations without duplicate school-day awards or universal trait bonuses. |
| Apprenticeships | `apprenticeships.ts` already runs daily, pairs qualified adults with masters and awards trade skill. Master skill >= 40, grandmaster >= 80, apprenticeship graduation >= 50, with existing age/school gates. | Missing durable career history, milestones and differentiated interest/aptitude; **do not create another apprenticeship or mentor-matching engine**. |
| Workforce | `workforce.ts` owns job assignment and worker transfers, including manual staffing, commute rules, skill-based selection and a 60-day automatic-transfer cooldown. | Show *why* someone fits a vacancy; do not automatically reshuffle workers solely for DNA. |
| Social and family | `relationships.ts` owns reciprocal friendship/feud changes and five trait-clash pairs. `socialLife.ts` chooses off-duty motives. `simulation/humanRelationships.ts` owns courtship, affairs, scandal, pregnancy and marriage/divorce; `humanLifecycle.ts` owns births. | Personal preferences, partner compatibility, context-sensitive intentions, experience-related reactions and family priorities are not calculated by one authoritative trait evaluator. Do not create new relationship state machines. |
| War and politics | `militiaBalance.ts` awards a flat +8% global Chivalrous bonus if at least one eligible soldier exists; `warPrisoners.ts` uses Nurturing/Chivalrous/Fierce for contextual civic reactions. | Retire the old global bonus in PR B; use the canonical **per-eligible-soldier** `danger/defense` projection without applying it to the entire army. Civic reactions migrate in PR C. No good/evil label or active combat. |
| Randomness and ownership | `simRng.ts` and `humanSchedule.personDayRoll` own reproducible draws; `simulation/decisionRegistry.ts` and `OWNERSHIP_OVERVIEW.md` declare existing state owners. | No additional random stream/cadence by accident; new pure trait projection has **no world-state write authority**. |

**Correction to the 9 October legacy proposal:** `docs/plans/settler-trait-effects-2026-10-09.md` is a historical plan, not current implementation truth. Its claim that Nurturing, Insightful, Chivalrous and Intuitive are unused is now stale: they are read in education, militia, war-prisoner and social code. Its blanket "ten traits learn -6%" and symmetrical opposite-pair percentages are not adopted: they would penalize nearly every worker irrespective of context. Do not turn that older document into a second specification or table.

**What is already real:** DNA inheritance; human/family and feud systems; school and graduation; apprenticeship; job skills; workforce assignment; selected trait bonuses. **What is not yet real as an integrated feature:** common trait benefits/drawbacks, context-sensitive whole-life priorities, player-readable causal factors, work history, career specializations and progression based on experience.

## 2. Core architectural decision

**One trait evaluation entrypoint, not one huge gameplay manager.** The new `evaluateTraitInfluence(subject, context)` is a **pure, read-only** function: it derives a bounded effect and a small list of typed reasons from the settler's already-saved DNA plus the explicitly supplied context. It never creates random outcomes, selects actions, moves settlers, edits relationships, writes skills, posts events or records saves.

Every consuming domain keeps the final decision **and the only authoritative write**:
- Work output and construction are still awarded by `dailyBuildingEconomy.ts`; `skills.ts` remains the skill-writer.
- Attendance, graduation and research still use `education.ts`; apprenticeships still use `apprenticeships.ts`.
- Recruitment, assignment, manual overrides and transfer cooldowns stay in `workforce.ts`.
- Friendships/feuds stay in `relationships.ts`; leisure motive choice stays in `socialLife.ts`; marriage, affairs, conception and divorce stay in `humanRelationships.ts`.
- War/prisoner/leadership outcomes stay in their current owners.
- The inspector reads the **same projection**, not a second UI-oriented copy of modifier rules.

The common evaluator answers "how does this DNA influence *this* decision?"; it does not answer "should the world perform this decision?" and never owns state outside its new optional, separately scoped progression/memory domains.

### Data flow

```text
Stored Entity.traits (14 canonical IDs / max 3)
                  |
          traitEffectCatalog.ts
       (one exhaustive numeric/rule table)
                  |
          traitEvaluation.ts
       evaluateTraitInfluence
   context + subject + optional other
                  |
        bounded readonly outcome
        factor, weighted tendency,
        reason IDs and source traits
                  |
   +--------------+---------------+--------------+
   |              |               |              |
 skills/economy   social/family    school          workforce
   owners           owners          owner           owner
   |                |               |              |
 original state writers; no new duplicate state transitions
                  |
    careerProgression (only NEW history/milestones)
                  |
    presentation (same evaluation, read-only)
```

**Important:** career progression is a separate *state transition* for career milestones, not a second trait evaluator. It uses the central evaluator as one input alongside actual shifts, skill, schooling and existing apprenticeship status. No global per-tick "personality AI" loop.

## 3. Proposed new files and sole ownership

| New file | Sole responsibility | Public exports (direct imports only) |
| --- | --- | --- |
| `src/game/personality/traitEffectCatalog.ts` | One `satisfies Record<SettlerTrait, TraitEffects>` table for all 14 IDs, typed domain effects, contextual plus/minus trade-offs and named caps. No new trait names/labels; those still belong to `settlerTraits.ts`. | `TRAIT_EFFECTS` and effect types used by evaluator |
| `src/game/personality/traitEvaluation.ts` | **Only** numeric/qualitative trait-combination pipeline. Merge up to three contributions, apply diminishing returns and caps, return a frozen/read-only result with stable reason IDs. No writes or RNG. | `evaluateTraitInfluence`, `TraitContext`, `TraitInfluence` |
| `src/game/personality/lifeExperience.ts` | Small **optional** experience-memory writer for meaningful past outcomes not already represented by `friendships`, `feuds`, `pastPartnerTicks`, `griefUntilTick` or `scandalCooldownUntilTick`. One bounded once-per-event transition; no second relationship history. | `recordLifeExperience` and one bounded storage type |
| `src/game/careers/careerHistory.ts` | **Only** writer for new per-job completed-shift totals and milestone timestamps, based on an already-accepted work credit. Retains idempotency by job + absolute calendar day. | `recordCareerWork`, `CareerHistory` |
| `src/game/careers/careerProgression.ts` | Event-driven milestone decision only on real credited work or training achievements, using existing skill, education, apprenticeship and career history. No extra daily scan, job assignment or skill writes. | `advanceCareerProgression`, `CareerMilestone` |
| `src/game/careers/workerFit.ts` | Pure single ranking/explanation projection for *available* vacancies, reading `evaluateTraitInfluence` + existing skill/commute/availability. Ranking is advisory and must not override hard eligibility or player/manual staffing. | `evaluateWorkerFit`, `WorkerFitReason` |
| `src/components/PersonalityCareerDetails.tsx` | Read-only inspector component displaying inherited traits, contextual +/-, interests, actual skill/training, career milestones and brief causal reasons. | `PersonalityCareerDetails` |

**No** `index.ts` barrels, `export *`, forwarding wrappers, compatibility aliases, duplicate copies of `TRAIT_DEFS`, "trait manager" classes, extra random generators, or catch-all god module. If a proposed helper is indistinguishable from an existing one, use the existing helper directly.

A **small** required change to existing modules is unavoidable to make the new rules take effect: add direct imports and one narrowly scoped call at the existing decision/credit point. The implementation logic remains in new modules. Do not rewrite or relocate existing school, affair, apprenticeship, staffing, housing or production algorithms.

**Mandatory dual registration in every implementation PR:** update both `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` for each phase A–E. Register the pure `traitInfluence` evaluator with its sole owner, `writes: []`, and on-demand caller metadata, without adding a simulation tick. Update existing registry decisions for changed integrations; register new career-history, career-progression and (if needed) life-experience writers under distinct keys with exact write sets. Every changed function still has one owner and no writer is duplicated.

## 4. Single typed evaluation contract

The evaluator accepts an exhaustive discriminated context rather than anonymous percentage strings:

```ts
type TraitContext =
  | { kind: 'work'; job: JobType; action: 'production' | 'construction' | 'training' }
  | { kind: 'school'; activity: 'learning' | 'teaching' | 'research' }
  | { kind: 'physiology'; activity: 'labor' | 'cold' | 'recovery' }
  | { kind: 'danger'; activity: 'hunting' | 'defense' | 'escape' }
  | { kind: 'social'; activity: 'friendship' | 'conflict' | 'courtship' | 'reconciliation'; other?: Readonly<Entity> }
  | { kind: 'family'; activity: 'care' | 'parenting' | 'bereavement' }
  | { kind: 'romance'; activity: 'attachment' | 'affair_approach' | 'remorse'; other?: Readonly<Entity> }
  | { kind: 'leisure'; activity: 'company' | 'solitude' | 'community' }
  | { kind: 'civic'; activity: 'leadership' | 'negotiation' | 'mercy' };

interface TraitInfluence {
  readonly factor: number;       // positive finite bounded context-specific multiplier
  readonly tendency: number;     // signed capped preference, where appropriate
  readonly reasons: readonly { trait: SettlerTrait; effectId: string; direction: 'benefit' | 'drawback' }[];
}
```

These shapes are a **design contract**, to be refined against existing TypeScript import cycles, not pre-existing APIs. `evaluateTraitInfluence` should accept only the fields actually required by a context: prefer read-only entity projections and job/relationship context over passing the whole `WorldState`. Avoid allocating explanations in hot production/movement loops: use an option to omit reason collection, or compute it only for the inspector. This is one function with optional read-only explanation, **not separate functions with duplicated arithmetic**.

**Approved balance policy (28 October 2026):** legacy DNA-specific multipliers and fixed bonuses **may be retired** during migration. New context-specific effects initially use a combined [0.85, 1.15] factor with diminishing returns and separately bounded preference weights. Resourceful's old construction +10%/worker (max +30%), Chivalrous's old flat militia +8%, old Hardy/Greenthumb/Fierce captive-energy modifiers, historical Brave/Timid movement multipliers and the old per-Insightful research uplift are **AS-IS evidence, not numeric compatibility targets**. Replace their **trait-specific** calculation at each relevant owner with the single canonical catalog/evaluator exactly once; remove the legacy branch and its constant. Preserve non-DNA state machines, entity eligibility, gear and skill baselines, event cadence and RNG behavior. Record deliberate balance differences; do not silently stack new and old bonuses or re-create old multipliers under another name.

### 4.1 PR C gameplay-parity override — context-specific extra multipliers

**User decision (28 October 2026): PR C is a rule-location refactor, NOT a rebalance.** The approved PR B rebalance is already committed and must not be reverted. For the still-legacy PR C social, conception, grief and civic paths, preserve the **current shipped gameplay exactly**: non-DNA base chances, eligibility, action order, thresholds, random calls and their sequence, cooldowns, relationship/custody writers, trait stacking and output for the same state/seed. Do not replace an old effect with a smaller/new number just because the generic evaluator caps new factors to 0.85..1.15. Do not add a new bonus to an unrelated context during migration.

**Extra multipliers:** one DNA trait can have any number of *named, relevant context entries* in **\`traitEffectCatalog.ts\`** (use its existing \`also\` concept where appropriate). Store existing values **once**, in the catalog: ordinary new effects continue to use the bounded/diminishing-returns calculation; legacy-parity entries use an explicitly typed **exact-factor mode** inside the *same* \`evaluateTraitInfluence\` path, without shrinking the original ratio or changing multiplication order. The mode is permitted **only for enumerated existing PR C decisions**, never as a blanket exemption or a competing evaluator. An irrelevant trait yields exactly \`factor: 1\`. If an old decision uses a discrete count or duration, extend the same evaluator's context-specific read-only output to represent that exact quantity; do not encode a 5-vs-7-day rule or two independent vote counts in an inadequate bounded factor.

| Existing PR C decision (confirmed AS-IS) | Catalog/one-evaluator contract; identical TO-BE gameplay |
| --- | --- |
| Courtship in \`humanTick.ts\` | Gregarious ×1.4, Timid ×0.7 and Graceful ×1.2, **multiplying in their existing order** alongside unchanged festival, performers, cohabitation and per-tick rate. Add the missing Gregarious \`social/courtship\` entry; existing Timid and Graceful entries need exact-context values. A couple with no applicable traits retains ×1. |
| Married and youth-love conception in \`simulation/humanRelationships.ts\` | Lucky ×1.15, in both existing affected branches; do **not** add the multiplier to the currently neutral affair-conception branch. Add \`family/conception\` (or a precise family context) and store ×1.15 there. Eligibility, fertility, proximity, day-based deterministic roll and pregnancy transitions stay identical. **Non-Lucky mothers retain exactly their original nonzero chance when eligible.** Lucky has no bearing on which traits a baby inherits; genetics remain owned by \`settlerTraits.ts\`. |
| Midday workplace banter in \`socialLife.ts\` | Intuitive gives the existing chance 0.11 instead of 0.08; add a distinct contextual entry (e.g. \`social/workplace_banter\`) in the catalog; preserve seeded \`personDayRoll\`, work-hours gates, partner search, comparison and dialog results. |
| Spousal mourning in \`humanLifecycleCleanup.ts\` | Existing grief window: Stoic 5 days, otherwise 7, with existing \`Math.max\` and calendar/tick conversion. Add the exact contextual rule under \`family/bereavement\`. Do **not** activate the currently catalogued Nurturing grief drawback during this parity-only refactor; that would change gameplay. Existing affair-partner 3-day mourning stays unaffected. |
| Village reaction in \`warPrisoners.ts\` | Nurturing **or** Chivalrous counts as one restraint voice per living eligible villager; Fierce counts separately as one severity voice. The same villager can contribute to both categories if its traits match. Catalog carries these role weights for \`civic/mercy\`, evaluator returns the exact two discrete contributions; keep war/recent-attack votes, decision polarity, reputation, leadership caps and log wording unchanged. Never introduce a moral score. |
| Social feuds in \`relationships.ts\` | Move all **five cross-person trait incompatibility pairs** into the single catalog (distinct from the two **within-person genetic exclusions** in \`settlerTraits.ts\`). A *pair-aware* evaluation returns the identical integer clash count 0..5, independent of A/B ordering. The existing \`clashes === 0\` RNG guard, one-roll probability \`clashes × 0.00005\`, pair budget, friendship/feud reciprocity and feud amount remain unchanged. Avoid new random draws for zero-clash pairs. |

**Do not confuse numeric rule definitions with simulation ownership.** The catalog contains all context-specific constants and pair/vote rules; the one pure evaluator computes their result. Only the existing owner performs the original state update. No direct \`traitMultiplier\`, \`hasTrait\`-based numeric special cases, per-owner \`traits.includes\` bonus, pair table or copied magic DNA values survive after PR C. This requires a narrowly extended evaluator return shape for pair counts/vote contributions; \`factor\` and \`tendency\` alone cannot losslessly represent those old discrete rules. The player may retain all fourteen DNA types, but no DNA is a gate for conception or social access.

**Proof and gate:** document AS-IS/TO-BE per caller; test exact selected old/new probability, combined trait multiplication, no-trait baseline, youth/married/affair conception, all five pair clashes (and zero-clash RNG consumption), one-vote-per-category civic cases, grief windows, stochastic draw parity and unchanged existing save DNA. The non-feature legacy audit in \`tests/personality.legacyConsumerAudit.test.ts\` is an **intermediate ratchet** with a finite source-only allowlist. PR C MUST change its expected legacy inventory to **empty**, remove the obsolete \`traitMultiplier\` helper and prove the scanner finds zero remaining legacy consumers; the existing allowlist is not a permanent exception. This scan complements behavioral tests, not a replacement.

**No effect** is valid when the trait is not relevant: each trait needs meaningful positive and negative consequences *somewhere*, not an automatic artificial penalty in every job. Existing skill, health, tools, technology, housing, job attendance, and relationship history dominate small trait nudges. The same rule applies to comparable player/rival individual humans when that gameplay system uses them, without letting rival civilians inflate player bonuses.

## 5. Fourteen-trait coverage proposal

Values below are **behavioral design candidates**, not implemented numbers. Each trait gets a contextual benefit and a contextual cost. The catalog should encode exact domains, magnitude, conditional validity and player-readable reason IDs.

| Trait | Advantage in a real situation | Contextual downside or opportunity cost |
| --- | --- | --- |
| Hardy | Better endurance in physically demanding work | May remain at arduous work too long when fatigued; higher overexertion risk under strain |
| Brave | Greater willingness to protect others and undertake dangerous hunting | Increased voluntary exposure to risky situations; not extra damage from passive presence |
| Gregarious | Builds bonds and communicates with coworkers more readily | Solitude and prolonged isolation weigh more heavily on satisfaction |
| Timid | More risk-aware, backs away from danger earlier | Hesitates before confrontations, dangerous work and initiating intimate contact |
| Greenthumb | Excels at growing food and reading nature-dependent conditions | Lower enthusiasm for unrelated indoor/repetitive trades; does not make their output universally bad |
| Lucky | Slightly better outcomes on actual bounded chance-based events | Overconfidence can affect optional decisions under uncertainty; never modify arbitrary RNG rolls |
| Nurturing | More effective care, mentoring and sustained family support | May sacrifice own rest or career opportunity when family obligations compete |
| Insightful | Stronger research, reflection and teaching-related decisions | More rumination/stress when relationships or situations remain unresolved |
| Chivalrous | Protective behavior, principled civic standing and existing militia benefit | Can reject expedient but coercive bargains, occasionally losing a short-term advantage |
| Resourceful | Improvisation helps construction and scarce-material work; preserve existing production rule initially | Less inclined to follow structured training when improvisation appears sufficient |
| Stoic | More composed under grief, danger and hardship | Slower to seek emotional support or initiate reconciliation |
| Graceful | Social tact and fine-control activities | More fatigue/discomfort from prolonged heavy labor |
| Intuitive | Reads social cues and ambiguous situations more effectively | Can misinterpret limited cues, creating avoidable hesitation or tension |
| Fierce | Determination in defense and protecting close bonds | Anger/escalation becomes likelier under betrayal or a serious feud |

**Coverage rule:** for each trait document at least one positive and one negative measurable gameplay *context*, and explicitly record "not applicable" for unrelated systems. No fixed traits that force an affair, compel loyalty, make someone good/evil, or decide their entire future. Risk must be tied to real exposure, and social events must arise from current state, opportunity, seeded chance and both people's agency.

## 6. Domain integration points (small edits, no new owners for old decisions)

| Existing owner | Direct integration point | Invariant |
| --- | --- | --- |
| `skills.ts` + `dailyBuildingEconomy.ts` | At genuine per-worker shift credit and existing building output calculation, read appropriate `work/production` or `work/builder/construction` influence once; **remove the old Resourceful +10%/worker site bonus**. | Skill gain still happens on worked shifts even when storage is full; resource production/build progress remain in their original owners, and unresolved occupant IDs cannot reduce a neutral crew DNA factor. |
| `education.ts` | Teacher/pupil/research calculations call the evaluator at the actual class/research event. Remove the old **+3% per Insightful, cap +15%** trait-specific research increment rather than using `factor > 1` merely to keep it. Apply bounded `school/research` influence once; keep education-derived non-DNA research contribution. | Age 6–17 education, age-18 graduation; no duplicated school credit or blanket bonus to every occupation. |
| `apprenticeships.ts` | Retain `advanceApprenticeships` as sole selector/teacher/writer; use `evaluateTraitInfluence` directly for relevant training factors; do not reuse the vacancy-specific worker-fit ranker for apprentice matching. | Master >=40, grandmaster >=80, skill-50 completion and current age/school/capacity gates remain, unless individually approved for balancing. |
| `workforce.ts` | Compute fit only inside the existing eligible idle-candidate loop; use existing indexes and expose reasons to the UI from the same pure calculation. | Commute/eligibility, survival staffing, manual override, donor protections, and 60-day transfer cooldown win over trait preference. No DNA-based involuntary job rotation. |
| `relationships.ts` | Pair compatibility and current experiences modulate established friendship gain and feud rolls. | Reciprocal friendship/feud changes still performed here; existing feud caps and daily pair budgets remain. |
| `socialLife.ts` | Apply personal preferences to the already determined off-duty eligible motives and location choices. | Work, sickness, grief, childcare, school and mandatory responsibilities remain higher priority. No new per-tick scan. |
| `simulation/humanRelationships.ts` | Adjust eligible courtship, affair approach, reconciliation and reaction *probabilities* only after existing legal/civil/social gates. | Preserve 18+ adult rules, existing youth-love rules, two-party agency, relationship exclusivity, daily encounter pacing and established affair/scandal transitions. |
| `simulation/humanPhysiology.ts` and `simulation/humanNeeds.ts` | Player humans use `advanceHumanNeeds` and its relevant `physiology/labor` context **only while working**; walking must not inherit a work-specific bonus accidentally. Foreign captives keep `humanEnergyLoss` but **remove** its old Greenthumb winter, Hardy and Fierce hardcoded DNA terms; apply a new `physiology/cold` projection only if its canonical rule truly exists and that condition applies. | Separate owners for player `needs` and foreign-captive `energy` stay untouched. Non-DNA cold, home, well, hospital and meal gates remain. |
| `militiaBalance.ts`, `warPrisoners.ts` | PR B replaces the direct Chivalrous gate and old +8% army bonus with **per-musterable-soldier** `danger/defense` evaluation; Chivalrous and Fierce contribute only to the eligible individual's attributable fighting power. PR C converts existing prisoner/civic trait checks without changing the decision owner. | An ineligible human gives no militia DNA gain, one soldier does not boost the whole army, equipment/barracks baselines stay, no double bonus, no universal morality or real-time unit combat. |
| `SelectedEntityPanel.tsx` and relevant workplace view | Mount the new read-only detail component and show factors actually used by live owner paths. | UI does not edit world state and never invents bonuses from descriptive text. |

**Audit before each hook:** list the old trait-specific branch and its caller in AS-IS, then **remove** that branch and apply the bounded canonical evaluator exactly once at the existing owner. Numerical changes to legacy DNA bonuses are **approved**, but changes to non-DNA mechanics, eligibility and simulation timing are not implicit. Never retain both. The evaluator must not become a wrapper alias around `traitMultiplier`; consumers import the canonical function directly.

### 6.1 PR B architecture cutover — two remaining legacy DNA paths

**The existing code is not the target architecture.** The PR #90 review found that its old DNA terms still survive in `simulation/humanNeeds.humanEnergyLoss`, and that `militiaBalance.computeMilitiaBreakdown` still checks Chivalrous directly. Those exceptions are **not an acceptable permanent split** of the trait rules. The user permits retiring their numeric bonuses, so the target is simpler than maintaining special-value legacy projections.

```text
AS-IS (PR #90, verified)                           TO-BE (complete PR B)
Entity.traits                                      Entity.traits
  |                                                  |
  +--> traitEffectCatalog/evaluateTraitInfluence      v
  |          |                                   traitEffectCatalog
  |          +--> work, school, player needs           |
  |                  hunting, escape                  v
  +--> traitMultiplier for captive energy      evaluateTraitInfluence (read-only)
  +--> traits.includes('chivalrous') for militia     |
                                                     +--> skills / production / construction
                                                     +--> education / apprenticeship / research
                                                     +--> player physiology
                                                     +--> captive energy (only real matching context)
                                                     +--> hunting / flight
                                                     +--> militia per eligible soldier
                                                             |
                                                        existing owners write
```

- **Foreign captives:** keep their separate `entity.energy` depletion, heating/well/home/hospital and feeding/death rules. Remove only legacy Hardy ×0.85, Fierce ×0.90 and Greenthumb unheated-winter ×0.70 trait multipliers. They need **no replacement** if the new catalog has no applicable cold/captive context; new DNA cannot grant benefits in an invented or unreachable context. `humanPhysiology` remains the separate player `entity.needs` writer. Neither physiology owner may import the other's mutable state.
- **Militia:** retain `canBeMustered` and `computeMilitiaBreakdown` as eligibility and calculation owners. Remove the old one-protector-boosts-entire-army +8% branch. Calculate each already-eligible soldier's attributable base+equipment strength using the same existing constants, apply that soldier's bounded `danger/defense` factor (Chivalrous, Fierce, or both) **once** to that contribution, and aggregate before the existing final rounding. Avoid applying soldier DNA to barricade, walls, towers or unrelated soldiers. Reuse the already visited mustered list instead of adding an O(population × soldiers) search.
- **Other PR B cutovers:** drop Resourceful's old +10%-per-worker cap in construction and use the existing `work/builder/construction` catalog context for actual builders; a nonbuilder's unrelated trade DNA is neutral. Hunting range, chase and fleeing read only `danger/hunting` or `danger/escape`, without the historical 1.25/1.20/1.35 constants. Research uses `school/research` directly, not the old 3%-per-Insightful count. The catalog's ordinary factor range and diminishing stacking remain bounded.
- **Stamina scope:** labor DNA may modify genuine work drain, not walking drain by accident. Any intended walking effect needs a separate real context and explicit review.
- **Migration and tests:** cut over every live caller of a retired legacy factor in the same PR. Test captive/no-captive state isolation, unchanged non-DNA energy baselines, muster exclusions and 0/1/2-person DNA effects, construction effects, research direct factor, hunting/escape contextual sign, unchanged seeded DNA inheritance, legacy no-DNA old saves (including transformed Moon Howlers), worker/save parity and bounded colony performance. Tests must **not** require retired exact percentages. Missing/stale occupant IDs must not depress a neutral work factor. There must be no extra trait scheduler, duplicated registry owner or leftover fallback rule.

**The precise implementation checklist and stop conditions are in the linked codebot tickets §1.2 and PR B.**

## 7. Career progression: integrated design, separate bounded owner

Career progression is **not** a replacement for the existing skills, schooling or apprenticeship state machines. It is an additional, optionally persisted history of real work:

- `CareerHistory` records bounded **actually attended shift credit per JobType** and milestones. A worker/job/absolute-calendar-day may receive at most one credit. Skill updates alone do not prove attendance (`gainSkill` is also called by construction, schools and apprenticeships); use the already recorded schedule/attendance hours, including real shifts when storage is full. No assigned-but-absent credit, per-tick career grind, double counted construction/production or passive title experience.
- `careerProgression.ts` evaluates milestones **only when a genuine credited work or mentorship completion event might cross a threshold**, with stable tie-breaking. Avoid a daily full-colony sweep and any independent timer. It never silently assigns a new profession.
- First implementation uses modest experience tiers (e.g. *Novice*, *Practiced*, *Experienced*, *Master*) for presentation, **not** replacement numeric skills or automatic power upgrades. Actual skill remains 0–100; add specialist benefits only when backed by a real action and a single consuming owner.
- Specializations are **optional** growth paths for existing trades (Teacher, Doctor, Blacksmith, Builder, Farmer, Hunter, Soldier, etc.) and should arise from job-specific events, training and opportunities, not automatically from an arbitrary skill threshold. Do not introduce a new “skill” meter that competes with `skills`.
- Existing apprenticeships remain optional and bounded; students can still enter normal employment. Graduation and skill transfer should not backfill imaginary prior workdays.
- Work matching produces **Why this worker?** explanations: availability and hard eligibility first, commute second, existing job skill and experience third, context-relevant DNA inclination last. A suitable worker can be assigned despite a trait mismatch; a seasoned worker is never involuntarily reassigned just because a better candidate appeared.
- Career events such as a completed apprenticeship, a long-held role or a notable training success may feed the existing Chronicle, via its established logging owner, with cooldowns. Routine shifts do not generate log spam.
- At most one compact optional career record per actual working human. Enforce bounded fields and no large arrays of per-shift history.

**Why not put careers inside traitEvaluation?** Career history advances from actual experience and persists. DNA is inherited and static. Conflating them would give a pure evaluator write authority and either duplicate skill records or create a second job system.

**Runtime and save design precedence:** if a short implementation summary below suggests a daily career scan or postpones persistence to PR E, the [executable PR tickets](personality-career-codebot-tasks-0.6.5.2.md) take precedence: event-driven progression, same-PR migration and worker rollback. New characteristic *effects* apply to old citizens immediately, without keeping a second saved trait-effect table.

## 8. Life experiences and relationships

Start by reusing **existing** relationship history and state. Add `lifeExperience.ts` only for genuinely absent, useful personal-memory summaries, e.g. one severe betrayal, a major reconciliation, repeated acts of care or an exceptional dangerous rescue.

- Mutate life memory only in the existing event-owning path, at the moment the event actually commits, and via one named function. Store bounded identifiers, severity, timestamp and optional relevant person ID. No unlimited personal diary.
- Keep friendship, feud, marriage, divorce, pregnancy, custody, housing and family links entirely with their current owners.
- Evaluate personal tendencies only when a real opportunity exists: the right age, free time, nearby compatible person, valid relationship status, need for care or actual danger.
- Partner attraction, affair pursuit and conflict require both participants' context. Traits change *weights*; no deterministic betrayals or blanket moral judgment.
- Existing seeded daily rolls and owner cooldowns remain authoritative. Never create another random roll at every evaluation or a second clock.
- New optional memory must survive save/load and worker transport, and gracefully default to empty for older saves; neither DNA nor historical relationship IDs are rewritten.

## 9. Determinism, compatibility and performance

1. **Seeded repeatability:** the pure evaluator consumes no RNG and no global current time. Existing decisions continue using their existing `getSimRng` / `personDayRoll` source and their existing number of decision opportunities. If cadence or RNG draw count changes, treat it as a deliberate, tested gameplay migration.
2. **Stable genetics:** maintain all fourteen trait IDs and the existing inheritance/roll ownership. Do not reroll existing settlers or normalize all old characters to three traits during a save load.
3. **Mandatory same-PR save migration:** old games load with all new *applicable* properties. New effects derive from existing DNA; valid saved traits remain unchanged. If a truly old human has no DNA array, deterministically allocate canonical baseline traits using a local ID/seed migration stream without consuming the active simulation RNG. Add optional saved career/memory fields to `Entity`, `ENTITY_PERSISTED_FIELDS` and the existing `saveLoad.ts` normalization **in the same PR** as the new field (PR C for optional life memory, PR D for careers); missing fields default neutrally and compactly, with no fabricated historical shifts or events. Validate corrupt values, prove load→save→load idempotency and retain support for existing save versions. Review `simWorker/simPrep.ts` nested clone rollback, complete-entity `simBuffers/simDelta.ts`, and Moon Howler form restoration.
4. **Worker parity:** all writes happen within the authoritative simulation tick/command owner and flow through the existing worker/save-delta mechanism; React cannot maintain a second mutable history.
5. **No new global scans or impure reads:** at most three DNA effects per context, using existing indexes/attendance and readonly projections, no per-call Maps/Sets/reason arrays in hot paths. The existing `readSkill` calls `ensureEntitySkills` and can mutate an entity: the pure evaluator, pure worker fit and inspector must read `entity.skills?.[job] ?? 0` instead. Process career thresholds on work/training events, not a daily full-population scan; only create explanatory reasons for the selected inspector.
6. **No universal best DNA:** compare all 14 profiles in each supported context and allow job skills, training and context to outweigh trait modifiers. Cap multi-trait stacking.
7. **No duplicate bonuses:** inventory old Resourceful, Chivalrous, conception, research, captive-energy, hunt and social trait branches. Their **numeric bonuses are not protected**; remove the legacy rule at the same time the canonical evaluator becomes the only active trait-effect source. Keep non-DNA baseline behavior and owner guards. PR B handles economy/education/physiology/militia; PR C handles social/civic/romance.
8. **No extra ticking machinery:** extend existing daily shift/social/relationship and selected event call sites, not the main game loop with an entire new character decision loop.

## 10. Implementation sequence and acceptance

### PR A — Core trait catalog and pure evaluation
- Add `traitEffectCatalog.ts` and `traitEvaluation.ts` with all fourteen typed profiles, contextual plus/minus, stable reason codes and bounded evaluation.
- Add targeted tests for exhaustive enum coverage, both effects per trait, missing/legacy traits, caps and deterministic no-RNG reads.
- **Acceptance:** evaluate identical traits/context twice -> identical value and reason IDs; no world mutation; no saves or gameplay changes yet.

### PR B — Existing work, education, physiology and combat consumers
- Integrate existing owners **one at a time**; retire each old inline trait adjustment *as it moves* into the single table.
- **Retire** historical Resourceful construction, flat Chivalrous militia, captive Hardy/Greenthumb/Fierce energy, Brave/Timid movement and Insightful research trait-specific multipliers when the new catalog rule is wired; preserve their non-DNA state/eligibility/timing mechanics. Do not perpetuate old percentages under new names.
- Tests: real worked production, full-store shift skill, construction-only Resourceful context, direct school/research and apprentice effects, seeded hunting/escape, genuine labor vs walking, separate foreign-captive energy, per-eligible-soldier militia influence, exact non-DNA baselines and zero double DNA terms. Include stable old-save backfill and Moon Howler form coverage.
- **Acceptance:** behavior is observable in real existing owner paths; no legacy DNA factor remains active in PR B domains, no duplicate state writer and no new unbounded iteration. Document numeric rebalancing and verify with bounded seeded colony comparisons.

### PR C — Social and whole-life personality
- **Gameplay-parity migration, not a rebalance:** implement §4.1 exactly, including additional catalog-only exact multipliers for currently existing social/family/civic contexts; no changes to old chances, durations, case selection or RNG draw pattern. Keep the PR B rebalance already merged.
- **Strict legacy exit gate:** the legacy consumer audit allowlist becomes empty in PR C; seeded baseline/trait combinations and all five cross-person clash cases must match the old implementation.
- Apply the central evaluator to off-duty choices, friendship/feud pair weighting, eligible romance/courtship, legitimate affair decisions, family care and contextual reactions.
- Keep every original relationship writer, cadence, consent/eligibility invariant, mutual link and failure gate intact.
- Add `lifeExperience.ts` **only** if audited existing fields cannot represent the targeted longer-term influence.
- **Acceptance:** same seed/events generate reproducible choices; different traits measurably bias outcomes without forcing them; no split pair references or extra affinity systems.

### PR D — Career histories and progression
- Add `careerHistory.ts`, `careerProgression.ts` and `workerFit.ts`, wired at the existing successful shift-credit, daily and staffing selection points.
- Retain `apprenticeships.ts`, `education.ts` and `skills.ts` as sole writers of apprenticeship, school and skill data.
- Tests: once-per-day credit, manual assignment stability, no skill/career phantom credit for idle workers, optional apprenticeships, skill milestones, 18-year employment boundary, no pathological automatic transfers.
- **Acceptance:** two same-age classmates may develop different credible careers from real shifts, skill, opportunity and DNA — without changing jobs spontaneously.

### PR E — Transparent UI, documentation and save integration
- Add `PersonalityCareerDetails.tsx`, show factors from the same evaluator and concise *Why this worker?* reasons in the existing UI.
- Update **both** `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` in **each PR A–E**, including pure read-only and UI phases; update `CHANGELOG.md` alongside the implementation. Mark roadmap §11 / §16 items complete **only after corresponding code is merged**.
- Tests: old-save hydration, worker/main-thread parity, no stale UI values, save→load, retained inheritance and age constraints, performance budget on representative colony sizes.
- **Acceptance:** clear user-visible pros/cons and skill/career explanations, no gameplay rules copied into JSX.

**Verification for implementation PRs:** use repository-declared TypeScript, lint, build and focused test scripts, plus relevant deterministic social/workforce/education/warfare suites. The roadmap records implemented features, **not** the verification checklist. This document remains an implementation plan until code merges.

**Bug reporting is mandatory:** bugs found in any stage are logged using [the current bug protocol](../bug_report/readme.md), as individual files in `docs/bug_report/` and indexed in the existing `docs/BUG_REPORTS/SUMMARY.md`. Search for duplicates among current and historical reports before creating a new file. Report a defect even if fixed during the same PR; a failing test is not silently waived. Both ownership/decision registries must be updated in that PR.

## 11. Explicit exclusions and guardrails

- No second DNA system, extra trait IDs, duplicate trait metadata, hidden random "personality dice" or unsupported psychological diagnoses.
- No extra social-relationship manager, duplicate apprenticeship/marriage/affair algorithm, autonomous job-shuffle system, or full-world daily history generator.
- No alias for a renamed function, re-export barrels, generic `getModifier` proxies that obscure ownership, or two functions computing the same factor.
- No "good" or "evil" trait scores and no forced cheating, guaranteed devotion, guaranteed success, or gender-based restrictions on careers.
- No realtime fighting or player-controlled tactical combat: warfare continues to resolve as simulation.
- No traffic congestion, road wear, warehouse routing or goods-delivery logistics; those were removed from the active roadmap.
- No edits to existing authoritatively owned logic beyond direct, small integration points; no broad refactors bundled into the feature PRs.

## 12. Definition of done

This overhaul is complete only when **all fourteen** existing DNA traits have clearly defined, situational benefits **and** drawbacks, those rules actually influence relevant work and life decisions through **one evaluator**, and no retired hardcoded legacy DNA bonus continues in a migrated owner. Skill and experience still outweigh simple trait bonuses, career history/progression arises from real opportunities and work, and players can inspect the meaningful causes. Existing genetics, player and foreign-captive needs, social/affair/education/apprentice/workforce/warfare systems keep sole ownership of their state; no aliases, re-exports, conflicting timers, duplicated bonuses or new uncontrolled simulation pipelines are introduced.
