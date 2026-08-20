# WILDERFOLK SIMULATION AUTHORITY

# 

# Status: Mandatory project authority

# Applies to: Wilderfolk 0.6.x and all later versions

# Audience: The solo developer, human contributors, coding assistants, reviewers, and anyone modifying simulation-related code

# Read before editing: Any file under src/game/, src/components/ that sends simulation commands, worker code, simulation tests, benchmarks, or save/migration code

# Authority level: This document overrides local assumptions, previous temporary experiments, and undocumented optimization decisions

# 

# 

# 

# 

# 1\. Mandatory rule

# 

# No person or coding assistant may modify simulation behavior before reading this document.

# 

# Before making a change, the contributor must understand which system owns the decision, which cadence it uses, which state fields it may write, and which tests prove that the behavior remains valid. “The code compiled” is not sufficient evidence that a simulation change is safe.

# 

# Mandatory bug-report rule: Every discovered bug must receive a written bug report before, or at the same time as, the code fix. A bug report is required even when the fix appears obvious. The report must describe the observed behavior, expected behavior, reproduction steps, affected owner/cadence, root cause, fix, regression test, and save/migration impact. Do not silently patch a symptom and move on.

# 

# Every change must preserve both:

# 

# 1\.

# Play: the game remains responsive and understandable to play.

# 

# 2\.

# Truth: the simulation remains internally consistent, fair, readable, and faithful to its declared rules.

# 

# A performance improvement that makes the game faster but removes pregnancy, social life, manual staffing, rare events, or reliable commands is a behavior regression, not a successful optimization.

# 

# 

# 

# 

# 2\. Single source of truth

# 

# When the simulation worker is active, the worker-owned WorldState is authoritative. The main thread owns presentation state only: camera, selection, tabs, inspector state, render caches, and preferences.

# 

# The main thread must never directly mutate simulation entities, buildings, resources, relationships, pregnancies, events, or worker assignments while the worker is active. It must send a typed command and wait for the authoritative worker result.

# 

# Simulation state may change only through one of these boundaries:

# 

# Plain Text

# 

# 

# gameTick()

# applyWorkerCommand()

# a named simulation transition called by one of those entry points

# 

# 

# 

# No UI component, render helper, diagnostics helper, or performance shortcut may create a second mutation path.

# 

# 

# 

# 

# 3\. Ownership law

# 

# Every important gameplay decision has exactly one owner. Other modules may read the result but may not recreate or overwrite the decision.

# 

# Decision

# Authoritative owner

# Cadence

# Allowed writes

# Movement and pathfinding

# tickLayerRealtime.ts and its movement helpers

# Realtime

# Position, velocity, movement targets

# Workforce and assignments

# workforce.ts through named assignment transitions

# Command/assignment phase

# Building occupants, homeBuildingId, occupation, job

# Construction

# Construction functions called from the construction layer

# Work cadence

# Construction progress, builder membership

# Economy and production

# tickLayerSystems.ts and daily economy owners

# System/daily

# Resources, production counters, spoilage

# Casual social feedback

# A single social-feel owner extracted from humanTick.ts

# Staggered social

# Dialogue, heart feedback, small social progress

# Courtship and marriage

# humanRelationships.ts

# Social/daily

# Courtship progress, relationship status, partner IDs

# Affairs and scandals

# humanRelationships.ts

# Staggered/daily

# Affair progress, affair partners, scandal outcomes

# New conception

# humanRelationships.ts only

# Once per colony day

# Pregnancy state and due progress

# Pregnancy progress and birth

# humanLifecycle.ts only

# Pregnancy cadence

# Pregnancy progress, child creation, birth event

# Moon Howler lifecycle

# moonHowler.ts only

# Full-moon event

# Curse, transformation, return, cure, replacement event

# Leader residency

# leaderHouse.ts called by the daily layer

# Daily/idempotent

# Leader household residence; preserve valid work assignment

# Player commands

# commands.ts plus domain owner

# On command

# Validated requested state transition

# Diagnostics

