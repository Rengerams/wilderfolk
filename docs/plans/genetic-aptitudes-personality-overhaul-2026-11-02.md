# Wilderfolk — Genetic aptitudes and personality overhaul

**Status:** ARCHITECTURE PROPOSAL, not implemented. **Date:** 2 November 2026. **Baseline inspected:** `405a1aefae6fa9bf17aaa410d289efa77c415660` on `main`. No gameplay change is authorized merely by merging this document.

**Design goal:** Every settler carries *all fourteen* heritable, broadly reusable aptitude dimensions. For every supported real-world activity, the existing decision owner obtains **one** combined personal advantage or disadvantage from the relevant dimensions. Every settler must demonstrably possess some advantages **and** some disadvantages across the supported activity portfolio. `Lucky` remains inheritable, but is an **additional special gene**, never one of the fourteen personality dimensions. Skills, careers, relationships, needs, environment and opportunity remain separate inputs.

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
       14 aptitude allele pairs       special Lucky allele pair
                |                               |
          expressed profile              situational rare luck
                |                               |
                +----------+--------------------+
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
- **Extra inherited genes:** `Lucky` is a separate optional special trait, transmissible by parents. It is not sociability, intelligence or a universal improvement to every result.
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

### Lucky: inherited, but not a fifteenth general dimension

Use an independent two-allele Lucky locus with alleles `0 | 1`; a child receives one allele from each biological parent through the existing genetics RNG owner. A carrier can pass the allele; there is **no guarantee** a child expresses it. One `1` allele may express Lucky (dominant representation), subject to a documented game-balance decision. An old save with categorical `lucky` maps deterministically to a carrier, preserving its historical expression. Other legacy labels are not extra special genes.

