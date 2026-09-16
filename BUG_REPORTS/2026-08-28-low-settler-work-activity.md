# Bug: Settlers appear to work rarely despite available work time

- Status: resolved
- Date discovered: 2026-08-28
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer gameplay observation
- Area: Play | Truth
- Owner module: workforce assignment, realtime human behavior, and work schedule owners
- Cadence: Assignment and realtime behavior within declared work hours

## Status history

- 2026-08-28 — investigating: developer observed that settlers barely perform visible productive work during ordinary gameplay.
- 2026-09-09 — resolved (code-verified; deterministic runtime repro still pending): assigned settlers commute to reachable completed workplaces within configured work hours; previously-empty manual-staff buildings are now staffable (see manual-building-staffing fix, `312ccef`); per-settler Working/Commuting status with blocking reasons is shown in the inspector.

## Observed behavior

Settlers appear frequently idle or engaged in non-work movement while work buildings exist or work time is active. The player cannot easily tell whether this is scheduling, assignment, pathing, needs, a building gate, or an actual work-behavior defect.

## Expected behavior

During configured work hours, able workers with valid assignments and reachable completed work buildings should visibly travel to and perform their assigned work unless a declared higher-priority need or state prevents it. The Village view should make idle/blocking conditions understandable.

## Reproduction steps

1. Create completed workplaces and assign eligible settlers.
2. Advance into ordinary configured work hours.
3. Observe worker movement and production while excluding sleep, meals, emergency needs, and construction/placement mode.
4. Inspect whether workers are assigned, scheduled, reachable, and actually producing.

## Evidence

Developer gameplay observation on 2026-08-28. Detailed runtime conditions pending deterministic reproduction.

## Root cause

Pending investigation of assignment, work-window eligibility, human priority order, building readiness, pathing, and production transitions.

## Fix

Pending investigation. Any correction must preserve workforce single-source-of-truth, declared cadence, typed commands, and existing need-priority rules.

## Regression test

Pending: deterministic assigned-worker test covering active work hours, reachability, production evidence, and a valid blocking condition.

## Invariants checked

A living worker appears in at most one workplace occupancy list; worker `homeBuildingId` matches building occupancy; manual buildings are not generic-auto-staffed; no UI mutation path bypasses workforce ownership.

## Save/migration impact

Pending investigation; expected none for a behavior-priority or rendering-observability correction.

## Verification result

Pending.

## Related files

- `src/game/workforce.ts`
- `src/game/humanTick.ts`
- `src/game/humanSchedule.ts`
- `src/game/tickLayerAssign.ts`
- `src/game/tickLayerRealtime.ts`