# relationshipDiagnostics.ts and future simulation diagnostics

# Flush cadence

# Counters and snapshots only; never gameplay state

# 

# 

# 

# 

# If a change appears to require two owners, stop and resolve the ownership conflict before coding.

# 

# 

# 

# 

# 4\. Tick-layer authority and cadence law

# 

# The existing tick-layer structure is the simulation schedule. Reuse it; do not create a new tick layer for convenience.

# 

# Existing layer

# Sole responsibility

# Must not become

# tickLayerRealtime.ts

# Movement, pathfinding, animation, realtime spatial behavior

# A second daily relationship or economy layer

# tickLayerSystems.ts

# Systems that run on the normal simulation cadence: needs, production, ecology, combat, and other bounded system work

# A replacement for daily rules or UI commands

# tickLayerDaily.ts

# Once-per-calendar-day economy, lifecycle triggers, relationship daily decisions, leadership/residency reconciliation, and daily maintenance

# A place for realtime movement or repeated full-population scans

# tickLayerAssign.ts

# Assignment/reassignment reconciliation using the workforce owner

# A second workforce rules engine

# gameTick.ts

# Fixed orchestration and ordering of the existing layers

# A place for gameplay rules that belong to a domain owner

# 

# 

# 

# 

# The layer outline above is fixed for the current architecture. Do not create tickLayerSocial.ts, tickLayerPregnancy.ts, tickLayerMoonHowler.ts, tickLayerBuildings.ts, or any other new tick layer merely to avoid deciding where code belongs. Put the logic in the existing layer that owns its cadence and delegate the actual rule to the named domain owner.

# 

# A new tick layer is allowed only when all of the following are true:

# 

# 1\.

# The existing layers cannot express the required cadence or ordering.

# 

# 2\.

# The proposal identifies the state and decisions that would move.

# 

# 3\.

# The proposal includes a measured performance or correctness reason.

# 

# 4\.

# The Simulation Authority Document is updated first.

# 

# 5\.

# The new layer has owner, cadence, invariants, diagnostics, and tests.

# 

# Every decision must have one declared cadence. Performance work may reduce the amount of work inside a cadence, but it may not silently move a decision to another cadence.

# 

# Cadence

# May do

# Must not do

# realtime

# Movement, animation, cached target following

# Pregnancy rolls, global affair searches, scandals

# staggered-social

# Nearby dialogue, flirt feedback, heart lines, small progress

# Births, scandal decisions, global scans

# new-calendar-day

# Conception, affair establishment, gossip, daily economy

# Repeated full-population social work

# pregnancy-progress

# Advance existing pregnancy and create a birth

# Start a second pregnancy path

# full-moon-event

# Return an existing Howler; roll a rare replacement event

# Guarantee a new Howler every full moon

# player-command

# Assignment, demolition, repair, upgrade, recipes, modes

# Wait for a worker pipeline to become permanently idle

# 

# 

# 

# 

# Production cadence is 72 simulation ticks per in-game day. A temporary benchmark cadence must never be committed as production behavior without an explicit decision and updated tests.

# 

# 

# 

# 

# 5\. State invariants: always true

# 

# These are hard invariants. They are not suggestions or tuning targets.

# 

# Workforce invariants

# 

# •

# A living human may appear in at most one building’s occupants list.

# 

# •

# A building occupant must have homeBuildingId equal to that building’s ID.

# 

# •

# A human with homeBuildingId must appear in that building’s occupants.

# 

# •

# Manual buildings are never filled by generic auto-staffing.

# 

# •

# The Church has capacity for four but requires only the player-selected priest for its normal staffed state.

# 

# •

# The leader may work in a normal workplace while retaining leader status and manor residency.

# 

# •

# Demolishing a building removes it from authoritative state, cleans its assignments, and clears stale selection.

# 

# Pregnancy invariants

# 

# •

# A pregnant human has a valid pregnancyDueProgress.

# 

# •

# A non-pregnant human has no active pregnancy parent/progress state.

# 

# •

# New pregnancy is created only by the conception owner.

# 

# •