Lucky may nudge a **short, explicitly enumerated list** of genuine random outcomes (for example the pre-existing eligible conception probability or an existing rare windfall), and only inside the **same existing owner roll**. It cannot improve every job, consent, friendship or learning score and it never introduces a new random roll at every DNA evaluation.

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
  readonly aptitudeAlleles: readonly (readonly [Allele, Allele])[]; // 14 fixed-order pairs
  readonly luckyAlleles: readonly [0 | 1, 0 | 1];
}
```

- Keep **one** ordered ID declaration; index and validation derive from it. Do not maintain duplicate per-trait maps or alias/re-export layers. Validate exactly fourteen allele pairs, fixed order, finite integer bounds, no extra keys/arrays, and a valid version.
- `settlerTraits.ts` remains the **one genetics owner** for founder allocation, parent-to-child allele transmission and deterministic legacy backfill; extend/replace it in a reviewed migration rather than adding a parallel `geneticsManager`.
- `Entity` obtains **one** optional `genomeV2` while migrating, listed once in `ENTITY_PERSISTED_FIELDS` with normalization in `saveLoad.ts`. After migration and owner cutover, `genomeV2` is the authoritative genotype. The existing `traits` field remains read-only *legacy compatibility data* until a separate, measured retirement step.
- No persistent duplicated `aptitudeScores`, `traitEffectValues` or cached per-activity modifiers. A direct, uncached expression may need all fourteen alleles to derive the individual's mean, **plus** the 2–5 activity-relevant dimensions; this remains fixed-size O(14), not O(population). Benchmark hot consumers before considering any owner-owned transient cache. The selected-settler inspector may derive all fourteen on demand.
- Worker transfer, `simWorker/simPrep.ts` rollback, `simBuffers/simDelta.ts` and Moon Howler transform/revert must preserve the *same person and same genome*. No top-level duplicate worker delta or automatic reroll on form changes.

### Genetic allocation and inheritance

1. **Founders:** draw fourteen allele pairs with the current seeded genetics RNG stream; enforce a reasonable spread (not all fourteen midpoint or all identical). Record the distribution and mutation parameters as explicit balancing constants, not unexplained numeric salts.
2. **Children:** choose **one of the two alleles from each biological parent for each dimension** using the established parentage and one genetics RNG owner; a documented rare bounded allele mutation may occur at birth. Do not substitute social/legal parent for biological parent. No new recurring genome rolls.
3. **Expression:** a dimension's raw inherited value is the mean of its two alleles (0–100). For gameplay use a *relative expression* centered on that person's fourteen-dimension mean; this prevents a settler with universally high raw values from being universally best. The genome remains immutable. Explain both raw and relative values in UI.
4. **Diversity constraint:** generation/migration must ensure at least two meaningfully different expressed dimensions on opposite sides of the personal mean. This is checked at **birth/backfill only**, not by continuously rewriting inherited alleles. If parental alleles yield a degenerate profile, apply a documented tiny birth-time mutation using the same genetics stream; log and test the exception.
5. **Old saves:** use an ID/colony-seed local migration stream, independent of the live RNG. Convert pre-existing categorical labels through **one versioned legacy-phenotype mapping** into small, bounded dimension biases. Do not pretend that three old labels uniquely reveal 28 historical alleles. Preserve valid historical traits, skills, relationships, career history, parentage and saved RNG state.

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

## 6. Live owner integration matrix (mandatory, not cosmetic)

A row is **DONE only when the real existing decision consumes the score and a focused owner-level test demonstrates a non-neutral outcome**. This is not satisfied by catalog-only tests or a UI description.

| Existing owner | Approved type of hook | Example activities | Preserve |
| --- | --- | --- | --- |
| `relationships.ts` | Friendship-gain and reconciliation rate at actual pair bump/reconcile | making friends, maintaining bonds, reconciliation | Reciprocity, 6-close-friend cap, pair budget, feud locks |
| `simulation/humanRelationships.ts` | Eligible attraction, affair approach and conception decisions | initiating romance, relationship maintenance, affair temptation | Two-person agency, fidelity is never guaranteed, fertility gates, existing roll ownership |
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
| `components/PersonalityCareerDetails.tsx` | **Read-only** activity breakdown | 14 dimensions, personal +/− topics, Lucky, skills/career | Same computed score, no UI-side rules |

**Coverage ledger requirement:** record each typed activity, owner function, actual opportunity, score field used, probability/duration meaning, RNG source, baseline behavior, positive and negative seeded test, and whether a previous PR-C `legacyExact` rule was removed. An activity with no real owner hook must not appear as “implemented” in the trait catalog or inspector.

## 7. PR-C compatibility / numerical migration

Old PR #97 has six *exact-parity* hooks (courtship ×1.4/×0.7/×1.2, Lucky conception ×1.15, Intuitive workplace chance 0.11 versus 0.08, Stoic five versus seven grief days, civic restraint/severity voices, five cross-person feud clashes).

1. Treat these as the **baseline**, not as proof that the new continuous personality model already works.
2. During rollout, a decision uses **either** old exact rules **or** the new 14-dimensional activity score, **never both**. For any retained Lucky special effect, the *special gene* remains a separately documented deliberate influence on the **same existing roll**.
3. Give each of the six a targeted **AS-IS → TO-BE** balance specification with concrete expected probability and duration bounds and seeded behavioral tests. The new system necessarily changes some results: flag this as intentional balance work, never claim bitwise PR-C parity after cutover.
4. Keep legacy-exact context names temporarily while their owners still depend on them. Retire catalog entries, old `TRAIT_OPPOSITIONS`, `traits.includes` gameplay consumers and their legacy scanner exemptions **only after** corresponding owner-boundary tests prove the replacement.
5. Preserve friendships, existing marriages, pregnancies, grief status, parentage and other history **as data**. Never recompute historical choices from new DNA.

## 8. Quantitative guarantees and tests

Required gates:

- **Structural:** each valid living settler has fourteen dimension values; a separate inherited Lucky locus; no stale 3-of-14 roll used for *new* characters after cutover; old-save normalization, double-load idempotence and no changed active RNG snapshot.
- **Genetic:** seeded founders and siblings are reproducible; biological inheritance takes one allele from each parent, mutation respects bounds; Lucky carrier transmission from each parental genotype is tested; Moon Howler preserves identity.
- **No universal best settler:** every *dimension* must contribute with a positive weight to at least one real live activity and a negative weight to another; on generated and migrated profiles, over the approved meaningful activity portfolio, every settler has **at least one positive and one negative activity**. This is an explicit property test over multiple seeds and generations; if it fails, correct the distribution/activity weights, not the test.
- **Per activity:** every defined eligible activity obtains an individual modifier (nonzero except explicitly documented impossible/legacy fallback); both beneficial and disadvantageous profiles must be reachable; monotonicity of an activity's declared signed inputs; no duplicate modifiers and no invented random roll.
- **Owner integration:** genuine friendship gain, reconciliation, age-appropriate learning, attended work, hunting decision, courtship, grief, civic votes, social leisure and workforce tie behavior are tested **through their actual owners**, not evaluator-only fixtures. Repeat across diverse DNA profiles, with existing guards and manual overrides.
- **Save boundaries:** preserve old categorical legacy metadata while transitioning; safely migrate previous saves; worker/fallback produces the same seeded decisions; rollback and save→load→save retain genotype and Lucky.
- **Performance:** fixed-seed small/medium/large representative colonies including 750 and 1,800+ persons, plus a real-day/long-run stress gate where affected owner cadence warrants it. Compare p95, average, memory, worker traffic and event counts against the same baseline. No new global scans or per-tick reason allocations.
- **CI:** run existing typecheck, lint, build, standard integration, ownership/decision registry and DNA legacy-audit checks. A currently unrelated `main` CI failure must be reported independently; it must not be waived or misrepresented as an overhaul pass.

A **coverage test** enumerates the activity registry and checks that each entry is referenced by one verified live owner. A separate **signed-effect reachability test** demonstrates observable positive and negative outcomes for each entry. “29 effect entries exist” does not count as completion.

## 9. Implementation sequence — no parallel pipelines

1. **Phase 0: acceptance baseline.** Freeze/record current owners, event cadence, seeded PR-C outcomes, old-save fixtures, skill/career data and measured performance. Agree on dimension IDs, source-of-truth, weights and maximum effects. Mark the old A–E plan as *legacy architecture* only when the new design is approved; do not silently overwrite historical records.
2. **Phase 1: genetics + migration, no gameplay change.** Versioned `GenomeV2`, Lucky locus, one authoritative founder/birth/legacy normalization, persistence, worker/Moon Howler safety and genealogy tests. Keep old live behavior until consumers migrate. Update both ownership registries, changelog and bug reports as relevant in the same PR.
3. **Phase 2: one evaluator + approved activity registry.** Add typed signed activity profiles and one read-only evaluator; unit and property tests; no duplicated trait effect math or generic alias wrappers. Write a complete live-owner coverage ledger **before** claiming it is integrated.
4. **Phase 3: migrate existing decisions in bounded owner batches.** Do work/education/danger, then friendship/social/romance/family/civic. Every batch removes the replaced old term **in the same commit/PR**, proves owner-level buff/debuff and guard behavior, logs deliberate rebalances, and adds no extra rolls, clocks or full-world scans. Keep workforce and career writers unchanged.
5. **Phase 4: inspector and legacy retirement.** Make `PersonalityCareerDetails.tsx` display fourteen inherited dimensions, Lucky separately, and real activity-specific +/− results from the single evaluator. Delete retired label-driven gameplay branches **only after** all calling sites and save fixtures have migrated. Keep legacy IDs for save compatibility as long as required; no mystery effects appearing only in UI.
6. **Final acceptance:** catalog activity reachability 100%, no unreachable promised bonus/drawback, each valid settler has a buff **and** a debuff across actual supported gameplay contexts, seeded saves/worker parity and owner-boundary tests pass, performance shows no unacceptable regression.

**Owner bookkeeping:** for *every function* added or modified, update `OWNERSHIP_OVERVIEW.md`; update `src/game/simulation/decisionRegistry.ts` for the pure genetic evaluator (`writes: []`, on-demand), all affected decision owners with their true cadence/callers/field writes, and the existing genetics owner. Update `CHANGELOG.md` and report discovered bugs under the existing `docs/bug_report/readme.md` protocol and its sole index. No redundant aliases, re-export barrels, duplicate scoring tables, secondary relationship managers, hidden RNG streams or separate AI loops.

## 10. Definition of done

Not “fourteen DNA names,” not “a green catalog test,” and not “six PR-C migrations.” Done means the actual simulation uses **fourteen inherited general aptitudes for everyone**, a separately inherited Lucky trait, **one explainable combined buff/debuff per eligible activity**, meaningful strengths *and* weaknesses for every settler across activities, and unchanged ownership of careers, skills, relationships and decisions. All of it survives old saves, birth, form transformations, workers and long-running populated colonies with measured verification.

**This document is a proposed replacement architecture. It is not implementation, test evidence, or approval to overwrite old-save genetics or adjust gameplay without the staged gates above.**
