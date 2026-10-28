# Wilderfolk — New Feature Codebot Execution Template

**Document type:** reusable **Wilderfolk-specific feature/function architecture and phased implementation-plan template  
**Status:** CONCEPT TEMPLATE — not a feature implementation or approval to merge  
**Reference:** [DNA / Personality / Career coding-agent plan](personality-career-codebot-tasks-0.6.5.2.md)  
**Authority:** `AGENTS.md`, `docs/command.md`, and the repository's canonical ownership/decision registers take precedence.
**Required output:** one verifiable **AS-IS architecture → TO-BE architecture → code/function migration matrix → implementation phases**. No stage starts until these four parts agree; the old and new flows must be clearly distinguishable.

> **Planning agent:** Copy this file to `docs/plans/<feature-slug>-<YYYY-MM-DD>.md` and fill every `[PLACEHOLDER]` from current repository evidence. Write `N/A — <reason>` where a specific dimension is irrelevant. **Always complete the current (AS-IS), target (TO-BE), delta/cutover, and phase sections, even for a single-function change.** Delete unused optional phases and examples. Verify paths, symbols, scripts, state fields and calls against the current branch; examples do **not** authorize invented APIs. Do not hand an unfilled plan to a codebot.

---

## 0. Feature contract — fill before code

| Field | Required answer |
| --- | --- |
| Feature name | `[FEATURE_NAME]` |
| User-visible result | `[ONE SENTENCE: WHAT THE PLAYER CAN DO/SEE/EXPERIENCE]` |
| Origin / priority | `[DIRECT TASK, ISSUE NUMBER, OR VERIFIED ROADMAP SECTION]` |
| Target version | `[READ FROM CURRENT AGENTS.md — DO NOT GUESS]` |
| Authoritative design | `[THIS DOCUMENT'S AS-IS / TO-BE SECTIONS OR LINK TO EXISTING CANONICAL DESIGN]` |
| Current status | `NOT IMPLEMENTED / PARTIALLY IMPLEMENTED — WITH EVIDENCE` |
| Main simulation owner | `[EXISTING FUNCTION/FILE IF ANY; EXPLICIT NEW OWNER IF FEATURE HAS NONE]` |
| State affected | `[CANONICAL WORLDSTATE/ENTITY/OTHER FIELDS; OR NONE]` |
| Existing save compatibility | `[AFFECTED? SUPPORTED VERSIONS? MIGRATION RULE]` |
| Scope excluded | `[OUT-OF-SCOPE BEHAVIOR]` |
| Delivery approach | `[NUMBER OF SMALL REVIEWABLE PRs + PHASE ORDER + CUTOVER]` |

**Problem:** `[CURRENT BEHAVIOR / MISSING FEATURE WITH CODE EVIDENCE]`

**Solution:** `[MINIMAL FEATURE CHANGE, NEW MODULES ONLY WHERE THEY HAVE DISTINCT RESPONSIBILITIES]`

**Risks:** `[STATE OWNERSHIP, SAVE FORMAT, RNG, WORKER BOUNDARY, CPU, UX, REGRESSIONS]`

**Done means:** `[3–7 OBJECTIVE, TESTABLE, OBSERVABLE CONDITIONS]`

### 0.1 Non-goals and invariants

- **Non-goals:** `[EXPLICITLY EXCLUDE UNRELATED SYSTEMS / FOLLOW-UP IDEAS]`.
- **Must not change:** `[EXISTING RULES, SAVE VALUES, ELIGIBILITY, SCHEDULING, UI BEHAVIOR, ETC.]`.
- **Game semantics:** this is an open-ended simulator; do not add artificial victory conditions, moral judgments or mandatory player warnings unless the feature specifically requires them.
- **Evidence:** cite inspected code and tests next to each substantial claim. Assumptions must be labeled; do not describe a proposal as implemented.

## 1. Mandatory repository reconnaissance

Before editing any code:

