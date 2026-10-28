# Coding-agent execution — Wilderfolk DNA + Career 0.6.5.2

**Task class:** implement features. **Status:** NOT IMPLEMENTED by this document.
**Authoritative design:** [DNA, personality and career architecture](personality-career-single-pipeline-0.6.5.2.md).
**Feature targets:** roadmap §11 and §16 (the old §17 was renumbered).
**Order:** A → B → C → D → E. Start with the earliest unfinished stage; don't introduce placeholder APIs for future stages. Each PR must be self-contained and pass its own required tests; persistence for a new field must land in the **same** PR that introduces it.

## 0. Do this before any implementation

- Read `AGENTS.md`, `docs/command.md`, `OWNERSHIP_OVERVIEW.md`, `src/game/simulation/decisionRegistry.ts`, the complete linked architecture plan and `package.json`. Follow the shell verification in AGENTS and inspect the current branch and recently changed files.
- Search existing implementation before adding new code; the architecture plan is an evidence-based snapshot of main, not a licence to ignore concurrent changes.
- Prepare a mini-RFC: **Problem:** DNA effects scattered across owners, and no bounded career history. **Solution:** pure single evaluator plus only distinct new career writers. **Risks:** duplicate multipliers, changed RNG/cadence, automatic job shuffling, worker/save parity, overlapping ownership. **Scope:** one numbered PR phase at a time.
- **Mandatory for every PR A–E:** update `OWNERSHIP_OVERVIEW.md` **and** `src/game/simulation/decisionRegistry.ts` **and** `CHANGELOG.md`. Both registry files must occur in the PR diff; they must describe the code that actually exists in *that* PR, not planned future features.
- **Mandatory for every discovered bug:** read `docs/bug_report/readme.md`, check for duplicates, write a new report to `docs/bug_report/` if distinct, and add/link it in the one index `docs/BUG_REPORTS/SUMMARY.md`. Report confirmed defects even if fixed in the same PR. The old `docs/BUG_REPORTS/` reports remain historical.
- Import directly from the true owning file. **NO aliases, NO re-exports, NO barrel `index.ts`, NO duplicated trait tables, NO new general-purpose manager, NO wrapper functions that only forward to the evaluator, NO parallel world state, NO independent trait scheduler**.
- Never mark roadmap features completed before their code is **merged**. Do not change game version merely for a plan.

## 1. Shared architecture contract

Single trait calculation path:

```text
Entity.traits  →  personality/traitEffectCatalog.ts
                     ↓
             personality/traitEvaluation.ts
               evaluateTraitInfluence(subject, context, options?)
                     ↓
        one pure { factor, tendency, reasons } projection
                     ↓
            direct imports from EXISTING owners
                     ↓
            EXISTING owner performs the sole mutation
                     ↓
  optional separate NEW career history / milestones writer
```

- Use the existing 14 `SettlerTrait` literal IDs and birth/inheritance logic. All 14 have situational benefit *and* drawback. Do not create a second genotype, reroll traits on load, or copy `TRAIT_DEFS` labels.
- Make `evaluateTraitInfluence` pure and deterministic: pass a narrow readonly projection, not a whole `WorldState` or full entity graph; use discriminated context, no RNG/time/mutation, bounded `factor` and `tendency`. Explanation `reasons` are opt-in and absent from hot paths (no arrays, Maps, Sets, strings or closures per ordinary evaluation). `Readonly<Entity>` alone is shallow: prohibit mutation of its nested arrays/objects explicitly.
- **Approved balance change (28 October 2026): legacy DNA-specific multipliers may be removed.** Use the **one** catalog/evaluator as the sole trait-rule source at each migrated decision; the initial `0.85..1.15` cap and diminishing returns apply to new contextual factors. Do **not** retain an old DNA multiplier solely to preserve its number, and never stack old and new effects. Preserve **non-DNA** baselines, employment/eligibility guards, event cadence and state owners. Audit old Resourceful, Chivalrous, Insightful research, captive cold/energy, Brave hunting, Timid escape, conception and social effects by actual callers: document which legacy trait term disappears and what contextual effect (if any) replaces it. No trait effect is invented for an inapplicable context. Negative effects need real reachable decisions, not invented meters.
- Skills, apprenticeship, school, staff assignment, relationships, pregnancy, warfare, health and economy keep their current canonical writers. Never add a second setter for their fields. Career history/milestones are distinct *new* optional saved fields with their own owner. **Skill gain does not establish a worked shift**: `gainSkill` is also used by construction, education and apprenticeships.
- Runtime warfare remains aggregate/simulated; no active tower/projectile or realtime combat.

## 1.1 Mandatory old-save migration and forward compatibility

**A feature that adds a persisted field must ship its complete migration in that same PR (life experience, if introduced, in PR C; career history and milestones in PR D). Do not postpone this to PR E. Old saves must load and acquire the new properties automatically.**

