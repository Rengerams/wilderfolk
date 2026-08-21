# Wilderfolk v0.6.2.2 Roadmap — Rhythm, Rivalry, and Reliability

**Status:** Local planning draft — not approved for release.  
**Target label:** v0.6.2.2.  
**Purpose:** Plan the next product and technical upgrades after v0.6.2.1.

## 1. Outcome

Version v0.6.2.2 should make time feel like a player-owned village decision and make rival camps behave like persistent neighbouring societies instead of static raid values. It must also reduce the architectural risks that currently obscure that work: the `game-render → game → game-render` production-chunk warning, the documented 43 dependency-cycle warnings, and one oversized orchestration module.

The version should not become a broad rewrite. Every player-facing feature must have a small first playable slice, a single authority owner, a declared cadence, a state/save decision, an explicit rejection path, and a measured test plan. Structural cleanup must earn its place by enabling a named feature or removing a measured runtime risk.

| Release promise | What the player notices | What must remain true |
|---|---|---|
| **The village keeps the hours you choose** | The player can set ordinary work hours and separate tavern/hotel service hours, with visible trade-offs. | A single schedule owner answers shift questions; UI does not mutate work state directly; the 72-tick day remains unchanged. |
| **Long shifts have a human cost** | Extra work improves immediate output but drains energy, affects morale and reliability, and needs recovery time. | Fatigue is bounded, readable, deterministic at the declared cadence, and cannot create a second needs or relationship owner. |
| **Rival camps have a life beyond raids** | Neighbours build strength, recover, trade, make demands, and change their stance for visible reasons. | Rival decisions are authoritative, bounded, daily/system based, saved, worker-safe, and never use an uncontrolled population scan. |
| **The codebase is safer to extend** | No direct player-facing change is required, but renderer loading and simulation imports become easier to reason about. | No speculative chunk split, mass Knip deletion, event bus, tick layer, or gameplay-rule migration is introduced. |

## 2. Scope at a glance

The roadmap contains fourteen objectives. They are ordered by dependency and player value. Every selected simulation objective uses the existing worker-authoritative `WorldState`, typed commands, named transitions, and existing tick layers. Status is maintained here as implementation progresses.