# Birth is created only by the lifecycle owner.

# 

# •

# A conception counter never means “active pregnancies.” Diagnostics must distinguish new conceptions, active pregnancies, and completed births.

# 

# Moon Howler invariants

# 

# •

# There is at most one living cursed Moon Howler.

# 

# •

# If a cursed Howler survives, that same Howler returns on later full moons.

# 

# •

# If the Howler is killed or cured, later full moons may be quiet.

# 

# •

# A replacement Howler appears only through a rare replacement roll.

# 

# •

# A full moon must not guarantee a new Howler.

# 

# Worker authority invariants

# 

# •

# A command result cannot be overwritten by an older tick delta.

# 

# •

# Commands are dispatched without waiting for an impossible permanently idle worker.

# 

# •

# Full-world import/export may wait for idle; ordinary player commands may not.

# 

# •

# Main-thread fallback must use the same domain command implementation as the worker.

# 

# 

# 

# 

# 6\. Forbidden changes

# 

# The following are prohibited unless this document is updated and the change is explicitly approved.

# 

# Forbidden change

# Reason

# Adding a second conception implementation

# Creates pregnancies that diagnostics and lifecycle cannot explain

# Writing building.occupants from a UI component

# Bypasses assignment validation and worker authority

# Adding Church to generic auto-staffing

# Violates manual priest selection

# Adding Moon Howler spawning to a daily layer

# Breaks rare-event lifecycle and one-Howler limit

# Moving a daily rule into realtime code for performance

# Changes probability and player-visible pacing

# Changing tick cadence without a migration/test decision

# Breaks calendar, pregnancy, and event timing

# Renaming or reinterpreting a diagnostic counter without updating consumers

# Creates false conclusions from live logs

# Optimizing by removing a gate without a behavior test

# Can restore speed while silently changing game rules

# Introducing a broad new manager/event bus before proving need

# Adds architecture without solving ownership

# 

# 

# 

# 

# 

# 

# 

# 7\. Mandatory bug report

# 

# Every bug must be recorded in a Markdown file under:

# 

# Plain Text

# 

# 

# BUG\_REPORTS/

# 

# 

# 

# Use one file per bug, for example:

# 

# Plain Text

# 

# 

# BUG\_REPORTS/2026-08-18-church-auto-staffing.md

# 

# 

# 

# The minimum format is:

# 

# Plain Text

# 

# 

# \# Bug: <short name>

# 

# \- Status: open | investigating | fixed | verified | won't-fix

# \- Date discovered:

# \- Version/build:

# \- Reporter:

# \- Area: Play | Truth | worker | UI | save/migration | performance

# \- Owner module:

# \- Cadence:

# 

# \## Observed behavior

# 

# \## Expected behavior

# 

# \## Reproduction steps

# 

# 1\.

# 2\.

# 3\.

# 

# \## Evidence

# 

# Console output, screenshot, save identifier, diagnostic output, or test fixture.

# 

# \## Root cause

# 

# \## Fix

# 

# \## Regression test

# 

# \## Invariants checked

# 

# \## Save/migration impact

# 

# \## Verification result

# 

# \## Related commits or files

# 

# 

# 

# The bug report must remain in the repository after the fix. It is the historical explanation for why the code has its current guard or test. Do not delete it because the issue is fixed.

# 

# 8\. Required change record

# 

# Every simulation change must include this short record in the pull request, commit message, or change note:

# 

# Plain Text

# 

# 

# \## Simulation Change Record

# 

# \- Owner module:

# \- Decision changed:

# \- Cadence:

# \- State fields written:

# \- Why the change is needed:

# \- Player-visible behavior before:

# \- Player-visible behavior after:

# \- Performance impact:

# \- New or updated tests:

# \- Invariants checked:

# \- Save/migration impact:

# \- Rollback plan:

# 

# 

# 

# A change that cannot fill in this record is not sufficiently understood to merge.

# 

# 

# 

# 

# 9\. Mandatory pre-merge checklist

# 

# Before editing

# 

# 

# 

# 

