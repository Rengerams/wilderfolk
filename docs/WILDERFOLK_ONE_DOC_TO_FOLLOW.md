# Wilderfolk — One Document to Follow

**Canonical entrypoint:** `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md`

**Applies to:** All contributors, coding assistants, reviewers, and developers modifying Wilderfolk code, tests, workers, saves, rendering, or simulation documentation.

**Current development target:** `0.6.3` (unreleased)

This is the single operational playbook for a Wilderfolk work session. It consolidates the practical rules from the simulation authority, objective-generation protocol, regression-proofing plan, architecture notes, bug-report README, changelog requirement, and audit records. Historical documents remain in the repository for traceability; do not treat them as competing daily instructions.

## 1. Document precedence

Follow these rules in order:

| Priority | Document or rule | Purpose |
|---:|---|---|
| 0 | **Explicit developer instruction** | The developer controls game design, scope, versioning, release, privacy, and whether work is committed or published. It overrides every repository document and prior plan. |
| 1 | This document | One session workflow and decision checklist |
| 2 | `docs/SIMULATION_AUTHORITY.md` | Ownership, cadence, mutation, invariant, and worker rules; follow unless the developer explicitly changes a rule. |
| 3 | `BUG_REPORTS/Readme.md` | Required local bug-report format and status history |
| 4 | Section 14 of `docs/AGENTS.md` | End-of-session documentation guidance, subject to the developer's release and privacy decisions |
| 5 | `docs/Objective_Generation_Protocol.md` | Evidence-based objective generation and lifecycle |
| 6 | `CHANGELOG.md` and `README.md` in c:\wi | Versioned public record and current project summary, updated only when the developer directs it |
| 7 | Audit, architecture, completion, and roadmap documents | Evidence, history, and context; they do not silently override the authority |
| 8 | The current roadmap at the Wilderfolk project root is the version-planning starting point. Use it to confirm the active work and record feature work that requires code changes. |


### 1.1 Developer authority, game design, release control, and privacy

Wilderfolk is a game. The developer decides its rules, tone, and fictional outcomes. Agents must not reject, dilute, or reinterpret a developer-approved game-design choice merely because an older repository document suggests a different design preference. Normal safety, platform, and legal requirements still apply, but the repository’s architecture documents are implementation constraints, not a higher creative authority than the developer.

Agents must **never automatically** bump `GAME_VERSION`, the package version, or a save-compatibility label; create a release heading; tag; commit; push; publish; or declare a release complete. A roadmap target label is not release approval. Current-roadmap implementation items are approved as described in Section 1.2, while each release or repository action still requires a separate explicit developer instruction at the time of the action.

Detailed bug reports are development records. Keep them under `BUG_REPORTS/` with their evidence and verification history. They may be included in the project when appropriate; the changelog should still contain only a concise player-facing summary, while sensitive saves, screenshots, or personal diagnostics should not be published unless the developer explicitly asks.

If two repository documents conflict, preserve the stronger simulation protection until the developer decides. If an explicit developer instruction conflicts with a repository document, follow the developer instruction and record the resulting owner, cadence, state, test, or release decision where appropriate.

### 1.2 Roadmap approval and informed-risk decisions

A function, feature, repair, or refactor explicitly listed for implementation in the **current project-root roadmap** is developer-approved to enter implementation. That approval authorizes necessary code changes within the item’s stated purpose, owner, cadence, non-goals, and acceptance criteria. An agent must still prepare the Simulation Change Record, identify affected state and tests, and preserve the worker-authoritative boundary; those are implementation disciplines, not an extra approval gate.

Wilderfolk is not limited to the safest possible option. A code change may deliberately accept measured technical, design, performance, save, or balance risk when its expected benefit to the game justifies that choice. The agent must make the trade-off visible before or alongside implementation: player benefit, concrete risks, affected owner/cadence/state, alternatives considered, invariant/save impact, validation plan, and rollback path. The **developer decides** whether to accept, reduce, defer, or reject that risk. Do not silently choose a conservative option merely because it is safer, and do not silently take a material risk without recording it for the developer.

A roadmap entry does not automatically approve a version bump, save-policy change, commit, push, tag, publication, or release declaration. Those remain separate developer decisions.