| Priority | ID | Upgrade or feature | Main value | Primary owner/cadence | First-slice outcome | Status |
|---:|---|---|---|---|---|---|
| 0 | **T1** | Measure and resolve the `game-render → game → game-render` circular chunk | Removes the production-build warning only through a proven import/chunk boundary. | Vite/Rollup chunk policy and renderer loader; build-time. | A production build has no renderer/game circular-chunk warning, with no startup or render regression. | **Open — measured, safe fix not yet proven.** Direct Rollup `manualChunks` removed the empty `__commonjsHelpers__` warning. The circular warning remains reproducible and the `game` chunk is 580.49 kB, above the 500 kB threshold. Candidate boundary experiments were rolled back after introducing additional cycles. See `docs/V0_6_2_2_FINAL_OPEN_ITEMS_REPORT_2026-08-21.md`. |
| 1 | **T2** | Classify and reduce the documented 43 dependency cycles | Makes true runtime ownership cycles visible and reduces one high-risk cycle at a time. | Module graph; build-time. | A cycle ledger plus one verified high-risk runtime-cycle reduction. | **Complete** — ledger maintained and one high-risk C03 runtime cycle reduced. |
| 2 | **T3** | Decompose `groupEvents.ts` as the selected god-file slice | Separates rival and village-event responsibilities without a new event bus. | `groupEvents.ts` orchestration; existing daily/event cadence. | One extracted cohesive domain with parity tests and unchanged event order. | **Complete** — rival daily domain extracted to `rivalEvents.ts` with parity coverage. |
| 3 | **W1** | Player-set standard work hours | Lets the player set when ordinary workplaces open and close. | New `workSchedule` domain; schedule query in realtime plus daily reconciliation. | One global weekday work window with a schedule panel and safe validation. | **Complete** — ordinary weekday window, typed command, persistence, worker transport, panel, and tests. School, church, Town Hall, tavern, and hotel schedules remain unchanged by directive. |
| 4 | **W2** | Independent tavern and hotel service hours | Lets hospitality service follow a different schedule from ordinary work. | `workSchedule` / `venueSchedule` domain; realtime service-shift query. | Separate tavern and hotel windows, with staff following their venue’s schedule. | **Complete** — typed worker command, backward-compatible save/prep fields, Settings controls, Tavern festival preservation, Hotel service window, focused coverage, 72-file/416-test regression, build, lint, and diff checks passed. See `docs/W2_VENUE_SCHEDULE_REPORT_2026-08-21.md`. |
| 5 | **W3** | Fatigue, recovery, and productivity consequences | Long or poorly timed work delivers short-term gain and visible long-term cost. | `scheduleFatigue.ts`; existing realtime human owner plus daily production owner. | Overtime adds bounded fatigue, shorter days recover it, and staffed output receives a capped reliability multiplier. | **Complete** — 73 files / 420 tests, TypeScript, production build, ESLint, and diff checks passed. See `docs/W3_FATIGUE_RECOVERY_REPORT_2026-08-21.md`. |
| 6 | **W4** | Schedule feedback and workforce safeguards | Makes effects understandable before and after a player changes a schedule. | `scheduleFeedback.ts`; existing schedule panels, typed command path, and daily event-log owner. | Preview of hours/workplaces/staff, blocked/unchanged/accepted status, festival override visibility, and concise daily fatigue feedback. | **Complete** — 74 files / 423 tests, TypeScript, production build, ESLint, and diff checks passed. See `docs/W4_SCHEDULE_FEEDBACK_REPORT_2026-08-21.md`. |
| 7 | **R1** | Rival-camp profiles and persistent ledgers | Gives each rival a readable identity, resources, priorities, and recovery state. | `rivalProfiles.ts`; rival creation and existing daily rival owner; read-only Frontier panel. | Existing and newly created rivals show deterministic bounded profiles and persistent ledgers with legacy normalization. | **Complete** — focused R1 tests, worker transport retry, TypeScript, build, ESLint, and diff checks passed. See `docs/R1_RIVAL_PROFILES_LEDGER_REPORT_2026-08-21.md`. |
| 8 | **R2** | Rival daily simulation | Rivals grow, recover, trade, prepare, or cool down for visible reasons. | `rivalEvents.ts` daily owner plus pure `rivalProfiles.ts` action policy. | At most one bounded state-driven action per eligible rival, with ledger spending/recovery and Chronicle feedback. | **Complete** — 75 files / 429 tests passed in the completed full-suite run; TypeScript, build, ESLint, and diff checks passed. See `docs/R2_RIVAL_DAILY_SIMULATION_REPORT_2026-08-21.md`. |
| 9 | **R3** | Rival diplomacy, demands, and consequence loop | Makes peace, competition, trade, tribute, and hostility legible decisions. | Existing `groupEvents.ts` diplomacy owner plus typed `respondToDiplomacyEvent` command; daily/command. | One transparent rival contact with exact choice eligibility, persisted expiry, one authoritative outcome, and visible stored consequence. | **Complete** — explicit expiry, stale/idempotent resolution, bounded rival contact memory, expiry UI, 26 focused tests, TypeScript, build, lint, and diff checks passed. See `docs/R3_RIVAL_DIPLOMACY_REPORT_2026-08-21.md`. |
| 10 | **R4** | Rival-camp presence, Chronicle, and map readability | Connects abstract faction values to camps, visits, warnings, and history. | `rivalPresence.ts` read-only selectors, FrontierPanel, existing event-log and renderer marker owners. | Clear rival summary card, current activity, stance cue, latest contact/history and map marker readability. | **Complete** — 3 focused files / 16 tests, TypeScript, build, ESLint, and diff checks passed. See `docs/R4_RIVAL_PRESENCE_HISTORY_REPORT_2026-08-21.md`. |
| 11 | **Q1** | Static-audit signal cleanup | Reduces confirmed stale exports/modules in small evidence-led batches. | Tooling/module boundaries; build-time. | A classified audit baseline and one safe cleanup batch; no mass deletion. | **Complete** — Knip baseline classified (34 files, 105 exports, 25 exported types); obsolete `vite-plugin-auto-chunk` and `vite-plugin-chunk-split` dependencies removed safely. Remaining candidates are retained as audit/tooling or compatibility surfaces. |
| 12 | **Q2** | Live browser-worker and schedule/rival regression scenarios | Proves the new commands and daily state survive the real player path. | Worker transport and GameLoop reconciliation. | Seeded browser checks and command/result parity for each new state field. | **Partial — runtime regression verified: 10 files / 46 tests passed; real browser session blocked because desktop localhost was unreachable from the sandbox browser. |
| 13 | **E1** | Ten children at the gate shelter story | Adds a one-time moral choice with a delayed, hidden rival consequence. | `storyEvents.ts`; daily story cadence. | After day 10, ten children request five days of shelter; help/refuse resolves to friendship/war only afterward. | **Complete** — story event, bed gate, five-day resolution, rival consequence, tests, and documentation. |
| 14 | **Q3** | Relationship, housing, and presentation diagnostics | Makes relationship/housing state and runtime performance legible without adding mutation paths. | Read-only diagnostics modules and presentation/UI layer. | Active relationship snapshot history, housing invariant report, and Settings FPS toggle with map-corner overlay. | **Complete** — 71 test files / 411 tests, TypeScript, production build, ESLint, and diff checks passed. |
## 4. Technical preparation and structural upgrades

