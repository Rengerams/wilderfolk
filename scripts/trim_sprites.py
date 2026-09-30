"""Trim sprite PNGs: drop faint halos, crop to opaque content, save in place."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

SPRITES_DIR = Path(__file__).resolve().parents[1] / "public" / "sprites"
ALPHA_CUTOFF = 60  # pixels below this become fully transparent

# Target max edge after crop — sized for on-map display without extreme downscale blur
MAX_EDGE: dict[str, int] = {
    "grass": 48,
    "road": 96,
    "rabbit": 64,
    "deer": 80,
    "wolf": 72,
    "fox": 64,
    "human_male": 72,
    "human_female": 72,
    "tree": 96,
}
DEFAULT_MAX_EDGE = 112  # buildings and large structures


def trim_sprite(path: Path) -> tuple[str, tuple[int, int]]:
    img = Image.open(path).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < ALPHA_CUTOFF:
                pixels[x, y] = (0, 0, 0, 0)

    bbox = img.getbbox()
    if not bbox:
        return path.name, (w, h)

    cropped = img.crop(bbox)
    stem = path.stem
    max_edge = MAX_EDGE.get(stem, DEFAULT_MAX_EDGE)
    longest = max(cropped.size)
    if longest > max_edge:
        scale = max_edge / longest
        new_size = (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        )
        cropped = cropped.resize(new_size, Image.Resampling.NEAREST)

    cropped.save(path, optimize=True)
    return path.name, cropped.size


def main() -> None:
    import sys
    if "--confirm" not in sys.argv:
        print(
            "Refusing to modify sprites without --confirm "
            "(this script overwrites public/sprites in place).",
            file=sys.stderr,
        )
        sys.exit(1)
    results: list[tuple[str, tuple[int, int]]] = []
    for path in sorted(SPRITES_DIR.glob("*.png")):
        results.append(trim_sprite(path))

    print(f"Trimmed {len(results)} sprites in {SPRITES_DIR}")
    for name, size in results:
        print(f"  {name}: {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()