## 2. Start every session this way

At the beginning of a session, read this document once, then read `SIMULATION_AUTHORITY.md` once and `BUG_REPORTS/Readme.md` once. Read the current handoff or completion record only when the task requires it. Then inspect the repository status, current diff, package scripts, test baseline, open bug reports, and relevant owner modules.

Do not begin a behavior change from an old objective list. Start with the current project-root roadmap and its status table. A roadmap-listed implementation function is already approved under Section 1.2; generate the next **three to five objectives** from current evidence only when the developer requests work that is not already listed. Evidence is ranked as follows: failing tests or invariants first, reproducible player bugs second, save or worker failures third, seeded simulation mismatches fourth, measured performance regressions fifth, supported player-facing friction sixth, and speculative features last.

The authority acknowledgment is required once per session. Do not repeat it after every objective.

## 3. Before changing simulation code

For every proposed change, identify the decision owner, cadence, fields it may write, existing tests, diagnostics, invariants, save impact, and rollback plan. Do not edit until the change can be described in a Simulation Change Record.

The worker-owned `WorldState` is authoritative when the worker is active. Simulation state may change only through `gameTick()`, `applyWorkerCommand()`, or a named transition called by one of those boundaries. UI components, render helpers, diagnostics, and performance shortcuts must not create a second mutation path.

Every important decision has one owner. The table below is the current v0.6.3 map. A row may name a scheduler or command boundary, but that boundary does not own the domain decision. **The Prison custody row is the one known legacy split boundary; do not add a third custody mutation path before it is consolidated through a named Prison transition.**

| Decision | Owner | Cadence |
|---|---|---|
| Movement and pathfinding | `tickLayerRealtime.ts`, `humanTick.ts`, and named movement helpers | Realtime |
| Workforce and assignments | `workforce.ts` named transitions | Command/assignment; bounded assignment pulses |
| Housing and residence | `dayCycle.ts` residence helpers through the assignment layer | Assignment/immediate transitions |
| Construction | `buildingActions.ts` / `workforce.ts` for crews; `tickLayerDaily.tickBuildingProgress` for progress | Command/assignment; daily progress |
| Economy, production, ecology, and combat | Existing systems and daily domain owners; production ledger is `tickLayerDaily.tickBuildingProduction` / `economy.ts` | Systems/daily |
| Ordinary work schedule | `workSchedule.ts` | Player command; realtime schedule query; daily consumers |
| Tavern and Hotel service schedules | `venueSchedule.ts` | Player command; realtime service query |
| Schedule fatigue and recovery | `scheduleFatigue.ts` | Realtime work accounting; daily resolution |
| Festival lifecycle | `tickLayerDaily.tickFestivals` for automatic start/expiry; named creators such as `townHall.hostTownFestival` retain their command/event entry | Daily lifecycle; player-command or event creation |
| Permanent human removal and survivor family cleanup | `dayCycle.killHuman()` and `reconcileFamilyReferencesAfterRemoval()` | Immediate lifecycle/removal transition |
| Prison sentence entry, release, and confinement | **Known split:** `humanRelationships.ts` decides/enters a scandal sentence; `workforce.releasePrisoners()` releases; `humanTick.ts` enforces movement confinement | Daily/scandal entry; realtime release and confinement |
| Barracks patrol detection and standing militia | `humanTick.ts` patrol reveal; `defenseStructures.ts` militia calculation | Realtime patrol; systems/combat consumption |
| Casual social feedback | `humanSocial.ts` | Staggered social |
| Courtship and marriage | `humanRelationships.ts` | Staggered social; daily eligibility |
| Affairs and scandals | `humanRelationships.ts` | Staggered progress; daily decisions; bounded realtime caught-in-act check |
| Conception | `humanRelationships.ts` only | Once per colony day |
| Pregnancy and birth | `humanLifecycle.ts` only | Pregnancy cadence |
| Moon Howler lifecycle | `moonHowler.ts` only | Full-moon event |
| Leader residency and election state | `leaderHouse.ts` for residency; `villageLeadership.ts` for election state | Daily/idempotent; election cadence |
| Guided Campaign journal projection | `guidedCampaign.ts` only; it observes real story flags and does not own authored-story outcomes | Daily projection; typed campaign commands |
| Save/load normalization | `saveLoad.ts` | Load/import boundary |
| Player commands | `simWorker/commands.ts` delegates to the named domain owner; main-thread fallback uses the same implementation | Player command |
| Diagnostics | `relationshipDiagnostics.ts` and named read-only diagnostic owners | Flush cadence |