### T1 — measured renderer/game chunk boundary

The current Vite policy routes renderer files to `game-render` while the game hub remains elsewhere, and the production build reports a circular chunk through `game-render → game → game-render`. This objective begins with a module-level import trace and measurements of production first-load, renderer initialization, worker readiness, and first playable frame. It must not simply rearrange `manualChunks` until the warning disappears.

The preferred outcome is a leaf-shaped render contract: render passes may depend on render snapshots, pure type/value leaves, sprite loading, and presentation helpers, but not import a game hub that imports them back. If a boundary extraction is needed, use a small shared render-contract module rather than a second renderer or an event bus. The decision is complete only when the warning is gone, rendering behaviour remains intact, and the build/normal game startup comparison is recorded.

| Contract | Required proof |
|---|---|
| Import direction | `game-render` has no runtime path back into the game hub through a renderer dependency. |
| Presentation boundary | Renderer code reads an explicit render snapshot or stable presentation contract; it does not take ownership of world mutation. |
| Build result | Production build completes without the named circular-chunk warning. |
| Performance | Compare bundle topology, worker-ready latency, first render, and normal frame behaviour before and after. |
| Non-goals | No silent manual-chunk suppression, WebGL migration, renderer rewrite, or worker architecture replacement. |

### T2 — 43-cycle ledger and reduction programme

The documented audit lists 43 dependency-cycle warnings across domains including `gameTypes`, `dayCycle`, effects, world events, workforce, Moon Howler code, and `gameTick`. The first output is a maintained local ledger that classifies each cycle as **type-only**, **tooling-only**, **runtime but harmless**, **runtime and high-risk**, or **owner-boundary violation**. Each entry must name the import path, runtime evaluation risk, owner implication, and planned action.

Only one high-risk runtime cycle should be broken in a code objective at a time. A type-only cycle may be documented as accepted only if it cannot execute values during module initialization and does not invert a domain-owner relationship. The cycle count may not rise. The purpose is understandable architecture, not winning a numeric audit contest.

### T3 — selected god-file: `groupEvents.ts`

`groupEvents.ts` is the selected decomposition target because it is already a crossroads for visitor, group, diplomacy, rival, and request behaviour. The split must support the rival-camp work rather than simply scatter functions.

The proposed shape is for `groupEvents.ts` to retain bounded orchestration and ordering, while an explicitly named `rivalEvents.ts` owns rival daily decisions and rival-facing resolution helpers. Existing Village Request logic remains where it is until an import trace shows whether a small `villageRequests.ts` leaf is warranted. No code should move until the decision registry and authority record name the new boundary.

| Safety condition | Required decision |
|---|---|
| One owner | Rival state writes move together into the rival domain; no duplicate daily rival tick remains in `groupEvents.ts`. |
| Cadence | Preserve the current daily/event order unless a developer-approved design change explicitly changes it. |
| Worker/save coverage | Every new rival field is handled by authoritative worker preparation, rollback, delta, save allow-list, and load defaults. |
| Tests | Existing group-event and frontier-combat tests retain parity; new isolated rival tests cover action selection, no-op gates, and state persistence. |
| Non-goals | No generic event manager, global event bus, ECS rewrite, or unrelated Village Request redesign. |

## 5. Work schedules: choice with consequences

### W1 — player-set standard work hours

The first schedule slice gives the player one global weekday standard-work window. The command accepts only whole clock hours, validates a bounded duration, and returns a reason when a chosen window is invalid. It must preserve the 72-tick day and reuse the shared schedule query used by work movement, education, production, and UI displays; no subsystem may quietly retain an old hard-coded 07:00–18:00 assumption.

