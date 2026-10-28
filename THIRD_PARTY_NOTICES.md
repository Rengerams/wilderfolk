# Third-Party Notices

Wilderfolk's source code and original materials are subject to the [Wilderfolk Permission-Required License](LICENSE) — Copyright (c) 2026 Renffr. Permission must be requested before reuse, modification, redistribution, or commercial use.
This file lists every third-party asset shipped with the game and its license.

## Cethiel — Tileable Dirt Textures (CC0)

| Local assets | Artwork | Creator | License | Source |
|---|---|---|---|---|
| `public/sprites/terrain/cethiel/Dirt_01.png` … `Dirt_04.png` | Four tileable 512×512 soil textures | Cethiel | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Tileable Dirt Textures](https://opengameart.org/content/tileable-dirt-textures) |

The four PNGs match the originals supplied in `Tileable Dirt Textures.zip` by SHA-256. V4 uses fine loam (01), stony/coarse ground (02), and woodland leaf litter (04) with climate-graded blending. The directional/rutted Dirt_03 is retained for later path/farm textures but is intentionally not preloaded into random natural soil. Normal maps and the optional composite preview are not shipped.

## rubberduck / para — 50 free textures 5 (CC0)

| Local assets | Artwork | Creator | License | Source |
|---|---|---|---|---|
| `public/sprites/terrain/rubberduck/{201,206,209,210,215,217,218,231,232,233,234,235,241,246}.jpg` | Curated natural ground, stone, bark and cobble albedos, resized from 1024×1024 to 512×512 | [rubberduck](https://opengameart.org/content/50-free-textures-5-with-normalmaps); textures 201–225 originally from para's CC0 resources | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [50 free textures 5 — with normalmaps](https://opengameart.org/content/50-free-textures-5-with-normalmaps) |

The user supplied the original 50-albedo + 50-normal archive `50_free_textures_5.zip` (SHA-256 `4b535f0e09a8bf4d62e81fe7b28cd099fe1586e74d0b5eede5ccc2f4fbde5b7a`). The one-time GitHub importer verified the public artist archive against that hash before extracting a safe, explicit 14-file allowlist. Seven images are preloaded for natural terrain; the other seven are reserved for subsequent building/road work. Metal panels, roof tiles, brick walls and all 50 normal maps are **not loaded at runtime**. All selected files are locally served.

## Cethiel tileable grass textures (CC0)

| Local assets | Artwork | Creator | License | Source |
|---|---|---|---|---|
| `public/sprites/terrain/cethiel/Grass_01.png` … `Grass_04.png` | Tileable Grass Textures — Set 1 (four 512×512 albedo images) | [Cethiel](https://opengameart.org/users/cethiel) | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | [Original OpenGameArt pack](https://opengameart.org/content/tileable-grass-textures-set-1) |

The four files exactly match the originals in the user-supplied CC0 ZIP (verified against all four Git blob SHA-1 hashes). The archive's normal maps are not currently included because Wilderfolk's Canvas terrain shader only uses colour textures. The runtime ships the local files and never loads them from third-party servers.

## Nature artwork (CC0)

| Local assets | Artwork | Creator | License | Source |
|---|---|---|---|---|
| `public/sprites/nature/ansimuz/*.png` | Trees & Bushes, Summer Pine Tree Tiles | [Ansimuz / Luis Zuno](https://opengameart.org/users/ansimuz) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [OpenGameArt Trees & Bushes](https://opengameart.org/content/trees-bushes) — original `license.txt` included |
| `public/sprites/nature/kenney/*.png` | Isometric Nature rock, cactus and wood illustrations | [Kenney](https://kenney.nl/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [Kenney's Isometric Nature](https://kenney.nl/assets/isometric-nature), originals mirrored by [shorepine/kenney](https://github.com/shorepine/kenney) |

The nature images are shipped locally; there are no runtime third-party asset requests. New-world v4 decor does not create unrelated placeholder art for unsupported small nature props (mushrooms, bones, lilies, flowers, ferns, reeds, cattails, scrub or decorative berries). The Ansimuz RGB preview sheet is retained as a source reference, **not rendered** as a sprite, because its opaque background would create visible rectangles.

## Audio (OpenGameArt.org)## Audio (OpenGameArt.org)

Royalty-free music and sound effects from [OpenGameArt.org](https://opengameart.org).
Files live under `public/audio/`; track wiring is in `src/audio/tracks.ts`.
If a sample fails to load, the game falls back to procedural Web Audio tones.

### Music

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `music/intro-frontier.mp3` | Settlement of the Frontier (Full) | [TAD](https://opengameart.org/users/tad) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://opengameart.org/content/settlement-of-the-frontier-full |
| `music/day-village-loop.mp3` | Abeth (*Peaceful village loop*) | [elerya](https://opengameart.org/users/elerya) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/peaceful-village-loop |
| `music/night-calm.ogg` | Slow Stride Loop | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/slow-stride |

### Ambient & sound effects

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `ambient/birds-loop.ogg` | Ambient Bird Sounds | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/ambient-bird-sounds |
| `ambient/bird-chirp.mp3` | Bird chirping sounds | [syncopika](https://opengameart.org/users/syncopika) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/bird-chirping-sounds |
| `ambient/cricket-frog-night.mp3` | Ambient Bird, Cricket and Frog | [Blender Foundation](http://apricot.blender.org) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/ambient-bird-cricket-and-frog |
| `ambient/wolf-howl.mp3` | Wolf Monster Sound | [CaveboyTup](https://opengameart.org/users/caveboytup) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/wolf-monster-sound |
| `ambient/animals/*.wav` | Animal or beast sounds pack | [pauliuw](https://opengameart.org/users/pauliuw) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/animal-or-beast-sounds |

### Attribution (CC-BY assets — required when distributing)

> **Music:** "Settlement of the Frontier (Full)" by Tad Miller (CC-BY 4.0); "Abeth" by Audibert jd / Eleryan Tales (CC-BY 3.0).
> **Sound:** Ambient bird/cricket/frog audio from the Blender Foundation / *Yo Frankie!* project (CC-BY 3.0).

CC0 assets do not require attribution.

## Sprites & art

Most sprites in `public/sprites/` are **in-repo** — see [`ASSET_REGISTER.md`](ASSET_REGISTER.md) for
provenance per file (procedurally generated by `scripts/generate-*.mjs`, cut from a delivered sheet,
or an earlier pass whose origin is not recorded). Eight sprite files are **not** original work.

### Road, wall and gate art

The three files under `sprites/oga_drummyfish/` are unmodified extracts from
[Top-down RPG mockup scene](https://opengameart.org/content/top-down-rpg-mockup-scene)
by Drummyfish: `tile_pavement.png`, `wall_4.png` (vendored as `wall.png`) and
`gate_1.png` (vendored as `gate.png`). The source page was verified on 2026-10-26:
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) permits
commercial use and redistribution with no required attribution. Credit is retained
voluntarily. The local wall SVG fallbacks are original project artwork.

### Third-party sprite art shipped

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `sprites/mountain.png` | `as_mountain5x5` mountain peak | [Unknown Horizons](https://www.unknown-horizons.org/) contributors | [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | `natural-resources-mines.zip` (2011), as recorded by the deleted `public/sprites/mountains/CREDITS.txt` |
| `sprites/new_terrain_tiles/Tiles/ts_mountains/{45,135,225,315}.png` | same `as_mountain5x5` peak, byte-identical copies | same | same | same |
  `Ground_soil.png`|`spriteLoader.ts`| Art for stabilish  the ground |


**Status: shipped but drawn by nothing.** These five files (322.5 KiB) sit in `public/` and are
therefore copied into every build, yet no code path requests them — the ridge-peak stamp that once
used `/sprites/mountains/*.png` was removed with the per-pixel ground bake, and the art survives
here under a different path. Because they do ship, the notice is required; because nothing draws
them, deleting them is the cheaper remedy for the project, and that is the owner's call. Note the
licence conflict: **CC-BY-SA 3.0 is share-alike, which the repository's permission-required
`LICENSE` cannot satisfy** if this art ever reaches a build that is distributed.

### Reviewed candidates — not currently shipped

The following asset was reviewed for an isolated dirt-path prototype but is **not currently included in the production build**:

| Prototype/reference asset | Original title | Author | License | Source |
|---|---|---|---|---|
| `prototype/ccby-dirt-path-reference/*.png` | Dirt Path Tileset | [Scobmyster](https://opengameart.org/users/scobmyster) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://opengameart.org/content/dirt-path-tileset |

If this asset is later shipped, adapted, or bundled with Wilderfolk, attribution must remain visible, the CC-BY 4.0 license must be linked, and the distribution must indicate that Wilderfolk made changes. The prototype currently uses the downloaded reference only for visual evaluation; it does not replace the game’s terrain atlas or road renderer.


## JavaScript dependencies

All runtime/build dependencies are installed from npm under their upstream licenses
(MIT/Apache-2.0/BSD/ISC) — see `package.json` and `package-lock.json`. No licenses requiring
attribution beyond the above are known.