1. Read `AGENTS.md` and `docs/command.md` **in full**. Verify the actual shell as AGENTS requires. Read `package.json` scripts.
2. Read `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts`. Inspect the relevant architecture in `docs/` and the current branch/PR.
3. Search the live repository for each behavior, owner function, state field, save path, event emitter, and existing test. Read each file **again immediately before editing**; other agents may have changed it.
4. Trace the actual call chain: `gameLoop.ts` → `gameTick.ts` → relevant realtime/systems/assignment/daily tick layer, **or** the appropriate worker command/event entrypoint. Verify the actual cadence, not the intended cadence.
5. Inspect the worker path (`src/game/simWorker/gameWorker.ts` and `src/game/simWorker/GameWorkerHost.ts` where relevant), and the main-thread fallback. Trace how the result reaches the UI.
6. For new saved data, trace `src/game/gameTypes.ts`, `src/game/saveSchema.ts`, `src/game/saveLoad.ts`, `src/game/simWorker/simPrep.ts` and `src/game/simBuffers/simDelta.ts`.
7. Search for existing utilities and prior similar implementations. **Reuse → narrowly generalize → create**. Do not introduce another representation of the same concept.
8. Document the verified **as-is** flow and what is missing before specifying changes. Do not assume the reference plan reflects the latest main.

**Evidence ledger (complete with actual paths, symbols and findings):**

| Existing responsibility | Canonical owner + entrypoint | Caller/cadence | Reads / writes | Finding: reuse, extend or new owner? |
| --- | --- | --- | --- | --- |
| `[DOMAIN RULE]` | `[PATH / SYMBOL]` | `[ACTUAL CALLER]` | `[FIELDS]` | `[DECISION]` |
| `[SAVED STATE]` | `[PATH / SYMBOL]` | `[LOAD / SAVE]` | `[FIELDS]` | `[DECISION]` |
| `[UI COMMAND OR VIEW]` | `[PATH / SYMBOL]` | `[INPUT / RENDER]` | `[FIELDS]` | `[DECISION]` |

**Architecture conflict check:** `[OVERLAPPING OWNERS? DUPLICATED CALCULATIONS? MISSING PATH? NONE?]`. Do not silently reassign an existing owner. Escalate conflicting authority before implementation.

### 1.1 Current architecture — AS-IS (required, verified code only)

**Do not write the proposed design here.** Capture the real current call chain, including code that is already implemented. Name actual symbols and source paths; where the feature does not exist, show the nearest current entrypoint and **exactly where the new behavior is missing**. A reader must understand how the game works *today* without reading the TO-BE section.

```text
[CURRENT command/event/tick function + path; VERIFIED]
                      |
                      v
[CURRENT dispatcher / function + path; VERIFIED]
                      |
                      v
[CURRENT domain calculation and caller + path; VERIFIED]
                      |
                      v
[CURRENT mutation owner OR "no feature state yet"]
                      |
                      v
[CURRENT event log / worker / UI projection, where relevant]
```

| Current file + exact function | Called by / cadence | Input and output | Fields read | Fields written | Deficiency or reuse decision |
| --- | --- | --- | --- | --- | --- |
| `[EXISTING/PATH.ts:realFunction]` | `[verified caller]` | `[types]` | `[state]` | `[state or []]` | `[KEEP / MODIFY / REPLACE OR NONE EXIST]` |

**Current function calls and ownership:** `[list imports, direct callers, single registered owner, exceptions found]`.

**Current behavior and limits:** `[what works now, where outputs reach the player, existing tests and measured costs; NOT RUN where unmeasured]`.

**Problem location:** `[precise point in this trace that fails to provide the requested feature; evidence]`.

### 1.2 Baseline and protected behavior

| Existing contract | Current evidence | Must remain unchanged? | Regression test |
| --- | --- | --- | --- |
| `[rule, guard, data format, clock or UI]` | `[owner/function/test]` | `[YES / INTENTIONAL CHANGE + REASON]` | `[existing actual file]` |

Specify if the current implementation already contains similar or partially working functions; do **not** propose an alias or duplicate function for them. Include relevant current time/memory characteristics and existing save/worker compatibility, or state `NOT MEASURED`.

## 2. Target architecture — TO-BE (single canonical pipeline)

**This section describes the intended implementation, not current code.** It must directly solve the gap documented in §1.1 while retaining every protected behavior in §1.2. Mark each proposed node **KEEP**, **MODIFY** or **NEW**, and cite its function's owning file. If the existing pipeline already suffices, show its direct extension rather than creating another manager.

