from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "sprite_sources" / "new_female_set.png"
OUTPUT_DIR = ROOT / "public" / "sprites" / "new_female_set"

# The source sheet is 1539 x 1022 and contains five figures in one row.
# Boxes are deliberately generous; the script trims transparent margins after cleanup.
CROPS = {
    "new_female_v0": (95, 205, 355, 825),
    "new_female_v1": (355, 205, 625, 825),
    "new_female_v2": (625, 190, 895, 825),
    "new_female_v3": (895, 190, 1165, 825),
    "new_female_v4": (1165, 195, 1445, 825),
}

# Checkerboard background colors are sampled from the crop border. A flood fill
# removes only background connected to the border, preserving pale clothing.
COLOR_TOLERANCE = 34


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[i] - b[i]) for i in range(3))


def border_colors(image: Image.Image) -> list[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    points = []
    for x in range(w):
        points.extend((rgb.getpixel((x, 0)), rgb.getpixel((x, h - 1))))
    for y in range(h):
        points.extend((rgb.getpixel((0, y)), rgb.getpixel((w - 1, y))))
    unique: list[tuple[int, int, int]] = []
    for color in points:
        if not any(color_distance(color, existing) <= 8 for existing in unique):
            unique.append(color)
    return unique


def remove_border_connected_checkerboard(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")
    w, h = rgba.size
    background = border_colors(rgba)

    def is_background(x: int, y: int) -> bool:
        pixel = rgb.getpixel((x, y))
        return any(color_distance(pixel, sample) <= COLOR_TOLERANCE for sample in background)

    visited: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not is_background(x, y):
            continue
        visited.add((x, y))
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                queue.append((nx, ny))

    pixels = rgba.load()
    for x, y in visited:
        pixels[x, y] = (0, 0, 0, 0)
    return rgba


def trim_transparent(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def save_crops() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing source sheet: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, box in CROPS.items():
        cleaned = remove_border_connected_checkerboard(source.crop(box))
        cleaned = trim_transparent(cleaned)
        output = OUTPUT_DIR / f"{name}.png"
        # Never overwrite an existing extracted sprite unless --force is added later.
        if output.exists():
            raise FileExistsError(f"Refusing to overwrite existing file: {output}")
        cleaned.save(output, "PNG", optimize=True)
        print(f"saved {output} ({cleaned.width}x{cleaned.height})")


if __name__ == "__main__":
    save_crops()
