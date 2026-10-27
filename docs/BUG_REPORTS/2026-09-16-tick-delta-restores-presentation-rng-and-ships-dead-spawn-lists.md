# The tick delta restores presentation RNG and ships dead spawn/death lists: 2026-09-16

- Bug: `applySimTickDelta` rewinds (or deletes) main-thread presentation RNG streams, and the delta carries `diedIds` / `newEntities` that nobody reads
- Status: resolved
- Date discovered: 2026-09-16
- Version/build: 0.6.4
- Reporter: worker-boundary audit (`docs/private/audits/2026-09-16/game-worker.md`, findings F4 and F6)
- Area: worker
- Owner module: `simRng.ts` (stream namespaces), `simBuffers/simDelta.ts` (delta field set), `entityCatalog.ts` (dead consumer)
- Cadence: per tick (~3×/s) and per command

## Status history

- 2026-09-16 — open (found by the worker-boundary audit while tracing the six RNG hand-offs and the delta field set; both confirmed by
  `tmp/audit-2026-09-16/repro-restore-asymmetries.mts` and a `grep applyTickDelta`)
- 2026-09-16 — resolved (presentation streams moved to their own registry that snapshots never touch; the dead delta fields, the pre-tick
  alive-id set they were computed from, and their only consumer are deleted)

## Observed behavior

**F4.** Every applied tick delta ends with

```ts
// src/game/simBuffers/simDelta.ts
if (delta.simRng) {
  world.simRng = delta.simRng;
  restoreSimRng(delta.simRng);
}
```

and `restoreSimRng` treated the registry as a closed world: an owner the snapshot did not list was
**deleted**, an owner it did list was **rewound** to the snapshot's position. That snapshot belongs to
the simulation **worker**, which never draws the main-thread presentation streams
(`renderer.ts` → `rendererShake`, `renderer/weather.ts` → `weatherFx`, `audio/sfx.ts` → `sfx`,
`audio/ambient.ts` → `ambientAudio`, `IntroScreen.tsx` → `introScreen`). Their position was therefore
whatever it was at the last world upload: a stream created before the upload replayed the same values
every tick, and a stream created after it was deleted so the seed's first draw returned.

**F6.** `SimTickDelta` declared `diedIds: number[]` and `newEntities: Entity[]`. The extractor computed
them from a pre-tick alive-id set, cloned `newEntities` per tick and shipped both — while
`applySimTickDelta` never read either. The only consumer in the repository,
`EntityCatalog.applyTickDelta`, had **zero call sites** (`src`, `tests`, `scripts`): the catalog is
rebuilt from the authoritative world (`GameLoop` calls `catalog.rebuild(world.entities)`), not patched
per tick. The delta already ships `aliveEntities` as a complete replacement.

## Expected behavior

- Presentation randomness is not part of the simulation's determinism contract, so a worker snapshot
  must neither rewind nor delete it. Simulation streams must keep being rewound, or a resumed world
  drifts.
- The wire carries what a reader consumes. `aliveEntities` is the spawn/death truth for the display
  world; a second, unused representation of the same tick invites a future reader to trust it.

## Reproduction steps

