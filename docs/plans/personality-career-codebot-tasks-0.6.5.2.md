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
- For ordinary **new** effects use an initial combined cap of `0.85..1.15` and diminishing returns. Keep **pre-existing special bonuses outside this new-effects cap** if necessary to preserve their values (Resourceful has +10% per worker, max +30% for its established building factor). Audit Chivalrous, research, winter, conception, hunting and existing social effects before migration; do not stack or change multiplication order silently. Negative effects must use real reachable decision contexts; do not invent new stress, overexertion, satisfaction or overconfidence state meters. Irrelevant traits are neutral.
- Skills, apprenticeship, school, staff assignment, relationships, pregnancy, warfare, health and economy keep their current canonical writers. Never add a second setter for their fields. Career history/milestones are distinct *new* optional saved fields with their own owner. **Skill gain does not establish a worked shift**: `gainSkill` is also used by construction, education and apprenticeships.
- Runtime warfare remains aggregate/simulated; no active tower/projectile or realtime combat.

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
- New suite plus TypeScript, lint, build and dependencies audit all pass. Do **not** change runtime game mechanics in PR A.

### PR B — work, school, physiology, hunting and passive militia integration

**CREATE TESTS**
- `tests/personality.workIntegration.test.ts`
- `tests/personality.educationIntegration.test.ts`
- `tests/personality.defenseIntegration.test.ts`

**POTENTIAL EXISTING INTEGRATIONS (verify precise live owner before editing)**
- `src/game/skills.ts`: `rewardBuildingWork`, `getWorkerSkillMultiplier` — preserve credit when storage is full.
- `src/game/dailyBuildingEconomy.ts`: actual credited output; keep one existing production resolver.
- `src/game/education.ts`: teaching/research and graduation on age 18; do not double credit.
- `src/game/apprenticeships.ts`: retain its sole daily mentor-assign/teach path, age and threshold gates.
- `src/game/simulation/humanPhysiology.ts` is the authoritative player-human needs owner; `src/game/simulation/humanNeeds.ts` retains foreign captive legacy energy. Audit which path truly uses a trait before editing.
- `src/game/humanHuntingBehavior.ts`, `src/game/humanTick.ts`, `src/game/militiaBalance.ts`: replace each confirmed inline trait factor in-place; never add to existing ones.
- Relevant other production/education consumers only when live tracing proves necessary.

**EDIT ALWAYS** both architecture registries and `CHANGELOG.md`, accurately preserving previous owner entries and updating actual integration sites.

**ACCEPT WHEN**
- Existing Resourceful construction and Chivalrous militia benefits are not counted twice.
- New DNA strengths and weaknesses measurably affect real worked output or learning *only while applicable*.
- Skill credit when warehouses are full remains unchanged; guard eligibility excludes prisoners/rivals; school and apprenticeships remain consistent.
- Existing deterministic worker, production, education, hunter and defense tests pass. No new O(population²) scans.

### PR C — social/romance/family life, no second relationship engine

**EDIT**
- `src/game/relationships.ts`
- `src/game/socialLife.ts`
- `src/game/simulation/humanRelationships.ts`
- Narrow existing family/care consumer only if the evaluated behavior is actually used.
- Both registries; `CHANGELOG.md`.

**CREATE**
- `tests/personality.socialCompatibility.test.ts`
- `tests/personality.romanceContext.test.ts`
- `tests/personality.familyContext.test.ts`
- Optional `src/game/personality/lifeExperience.ts` **only** for a genuinely absent bounded memory type. Prefer existing `friendships`, `feuds`, `pastPartnerTicks`, grief and scandal state; avoid parallel copies.

**ACCEPT WHEN**
- Existing pair eligibility, youth/adult age rules, partner exclusivity, friendship/feud reciprocity, affine caps, affair encounter daily windows, pregnancy and grief cooldowns remain authoritative.
- Trait biases affect social motives and relationship decisions but never force cheating, permanent loyalty, predetermined marriages or good/evil scoring.
- Each memory transition is event-driven and once-only with bounded storage; old saves remain valid.
- Existing relationship, affair, conception and social tests pass deterministically.

### PR D — actual careers, history, mentorship integration and job fit

**CREATE**
- `src/game/careers/careerHistory.ts`
- `src/game/careers/careerProgression.ts`
- `src/game/careers/workerFit.ts`
- `tests/careers.history.test.ts`
- `tests/careers.progression.test.ts`
- `tests/careers.workerFit.test.ts`

**EDIT**
- `src/game/skills.ts` only for an integration point proven to represent actual attendance; **never treat each call to `gainSkill`, `rewardBuildingWork` or two construction skill awards as a separate work day**. Prefer the already-collected `scheduleLastWorkedHours` / per-building attendance pass in `dailyBuildingEconomy.ts`, verifying exact phase order and eligibility.
- `src/game/tickLayerDaily.ts` **only if truly necessary**. Prefer event-driven milestone reconciliation when the canonical work-credit or apprenticeship completion event is accepted: no extra daily full-population scan or new clock.
- `src/game/workforce.ts` only as optional tie-break for already eligible **idle** candidates, not global job swaps.
- `src/game/gameTypes.ts`, `src/game/saveSchema.ts` and `src/game/saveLoad.ts` **in PR D**, for every newly persisted career property and an idempotent old-save migration; inspect `simWorker/simPrep.ts` and `simBuffers/simDelta.ts` and adjust only verified missing deep-clone/transport behavior.
- Both registries and `CHANGELOG.md`.

**REQUIRED**
- `careerHistory.ts` is sole writer of bounded per-job day/shift totals. Credit only **observed attendance/work** (`scheduleLastWorkedHours > 0` with a valid eligible worker, building/job attribution and prisoner exclusion), irrespective of whether output is blocked by full storage. At most one credit per worker/job/absolute calendar day, even if construction and production both grant skills; cap/saturate counters, and avoid one map allocation per entity.
- `careerProgression.ts` is sole writer of distinct career milestones/specializations; evaluate only when new credited work or a real training event might cross a milestone, not through a daily whole-colony sweep. Read prior education, actual work, old apprentice data and the one trait evaluator. No competing skill meter or job reassignment.
- `workerFit.ts` computes optional explanation/score for already eligible vacant assignments using skill, commuting, availability, experience and context-relevant DNA; the workforce owner still makes final decision.
- Register `careerHistory` and `careerProgression` as distinct decision keys with accurate new-field write lists and existing call cadence. `workerFit` remains pure and is registered with the appropriate read-only projection / existing workforce metadata, not duplicate assignment authority.

**ACCEPT WHEN**
- Different adults with identical education can develop distinct careers from real work and opportunity.
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
- Existing saves, authoritative worker/fallback, serialization and seeded full-colony simulation still behave correctly.
- All fourteen traits have real reachable advantages and drawbacks with focused tests; bounded career data persists.
- Updated owner tables, registry keys, call/cadence/write lists and actual tested links agree.

## 3. Checks and PR reporting

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
