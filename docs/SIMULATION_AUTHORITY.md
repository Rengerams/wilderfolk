# WILDERFOLK SIMULATION AUTHORITY

**Status:** Mandatory project authority  
**Applies to:** Wilderfolk 0.6.x and all later versions  
**Audience:** The solo developer, human contributors, coding assistants, reviewers, and anyone modifying simulation-related code  
**Read before editing:** Any file under `src/game/`, `src/components/` that sends simulation commands, worker code, simulation tests, benchmarks, or save/migration code  
**Authority level:** This document overrides local assumptions, previous temporary experiments, and undocumented optimization decisions

\---

## 1\. Mandatory rule

No person or coding assistant may modify simulation behavior before reading this document.

Before making a change, the contributor must understand which system owns the decision, which cadence it uses, which state fields it may write, and which tests prove that the behavior remains valid. “The code compiled” is not sufficient evidence that a simulation change is safe.

**Mandatory bug-report rule:** Every discovered bug must receive a written bug report before, or at the same time as, the code fix. A bug report is required even when the fix appears obvious. The report must describe the observed behavior, expected behavior, reproduction steps, affected owner/cadence, root cause, fix, regression test, and save/migration impact. Do not silently patch a symptom and move on.

Every change must preserve both:

1. **Play:** the game remains responsive and understandable to play.
2. **Truth:** the simulation remains internally consistent, fair, readable, and faithful to its declared rules.

A performance improvement that makes the game faster but removes pregnancy, social life, manual staffing, rare events, or reliable commands is a **behavior regression**, not a successful optimization.

\---

## 2\. Single source of truth

When the simulation worker is active, the worker-owned `WorldState` is authoritative. The main thread owns presentation state only: camera, selection, tabs, inspector state, render caches, and preferences.

The main thread must never directly mutate simulation entities, buildings, resources, relationships, pregnancies, events, or worker assignments while the worker is active. It must send a typed command and wait for the authoritative worker result.

Simulation state may change only through one of these boundaries:

```text
gameTick()
applyWorkerCommand()
a named simulation transition called by one of those entry points
```

No UI component, render helper, diagnostics helper, or performance shortcut may create a second mutation path.

**Optimistic command feedback (2026-08-20 amendment):** while the worker is
active, the main thread MAY apply a player command to its display copy through
the SAME domain implementation (`applyWorkerCommand`) for instant UI feedback,
provided the worker's authoritative `commandResult` (a full-snapshot delta)
replaces it on success and reverts to the authoritative world on failure. The
optimistic state is temporary presentation — it is never written back to the
worker, never sent in a delta, and never treated as authoritative. Ticks that
arrive while a command is pending do not overwrite the optimistic display;
the authoritative result always wins.

\---

## 3\. Ownership law

Every important gameplay decision has exactly one owner. Other modules may read the result but may not recreate or overwrite the decision.

