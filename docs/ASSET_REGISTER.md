# Asset Register

Every shipped asset's provenance, so the game can be audited (Steam, external playtests)
and regenerated when art changes. Audio licensing lives in `docs/THIRD_PARTY_NOTICES.md`.

## Audio (`public/audio/`)

Third-party OpenGameArt tracks — **see `docs/THIRD_PARTY_NOTICES.md`** for the full
credit/license table (several CC-BY tracks require attribution when distributing).

## Sprites (`public/sprites/`, 72 files)

### A. Procedurally generated — regenerable with a script

| Sprite(s) | Generator | Notes |
|---|---|---|
| `bridge.png` | `scripts/generate-bridge-sprite.mjs` | Seamless wooden deck |
| `water_shallow_fill.png` · `water_deep_fill.png` | `scripts/generate-water-sprites.mjs` | Terrain water fills |
| `fishingspot.png` · `wildlife_preserve.png` | `scripts/generate-phase678-sprites.mjs` | Phase 6 docks/grove |
| `tile_dirt.png` · `tileset_grass.png` | `scripts/generate-*.mjs` lineage | Painted terrain fills/atlas (2.5D relief) |

### B. Hand-authored in-repo

| Asset | Status |
|---|---|
| `gate.png` · `wall.png` | **Reserved drafts** — intended replacements for the current procedural wall/gate; NOT wired, do NOT delete (`docs/private/OPEN_PROBLEMS.md`) |
| `TilesetGrass/` (untracked) | Authoring scratch for the painted tileset (`.tsx`/`.tmx`/`.png`) — not shipped, kept as source |
| `house_leader.png` | User-supplied art (source `house_leader.jpg` in repo root); backdrop made transparent via `scripts/make-sprite-transparent.py`. Not yet wired to a building |

### C. Legacy in-repo sprites — pending audit

The remaining ~60 sprites (buildings, wildlife, humans/walk sheets, terrain props) shipped
with the project's earlier art passes. Origin is in-repo (self-generated/self-authored);
**audit before any external distribution** to confirm none are third-party.

## Generated-art rule

Any new sprite must be **either** procedurally generated (add to `scripts/` with a `generate-*.mjs`
file) **or** hand-authored in-repo and registered here. No new third-party sprite assets without
adding them to `docs/THIRD_PARTY_NOTICES.md`.