The initial recommended bounds are a developer-tunable **minimum six hours** and **maximum twelve hours** per weekday. The player may choose start and end hours, but the schedule cannot wrap through midnight in its first slice. Night shifts, per-building schedules, split shifts, weekends, and individual worker contracts are deliberately deferred until the one-window rule is proven.

### W2 — independent tavern and hotel service hours

**Status: verified (2026-08-21).** Tavern and Hotel now have separate bounded non-wrapping service windows in the existing schedule UI. Legacy saves use canonical defaults of 17:00–23:00 for Tavern and 06:00–22:00 for Hotel. `setVenueSchedule` is validated and applied only through the existing typed worker-command boundary, transported through `simPrep`, and included in the save allow-list. `humanTick.ts` uses the venue schedule for Innkeeper and Hotelier service movement; school, Church, Town Hall, ordinary workplaces, and hotel guests are unchanged. Tavern festivals retain their existing all-day override. The objective report is `docs/W2_VENUE_SCHEDULE_REPORT_2026-08-21.md`.


Taverns and hotels require their own service windows because hospitality is not ordinary farm or workshop labour. The player sets a bounded service start/end for taverns and a separate start/end for hotels. The existing normal-service window remains the initial default; a festival may temporarily override the venue schedule only through an explicit and visible rule.

This objective must state how multiple assigned workers cover a longer service day. The first slice should use existing staff only: an understaffed venue may operate with reduced service rather than silently assigning people or inventing a new personnel system. Hotel residents and guests must not be treated as employees merely because the building is open.

### W3 — fatigue, recovery, and productivity

**Status: verified (2026-08-21).** `scheduleFatigue.ts` now records bounded work-load state, resolves prior-day fatigue at the existing calendar-day boundary, and supplies a capped staffed-production multiplier. Work ticks are recorded by `humanTick.ts`; the daily owner resolves fatigue using an eight-hour neutral target, excess-hour cost, short-day recovery, and baseline recovery. Fatigue is bounded to 0–100 and production reliability is bounded to 0.65–1.00. The existing Work hours panel shows the colony average. No new tick layer, pregnancy/mortality/relationship effect, automatic staffing, or cadence change was introduced. See `docs/W3_FATIGUE_RECOVERY_REPORT_2026-08-21.md`.


Schedule choice needs real consequences. Long shifts should increase immediate staffed-time output while adding bounded fatigue pressure. Energy is already an understandable player-facing resource, so the first slice should use it rather than create a parallel hidden exhaustion simulation.

A daily schedule consequence evaluates the previous day’s worked hours against a neutral target. Excess hours add a capped fatigue contribution; insufficient rest suppresses recovery. Fatigue then affects a limited and communicated set of existing outcomes, such as reduced next-day workplace output, lower social willingness, or an increased chance of taking rest. It must not directly alter pregnancy, mortality, relationship formation, or random catastrophes in the first version.

| Schedule state | Immediate benefit | Consequence | Recovery route |
|---|---|---|---|
| Shorter ordinary shift | More free time and lower fatigue. | Lower same-day output and slower construction/production. | Natural low fatigue. |
| Normal shift | Baseline production and social time. | No schedule penalty. | Normal sleep and meals. |
| Extended shift | More staffed time and near-term output. | Extra energy drain, fatigue carry-over, reduced next-day effectiveness. | Shorter following shift, adequate food, sleep, and venue closure/rest. |
| Overextended or poorly recovered | No automatic punishment event. | Clear low-energy/rest behaviour and capped reduced reliability. | Player visibly changes schedule or restores basic needs. |

### W4 — player clarity, workforce safeguards, and live feedback

**Status: verified (2026-08-21).** Ordinary, Tavern, and Hotel schedule panels now show expected hours, affected workplaces/venues, assigned staff, plain-language fatigue warnings, and explicit blocked/unchanged/accepted local command status. Tavern festival overrides are visible. Meaningful daily fatigue changes are recorded through the existing event-log/Chronicle stream. The UI remains read-only and no School, Church, Town Hall, staffing, pregnancy, mortality, relationship, or cadence behavior was changed. See `docs/W4_SCHEDULE_FEEDBACK_REPORT_2026-08-21.md`.


The schedule panel must show the current ordinary, tavern, and hotel hours; affected workplaces; expected hour count; and a plain-language warning before a longer shift is sent. The authoritative command result should distinguish **accepted**, **blocked by bounds**, **unchanged**, and **temporarily overridden by a festival**.

