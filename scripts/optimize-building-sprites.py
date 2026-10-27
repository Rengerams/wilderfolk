#!/usr/bin/env python3
"""Reduce Barracks/Prison sprite download and texture cost without altering build footprints.

Run from repository root:
    python -m pip install Pillow
    python scripts/optimize-building-sprites.py

Use --max-size 768 to retain higher-resolution assets, or --dry-run to inspect only.
Writes only when an output is smaller than its source. Keeps automatic .original.png
backups next to sprites (gitignored recommended).
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ("barracks.png", "prison.png")


def optimize(path: Path, max_size: int, dry_run: bool) -> None:
    original = path.read_bytes()
    with Image.open(io.BytesIO(original)) as source:
        rgba = ImageOps.exif_transpose(source).convert("RGBA")
        old_size = rgba.size
        rgba.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        rgba.save(output, format="PNG", optimize=True, compress_level=9)
        compressed = output.getvalue()
    ratio = 100 * (1 - len(compressed) / len(original))
    print(f"{path.relative_to(ROOT)}: {old_size[0]}x{old_size[1]} -> "
          f"{rgba.width}x{rgba.height}; {len(original):,} -> {len(compressed):,} bytes "
          f"({ratio:+.1f}% saved)")
    if dry_run or len(compressed) >= len(original):
        if len(compressed) >= len(original):
            print("  Not replacing: optimized file is not smaller.")
        return
    path.write_bytes(compressed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-size", type=int, default=512,
                        help="maximum width/height in pixels (default 512)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.max_size < 128 or args.max_size > 4096:
        parser.error("--max-size must be between 128 and 4096")
    for filename in SPRITES:
        path = ROOT / "public" / "sprites" / filename
        if not path.is_file():
            raise SystemExit(f"Missing sprite: {path}")
        optimize(path, args.max_size, args.dry_run)


if __name__ == "__main__":
    main()