# This document was read.

# 

# 

# 

# 

# The owner row for the decision was identified.

# 

# 

# 

# 

# The cadence was identified.

# 

# 

# 

# 

# Existing tests and diagnostics for the decision were read.

# 

# 

# 

# 

# The proposed change is not duplicating another owner.

# 

# During editing

# 

# 

# 

# 

# All simulation writes remain behind the authoritative boundary.

# 

# 

# 

# 

# No UI component directly mutates simulation state.

# 

# 

# 

# 

# No new full-population scan was added to a realtime path.

# 

# 

# 

# 

# New spatial queries use the spatial grid or document why they do not.

# 

# 

# 

# 

# Existing command and worker ordering semantics are preserved.

# 

# 

# 

# 

# Diagnostics report the actual stage being measured.

# 

# Before merge

# 

# 

# 

# 

# TypeScript passes.

# 

# 

# 

# 

# Focused tests pass.

# 

# 

# 

# 

# Full regression tests pass.

# 

# 

# 

# 

# Workforce invariants pass.

# 

# 

# 

# 

# Pregnancy/birth invariants pass.

# 

# 

# 

# 

# Moon Howler invariants pass.

# 

# 

# 

# 

# Worker command round-trip tests pass.

# 

# 

# 

# 

# Benchmark p50/p95 is recorded at the agreed population tiers.

# 

# 

# 

# 

# Gameplay event rates are recorded for the affected system.

# 

# 

# 

# 

# Save/load behavior is tested if state fields changed.

# 

# 

# 

# 

# The Simulation Change Record is complete.

# 

# After merge

# 

# 

# 

# 

# The live console has no new worker-stall, duplicate-key, or invariant warnings.

# 

# 

# 

# 

# A short seeded playtest confirms the intended player-visible behavior.

# 

# 

# 

# 

# If behavior differs from the previous version, the changelog says so explicitly.

# 

# 

# 

# 

# 10\. Minimal invariant implementation

# 

# Add:

# 

# Plain Text

# 

# 

# src/game/simulation/simulationInvariants.ts

# tests/simulation.invariants.test.ts

# 

# 

# 

# The first implementation should collect errors so tests can inspect them and development mode can throw clearly:

# 

# Plain Text

# 

# 

# export function collectSimulationInvariantErrors(state: WorldState): string\[] {

# &#x20; const errors: string\[] = \[];

# &#x20; const assignedTo = new Map<number, number>();

# 

# &#x20; for (const building of state.buildings) {

# &#x20;   for (const humanId of building.occupants) {

# &#x20;     if (assignedTo.has(humanId)) {

# &#x20;       errors.push(`human ${humanId} assigned to multiple buildings`);

# &#x20;     }

# &#x20;     assignedTo.set(humanId, building.id);

# &#x20;   }

# &#x20; }

# 

# &#x20; for (const human of state.entities) {

# &#x20;   if (!human.alive || human.type !== EntityType.Human) continue;

# &#x20;   if (assignedTo.get(human.id) !== human.homeBuildingId) {

# &#x20;     errors.push(`human ${human.id} workplace mismatch`);

# &#x20;   }

# &#x20;   if (human.pregnant \&\& human.pregnancyDueProgress == null) {

# &#x20;     errors.push(`human ${human.id} pregnant without due progress`);

# &#x20;   }

# &#x20; }

# 

# &#x20; const howlers = state.entities.filter(

# &#x20;   (entity) => entity.alive \&\& entity.moonHowlerCursed,

# &#x20; );

# &#x20; if (howlers.length > 1) {

# &#x20;   errors.push(`multiple living Moon Howlers: ${howlers.length}`);

# &#x20; }

# 

# &#x20; return errors;

# }

# 

# 

# 

# Do not put gameplay repairs into the invariant checker. It detects and reports; the owning transition performs the repair.

# 

# 

# 

# 

# 11\. Refactor order from the current codebase

# 

# The refactor must stop at a green state after each step.

# 

# Step 1 — Governance, no behavior change

# 