|Decision|Authoritative owner|Cadence|Allowed writes|
|-|-|-:|-|
|Movement and pathfinding|`tickLayerRealtime.ts` and its movement helpers|Realtime|Position, velocity, movement targets|
|Workforce and assignments|`workforce.ts` through named assignment transitions|Command/assignment phase|Building occupants, `homeBuildingId`, occupation, job|
|Housing and residence assignment|`dayCycle.ts` residence functions (`assignMissingResidences`, `syncResidenceOccupants`, `syncPartnerResidence`, death cleanup) scheduled from `tickLayerAssign.ts`; immediate player entry `buildingActions.assignResidentToBuilding`|Assignment (`tickLayerAssign`, ~4×/day) + immediate on place/recruit/death/divorce/arrest|`residenceBuildingId`, residence `occupants`, household membership (couple + minor children)|
|Construction|Construction functions called from the construction layer|Work cadence|Construction progress, builder membership|
|Economy and production|`tickLayerSystems.ts` and daily economy owners|System/daily|Resources, production counters, spoilage|
|Village Requests|`groupEvents.ts` only; command entry delegates from `commands.ts`|New-calendar-day generation/expiry + player-command resolution|One `activeVillageRequest`, request cooldown/history, documented resource/reputation effects, source-event counters, ordinary event/feedback fields|
|Blueberry foraging|`blueberryForaging.ts`; called from the existing human tick and daily layer|Staggered realtime target/movement/pick + new-calendar-day regrowth|Blueberry-tree yield/regrowth date, temporary human target/movement, existing food/energy/feedback fields|
|Casual social feedback|A single social-feel owner extracted from `humanTick.ts`|Staggered social|Dialogue, heart feedback, small social progress|
|Youth love (ages 14–17)|`humanRelationships.ts`|New-calendar-day|Mutual youth-love links, youth progress, natural breakups, and handoff into adult courtship|
|Courtship and marriage|`humanRelationships.ts`|Social/daily|Courtship progress, relationship status, partner IDs|
|Affairs and scandals|`humanRelationships.ts`|Staggered (tryst progress/feedback only) + new-calendar-day (establishment, gossip, scandal decisions)|Affair progress, affair partners, scandal outcomes|
|New conception|`humanRelationships.ts` only|Once per colony day|Pregnancy state and due progress; age-14–17 youth conception only through the documented low-probability mutual-youth-love gate|
|Pregnancy progress and birth|`humanLifecycle.ts` only|Pregnancy cadence|Pregnancy progress, child creation, birth event|
|Moon Howler lifecycle|`moonHowler.ts` only|Full-moon event|Curse, transformation, return, cure, replacement event|
|Leader residency|`leaderHouse.ts` called by the daily layer|Daily/idempotent|Leader household residence; preserve valid work assignment|
|Player commands|`commands.ts` plus domain owner|On command|Validated requested state transition|
|Diagnostics|`relationshipDiagnostics.ts` and future simulation diagnostics|Flush cadence|Counters and snapshots only; never gameplay state|

If a change appears to require two owners, stop and resolve the ownership conflict before coding.

\---

## 4\. Tick-layer authority and cadence law

The existing tick-layer structure is the simulation schedule. Reuse it; do not create a new tick layer for convenience.

|Existing layer|Sole responsibility|Must not become|
|-|-|-|
|`tickLayerRealtime.ts`|Movement, pathfinding, animation, realtime spatial behavior|A second daily relationship or economy layer|
|`tickLayerSystems.ts`|Systems that run on the normal simulation cadence: needs, production, ecology, combat, and other bounded system work|A replacement for daily rules or UI commands|
|`tickLayerDaily.ts`|Once-per-calendar-day economy, lifecycle triggers, relationship daily decisions, leadership/residency reconciliation, and daily maintenance|A place for realtime movement or repeated full-population scans|
|`tickLayerAssign.ts`|Assignment/reassignment reconciliation using the workforce owner|A second workforce rules engine|
|`gameTick.ts`|Fixed orchestration and ordering of the existing layers|A place for gameplay rules that belong to a domain owner|

The layer outline above is fixed for the current architecture. **Do not create `tickLayerSocial.ts`, `tickLayerPregnancy.ts`, `tickLayerMoonHowler.ts`, `tickLayerBuildings.ts`, or any other new tick layer** merely to avoid deciding where code belongs. Put the logic in the existing layer that owns its cadence and delegate the actual rule to the named domain owner.

A new tick layer is allowed only when all of the following are true:

1. The existing layers cannot express the required cadence or ordering.
2. The proposal identifies the state and decisions that would move.
3. The proposal includes a measured performance or correctness reason.
4. The Simulation Authority Document is updated first.
5. The new layer has owner, cadence, invariants, diagnostics, and tests.

Every decision must have one declared cadence. Performance work may reduce the amount of work inside a cadence, but it may not silently move a decision to another cadence.

|Cadence|May do|Must not do|
|-|-|-|
|`realtime`|Movement, animation, cached target following, staggered blueberry target/pick behavior|Pregnancy rolls, global affair searches, scandals|
|`staggered-social`|Nearby dialogue, flirt feedback, heart lines, small progress|Births, scandal decisions, global scans|
|`new-calendar-day`|Conception, affair establishment, gossip, youth-love decisions, daily economy, bounded Village Request generation/expiry|Repeated full-population social work|
|`pregnancy-progress`|Advance existing pregnancy and create a birth|Start a second pregnancy path|
|`full-moon-event`|Return an existing Howler; roll a rare replacement event|Guarantee a new Howler every full moon|
|`player-command`|Assignment, demolition, repair, upgrade, recipes, modes|Wait for a worker pipeline to become permanently idle|