Write **one concrete data/control pipeline** for this feature, replacing every placeholder:

```text
[KEEP: existing command / event / tick + verified real function]
               |
               v
[KEEP / MODIFY: existing scheduler / router + real function]
               |
               v
[KEEP: canonical domain inputs; narrow read-only projections]
               |
               v
[NEW / MODIFY / N/A: one owned rule function; no duplicate logic]
               |
               v
[KEEP / MODIFY: existing authoritative writer OR NEW distinct owner]
               |
               +--> [KEEP: canonical event log + saved state when applicable]
               |
               v
[KEEP / MODIFY: real worker transfer / read-only view projection]
               |
               v
[MODIFY / KEEP: actual player UI or automated observation]
```

**Function-by-function rule:** every TO-BE node must name the actual owner path, function signature, direct caller, input/output types and permission to mutate state. Existing nodes may stay unchanged; newly created ones must have a real distinct responsibility. Explain how UI/worker/save readers observe the new result, or mark N/A with evidence.

### 2.1 Module and state ownership — mandatory

**List distinct *new* modules only when the existing owners cannot reasonably hold the new responsibility.** Prefer a small focused `src/game/<feature>/...` module over enlarging an unrelated giant file. But do **not** create a new manager, dispatcher, scheduler, registry, shared state, or indirection purely to make files look modular.

| Module | CREATE / EDIT / KEEP | Only responsibility | Public function(s) | Permitted state writes | Called from |
| --- | --- | --- | --- | --- | --- |
| `[EXISTING OR NEW PATH]` | `[ACTION]` | `[EXACTLY ONE ROLE]` | `[SYMBOLS]` | `[EXACT FIELDS OR []]` | `[PATH / FUNCTION]` |

Hard requirements:

- **One source of truth. One rule, one canonical implementation, one authorized writer.** Do not add aliases, compatibility proxies, duplicate wrappers, barrel `index.ts` files, re-exports, duplicate configuration tables or parallel state. Imports must point directly to the owning module.
- Register **every new or touched function** in `OWNERSHIP_OVERVIEW.md` with its real owning file and responsibility. Amend existing rows when behavior changes; never register a hypothetical future function.
- Update `src/game/simulation/decisionRegistry.ts` **in every implementation PR**. Set actual decision key/owner, real caller and cadence, accurate `writes`, and existing test references. Pure read-only projections must have `writes: []`. Do not invent a cadence/tick or grant broad write access.
- Explicitly distinguish **pure calculations** from **mutations**. Views are read-only; player changes use the existing typed worker-command route. No UI direct writes to world simulation state.
- Preserve original responsibility for economy, work assignment, relationships, raids, custody, pathfinding, rendering and other existing systems. Integrate via their real entrypoints instead of copying their policy.
- If the new feature produces combat/raid outcomes, write to the **canonical `WorldState.eventLog` via `eventLog.logEvent`**; separate battle reports can summarize, but never replace, the general log.
- Only make new modules depend on what they need: narrow input types, explicit output, no circular imports or entire-world arguments to tiny pure functions.

### 2.2 Core contracts and decisions

| Question | Concrete design decision |
| --- | --- |
| Trigger: when exactly does it run? | `[EXISTING PULSE / EVENT / COMMAND]` |
| Eligibility, guards and rejection reasons | `[ALL RELEVANT GATES, OWNER OF REASONS]` |
| Input and deterministic calculation | `[TYPED INPUT / FORMULA / CLAMPS]` |
| State transition | `[BEFORE → EVENT → AFTER]` |
| Sole writer and state fields | `[FUNCTION / EXACT FIELDS]` |
| Existing data and other systems affected | `[DEPENDENCIES / INVARIANTS]` |
| UI projection and player feedback | `[READ MODEL / EVENT / TEXT OWNER]` |
| RNG requirements | `[EXISTING simRng STREAM / NO RNG / REPRODUCIBILITY]` |
| Save and worker requirements | `[MIGRATION / CLONE / DELTA]` |
| Complexity and memory budget | `[BASELINE + TARGET OR JUSTIFIED LIMIT]` |