After a daily resolution, concise feedback and Chronicle entries should explain meaningful changes: for example, a high-output week that left workers tired, an inn that closed early because its scheduled staff had no energy, or a deliberately shorter harvest day. This is feedback, not a flood of notifications.

### Work-schedule contract

| Contract item | Planned decision |
|---|---|
| Authoritative owner | A dedicated `workSchedule` domain proposed before coding; schedule policy is not spread among `dayCycle.ts`, `humanTick.ts`, and UI. |
| Cadence | Typed command changes a schedule immediately; queries run in existing realtime/work systems; fatigue consequence runs once daily through the existing daily layer. |
| State | Explicit world schedule plus bounded per-human schedule/fatigue fields only if a first slice proves they are needed. |
| UI boundary | UI reads snapshots and sends one typed command; no local `WorldState` mutation. |
| Save/worker | Any accepted field receives save defaults, worker preparation/rollback, sim delta, and backward-safe load handling. |
| Initial non-goals | No per-person contracts, shifts that cross midnight, automatic staffing, new tick layer, forced labour, or invisible happiness system. |

## 6. Rival camps: from values to neighbouring societies

### R1 — rival profile and persistent ledger

Existing rival records already carry relationship, population, treaty, combat, and raid-related concepts, while some distant camps are deliberately abstract. The first upgrade must preserve that useful abstraction. Do not require every rival to be continuously represented by on-map settlers.

Each rival gains a compact, bounded profile: camp name/style, current stance, strategic priority, provisions/wealth band, recovery pressure, recent action summary, and a small relationship-memory ledger. The profile uses bands or capped values rather than an unbounded parallel economy. The UI explains whether the camp is visible on the map, travelling, distant, recovering, trading, or preparing a hostile act.

### R2 — daily rival action simulation

Once a day, each eligible rival picks at most one action from a short state-driven menu. The choice is deterministic under injected RNG and must record its reason. Candidate actions include recover after a loss, gather supplies, seek trade, make a diplomatic contact, fortify, scout, make a limited demand, or cool down after a treaty. Raids remain a distinct frontier-combat decision and do not become a guaranteed daily outcome.

The action rule must be bounded by the number of rival settlements, not by the player population. It may inspect existing rival/world summaries, but it must not scan all humans in a realtime loop. A rival that has no valid action records no action rather than forcing a random story.

### R3 — diplomacy, demands, and stored consequences

The first player-directed rival loop is one transparent contact card or map-panel decision. An example is a rival offering a trade, requesting food after a poor season, demanding tribute while tense, or proposing a temporary peace. The player sees the cause, exact cost, possible benefit, expiry, and likely relationship consequence before responding.

This reuses the proven typed-command pattern from Village Requests, but it does not overload a caravan offer with rival state. The rival domain validates the command, checks a live request/action ID, preflights resources, applies one outcome, writes a Chronicle entry, and prevents a repeated/stale command from producing a second transfer.

### R4 — visible camp life and history

Rival display becomes a concise story surface rather than a list of abstract labels. The map or rival panel may show a camp marker, current activity, stance, latest contact, treaty duration, threat/readiness cue, and a small history of meaningful outcomes. Chronicle entries explain changes in words the player can understand: a camp recovered, trade went well, a peace offer was refused, scouts were seen, or a rival is quiet after defeat.

| Rival state | Player sees | Simulation source |
|---|---|---|
| Distant/abstract camp | Identity, stance, activity, and reason it is off-map. | Bounded rival profile and daily action summary. |
| Recovering camp | Lower immediate threat and an explanation of the recovery state. | Existing combat outcome plus rival recovery pressure. |
| Trading/contacting | A named offer, precise costs, expiry, and outcome. | One active rival decision, typed command, and Chronicle result. |
| Tense/hostile camp | Readiness or demand warning rather than a surprise guaranteed raid. | Relationship, resources, treaty state, and documented action gate. |
| Peaceful camp | Treaty duration and potential cooperative action. | Existing peace data plus history ledger. |

### Rival-camp contract

