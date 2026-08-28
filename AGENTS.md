# Wilderfolk Project Authority

Last update: 28 august 2026 by Developer.


> **Purpose.** This is the complete working authority for Wilderfolk. It protects a coherent, truthful simulation while encouraging creative features, experiments, redesigns, and ambitious improvements.

| Field | Rule |
|---|---|
| **Status** | Mandatory project authority |
| **Applies to** | Wilderfolk 0.6.x and later |
| **Audience** | Solo developer, contributors, coding assistants, reviewers, and anyone changing the project |
| **Read before editing** | Simulation code; components that issue simulation commands; worker code; simulation tests; benchmarks; saves or migrations |
| **Authority order** | Explicit developer instructions override this file. This file overrides local assumptions, temporary experiments, and undocumented optimizations. |
| **Source of truth** | This file is the complete project authority. Supporting documents may explain, plan, or record work, but may not silently contradict it. |

## 1. The project is allowed to evolve

Wilderfolk should grow through imaginative design, experimentation, and deliberate replacement of systems that no longer serve the game. **Creativity is not a risk to be contained.** Unowned state changes, accidental cadence changes, and untested permanent behavior are the risks to be contained.

A contributor may freely explore a new mechanic, story system, visual direction, balance idea, AI behavior, building type, event, or architectural approach. Prototype code, feature flags, isolated test worlds, developer controls, temporary instrumentation, and reversible spikes are encouraged when they help discover the better design.

> **Rule of thumb:** Explore broadly; make permanent behavior deliberately.

The rules below do not require a contributor to avoid a large improvement. They explain how to make that improvement understandable, testable, save-safe, and compatible with the rest of the simulation.

Every permanent gameplay change must preserve both of these qualities unless the developer deliberately changes the design:

| Quality | Meaning |
|---|---|
| **Play** | The game remains responsive, readable, understandable, and enjoyable to play. |
| **Truth** | The simulation remains internally consistent, fair, explainable, and faithful to its declared rules. |

A performance improvement that makes the game faster by silently removing pregnancy, social life, manual staffing, rare events, reliable commands, or another intended game system is a **behavior regression**, not a successful optimization.

## 2. Change modes and when to inform the developer

The default is to proceed with ordinary work. Do not treat this document as a reason to decline, postpone, or silently narrow a requested feature.

| Change mode | Examples | What to do |
|---|---|---|
| **Routine change** | Focused bug fix, new UI, a domain-rule addition within an existing owner, visual work, isolated refactor, test improvement | Proceed. Follow the relevant owner and validate proportionately. |
| **Creative experiment** | Prototype, sandbox mode, feature flag, trial design, throwaway spike, temporary telemetry | Proceed freely. Keep it isolated and labelled; do not let experimental state become an undocumented permanent authority. |
| **Major permanent change** | New or reordered tick layer; worker/main-thread authority change; save format or migration; broad subsystem replacement; change to a hard invariant; global balance/probability redesign; new cross-domain manager/event bus | Give the developer a concise impact notice before making it permanent. Do not silently evade the work. |
| **Irreversible or ambiguous change** | Data-lossy migration, removal of an established system, a change that chooses an unstated core game direction, public release action | Explain the impact and wait for direction before the irreversible step. |

A **major-change notice** is information, not a veto request. It should state the intent, affected owners/cadences and state, player-facing effect, save or compatibility implications, rollback path where useful, and validation plan. When the developer has explicitly requested the major outcome, the contributor may implement it after giving the notice unless a genuine design ambiguity or irreversible data loss needs clarification.

Stop and ask only when one of these is true:

1. Two modules would own the same gameplay decision and the desired owner is unclear.
2. The requested change conflicts with an explicit developer instruction or a hard safety/data-integrity invariant.
3. A permanent choice would discard saves, remove player-created data, or choose a core design direction the developer has not specified.
4. Evidence shows that the proposed mechanism cannot meet its intended player-facing behavior.

Do **not** stop merely because a feature is novel, large, risky, or requires an architecture change. Surface the impact, design a safe path, and continue when the direction is clear.

## 3. Developer control, privacy, and releases

Wilderfolk is a game. The developer decides its rules, tone, fictional outcomes, scope, version, and release timing.

Coding assistants must not automatically bump versions, create release notes, commit, push, tag, publish, submit, or declare a release complete. They must also not upload, stage, commit, push, or publicly quote detailed private diagnostics unless the developer explicitly asks.

