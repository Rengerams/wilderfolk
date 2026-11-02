# Duplicate-code elimination — phased cleanup plan

**Date:** 2 November 2026  
**Status:** ACTIVE — ratchets are live; old groups are being triaged.  
**Scope:** textual clones (jscpd), behavior-level duplicate groups (calls/members/writes), compatibility aliases and re-exports. Do not change gameplay behaviour just to satisfy the gate.

## 0. What exists now

- `scripts/check-duplicate-code.mjs` — baselines jscpd clones; fails new clones.
- `scripts/check-semantic-duplicates.mjs` — groups functions by the calls, members and writes they perform; fails new/unreviewed groups; `src/test/` helpers are excluded.
- Baselines:
  - `docs/tools/duplicate-code-baseline.json`
  - `docs/tools/semantic-duplicates-baseline.json`
- Review record:
  - `docs/tools/semantic-duplicates-reviewed.json`
- Standard gate steps: `semanticDup` and `dup`.

### Review commands

```powershell
node scripts/check-semantic-duplicates.mjs --list
node scripts/check-semantic-duplicates.mjs --explain 7
node scripts/check-semantic-duplicates.mjs --explain 1a2b3c4d
node scripts/check-semantic-duplicates.mjs --explain simRandom
node scripts/check-semantic-duplicates.mjs --mark distinct 7 --reason "..." --tests "tests/a.test.ts"
node scripts/check-semantic-duplicates.mjs --mark real 7 --reason "..." --tests "tests/a.test.ts"
node scripts/check-duplicate-code.mjs
```

## 1. Verdict rules — real vs distinct

A group is a **real duplicate** only when all of these hold:

1. Same input contract: parameters, types, units, validation and refusal branches.
2. Same output/effect contract: return value, state writes, no-op behaviour.
3. Same use case: interchangeable callers, not a test helper or a different domain role.
4. One can replace the other without changing caller tests or observable behaviour.

A group is **reviewed-distinct** when any of those differs. Record the concrete difference, not a generic “different purpose”.

Examples:

- Real: `seeded` duplicated in two render modules; `hasTech` predicate copied; `cloneWorldStateForAction` wrappers around `structuredClone`.
- Distinct: `entityFactory.simRandom` vs `worldGen.simRandom` (different RNG streams); footprint rectangle vs overlap predicate; `seededRandom` vs `mulberry32`.
- Alias: a re-export that intentionally preserves an old import path; mark `aliasOf` in the ownership work, not as a duplicate.

## 2. Phase 0 — Guardrails (complete)

- [x] Textual baseline and `dup` gate.
- [x] Behavior-level baseline and `semanticDup` gate.
- [x] Test-helper exclusion.
- [x] Explicit review status file and `--explain`/`--mark` commands.
- [x] Register both tools in `OWNERSHIP_OVERVIEW.md`.

**Exit criterion:** a new clone or new behavior group fails; existing groups do not block unrelated work.

## 3. Phase 1 — Triage the old inventory

Goal: every old group has a verdict.

1. Run `--list`; copy the 33 groups into a working sheet with domain, risk and owner.
2. For each group run `--explain <id>`; record calls, members, writes and callers.
3. Mark:
   - `real` when cleanup is needed;
   - `distinct` with a concrete reason + existing test when it is a false positive.
4. Prioritise by risk:
   1. state writers and command paths,
   2. core simulation helpers,
   3. renderer/audio/UI helpers,
   4. wrappers/aliases,
   5. false positives.

**Exit criterion:** 0 unreviewed groups; every `real` group has an owner and a cleanup ticket.

## 4. Phase 2 — Real pure-helper duplicates

Typical work: small predicates, lookup helpers, seed functions and formatter wrappers.

For each real group:

1. Choose the canonical owner and contract.
2. Add an equivalence test before changing callers:
   - table-driven pure inputs → equal outputs and errors;
   - or substitute the canonical implementation into the caller's existing test.
