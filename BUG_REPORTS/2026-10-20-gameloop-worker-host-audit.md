# 2026-10-20 — GameLoop / gameWorker / GameWorkerHost audit

## Scope
Static review of `src/game/gameLoop.ts`, `src/game/simWorker/gameWorker.ts`, `src/game/simWorker/GameWorkerHost.ts` and relevant render/delta helpers. All observations require runtime regression verification. Preserve saves, Chronicle and existing simulation semantics.

## Findings
1. **Confirmed: degraded export status cleared after failure** — `GameLoop.exportAuthoritativeWorld()` sets `exportDegraded=true` on failed worker export but falls through to `exportDegraded=false` immediately before returning shadow state. **Fix required:** preserve degraded status and test failures/timeouts.
2. **High: full-world upload lacks a tick barrier / acknowledgement** — `GameWorkerHost.queueFullWorldUpload()` waits for idle but doesn't prevent fresh tick submissions while waiting and resolves when `postMessage` succeeds rather than when worker applies the import. **Fix required:** explicit upload fence and acknowledged `syncWorld`/`importSave` transaction; test tick queueing.
3. **High: worker fallback checkpoint semantics** — in-flight simulation ticks may be lost on worker failure. Treat latest *acknowledged* world as checkpoint; log outstanding tick count, never claim pending ticks committed. Examine command ordering after fallback.
4. **High: worker movement visual rubber-band** — request-side tickAccumulator previously drove interpolation with response-side positions. Mitigated by forcing interpolation fraction 1 for worker in commit de0c2d5; proper response-based presentation clock remains needed.
5. **Medium: render buffer invalidity** — invalid render buffer only logs and returns null render; investigate repeated buffer failures and recovery, including reclaiming pooled buffers.
6. **Medium: snapshot dirty key** — some fields tracked by counts; audit explicit invalidations for same-count state mutation and add tests.
7. **Medium: misleading tick latency** — latest request timestamp is matched to whichever result arrives, not its matching request; use per-request send timestamps or sequence ids.
8. **Performance investigation only:** catalog rebuild, per-tick hydrate, building structuredClone snapshot and JSON delta overhead; measure before optimizing.

## Regression matrix
- Worker error with queued ticks; worker restart; no stale session results.
- Save import mid-flight; no tick from old world applied to new world.
- Command queued around import; enforce execution on intended world.
- Export failure/timeout: degraded result clearly reported.
- Pause, resume, speed changes; no interpolation rewind.
- Malformed render buffer and buffer return.
- v0.6.5.0 migration into v0.6.5.1: leader, residence, history, RNG and timeline preserved.

## Status
Findings logged; follow commit history for individual fixes. Any unimplemented item is **open**, not fixed. Static audit alone is not a passing test.
