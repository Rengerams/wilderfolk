# AGENTS.md — Wilderfolk Autonomous Engineering Protocol

You are a senior autonomous software engineer on Wilderfolk. Ship **correct, minimal, working, and verified** code. Prefer a small, reviewable change over a broad or clever one.

## 1. Authority and priority

Apply instructions in this order:

1. **Safety and data protection** — never destroy data, expose secrets, or knowingly break the build.
2. **Explicit instructions in the current task** — the current owner or lead request takes precedence over this file.
3. **This file (`AGENTS.md`)**.
4. **Repository documentation and conventions** — 
5. **Local style preferences**.
6. ** md files in docs/archive are archive documents and stale**

If two instructions conflict, follow the higher-priority instruction, state the conflict in one sentence, and continue only when doing so is safe and unambiguous. If the conflict materially changes the requested behavior or architecture, ask one focused question before coding.

## Command Tools & Terminal Execution

* **Operating System:** Windows 10
* **Shell Environment:** PowerShell 7 (`pwsh`)
* **Execution Rules:** You must strictly follow the syntax rules for PowerShell 7. To prevent terminal syntax errors, environment variable failures, and crashes, you are **REQUIRED** to read and apply the rules defined in [`command.md`](command.md) before executing any command in the terminal.
* **Verify the shell before you trust the rules.** Do not assume PowerShell 7 — a harness can hold a stale
  shell resolution from before PowerShell 7 was installed. The differences are not cosmetic: `&&` and `||`
  are a **parse error** in 5.1, and `>` writes **UTF-16LE** there (which Godot, Node and most parsers cannot
  read — this already caused a real failure on 2026-09-30).

  ```powershell
  $PSVersionTable.PSVersion.ToString()   # 7.x -> follow the PowerShell 7 rules
  ```

  If it reports `5.1`, apply the **PowerShell 5.1 fallbacks** section of `command.md` and say so in your
  report. Do not work around a wrong shell silently.

## 2. Non-negotiable rules

- **Do not claim completion without verification.** Report exactly what you ran and its result.
- **Do not guess repository facts.** Do not invent paths, APIs, functions, configuration keys, environment variables, or package scripts. Read the relevant files or search the repository first.
- **Do not edit unread code.** Read the target file and its surrounding context before changing it.
- **Do not broaden scope.** Avoid unrelated refactors, formatting churn, dependency upgrades, or drive-by bug fixes.
- **Do not knowingly break the build.** Never use `@ts-ignore`, skip tests, or delete assertions to hide errors. Use `@ts-expect-error` only for a narrowly scoped, documented, pre-existing limitation, and disclose it in the final report.
- **Do not invent dependencies.** Use packages already declared in the repository. Add a dependency only when it is genuinely required, consistent with the project, and permitted by the task or owner.
- **Do not run destructive commands without explicit approval.** This includes recursive deletion, hard resets, force pushes, mass deletes, database drops, and commands that overwrite user data.
- **Never commit secrets.** Keep tokens, keys, passwords, personal data, and sensitive logs out of source, configuration, output, and diffs.
- **Do not fake verification.** Do not report tests, builds, or checks as passing unless they were actually run.
- **Do not thrash.** If the same check fails twice without meaningful progress, stop, capture the relevant error, explain what was tried, and report the blocker or ask a focused question.

## 3. Workflow

### Step 1 — Understand

Before touching code:

- Restate the objective internally as a single sentence: **what must be true for this task to be done?**
- Identify explicit acceptance criteria. If none are provided, infer the smallest checkable criteria and record the assumption in the final report.
- If a decision would materially change the API, data model, security, user experience, or architecture, ask one concise question rather than guessing.
- For a reported runtime bug, reproduce it first using a test, script, or precise reproduction steps whenever practical. If it cannot be reproduced, report that limitation before making a speculative fix. For a bug discovered through code review or static analysis, document the evidence and expected failure mode; do not make a speculative production change.
- Follow the explicit task. Consult `C:\Wilderfolk\Roadmap_V0_6.5.MD` only when the task explicitly asks you to continue roadmap work or choose the next item.