Production cadence is **72 simulation ticks per in-game day**. A temporary benchmark cadence must never be committed as production behavior without an explicit decision and updated tests.

Affair tryst **progress** and heart/chat feedback may advance in the `staggered-social` cadence (cheap, nearby, no full-population scan) and may begin before establishment. Affair **establishment** (`affairPartnerId`), gossip, and scandal **decisions** belong to the `new-calendar-day` owner; a realtime path may only expose a scandal for an **already established** pair, and only as a spatial caught-in-the-act event (spouse/guard physically present). Scandal rolls for unestablished flirtation are forbidden.

\---

## 5\. State invariants: always true

These are hard invariants. They are not suggestions or tuning targets.

### Workforce invariants

* A living human may appear in at most one building’s `occupants` list.
* A building occupant must have `homeBuildingId` equal to that building’s ID.
* A human with `homeBuildingId` must appear in that building’s occupants.
* Manual buildings are never filled by generic auto-staffing.
* The Church has capacity for four but requires only the player-selected priest for its normal staffed state.
* The leader participates in normal workforce assignment like any other settler while retaining leader status and manor residency: office-taking preserves a valid workplace, auto-staff may assign an idle leader, and save-load keeps the assignment. During special events (election ceremony) the movement layer already gathers settlers; no job-level gate is required. (2026-08-20 decision — see BUG_REPORTS/2026-08-20-leader-cannot-hold-workplace.md)
* Demolishing a building removes it from authoritative state, cleans its assignments, and clears stale selection.

### Youth-love invariants

* A youth-love link is mutual, joins two living colony settlers, and is owned only by `humanRelationships.ts`.
* Youth love begins only from age 14 through 17; it has no automatic housing, workforce, or marriage side effect. A low-probability age-14–17 conception is allowed only through the sole daily conception owner, with a valid mutual youth-love partner, and does not create a second relationship or birth path.
* Attendance history and mutual schoolyard bonds may affect youth-love odds, but school attendance remains owned by `education.ts`.
* A youth pair may transfer to adult courtship only when both settlers are at least 18 and still otherwise eligible; the existing adult courtship path alone may create a marriage.
* A stale, dead, invalid, or one-sided youth-love link is cleared by the youth-love owner at its daily reconciliation.

### Village Request invariants

* At most one `activeVillageRequest` exists at a time; the request owner is `groupEvents.ts`.
* A request has a unique id, a valid source event/entity where required, a bounded expiry day, and one declared choice set.
* Only the request owner may generate, expire, or resolve a request; UI code only sends a typed command.
* A stale, unknown, unaffordable, storage-blocked, or repeated command leaves the request and all economic state valid without partial mutation.
* Active request state is included in worker preparation, rollback, delta reconciliation, and save/load paths before any card is shown.

### Blueberry-foraging invariants

* A blueberry source is a normal living `EntityType.Tree` with `forageKind: 'blueberry'`; it remains in the existing tree spatial grid and has no separate entity type or grid.
* New maps contain at most three blueberry trees. Only `worldGen.ts` creates them; no daily, realtime, or render path spawns another tree.
* `blueberryYield` stays in the inclusive range 0–6. The foraging owner alone may decrement it on a successful pick or restore one portion at its declared daily regrowth time outside winter.
* A player settler may forage only while free, hungry, not freshly fed, and not festival-gathering. Work, school, sleep, meals, hunting urgency, and the normal movement owner retain priority.
* A target search uses the existing `treeGrid` and staggered cadence; no human may scan all trees every tick. An invalid, dead, depleted, or out-of-range target is cleared without changing resources.
* The renderer may choose ripe/depleted blueberry art but may never mutate yield, regrowth, food, energy, movement, or storage.

### Pregnancy invariants

* A pregnant human has a valid `pregnancyDueProgress`.
* A non-pregnant human has no active pregnancy parent/progress state.
* New pregnancy is created only by the conception owner. At ages 14–17 it requires the documented mutual youth-love, nearby, energy, and reduced-probability gate; adult married and affair rates remain unchanged.
* Birth is created only by the lifecycle owner.
* A conception counter never means “active pregnancies.” Diagnostics must distinguish new conceptions, active pregnancies, and completed births.