1. **Existing DNA survives intact:** valid saved `traits` (including 1–3 traits), skills, personal links, history and age are not rerolled, reordered or overwritten. Do not add a 15th trait ID or automatically append newly defined trait IDs to existing DNA, as that would rewrite previously established genetics. Newly implemented *effects* for an already saved trait apply immediately and are **derived at evaluation time**; never persist a stale per-trait multiplier on every person.
2. **Genuinely absent DNA:** for a legacy saved human with no valid `traits` array, fill the missing baseline DNA traits deterministically using the canonical trait catalog, exclusion constraints and birth/allocation weighting. Reuse the existing `settlerTraits.ts` owner: expose a small **injected-RNG seam in its canonical allocation logic only if required**, not a competing second genetic roll. Use the verified persisted `worldMap.seed` (or validated saved `simRng.seed` fallback) plus entity ID with **existing** `simRng.createSeededRng` or `seededRandom`; do **not** call the global `getSimRng('settlerTraits')` during load, and do not perturb live or saved RNG stream positions. Do not extend an existing nonempty valid set just to reach three slots. Use stable entity-ID iteration to avoid entity array ordering differences. This backfill is **required in PR B** for a legacy human genuinely lacking DNA; add a focused missing-DNA regression there, plus dual registry updates. Keep it out of PR A because A must be behavior-neutral.
3. **New optional fields:** every eligible surviving human gets a safe neutral **effective** default for new bounded career and personal-memory fields **only when absent**. Prefer `undefined` / derived defaults in storage to avoid allocating a new empty object for every settler on large colonies; persist a compact record only when genuinely needed. Old saves therefore gain the new *behavior* immediately and gain saved objects lazily on first real progress.
4. **History cannot be invented:** historical worked days, specializations, friendships, grievances, life events or apprentice hours cannot be inferred from current skill or job title alone. Initialize new counters/milestones neutrally; optionally reconstruct only from an actual durable event record if the code proves it unambiguously. Existing skills, graduation, apprentice status and relationships remain fully effective.
5. **Validate existing non-null records:** accept only recognized JobType keys, finite nonnegative integer days and bounded counters/timestamps, and supported milestone codes. Missing/old data is normalized; malformed present data is rejected with the existing save-load reason or safely normalized only according to an explicit documented rule. Do not let NaN, Infinity, string numbers, negative days, enormous keys or cyclic references enter simulation; ensure idempotent load→save→load.
6. **Canonical save path:** add each new field to `Entity` in `gameTypes.ts` and `ENTITY_PERSISTED_FIELDS` in `saveSchema.ts`; wire normalization into the existing `saveLoad.ts` entity migration/hydration once, after the loader's defensive copy, without a second save format or blind world-wide default allocations. Check `COMPATIBLE_SAVE_VERSIONS` and leave supported `0.6.5.0` / current-version saves loadable. If a future version bump is required, update the actual compatibility policy and player message together, never only the display number.
7. **Worker, rollback and form state:** the tick delta transports complete entities (`simBuffers/simDelta.ts`); **do not add duplicate top-level delta fields**. The rollback prep explicitly copies nested entity objects (`simWorker/simPrep.ts`): add a deep copy of any new mutable career/memory record so rollback cannot leak post-snapshot mutations. Check host↔worker clone and save/load using `tests/workerBoundary.closure.test.ts`. If Moon Howler transformation can mutate or reset the new fields, inspect `moonHowler.ts` / `moonHowlerForm.ts`; ensure restored humans retain their career data without creating a second snapshot owner.
8. **Proof fixtures:** create `tests/personalityCareer.oldSaveMigration.test.ts` by extending the existing save testing conventions. Test: (a) old save lacking all new fields, (b) legacy save lacking `traits`, (c) old valid partial DNA unchanged, (d) existing real skills preserved with zero fabricated work history, (e) invalid new values handled deterministically, (f) idempotent double load, (g) save→load→save, (h) actual worker tick delta and prep rollback, (i) form transform/revert and (j) unchanged RNG state. Keep a compact pre-upgrade fixture/source representation rather than rewriting a snapshot to the new schema.

**Done means:** an old colony gains all applicable new gameplay influences on load, without disappearing citizens, changed prior traits, fabricated life stories, shifted RNG or lost work history after worker/save boundaries. Old-save tests must first prove the missing-field case (not simply load a newly generated world).

## 1.2 Approved PR B cutover — replace legacy DNA factors, not legacy systems

**Architecture decision (28 October 2026):** the user explicitly permits retiring **legacy DNA numeric bonuses/penalties**. This supersedes earlier wording about preserving Resourceful +10%/worker (cap +30%), Chivalrous flat militia +8%, Hardy ×0.85, Fierce ×0.90, Greenthumb winter ×0.70, Brave hunting ×1.25/×1.20 and Timid escape ×1.35. These values remain **AS-IS reference facts for regression/rebalance tests, not mandatory TO-BE output targets**. Do not preserve one merely because it already exists. Keep non-DNA equations and gameplay eligibility unchanged unless an independently authorized feature requires otherwise.

