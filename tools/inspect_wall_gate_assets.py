from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
for name in ("wall_isometric.png", "Gate .png"):
    path = root / "public" / "sprites" / name
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    extrema = alpha.getextrema()
    transparent = sum(1 for value in alpha.getdata() if value == 0)
    print(f"{name}: size={image.size}, alpha_extrema={extrema}, alpha_bbox={bbox}, fully_transparent={transparent}/{image.width * image.height}")
