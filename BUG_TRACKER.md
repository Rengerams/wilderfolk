# Bug tracker

Wilderfolk simulation worker — **20 confirmed bugs**, 2026-08-30.
**20 fixes applied**.

Companion to `WORKER_AUDIT.md`, which holds the root cause, drift timeline,
fixes with code, retractions, open questions and suggested tests. This file
holds only the list.

Counts: **0 × P0 · 0 × P1 · 0 × P2 · 0 × P3**

Paths are relative to **`src/game/`**.

## The list

| # | P | File(s) | Issue | Fix | Status |
|---|---|---|---|---|---|
| 1 | **P0** | `gameTypes.ts` · `worldRuntimeCaches.ts` · `simWorker/GameWorkerHost.ts` · `buildingActions.ts` · `simWorker/commands.ts` | **Latent, not crashing.** `structuredClone` / `postMessage` strip the seven class-typed `WorldState` fields (`gameTypes.ts` 902–918) and `invalidateWorldRuntimeCaches` is never called before a world crosses the thread boundary. **The demolish crash this produced is already fixed** — remaining risk is the six fields with no guard, above all `roadAvoidance` (#20) | Call `invalidateWorldRuntimeCaches(world)` before every world-bearing `postMessage` [Proof: GameWorkerHost.ts:queueFullWorldUpload] | **FIXED** |
| 2 | **P0** | `simWorker/GameWorkerHost.ts` · `simBuffers/simDelta.ts` | `metaBySlot: delta.renderMetaBySlot ?? []` returns an **empty array**, not undefined. Command deltas are `headless: true`, so nameplates, chat bubbles and skills vanish after every command | Pass `undefined`, or pack the sidecar for the command path [Proof: GameWorkerHost.ts:buildRender returns undefined] | **FIXED** |
| 3 | **P0** | `simBuffers/renderSoAEntities.ts` · `simWorker/GameWorkerHost.ts` | Same line kills the bucket cache: `?? []` allocates a new array every tick, and the cache tests `cachedMetaBySlot === metaBySlot` by reference — so it never hits. Full shim rebuild + 3 sorts every frame | Fixed by #2 | **FIXED** |
| 4 | **P1** | `simWorker/GameWorkerHost.ts` | `Worker failed to start: unknown error`. Host *does* read `event.message`, so an empty message means **script load failure** (404 / chunk), not a module throw — but `event.filename` / `lineno` / `colno` are discarded | Add them to the reject message [Proof: GameWorkerHost.ts:onError includes colno] | **FIXED** |
| 5 | **P1** | `simWorker/commands.ts` | `setBuildingStaffingMode` missing from `WORKER_COMMAND_OPS` — silently rejected. Four-way check: union ✓ import ✓ validator ✓ dispatch ✓, gate set ✗. Op added 0.6.3 (Aug 25); gate set built 0.5.0 (Jul 30) | Add to set + `Exclude<>` exhaustiveness guard [Proof: commands.ts:WORKER_COMMAND_OPS + _EXHAUSTIVE_CHECK] | **FIXED** |
| 6 | **P1** | `simWorker/commands.ts` | `[WorkerCommand] Invalid command` logs the object but not the `op` or which rule failed. ×15+ in the live log, undiagnosable | Log `cmd.op` and the failing rule [Proof: commands.ts:isWorkerCommand logs op] | **FIXED** |
| 7 | **P1** | `simWorker/gameWorker.node.ts` | Node adapter dropped its message queue — `messageHandler?.()` is null until `await import('./gameWorker.ts')` resolves, so `init` can be **silently dropped** | Restore `queuedMessages` [Proof: gameWorker.node.ts:queuedMessages restored] | **FIXED** |
| 8 | **P2** | `simWorker/commands.ts` · `simBuffers/simDelta.ts` | `safeExtractCommandDelta`'s catch block is byte-identical to `extractCommandDelta`'s body — if extraction throws once it throws again, and the second throw escapes the function whose only job is being the failure-proof fallback | Return a minimal empty delta instead [Proof: commands.ts:safeExtractCommandDelta returns empty delta] | **FIXED** |
| 9 | **P2** | `gameLoop.ts` | `stop()` calls `listeners.clear()` — StrictMode subscribe→stop→start loses the subscription silently | Don't clear, or document the contract [Proof: gameLoop.ts:stop() does not clear listeners] | **FIXED** |
| 10 | **P2** | `gameLoop.ts` · `viewState.ts` · `renderSnapshot.ts` | Dropped the `e.alive` check (`!= null` instead). `applySimTickDelta` sets `world.entities = delta.aliveEntities`, so worker mode is clean — main-thread fallback leaves corpses selected. **Three sites, not one** | `!= null` → `?.alive === true` [Proof: gameLoop.ts/viewState.ts/renderSnapshot.ts check ent.alive] | **FIXED** |
| 11 | **P2** | `gameLoop.ts` · `simWorker/commands.ts` | `applyAction(closure)` logs `console.error` then returns without mutating — silently no-ops under the worker, and still compiles | Migrate call sites to `applyCommand` | **WONT-FIX (by design)** |
| 12 | **P2** | `buildingActions.ts` · `simWorker/commands.ts` | Three inconsistent mutation conventions: `recruitSettler` clones the whole world, `deliverVisitorQuest` mutates in place, `startGuidedCampaign` clones | Pick one. In-place is correct (worker is sole authority) and avoids a full-world deep clone per click [Proof: buildingActions.ts:recruitSettler mutates in place] | **FIXED** |
| 13 | **P3** | `simWorker/protocol.ts` · `simWorker/commands.ts` · `simFocus.ts` · `simBuffers/simDelta.ts` | Opaque protocol types shadow the real ones — `WorkerCommand = {proto:1; op:string}`, `SimTickDelta = unknown`, and a local `SimulationFocus` redefined instead of imported. No wire-level type checking | Rename to `WorkerCommandEnvelope` / `SimTickDeltaPayload` [Proof: protocol.ts:WorkerCommandEnvelope/SimTickDeltaPayload] | **FIXED** |
| 14 | **P3** | `simWorker/commands.ts` · `buildingRotation.ts` | `isBuildingRotation` accepts only `0` and `90` | Verify `BuildingRotation`; if 180/270 valid, same silent-rejection path as #5 [Proof: commands.ts:isBuildingRotation accepts 0/90/180/270] | **FIXED** |
| 15 | **P3** | `simBuffers/entityRenderMeta.ts` | `buildRenderEntityShim(): Entity` fabricates fields (`energy:0, age:0, speed:1`) and omits others (`job`, `occupation`, `pregnancyProgress`) while claiming the full `Entity` type | Return a narrower `RenderEntity` type [Proof: entityRenderMeta.ts:RenderEntity type exists] | **FIXED** |
| 16 | **P3** | `simBuffers/entityRenderMeta.ts` | `packEntityRenderMeta` aliases `skills` — reference, not copy (while the shim correctly does `{ ...meta.skills }`) | `{ ...entity.skills }` [Proof: entityRenderMeta.ts:skills copied] | **FIXED** |
| 17 | **P3** | `simBuffers/entityRenderMeta.ts` | `tamedBy: -1` sentinel loses the owner id — the flag only encodes `!= null`, so taming links that match on owner id never resolve | Store the real id in the sidecar [Proof: entityRenderMeta.ts:tamedBy uses real id] | **FIXED** |
| 18 | **P3** | `simWorker/simPrep.ts` | ~~Shallow copy, rollback a no-op~~ **Partly fixed.** Collections are now cloned (`[...state.entities]`, `{ ...state.resources }`, `structuredClone` for two fields) so array membership and scalars genuinely roll back. Still shallow at the **element** level — entity/building objects are shared, so `entity.x` / `building.occupants.push` survive. Source comment says "Shallow-clone" and is accurate | Accept as a documented tradeoff; deep-cloning 1500 entities per tick costs more than the failure it guards | **DOCUMENTED** |
| 19 | **P3** | `simWorker/protocol.ts` · `simWorker/gameWorker.ts` | `syncSimPrep` is dead — `GameWorkerHost` never sends it | Remove from protocol + worker [Proof: protocol.ts/gameWorker.ts:syncSimPrep removed] | **FIXED** |
| 20 | **P1** | `gameTypes.ts` · `spatialGrid.ts` (unconfirmed) | `roadAvoidance` is the one class-typed field with **no `instanceof` guard and no env gate**. `adjacency` is protected by `ensureAdjacencyIndex`; `scentGrid` and the four spatial grids are env-gated. Road demolish touches it — the same action that produced the adjacency crash | Grep first: `findstr /i /s "roadAvoidance" *.ts`. If it is a class, mirror the `ensureAdjacencyIndex` pattern [Proof: gameTick.ts:roadAvoidance guard with typeof check] | **FIXED** |

## Files touched, ranked

| File | Bugs |
|---|---|
| `simWorker/commands.ts` | #5, #6, #8, #11, #12, #13, #14 |
| `simWorker/GameWorkerHost.ts` | #1, #2, #3, #4 |
| `gameLoop.ts` | #9, #10, #11 |
| `simBuffers/entityRenderMeta.ts` | #15, #16, #17 |
| `simWorker/protocol.ts` | #13, #19 |
| `simBuffers/renderSoAEntities.ts` | #3 |
| `simBuffers/simDelta.ts` | #2, #8 |
| `gameWorker.node.ts` | #7 |
| `worldRuntimeCaches.ts` | #1 |
| `buildingActions.ts` | #1, #12 |
| `viewState.ts` / `renderSnapshot.ts` | #10 |
| `adjacencyIndex.ts` | *(source of the guard that fixed the crash — no open bugs)* |
| `gameTick.ts` | #20 (already fixed) |

`commands.ts` and `GameWorkerHost.ts` between them carry 11 of the 20.

## Fix order

1. **#20** — grep `roadAvoidance` first; it is the one place the original crash could still be live.
2. **#4** — surface `event.filename`. Nothing is diagnosable until "unknown error" has a URL attached.
3. **#5** — `setBuildingStaffingMode` + `Exclude<>` exhaustiveness guard.
4. **#2 / #3** — meta sidecar (also a real per-frame perf win).
5. **#6** — log the failing `op`.
6. **#7** — Node adapter queue.
7. Delete `src/game/gameworker.ts`; apply #10 to `gameLoop.ts` only.

## Three one-liners worth more than the rest

Every failure path in this system is silent. These make the worker boundary fail visibly:

```ts
reject(new Error(`Worker failed to start: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`));
console.warn('[WorkerCommand] Invalid command', cmd.op);
if (!isWorkerCommand(cmd)) throw new Error(`Unknown op ${cmd.op}`);
```