**State transition example to replace:** `[INITIAL STATE]` + `[VALID ACTION]` → `[ONE VALID NEW STATE]`; repeated/invalid actions → `[EXPLICIT IDPOTENT OR REJECTED RESULT]`.

## 3. Persistence, migration and worker parity — mandatory when state changes

**No delayed migration phase.** The PR that **first introduces a persisted field** also delivers its type, save schema, normalization/migration, worker/rollback safety, and regression tests. Otherwise mark this section **N/A — no new persisted state**, with evidence.

1. Add the field to its *canonical* type in `src/game/gameTypes.ts` (or the verified owning model), then register it via the existing `src/game/saveSchema.ts` mechanism. Do not create a second save format.
2. Implement **one** load-time migration/normalizer in the canonical `saveLoad.ts` path. Supported old saves load and acquire safe effective defaults for genuinely absent properties. Prefer lazy/derived empty defaults when large populations make eager objects costly.
3. **Preserve valid historic player data.** Never reroll identities/traits, overwrite skills, inventories, relationships, world geometry, work assignments, dates, or progress to approximate a newly introduced feature.
4. Do not **invent a history** (worked days, past decisions, family events) from unrelated current fields. An absent new counter starts neutral unless durable existing records prove real history.
5. Treat missing, malformed and future/unknown fields deliberately. Validate types, IDs, finite numbers, ranges and bounded collections. Document whether invalid data is normalized or rejected; do not silently convert unrelated values.
6. Migration must be **idempotent**: load → save → load retains the same canonical semantics, without repeated backfills or increments.
7. If generation/backfill needs randomness, use the existing deterministic `simRng` mechanisms with explicit stable seeds/IDs; **do not advance live RNG streams during loading**. Preserve order independence where required.
8. Check `simWorker/simPrep.ts` for nested mutable-record rollback copies, `simBuffers/simDelta.ts` for actual entity transport, and worker host/fallback parity. Do not add redundant top-level delta fields when an existing entity payload already carries the value.
9. Check transformations, entity removal, rebuilding, scene reload or reset paths that can discard the field. Migrate/load only at a canonical boundary, not during every tick.

**Save matrix to fill in:**

| Fixture/scenario | Expected outcome | Test |
| --- | --- | --- |
| Fresh new-game world | `[DEFAULT / INITIAL STATE]` | `[FILE]` |
| Supported old save without the new field | `[SAFE BACKFILL OR DERIVED DEFAULT]` | `[FILE]` |
| Old save with valid partial/current data | `[PRESERVED UNCHANGED]` | `[FILE]` |
| Corrupt or invalid value | `[DOCUMENTED NORMALIZE / REJECT]` | `[FILE]` |
| load → save → load | `[IDEMPOTENT]` | `[FILE]` |
| worker tick/delta + fallback | `[SAME STATE]` | `[FILE]` |
| rollback snapshot + replay | `[NO MUTABLE ALIAS LEAK]` | `[FILE]` |
| RNG snapshot | `[NO UNEXPECTED RNG CONSUMPTION]` | `[FILE]` |

**Compatible versions:** `[READ ACTUAL POLICY; RECORD VERSIONS AND ANY INTENTIONAL CHANGE]`. Never bump only the displayed game version.

## 4. Implementation tickets — split into reviewable PRs

**Order:** `[A → B → C; REMOVE PHASES NOT NEEDED]`. Start with the earliest unfinished phase. Each PR must implement a meaningful, self-contained slice. **No future-phase placeholder API, dead code, disabled mechanics, or a test-only fake.** Each PR that adds persisted data ships the *complete* migration in that same PR.

For **every** implementation PR, always edit:
- `OWNERSHIP_OVERVIEW.md` — every touched/new function and actual sole owner.
- `src/game/simulation/decisionRegistry.ts` — real decision key(s), owner, cadence, caller, exact `writes` and relevant tests; `writes: []` for pure read-only logic.
- `CHANGELOG.md` — concise user/developer-visible entry, following current AGENTS format.
- Applicable feature architecture document, and roadmap entry **only as appropriate to the current implementation status**.
- `docs/bug_report/` and `docs/BUG_REPORTS/SUMMARY.md` **when any defect is discovered**, whether it was fixed immediately or remains open.

