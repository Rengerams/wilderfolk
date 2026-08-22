from collections import Counter
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public" / "sprites"
for name in ("wall_isometric.png", "gate_isometric.png", "watchtower_isometric.png"):
    image = Image.open(root / name).convert("RGBA")
    opaque = [pixel[:3] for pixel in image.getdata() if pixel[3] >= 200]
    colors = Counter(opaque)
    print(name)
    print("  opaque_pixels:", len(opaque), "unique:", len(colors))
    print("  top:", ", ".join(f"#{r:02x}{g:02x}{b:02x}={count}" for (r, g, b), count in colors.most_common(12)))
    dark = [pixel for pixel in opaque if max(pixel) < 70]
    stone_like = [pixel for pixel in opaque if abs(pixel[0] - pixel[1]) < 24 and abs(pixel[1] - pixel[2]) < 28 and 70 <= sum(pixel) / 3 <= 205]
    wood_like = [pixel for pixel in opaque if pixel[0] > pixel[1] * 1.08 and pixel[1] > pixel[2] * 1.1]
    print("  dark_outline_candidates:", len(dark), "stone_like:", len(stone_like), "wood_like:", len(wood_like))