# Add this document, the change-record template, the owner registry, and invariant tests. Do not change probabilities or cadence.

# 

# Step 2 — Workforce authority

# 

# Keep workforce.ts as the owner. Route manual assignment, reassignment, demolition cleanup, and leader work through named workforce transitions. Add Church and duplicate-assignment tests.

# 

# Step 3 — Pregnancy authority

# 

# Keep humanRelationships.ts as the only conception owner. Keep humanLifecycle.ts as the only birth owner. Add activePregnancies and birthsCompletedThisInterval diagnostics.

# 

# Step 4 — Moon Howler authority

# 

# Keep all spawn, return, cure, and replacement decisions in moonHowler.ts. Inject RNG so quiet full moons and rare replacement events are testable.

# 

# Step 5 — Relationship authority

# 

# Extract cheap social feedback from humanTick.ts into one social-feel owner. Keep daily conception, affair establishment, and scandal decisions in humanRelationships.ts.

# 

# Step 6 — Worker command authority

# 

# Keep GameWorkerHost responsible only for transport, ordering, and deltas. Keep command meaning in commands.ts and domain owners. Test assignment, priest selection, demolition, and upgrades end-to-end.

# 

# Step 7 — Performance authority

# 

# A performance change must report both timing and behavior:

# 

# Plain Text

# 

# 

# p50/p95 tick time

# social events/day

# conception candidates/day

# pregnancies/30 days

# births/30 days

# scandals/30 days

# Moon Howler events/year

# 

# 

# 

# Faster is not accepted if the declared behavior budget is broken.

# 

# 

# 

# 

# 12\. Required acknowledgment

# 

# Before modifying simulation code, the contributor must add this statement to the change record:

# 

# Plain Text

# 

# 

# I have read SIMULATION\_AUTHORITY.md. I identified the owner and cadence of the decision I am changing, preserved the authoritative worker-state boundary, and will not introduce a second mutation path.

# 

# 

# 

# For a coding assistant, the task prompt should explicitly include:

# 

# Plain Text

# 

# 

# Read SIMULATION\_AUTHORITY.md before inspecting or editing simulation code.

# Do not modify simulation code until the owner, cadence, invariants, and required tests are identified.

# 

# 

# 

# 

# 

# 

# 13\. Definition of authority

# 

# This document is the project’s simulation contract. Code may evolve, file names may change, and implementation details may be optimized, but the following may not change silently:

# 

# •

# who owns a decision;

# 

# •

# when the decision is made;

# 

# •

# which state is authoritative;

# 

# •

# which invariants must hold;

# 

# •

# what the player is guaranteed to observe.

# 

# If the design must change, update this document first, then update the owner registry, tests, diagnostics, and implementation together.

# 



Repository Guidelines
===

Wilderfolk is a client-only frontier colony sim: **React 19 + TypeScript + Vite + Canvas 2D**, with an optional Web Worker sim (opt-in via `VITE\_USE\_GAME\_WORKER=1`). Player docs: `README.md` · `CHANGELOG.md` · `ROADMAP.md`. Technical design: `docs/ARCHITECTURE.md`.

## Project Structure \& Module Organization

* `src/game/` — simulation + rendering. One file per system (`dayCycle.ts`, `combat.ts`, `economy.ts`), plus `data/` (catalogs), `simWorker/`, and the renderer: `renderer.ts` (Canvas 2D) via `rendererLoader.ts` (pass-through).
* `src/components/` — React UI (PascalCase `.tsx`); tab panels in `tabPanels/`. Plus `src/hooks/`, `src/audio/`.
* `scripts/` — tooling: headless sims via `tsx`, asset generators via plain Node (`generate-bridge-sprite.mjs`, `generate-water-sprites.mjs`, no deps), Playwright playtests (`playtest\*.py`).
* `public/` — static assets (sprites, incl. self-generated art). `docs/` is the single docs home; `docs/private/` holds gitignored local dev notes.
* Import via the `@/\*` alias (e.g., `@/game/dayCycle`).

## Build, Test, and Development Commands

