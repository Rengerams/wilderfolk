from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public" / "sprites"
# Shared Wilderfolk defensive palette: outline, stone, wood, metal and restrained accents.
PALETTE = [
    (8, 7, 7), (25, 21, 19), (48, 42, 38),
    (72, 64, 56), (101, 90, 75), (134, 116, 91),
    (165, 145, 111), (196, 174, 137),
    (45, 27, 19), (78, 45, 27), (116, 70, 39),
    (151, 94, 52), (190, 128, 68),
    (34, 36, 39), (62, 66, 72), (96, 101, 106),
    (139, 142, 140), (37, 67, 88), (55, 91, 112),
    (164, 116, 48), (205, 145, 53), (215, 108, 31),
    (232, 151, 40), (238, 197, 117),
]

palette_image = Image.new("P", (256, 1))
flat_palette = [channel for color in PALETTE for channel in color]
palette_image.putpalette(flat_palette + [0] * (768 - len(flat_palette)))

for name in ("wall_isometric.png", "gate_isometric.png", "watchtower_isometric.png"):
    path = root / name
    source = Image.open(path).convert("RGBA")
    alpha = source.getchannel("A")
    rgb = source.convert("RGB").quantize(palette=palette_image, dither=Image.Dither.NONE).convert("RGB")
    output = Image.merge("RGBA", (*rgb.split(), alpha))
    output.save(path, "PNG", optimize=True)
    visible = len(set(rgb.getdata()))
    print(f"{name}: shared palette applied, visible RGB colors={visible}, alpha_bbox={alpha.getbbox()}")
