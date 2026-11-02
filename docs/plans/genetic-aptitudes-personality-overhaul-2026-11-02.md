# Wilderfolk — Genetic aptitudes and personality overhaul

**Status:** ARCHITECTURE PROPOSAL, not implemented. **Date:** 2 November 2026. **Baseline inspected:** `405a1aefae6fa9bf17aaa410d289efa77c415660` on `main`. No gameplay change is authorized merely by merging this document.

**Design goal:** Every settler carries *all fourteen* heritable, broadly reusable behavioural dimensions in **one genome and one inheritance rule**. For every supported activity, the existing decision owner obtains **one** combined personal advantage or disadvantage from the relevant dimensions. Every settler must have strengths **and** weaknesses across the live activity portfolio. **No inherited Lucky locus, `luckyAlleles`, special luck mechanic or personality modifier on conception.** The old Lucky ×1.15 conception rule is intentionally retired as a documented rebalance; "Lucky" may remain flavour-only in optional storytelling. Skills, careers, relationships, needs, environment and opportunity remain separate inputs.

This **replaces the proposed end-state** of the older three-of-fourteen labelled-trait model; it does **not** retrospectively make PR [#97](https://github.com/Rengerams/wilderfolk/pull/97) a failed *legacy-parity refactor*. PR C faithfully moved six earlier trait rules; the new design is a separately approved gameplay overhaul, requiring an explicit migration and intentional rebalancing.

## 1. Verified current state and problem

- `settlerTraits.ts` defines fourteen *categorical labels* (`hardy`, `brave`, `gregarious`, `timid`, `greenthumb`, `lucky`, `nurturing`, `insightful`, `chivalrous`, `resourceful`, `stoic`, `graceful`, `intuitive` and `fierce`) and normally chooses at most three per person; they are **not fourteen dimensions present on every settler**.
- `personality/traitEffectCatalog.ts` declares 29 ordinary effects and six legacy-exact decision types. `traitEvaluation.ts` returns ordinary `factor` and `tendency`, but gameplay owners use the factor or legacy-exact fields; ordinary `tendency` has no identified real decision consumer.
- The six PR-C sites are live: feud clashes (`relationships.ts`), workplace banter (`socialLife.ts`), courtship speed (`humanTick.ts`), married/youth conception (`simulation/humanRelationships.ts`), prisoner/community votes (`warPrisoners.ts`), widow(er) grief (`humanLifecycleCleanup.ts`). They are **intentionally exact old-behavior migrations**, not general personality integration.
- Ordinary catalog definitions such as friendship, reconciliation, parenting, leisure and many drawbacks are not yet wired into corresponding game decisions. The test that counts 29 declared effects proves catalog/evaluator coverage, **not runtime reachability of all 29**.
- Current `careers/careerHistory.ts`, `careers/careerProgression.ts`, `careers/workerFit.ts` and `components/PersonalityCareerDetails.tsx` already exist. Reuse them; historical documents that call PR D/E unimplemented are out of date.
- Existing authoritative ownership, decision cadence, RNG, save/load and large-colony performance are constraints, not invitations to build another AI/personality loop.

## 2. Fundamental separation

```text
              inherited at conception / creation
               14 aptitude allele pairs
                          |
                14 expressed dimensions
                          |
             typed activity profile table
                  (signed weights)
                           |
           ONE deterministic activity modifier
                           |
          existing owner: opportunity + RNG +
          skill/experience/relationships/context
                           |
             existing owner writes result
                           |
             inspector reads SAME calculation
```

- **DNA / innate aptitude:** inherited and stable; fourteen continuous dimensions, not three selected labels.
- **No inherited special luck:** The fourteen behavioural dimensions form the **complete** new genome. Lucky is retired from genetic gameplay; historic Lucky may display as a **legacy flavour badge only**. There is no extra locus, inherited title, additional chance modifier or extra random roll.
- **Acquired state:** existing job skills (0–100), education, actual career credits, memories/relationships and experience change during life; **do not write learned progress back into DNA**.
- **Situation:** weather, sleep, illness, partner consent, available workplace, work hours, equipment and danger continue to be evaluated by their current owners.
- **Outcome:** only the current owner decides and mutates the result. The genetic evaluator has `writes: []`, no clock, no RNG, no `WorldState` dependency.

## 3. The proposed fourteen dimensions

Every person has **all fourteen**. A high value is not universally good: the activity definition determines whether that tendency is advantageous or disadvantageous.

| ID | Dimension | What a higher expression means | Typical counter-tradeoff |
| --- | --- | --- | --- |
| `sociability` | Sociability | Initiates and enjoys contact | Harder to tolerate isolation |
| `sensitivity` | Sensitivity | Notices and responds to emotions | More affected by emotional strain |
| `cooperation` | Cooperation | Works well with others, seeks common ground | Less forceful in competitive situations |
| `curiosity` | Curiosity | Investigates and learns new things | Distracted by novelty in repetitive tasks |
| `persistence` | Persistence | Continues despite setbacks | May keep trying a poor approach |
| `flexibility` | Flexibility | Changes plans and reconciles readily | Less consistent at strict routine |
| `patience` | Patience | Waits and works carefully | Hesitates when immediate action is needed |
| `riskTaking` | Risk-taking | Acts despite uncertainty | Greater exposure to avoidable danger |
| `perception` | Perception | Notices fine details and cues | More easily distracted by stimuli |
| `initiative` | Initiative | Starts action independently | Can act before coordinating with others |
| `composure` | Composure | Remains calm under stress | May react too slowly to others' distress |
| `discipline` | Discipline | Follows routines and obligations | Less spontaneous, dislikes disruption |
| `reasoning` | Analytical thinking | Analyzes patterns and problems | Can deliberate too long under pressure |
| `creativity` | Creativity | Finds unconventional solutions | Less comfortable with rigid procedures |

Names are canonical IDs only **after approval**. Player-facing translations/labels belong to one presentation owner. Do not add gender-based weights or declare a psychological diagnosis.


### What happened to the three traits shown per citizen?

**BEFORE:** each citizen stores **three** picked categorical flags from the old pool of fourteen. Only those three may trigger old label-specific rules. The existing UI displays those three labels.

**AFTER:** every citizen stores **all fourteen continuous genetic dimensions**; no individual has "only three" DNA dimensions. The UI may still display **three most distinctive expressions** as convenient *read-only descriptors*, computed from the fourteen inherited values (for example "Very social", "Highly cooperative", "Low patience"). Those three highlighted descriptors are **not** separate saved traits, do not gate any effect, and are not inherited separately. All fourteen values contribute whenever a relevant activity uses them. The inspector also offers the complete profile and per-activity reasons.

The old three labels remain visible only as legacy history for an existing saved citizen where preserving them is helpful. Newborns and new games never randomly select three old labels.

### Lucky is **not DNA** in the new design

**Explicit approved balance change:** remove the pre-existing ×1.15 Lucky multiplier from the married and youth-love conception paths in `simulation/humanRelationships.ts`. Keep their actual fertility, age, energy, proximity, relationship eligibility and `personDayRoll` salts 603/604; keep the existing affair path/salt 605. The probability is exactly the existing owner baseline (and any existing non-DNA fertility/youth multipliers), **without replacing Lucky with `reasoning`, `perception`, `flexibility` or any other personality trait**. Do not introduce a fresh roll to compensate.

For **old saves** containing categorical `lucky`, use the **legacy badge-only option**: preserve the historic label in read-only compatibility metadata for explanation, but do not express it as inherited luck, a gene, or an activity bonus. The alternative tiny `perception`/`flexibility` bias is deliberately **not adopted**, because mapping "luck" onto biology would assert an invented personality link. Other old categorical labels receive small deterministic, versioned phenotype biases as described below. Saved skills, career progress, relatives, relationships, pregnancies and RNG state survive unchanged. A child born after the new model is enabled cannot receive a genetic `lucky` trait.

The word "Lucky" may later appear **only as flavour**, such as a temporary blessing/omen or earned narrative epithet. Those are **not** heritable, do not change chances or activity evaluation, and do not require a new gameplay roll.

## 4. One versioned genome and canonical ownership

Proposed saved shape (illustrative TypeScript, **not** a code change):

```ts
export const APTITUDE_IDS = [
  'sociability', 'sensitivity', 'cooperation', 'curiosity',
  'persistence', 'flexibility', 'patience', 'riskTaking',
  'perception', 'initiative', 'composure', 'discipline',
  'reasoning', 'creativity',
] as const;

type GeneticAptitude = (typeof APTITUDE_IDS)[number];
type Allele = number; // validated finite integer, 0..100

interface GenomeV2 {
  readonly version: 2;
  readonly aptitudeAlleles: readonly (readonly [Allele, Allele])[]; // exactly 14 fixed-order pairs
}
```

- Keep **one** ordered ID declaration; index and validation derive from it. Do not maintain duplicate per-trait maps or alias/re-export layers. Validate exactly fourteen allele pairs, fixed order, finite integer bounds, no extra keys/arrays, and a valid version.
- `settlerTraits.ts` remains the **one genetics owner** for founder allocation, parent-to-child allele transmission and deterministic legacy backfill; extend/replace it in a reviewed migration rather than adding a parallel `geneticsManager`.
- `Entity` obtains **one** optional `genomeV2` while migrating, listed once in `ENTITY_PERSISTED_FIELDS` with normalization in `saveLoad.ts`. After migration and owner cutover, `genomeV2` is the **sole authoritative genotype**. The existing three-slot `traits` field is read-only *legacy compatibility metadata* until independently retired: it never enters the new gameplay evaluator, is not transmitted to newborns, and never becomes a second genetics source.
- No persistent duplicated `aptitudeScores`, `traitEffectValues` or cached per-activity modifiers. A direct, uncached expression may need all fourteen alleles to derive the individual's mean, **plus** the 2–5 activity-relevant dimensions; this remains fixed-size O(14), not O(population). Benchmark hot consumers before considering any owner-owned transient cache. The selected-settler inspector may derive all fourteen on demand.
- Worker transfer, `simWorker/simPrep.ts` rollback, `simBuffers/simDelta.ts` and Moon Howler transform/revert must preserve the *same person and same genome*. No top-level duplicate worker delta or automatic reroll on form changes.

### Genetic allocation and inheritance

1. **Founders:** draw exactly fourteen allele pairs with the current seeded genetics RNG owner. No fifteenth luck locus. Enforce a reasonable spread (not all fourteen midpoint or all identical). Record the distribution and mutation parameters as explicit balancing constants, not unexplained numeric salts.
2. **Children:** choose **one of the two alleles from each biological parent for each dimension** using the established parentage and one genetics RNG owner; a documented rare bounded allele mutation may occur at birth. Do not substitute social/legal parent for biological parent. No new recurring genome rolls.
3. **Expression:** a dimension's raw inherited value is the mean of its two alleles (0–100). For gameplay use a *relative expression* centered on that person's fourteen-dimension mean; this prevents a settler with universally high raw values from being universally best. The genome remains immutable. Explain both raw and relative values in UI.
4. **Diversity constraint:** generation/migration must ensure at least two meaningfully different expressed dimensions on opposite sides of the personal mean. This is checked at **birth/backfill only**, not by continuously rewriting inherited alleles. If parental alleles yield a degenerate profile, apply a documented tiny birth-time mutation using the same genetics stream; log and test the exception.
5. **Old saves:** use an ID/colony-seed local migration stream, independent of live RNG. Convert the non-Lucky categorical labels through **one versioned legacy-phenotype mapping** into small, bounded dimension biases (examples: `gregarious` → sociability/cooperation; `timid` → risk-taking down/composure adjustment; `resourceful` → creativity/initiative). `lucky` adds **no numerical bias**, only an optional read-only legacy badge. Never pretend that three labels uniquely determine 28 historical alleles. Preserve skills, relationships, career histories, existing pregnancies, parentage and saved RNG exactly. A second load cannot recreate or alter genome values.

## 5. One universal activity-score contract

Each activity has **one typed profile** in `personality/activityAptitudes.ts` (name provisional) with signed dimension weights, scale, min/max and the intended beneficiary/outcome. The generic evaluator lives in the existing `personality/traitEvaluation.ts`; it receives a narrow readonly genotype projection and typed activity ID. No owner has a private genetics-weight table.

For activity A, with dimension weights `w_i` and expression `d_i = raw_i - personalMean`:

```text
score(A, person) = clamp( sum(w_i * d_i) / (50 * sum(abs(w_i))), -1, +1 )
factor(A, person) = 1 + cap(A) * score(A, person)
```

- Signed weights encode tradeoffs. For example, risk-taking improves *willingness to attempt a hunt* but raises *injury exposure*; those are two distinct typed activities, not one context used with contradictory signs.
- Typical `cap(A)` should be calibrated around ±10–20% (the figures are **design candidates**, not approved balance). The underlying unmodified chance, duration and opportunity rules remain with their owners; clamp final probabilities and durations appropriately.
- **One result per settler per eligible activity:** choose its sign from the weighted genetic profile, then return one combined factor and a stable typed explanation when requested. Do **not** run a new chance roll for each dimension. A neutral/no-genome state during a transitional load is a safe migration fallback, **not** the final new-settler policy.
- If a weighted sum is *exactly zero*, resolve the sign deterministically from the first relevant non-neutral dimension in the activity's declared priority order. Use a documented minimal ±0.5% impact for that tie only; no hash/hidden dice and no invented second probability roll. If all relevant dimensions are truly neutral, fix the *genome distribution or activity profile* in the generation/validation phase rather than silently manufacturing personality.
- The **individual** modifier must be a buff or debuff for each declared activity; the overall **pair outcome** may be neutral when two people's opposing effects cancel. Do not force an artificial bias into mutual consent or outcomes where neither person has an eligible opportunity.
- For two-person actions, compute each person's individual modifier with the same evaluator and combine them in the **existing pair owner** with a documented, symmetric rule. Eligibility, consent, reciprocal state updates, caps and the existing number of RNG draws remain in that owner.
- Keep calculation cheap: one bounded O(14) genotype-centering pass if no transient expression exists, then 2–5 static signed weights; no allocations / reasons in hot paths, no extra population scan, no new `personDayRoll`, and no automatic job shuffles.

### Worked examples (candidate signed contribution, not final tuning)

| Activity | Relevant dimensions | Why this is not a universal good/bad gene |
| --- | --- | --- |
| Making friends | Sociability +, sensitivity +, cooperation + | A highly independent/low-cooperation settler may struggle |
| Learning | Curiosity +, persistence +, discipline + | Inflexible routine may reduce exploratory learning |
| Reconciliation | Cooperation +, sensitivity +, flexibility + | Strong conflict drive is not always constructive |
| Hunting success | Patience +, perception +, risk-taking + | Boldness helps act but does not ensure safety |
| Hunting safety | Perception +, composure +, risk-taking **−** | The same risk-taking dimension has a downside |
| Courtship initiation | Initiative +, sociability +, perception + | Initiation differs from mutual acceptance |
| Parenting care | Sensitivity +, patience +, cooperation + | Care is contextual; not an unconditional moral label |
| Routine work | Discipline +, persistence +, flexibility **−** | High flexibility may hinder routine consistency |
| Improvising construction | Creativity +, reasoning +, persistence + | Creativity helps here, not automatically everywhere |
| Handling sudden danger | Composure +, perception +, risk-taking **−** | Willingness to risk is not the same as survival |
| Leisure with company | Sociability +, flexibility + | The same sociability can disadvantage solitude |
| Solitude recovery | Composure +, sociability **−** | Different people recover differently |


### Three complete example citizens — one genome, many outcomes

All values below are **illustrative**. They are fourteen inherited values per citizen, not merely three saved labels. The UI could choose three visually strongest descriptors; **all** dimensions remain active in applicable decisions.

| Dimension | Mara | Bram | Lina |
| --- | ---: | ---: | ---: |
| Sociability | 85 | 30 | 60 |
| Sensitivity | 65 | 45 | 90 |
| Cooperation | 80 | 40 | 75 |
| Curiosity | 40 | 85 | 65 |
| Persistence | 45 | 80 | 55 |
| Flexibility | 35 | 55 | 80 |
| Patience | 40 | 75 | 70 |
| Risk-taking | 70 | 30 | 25 |
| Perception | 65 | 85 | 75 |
| Initiative | 72 | 35 | 50 |
| Composure | 45 | 70 | 30 |
| Discipline | 40 | 80 | 40 |
| Analytical thinking | 50 | 85 | 45 |
| Creativity | 55 | 75 | 80 |

**How to calculate:** one activity-specific signed-weighted score, using the §5 formula with the citizen's mean across all fourteen dimensions and **illustrative cap = 20%** (not approved balance). For example, friendship weights are 40% sociability, 25% sensitivity and 35% cooperation; learning weights are 40% curiosity, 35% persistence and 25% discipline. A dimension is **not randomly selected** to decide the result.

| Activity | Mara | Bram | Lina | Real owner to connect |
| --- | ---: | ---: | ---: | --- |
| Making friends | **+8.8%** | −10.0% | +5.1% | §relationships.ts§ |
| Learning | −5.8% | **+7.9%** | −1.9% | §education.ts§ |
| Reconciliation | +2.3% | −6.5% | **+8.4%** | §relationships.ts§ |
| Hunting attempt | +0.6% | +1.1% | −0.7% | §humanHuntingBehavior.ts§ |
| Hunting safety | −1.1% | **+7.8%** | +1.3% | genuine danger/injury owner, if supported |
| Solitude recovery | −7.6% | **+7.5%** | −6.6% | §socialLife.ts§ / actual needs owner |
| Routine work | −2.0% | **+6.1%** | −5.9% | §dailyBuildingEconomy.ts§ |
| Improvised construction | −2.2% | **+7.0%** | +0.6% | §dailyBuildingEconomy.ts§ |

**Worked friendship example (Mara):** her fourteen-value mean is 56.21. The weighted deviation is §0.40×(85−56.21)+0.25×(65−56.21)+0.35×(80−56.21)§ = 22.04; normalized to 22.04/50, with the example 20% cap, gives **+8.8%** to her eligible friendship-growth contribution. This **does not automatically create a friend**: the existing owner still requires proximity/opportunity, handles reciprocal state and enforces friendship caps.

**Learning (same Mara):** curiosity 40, persistence 45 and discipline 40 are all below her personal mean, giving **−5.8%**. Thus Mara is advantaged in building friendships, but disadvantaged at school. Bram is the reverse, with stronger study and solitary work but a harder time making friends. Lina excels at reconciliation but has a routine-work drawback.

For **pair decisions** the owner must combine two individual modifiers, not let Mara's +8.8% automatically force a friendship on Bram. A precondition-free compatibility roll is prohibited. The modifier can influence the *existing* rate or probability after eligibility; no extra dice or parallel decision engine.

### Signed coverage of **all fourteen dimensions** (both directions)

The table below is an explicit **implementation target**, not proof these behaviors already exist. Every row requires at least **one real positive and one real negative** supported decision hook and owner-level tests. If the negative action lacks a real owner/cadence, implement it through the current owner in a separate scoped PR or change the activity contract; **never** mark it done from catalog metadata alone.

| Dimension | Example where high expression helps (+) | Example where high expression hurts (−) | Candidate canonical owners |
| --- | --- | --- | --- |
| Sociability | Initiating friendships | Recovering in solitude | §relationships.ts§ / §socialLife.ts§ |
| Sensitivity | Comforting another settler | Recovering from grief/strain | §socialLife.ts§ / §humanLifecycleCleanup.ts§ |
| Cooperation | Mutual teamwork and reconciliation | Assertive confrontation | §relationships.ts§ / existing confrontation owner |
| Curiosity | Learning or exploration | Repetitive routine jobs | §education.ts§ / §dailyBuildingEconomy.ts§ |
| Persistence | Completing long difficult work | Abandoning an unproductive approach | §dailyBuildingEconomy.ts§ / existing task-choice owner |
| Flexibility | Reconciliation/plan changes | Sticking to a fixed routine | §relationships.ts§ / §dailyBuildingEconomy.ts§ |
| Patience | Stalking prey, careful work | Reacting quickly to a surprise | §humanHuntingBehavior.ts§ / §humanTick.ts§ |
| Risk-taking | Starting a difficult hunt | Avoiding needless hunting danger | §humanHuntingBehavior.ts§ / existing danger owner |
| Perception | Spotting prey or social signals | Resisting distractions in a crowd | §humanHuntingBehavior.ts§ / §socialLife.ts§ |
| Initiative | Initiating a courtship | Coordinating during shared work | §humanTick.ts§ / §dailyBuildingEconomy.ts§ |
| Composure | Remaining calm during danger | Promptly responding to distress | §humanTick.ts§ / §socialLife.ts§ |
| Discipline | Repetitive attended work | Improvising under disruption | §dailyBuildingEconomy.ts§ |
| Reasoning | Studying or conducting research | Making immediate decisions under time pressure | §education.ts§ / existing time-critical decision owner |
| Creativity | Solving construction problems | Maintaining strict repetitive procedure | §dailyBuildingEconomy.ts§ |

**No claim of universal best DNA:** each dimension's activity weights must be signed in both directions **and** both activities must be actually reachable. A settler's positive and negative activity outcomes are required across a representative activity portfolio, not an automatic + and − rolled every single tick. Even when a settler has a −8% friendship modifier, friendship remains possible; DNA changes likelihood or speed, not eligibility.

**No genetic conception context:** pregnancy/fertility is deliberately outside this table. The current §family/conception§ legacy context is retired at the documented code cutover without any replacement. §lucky§, §reasoning§, §perception§ and other dimensions do **not** alter conception.

## 6. Live owner integration matrix (mandatory, not cosmetic)

A row is **DONE only when the real existing decision consumes the score and a focused owner-level test demonstrates a non-neutral outcome**. This is not satisfied by catalog-only tests or a UI description.

| Existing owner | Approved type of hook | Example activities | Preserve |
| --- | --- | --- | --- |
| `relationships.ts` | Friendship-gain and reconciliation rate at actual pair bump/reconcile | making friends, maintaining bonds, reconciliation | Reciprocity, 6-close-friend cap, pair budget, feud locks |
| `simulation/humanRelationships.ts` | Eligible attraction/approach decisions; **remove Lucky ×1.15 at married/youth conception, leave conception non-DNA** | initiating romance, relationship maintenance, affair temptation; conception uses only owner baseline | Two-person agency, fertility gates, existing roll salts 603/604/605 and no personality conception substitute |
| `humanTick.ts` | Courtship speed and genuine social encounter selection | courtship, approach | Scheduling, cooldowns, partners, no extra tick loop |
| `socialLife.ts` | Existing off-duty motive/venue opportunity | company, solitude, community participation, coworker banter | Work/rest/health/childcare priority; no optional fake event |
| `education.ts` | Real school/research credit event | learning, research, teaching | Age, presence, graduation and education-derived baseline |
| `apprenticeships.ts` | Existing actual taught session | trade learning, mentoring | Master selection, graduation and one skill writer |
| `skills.ts` / `dailyBuildingEconomy.ts` | Actual attended production and construction | farming, blacksmithing, building, routine work | Same-day attendance, full-store credit, actual crew, one production writer |
| `workforce.ts` / `careers/workerFit.ts` | **Advisory tie-break only** | aptitude for available profession | Commute, skill, manually assigned workers and 60-day cooldown take precedence |
| `humanHuntingBehavior.ts` / `humanTick.ts` | Existing hunt, pursuit and escape choice | catching prey, risk avoidance | Valid prey, actual danger, spatial rules and existing rolls |
| `militiaBalance.ts` | Per-eligible soldier contribution | courage/defense effectiveness | Equipment and muster eligibility; no whole-army DNA bonus |
| `simulation/humanPhysiology.ts` | Existing on-shift fatigue/recovery event | labor endurance, recovery | Walking ≠ labor, player needs owner ≠ captive energy |
| `warPrisoners.ts` | Existing per-villager civic voice | mercy/severity/negotiation disposition | One vote per category, eligibility and original final decision owner |
| `humanLifecycleCleanup.ts` | Existing grief transition | grief adjustment/recovery | Old partner links, affair grief and max clock guard |
| `components/PersonalityCareerDetails.tsx` | **Read-only** activity breakdown and 3 derived highlight labels | All 14 dimensions, personal +/− topics, optional old-save Lucky **flavour badge**, skills/career | Same computed score; no UI-side scoring rules, no DNA Lucky |

**Coverage ledger requirement:** record each typed activity, owner function, actual opportunity, score field used, probability/duration meaning, RNG source, baseline behavior, positive and negative seeded test, and whether a previous PR-C `legacyExact` rule was removed. An activity with no real owner hook must not appear as “implemented” in the trait catalog or inspector.

## 7. PR-C compatibility / numerical migration

Old PR #97 has six *exact-parity* hooks (courtship ×1.4/×0.7/×1.2, Lucky conception ×1.15, Intuitive workplace chance 0.11 versus 0.08, Stoic five versus seven grief days, civic restraint/severity voices, five cross-person feud clashes).

1. Treat these as the **baseline**, not as proof that the new continuous personality model already works.
2. During rollout, each relevant decision uses **either** its old exact rule **or** the new 14-dimensional activity score, **never both**. **Conception is an explicit exception:** remove Lucky ×1.15 and preserve the non-DNA baseline; do not replace it with an activity score, and do not use any gene modifier at conception.
3. Give each of the six a targeted **AS-IS → TO-BE** balance specification with concrete expected probability/duration bounds and seeded owner tests. **Conception's TO-BE** is the original baseline without the two ×1.15 Lucky terms, with unchanged salts, eligibility and affair route. For other owners the new activity model intentionally changes some decisions; record those as rebalances, never claim bitwise PR-C parity after cutover.
4. Keep legacy-exact context names temporarily while their owners still depend on them. Retire catalog entries, old `TRAIT_OPPOSITIONS`, `traits.includes` gameplay consumers and their legacy scanner exemptions **only after** corresponding owner-boundary tests prove the replacement.
5. Preserve friendships, existing marriages, pregnancies, grief status, parentage and other history **as data**. Never recompute historical choices from new DNA.

## 8. Quantitative guarantees and tests

Required gates:

- **Structural:** each valid living settler has exactly fourteen dimension values in **one** genome; **no luckyAlleles / special locus / newborn categorical trait roll**; the old 3-of-14 labels are only read-only compatibility metadata, never new character genes. Test old-save normalization, double-load idempotence and unchanged active RNG snapshot.
- **Genetic:** seeded founders and siblings are reproducible; biological inheritance takes one allele from each biological parent at **each of 14 axes**; mutations respect bounds; Moon Howler preserves genotype. Explicitly assert no Lucky inheritance, no Lucky chance modification and no extra gameplay RNG draws.
- **No universal best settler:** every *dimension* must contribute with a positive weight to at least one real live activity and a negative weight to another; on generated and migrated profiles, over the approved meaningful activity portfolio, every settler has **at least one positive and one negative activity**. This is an explicit property test over multiple seeds and generations; if it fails, correct the distribution/activity weights, not the test.
- **Per activity:** every defined eligible activity obtains an individual modifier (nonzero except explicitly documented impossible/legacy fallback); both beneficial and disadvantageous profiles must be reachable; monotonicity of an activity's declared signed inputs; no duplicate modifiers and no invented random roll.
- **Owner integration:** genuine friendship gain, reconciliation, age-appropriate learning, attended work, hunting decision, courtship, grief, civic votes, social leisure and workforce tie behavior are tested **through their actual owners**, not evaluator-only fixtures. Repeat across diverse DNA profiles, with existing guards and manual overrides.
- **Save boundaries:** preserve optional old Lucky label as *flavour-only* legacy metadata; other old labels deterministically map into the new genotype; safely migrate prior saves without losing careers, parentage or relationships; worker/fallback produces the same seeded decisions; rollback and save→load→save retain the fourteen-axis genotype.
- **Performance:** fixed-seed small/medium/large representative colonies including 750 and 1,800+ persons, plus a real-day/long-run stress gate where affected owner cadence warrants it. Compare p95, average, memory, worker traffic and event counts against the same baseline. No new global scans or per-tick reason allocations.
- **CI:** run existing typecheck, lint, build, standard integration, ownership/decision registry and DNA legacy-audit checks. A currently unrelated `main` CI failure must be reported independently; it must not be waived or misrepresented as an overhaul pass.

A **coverage test** enumerates the activity registry and checks that each entry is referenced by one verified live owner. A separate **signed-effect reachability test** demonstrates observable positive and negative outcomes for each entry. “29 effect entries exist” does not count as completion.

## 9. Implementation sequence — no parallel pipelines

1. **Phase 0: acceptance baseline.** Freeze/record current owners, event cadence, seeded PR-C outcomes, old-save fixtures, skill/career data and measured performance. Agree on dimension IDs, source-of-truth, weights and maximum effects. Mark the old A–E plan as *legacy architecture* only when the new design is approved; do not silently overwrite historical records.
2. **Phase 1: genetics + migration, no gameplay change.** Versioned `GenomeV2` with fourteen inherited axes **only**, one authoritative founder/birth/legacy normalization, persistence, worker/Moon Howler safety and genealogy tests. Keep existing live calculations isolated while migrating; the planned conception cutover explicitly removes Lucky later. Update both ownership registries, changelog and bug reports as relevant in the same PR.
3. **Phase 2: one evaluator + approved activity registry.** Add typed signed activity profiles and one read-only evaluator; unit and property tests; no duplicated trait effect math or generic alias wrappers. Write a complete live-owner coverage ledger **before** claiming it is integrated.
4. **Phase 3: migrate existing decisions in bounded owner batches.** Do work/education/danger, then friendship/social/romance/family/civic. **Conception must explicitly drop Lucky ×1.15 at both married/youth owner sites and must remain non-DNA;** test unchanged eligibility and 603/604/605 decision salts. Every other owner batch removes the replaced old term **in the same PR**, proves owner-level buff/debuff and guards, logs deliberate rebalances, and adds no extra rolls, clocks or full-world scans. Keep workforce and career writers unchanged.
5. **Phase 4: inspector and legacy retirement.** Make `PersonalityCareerDetails.tsx` display fourteen inherited dimensions, three **derived highlight descriptors** and real activity-specific +/− results from the single evaluator. Show old Lucky only as a read-only historic badge if present, without implying inheritance or chance. Delete retired label-driven gameplay branches **only after** all calling sites and save fixtures migrate. Keep old IDs for save compatibility as long as needed; no mystery UI-only effects.
6. **Final acceptance:** catalog activity reachability 100%, no unreachable promised bonus/drawback, each valid settler has a buff **and** a debuff across actual supported gameplay contexts, seeded saves/worker parity and owner-boundary tests pass, performance shows no unacceptable regression.

**Owner bookkeeping:** for *every function* added or modified, update `OWNERSHIP_OVERVIEW.md`; update `src/game/simulation/decisionRegistry.ts` for the pure genetic evaluator (`writes: []`, on-demand), all affected decision owners with their true cadence/callers/field writes, and the existing genetics owner. Update `CHANGELOG.md` and report discovered bugs under the existing `docs/bug_report/readme.md` protocol and its sole index. No redundant aliases, re-export barrels, duplicate scoring tables, secondary relationship managers, hidden RNG streams or separate AI loops.

## 10. Definition of done

Not “fourteen DNA names,” not “a green catalog test,” and not “six PR-C migrations.” Done means the actual simulation uses **fourteen inherited general aptitudes for everyone**, **no inherited Lucky or personality-linked conception bonus**, **one explainable combined buff/debuff per eligible activity** (except intentionally non-DNA decisions such as conception), meaningful strengths *and* weaknesses for every settler across activities, and unchanged ownership of careers, skills, relationships and decisions. All of it survives old saves, birth, form transformations, workers and long-running populated colonies with measured verification.

**This document is a proposed replacement architecture. It is not implementation, test evidence, or approval to overwrite old-save genetics or adjust gameplay without the staged gates above.**
