# Name of file: 2026-09-30

- Bug: The family-tree fixture repeats an object key, so the repository's type gate (`npm run test:types`) fails on `tests/familyTree.test.ts`
- Status: resolved
- Date discovered: 2026-09-30
- Version/build: 0.6.5.0 (working tree, HEAD `c758307`)
- Reporter: agent, while verifying the Village-overview window change
- Area: Truth
- Owner module: `tests/familyTree.test.ts` (fixture only; no production module is involved)

## Status history

- 2026-09-30 — open (found by running the test project's typecheck as part of an unrelated task's verification; the defect blocks `npm run test:all` before a single test runs)
- 2026-09-30 — resolved (one duplicate line deleted on the owner's instruction — *"doesnt matter if your fault fix t he error"* — after it was first recorded and deliberately left alone; `npm run test:types` and `npm run test:standard` both green)

## Observed behavior

`npx tsc -p tsconfig.vitest.json --noEmit` exits **1** with exactly one error:

```text
tests/familyTree.test.ts(87,7): error TS1117: An object literal cannot have multiple properties with the same name.
```

The `human({...})` fixture for the child (id 8) sets `isJuvenile` twice:

```ts
      age: 8,
      isJuvenile: true,
      gender: 'female',
      motherId: 5,
      isJuvenile: true,   // <- line 87, a second copy of the key four lines above
      generation: 4,
```

## Expected behavior

`npm run test:types` (and therefore `npm run test:all`) passes, and a fixture states each property once. The test's own intent is unambiguous — the child is meant to be `isJuvenile: true` (the two copies agree) — so this is a duplicated line, not a disagreement about behaviour.

## Reproduction steps

1. From the repository root, run `npm run test:types` (or `npx tsc -p tsconfig.vitest.json --noEmit`).
2. Read the single reported error: `tests/familyTree.test.ts(87,7): error TS1117`.

## Evidence

- Command and result: `npx tsc -p tsconfig.vitest.json --noEmit` → `exit=1`, one `error TS1117` line, quoted above.
- Contrast measured in the same run: the **app** project is clean — `npx tsc -p tsconfig.app.json --noEmit` → `exit=0`. So the failure is confined to the test fixture.
- The file was last written 2026-09-30 01:59 (the previous session's family-tree work; the surrounding comments there explain the `age`/`isJuvenile` distinction), i.e. it predates this task. The change that verified it touches only `src/components/GameWindow.tsx`, `src/components/GameHeader.tsx` and `src/components/dashboard/GameDashboard.tsx`.

## Root cause

A second `isJuvenile: true` line was added to the child fixture when `age: 8` was introduced above it (the comment at lines 78-82 explains why the age matters, since `childRelation` classifies by age against `HUMAN_ADULT_MIN_AGE` rather than by the flag). TypeScript rejects the duplicate key outright; JavaScript would silently keep the last one, which is why only the type gate catches it.

## Regression test

Not added: the type gate **is** the regression test — `npm run test:types` fails on the duplicate key and passes once one copy is removed. Adding a runtime assertion for a duplicate object key is not possible.

## Fix

Delete one of the two `isJuvenile: true` lines at `tests/familyTree.test.ts:84`/`:87`, keeping the one beside `age`/`gender` so the fixture reads as one property list.

**Applied 2026-09-30.** The line at the old `:87` is removed; the remaining `isJuvenile: true` sits with `age: 8` and `gender: 'female'`, which is the pair its own comment explains. It was first recorded and **deliberately left alone** (AGENTS.md §6: a pre-existing error outside the change stays out of scope) while an unrelated UI change was under review; the owner then ruled *"doesnt matter if your fault fix t he error"*, and it is fixed in the same pass.

## Verification result

- Before: `npx tsc -p tsconfig.vitest.json --noEmit` → **exit=1**, the single `TS1117` above.
- After: `npx tsc -p tsconfig.vitest.json --noEmit` → **exit=0**; `npx tsc -p tsconfig.app.json --noEmit` → **exit=0**.
- `npx vitest run tests/familyTree.test.ts` → **passed**, and the whole gate `npm run test:standard` → **245 files / 1493 passed / 2 skipped / 0 failed**.