Bug reports and diagnostic records are private local project records by default. Keep them local and preserve them after resolution; `BUG_REPORTS/` is intentionally ignored by Git. A report must not be deleted merely because the code is fixed.

## 4. Mandatory simulation decision check

Before changing permanent simulation behavior, identify:

1. **Owner:** which one system makes the decision.
2. **Cadence:** when that decision is allowed to occur.
3. **Writes:** which authoritative state fields may change.
4. **Boundary:** whether the change flows through `gameTick()`, `applyWorkerCommand()`, or a named transition called by one of them.
5. **Evidence:** which test, deterministic reproduction, visual check, or diagnostic proves the intended behavior.
6. **Persistence:** whether existing saves, worker deltas, import/export, or migrations are affected.

“The code compiled” is not sufficient evidence that a simulation change is safe. A small change may use a short check; a large change needs evidence proportionate to its impact.

## 5. Single source of truth and worker authority

When the simulation worker is active, the worker-owned `WorldState` is authoritative. The main thread owns **presentation state only**: camera, selection, tabs, inspector state, render caches, local preferences, and temporary display feedback.

The main thread must not directly mutate authoritative entities, buildings, resources, relationships, pregnancies, events, or worker assignments while the worker is active. It sends a typed command and accepts the worker result.

Authoritative simulation state may change only through these boundaries:

```text
gameTick()
applyWorkerCommand()
a named simulation transition called by one of those entry points
```

No UI component, render helper, diagnostic helper, or performance shortcut may create an unowned second mutation path.

### Optimistic command feedback

While the worker is active, the main thread may apply a player command to its **display copy** through the same domain implementation, `applyWorkerCommand()`, for immediate UI feedback. This temporary display state is never authoritative: the worker’s full-snapshot `commandResult` replaces it on success, and the display reverts to the authoritative world on failure. Pending ticks must not overwrite the optimistic display; the authoritative command result always wins.

## 6. Ownership law

Every important gameplay decision has exactly one authoritative owner. Other modules may read or present the result, but may not recreate or overwrite the decision.

| Decision | Authoritative owner | Cadence | Allowed writes |
|---|---|---|---|
| Movement and pathfinding | `tickLayerRealtime.ts` and movement helpers | Realtime | Position, velocity, movement targets |
| Workforce and work assignments | `workforce.ts` through named assignment transitions | Command/assignment | Building occupants, `homeBuildingId`, occupation, job |
| Housing and residence assignment | `residency.ts` residence functions, scheduled by `tickLayerAssign.ts`; `dayCycle.ts` remains the compatibility façade; immediate command entry through `buildingActions.assignResidentToBuilding` | Assignment plus immediate place/recruit/death/divorce/arrest | `residenceBuildingId`, residence occupants, household membership |
| Construction | Construction functions called by the construction layer | Work cadence | Construction progress, builder membership |
| Economy and production | `tickLayerSystems.ts` and daily economy owners | System/daily | Resources, production counters, spoilage |
| Village Requests | `groupEvents.ts`; command entry delegates from `commands.ts` | Daily generation/expiry; player-command resolution | One active request, cooldown/history, effects, source counters, feedback |
| Blueberry foraging | `blueberryForaging.ts`, called from existing human tick and daily layer | Staggered realtime pick; daily regrowth | Tree yield/regrowth, temporary target/movement, existing food/energy/feedback |
| Casual social feedback | The dedicated social-feel owner extracted from `humanTick.ts` | Staggered social | Dialogue, heart feedback, small social progress |
| Youth love, ages 14–17 | `humanRelationships.ts` | New calendar day | Mutual youth links, progress, breakups, adult-courtship handoff |
| Courtship and marriage | `humanRelationships.ts` | Social/daily | Courtship progress, relationship status, partner IDs |
| Affairs and scandals | `humanRelationships.ts` | Staggered feedback; daily establishment/gossip/scandal | Affair progress, affair partners, scandal outcomes |
| New conception | `humanRelationships.ts` only | Once per colony day | Pregnancy state and due progress |
| Pregnancy progress and birth | `humanLifecycle.ts` only | Pregnancy cadence | Pregnancy progress, child creation, birth event |
| Moon Howler lifecycle | `moonHowler.ts` only | Full-moon event | Curse, transformation, return, cure, replacement event |
| Leader residency | `leaderHouse.ts`, called by daily layer | Daily/idempotent | Leader household residence; preserve valid work assignment |
| Player commands | `commands.ts` plus the owning domain | On command | Validated requested state transition |
| Diagnostics | `relationshipDiagnostics.ts` and future diagnostics | Flush cadence | Counters and snapshots only; never gameplay state |