### Approved roadmap implementation owners

The current project-root roadmap explicitly approves the following implementation functions. The named module owns the new story/care state and transition; it delegates an effect to an existing owner rather than recreating ecology, visitors, diplomacy, apprenticeships, social state, resources, or animal movement.

| Approved roadmap function | Implementation owner | Cadence and delegation boundary |
|---|---|---|
| **S1 — The Deer Parliament** | `storyEvents.ts` — new named Deer Parliament offer/resolution transition | Daily ecology eligibility through `tickLayerDaily`; ecological effects delegate to the existing ecology/hunting owner. |
| **S2 — The Traveling Theatre Company** | `storyEvents.ts` — new named Theatre story transition tied to an existing visitor group | Visitor lifecycle and daily expiry; visitor state remains owned by `groupEvents.ts`. |
| **S3 — The Wedding That Nearly Started a War** | `groupEvents.ts` — new named Wedding diplomacy chain/transition | Existing rival/diplomacy daily and player-command boundaries; rival state remains in the rival/diplomacy owners. |
| **S4 — The Apprentice’s Terrible Invention Fair** | `storyEvents.ts` — new named Invention Fair transition | Annual/daily eligibility through `tickLayerDaily`; apprenticeship and workshop effects delegate to `apprenticeships.ts`, `workshops.ts`, and their existing owners. |
| **S5 — The Rumour Ledger** | `storyEvents.ts` — new named Rumour Ledger evaluation/resolution transition | Bounded weekly evaluation from the existing daily layer; facts are read from the event log/Chronicle and effects delegate to existing social, reputation, or rival owners. |
| **A1 — Post-taming animal care** | `animalCare.ts` — new named animal-care domain owner | Bounded daily care decision scheduled from `tickLayerDaily`; taming entry remains in `buildingActions.ts` and follow behavior remains in `tickLayerSystems.ts`. |

These owner assignments approve implementation of the named roadmap functions. Before the first source edit, record their exact state fields, command/tick entry point, explicit failure behavior, save/worker transport work, focused tests, and risk decision in the Simulation Change Record. The Guided Campaign remains a projection of real resolved flags and must not become a substitute story owner.

Reuse the existing tick layers. Do not create a convenience layer such as `tickLayerSocial.ts`, `tickLayerPregnancy.ts`, or `tickLayerMoonHowler.ts`. A new layer requires an authority-document update, a measured correctness or performance reason, an owner, cadence, invariants, diagnostics, tests, and developer approval.

Production cadence is **72 simulation ticks per in-game day**. Do not change it, pregnancy duration, save compatibility, Moon Howler rarity, or any other public gameplay contract without explicit approval and updated tests.

## 4. Hard invariants

The following must remain true:

| Domain | Required invariant |
|---|---|
| Worker | A command result cannot be overwritten by an older tick delta; ordinary commands do not wait for idle; fallback uses the same command implementation; optimistic display state is temporary and reconciled authoritatively |
| Workforce | No living human is assigned to multiple workplaces; occupants and assignment fields agree; manual buildings are not generic auto-staffed; Church requires the selected priest; the leader may work while retaining office and manor residency |
| Buildings | Demolition removes authoritative state, cleans assignments, and clears stale selection |
| Pregnancy | Pregnant humans have valid due progress; non-pregnant humans retain no active pregnancy fields; conception has one owner; birth has one owner; diagnostics distinguish conceptions, active pregnancies, and births |
| Moon Howler | At most one living cursed Howler exists; a survivor returns; replacement is rare and never guaranteed every full moon |
| Truth and play | Performance changes may not silently remove social life, pregnancy, manual staffing, rare events, or reliable commands |

## 5. Bug process

