# Wilderfolk v0.6.2.1 Roadmap

**Status:** Planned after v0.6.2  
**Purpose:** Deliver the first player-facing story loop while closing the remaining verification and simulation-proof gaps.  
**Release principle:** v0.6.2.1 is a **trust-and-stories** patch, not a broad systems rewrite.

> A good v0.6.2.1 moment should let the player say: “I saw why this happened, chose a response, and later saw its result in the village.”

## 1. Release outcome

Version 0.6.2 restored a village that works, celebrates, talks, and grows up. Version 0.6.2.1 should make those systems produce the first clear, player-directed stories while proving that the worker, movement, and birth paths still behave correctly in a normal game.

| Release promise | What the player notices | What must remain true |
|---|---|---|
| **Requests have meaning** | A named settler, household, or visitor occasionally asks for help that is visibly tied to current village conditions. | At most one active request; no surprise resource loss; no new generic event manager. |
| **The village is trustworthy** | Long commutes, events, dialogue, hospital trips, and births work in live play. | Worker authority, fixed cadence, and existing owner boundaries remain unchanged. |
| **The world gains depth** | People, animals, trees, and buildings sit more convincingly on the terrain. | Rendering stays presentation-only and does not mutate simulation state. |

## 2. Scope decision

The release contains four workstreams. The first three are release gates; the fourth is a bounded presentation improvement. If a gate reveals a real defect, repair and verify it before expanding feature scope.

| Priority | ID | Deliverable | Player value | Owner and cadence | Release status |
|---:|---|---|---|---|---|
| 0 | **V1** | Complete five live verification scenarios | Confidence that repaired systems work during play, not only tests | Existing owners; normal play session | Mandatory gate |
| 1 | **T1** | Lifecycle golden contracts | Birth, lineage, and pregnancy outcomes stay dependable as family stories expand | `humanLifecycle.ts` and `entityFactory.ts`; pregnancy-progress / construction | Mandatory gate |
| 2 | **T2** | Browser-worker transport integration coverage | Assignments and request choices retain worker-authoritative behavior | `GameWorkerHost` and `gameLoop`; transport integration | Mandatory gate |
| 3 | **S1a** | Village Requests: first vertical slice | One meaningful choice creates a visible village consequence | Existing `groupEvents.ts` / visitor-quest event domain; daily generate and resolve | Main feature |
| 4 | **G1** | Grounded 2.5D depth | Contact shadows make the whole village more readable and less pasted-on | Existing renderer passes; viewport-culled render frame | Cosmetic addition |

### Explicit non-goals

The following stay outside v0.6.2.1: seasonal-preparation mechanics, expeditions, a culture system, a broad relationship rewrite, worker architecture replacement, Phaser/WebGL migration, a new simulation tick layer, and any roads-that-change-movement feature. They belong to later releases because they expand state, cadence, and balancing risk beyond this patch.

## 3. V1 — live verification gate

The existing automated reports are resolved, but five player-facing checks remain. These are not optional polish: they establish the safe baseline for adding new daily stories.

| Check | Normal-game scenario | Pass condition | If it fails |
|---|---|---|---|
| **P1 — Rivers** | Start a new Verdant map and one other preset; follow the river at normal zoom. | A continuous blue channel with readable banks agrees with the minimap; no trees occupy river cells. | Reopen the river report; repair presentation before G1 or terrain work. |
| **P2 + P5 — Commute** | Send a settler across a river or mountain obstruction; repeat at normal and fast speed. | The route avoids the obstruction, reaches the target, and does not visibly reset or stutter. | Reopen the movement report; no S1a work until path stability is restored. |
| **P3 — Paired dialogue** | Let several nearby adults socialize for several in-game hours. | No overlapping/self-conversations or repeated paired starts while a dialogue remains active. | Reopen the dialogue-busy report; do not add request dialogue until fixed. |
| **P4 — Lifecycle** | Observe a long commute, hospital visit when available, and a birth/event-log entry. | Movement stays responsive; hospital routing is sensible; one birth creates one child and clears pregnancy state without warnings. | Fix lifecycle/movement first; T1 becomes the immediate work item. |

**Completion record:** Each check must record map preset, approximate game day, result, screenshot or console evidence if it fails, and the linked bug-report status change. One successful long commute may close both P2 and P5 when the note says so explicitly.

## 4. T1 — lifecycle golden contracts

The youth-love feature makes reliable family state more visible, so the existing lifecycle test gap must close before broader personal stories are added.

