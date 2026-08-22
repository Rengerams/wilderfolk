from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
sprites = root / "public" / "sprites"

def normalize(source_name: str, output_name: str, canvas_size: tuple[int, int], margin: int = 4) -> None:
    source = Image.open(sprites / source_name).convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"{source_name} has no visible alpha content")
    cropped = source.crop(bbox)
    available = (max(1, canvas_size[0] - margin * 2), max(1, canvas_size[1] - margin * 2))
    scale = min(available[0] / cropped.width, available[1] / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    offset = ((canvas_size[0] - size[0]) // 2, canvas_size[1] - margin - size[1])
    output.alpha_composite(resized, offset)
    output.save(sprites / output_name, "PNG", optimize=True)
    print(f"{source_name} -> {output_name}: source={source.size}, crop={cropped.size}, output={output.size}, content={size}, alpha_bbox={output.getchannel('A').getbbox()}")

normalize("Gate .png", "gate_isometric.png", (96, 96), margin=4)
normalize("watchtower.png", "watchtower_isometric.png", (112, 128), margin=4)