### PR A — `[SMALLEST COHERENT FOUNDATION]`

**Goal:** `[PLAYER / SYSTEM RESULT, EVEN IF FOUNDATION IS BEHAVIOR-NEUTRAL]`

**CREATE:** `[EXACT NEW FILES — WITH REASONS]`

**EDIT:** `[EXACT EXISTING INTEGRATIONS + MANDATORY REGISTRIES + CHANGELOG]`

**IMPLEMENT, in order:**
1. `[SINGLE CANONICAL RULE OR NEW MODULE]`
2. `[EXISTING SCHEDULER/OWNER INTEGRATION OR N/A]`
3. `[SAVED FIELDS + MIGRATION IN THIS SAME PR IF INTRODUCED]`
4. `[OBSERVABLE BEHAVIOR / STATE / EVENTS]`

**ACCEPT ONLY WHEN:**
- `[TESTABLE CONTRACT / EDGE CASE]`
- `[NO DUPLICATE STATE WRITER OR ALIAS]`
- `[DETERMINISTIC REPEATABILITY, IF APPLICABLE]`
- `[TARGETED REGRESSIONS + TYPECHECK + LINT + BUILD]`
- Both registries and changelog reflect **implemented**, not planned, code.

### PR B — `[INTEGRATE INTO REAL GAMEPLAY]`

**Depends on:** `[MERGED PR A / VERIFIED PRECONDITIONS]`

**CREATE:** `[EXACT FILES, NOT OPTIONAL PLACEHOLDERS]`

**EDIT:** `[EXACT EXISTING OWNER CALLS + MANDATORY REGISTRIES + CHANGELOG]`

**IMPLEMENT, in order:** `[CONCRETE ACTIONS WITH SINGLE OWNERS]`

**ACCEPT ONLY WHEN:**
- `[REAL GAME / SIMULATION CHANGES IN AN OBSERVABLE WAY]`
- `[INTEGRATION GUARDS, STATE TRANSITIONS, PERFORMANCE]`
- `[OLD-SAVE / WORKER PARITY IN SAME PR IF NEW FIELDS]`
- `[TESTS PASS; NO BREAKAGE OF EXISTING SYSTEMS]`

### PR C — `[UI, POLISH, OR END-TO-END VALIDATION — IF REALLY NEEDED]`

**Depends on:** `[MERGED EARLIER PRs]`

**CREATE:** `[EXACT FILES]`

**EDIT:** `[PRESENTATION OWNER, EXISTING VIEW PROJECTIONS, REGISTRIES, CHANGELOG]`

**ACCEPT ONLY WHEN:**
- Player can observe/control the real feature via the existing game path, with accurate labels and blocked-action reasons.
- UI does not recalculate rules differently or mutate the simulation directly.
- Representative seeded gameplay, save/load, worker fallback and relevant integration tests pass.
- `[FEATURE-SPECIFIC END-TO-END CRITERIA]`

> **Planning rule:** If the feature fits in **one PR**, use one PR. Do not split solely to mimic A/B/C. If several PRs are justified, each one has a real scope, dependencies, explicit file list and acceptance tests. No fake scheduling, cross-PR save gap, or incomplete released state.

## 5. Determinism, gameplay and performance proof

**Critical Wilderfolk pathways:** game loop, worker tick, population-wide human logic, economy, auto-staffing, pathfinding, biome/terrain generation, and renderer. Audit only relevant pathways, but always consider their call frequency.

- **No new whole-world loop** where an existing indexed pass/event/owner already knows the affected entities.
- Calculate on the **actual existing cadence**, not a new polling tick. Prefer event-driven updates to global daily recomputation.
- No nested `population × building` or `population × population` searches introduced in hot paths. Reuse relevant per-tick/per-day indices and caches. Avoid `entities.find` per entity/worker.
- Pure evaluators should be deterministic and cheap; no hidden time, RNG, mutation, I/O, allocations of explanation arrays or strings per ordinary hot-path invocation.
- Bound growing lists, counters, event records and caches. Define invalidation/cleanup for any new cache; beware save, reset, entity removal and rollback.
- Preserve the game's existing seeded behavior unless an intentional change is in scope. Record the changed semantics, not just test snapshots.
- Compare equivalent seeded runs of representative small/medium/larger colonies **if** a hot path changes. Record measured time, memory and test conditions; don't invent an optimization percentage.
- Keep automated tests **bounded and predictable**. Do not gate every PR on a 360-day colony run or a suite prone to the 45-minute CI timeout; test the narrowest invariant first and reserve bigger seeded runs for high-risk integration.
- Do not change tests to accept broken gameplay (e.g. starving colonies) just to make CI green. Fix the owning game logic or report the evidenced blocker.