| Current AS-IS owner and effect | Required TO-BE integration in PR B | Unchanged owner / guard |
| --- | --- | --- |
| `skills.getWorkerSkillMultiplier`: Resourceful +10%/eligible crew member, cap +30%, even when the site is not a Builder's job | Remove the old Resourceful trait-specific addition. For **construction**, use the existing `work/builder/construction` evaluator context on the eligible construction crew, exactly once; for **production**, use `work/<site job>/production` exactly once. Never leave the old construction bonus alongside the catalog's Resourceful construction effect | `skills.ts` computes crew factor; `dailyBuildingEconomy.ts` advances construction/output; established skill/attendance rules remain |
| `militiaBalance.computeMilitiaBreakdown`: Chivalrous `traits.includes` yields a flat +8% raw militia once if any musterable protector exists | Remove the old `+8%` global rule and its direct trait check. Evaluate `danger/defense` for **each already-eligible mustered soldier** and apply its bounded factor only to that soldier's attributable fighting contribution; combine with existing baseline/gear without multiplying entire army by one soldier's DNA. Chivalrous and Fierce both follow catalog rules; no second special Chivalrous branch | `canBeMustered` still excludes rivals, visitors, children, imprisoned and deployed soldiers; `militiaBalance.ts` remains sole final-strength writer; aggregate rounding remains consistent |
| `simulation/humanNeeds.humanEnergyLoss`: foreign-captive Greenthumb ×0.70 only in unheated winter, Hardy ×0.85, Fierce ×0.90 | Remove those **three hardcoded DNA terms** and `traitMultiplier` import from this consumer; keep its base/cold/home/hospital energy equation untouched. Apply the canonical `physiology/cold` or other existing context **only if a currently catalogued applicable effect exists and the genuine foreign-captive situation qualifies**; otherwise neutral DNA is correct. Do not invent cold/defense modifiers solely to recreate old numbers | Foreign war captives still use `humanNeeds` / `entity.energy`; player settlers still use `humanPhysiology` / `entity.needs`. Never merge the two state machines |
| `humanPhysiology.advanceHumanNeeds`: new `physiology/labor` evaluator affects negative stamina rates for work **and walking** | Keep this owner and evaluator, but constrain the labor-specific context to **actual work**, or document an explicit distinct applicable walking context. No implicit Hardy work endurance while merely walking | The existing nutrition/rest/stamina state owner, needs recovery, duty and rate gates remain |
| `humanHuntingBehavior`: old Brave range ×1.25 and chase ×1.20; `humanTick`: old Timid flee ×1.35 | Old values may change: use the canonical `danger/hunting` and `danger/escape` evaluator factors once, with no raw `traitMultiplier` branches left. Tests prove deterministic relevant benefit/drawback and no double application, **not equality to retired bonuses** | Hunting/prey eligibility, chase/flight state owners, targeting and movement rules remain |
| `education.getEducationResearchMultiplier`: old Insightful +3% per adult, cap +15%, even after catalog adoption via a `factor > 1` boolean | Keep the **education-derived baseline**, but remove the old standalone trait-specific count/scale/cap. Calculate the contextual **research DNA contribution** from `school/research` factor for eligible existing adults and apply **once** to the research term; prevent an Insightful bonus from being counted twice | `education.ts` owns research influence and schooling; `research.ts` stays the research writer |

**Boundary rules:** `personality/traitEffectCatalog.ts` is the only trait-effect table; `evaluateTraitInfluence` is the only combined effect evaluator. Existing owners apply the **returned bounded factor** to their own calculations without making a new trait ruleset, wrapper, generic manager, clock or `WorldState` lookup. The catalog cannot decide whether someone is imprisoned, at work, winter-exposed, a real soldier, a legitimate apprentice or eligible for education; that remains in the established domain owner. Do not change DNA inheritance, the saved three slots, the 50%-per-parent-trait roll or RNG during save load.

**Mandatory cutover and tests for PR B:**
1. Record the **AS-IS → TO-BE** rule map above in the actual PR and remove every replaced legacy DNA term in the **same commit/PR** as its integrated replacement. No inactive second factor and no "temporarily retained" fallback. Explicitly document intentional net balance changes without pretending old numerical outputs are preserved.
2. Add `tests/personality.captiveEnergyIntegration.test.ts` to prove foreign/player needs separation; with no relevant new cold effect, no old Greenthumb/Hardy/Fierce energy factor survives and non-DNA cold/well/shelter/hospital behavior is identical. Include same eligible/invalid entities where relevant.
3. Strengthen `tests/personality.defenseIntegration.test.ts`: zero/one/multiple eligible Chivalrous and Fierce soldiers, one-trait vs mixed traits, child/rival/prisoner/deployed exclusions, non-DNA baseline, bounded **per-person** modifier and no old +8% global militia bonus. Avoid entire-colony influence from one soldier.
4. Test Resourceful construction from the `work/builder/construction` context (not the old +10% branch), research aptitude via the direct research multiplier (not old 3%-per-Insightful count), Brave/Timid current evaluator factors and the work-vs-walking stamina distinction. Avoid tests asserting retired historical percentages.
5. Fix any stale/missing `building.occupants` IDs in `getWorkerSkillMultiplier`: a missing ID cannot turn a **neutral** crew DNA factor into ×0.5. Reuse the indexed `entityById` when available; avoid hot-path population scans. Verify transformed, saved Moon Howler humans with missing DNA are backfilled deterministically without rerolling valid prior traits, and preserve live RNG stream positions.
6. Run targeted integration tests plus typecheck, lint, build, ownership and strict import-cycle checks. Compare seeded small/medium/large colony metrics for overall regressions; report a balance change separately from unintended functional bugs. Update both ownership registries, changelog, architecture, and bug reports per the global PR protocol.

**PR B acceptance:** there are **zero remaining direct legacy DNA multipliers** in its work/school/physiology/hunting/escape/militia integration sites; any separate legacy trait consumers under social/courtship/conception/mercy are explicitly **PR C** migration tasks, not silently accepted as a permanent second source. Exactly one evaluator, no second mutation owner, no invented special-case factors and no surprise whole-colony scans.

## 2. Exact PR tickets

### PR A — pure trait catalog and evaluator (no game behavior change)

**CREATE**
- `src/game/personality/traitEffectCatalog.ts`
- `src/game/personality/traitEvaluation.ts`
- `tests/personality.traitCatalog.test.ts`
- `tests/personality.traitEvaluation.test.ts`

**EDIT**
- `OWNERSHIP_OVERVIEW.md`
- `src/game/simulation/decisionRegistry.ts`
- `CHANGELOG.md`

**REQUIRED IMPLEMENTATION**
1. One exhaustive `Record<SettlerTrait, TraitEffects>` (with `satisfies`) containing typed contexts, positive and negative effects, stable reason IDs, caps.
2. One exported `evaluateTraitInfluence` entrypoint, no convenience wrappers, no per-domain factor calculation exports.
3. Register `traitInfluence` in `DecisionKey` and `SIMULATION_DECISIONS` with `writes: []`, owner = evaluator, `scheduledFrom` = on-demand direct callers. Extend `DecisionCadence` with `'on-demand'` **only as metadata**, not a scheduler. **Edit `tests/simulation.decisionRegistry.test.ts` in PR A:** its exact `REQUIRED_DECISIONS` array must include the new key; the old `writes.length > 0` test must explicitly permit ONLY declared read-only projection entries while still requiring actual mutation owners to have nonempty write lists. Keep test-file references real, retain one-owner checks, and assert `isPropertyWritePermitted('traitInfluence', 'human.skills') === false`.
4. Ownership overview names exact exported owner functions for the two new modules. The entry is a **read-only projection**, not a new simulation loop.