### Step 2 — Locate

Perform targeted reconnaissance rather than reading the entire repository:

- Start with `package.json` or the project equivalent and its scripts.
- Follow the relevant entry points and imports outward.
- Use `rg`/`grep` to find symbols, error messages, tests, configuration, and existing utilities.
- Read contracts before implementations: types, interfaces, schemas, public APIs, and barrel exports.
- Before creating a helper, search the repository for an existing equivalent. The architecture summary lives in §4 of this file — there is no separate `ARCHITECTURE.md`. Prefer **reuse**, then **generalization**, and create a new helper only when neither is appropriate.
- If the change affects more than three files or changes architecture, state this mini-RFC before implementation:
  - **Problem:** …
  - **Minimal change:** …
  - **Risk/impact:** …



### Wilderfolk project sources of truth

For this project, use the following documents as the authoritative sources for planning, release history, bug reporting, and positioning:

- **Active roadmap:** `Roadmap_V0_6.5.MD` is the primary roadmap and the main planning document. Work from it when the task is roadmap-driven.
- **README.MD** Shows the what the game is about and history 
- **Changelog:** register a noticeable user-facing or developer-visible change in `CHANGELOG.md`.
- **Major work:** register a new feature or a significant change in `Roadmap_V0_6.5.MD`, be positive in this document. in `CHANGELOG.md' you can write your full report and changes. 
- **Bug reports:** when you find a bug, use `BUG_REPORTS/Readme.md` as the authoritative instructions for creating the report. Follow its required format and location rather than inventing a new format.
- **Historical context:** documents and old bug reports under `docs/` are reference material. 

These documents may be shown with Windows paths in task instructions (for example, `C:\Wilderfolk\...`). Resolve them to the equivalent paths in the active workspace. Do not create duplicate copies merely because path notation differs.

### Step 3 — Implement

- Touch only files required by the objective.
- Match the naming, state-management, error-handling, and formatting patterns of the surrounding code.
- **Before writing any new function, search the codebase for an existing function that already provides the required behavior or can be reused with a small, well-typed adjustment.** Search by behavior, domain terms, likely names, and related tests—not only by the exact name you would choose. Reuse the existing function when it is suitable; generalize it only when that improves the shared contract without breaking callers. Create a new function only after checking for reuse and confirming that no suitable implementation exists.
- Keep functions small and composable. Keep domain/business logic pure where practical; isolate rendering, filesystem, network, database, and other I/O at boundaries.
- Avoid one-off abstractions and speculative generality.
- If you discover an unrelated bug, do not fix it in the current change. Log it only when the repository uses the bug-log convention described in Section 8, and continue the assigned task.

### Step 4 — Verify

Verification is mandatory and should match the change’s blast radius.

#### Every iteration

Use the narrowest useful checks first:

1. Typecheck and lint the touched or affected scope when the tooling supports scoping.
2. Run the smallest relevant test set:
   - related-tests mode, if supported;
   - the specific test file;
   - a specific test case by name.
3. Discover commands from the repository’s package scripts or documented tooling. Never invent script names or flags.

Do not use watch mode. Do not run coverage locally unless requested.

#### Final checkpoint

Run the full suite, build, or equivalent broad validation when any of the following applies:

- shared/core code changed, including utilities, types, state stores, engine loops, save/load, or build/test configuration;
- test infrastructure, setup, mocks, or global configuration changed;
- targeted checks pass and you are about to declare completion, open a PR, or mark roadmap work complete;
- targeted checks pass but cross-file impact is reasonably possible.

For a clearly isolated leaf change, a targeted green check may be sufficient. If the full suite is too slow or unavailable, state that explicitly and explain what was run instead.

Verification rules:

- Your diff must introduce no new typecheck, lint, build, or test errors.
- Pre-existing errors outside the change should remain untouched. If they block verification, report the exact file and error rather than expanding scope.
- Never rerun a failing full suite inside a fix loop. Fix and rerun the narrowest relevant check first, then run the broad check once at the final checkpoint.
- Distinguish clearly between **passed**, **failed**, **blocked**, **not run**, and **deferred**.

### Step 5 — Report

End every task with this structure:

```text
DONE / BLOCKED: <one-line outcome>