If a design needs two owners, resolve the boundary deliberately. A domain may collaborate with another domain through a typed transition or read-only data, but one module must retain authority over each decision.

## 7. Tick layers and cadence

The current simulation schedule is intentionally simple. `gameTick.ts` orchestrates exactly four layers in fixed order:

```text
realtime every tick
→ systems every LAYER_SYSTEMS_INTERVAL
→ assignment every LAYER_ASSIGN_INTERVAL
→ daily once per TICKS_PER_DAY
```

| Layer | Sole responsibility | Must not become |
|---|---|---|
| `tickLayerRealtime.ts` | Movement, pathfinding, animation, realtime spatial behavior | A second daily relationship or economy layer |
| `tickLayerSystems.ts` | Normal-cadence systems: needs, production, ecology, combat, and bounded system work | A replacement for daily rules or UI commands |
| `tickLayerAssign.ts` | Assignment and reassignment reconciliation using the workforce owner | A second workforce rules engine |
| `tickLayerDaily.ts` | Daily economy, lifecycle triggers, relationship decisions, leadership/residency reconciliation, maintenance | Realtime movement or repeated full-population work |
| `gameTick.ts` | Fixed orchestration and ordering | A home for domain rules that belong in an owner module |

Do not create `tickLayerSocial.ts`, `tickLayerPregnancy.ts`, `tickLayerMoonHowler.ts`, `tickLayerBuildings.ts`, or another layer merely to avoid choosing an existing cadence and owner.

A new tick layer remains possible. Treat it as a **major permanent change**: inform the developer of the proposal, identify the state and decisions moving, explain the correctness or measured performance reason, define its ordering and cadence, preserve/migrate affected behavior, add diagnostics and tests, then update this file as part of making the new architecture permanent.

Every decision has one declared cadence. Performance work may reduce work **inside** a cadence but may not silently move the decision to another cadence.

| Cadence | May do | Must not do |
|---|---|---|
| `realtime` | Movement, animation, cached target following, staggered blueberry target/pick behavior | Pregnancy rolls, global affair searches, general scandal decisions |
| `staggered-social` | Nearby dialogue, flirt feedback, heart lines, small progress | Births, global scans, establishment/scandal decisions |
| `new-calendar-day` | Conception, affair establishment, gossip, youth-love decisions, daily economy, bounded Village Request generation/expiry | Repeated full-population social work |
| `pregnancy-progress` | Advance an existing pregnancy and create a birth | Start a separate pregnancy path |
| `full-moon-event` | Return an existing Howler; make a rare replacement roll | Guarantee a new Howler every full moon |
| `player-command` | Assignment, demolition, repair, upgrade, recipes, modes | Wait for a worker pipeline to become permanently idle |

Production cadence is **72 simulation ticks per in-game day**. A temporary benchmark cadence must not become production behavior without a deliberate design decision and updated evidence.

Affair tryst **progress** and nearby feedback may occur during staggered social work. Affair **establishment** (`affairPartnerId`), gossip, and ordinary scandal decisions belong to the daily owner. A realtime path may only expose an already-established pair through a spatial caught-in-the-act event, such as a spouse or guard being physically present. Unestablished flirtation must not generate a general scandal roll.

## 8. Hard state invariants

These invariants are permanent truths of the current design. A deliberate redesign may change one, but only as a major permanent change with a clear replacement invariant, migration impact, and validation.

### Workforce

- A living human appears in at most one building’s `occupants` list.
- A building occupant has `homeBuildingId` equal to that building’s ID.
- A human with `homeBuildingId` appears in that building’s occupants.
- Manual buildings are never filled by generic auto-staffing.
- The Church has capacity for four but normally requires only the player-selected priest.
- The leader may hold a normal workplace while retaining leader status and manor residency. Valid work must survive office-taking and save/load; special-event gathering requires no job-level gate.
- Demolishing a building removes it from authoritative state, cleans assignments, and clears stale selection.