1. `npx tsx tmp/audit-2026-09-16/repro-restore-asymmetries.mts` — part B draws `rendererShake`, freezes
   a snapshot, and draws again after `restoreSimRng`.
   - Before the fix: `first rendererShake draw 0.221873` → `draw after the delta restore 0.221873`
     (the same value; with the owner omitted the stream was deleted and the seed's first draw returned).
   - After the fix: `first rendererShake draw 0.221873` → `draw after the delta restore 0.550286`, the
     snapshot no longer lists the owner, a simulation stream is still rewound, and
     `applySimTickDelta` leaves the presentation stream alone.
2. `grep -rn "applyTickDelta" src tests scripts` — before the fix it returned only the definition.

## Evidence

- `src/game/simBuffers/simDelta.ts` (apply path, extract path), `src/game/simRng.ts:149-176`
  (`restoreSimRng`'s delete/rewind loop), `src/game/entityCatalog.ts` (`applyTickDelta`, zero callers).
- `tmp/audit-2026-09-16/repro-restore-asymmetries.mts` — the before/after run quoted above.
- The delta field set is also printed by `tsx scripts/worker-boundary-audit.mts` (`1. world key census`).

## Root cause

**F4 — one registry for two lifetimes.** `simRng.ts` had a single `streams` map for both simulation
and presentation owners, and `restoreSimRng` implemented "the snapshot is the complete registry" by
deleting anything it did not list. That is the right rule for a save round-trip in one realm, and the
wrong rule for a snapshot that crosses a process boundary the presentation streams never cross.

**F6 — a transport field whose consumer was designed away.** The delta's spawn/death lists date from a
catalog that was patched per tick; when the catalog moved to `rebuild(world.entities)`, the extractor
side was never retired, so two extra arrays were built, cloned and transferred on every tick forever.

## Regression test

- `tests/simRng.presentationStreams.test.ts` (3) — presentation owners are absent from
  `snapshotSimRng()`; a restore neither rewinds a live presentation stream (checked in lockstep against
  an uninterrupted stream with the same seed and owner) nor deletes one created after the snapshot,
  while a simulation stream in the same snapshot is still rewound; and the five presentation modules
  call `getPresentationRng`, never `getSimRng`.
- `tests/simRng.snapshot.test.ts` (8) — the save/worker/prep/delta transports still carry simulation
  stream positions (six of the eight fail with `restoreSimRng` disabled), which is the boundary this
  fix had to preserve.
- `tests/workerBoundary.closure.test.ts`, `tests/simDelta.storyRoundtrip.test.ts`,
  `tests/low-1-worker-persistence.test.ts` — delta round-trips updated to the narrower extractor.

## Invariants checked

- `npm run test:full-year` (360 days / 25 920 ticks, seed 12345) — exit 0 with **identical** totals to
  the run before the change (settlers 69, births 27, marriages 48, divorces 33, scandal events 183):
  neither fix touches a simulation roll.
- `npm test` — 164 files / 886 tests passed. `npm run build`, `npm run test:types`, `npm run lint`
  (0/0) — all green.
- `npm run test:browser` — verdict pass, 0 console errors / 0 page errors / 0 failed requests (the
  presentation streams are client-side, so the browser tier is the right place to prove the client
  still boots and renders).

## Save/migration impact

None. Saves carry `world.simRng`; the snapshot for a save is taken in the realm that owns the
simulation, which never created a presentation stream, so the serialized owner list is unchanged. The
delta is wire-only and its removed fields were never read.

## Verification result

- `npx tsx tmp/audit-2026-09-16/repro-restore-asymmetries.mts` — part B now prints
  `FIXED: the presentation stream kept its position across the restore`, `sim stream rewound by
  restore: yes (correct)` and `applySimTickDelta leaves it alone: yes (stream continues)`.
- `npx vitest run tests/simRng.presentationStreams.test.ts` — 3 passed.
- `npm run test:types` — exit 0; `npm run lint` — 0 warnings / 0 errors; `npm run build` — passed.
- `npm test` — 164 files / 886 tests passed; `npm run test:full-year` — exit 0, totals unchanged;
  `npm run test:browser` — pass.
- `grep -rn "applyTickDelta\|aliveIdSet" src tests scripts` — no matches.

## Related commits or files

- `src/game/simRng.ts` — `presentationStreams` registry, `getPresentationRng`, snapshot/restore docs
- `src/game/simBuffers/simDelta.ts` — delta field set and `extractSimTickDelta` signature
- `src/game/entityCatalog.ts`, `src/game/simWorker/commands.ts`, `src/game/simWorker/gameWorker.ts`
- `docs/private/audits/2026-09-16/game-worker.md` — findings F4 and F6
- `BUG_REPORTS/2026-09-16-worker-protocol-and-guard-drift.md` — the sibling F7/F8 batch

## Fix

**F4 — two namespaces in `simRng.ts`.** Presentation owners moved to their own `presentationStreams`
map reached through a new `getPresentationRng(owner)`; `snapshotSimRng`/`restoreSimRng` only ever read
and write the simulation map, so no worker snapshot can delete or rewind a presentation stream.
`setSimSeed` and `resetSimRng` clear both maps, so a new world starts every stream fresh, and
`getSimRng`'s doc now states the namespace boundary. The five consumers were repointed
(`renderer.ts`, `renderer/weather.ts`, `audio/sfx.ts`, `audio/ambient.ts`, `IntroScreen.tsx`), and
`tests/simRng.presentationStreams.test.ts` fails if a future change moves one back.

**F6 — the delta advertises only what is read.** `diedIds` and `newEntities` are gone from
`SimTickDelta` and from `extractSimTickDelta`, which also loses its `aliveBefore: Set<number>`
parameter (its only purpose was computing those two arrays); `simTickDeltaFromWorld(world)` takes no
set either. The now-unused `aliveIdSet` helper and the worker's per-tick/per-command `before`
bookkeeping are deleted, and `EntityCatalog.applyTickDelta` — dead code with zero call sites — is
removed with its `SimTickDelta` import. `tests/workerBoundary.closure.test.ts`,
`tests/simDelta.storyRoundtrip.test.ts`, `tests/low-1-worker-persistence.test.ts`,
`scripts/worker-boundary-audit.mts` and `scripts/probe-notifications.mts` were updated to the narrower
call; the closure test still compares the full delta key set, so a future field added without a reader
is visible there.