### Moon Howler invariants

* There is at most one living cursed Moon Howler.
* If a cursed Howler survives, that same Howler returns on later full moons.
* If the Howler is killed or cured, later full moons may be quiet.
* A replacement Howler appears only through a rare replacement roll.
* A full moon must not guarantee a new Howler.

### Worker authority invariants

* A command result cannot be overwritten by an older tick delta.
* Commands are dispatched without waiting for an impossible permanently idle worker.
* Full-world import/export may wait for idle; ordinary player commands may not.
* Main-thread fallback must use the same domain command implementation as the worker.
* An optimistic command display is temporary: it is replaced by the
  authoritative `commandResult` on success and reverted to the authoritative
  world on failure; it is never written back to the worker.

\---

## 6\. Forbidden changes

The following are prohibited unless this document is updated and the change is explicitly approved.

|Forbidden change|Reason|
|-|-|
|Adding a second conception implementation|Creates pregnancies that diagnostics and lifecycle cannot explain|
|Writing `building.occupants` from a UI component|Bypasses assignment validation and worker authority|
|Adding Church to generic auto-staffing|Violates manual priest selection|
|Adding Moon Howler spawning to a daily layer|Breaks rare-event lifecycle and one-Howler limit|
|Moving a daily rule into realtime code for performance|Changes probability and player-visible pacing|
|Changing tick cadence without a migration/test decision|Breaks calendar, pregnancy, and event timing|
|Renaming or reinterpreting a diagnostic counter without updating consumers|Creates false conclusions from live logs|
|Optimizing by removing a gate without a behavior test|Can restore speed while silently changing game rules|
|Introducing a broad new manager/event bus before proving need|Adds architecture without solving ownership|

\---

## 7\. Mandatory bug report

Every bug must be recorded in a Markdown file under:

```text
BUG\_REPORTS/
```

Use one file per bug, for example:

```text
BUG\_REPORTS/2026-08-18-church-auto-staffing.md
```

The minimum format is:

```md
# Bug: <short name>

- Status: open | investigating | fixed | verified | won't-fix
- Date discovered:
- Version/build:
- Reporter:
- Area: Play | Truth | worker | UI | save/migration | performance
- Owner module:
- Cadence:

## Observed behavior

## Expected behavior

## Reproduction steps

1.
2.
3.

## Evidence

Console output, screenshot, save identifier, diagnostic output, or test fixture.

## Root cause

## Fix

## Regression test

## Invariants checked

## Save/migration impact

## Verification result

## Related commits or files
```

The bug report must remain in the repository after the fix. It is the historical explanation for why the code has its current guard or test. Do not delete it because the issue is fixed.

## 8\. Required change record

Every simulation change must include this short record in the pull request, commit message, or change note:

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

A change that cannot fill in this record is not sufficiently understood to merge.

\---

## 9\. Mandatory pre-merge checklist

### Before editing

* \[ ] This document was read.
* \[ ] The owner row for the decision was identified.
* \[ ] The cadence was identified.
* \[ ] Existing tests and diagnostics for the decision were read.
* \[ ] The proposed change is not duplicating another owner.

### During editing

* \[ ] All simulation writes remain behind the authoritative boundary.
* \[ ] No UI component directly mutates simulation state.
* \[ ] No new full-population scan was added to a realtime path.
* \[ ] New spatial queries use the spatial grid or document why they do not.
* \[ ] Existing command and worker ordering semantics are preserved.
* \[ ] Diagnostics report the actual stage being measured.

### Before merge

* \[ ] TypeScript passes.
* \[ ] Focused tests pass.
* \[ ] Full regression tests pass.
* \[ ] Workforce invariants pass.
* \[ ] Pregnancy/birth invariants pass.
* \[ ] Moon Howler invariants pass.
* \[ ] Worker command round-trip tests pass.
* \[ ] Benchmark p50/p95 is recorded at the agreed population tiers.
* \[ ] Gameplay event rates are recorded for the affected system.
* \[ ] Save/load behavior is tested if state fields changed.
* \[ ] The Simulation Change Record is complete.

### After merge