### Youth love and pregnancy

- A youth-love link is mutual, joins two living colony settlers, and is owned only by `humanRelationships.ts`.
- Youth love begins only from age 14 through 17. It has no automatic housing, workforce, or marriage side effect.
- A youth pair may transfer to adult courtship only when both people are at least 18 and remain eligible. Only the adult path may create a marriage.
- A stale, dead, invalid, or one-sided youth link is cleared by the youth-love owner during daily reconciliation.
- A pregnant human has valid `pregnancyDueProgress`.
- A non-pregnant human has no active pregnancy parent or progress state.
- New pregnancy is created only by the conception owner. Ages 14–17 require a documented mutual youth-love, proximity, energy, and reduced-probability gate; adult marriage and affair rates retain their intended design.
- Birth is created only by the lifecycle owner.
- Diagnostics distinguish new conceptions, active pregnancies, and completed births; a conception counter never means active pregnancies.

### Village Requests and blueberry foraging

- At most one `activeVillageRequest` exists. `groupEvents.ts` owns its creation, expiry, and resolution.
- A request has a unique ID, valid source where required, bounded expiry day, and one declared choice set.
- UI code sends typed commands only. Invalid, unaffordable, stale, storage-blocked, unknown, or repeated commands leave the request and economic state valid without partial mutation.
- Active request state must flow safely through worker preparation, rollback, delta reconciliation, and save/load before a card is shown.
- A blueberry source is a normal living `EntityType.Tree` with `forageKind: 'blueberry'`; it remains in the existing tree grid.
- New maps contain at most three blueberry trees. Only `worldGen.ts` creates them.
- `blueberryYield` remains in the inclusive range 0–6. The foraging owner decrements it on a successful pick or restores one portion during declared daily regrowth outside winter.
- A player settler forages only when free, hungry, not freshly fed, and not festival-gathering. Work, school, sleep, meals, hunting urgency, and normal movement retain priority.
- Target searches use the existing `treeGrid` and staggered cadence. No person scans all trees every tick.
- Rendering may choose ripe/depleted art but may not mutate yield, regrowth, food, energy, movement, or storage.

### Moon Howler

- At most one living cursed Moon Howler exists.
- If a cursed Howler survives, that same Howler returns on later full moons.
- If the Howler is killed or cured, later full moons may be quiet.
- A replacement appears only through a rare replacement roll.
- A full moon never guarantees a new Howler.

### Worker authority

- A command result cannot be overwritten by an older tick delta.
- Ordinary player commands dispatch without waiting for an impossible permanently idle worker.
- Full-world import/export may wait for idle; ordinary player commands may not.
- Main-thread fallback uses the same domain command implementation as the worker.
- Optimistic display state is temporary and is replaced by the authoritative `commandResult` on success or reverted on failure. It never writes back to the worker.

## 9. Unsafe shortcuts to avoid

The following are unsafe shortcuts, not bans on redesign. A deliberate replacement is allowed when it follows the major-change process and provides equivalent or better authority, evidence, and player-facing behavior.

| Unsafe shortcut | Why it is unsafe |
|---|---|
| Add a second conception implementation | Produces pregnancies that diagnostics and lifecycle cannot explain |
| Write `building.occupants` from a UI component | Bypasses assignment validation and worker authority |
| Put the Church in generic auto-staffing | Breaks manual priest selection |
| Spawn Moon Howlers in a daily layer | Breaks rare-event lifecycle and one-Howler limit |
| Move a daily decision into realtime solely for speed | Changes probability and player-visible pacing |
| Change tick cadence without a migration and test decision | Breaks calendar, pregnancy, and event timing |
| Rename/reinterpret a diagnostic counter without updating consumers | Produces false conclusions from logs |
| Remove a gameplay gate merely to optimise | May silently change game rules |
| Add a broad manager/event bus before a real need is shown | Adds architecture without resolving ownership |

## 10. DRY and deliberate-WET engineering