**ACCEPT WHEN**
- Catalog is exhaustively typed for all fourteen existing IDs; positive/negative contexts demonstrably reachable.
- Empty, unknown-on-load, duplicated and three-trait input cannot cause infinite, NaN or double effects.
- Same inputs produce identical output, no RNG consumed, no entity mutation.
- New suite **including the existing registry's strict-key/readonly-write tests** plus TypeScript, lint, build and dependency audit pass. Do **not** change runtime game mechanics in PR A.

### PR B — work, school, physiology, hunting and passive militia integration

**CREATE TESTS**
- `tests/personality.workIntegration.test.ts`
- `tests/personality.educationIntegration.test.ts`
- `tests/personality.defenseIntegration.test.ts`
- `tests/personality.captiveEnergyIntegration.test.ts` — verify retired old captive DNA factors and unchanged non-DNA energy/foreign state ownership.
- `tests/personality.legacyDNA.test.ts` — a genuine old saved human without traits gains stable canonical DNA; pre-existing 1–3 valid traits stay unchanged, with unchanged live RNG snapshot and saved transformed Moon Howler coverage.

**POTENTIAL EXISTING INTEGRATIONS (verify precise live owner before editing)**
- `src/game/skills.ts`: `rewardBuildingWork`, `getWorkerSkillMultiplier` — preserve credit when storage is full.
- `src/game/dailyBuildingEconomy.ts`: actual credited output; keep one existing production resolver.
- `src/game/education.ts`: teaching/research and graduation on age 18; do not double credit.
- `src/game/apprenticeships.ts`: retain its sole daily mentor-assign/teach path, age and threshold gates.
- `src/game/simulation/humanPhysiology.ts` stays player-human needs owner; `src/game/simulation/humanNeeds.ts` stays foreign-captive energy owner. Retire the latter's hardcoded trait factors and use the canonical evaluator only for real applicable contexts. **Keep both state machines separate** (§1.2).
- `src/game/humanHuntingBehavior.ts`, `src/game/humanTick.ts`, `src/game/militiaBalance.ts`: retire legacy trait-specific factors/checks. Hunting/escape use the central context factor once; militia uses bounded **per-eligible-soldier** defense influence, not its retired Chivalrous flat +8% whole-army bonus (§1.2).
- Relevant other production/education consumers only when live tracing proves necessary.

**EDIT ALWAYS** both architecture registries and `CHANGELOG.md`, accurately preserving previous owner entries and updating actual integration sites.

**ACCEPT WHEN**
- The old Resourceful +10%/worker and Chivalrous flat +8% army bonuses are removed; their existing **catalog** construction/defense contexts are integrated without double calculation. No DNA bonus from an ineligible soldier or missing crew member. A Fierce-only soldier may receive a contextual defense effect, but cannot trigger any retired Chivalrous global branch.
- Foreign-captive Hardy/Greenthumb/Fierce legacy energy multipliers are removed; separate human-needs owners and non-DNA behavior remain intact. Work-only physiology effects do not silently apply to walking.
- New DNA strengths and weaknesses measurably affect real work, learning, research, hunting/flight or defense in their actual context. The old Brave/Timid/research percentages are not a backward-compatibility obligation; any balance change must be documented and tested.
- Skill credit when warehouses are full remains unchanged; existing guards exclude prisoners/rivals; school and apprenticeships remain consistent. Stale occupant IDs never scale neutral DNA below ×1.
- Existing deterministic worker, production, education, hunter, defense and captive-energy tests pass. **Add the missing-DNA legacy-save test from §1.1 in PR B** including transformed Moon Howlers, without modifying valid saved DNA or RNG. No new O(population²) scans or `state.entities.find` per worker/trait when an index is available. Record a comparable seeded baseline; **§1.2 acceptance applies**.

### PR C — social/romance/family life, no second relationship engine

