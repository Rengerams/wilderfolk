# New village building allocator changed on save/load

- Bug: A new village began with nextBuildingId 0, but the save loader correctly enforced the positive-id floor and restored 1.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: PR #123, worker boundary validation at commit 61959ff7
- Reporter: actual GitHub Actions boundary audit
- Area: simulation worker boundary and save identity
- Owner module: `worldGen.ts`
- Related PR/commit: PR #123

## Status history
- 2026-11-02 — investigating: initial failure confirmed in the real 60-day boundary audit; code and focused regression committed, rerun pending.

## Observed behavior
A new village began with nextBuildingId 0, but the save loader correctly enforced the positive-id floor and restored 1.

## Expected behavior
The JSON and worker boundary must preserve meaningful source values and distinguish benign JSON optional-key representation from real value loss.

## Reproduction steps
1. Run the real worker-transport CI boundary audit with the fixed seed and standard 60-day scenario.
2. Observe the reported source versus target value at the named boundary.
3. Compare the original source, actual serialized payload and reloaded world.

## Evidence
GitHub Actions worker-transport validation logged unexplained boundary findings after 5,000 successful worker ticks and 1,000 successful commands.

## Root cause
The generator's initial allocator contradicted the load boundary's positive allocator invariant.

## Fix / proposed fix
Initialize the new-village building counter at 1 and test a normal JSON save/load roundtrip.

## Save/migration impact
No existing save schema or migration is altered. A new colony's next building ID starts at the valid positive floor; existing allocator values remain preserved by the loader.

## Verification result
- Previous 60-day audit: FAIL at the above boundary.
- Dedicated regression source: committed.
- Current-head CI and worker boundary audit: NOT RUN at report creation.