| Contract item | Planned decision |
|---|---|
| Authoritative owner | Extracted `rivalEvents.ts` or another developer-approved rival domain; only that owner writes strategic rival state. |
| Cadence | Daily action selection; command-time resolution; existing combat cadence for raids and combat outcomes. |
| State writes | Bounded rival profile, recent action, relationship-memory values, active rival contact, and existing resources/reputation/outcome fields. |
| UI boundary | Read-only rival card/map display; buttons issue typed commands. |
| Failure behaviour | Missing/dead/invalid rival, expired contact, unavailable resources, duplicate command, and removed map marker reject safely with visible feedback. |
| Initial non-goals | Full rival worker simulation, a second map, continuous off-screen pathfinding, guaranteed raids, or unbounded faction economies. |

## 7. Quality and verification work

### Q1 — static audit signal cleanup

The static audit currently emits large unused-export and duplicate-export output. The purpose of this objective is to make audit results useful, not to delete code for a lower number. Classify each batch into public API/test entry point, intentional compatibility surface, stale code, or duplicate owner. Remove only traced, confirmed dead code in small batches. Any actual behavioural defect discovered during this work gets a private local report and focused regression test.

**Completed Q1 batch — duplicate-export harmonization (2026-08-21).** The five identified duplicate-export groups were resolved by migrating callers to canonical names and removing confirmed stale aliases rather than silently deleting canonical entry points. This included `buildWorkTicks` → `buildWorkHours`, `MOON_HOWLER_CHURCH_CURE_CHANCE` → `MOON_HOWLER_OUTCOME_CURE`, `forEachEntityInRadius` → `forEachInEntityGrid`, `generateHumanSprites` → `loadHumanWalkSheets`, and the lifespan group: active `HUMAN_ADULT_MAX_AGE` callers were migrated to `HUMAN_MAX_LIFESPAN_YEARS`, after which `HUMAN_ADULT_MAX_AGE` and `HUMAN_MAX_LIFESPAN_DAYS` were removed. No simulation values, ownership boundaries, cadence, or invariant protections changed. Validation passed with the full regression suite (**70 files / 404 tests**), focused final lifecycle validation (**4 files / 22 tests**), production build, ESLint, and `git diff --check`. The final Knip audit reports no duplicate-export groups. Detailed evidence is recorded in `docs/DUPLICATE_EXPORT_REVIEW_2026-08-21.md`; unused-file/export triage remains separate follow-up work.

### E1 — ten children at the gate shelter story

A one-time authored story may appear from colony day 10 onward when a rival settlement exists. Ten children request five days of shelter. The player sees only the help/refuse decision; the rival consequence is intentionally withheld until the five-day interval ends. Helping requires ten free beds across completed player Houses or Mansions, excludes the reserved Leader House and rival residences, and fails atomically when the village cannot accommodate the request. Helping later makes the first rival friendly with a 180-day peace treaty; refusing later makes that rival tense and clears its peace treaty so the existing frontier system can escalate the conflict. The current slice records the temporary shelter as a bounded story reservation rather than spawning permanent player entities, preserving population, workforce, lifecycle, and residence invariants.

| Contract | Decision |
|---|---|
| Owner | `storyEvents.ts` through the existing worker `respondToStoryEvent` command. |
| Cadence | Offer at daily cadence from colony day 10; resolve exactly five days later in the existing daily layer. |
| Failure | Insufficient beds rejects help without removing the event or mutating shelter state. |
| Hidden outcome | No friendship/war hint appears in the choice text; only the delayed resolution reveals it. |
| Validation | 32 focused story tests, TypeScript, build, lint, and diff checks pass. |

### Q3 — relationship, housing, and presentation diagnostics

This completed quality slice expands the existing relationship diagnostics without changing their daily flush ownership. Active marriages, courtships, youth-love pairs, affairs, and pregnancies are counted from authoritative living player humans, while the latest 30 snapshots remain available as bounded read-only history. The new `housingDiagnostics.ts` report reads completed player residences and exposes total/occupied/open beds, housing pressure, Leader House reservation, unassigned humans, orphan references, occupant mismatches, and over-capacity residences. The Village panel presents these findings without repairing or assigning residents. Settings now persists a **Show FPS** preference; an independent `requestAnimationFrame` meter displays FPS in the map corner and never enters `WorldState`, worker commands, saves, or simulation cadence.

| Contract | Decision |
|---|---|
| Authority | Relationship diagnostics read the worker-authoritative state at daily flush; housing diagnostics are pure read-only selectors; FPS is presentation-only. |
| Cadence | Existing daily relationship flush is preserved; housing is computed on UI read; FPS samples browser frames only while enabled. |
| Safety | No residence repair, population mutation, worker command, save schema, or new simulation tick layer was introduced. |
| Validation | 71 test files / 411 tests passed, including focused relationship and housing coverage; TypeScript, build, ESLint, and diff checks passed. |