Every discovered bug gets a detailed local Markdown report under `BUG_REPORTS/` before or at the same time as the fix. Use one report per bug and follow `BUG_REPORTS/Readme.md`. Detailed reports may be tracked with the project when appropriate, but sensitive saves, screenshots, or personal diagnostics must not be published without explicit developer instruction.

Every local report must include status, discovery date, version, area, owner, cadence, observed behavior, expected behavior, reproduction steps, evidence, root cause, fix, regression test, invariants checked, save/migration impact, verification result, related files, and a dated status history. Keep the local report after verification. A public changelog may contain only a concise player-facing summary when the developer chooses to release it.

If a bug is discovered while working on an objective and affects the same owner, state, cadence, or player-visible behavior, it belongs to that objective. It is not silently out of scope.

## 6. Objective process

Generate three to five small objectives. Each objective must state its status, evidence, area, owner, cadence, scope, non-goals, dependencies, acceptance criteria, required tests, required bug report, performance measurement, and save/migration impact.

Use the lifecycle `proposed → active → verified`, with `blocked`, `deferred`, `replaced`, or `retired` when justified. An objective is verified only when acceptance criteria pass, related bugs are resolved or formally deferred, tests pass, and the change record is complete.

Whenever objectives are replaced, merged, reordered, paused, or retired, record the date, previous objective, new objective, evidence, owner/cadence, player impact, tests, approval requirement, and approval status.

## 7. Validation process

Before merging or declaring work complete, run the narrowest relevant focused tests, invariant tests, TypeScript, lint, the full regression suite, and any required seeded or performance measurement. Worker work must include command round trips and GameLoop reconciliation tests. Lifecycle work must include pregnancy and birth invariants. Workforce work must include assignment and demolition invariants. Rendering work must include deterministic terrain or atlas regressions.

A green TypeScript result alone is not sufficient. Record the actual test-file and test counts, lint/type results, performance or seeded results, and remaining risks in the objective report or audit document.

## 8. Required Simulation Change Record

Every simulation change must include:

```md
## Simulation Change Record

- Owner module:
- Decision changed:
- Cadence:
- State fields written:
- Why the change is needed:
- Player-visible behavior before:
- Player-visible behavior after:
- Performance impact:
- New or updated tests:
- Invariants checked:
- Save/migration impact:
- Rollback plan:
```

Do not merge a change whose owner, cadence, writes, tests, or rollback cannot be stated clearly.

## 9. End every session this way

Before ending a session:

1. Refresh repository status and confirm the files changed on disk.
2. Update every affected **local** bug report with its status history and verification result; do not stage it by default.
3. Write or update the objective report and Simulation Change Record.
4. Update the project-root `CHANGELOG.md` only when the developer explicitly directs a release note or changelog update; never create a new release version or heading automatically.
5. Update the project-root `README.md` only when the developer explicitly asks for a player-facing update or release summary.
6. Run the final validation required by the change.
7. Report the exact paths changed, the final test results, and whether anything remains intentionally local and uncommitted.

Accurate changelog and README updates are required when the developer requests public release documentation. They do not authorize an automatic version bump, release, commit, push, tag, publish action, or public upload of detailed bug reports.

## 10. Adding a new feature

A feature is not only a UI addition. If it changes what the valley can do, observe, remember, produce, or decide, it is a simulation change and must follow this workflow.

### 10.1 Define the feature before coding

Start with a short feature proposal that states the player-facing purpose, the smallest playable version, the affected area, explicit non-goals, and the evidence that justifies the work. Do not begin from a list of files to edit. Begin from the decision or player behavior being added.

The proposal must answer:

| Question | Required answer |
|---|---|
| What does the player see or do? | A concrete interaction or observable consequence |
| Which decision is new or changed? | One named gameplay decision |
| Who owns it? | One existing domain owner, or an approved new owner |
| Which cadence does it use? | Realtime, staggered-social, systems, assignment, daily, pregnancy-progress, full-moon, or player-command |
| Which state fields are written? | Exact `WorldState`, entity, building, event, or UI fields |
| What existing rule must not change? | Explicit preservation constraints |
| What proves it works? | Focused tests, invariants, and seeded or performance measurements |
| Does it affect saves? | No, compatible extension, migration, or release-blocking change |

