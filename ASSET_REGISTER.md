# Asset Register

Every shipped asset's provenance, so the game can be audited (Steam, external playtests)
and regenerated when art changes. Audio licensing lives in `docs/THIRD_PARTY_NOTICES.md`.

## Audio (`public/audio/`)

Third-party OpenGameArt tracks — **see `docs/THIRD_PARTY_NOTICES.md`** for the full
credit/license table (several CC-BY tracks require attribution when distributing).

## Sprites (`public/sprites/`, 71 files)

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
| `new_female_set_v2/cut/female_*.png` (10) · `new_male_set/male_*.png` (10) | **Shipped class ladders** (female 2026-09-10, male 2026-09-16), each cut from its delivered sheet (`Spritesheet_Females.png`, `V2/Spritesheet_V2_10_males.png`) with `scripts/cut-sprite-sheet.mjs`: transparent RGBA, no backdrop, tight bounds + 6 px padding. The superseded male art is kept in `new_male_set/legacy/` for rollback and both sheets stay as the regeneration sources |

### C. Legacy in-repo sprites — pending audit

The remaining ~60 sprites (buildings, wildlife, humans/walk sheets, terrain props) shipped
with the project's earlier art passes. Origin is in-repo (self-generated/self-authored);
**audit before any external distribution** to confirm none are third-party.

## Generated-art rule

Any new sprite must be **either** procedurally generated (add to `scripts/` with a `generate-*.mjs`
file) **or** hand-authored in-repo and registered here. No new third-party sprite assets without
adding them to `docs/THIRD_PARTY_NOTICES.md`.