**Measurement table:**

| Scenario | Before | After | Verdict / method |
| --- | --- | --- | --- |
| `[FIXED SEED, POPULATION, DAYS]` | `[MEASURE OR NOT RUN]` | `[MEASURE OR NOT RUN]` | `[PASS/FAIL + COMMAND]` |
| `[RNG / REPLAY COMPARISON]` | `[VALUE]` | `[VALUE]` | `[EXPECTED SEMANTICS]` |
| `[SAVE ROUND TRIP]` | `[VALUE]` | `[VALUE]` | `[PASS/FAIL]` |

## 6. Tests — name the evidence, not just the intent

| Behavior / invariant | Test file | Assertions | PR |
| --- | --- | --- | --- |
| `[POSITIVE NORMAL PATH]` | `[FILE]` | `[EXPECTED OUTCOME]` | `[A/B/C]` |
| `[NEGATIVE/INVALID PATH]` | `[FILE]` | `[REJECTION/NO MUTATION]` | `[A/B/C]` |
| `[REPEATED ACTION / BOUNDARY]` | `[FILE]` | `[IDEMPOTENT/ONCE-ONLY]` | `[A/B/C]` |
| `[OLD SAVE / WORKER]` | `[FILE OR N/A]` | `[MIGRATION/ROLLBACK/PARITY]` | `[A/B/C]` |
| `[GAME INTEGRATION]` | `[FILE/HARNESS]` | `[OBSERVABLE RESULTS]` | `[A/B/C]` |
| `[PERFORMANCE]` | `[EXISTING HARNESS]` | `[BASELINE LIMIT / MEASURED DELTA]` | `[A/B/C]` |

Use the existing test tools and harnesses only:
- `npm run test:types`, `npm run lint` and `npm run build` are the final baseline checks **when those scripts still exist in package.json**.
- Discover targeted Vitest commands and test paths before running; do not invent test filenames or claim unrun checks.
- For real UI/gameplay interactions, use **`scripts/autoplay_playwright_probe.py`** with `src/game/virtualPlayer.ts`. Extend that harness when an observation is missing; do not write a separate fake player or probe.
- For simulation-only seeded tests, reuse existing Node game harnesses (such as `scripts/run-full-year.mts`, `scripts/test-bot-build-all.mts` or `scripts/colonyHealth.ts`) **after verifying current names and contracts**.
- Regression tests must prove real behavior, not mock internal call choreography. Keep fixtures narrow and deterministic. Never skip, weaken or delete a failing assertion to conceal a regression.
- Classify verification as **PASS / FAIL / BLOCKED / NOT RUN** with exact commands, failures and reasons. If a check fails twice without progress, stop the blind retry loop and report the specific blocker.

## 7. Documentation and bug tracking — explicit gates

**In each implementation PR (not deferred to the final PR):**

1. **Ownership:** update `OWNERSHIP_OVERVIEW.md` with every new/modified function, module and decision. Verify that it still has **exactly one owner**.
2. **Decision registry:** update `src/game/simulation/decisionRegistry.ts` with actual owner, cadence, scheduler entrypoint, allowed writes and test references. Check registration invariants; never invent a future decision.
3. **Changelog:** update `CHANGELOG.md` in current format with noticeable changes; keep entries concise and avoid paths or file extensions in changelog text as required by AGENTS.
4. **Architecture:** keep the one authoritative feature architecture plan accurate; describe new data flows or module boundaries there, not duplicated across many conflicting markdown documents.
5. **Roadmap:** use the roadmap as a feature implementation overview, **not** as a bug tracker or verification list. Do not check a feature off just because a plan or unmerged PR exists; completed means implemented and **merged**.
6. **Bug reports:** first read `docs/bug_report/readme.md`. Search `docs/bug_report/`, historical `docs/BUG_REPORTS/` and `docs/BUG_REPORTS/SUMMARY.md` before filing. Add a distinct report `docs/bug_report/YYYY-MM-DD-short-title.md` and its link/status to the **single** summary. Report confirmed bugs even if fixed in the same PR.
7. **No silent side work:** small localized bugs may be fixed under AGENTS scope rules; otherwise report open/blocked. No unrelated refactors or broad code cleanup to mask scope changes.