|Command|Purpose|
|-|-|
|`npm run dev`|Vite dev server at `http://localhost:5173`|
|`npm run build`|Type-check (`tsc -b`) then production build|
|`npm test` / `npm run test:watch`|Vitest once / watch mode|
|`npm run lint`|ESLint (flat config, `eslint.config.js`)|
|`npm run audit`|Knip (dead code) + dependency-cruiser (import cycles)|

Headless sims: `npx tsx scripts/<file>.mts`. Regenerate procedural art: `node scripts/generate-water-sprites.mjs`.

## Coding Style \& Naming Conventions

* TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`); unused variables are errors — prefix intentional ones with `\_`.
* Naming: camelCase logic modules, PascalCase components, `useX` hooks, `BuildingType`-style enums.
* UI never mutates world state ad hoc — send commands into the GameLoop and read published snapshots.
* Sim cadence is **72 ticks/day** (`TICKS\_PER\_HOUR = 3`); scale systems with `dayTicks()` / `PER\_TICK\_RATE\_SCALE`, never local `\* TICKS\_PER\_HOUR` factors.

## Testing Guidelines

* Vitest (node environment), tests colocated beside code: `<module>.<scenario>.test.ts` (e.g., `frontierCombat.raidGold.test.ts`). Current gate: 7 files / 31 tests, 0 skipped; `npm run lint` 0 errors.
* Regression tests get a comment header explaining the bug (see `hotkeys.test.ts`).
* Browser playtests: `python .deepcode/skills/webapp-testing/scripts/with\_server.py --server "npm run dev" --port 5173 -- python scripts/playtest.py` (screenshots land in `playtest/`).

## Commit \& Pull Request Guidelines

* Conventional commits (`feat:`, `fix:`, `chore:`) with optional scope, e.g. `feat(A1 water): flowing wave bands`. Remote: `origin` → `github.com/Rengerams/wilderfolk`, branch `main` (LF-normalized via `.gitattributes`).
* Bump `GAME\_VERSION` and update `CHANGELOG.md` In beta version save games are not guaranteed comptabile.
* Track bugs with `<batch>-<item>` IDs (e.g., `EK-G4`) in `docs/private/BUGS\_TRACKER.md`; closed work moves to `docs/private/archive/`.
* Run `npm test`, `npm run lint`, `npm run audit` before pushing; keep PRs focused on one system.

## Graphics \& Configuration Tips

* Any new render FX must flow through `RenderSnapshot` or it is never drawn.
* `.env` holds local config — never commit secrets. Gitignored: `docs/private/`, `.deepcode/`, `skills/`, `playtest/`, `test-results/`.

Respond always in the english language!!



# Guidance for AI Agents Working in This Repo

This repository contains **Agent Skills** for AI coding agents. When editing or adding skills, follow these rules.

## Repo structure

* **skills/** — Each subdirectory is one skill. The CLI and agents discover skills by scanning `skills/` for directories that contain `SKILL.md`.
* **Skill directory name** must exactly match the `name` in that skill’s frontmatter (e.g. `skills/webapp-testing/` ↔ `name: webapp-testing`).

## SKILL.md requirements

* **Frontmatter (YAML):**

  * `name` (required): lowercase, hyphens only, max 64 chars, must match parent directory name.
  * `description` (required): what the skill does and when to use it; include trigger terms so agents know when to apply it. Max 1024 chars.
  * `license` (optional): e.g. `MIT` if the skill is under the repo license.
* **Body:** Markdown instructions. Keep under \~500 lines; put long reference material in `references/` or `scripts/` and link from SKILL.md.

## Conventions

* Write descriptions in **third person** (e.g. "Use when…" not "You can use when…").
* Be concise; avoid restating general framework docs. Focus on correct API usage and common pitfalls.
* When adding a new skill: create `skills/<skill-name>/SKILL.md`, then update README.md "Skills" table and "Structure" section.

## References

* [Agent Skills specification](https://agentskills.io/specification.md)
* [skills CLI (discovery, install)](https://github.com/vercel-labs/skills)

