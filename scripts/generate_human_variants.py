"""Generate subtle, normal-looking outfit variants from base human walk sheets.

Each source file is a 4-frame vertical walk sheet. Variant 0 is the original art;
variants 1-3 apply small brightness/saturation tweaks within natural earth tones
(brown/tan for men, red/maroon for women) so settlers look like ordinary pioneers.
"""

from __future__ import annotations

import colorsys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "sprites"
ALPHA_CUT = 48

# (hue_shift 0..1, saturation_multiplier, value_multiplier)
# Keep shifts tiny — same outfit style, slightly different wear/fade.
MALE_STYLES: list[tuple[float, float, float]] = [
    (0.0, 1.0, 1.0),     # v0 — original brown
    (0.02, 0.95, 1.06),  # v1 — warm tan
    (-0.02, 1.0, 0.88),  # v2 — darker brown
    (0.04, 0.9, 0.95),   # v3 — dusty rust-brown
]

FEMALE_STYLES: list[tuple[float, float, float]] = [
    (0.0, 1.0, 1.0),     # v0 — original red dress
    (-0.03, 1.02, 0.9),  # v1 — maroon
    (0.02, 0.92, 1.05),  # v2 — faded rose-red
    (-0.05, 0.95, 0.85), # v3 — deep burgundy
]


def _in_natural_clothing_hue(h: float, gender: str) -> bool:
    """Only recolor pixels that already look like clothing in a natural palette."""
    if gender == "male":
        # Browns, tans, dark pants — warm hues ~orange through yellow-brown
        return (0.0 <= h <= 0.14) or h >= 0.92
    # Female dress/apron — reds and near-reds only
    return h <= 0.06 or h >= 0.94


def shift_rgba(
    r: int,
    g: int,
    b: int,
    a: int,
    hue_shift: float,
    sat_mult: float,
    val_mult: float,
    gender: str,
) -> tuple[int, int, int, int]:
    if a < ALPHA_CUT:
        return r, g, b, a

    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)

    # Outlines, hair, skin, white apron — leave alone.
    if s < 0.12 and v < 0.85:
        return r, g, b, a
    if s < 0.08:
        return r, g, b, a
    if 0.03 < h < 0.12 and s < 0.35 and v > 0.55:
        return r, g, b, a
    if 0.0 <= h < 0.07 and s < 0.25 and v > 0.7:
        return r, g, b, a
    # White apron / sleeves on female sprite
    if s < 0.15 and v > 0.82:
        return r, g, b, a

    if not _in_natural_clothing_hue(h, gender):
        return r, g, b, a

    if hue_shift != 0.0:
        h = (h + hue_shift) % 1.0
    if sat_mult != 1.0:
        s = max(0.0, min(1.0, s * sat_mult))
    if val_mult != 1.0:
        v = max(0.0, min(1.0, v * val_mult))

    nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
    return int(nr * 255), int(ng * 255), int(nb * 255), a


def recolor_sheet(
    src: Path,
    dst: Path,
    hue_shift: float,
    sat_mult: float,
    val_mult: float,
    gender: str,
) -> None:
    from PIL import Image

    if hue_shift == 0.0 and sat_mult == 1.0 and val_mult == 1.0:
        shutil.copy2(src, dst)
        return

    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    out = Image.new("RGBA", (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            opx[x, y] = shift_rgba(*px[x, y], hue_shift, sat_mult, val_mult, gender)
    out.save(dst, optimize=True)


def generate_gender(
    gender: str,
    src_name: str,
    styles: list[tuple[float, float, float]],
) -> list[str]:
    src = OUT_DIR / src_name
    if not src.exists():
        raise FileNotFoundError(src)

    paths: list[str] = []
    for i, (hue, sat, val) in enumerate(styles):
        out_name = f"human_{gender}_v{i}.png"
        out_path = OUT_DIR / out_name
        recolor_sheet(src, out_path, hue, sat, val, gender)
        paths.append(f"/sprites/{out_name}")
        print(f"  wrote {out_path.name}")
    return paths


def main() -> None:
    import sys
    if "--confirm" not in sys.argv:
        print(
            "Refusing to overwrite human variant PNGs without --confirm.",
            file=sys.stderr,
        )
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating male variants...")
    male_paths = generate_gender("male", "human_male.png", MALE_STYLES)
    print("Generating female variants...")
    female_paths = generate_gender("female", "human_female.png", FEMALE_STYLES)
    print("\nMale paths:")
    for p in male_paths:
        print(f"  {p}")
    print("Female paths:")
    for p in female_paths:
        print(f"  {p}")


if __name__ == "__main__":
    main()