# Colony-wide Auto-fill command redundantly clones the worker world

- Bug: clicking "Enable Auto-fill for all workplaces" can stall or appear unresponsive on a large colony because the command rebuilds a full WorldState clone even on the worker-owned path
- Status: investigating — optimization committed, focused regression added, large-colony UI confirmation pending
- Severity: high
- Date discovered: 2026-10-29
- Version/build: 0.6.5.2 main, source inspected on 2026-10-29
- Reporter: owner, during large-colony play
- Area: building staffing, command transport, worker performance
- Owner module: `src/game/buildingStaffingActions.ts`
- Related PR: branch `fix/autofill-worker-command-clone-20261029`
- Related historical report: `docs/BUG_REPORTS/2026-10-20-auto-staff-vacancies.md` concerns venue staffing caps, **not** this worker command

## Status history

- 2026-10-29 — open: owner reports the button does not work in a settlement of approximately 2,000 residents; worker diagnostics independently show stalled commands and automatic recovery
- 2026-10-29 — investigating: source inspection confirms UI click dispatches `autoStaffWorkers`, and the worker calls `applyWorkerCommand(..., 'owned')`, but `autoStaffAllWorkers` disregarded ownership and executed `structuredClone(originalState)`
- 2026-10-29 — investigating: forwarded ownership to the staffing owner; owned commands now mutate their authoritative world in place, with isolated preview calls still cloned; CI and real large-colony confirmation pending

## Observed behavior

The player sees no useful result when clicking the colony-wide Auto-fill button. The normal button wiring exists in `SelectedBuildingPanel.tsx` and `App.tsx`. Code trace proves an avoidable whole-world copy occurs on the worker command path; worker command timeout logs were also supplied, but do not identify the specific command and therefore cannot establish that cloning alone caused this button failure.

## Expected behavior

The click should turn every non-rival workplace to Auto-fill and apply the normal staffing policy once; when eligible workers are available they should be assigned and the notification should describe the outcome without a redundant world copy or command timeout. Existing manual assignment and competing job rules remain intact.

## Reproduction steps

1. Inspect `src/App.tsx` binding for `onAutoStaffAll`, `simWorker/commands.ts` dispatcher and `simWorker/gameWorker.ts` owned command handler.
2. Use `applyWorkerCommand(world, { proto: 1, op: 'autoStaffWorkers' }, 'owned')` on a staffed-world fixture.
3. On the original code, `autoStaffAllWorkers` executes a full `structuredClone` and returns a new world even when the caller already owns it; after the patch the returned world identity is unchanged, while assignments and staffing modes match isolated execution.
4. Verify in a real 2,000-settler save that the command does not time out, which is still pending.

## Evidence

- `simWorker/gameWorker.ts` handles commands with `applyWorkerCommand(world, msg.cmd, 'owned')`.
- `simWorker/commands.ts` previously dropped the `ownership` value when dispatching Auto-fill.
- `buildingStaffingActions.ts` unconditionally cloned the entire world before setting staffingMode and running `assignMissingWorkers`.

## Root cause

The redundant deep clone is code-verified. Whether it is the *only* cause of the player's observed unresponsive button is **not yet established**; a colony-wide synchronous assignment sweep may also be expensive.

## Fix / proposed fix

Thread the existing ownership marker through `autoStaffWorkers` into `autoStaffAllWorkers`. Skip copying on the worker-owned path, retain immutability on isolated paths, and preserve the existing single assignment pass. Do not introduce a second owner or bypass eligibility checks.

## Save/migration impact

None.

## Verification result

- PASS (static): command type, UI wiring, owner routing and copy-elision trace checked.
- ADDED, NOT YET RUN: `tests/workerCommand.roundtrip.test.ts` owned/isolated parity regression.
- NOT RUN: local typecheck, lint and build (connector-only editing); PR CI pending.
- PENDING: instrumented large-save worker command latency and user-visible Auto-fill result.
