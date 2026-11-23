# Updating the game version rejects unchanged save files

- Bug: bumping the game release version makes the loader reject otherwise compatible saves from the preceding release.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-23
- Version/build: main v0.6.5.1, planned v0.6.5.2
- Reporter: user running the newest GitHub source
- Area: save/load compatibility
- Owner module: `src/game/saveLoad.ts`, save schema metadata in `src/game/saveSchema.ts`
- Related PR/commit: PR #187

## Status history

- 2026-11-23 — investigating: independent save-format metadata and regression tests committed in PR #187. Initial changed-file CI found a stale legacy test fixture, corrected in commit `965d9bb`. Latest CI and actual player-save verification pending.

## Observed behavior

`COMPATIBLE_SAVE_VERSIONS = new Set([GAME_VERSION, '0.6.5.0'])` accepts v0.6.5.1 and v0.6.5.0 when the game release is v0.6.5.1. Changing only the `GAME_VERSION` constant to v0.6.5.2 silently removes v0.6.5.1 from the accepted versions.

## Expected behavior

A release-label bump should not reject an unchanged, restorable save layout. Unknown or genuinely incompatible save formats should still be refused with an actionable explanation.

## Reproduction steps

1. On main, save a world when `GAME_VERSION` is `0.6.5.1`.
2. Change only `GAME_VERSION` to `0.6.5.2` and attempt to load the previous save through `parseSaveJson`.
3. The old version gate refuses it with `version-mismatch`, despite an unchanged layout.

## Evidence

The original gate was `new Set([GAME_VERSION, '0.6.5.0'])` in `saveLoad.ts`; the game release constant is declared in `version.ts`. The user independently reproduced refusal during release-version updates.

## Root cause

The loader conflated the user-visible application version with the serialized data layout's compatibility version.

## Fix / proposed fix

Introduce `SAVE_FORMAT_VERSION = 1` alongside the schema and serialize `_saveFormatVersion` independently from `_version`. Use the layout marker to validate new saves and preserve an explicit list of previously shipped markerless v0.6.5.0, v0.6.5.1 and v0.6.5.2 files. Keep both paths inside the existing `parseSaveJson` owner; no second loader.

## Save/migration impact

New save files include one metadata field. Existing files are left unchanged and can use the current migration pipeline. Future breaking schema changes must bump the format version only after implementing or explicitly refusing incompatible migrations. Unknown markerless save releases remain refused.

## Verification result

- FAIL (earlier CI, 2026-11-23): `tests/low-4-save-worldgen.test.ts` expected a freshly produced marker-bearing save with a spoofed `_version: '0.4'` to be rejected. That expectation contradicted the new contract.
- NOT RUN locally: targeted suite and standard gate; no checkout in this session.
- CI pending on the corrected fixture: an old legacy save has `_saveFormatVersion` removed before checking the rejection. A marker-bearing same-format save with changed release remains accepted by design.
