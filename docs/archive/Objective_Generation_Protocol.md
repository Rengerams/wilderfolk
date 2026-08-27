# Wilderfolk Objective Generation Protocol

## Purpose

The next coding agent must not follow a permanent, pre-written objective list blindly. It must generate the next objectives from the current repository, test results, bug reports, player evidence, and authority rules.

The objective list is a **living plan**. The agent may create, merge, replace, reorder, pause, or retire objectives when current evidence shows that the existing plan is obsolete or incomplete.

This flexibility does not permit silent scope drift. Every change to the objective plan must be documented.

## Mandatory first-session workflow

At the beginning of a session, the agent must:

1. Read `SIMULATION_AUTHORITY.md` once.
2. Read `BUG_REPORTS/README.md` once.
3. Read the current handoff and completion records.
4. Inspect the repository status, current branch/diff, package scripts, test baseline, and open bug reports.
5. Compare the current code and evidence with the previous objective plan.
6. Generate a new proposed objective set before making behavior changes.

The authority acknowledgment is required once per session only. It must not be repeated after every objective.

## Evidence sources

Objectives must be based on evidence in the following order of priority:

| Priority | Evidence | Use |
|---:|---|---|
| 1 | Failing test, invariant, or reproducible player bug | Immediate correctness objective |
| 2 | Open bug report with reproduction evidence | Debugging objective |
| 3 | Save/load or worker command failure | Reliability objective |
| 4 | Reproducible seeded simulation mismatch | Simulation-truth objective |
| 5 | Performance regression with measured data | Optimization objective |
| 6 | Player-facing friction supported by screenshots or playtest | UX objective |
| 7 | Speculative feature or tuning idea | Defer until correctness is stable |

Do not create an objective solely because a file appears complicated or because a refactor seems elegant.

## Objective format

Every generated objective must contain:

```md
## Objective <temporary ID> — <short title>

- Status: proposed | active | blocked | deferred | verified | replaced | retired
- Evidence:
- Area: Play | Truth | worker | UI | save/migration | performance
- Owner module:
- Cadence:
- Scope:
- Non-goals:
- Dependencies:
- Acceptance criteria:
- Required tests:
- Required bug report:
- Performance measurement:
- Save/migration impact:
```

An objective must be small enough to complete or deliberately block without rewriting the entire simulation. If it cannot be described with clear acceptance criteria, split it or investigate before coding.

## Objective lifecycle

An objective moves through this lifecycle:

```text
proposed → active → verified
                    ↘ blocked/deferred
proposed → replaced
proposed → retired
```

An objective is `verified` only when its acceptance criteria pass, related discovered bugs are resolved or explicitly approved as deferred, tests pass, and the change record is complete.

## When the agent may replace an objective

The agent may replace an existing objective when evidence shows that it is:

- obsolete because the underlying bug is already fixed;
- duplicated by another objective;
- too broad to execute safely;
- based on an incorrect understanding of the current code;
- blocked by a more fundamental owner or state problem;
- lower priority than a newly discovered correctness or player-facing bug;
- unsafe because it would violate the Simulation Authority.

A replacement must not be used to avoid difficult work. The agent must preserve the original objective in the history and record why it was replaced.

## Replacement record

Use this format whenever an objective is replaced, merged, reordered, paused, or retired:

```md
## Objective Plan Change

- Date:
- Previous objective:
- New objective:
- Change type: replaced | merged | reordered | paused | retired
- Evidence requiring the change:
- What the previous objective failed to account for:
- Owner and cadence of the new objective:
- Player-visible impact:
- Tests or measurements required:
- Developer approval required: yes | no
- Developer approval/status:
```

## Approval rules

The agent may make routine priority changes without waiting when they preserve the authority and do not change release scope. It must ask the developer before:

- changing production tick cadence;
- changing save compatibility or migration policy;
- adding a new tick layer;
- changing a public gameplay contract such as Moon Howler rarity or pregnancy duration;
- replacing a release-blocking objective with a feature objective;
- deferring a bug that materially affects current player experience;
- changing the authority document itself.

The agent may continue with a smaller safe investigation while waiting for approval, but it must not implement the disputed behavior change.

## Bug interaction rule

If an objective discovers a bug affecting the same owner, state, cadence, or player-visible behavior, the bug belongs to that objective. The agent must fix it before verification or mark the objective blocked/deferred with the full deferral record from `SIMULATION_AUTHORITY.md`.

A bug is not “out of scope” merely because it was found after the objective started.

## Planning cadence

The agent should generate a plan for the next **three to five objectives**, not a rigid list of twenty. After each verified objective, it must:

1. refresh repository status and test baseline;
2. review new and changed bug reports;
3. re-check the authority ownership and cadence;
4. re-rank the next objectives using evidence;
5. replace or reorder objectives if justified;
6. report the updated plan before starting the next behavior change.

## Required objective report

The agent must not repeat the authority acknowledgment. Each completed or blocked objective should report:

```md
## Objective <ID> report

- Status: verified | blocked | deferred | replaced
- Owner:
- Evidence:
- Changed files:
- Bug report:
- Tests added/changed:
- Focused result:
- TypeScript result:
- Full-suite result:
- Performance/seeded result:
- Invariants checked:
- Remaining risk:
- Next objective decision:
```

## The first generated plan

The first plan after reading this protocol must be evidence-driven. The agent must not assume that a fixed Objective 11–20 list is still correct. It should inspect the current completion record, especially any open blockers, and generate three to five proposed objectives with reasons.

The first proposed objective should normally resolve the highest-severity open correctness blocker, unless repository evidence shows that the blocker is already fixed or belongs to a different owner.

## Non-negotiable boundaries

Objective generation does not override the Simulation Authority. The agent still must:

- preserve worker-owned `WorldState` as authoritative;
- use the existing tick layers;
- maintain one owner per decision;
- write bug reports for discovered bugs;
- add regression tests;
- measure behavior as well as performance;
- stop when a conflict requires developer approval.