3. Replace all callers with the canonical symbol.
4. Delete the duplicate and any now-unused import.
5. Run caller tests, `npm run test:types`, lint.
6. Regenerate the baseline:

```powershell
node scripts/check-semantic-duplicates.mjs --update-baseline
node scripts/check-duplicate-code.mjs --update-baseline
```

**Exit criterion:** the group disappears from `--list`; baseline counts fall; no caller test changes except the new equivalence coverage.

## 5. Phase 3 — State writers and worker commands

This is the high-risk phase.

- Real duplicate writers must keep exactly one owner.
- Check `decisionRegistry.ts` before merging: cadence, writes, scheduler entry and tests must still describe the surviving owner.
- Add a state-diff regression: clone the world, apply each implementation, compare the changed fields and returned world.
- Do not merge writers that differ in refusal branches or write different fields just because the function bodies look alike.
- After every merge, run the owning unit test file plus the command round-trip tests.

**Exit criterion:** each write field has one writer path; duplicate command handlers are gone; decision registry matches.

## 6. Phase 4 — Renderer, audio and UI duplicates

Renderer/audio methods often share a body but hold different private state/lifecycle.

Options, in order:

1. Extract a shared pure helper when the difference is only geometry/formatting.
2. Extract a shared base/utility when two classes genuinely share lifecycle-free behaviour.
3. Leave distinct when class state, timing or canvas ownership differs; mark `distinct` with that reason.

Do not merge `setNightMode`/`syncMute` methods blindly; compare the player/class fields they read and write first.

**Exit criterion:** each remaining semantic group is either a reviewed-distinct class contract or gone.

## 7. Phase 5 — Alias and re-export cleanup

Classify, do not delete blindly:

- **Canonical** — one implementation.
- **Compatibility alias** — names `aliasOf`, no new imports; remove when usage reaches zero.
- **Router** — chooses an owner by domain rule (for example `buildingActionRouting`); keep and register as a router.
- **Wrapper** — thin validation/fallback layer in the same owner; keep if it adds a contract.

Existing candidates:

- `placementUtils` re-exports `getBuildingCenter` / `getBuildingFootprintRect` from `buildingGeometry`.
- `dayCycle` re-exports `assignMissingResidences` from `residencyReconciliation`.
- `gameEngine` re-exports building action entry points.
- `gameTypes` re-exports building types/configs.

For each alias: count consumers, migrate one module per PR, then remove the alias. Do not add an alias just to avoid updating an import.

**Exit criterion:** every re-export has an owner row and a deprecation path; no new alias without review.

## 8. Phase 6 — Shrink and enforce

- `--update-baseline` only after a real group is gone or a distinct verdict is recorded.
- Baseline grows are forbidden; a new group must be fixed or reviewed-distinct with tests.
- Add a periodic report to the handover:

```powershell
node scripts/check-duplicate-code.mjs
node scripts/check-semantic-duplicates.mjs --list
```

- Target metrics:
  - textual clones: 29 → reviewed minimum;
  - semantic groups: 33 → reviewed-distinct only, ideally 0 real;
  - zero unreviewed groups.

## 9. Definition of done

- [ ] Every old group has `real`, `distinct` or is gone.
- [ ] Every `real` group has one canonical owner and no duplicate implementation.
- [ ] Every `distinct` group has a concrete reason and an existing test.
- [ ] Baselines contain only reviewed-distinct groups (or intentional compatibility copies).
- [ ] `dup` and `semanticDup` pass on a fresh clone.
- [ ] No new alias/re-export without an ownership entry.
- [ ] `test:standard` passes; the only allowed blockers are unrelated concurrent edits, listed explicitly.

## 10. Guardrails

- Do not mass-delete old functions to make the baseline smaller.
- Do not mark `distinct` without a test or a precise reason.
- Do not merge functions that write different state or have different refusal behaviour.
- Do not let a baselines update hide a new duplicate; review the diff.
- Historical bug reports and narrative docs are not part of this cleanup.
