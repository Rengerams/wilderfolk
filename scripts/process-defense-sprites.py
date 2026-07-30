#!/usr/bin/env python3
"""Remove baked-in checkerboard backgrounds and trim defense building sprites."""

from __future__ import annotations

import os
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "app" / "public" / "sprites"

# source filename -> output filename in app/public/sprites
INPUTS: dict[str, str] = {
    "barracks.png": "barracks.png",
    "watchtower.png": "watchtower.png",
    "wall_straight.png": "wall_straight.png",
    "wall_enrtance_gate.png": "wall_gate.png",
    "L-shaped_corner_wall.png": "wall_corner.png",
    "wall1.png": "wall_section.png",
    "jail.png": "prison.png",
}


def is_background_seed(r: int, g: int, b: int) -> bool:
    """Checkerboard / white padding used by many AI sprite exports."""
    spread = max(r, g, b) - min(r, g, b)
    if spread > 14:
        return False
    return min(r, g, b) >= 165


def is_background_neighbor(r: int, g: int, b: int, pr: int, pg: int, pb: int) -> bool:
    spread = max(r, g, b) - min(r, g, b)
    if spread > 14:
        return False
    if min(r, g, b) < 155:
        return False
    return abs(r - pr) <= 10 and abs(g - pg) <= 10 and abs(b - pb) <= 10


def remove_checkerboard(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if visited[y][x]:
            return
        r, g, b = px[x, y]
        if is_background_seed(r, g, b):
            visited[y][x] = True
            q.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        pr, pg, pb = px[x, y]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny][nx]:
                continue
            r, g, b = px[nx, ny]
            if is_background_neighbor(r, g, b, pr, pg, pb) or is_background_seed(r, g, b):
                visited[ny][nx] = True
                q.append((nx, ny))

    rgba = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out = rgba.load()
    src = rgb.load()
    for y in range(h):
        for x in range(w):
            if not visited[y][x]:
                out[x, y] = (*src[x, y], 255)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def stats(im: Image.Image) -> str:
    w, h = im.size
    px = im.convert("RGBA").load()
    transparent = sum(1 for y in range(h) for x in range(w) if px[x, y][3] < 128)
    return f"{w}x{h}, transparent={transparent}/{w*h} ({100*transparent/(w*h):.1f}%)"


def main() -> None:
    import sys
    if "--confirm" not in sys.argv:
        print("Refusing to overwrite sprites without --confirm.", file=sys.stderr)
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output: {OUT_DIR}\n")
    for src_name, out_name in INPUTS.items():
        src = ROOT / src_name
        if not src.exists():
            print(f"SKIP missing: {src_name}")
            continue
        before = Image.open(src)
        print(f"{src_name} (before {stats(before)})")
        processed = remove_checkerboard(before)
        dest = OUT_DIR / out_name
        processed.save(dest, optimize=True)
        print(f"  -> {out_name} ({stats(processed)})")
    print("\nDone.")


if __name__ == "__main__":
    main()