### Q2 — browser-worker and seeded live scenarios

Automated worker transport proof exists, but each new schedule/rival field needs a player-path check in an actual browser worker session. The checks should cover worker start, schedule command acceptance/rejection, delta reconciliation, temporary festival handling, overnight daily fatigue result, rival contact acceptance/expiry, export/import, and fallback without duplicated payment or schedule state.

A short seeded scenario should demonstrate the intended trade-off: normal work, extended work, fatigue/recovery, a tavern/hotel window, and one rival contact over a known number of days. It is evidence for tuning, not a benchmark that forces a single narrative outcome.

## 8. Suggested implementation order

This is the safest order, not an automatic commitment.

1. Produce the circular-chunk import trace and the 43-cycle ledger. Do not alter `manualChunks` or simulation imports yet.
2. Complete T1 only if the import trace identifies a real renderer/game runtime boundary; otherwise record the measured reason to defer it.
3. Prepare and approve the `groupEvents.ts` decomposition plan. Extract the rival domain only with preserved order and focused parity tests.
4. Write the W1 feature proposal and schedule-state schema. Implement the global ordinary weekday window and its command/UI vertical slice.
5. W2 venue schedules, W3 fatigue/recovery, and W4 schedule feedback are complete; proceed to R1/R2 rival profile and daily-action work.
6. W3 fatigue/recovery and W4 schedule feedback/safeguards are complete; proceed to R1/R2 rival profile and daily-action proposal while preserving the W4 non-goals.
7. R1 rival profiles and R2 daily actions are complete; proceed to R3 player-directed diplomacy only after command, expiry, resource preflight, and stale-action tests are defined.
8. R3 diplomacy and R4 rival presence/history are complete; proceed to Q2 live browser-worker verification and separately scoped T1 chunk-boundary work.
9. Q1 duplicate-export harmonization is complete; E1 and Q3 are complete; complete Q2 live worker/seeding checks and triage any separately confirmed unused files/exports.
10. Review the selected scope before implementation of later objectives.

## 9. Acceptance gate for any selected objective

No objective is complete just because it runs once. The developer may accept a smaller scope, but a selected objective should provide the following evidence before it is called verified.

| Evidence area | Required proof |
|---|---|
| Ownership and cadence | A short change record names one owner, one cadence, allowed state writes, and explicit non-goals. |
| Authority boundary | Worker-authoritative state is mutated only through an existing tick entry point, typed command, or named transition. |
| Focused behaviour | Happy path, invalid command/gate, repeated action, boundary time/day, and relevant Chronicle/feedback results are tested. |
| Save and worker parity | New persistent state is included in save/load defaults, worker preparation, rollback, delta, and command-result reconciliation. |
| Performance | Hot-loop work is bounded; schedule/rival work measures daily cost, and import/chunk work measures startup/render impact. |
| Player readability | Costs, conditions, current schedule/activity, blocked states, and outcomes are visible without relying on diagnostics. |

## 10. Deferred or explicitly excluded work

The following are intentionally outside the first v0.6.2.2 roadmap unless the developer adds them later: a full economy simulation for every rival worker, a global schedule editor for every building/person, night shifts, per-person employment contracts, a new simulation tick layer, a generic event bus, a renderer/engine rewrite, and a bulk attempt to erase all audit warnings.

## 11. Developer decision points

Before implementation, the developer should decide the desired standard-work bounds, whether weekends are configurable in the first slice, how strongly long shifts should trade output against fatigue, whether hotel hours mean front-desk service only or all hotel work, which rival archetypes fit the desired tone, and whether the first rival decision is cooperative, competitive, or hostile.

At any later point, the developer may reduce this to a smaller update. The recommended smallest coherent v0.6.2.2 slice is **T1 + W1 + W3 + R1 + R2**: remove one measured renderer chunk cycle, let the player choose a normal work window with fatigue consequences, and make each rival take one visible daily action. Tavern/hotel independence, full diplomacy, further cycle reduction, and broader cleanup can remain planned without blocking that smaller release.

---

**Planning note:** This roadmap describes candidate v0.6.2.2 work and its technical boundaries. It does not replace the canonical AI instructions.