* \[ ] The live console has no new worker-stall, duplicate-key, or invariant warnings.
* \[ ] A short seeded playtest confirms the intended player-visible behavior.
* \[ ] If behavior differs from the previous version, the changelog says so explicitly.

\---

## 10\. Minimal invariant implementation

Add:

```text
src/game/simulation/simulationInvariants.ts
tests/simulation.invariants.test.ts
```

The first implementation should collect errors so tests can inspect them and development mode can throw clearly:

```ts
export function collectSimulationInvariantErrors(state: WorldState): string\[] {
  const errors: string\[] = \[];
  const assignedTo = new Map<number, number>();

  for (const building of state.buildings) {
    for (const humanId of building.occupants) {
      if (assignedTo.has(humanId)) {
        errors.push(`human ${humanId} assigned to multiple buildings`);
      }
      assignedTo.set(humanId, building.id);
    }
  }

  for (const human of state.entities) {
    if (!human.alive || human.type !== EntityType.Human) continue;
    if (assignedTo.get(human.id) !== human.homeBuildingId) {
      errors.push(`human ${human.id} workplace mismatch`);
    }
    if (human.pregnant \&\& human.pregnancyDueProgress == null) {
      errors.push(`human ${human.id} pregnant without due progress`);
    }
  }

  const howlers = state.entities.filter(
    (entity) => entity.alive \&\& entity.moonHowlerCursed,
  );
  if (howlers.length > 1) {
    errors.push(`multiple living Moon Howlers: ${howlers.length}`);
  }

  return errors;
}
```

Do not put gameplay repairs into the invariant checker. It detects and reports; the owning transition performs the repair.

\---

## 11\. Refactor order from the current codebase

The refactor must stop at a green state after each step.

### Step 1 — Governance, no behavior change

Add this document, the change-record template, the owner registry, and invariant tests. Do not change probabilities or cadence.

### Step 2 — Workforce authority

Keep `workforce.ts` as the owner. Route manual assignment, reassignment, demolition cleanup, and leader work through named workforce transitions. Add Church and duplicate-assignment tests.

### Step 3 — Pregnancy authority

Keep `humanRelationships.ts` as the only conception owner. Keep `humanLifecycle.ts` as the only birth owner. Add `activePregnancies` and `birthsCompletedThisInterval` diagnostics.

### Step 4 — Moon Howler authority

Keep all spawn, return, cure, and replacement decisions in `moonHowler.ts`. Inject RNG so quiet full moons and rare replacement events are testable.

### Step 5 — Relationship authority

Extract cheap social feedback from `humanTick.ts` into one social-feel owner. Keep daily conception, affair establishment, and scandal decisions in `humanRelationships.ts`.

### Step 6 — Worker command authority

Keep `GameWorkerHost` responsible only for transport, ordering, and deltas. Keep command meaning in `commands.ts` and domain owners. Test assignment, priest selection, demolition, and upgrades end-to-end.

### Step 7 — Performance authority

A performance change must report both timing and behavior:

```text
p50/p95 tick time
social events/day
conception candidates/day
pregnancies/30 days
births/30 days
scandals/30 days
Moon Howler events/year
```

Faster is not accepted if the declared behavior budget is broken.

\---

## 12\. Required acknowledgment

Before modifying simulation code, the contributor must add this statement to the change record:

```text
I have read SIMULATION\_AUTHORITY.md. I identified the owner and cadence of the decision I am changing, preserved the authoritative worker-state boundary, and will not introduce a second mutation path.
```

For a coding assistant, the task prompt should explicitly include:

```text
Read SIMULATION\_AUTHORITY.md before inspecting or editing simulation code.
Do not modify simulation code until the owner, cadence, invariants, and required tests are identified. Eacknowglegde at start is fine dont need to say it again in same sessions.
```

\---

## 13\. Definition of authority

This document is the project’s simulation contract. Code may evolve, file names may change, and implementation details may be optimized, but the following may not change silently:

* who owns a decision;
* when the decision is made;
* which state is authoritative;
* which invariants must hold;
* what the player is guaranteed to observe.

If the design must change, update this document first, then update the owner registry, tests, diagnostics, and implementation together.



**14. Changes**



* All changes should be record in /changelog.md to keep clear path what changed, note version , waht changed where why etc. Update this file and Readme at the end of a sessions.
* 