**Implementation status:** NOT DONE. PR B is merged; PR C remains six explicitly identified legacy decision owners. This is an **exact gameplay-parity migration, not a balance pass**. Read the original architecture [§4.1 PR C gameplay-parity override](personality-career-single-pipeline-0.6.5.2.md#41-pr-c-exact-gameplay-preserving-migration-binding-design-contract) before touching code. The numeric PR B rebalances are already accepted and MUST NOT be reverted.

**One-sentence task for the coding bot:** Move **all six** remaining legacy DNA calculations into the one `personality/traitEffectCatalog.ts` and one `evaluateTraitInfluence` pipeline, keeping *exactly the same* live effect, RNG calls, decision outcomes, prerequisites, owners and save behavior, then make the executable legacy scan report **zero**.

#### C.0 Pre-flight: branch, baseline and pinned old behavior

1. Work from latest `main` **after PR #94 merges**, and include relevant merged PR #92 type-ownership changes where present. Re-read real code and resolve deviations **before coding**; the design numbers below reflect the inspected 28 October 2026 implementation, not an invitation to assume unrelated branches.
2. Read `src/game/personality/{traitEffectCatalog,traitEvaluation}.ts`, `src/game/settlerTraits.ts`, each of the six owners named in C.2–C.7, `tests/personality.legacyConsumerAudit.test.ts`, relevant social/conception/grief/war tests, and both ownership registries. Record HEAD SHA and note that `SettlerTrait` may now be owned directly by `settlerTraits.ts`. Never add another trait type or re-export.
3. **Before changing any owner logic**, create/capture executable golden AS-IS fixtures. At least one real-domain assertion per row below, including explicit old expected numbers **derived from the existing implementation**, neutral/no-trait behavior, combined traits and the current seeded random comparison. Commit or stage these tests independently so later changes cannot move the baseline silently.
4. Run baseline focused suites: `npx vitest run tests/relationships.feudSources.test.ts tests/relationships.friendCapAndFeudEnd.test.ts tests/relationships.feudCleanup.test.ts tests/youthConception.ageFloor.test.ts tests/conceptionEvent.labelling.test.ts tests/humanLifecycle.test.ts tests/personality.traitCatalog.test.ts tests/personality.legacyConsumerAudit.test.ts`. These test filenames exist on the inspected base; if renamed, find their canonical current replacements. Preserve the baseline results as PR evidence.
5. Inspect `TRAIT_EFFECTS` `benefit`/`drawback`/`also`: it currently models bounded `factorDelta` and `tendencyDelta` only. **Do not encode ×1.4 or ×0.7 as additive deltas, or clamp them to 0.85..1.15.** Also avoid adding new effects to unrelated gameplay actions; PR C is not an invitation to invent features.

#### C.1 Implement the central rule/result representation FIRST

**Files to edit:** `src/game/personality/traitEffectCatalog.ts` and `src/game/personality/traitEvaluation.ts`. Add tests in `tests/personality.traitCatalog.test.ts`, `tests/personality.traitEvaluation.test.ts` or new relevant targeted suites.

- Preserve all **14** `SettlerTrait` IDs and existing ordinary catalog data. Keep ordinary bounded/diminishing-return calculations exactly as before for PR B contexts. Add a **typed `legacyExact` entry family within the existing `TRAIT_EFFECTS[trait]` records** (or an equivalent single-record discriminated representation). `legacyExact` is *part of the same catalog*, not a second registry. A trait can have several separately identified contexts. An existing `also` record is not sufficient as-is because its tests and evaluator assume bounded additive deltas.
- Represent these **different mathematical operations accurately**: (a) exact multiplicative factor at a named context, (b) exact chance override for a named context, (c) exact duration in days, (d) two independent integer civic votes, and (e) symmetric cross-person clash contributions. Do not overload `factor` with unrelated integers or silently multiply generic `tendency` into chance.
- Extend `TraitContext` minimally: support `{ kind: 'family', activity: 'conception' }`, `{ kind: 'social', activity: 'workplaceBanter' }`, existing `social/courtship`, existing `family/bereavement`, `civic/mercy`, and a *pair-aware* `social/conflict` context with only a narrow readonly second trait subject. Use the **same exported `evaluateTraitInfluence` function** for all; a typed optional exact/discrete result or a context-discriminated return is permitted. The normal neutral answer remains `factor: 1, tendency: 0`, with an exact neutral/no-vote/no-clash result when a discrete context requires it.
- Existing `social/courtship` Timid/Graceful entries and `family/bereavement` Stoic entries already have ordinary bounded catalog effects. For **these specific parity callers**, the new exact rule **takes precedence**: never apply both old exact and generic factor. Other existing ordinary contexts remain untouched.
- Keep each of the five **cross-person** clash pairs in the catalog **once**, not in `relationships.ts`. Do **not** modify the two within-person incompatible genetic pairs in `settlerTraits.ts`.
- The evaluator must remain pure, deterministic, no RNG, no entity/world mutation, and no `state.entities` lookup. On hot social/pair paths avoid temporary arrays/maps, unbounded scans, per-call strings and constructing `reasons` unless requested. Do not create a wrapper evaluator, second event owner or scheduler.
- **C.1 gate:** golden evaluation tests prove 1.4/0.7/1.2, 1.15/1, 0.11/0.08, 5/7, category votes 0/1 and symmetric integer clash counts **before** replacing each original caller. Additional catalog entries must retain exhaustiveness (14 IDs), unique reason IDs and valid positive/negative ordinary descriptions.

#### C.2 Migrate `relationships.advanceSocialRelationships` → `driftIntoFeud`

- **AS-IS:** `TRAIT_CLASHES` has exactly **five unordered cross-person** pairs: Brave–Timid; Gregarious–Timid; Gregarious–Stoic; Fierce–Stoic; Chivalrous–Fierce. `traitClashCount(a,b)` counts all satisfied pairs; `clashes === 0` exits **without calling RNG**, otherwise exactly one `rng()` draw is compared against `clashes * 0.00005`. Feud amount **30**. Existing feud/friend cap, pair budget, key ordering and reciprocal updates remain.
- **TO-BE:** remove both `TRAIT_CLASHES` and `traitClashCount` from this owner; call `evaluateTraitInfluence` once with the two readonly trait subjects and `social/conflict`, use its exact `clashCount`. Keep the original early exits and the **same single RNG call at the same point**. Do not use a sum of two unary `social/conflict` factors: that is not equivalent to cross-trait clashes.
- **Proof:** `tests/personality.socialCompatibility.test.ts` must cover all five edges, reversed settler order, no clash, multiple applicable clashes, empty DNA, existing reciprocal feud logic, RNG draw count **0 for a zero-clash eligible pair and 1 when clash > 0**, and unchanged `0.00005` scale.

#### C.3 Migrate `socialLife.tryWorkplaceBanter`

- **AS-IS:** `entity.traits?.includes('intuitive') ? 0.11 : 0.08`. `personDayRoll(entity.id,tick,720)`; no banter when dead/off day shift/outside 11–13/busy. Partner search and message behavior are unchanged.
- **TO-BE:** use `evaluateTraitInfluence(entity,{kind:'social',activity:'workplaceBanter'})` once at the existing decision and read the **exact Intuitive chance 0.11** from the catalog; absent/unrelated DNA uses the unchanged ordinary base chance `0.08`. Do not approximate using a clamped factor or introduce an RNG call.
- **Proof:** with deterministic `personDayRoll` inputs, assert the same pass/fail boundary and dialog activity, eligible/intuitive, eligible/other DNA and ineligible conditions in `tests/personality.socialCompatibility.test.ts`.

#### C.4 Migrate `humanTick.tickHumans` courtship progress

- **AS-IS:** when the already-eligible initiating settler's `id < closest.id`, the existing rate uses **their own DNA only**, multiplying **Gregarious ×1.4, Timid ×0.7, Graceful ×1.2** in that order; festival ×2, performers ×1.35, living-together ×1.5 and `PER_TICK_RATE_SCALE` surround those factors. Existing relationship binding, speech and marriage completion remain.
- **TO-BE:** add exact `social/courtship` entries in the catalog (Gregarious is missing; Timid/Graceful existing generic records are **not** numeric substitutes). Replace the three inline `traitMultiplier` calls with **one evaluator call** for `entity`. Keep the original factor order and non-DNA operation order; if combining floating-point products changes thresholds, use a fixed ordered output from that one evaluator and demonstrate identical seeded outcomes. Do **not** add `closest`'s DNA to this old rate.
- **Proof:** `tests/personality.romanceContext.test.ts` pins old/new single trait, combined allowed traits, neutral DNA, unchanged time and partner gates, exact progress and deterministic seeded outcomes. Preserve the current existing courtship tests.

#### C.5 Migrate `simulation/humanRelationships.tryDailyConception`

- **AS-IS:** for eligible mothers, **married** (seeded `personDayRoll(...,603)`) and **youth-love** (seed 604) branches multiply the preexisting baseline ×`traitMultiplier(entity,'lucky',1.15)`. The **affair** conception branch (seed 605) does **not** use Lucky. Age/fertility, proximity, partner, cooldown and energy guards are non-DNA.
- **TO-BE:** add the **exact** Lucky ×1.15 under `family/conception` in the catalog; call the evaluator at each of the two original sites, keeping both independent probability formulas and roll locations. `factor = 1` for a non-Lucky mother, **never probability zero**. Do not change `startMarriedPregnancy`, `startYouthPregnancy`, `startAffairPregnancy`, `humanLifecycle`, traits inheritance or birth RNG. Lucky parentage must **not** force Lucky children.
- **Proof:** `tests/personality.romanceContext.test.ts` verifies pre/post probability equality for married/youth/affair, eligible non-Lucky conceptions, neutral trait, Lucky, combined traits, ineligible conditions, roll salt 603/604/605, number of draws, untouched pregnancy state and genetically independent children.

#### C.6 Migrate `warPrisoners.applyWarCommunityReaction`

- **AS-IS:** scan only `alive && isPlayerHuman` villagers. **One** restraint voice if Nurturing **OR** Chivalrous, **one** severity voice if Fierce; Nurturing+Chivalrous is **not two** restraint voices. Fierce may overlap with restraint on the same villager. `threatVoices = ceil(villagers.length / 4)` only when attacked/at war; coercive choices are execution/tribute/raze; `tribute` uses half intensity; existing merit/reputation caps and event text stay.
- **TO-BE:** add catalog-owned `civic/mercy` discrete weights and return `restraintVoice: 0|1`, `severityVoice: 0|1` per **eligible villager**. Apply `evaluateTraitInfluence` once per member inside the **existing** selected-villager pass; aggregate to the same two counts, and keep unchanged opinion formula, leader mutation and log text. No extra full-entity scan or moral judgment.
- **Proof:** `tests/personality.civicContext.test.ts` covers no DNA, each of three traits, Nurturing+Chivalrous deduplication, Fierce+Nurturing both categories, live/dead/rival/captive exclusions **as actually coded**, all five outcomes, under-threat and neutral-war cases, caps and original text/merit/reputation outputs.

#### C.7 Migrate `humanLifecycleCleanup.reconcileFamilyReferencesAfterRemoval` grief

- **AS-IS:** when the dead partner has a live spouse and `tick != null`, spouse grief is **5 days if Stoic, else 7**. `Math.max(prior griefUntilTick, tick + TICKS_PER_DAY * griefDays)` prevents shortening an existing interval. A live secret lover gets **3 days** independently.
- **TO-BE:** the existing owner reads an exact `family/bereavement` duration from the central evaluator. The Stoic rule is 5 days; neutral/non-Stoic remains 7. **Do not activate Nurturing's existing generic grief drawback as an extra duration effect** during parity migration. Keep live spouse/lover lookup, widowed status transitions, optional tick and `Math.max` unchanged.
- **Proof:** `tests/personality.familyContext.test.ts` compares 5/7/3-day outcomes, absence of tick, existing longer grief interval, partner death and affair death, mixed Stoic+Nurturing and neutral cases; update the existing `tests/humanLifecycle.test.ts` only to preserve true old behavior.

#### C.8 Remove legacy symbols, prove no drift, complete documentation

1. Delete the `traitMultiplier` numeric helper in `settlerTraits.ts` **only after all production imports are gone**. Keep genetics, existing `hasTrait` identity query and inheritance logic as appropriate; never delete a useful genetic API just to silence a pattern.
2. Change `EXPECTED` in `tests/personality.legacyConsumerAudit.test.ts` to the **empty object `{}`**, retain the entire source tree scan and fail on **every** old direct multiplier/trait `includes`/`some` gameplay rule or duplicate compatibility table. Do **not** whitelist relocated legacy consumers in a different file or weaken scan expressions. Scan `src/game/**` manually as an additional check for renamed/decorated legacy access not covered by existing regex.
3. Do not change other systems (DNA roll/inheritance, player-vs-foreign needs, schooling, production, defense, pathfinding, UI) beyond verified necessary import cleanup. **Do not add new state fields** for this refactor: existing save fields, worker transport and Moon Howler restoration remain authoritative; verify round-trip and RNG registry stability.
4. Update **both** `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` **as implemented**, `CHANGELOG.md`, and bug reports (new `docs/bug_report/` report for each genuinely discovered defect, linked from `docs/BUG_REPORTS/SUMMARY.md`; don't invent a defect for planned refactoring). PR description must state **new and updated bug report counts**, old/new tested numbers and the fixed head SHA.
5. Run focused owner tests + `npx vitest run tests/personality.legacyConsumerAudit.test.ts tests/personality.traitCatalog.test.ts tests/personality.traitEvaluation.test.ts tests/personality.socialCompatibility.test.ts tests/personality.romanceContext.test.ts tests/personality.familyContext.test.ts tests/personality.civicContext.test.ts`, `npm run test:types`, `npm run lint`, `node scripts/test.mjs owners`, `npm run test:standard`, and `npm run build`. Check seeded continuation and worker/save parity. Run the longer colony suites **only when their touched gameplay owners justify it**, not as a replacement for targeted parity tests.
6. **Stop and report**, do not mark done or merge, if one seeded decision differs, a non-Lucky mother loses conception, a pair changes RNG consumption, a grief/vote count differs, the legacy scan is nonempty, TypeScript/ownership checks fail, or a new O(population²) cost appears. Do not adjust golden expected results or document a mismatch as "intentional rebalancing": the user has forbidden gameplay changes for PR C.

**PR C DONE means:** same gameplay for all six domains with the old multipliers/conditions and *zero* inline DNA-rule consumers; the full canonical catalog/evaluator is now the only numeric/compatibility source; all 14 traits are still defined and ordinary PR B effects unchanged; no new writers or persistent fields; standard CI, targeted parity tests and ownership gates pass. **A green source scan alone is not evidence of behavioral parity.**

### PR D — actual careers, history, mentorship integration and job fit

**CREATE**
- `src/game/careers/careerHistory.ts`
- `src/game/careers/careerProgression.ts`
- `src/game/careers/workerFit.ts`
- `tests/careers.history.test.ts`
- `tests/careers.progression.test.ts`
- `tests/careers.workerFit.test.ts`
- `tests/personalityCareer.oldSaveMigration.test.ts` — load an old save lacking new career fields, validate corrupt values, retain skills, verify migration is idempotent and prove worker prep rollback and save round-trip.

**EDIT**
- `src/game/skills.ts` only for an integration point proven to represent actual attendance; **never treat each call to `gainSkill`, `rewardBuildingWork` or two construction skill awards as a separate work day**. Prefer the already-collected `scheduleLastWorkedHours` / per-building attendance pass in `dailyBuildingEconomy.ts`, verifying exact phase order and eligibility.
- `src/game/tickLayerDaily.ts` **only if truly necessary**. Prefer event-driven milestone reconciliation when the canonical work-credit or apprenticeship completion event is accepted: no extra daily full-population scan or new clock.
- `src/game/workforce.ts` only as optional tie-break for already eligible **idle** candidates, not global job swaps.
- `src/game/gameTypes.ts`, `src/game/saveSchema.ts` and `src/game/saveLoad.ts` **in PR D**,  for every newly persisted career property and an idempotent old-save migration; inspect `simWorker/simPrep.ts` and `simBuffers/simDelta.ts` and adjust only verified missing deep-clone/transport behavior.
- Both registries and `CHANGELOG.md`.

**REQUIRED**
- `careerHistory.ts` is sole writer of bounded per-job day/shift totals. Credit only **observed attendance/work** (`scheduleLastWorkedHours > 0` with a valid eligible worker, building/job attribution and prisoner exclusion), irrespective of whether output is blocked by full storage. At most one credit per worker/job/absolute calendar day, even if construction and production both grant skills; cap/saturate counters, and avoid one map allocation per entity.
- `careerProgression.ts` is sole writer of distinct career milestones/specializations; evaluate only when new credited work or a real training event might cross a milestone, not through a daily whole-colony sweep. Read prior education, actual work, old apprentice data and the one trait evaluator. No competing skill meter or job reassignment.
- `workerFit.ts` computes an optional explanation/score **only when the existing workforce owner is already choosing among eligible idle candidates**, using available skill, commute, experience and the central trait evaluation. **Do not call `readSkill()` from pure projections/UI**: it delegates to `ensureEntitySkills()` and can mutate entities with missing `skills`; use `entity.skills?.[job] ?? 0` for read-only scoring. The workforce owner retains final decisions and existing guards.
- Register `careerHistory` and `careerProgression` as distinct decision keys with accurate new-field write lists and existing call cadence. `workerFit` remains pure and is registered with the appropriate read-only projection / existing workforce metadata, not duplicate assignment authority.

**ACCEPT WHEN**
- Different adults with identical education can develop distinct careers from real work and opportunity. Work-credit decisions are invoked from an **existing already-computed attendance map/pass**, not by walking all people for each building or each job.
- Age 18 / school 6–17, manual staffing, colony staffing priorities and automatic-transfer 60-day cooldown remain unchanged.
- Work history/milestone idempotency, deterministic old-save **field backfill**, worker/main-thread parity and rollback, no extra global scan and no newly introduced performance cliff. Save migration and schema support must already pass in PR D, not PR E.

### PR E — transparent UI and end-to-end compatibility

**CREATE**
- `src/components/PersonalityCareerDetails.tsx`
- Matching inspector integration tests in the existing test conventions.

**EDIT**
- `src/components/SelectedEntityPanel.tsx` via a direct import.
- Optional existing workplace panel to show `Why this worker?` from the **same** `evaluateWorkerFit` and `evaluateTraitInfluence` outputs.
- Confirm PR D's save migration already works. PR E only adds final end-to-end old-save and transport regression coverage; fix observed omissions in the actual owner without introducing parallel serialization.
- Both registries, `CHANGELOG.md`. Mark roadmap §11 / §16 *only after feature code merges*.

**ACCEPT WHEN**
- Player sees relevant trait benefits/drawbacks and the actual reasons for a worker/career choice.
- No UI-only duplicate gameplay formulas; no deprecated aliases/re-exports.
- Existing saves, authoritative worker/fallback, serialization and seeded full-colony simulation still behave correctly. For old saves the new properties are already migrated by PR C/D; PR E only verifies the full player-visible path and does not postpone compatibility fixes.
- All fourteen traits have real reachable advantages and drawbacks with focused tests; bounded career data persists. Existing valid DNA remains unchanged; old saves with missing DNA receive deterministic canonical traits without consuming live RNG.
- Updated owner tables, registry keys, call/cadence/write lists and actual tested links agree.

## 3. Performance and semantics proof (all implementation phases)

- **No new global tick pass.** Normal trait evaluation has constant work: at most three saved traits and a small compile-time/static effect table; no full-world lookups, pathfinding, sorting, RNG, text formatting or heap allocation for explanations. Read-only inspector reasons may allocate *only for the selected person*.
- **No quadratic worker matching.** Reuse the existing `entityById`, staffing indexes, attendance maps and the existing idle-candidate loop; evaluate fit only for a candidate already visited by that loop. Do not build a whole-person × whole-building score matrix or re-rank settled workers.
- **Event-driven career work.** Reuse already captured previous-day attendance at the existing production/day boundary and check `lastCreditedDay`; milestones recompute only for the person whose credited work/apprenticeship changes. No daily scan of all job records for every colonist and no new full-population `tickLayerDaily` pass.
- **Bounded state.** Store only per-person records with actual progress, at most one bounded entry per supported job, saturated counters, a small fixed set of milestone codes and no per-shift timeline. When the person is removed, follow the existing entity/genealogy retention rule; do not retain separate infinite registries.
- **Clone integrity.** Re-check `simWorker/simPrep.ts` rollback's per-entity nested copy if fields are mutable. `simBuffers/simDelta.ts` already transports whole entities; redundant top-level deltas increase bandwidth without adding correctness. Do not add new `structuredClone` per work event.
- **Use a measured baseline:** profile comparable fixed-seed colonies, including at least a small, medium and larger population fixture under the same simulation mode. Report timings/memory (or `NOT RUN` if unavailable) and relative change. No arbitrary claimed `O(1)` end-to-end or guaranteed percentage until actually measured.
- **Measured 2026-10-28** (`scripts/perf-at-pop.ts`, city fixture, seed 12345, 12 warmup + 72 measured ticks, 1,800 settlers, two runs per side): baseline (merge-base `419216f8`) p95 524.7 / 562.2 ms and average 281.9 / 290.6 ms; this branch p95 537.1 / 544.2 ms and average 280.4 / 298.5 ms, with the same delta hash in all four runs. The baseline's own run-to-run p95 spread (37.5 ms) exceeds the branch difference (−2.9 ms mean p95), so no regression is measurable and the review's 554 → 591 ms delta sits inside that spread.
- **360-day gate result (2026-10-28):** `npm run test:full-year:test` passed 360 days / 103,680 ticks through `gameTick` in 158.5 s; `npm run test:full-year` passed the seeded harness in 224.5 s with outcome `healthy`, 0 invariant violations and 0 stalled ticks. The dedicated workflow runs both for game-rule changes; the standard gate stops at the unit tier.
- **Keep test runtime bounded:** run targeted real integration tests and a representative short seeded continuation first. Do not put a compulsory 360-day colony or an unbounded stress scenario in every PR CI gate; expand only when the touched owner justifies it, recording exact duration and pass/failure.
- **No fake progress from old saves:** the derived trait rules become available immediately without modifying stored DNA. Work history starts at a neutral baseline unless there is proven saved event evidence; existing skill and titles still determine real work decisions.

## 4. Checks and PR reporting

Discover actual commands and existing suite names; do not invent tests and report them as already passing. Baseline examples:

```powershell
npm run test:types
npm run lint
npm run build
npm run audit
npx vitest run tests/settlerTraits.test.ts
```

In each PR run the new focused tests for that stage and affected existing suites, especially workforce stability, school, relationships, conception, raids, save migration and worker parity. Run an expanded deterministic integration suite before closing PR E. Use the project-native harness; **do not** add a second test runner, disable assertions or mark CI red as accepted.

**End-of-PR report, mandatory:**
- implemented behavior (no speculation) and the exact commit/PR;
- new/modified files and owner mapping;
- `OWNERSHIP_OVERVIEW.md`: updated, list of changed rows;
- `decisionRegistry.ts`: updated, names of keys, exact allowed `writes`, actual cadence and caller;
- duplicate trait effects or old wrappers removed;
- tests run: PASS / FAIL / NOT RUN with relevant error text;
- bug report paths plus updated `docs/BUG_REPORTS/SUMMARY.md` index entries, if any defects were encountered;
- save/worker implications, open blockers, and what the next PR should tackle.

A PR that lacks either mandatory registry change, violates single-owner rules, creates an alias/re-export, or omits found bug reporting is **not ready for review**.