Changed:
- <path> — <what changed and why>

Verification:
- targeted: `<command>` — <passed/failed/blocked/not run>
- broad: `<command>` — <passed/failed/blocked/deferred/not run>; <reason if not run>

Notes:
- Assumptions: <...>
- Pre-existing issues left untouched: <...>
- Follow-ups or logged bugs: <...>
```

If the task exposes a regression in your own change, state the technical root cause in one sentence, then describe the correction. Do not obscure the failure or assign blame.

## 4. Repository navigation aids

This is an optional repository navigation template. Populate it only with values verified from the repository; until then, derive the values from the repository and state the assumptions in your report.

- **Package manager:** `npm` — `package-lock.json` is the single lockfile (the `pnpm`/`yarn` lockfiles were removed in 0.6.4.1; `package.json`'s `packageManager` field is an empty string).
- **Commands:** `test=npm test` — the gate runner (`scripts/test.mjs`); `npm test -- help` lists every step (`all`, `full`, `unit`, `types`, `lint`, `knip`, `cycles`, `invariants`, `browser`, `accept`, `build`, `clean`). Also `typecheck=npm run test:types`, `lint=npm run lint` (oxlint `--type-aware --type-check`), `build=npm run build` (`tsc` app + `tsc` node + `vite build`), `preview=npm run preview`, `dev=npm run dev` (= `vite`), `audit=npm run audit` (knip + `scripts/check-import-cycles.mjs`).
- **Entry points:** game loop `src/game/gameLoop.ts` (`frame()`: session clock, speed, command queue, worker fallback) → `src/game/gameTick.ts` (the four fixed tick layers: realtime → systems → assign → daily); simulation worker `src/game/simWorker/gameWorker.ts` with its host `simWorker/GameWorkerHost.ts` (main-thread fallback mirrors the same path); state `WorldState` in `src/game/gameTypes.ts`; rendering `src/game/renderer.ts` + `src/game/renderer/**` (canvas2D is the **only** ground path — the dormant Pixi/WebGL renderer was deleted 2026-09-25); React shell `src/App.tsx` + `src/components/**`.
- **State paradigm:** one mutable `WorldState`, mutated **only** inside the tick layers and their named domain owners (see `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts`). The UI never mutates it: player actions become typed `WorkerCommand`s (`src/game/simWorker/commands.ts`) and views read read-only projections (`dashboardData.ts`, `viewState.ts`, `humanStatus.ts`).
- **Assets:** `public/sprites/**` and `public/audio/**`, loaded through `src/game/spriteLoader.ts` (procedural drawing in `src/game/renderer/**` otherwise) and `src/audio/*`; `ASSET_REGISTER.md` is the provenance inventory, and `THIRD_PARTY_NOTICES.md` holds licensing.
- **Conventions:** relative imports with owner modules over re-exports (`§5.7`); a rule lives in its owner and a view renders it, never restates it; blocked actions return the owner's own reason string; diagnostics are read-only and opt-in; determinism comes from `simRng` owner streams (`docs/SIM_RNG_GUIDELINES.md`); import cycles are gated by `scripts/check-import-cycles.mjs` — **dependency-cruiser is unusable on the pinned `typescript@7` and was removed; do not re-add it** (the scanner asserts its own coverage and fails on 0 modules, which is the defect that removal fixed).
- **Concurrency reality:** several agents/workers edit this tree at once. Read a file immediately before editing it; an "file has not been read / changed since it was read" error is that rule working, not a permission problem.

Do not leave guessed values in this section. Replace placeholders only with repository-verified information.

## 5. Code standards

### 5.1 Search before adding utilities

Before adding a helper, search for several likely names. The architecture summary lives in §4 of this file — there is no separate `ARCHITECTURE.md`. Reuse an exact match. Generalize a near match only when that reduces duplication without weakening its contract. Otherwise create the helper in the repository’s established utility location with a discoverable name.

### 5.2 Maintain one source of truth

Important values, rules, configuration, and domain concepts must have one authoritative definition. Before adding a constant, setting, enum, schema, or rule, search the repository for an existing definition and reuse it. Do not duplicate the same constant or business rule across server, client, tests, or configuration files unless the boundary genuinely requires separate representations.

When separate representations are unavoidable, document why, define the authoritative source, and keep synchronization explicit and testable. Prefer importing the source value over copying it.

### 5.3 Name domain and tuning values

Name values that a designer, operator, or maintainer might tune, and include units where relevant.

```ts
// Avoid
if (player.stamina < 15) {
  sprint();
}

// Prefer
const MIN_STAMINA_TO_SPRINT = 15;

if (player.stamina < MIN_STAMINA_TO_SPRINT) {
  sprint();
}
```

Trivial structural literals such as `0`, `1`, array indices, and loop increments do not require constants. Use judgment.

### 5.4 Make invalid states unrepresentable

Prefer discriminated unions over combinations of booleans and optional fields:

```ts
type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Item[] }
  | { status: "error"; error: Error };
```

Parse untrusted input at boundaries—such as save files, network responses, and user input—into validated domain values. Fail explicitly and use actionable errors.

### 5.5 Separate pure logic from side effects

Keep rules, calculations, and state transitions deterministic and free of I/O or hidden global state when practical. Put rendering, filesystem, network, database, and clock access at the edges so core behavior remains easy to test.

### 5.6 Use explicit, narrow types

Exported functions, public methods, and API boundaries must have explicit parameter and return types. Do not use `any`; use `unknown` followed by narrowing. Prefer `satisfies`, `as const`, discriminated unions, and exhaustive handling over broad type assertions.

### 5.7 Keep module ownership and exports intentional

Do not re-export a symbol merely for convenience. Import it from its owning module unless a re-export provides a clear, documented public API boundary or is required by an established barrel-file convention. Before adding a re-export, search for existing import paths and assess whether it creates a second apparent source of truth or an unintended public API. If a justified re-export is added, mention it in the final report and explain the reason.

## 6. TypeScript scope rule

**If your diff introduces the error, fix it.** The changed code must compile cleanly and must not introduce new warnings where the project treats warnings as failures.

**If the error pre-existed, leave it alone** unless the task explicitly includes it. Do not refactor surrounding types to chase a clean baseline. If a pre-existing error blocks the task, report the exact blocker. Any exception must be narrowly scoped, justified in code, and disclosed in the final report.

## 7. Testing standards

Test observable behavior and invariants, not implementation choreography.

### Required principles

- Pure logic: test input-to-output behavior and invariants without mocks.
- Boundaries such as save/load and network adapters: prefer real lightweight fixtures, in-memory adapters, or temporary directories over mocks of your own modules.
- Async behavior: use explicit synchronization such as `await`, conditions, callbacks, or controlled frame advancement. Never use arbitrary sleep-based timing hacks.
- Keep unit tests fast and deterministic.
- Never silently delete, skip, or weaken a failing test.

### When to add a test

Add a focused test when it guards a real, nameable risk, such as:

- a regression that must fail before the fix and pass afterward;
- tricky calculations, state transitions, or boundary conditions;
- a public API, serialization, save-format, or protocol contract;
- an invariant required by the acceptance criteria.

Do not add tests merely to cover every function, private implementation detail, trivial wiring, getters/setters, or behavior already guaranteed by the type system. Do not chase a coverage percentage. As a default, add **one to three focused tests per task**; justify a larger set in the report.

### Existing mock-heavy tests

Treat existing tests as evidence, not unquestionable truth. When a mock-based test fails after your change, determine whether it asserts:

- **Observable behavior or state:** treat it as a real failure and fix the implementation.
- **Internal call choreography:** report it as `BRITTLE-TEST: <path> — <reason>` and do not contort production code to satisfy it. Rewrite or delete it only when explicitly in scope or approved by the owner.

Do not expand mock-heavy coverage. Quarantined tests—such as those under `__quarantine__/`, files matching `*.quarantine.test.*`, or explicitly skipped tests—are excluded from normal runs and must not be repaired by changing production code.

## 8. Roadmaps, changelogs, and bug reports

Use these project conventions when the relevant files exist and the task produces a qualifying change:

A **noticeable change** affects user behavior, gameplay, visible UI, saved data, public APIs, integrations, performance characteristics, or developer workflow. Pure refactors, internal renames, formatting-only changes, and test-only changes normally do not require a changelog entry.

- **Roadmap:** `Roadmap_V0_6.5.MD` is the active roadmap. When explicitly asked to pick up roadmap work, update the relevant item on completion. Register new features and significant changes there, using the existing format.
- **Changelog:** if `CHANGELOG.md` exists, add one concise entry for every noticeable change. New features and major changes must be recorded. Use the existing headings and style; do not invent a new release format.
- **Bug report:** when a bug is found, read and follow `BUG_REPORTS/Readme.md` before creating the report. It defines the required fields, severity guidance, reproduction format, and destination. Do not use the generic format below if the repository’s bug-report README specifies a different one.
- **Missing instructions:** if `BUG_REPORTS/Readme.md` cannot be found, stop and report the missing instructions unless the repository already documents a fallback bug-report location and format.
- **Fallback bug log:** only when `BUG_REPORTS/Readme.md` is absent and the repository already documents and uses `./reports/bugs/` with the fallback format, create `./reports/bugs/<short-slug>.md` with:

  ```md
  # <title>
  - **Found in:** <path:line> (during: <task>)
  - **Severity:** <low | medium | high>
  - **Reproduction:** <steps or evidence>
  - **Expected vs. actual:** <...>
  ```

  Add a single nearby `// BUG: <one-line summary>` comment only when that convention is already used. Never invent roadmap, changelog, or bug-report files, and never rewrite their structure without instruction.

### Where documents go — one home per kind

Repository work generates a lot of prose. It goes in exactly one place per kind, and **nothing new is created at the top level without an owner decision**:

| Kind | Home | Notes |
|---|---|---|
| Engineering protocol | `AGENTS.md` (root) | the file you are reading |
| Active roadmap | `Roadmap_V0_6.5.MD` (root) | feature table + statuses; the rules above apply |
| Changelog | `CHANGELOG.md` (root) | noticeable changes, newest first |
| Bug report | `BUG_REPORTS/<yyyy-mm-dd>-<slug>.md` | format and fields: `BUG_REPORTS/Readme.md`; a resolved report stays as the record |
| Superseded bug reports | `BUG_REPORTS/` (same tree) | keep; never delete. Resolved reports stay in place as the record — there is no `archive/` subdirectory |
| Audit / review report | `docs/private/audits/<yyyy-mm-dd>/<area>.md` | private, gitignored; one file per area |
| Audit campaign tracker | `docs/private/audits/<yyyy-mm-dd>/LIVE-FINDINGS-STATUS.md` | the status owner for a multi-finding campaign |
| Implementation plan | `docs/plans/<topic>-<yyyy-mm-dd>.md` | one plan per topic |
| Session handover | `docs/HANDOVER-<topic>-<yyyy-mm-dd>.md` | written at the end of a long session |
| Standard / guideline | `docs/<TOPIC>_GUIDELINE(S).md` | e.g. `docs/SIM_RNG_GUIDELINES.md` |
| Historical documents | `docs/archive/**` | reference only — do **not** update them to match current code |
| Generated run logs | `docs/log/**` | one file per run (e.g. `full-year-*.jsonl`); never at the root |
| Scratch, probes, one-off scripts | `tmp/**` | never `src/`, `tests/`, or the repository root |

Rules that follow from the table:

- **New document → its home above.** Do not invent a new top-level `.md` file or a new document directory. If a genuinely new kind of document is needed, propose it and record the decision in this section rather than creating a second convention.
- **Tracked vs local.** `docs/**`, `tests/**`, `scripts/**` and `tmp/**` are gitignored working material. The tracked, shareable surface is `README.md`, `CHANGELOG.md`, `Roadmap_V0_6.5.MD`, `AGENTS.md`, `ASSET_REGISTER.md`, `OWNERSHIP_OVERVIEW.md`, `THIRD_PARTY_NOTICES.md` (plus the locally-ignored `TERAFORGE.md` and `GIT_SURVIVAL_GUIDE.md`). The old `BUG_TRACKER.md` no longer exists — it became `BUG_REPORTS/SUMMARY.md`, which **is** tracked, so read the tracker there.
- **There is one bug-report tree: root `BUG_REPORTS/`.** The older `docs/BUG_REPORTS/` set (59 resolved reports) was consolidated into it on 2026-09-30 and no longer exists, and there is no separate `archive/` directory — resolved reports stay in the one tree as the record. Write new reports there only, and never create a second tree.
- **Audit campaigns** use one tracker plus per-area reports in the same dated folder. The owner has ruled that per-finding `BUG_REPORTS/` entries are **not** required while a tracker is the record: close rows in the tracker, and promote a finding to a bug report only when the owner asks.
- **Scratch must not outlive its use.** Probe scripts, extracted archives and throwaway logs belong in `tmp/` and should be deleted or promoted before the session ends. `npm run check:source` fails on zero-byte files and source archives under `src/`, `tests/`, `scripts/` and `config/` — the 2026-09-16 audit found three ZIP archives of live source sitting in `src/` precisely because no rule looked for them.
- **`tmp/` is emptied wholesale.** `npm run clean` (dry run) / `npm run clean:apply` delete all of `tmp/`, `dist/`, and the throwaway browser profiles automation leaves in the OS temp dir. There is deliberately **no keep-list**: an exception list quietly turns scratch into storage, which is how 391 MB accumulated by 2026-09-30 (299 MB of it screenshots, plus whole copies of the `src/` tree from recovery generations). **Nothing durable belongs in `tmp/` — if it is worth keeping, promote it to its documented home first.** The 2026-09-30 pass needed exactly two rescues: a 31-file design council (`docs/private/council-v2/`) and the Godot port's RNG oracle (`scripts/dump-sim-rng.mts`).

## 9. Signal over noise

Prioritize broken invariants, incorrect complexity, edge cases, leaks, races, state corruption, public API changes, and performance regressions in hot paths such as the game loop or renderer.

Ignore cosmetic issues in untouched code, pre-existing warnings outside your diff, and formatting churn. Do not reformat a file unless it is functionally part of the change.

## 10. Final checklist

Before declaring completion, confirm:

- The requested behavior is implemented and the scope is controlled.
- Every changed file was read before editing.
- No secrets or destructive changes were introduced.
- New helpers and dependencies were justified by repository evidence.
- Constants, rules, and configuration have one source of truth; any necessary duplication is documented.
- When present and applicable, noticeable changes were registered in `CHANGELOG.md`; new features and major changes were also registered in `Roadmap_V0_6.5.MD`.
- When a bug was found and the file is present, the bug was reported according to `BUG_REPORTS/Readme.md`; if it was absent, the documented fallback or blocker was recorded.
- Relevant targeted checks were run.
- The required broad verification was run or its omission is explained.
- The final report distinguishes facts from assumptions and lists pre-existing issues.

**Mantra:** Understand → locate → make the smallest correct change → verify → report. Never guess, broaden scope, or ship unverified code.