**Documentation diff checklist (each PR):**
- `OWNERSHIP_OVERVIEW.md` — `[ROWS / FUNCTIONS ADDED OR CHANGED]`
- `src/game/simulation/decisionRegistry.ts` — `[DECISION KEYS, CADENCE, WRITES, TESTS]`
- `CHANGELOG.md` — `[CONCRETE CHANGE]`
- `docs/plans/[FEATURE ARCHITECTURE].md` — `[ACTUAL CHANGE OR N/A]`
- `[ROADMAP FILE]` — `[STATUS, ONLY WHEN APPROPRIATE]`
- `docs/bug_report/…` and `docs/BUG_REPORTS/SUMMARY.md` — `[ISSUE / NONE DISCOVERED]`

## 8. End-of-PR handover (mandatory)

```text
DONE / BLOCKED: [one-line observable result]

PR / commit:
- [exact URLs / commit SHA, or NOT CREATED]

Scope delivered:
- [behavior that truly works]
- [explicitly not implemented yet]

Files and ownership:
- [path] — [purpose; sole function owner]
- OWNERSHIP_OVERVIEW.md — [changed rows]
- decisionRegistry.ts — [real key, cadence, exact allowed writes, caller]

Save + worker:
- [N/A OR migrations, supported old saves, rollback, main/worker parity]

Verification:
- [exact command] — PASS / FAIL / BLOCKED / NOT RUN
- [targeted acceptance result and observed gameplay]
- [performance baseline comparison / NOT RUN + reason]

Documentation:
- CHANGELOG.md — [updated or reason]
- Roadmap — [accurate current status]
- Bug reports — [paths + matching SUMMARY entries / none found]

Risk / open issues:
- [pre-existing issues, limitations, unresolved tests]
- [no hidden assumptions]

Cleanup:
- [temporary paths removed/verified, environment restored, or none]

Next smallest PR:
- [specific next phase; no invented completion claim]
```

## 9. Final review gate — do not declare success unless true

- [ ] Current branch/code examined; relevant AGENTS, shell and architecture rules read.
- [ ] Feature/non-goals and every acceptance criterion are fully specified.
- [ ] One explicit pipeline; one rule/one owner/one writer; no aliases, re-exports, wrapper-only facades, duplicated state or speculative general-purpose manager.
- [ ] New code is in focused modules **when a genuinely distinct responsibility exists**, while established owners remain canonical.
- [ ] No extra scheduler, world scan, quadratic hot path or unbounded records.
- [ ] State transitions are deterministic, guarded and idempotent where appropriate.
- [ ] Each PR that adds persisted data ships complete migration, preserved old saves, worker/rollback parity and tests.
- [ ] Real game events/UI use existing authoritative channels; combat events also reach the general event log.
- [ ] **OWNERSHIP_OVERVIEW.md and decisionRegistry.ts are both updated in every implementation PR.**
- [ ] Changelog and authoritative architecture updated; roadmap only marks features complete after merge.
- [ ] Every discovered distinct bug is recorded according to `docs/bug_report/readme.md` and indexed in `docs/BUG_REPORTS/SUMMARY.md`.
- [ ] Targeted regressions and mandatory available typecheck/lint/build checks have honest recorded outcomes.
- [ ] No tests weakened, CI limits concealed, unrelated files rewritten, secrets committed or unapproved destructive operations performed.
- [ ] Scratch cleaned up and a precise handover supplied.

**Stop rule:** A PR missing either architecture registry, a required save migration, reproducible acceptance evidence, or a discovered-bug report is **not ready for review or merge**. A *plan* may be approved as a plan, but cannot be marked IMPLEMENTED merely by writing it.