| Contract | Owner | Deterministic proof | Required invariant |
|---|---|---|---|
| Ordinary birth | `humanLifecycle.ts` | Existing pregnancy reaches due progress and creates exactly one child. | Parent pregnancy state clears; newborn appears in same-tick indexes. |
| Stillbirth | `humanLifecycle.ts` with injected RNG | The loss outcome creates no living child and writes the correct event. | Pregnancy fields and temporary parent state clear once. |
| Wildkin / lineage path | `humanLifecycle.ts`, `entityFactory.ts` | Correct child type, parent IDs, surname/lineage rules, and event entry. | No duplicate child or missing parent link. |
| Immigrant pregnancy | `entityFactory.ts` | A pre-pregnant arrival has a valid due progress immediately. | `pregnant` always implies valid due progress. |
| Save/worker parity | Worker preparation and delta path | The same fixture produces the same authoritative snapshot after a worker round trip. | No lifecycle-only state omitted from snapshots or rollback preparation. |

**Acceptance criteria:** Add `tests/humanLifecycle.test.ts` with injectable deterministic randomness. Run lifecycle, invariant, relationship-diagnostic, worker-round-trip, TypeScript, full-suite, and build validation. Do not tune conception rate, pregnancy duration, or fertility during this objective.

## 5. T2 — real browser-worker transport proof

Worker-domain tests prove commands and deltas, but v0.6.2.1 needs an explicit browser-worker path that proves the real transport boundary.

| Scenario | Required proof |
|---|---|
| Startup | A browser Worker starts the authoritative simulation and delivers a first tick snapshot. |
| Command | A typed command is sent through `GameWorkerHost`, resolves in FIFO order, and reconciles the optimistic display with the authoritative result. |
| New request command | The S1a choice command follows the same validated transport path; the UI cannot mutate request state directly. |
| Fallback | A tick/transport fault restores the authoritative shadow and resumes the main-thread path without leaving an optimistic action visible. |
| State coverage | Any request state introduced by S1a is included in worker preparation, rollback, and sim-delta coverage. |

**Acceptance criteria:** The configured browser-worker test command exists, is documented, and is runnable in the supported environment. It must test startup, tick delivery, command dispatch, reconciliation, and fallback. This is a test-surface repair, not an excuse for a worker rewrite.

## 6. S1a — Village Requests, first vertical slice

S1a is intentionally smaller than the full Village Requests and Personal Projects roadmap item. It must prove one complete loop before more request types are added.

### Player experience

Once per eligible interval, one named person or small group can make one readable request. The card says **who**, **why now**, **what each response costs**, and **when the result will be visible**. The player chooses a response or declines; the Chronicle and world feedback show the result.

### Initial request set

| Request | Trigger from existing state | Player options | Resolution and visible result |
|---|---|---|---|
| **Crowded household** | A valid household has no completed home or exceeds available capacity. | Prioritize a house; grant limited Town Hall aid; defer. | Existing construction/housing outcome, reputation or beauty feedback, clear expiry if the household changes. |
| **Visitor bargain** | A visitor group has a matching supply/need and the village can meet it. | Trade now; make a promise; decline. | Real resource/gold transfer plus existing reputation or visitor consequence. |
| **Festival proposal** | A festival is approaching and food/beauty prerequisites are met. | Sponsor; keep it modest; cancel. | Existing festival starts with a declared variant and resource cost; a closing summary reports the outcome. |

The first slice may ship with **two** request types if the third would dilute tests or UI clarity. It must not ship with generic random notifications.

### Ownership contract

| Contract item | v0.6.2.1 decision |
|---|---|
| Authoritative owner | Extend the existing `groupEvents.ts` / visitor-quest event domain. Do not create an event manager. |
| Generation cadence | `tickLayerDaily.ts` invokes the existing event domain at a daily gate. One active request maximum; visible cooldown after resolution or expiry. |
| Resolution cadence | A typed player command validates an option. The request owner resolves immediate costs or schedules a daily result. |
| UI boundary | A read-only snapshot card renders in the existing village/event surface. A button sends one command; it never writes `WorldState` locally as authority. |
| State | One explicit `activeVillageRequest` record, cooldown, and resolved-history summary. Reuse existing resources, reputation, festival, visitor, housing, and construction state. |
| Failure behavior | If a prerequisite disappears, resolve the card as withdrawn or expired and write a Chronicle entry. Never silently charge or mutate a household. |
| Performance | Bounded candidate shortlist on the daily gate. No per-tick scan and no repeated full-population relationship search. |

