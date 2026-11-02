# Deferred worker tick leaves the UI entity catalog stale

- Bug: A lightweight worker command can acknowledge a new entity snapshot while the UI catalog still contains the entities from before a deferred tick.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-01
- Version/build: PR #118 at 3ac1fda02b9975f22a0efb4e92c3442144efc84e
- Reporter: Codex review on PR #118, discussion_r4436236615
- Area: Worker command/tick reconciliation and UI catalog
- Owner module: src/game/gameLoop.ts
- Related PR/commit: https://github.com/Rengerams/wilderfolk/pull/118

## Status history
- 2026-11-01 — open: Review identified the missing catalog reconciliation after deferred tick results.
- 2026-11-01 — investigating: Fix and regression tests committed to PR #118; execution and CI verification pending.

## Observed behavior
A schedule or workforce-policy command may be queued while a simulation tick is in flight. The tick result updates the worker host's authoritative world, but GameLoop intentionally retains its optimistic display and skips catalog rebuilding while commands are pending. Before this fix, the lightweight command acknowledgement also skipped the catalog rebuild. Consumers of the entity catalog could then show pre-tick settlers; stale selections were not pruned, potentially indefinitely when paused.

## Expected behavior
Once the command is acknowledged, the catalog must describe the displayed entity snapshot, and missing selections must be removed. Lightweight commands with no intervening tick must retain the cheap no-rebuild path.

## Reproduction steps
1. Start with one selected living settler and a worker-authoritative GameLoop.
2. Queue a `setWorkSchedule` command, keeping its acknowledgement pending.
3. Deliver a tick result that replaces the entities (for example, removes settler 1 and adds settler 2).
4. Acknowledge the lightweight command and inspect the catalog and selection. Before the fix, the catalog still listed settler 1 and selection pruning was skipped.

## Evidence
Code trace: `GameWorkerHost` applies `applySimTickDelta`, which replaces `world.entities` with `delta.aliveEntities`. The tick handler skips `EntityCatalog.rebuild` when `optimisticCommands` is nonempty; the former command-result handler skipped it for all lightweight operations. The two cases are now represented by tests in `tests/gameLoop.test.ts` (authored, not run here).

## Root cause
The command acknowledgement gated catalog reconciliation on the completed command's operation, not on whether a preceding deferred tick changed the authoritative entity snapshot.

## Fix / proposed fix
The `GameLoop` owner marks the catalog dirty whenever a tick arrives while optimistic commands are pending, then rebuilds and prunes selection on the next command acknowledgement. The marker clears after an authoritative catalog rebuild, session replacement, and worker fallback. Lightweight commands without a deferred tick still skip the rebuild.

## Save/migration impact
None: transient `GameLoop` state only; no protocol or persisted world changes.

## Verification result
- PASS (source trace): tick, command and catalog paths inspected.
- NOT RUN: focused Vitest cases (local repository/runtime unavailable through the connected GitHub interface).
- NOT RUN: TypeScript, lint, build, broad CI and live large-colony performance replay.
