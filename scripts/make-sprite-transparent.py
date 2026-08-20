"""Remove the near-white backdrop from house_leader.jpg -> transparent PNG sprite.

Border-seeded flood fill (4-connected) over bright, near-neutral pixels marks the
backdrop; a 1px feather band then decontaminates JPEG halo pixels (un-blends them
from white) so edges stay clean on dark in-game backgrounds.

Run: python scripts/make-sprite-transparent.py [src] [dst]
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "house_leader.jpg"
DST = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "public" / "sprites" / "house_leader.png"

# Backdrop detection: bright and near-neutral (white/gray JPEG backdrop).
FILL_MIN = 205      # min(r,g,b) needed to count as backdrop
FILL_NEUTRAL = 40   # max channel spread allowed (keeps tinted foreground out)
# Feather band on foreground pixels touching the backdrop.
FEATHER_LO = 205    # >= this min-channel -> partially transparent ...
FEATHER_HI = 245    # ... up to fully transparent at this value


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()

    def bg_like(p: tuple[int, int, int]) -> bool:
        r, g, b = p
        mn = min(r, g, b)
        return mn >= FILL_MIN and max(r, g, b) - mn <= FILL_NEUTRAL

    # Border-seeded flood fill over backdrop-colored pixels.
    filled = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if not filled[y * w + x] and bg_like(px[x, y]):
            filled[y * w + x] = 1
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                seed(nx, ny)

    out = Image.new("RGBA", (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            if filled[y * w + x]:
                opx[x, y] = (0, 0, 0, 0)
                continue
            r, g, b = px[x, y]
            touches_bg = any(
                0 <= x + dx < w and 0 <= y + dy < h and filled[(y + dy) * w + (x + dx)]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            if touches_bg:
                mn = min(r, g, b)
                if mn >= FEATHER_LO and max(r, g, b) - mn <= FILL_NEUTRAL + 10:
                    t = max(0.0, min(1.0, (FEATHER_HI - mn) / (FEATHER_HI - FEATHER_LO)))
                    a = round(255 * t)
                    if a <= 0:
                        opx[x, y] = (0, 0, 0, 0)
                        continue
                    if a < 255:
                        # Un-blend from white: observed = t*color + (1-t)*255
                        r = round((r - (1 - t) * 255) / t)
                        g = round((g - (1 - t) * 255) / t)
                        b = round((b - (1 - t) * 255) / t)
                        opx[x, y] = (
                            max(0, min(255, r)),
                            max(0, min(255, g)),
                            max(0, min(255, b)),
                            a,
                        )
                        continue
            opx[x, y] = (r, g, b, 255)

    DST.parent.mkdir(parents=True, exist_ok=True)
    out.save(DST)
    n_bg = sum(filled)
    print(f"wrote {DST} {w}x{h}, backdrop cleared: {n_bg} px ({100 * n_bg / (w * h):.1f}%)")


if __name__ == "__main__":
    main()