If the feature does not fit an existing owner or cadence, stop and write an architecture proposal before coding. Do not hide a new decision inside a nearby helper or create a convenience tick layer.

### 10.2 Plan the smallest vertical slice

Split the feature into a small vertical slice that can be played and tested end to end. The slice normally includes the authoritative rule, the command or tick-layer entry point, state representation, diagnostics or player feedback, UI, tests, and documentation. Keep art, tuning, content expansion, and optional polish separate from the first slice.

Define acceptance criteria in player language and code language. For example, “the player can select one priest and the Church remains staffed by that priest” must be paired with “only the workforce transition writes Church occupants and the daily pass never refills a manual Church.”

### 10.3 Implement through existing boundaries

Use typed commands for player actions, existing tick layers for simulation cadence, and named transitions for shared writes. Keep UI state separate from simulation state. The main thread may render previews, but the worker remains authoritative and must replace or reject the preview through its result.

A feature must not add a second source of truth, a duplicate entity field with overlapping meaning, a second clock, a second lifecycle owner, or an unbounded scan in a realtime path. Reuse spatial indexes and caches when the feature performs proximity work; measure cache behavior rather than assuming it is faster.

### 10.4 Add truth and play protection

Every new feature must define its failure behavior. Invalid commands must be rejected without partial mutation. Missing targets, demolished buildings, dead entities, stale saves, worker errors, and interrupted sessions must leave the world in a valid state. Player feedback must distinguish a rejected action, a blocked action, an in-progress state, and a completed outcome.

If the feature affects relationships, pregnancy, births, ecology, workforce, leadership, or rare events, add or update diagnostics so the player and developer can tell whether the decision was attempted, gated, rejected, started, active, completed, or failed.

### 10.5 Test before tuning

Add focused tests before broad tuning. At minimum, cover the happy path, invalid input, repeated invocation, boundary cadence, worker/main-thread parity, save/load behavior when applicable, and the relevant simulation invariants. Use a seeded scenario for probabilities, social rates, ecology, or other emergent behavior. Add a performance measurement when the feature touches a hot loop, spatial query, render bake, or worker transport.

Run focused tests, TypeScript, lint, the full suite, and required seeded/performance checks. A feature is not verified because it works once in the browser; it is verified when its acceptance criteria, invariant checks, diagnostics, and records all agree.

### 10.6 Document and release the feature

Before declaring the feature complete, write or update the relevant bug report if a defect was found, complete the Simulation Change Record, update the objective report, and update the project-root `CHANGELOG.md` and `README.md`. Record the version, date, changed files, reason, player-visible behavior, tests, performance result, save impact, and remaining risks.

Do not silently change save compatibility, production cadence, pregnancy duration, Moon Howler rarity, or another public gameplay contract. Such a change requires developer approval, updated authority documentation, migration or release notes, and explicit regression coverage.

## 11. What not to do

Do not copy supplied snapshots over the repository without comparing ownership and tests. Do not create a second simulation owner, second gameplay clock, convenience tick layer, broad event bus, speculative ECS rewrite, or unmeasured full-population realtime scan. Do not mass-delete Knip findings. Do not change cadence, save policy, or public gameplay rates without approval. Do not silently fix a bug without a report, test, and changelog entry.

## 12. Current project references

The following documents remain useful as evidence or historical detail:

- `docs/SIMULATION_AUTHORITY.md` — authoritative rules.
- `docs/Objective_Generation_Protocol.md` — objective details.
- `docs/REGRESSION_PROOFING_PLAN.md` — regression strategy.
- `docs/ARCHITECTURE.md` and `docs/SIMULATION_ARCHITECTURE_0_6_1.md` — architecture context.
- `docs/FULL_CODEBASE_AUDIT_2026-08-20.md` — latest full-code audit.
- `docs/WORKER_LOGIC_AUDIT_2026-08-20.md` — latest worker audit.
- `docs/OBJECTIVE_PLAN_FULL_AUDIT_2026-08-20.md` — current evidence-based objectives.
- `CHANGELOG.md` — versioned history.
- `BUG_REPORTS/` — bug history and verification evidence.

When starting a normal coding session, start with this document. Open the linked source document only when the task requires its detailed evidence or exact template.