### S1a acceptance matrix

| Proof area | Required case |
|---|---|
| Generation | Each request type appears only from its documented world-state condition. |
| Scarcity | No second active request can appear while one is open; cooldown prevents notification spam. |
| Command validation | Every option rejects stale IDs, invalid resources, and expired requests without changing state. |
| Resolution | Costs, rewards, event-log entry, floating feedback, and underlying existing-domain result agree. |
| Cancellation | A vanished visitor, completed house, or ended festival resolves visibly and safely. |
| Save / worker | Active request serializes, restores, rolls back, and reaches the main thread through deltas. |
| Performance | Request frequency per 30 days and p50/p95 daily tick cost are recorded at agreed population tiers. |

## 7. G1 — grounded 2.5D depth

G1 is a presentation-only enhancement paired with S1a because request stories read better when the village itself has clearer depth. It must remain small.

| Subject | Change | Guardrail |
|---|---|---|
| Humans and animals | Small elliptical contact shadow under the foot position. | Draw visible subjects only; no simulation fields. |
| Trees and buildings | Conservative shared-direction shadow and stable occlusion order. | Must not hide nearby units or alter click targets. |
| Accessibility | Respect the existing reduced-effects/cosmetic setting path if available. | The effect can be reduced or disabled. |
| Verification | Before/after normal-zoom screenshots plus frame-time comparison. | No terrain or entity-cache invalidation every frame. |

## 8. Implementation order for the next agent

1. Read `docs/AGENTS.md`, `docs/WILDERFOLK_ONE_DOC_TO_FOLLOW.md`, `docs/SIMULATION_AUTHORITY.md`, and this roadmap once at session start.
2. Perform and record V1 live checks before changing simulation behavior. If any fails, file or reopen its governed bug report and make that repair the active objective.
3. Implement T1 lifecycle contracts. Do not change balance values while proving behavior.
4. Implement T2 browser-worker transport coverage. Confirm new authoritative fields are reviewed against preparation, rollback, and delta paths.
5. Before coding S1a, write a short feature proposal that names the owner, daily gate, state schema, command shape, each request’s trigger, cooldown, expiry, test matrix, and save impact. Update the authority/decision registry before implementation if new state is accepted.
6. Implement one request type end-to-end first. Verify generation, card, command, worker result, deferred resolution, Chronicle result, expiry, save/load, and focused performance. Add a second type only after the vertical slice is green.
7. Implement G1 only after S1a works. Keep rendering changes separate from request-state work and benchmark them independently.
8. Update `CHANGELOG.md` and player-facing `README.md` only after the full release acceptance gate passes. Bump the version once the scope is frozen.

## 9. v0.6.2.1 release gate

The patch may ship only when all conditions below are met.

| Gate | Required evidence |
|---|---|
| Live play | P1–P5 are recorded as pass, or any failure is repaired and re-verified. |
| Ownership | Every new decision has one named owner, one cadence, allowed writes, and no new tick layer. |
| Worker authority | New request state has worker/main-thread parity, preparation, delta, rollback, and command-result coverage. |
| Test baseline | Focused tests, full suite, TypeScript, scoped lint, and production build pass. |
| Performance | Daily request and G1 frame work are measured; no regression at the agreed population tiers. |
| Player readability | Every request exposes cause, option, cost, and visible result; no hidden punishment or silent expiry. |
| Documentation | Authority/decision registry, change record, changelog, README, and bug reports are updated as applicable. |

## 10. Roadmap after v0.6.2.1

The release must end with a bounded slice. The next versions can expand only after the release gate is satisfied.

| Candidate version | Theme | Next bounded items |
|---|---|---|
| **v0.6.2.2** | Distinct gatherings and visual materials | S8 Festival Roles and Results; terrain-material bake or water-glint pass, not both if profiling is weak. |
| **v0.6.3** | A frontier worth preparing for | S2 Seasonal Preparation and S6 Ecology Signals: clear warnings, recoverable choices, no invisible depletion. |
| **v0.6.4** | Learning, families, and legacy | S3 Apprenticeship and selected S9 milestones, built from proven school, skills, lifecycle, and youth-love owners. |
| **v0.7.0** | Regional stories and civic identity | S5 Expeditions, S7 Civic Dilemmas, then S10 Settlement Traditions only after their outcomes are readable and stable. |

**Do not pull these forward merely because they sound fun.** v0.6.2.1 earns them by proving the request loop, worker reliability, and player-visible simulation truth.