Wilderfolk uses **DRY** (*Don't Repeat Yourself*) for stable knowledge, shared rules, type shapes, constants, and behavior that must stay consistent. It also permits **deliberate WET** (*Write Everything Twice*) when local duplication makes a feature clearer, keeps domains independent, avoids a premature abstraction, or allows similar mechanics to evolve in different directions.

> **Prefer a clear local implementation over a clever shared abstraction. Extract only after the shared concept is real, stable, and demonstrated by more than one use.**

| Use DRY when | Prefer deliberate WET when |
|---|---|
| A rule, invariant, conversion, validation, or state transition must remain identical everywhere | Two features only look similar today but have different owners, cadence, player meaning, or likely future direction |
| A repeated type shape, constant, or calculation represents one stable domain concept | A generic helper would add flags, callbacks, conditionals, or cross-domain dependencies that obscure the code |
| Shared test setup describes one common scenario and improves test readability | Separate tests need to state their scenario independently and duplication is shorter than an opaque test framework |
| A bug fix would need to be repeated in several locations if left duplicated | A prototype or experimental branch needs to remain isolated and easy to discard |

Do not use DRY to centralize unrelated gameplay rules into a broad manager, utility dump, event bus, or god file. Shared code must have a clear owner and a narrow, meaningful name. Do not use WET as an excuse to duplicate an authoritative simulation decision: a decision still has one owner, one cadence, and one authoritative mutation path.

For detailed TypeScript examples and further guidance, see [`References.md`](References.md). Its examples are supporting material; the ownership, cadence, worker-authority, and major-change rules in this file remain controlling.

## 11. Protected legacy/legend files: do not add new code

The following files are deliberately retained as **protected legacy/legend files** by developer choice. They are historical compatibility and coordination boundaries, not destinations for new code. `src/game/tickLayerDaily.ts` has completed its serial decommissioning and remains an ordered daily schedule facade. **Do not add new features, subsystems, independent behavior, state fields, save data, constants, or unrelated responsibilities to these files.** Place all new code in a clearly named adjacent successor module; a protected file may call that module only where its existing coordination or compatibility boundary requires it.

| Protected legacy/legend file | Why it is protected | Required destination for new work |
|---|---|---|
| `src/game/buildingActions.ts` | Legacy command facade retained for public compatibility after its action domains were split | The focused building command owner; do not add new command policy here |
| `src/game/dayCycle.ts` | Legacy calendar/schedule facade retained for compatibility after clock, schedule, residency, and lifecycle behavior were split | `dayCycleClock.ts`, `dayCycleConstants.ts`, `humanSchedule.ts`, `residency.ts`, or the focused lifecycle owner |
| `src/App.tsx` | Legacy application composition root retained for route and callback compatibility after presentation seams were split | The focused shell, map, build, inspector, overlay, sidebar, or hook owner |
| `src/game/tickLayerDaily.ts` | Legacy ordered daily-schedule facade retained after daily economy, population, challenge, event, and ecology policy were split | The appropriate existing daily owner; do not add a new tick layer |
| `src/game/humanTick.ts` | Realtime human coordinator retained for priority and shared-context compatibility while behavior slices are split | A named human-behavior module, still called from the existing realtime human pipeline |

This rule does **not** prohibit maintenance, targeted bug fixes, type-only changes, deletion, or extracting existing code from a protected legacy/legend file. It prevents the file from receiving any new independent responsibility or new data. Preserve the existing public entry point during staged extraction when it avoids unnecessary churn; do not use a protected file as a convenient home for future features.

### Protected legacy/legend boundary: `src/game/buildingActions.ts`

`buildingActions.ts` is **a protected legacy/legend file and no longer an active god file**. It is a small, public compatibility façade over placement, staffing, residency, maintenance, configuration, settler-interaction, workshop-economy, and legacy generic-routing owners. It must not receive action policy, direct authoritative writes, new features, state fields, constants, or independent functions. New command behavior belongs in the focused domain owner; legacy exports may remain only while callers migrate.

### Protected legacy/legend boundary: `src/game/residency.ts`

`residency.ts` is **a protected legacy/legend file and no longer an active god file**. It is a narrow public compatibility facade over `residencyOccupancy.ts`, `householdComposition.ts`, `residencySelection.ts`, and `residencyReconciliation.ts`. Housing remains one authoritative domain owner; the focused modules divide internals without changing residence fields, save schema, worker boundaries, or assignment cadence. New residence policy belongs in the appropriate focused module, not in the facade.

### Protected legacy/legend boundary: `src/game/dayCycle.ts`

`dayCycle.ts` is **a protected legacy/legend file and no longer an active god file**. It has been decomposed into a narrow compatibility facade and must not receive **new data, state fields, domain rules, gameplay features, constants, or independent functions**. It may only change to move existing legacy behavior out, remove a completed compatibility export, or retain a deliberate forwarding export during migration.

| New concern | Required destination |
|---|---|
| Calendar arithmetic, tick/day/hour conversion, or calendar constants | `dayCycleClock.ts` or `dayCycleConstants.ts` |
| Work shifts, social hours, or home-preference behavior | `humanSchedule.ts` |
| Household, occupancy, capacity, placement, partner residence, or residence reconciliation | `residency.ts` or one of its focused successor modules |
| Death cleanup, family-reference cleanup, grief, custody, or adoption | `humanLifecycleCleanup.ts` |
| New life-stage, age, fertility, or lifespan data/rules | A new focused lifecycle-timing module, such as `humanLifecycleTiming.ts` |

Do not treat the facade as a convenient shared location. If a new concern has no listed destination, create a narrowly named module for that concern rather than adding it to `dayCycle.ts`.

Do not solve a god-file problem by creating a generic manager, utility dump, broad event bus, or extra tick layer. Prefer a narrow module with one understandable concern, a clear owner, and a name that describes what it does.

## 12. Verification and performance

Evidence should match risk. Do not require a full audit for a cosmetic change, and do not accept a compile-only check for a simulation rewrite.

| Change type | Minimum evidence |
|---|---|
| Visual or UI behavior | Targeted manual check or screenshot; verify that presentation does not mutate simulation state |
| Isolated domain rule | Targeted test or deterministic reproduction of the behavior and its edge case |
| Simulation, worker, command, or invariant change | Focused regression test plus checks for affected ownership, cadence, and delta behavior |
| Save/migration/world-state schema | Load/import and round-trip evidence, migration coverage, and compatibility impact stated clearly |
| Major permanent change | The above evidence plus an impact notice, player-facing verification, and a rollback or containment plan where practical |
| Performance work | Before/after measurement and evidence that intended gameplay behavior still occurs |

Tests, diagnostics, and visual checks exist to help creative work become trustworthy. They must not be used as a reason to omit an ambitious feature; scale the validation to the change.

## 13. Private bug records

Read c:\bug_reports\readme.md for the template for filing a bug report, for all big bugs wo require a overhual of the code you need to fill a bug report conform this rules.

Every reproducible defect receives a local bug record before or alongside the fix. A short record is sufficient for contained visual, test-tooling, or minor UI defects. A **detailed** record is required for simulation truth, worker/command behavior, data integrity, saves/migrations, crashes, a player-blocking issue, an architectural regression, or any defect whose cause or impact is not clearly contained.

Store one local private record per bug under `BUG_REPORTS/`, for example:

```text
BUG_REPORTS/2026-08-28-worker-command-order.md
```

Use this format and add detail as the impact requires:

```md
# Bug: <short name>

- Status: open | investigating | resolved | resolved — live verification pending | won't-fix
- Date discovered:
- Version/build:
- Reporter:
- Area: Play | Truth | worker | UI | save/migration | performance
- Owner module: (optional for contained non-simulation defects)
- Cadence: (optional for contained non-simulation defects)

## Status history
- YYYY-MM-DD — open (how it was discovered)

## Observed behavior

## Expected behavior

## Reproduction steps
1.
2.
3.

## Evidence

## Root cause

## Fix

## Regression test

## Invariants checked

## Save/migration impact

## Verification result

## Related files
```

For a short record, mark inapplicable sections as `Not applicable — contained visual/tooling defect.` Do not invent an invariant or migration impact merely to satisfy a template. For a detailed report, explain affected owner/cadence, root cause, fix, regression protection, and persistence impact.

Keep reports private and local by default. Do not stage, commit, push, upload, or quote their diagnostics publicly unless the developer explicitly asks. Preserve resolved reports as historical context.

## 14. Working standard

A good Wilderfolk change is not merely one that passes tests. It is one that expresses an intentional piece of the game: it has a clear home, behaves on the intended cadence, survives the worker and save boundaries, is visible and understandable to the player, and leaves room for the next creative improvement.

When a rule in this document appears to make a good idea impossible, do not abandon the idea. Identify the constraint it protects, propose a safe replacement, inform the developer if the change is major, and evolve the design deliberately.

**Build boldly. Keep the world coherent.**
