# A rejected Pixi `app.init()` re-created the application and retried WebGL init every frame: 2026-09-17

- Bug: when `app.init()` rejected, the failure path cleared both the state and the in-flight promise, so the next frame built a brand-new Pixi `Application` and re-attempted WebGL initialisation — forever, once per frame, with the error swallowed and no log
- Status: resolved
- Date discovered: 2026-09-17
- Version/build: 0.6.4
- Reporter: found while reading `pixiTerrain.ts` to settle which ground renderer runs (handover §3)
- Area: UI / performance
- Owner module: `src/game/renderer/pixiTerrain.ts`
- Cadence: every frame (render path), once the init has failed

## Status history

- 2026-09-17 — open (identified during the ground-renderer investigation)
- 2026-09-17 — resolved (latched, logged once, and re-armed only on an explicit reset)

## Observed behavior

`ensurePixiReady` is called from `renderPixiTerrain`, which `drawGround` calls every frame. Its failure
path was:

```ts
}).catch(() => {
  terrainState = null;      // next call sees no state …
}).finally(() => {
  initPromise = null;       // … and no in-flight promise
});
```

so the guard `if (terrainState || initPromise) return;` never held after a failure: each frame created
another `Application`, called `app.init()` again, and threw the result away. The `catch` also took no
parameter, so the reason was discarded and nothing reached the console — the run stayed silent, which
is why "0 console errors" proved nothing about which renderer path was live.

## Expected behavior

A permanent WebGL failure degrades to the canvas2D path once, is reported once, and does not allocate or
retry per frame.

## Reproduction steps

1. Force `app.init()` to reject (e.g. make WebGL unavailable).
2. Observe one `new Application()` + `app.init()` attempt per rendered frame, with no console output.

## Evidence

- `renderPixiTerrain` (`pixiTerrain.ts:326-332` before the fix) calls `ensurePixiReady(cw, ch)` on every
  frame and returns `false` while not ready, so `drawGround` (`renderer/terrain.ts:299-305`) falls through
  to canvas2D — the per-frame entry point is real.
- `ensurePixiReady` (`:120-149` before the fix): `if (terrainState || initPromise) return;` guarded by two
  values the failure path nulls.
- Pixi does not construct the WebGL renderer until `init()`, so a rejected `init()` leaves the abandoned
  `Application` unreferenced and never destroyed.

## Root cause

The not-ready guard keyed on the two fields that the failure path cleared, so "failed" and "not started
yet" were indistinguishable and every frame re-entered initialisation. The rejection itself was
swallowed by a parameterless `catch`.

## Regression test

**None, and this branch is currently unexercised.** The failure branch needs a browser whose WebGL init
rejects, which the harness cannot force without patching game code. Worse, since the ground moved to the
canvas2D layer (`USE_PIXI_GROUND = false` in `renderer/terrain.ts`), `ensurePixiReady` is **never called**
in the shipping build, so the latch cannot run at all and no gate covers it.

While Pixi was still the live ground renderer, one probe run observed the success path
(`renderer=pixi`, 12/12 textures, `river` and `shallow` 128×128) and the valley frames painting. That
observation no longer applies to the current build and is **not** evidence that the latch works. What is
verified about this change is only that it compiles, lints and builds cleanly, and that the browser tier
still passes with Pixi dormant. Treat the latch as an unverified code change pending either a re-enable
of the Pixi ground or a forced-init test.

## Invariants checked

Presentation only, and the latch cannot currently change behaviour at all because the path it guards is
not entered (see Regression test). `audit:deps:cycles:strict` stays green; no module edges changed.

## Save/migration impact

None.

## Verification result

`test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 · `npm test` 167 files / 905 tests
passed · `test:browser --seed 12345` verdict pass.

## Related commits or files

- `src/game/renderer/pixiTerrain.ts` — `ensurePixiReady`, `resetPixiTerrain`
- `BUG_REPORTS/2026-09-17-pixi-terrain-container-never-attached-to-the-stage.md`

## Fix

- Added a `pixiUnavailable` latch, set in the `catch` and checked by the not-ready guard, so a rejection
  is attempted once per session.
- The `catch` now takes the error and reports it once:
  `console.warn('[PixiTerrain] WebGL init failed — using the canvas2D terrain path for this session', error)`
  (a warning, not an error, so it does not fail the browser tier's error gate).
- `resetPixiTerrain()` clears the latch, because an explicit reset is a deliberate "try again"
  (world reload / context loss) and is not a per-frame path.

**Known residual:** the single abandoned `Application` on the failure path is not destroyed, so one
WebGL context can be retained per explicit reset. Left as-is because it is bounded and no longer
per-frame; destroying a renderer that never initialised needs assumptions about Pixi's partial-init
state that this fix deliberately avoids.
