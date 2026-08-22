from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "game" / "stripRender.ts"
text = path.read_text()
needle = "  const { rw, rh, x0, y0 } = beginRotatedStripFrame(ctx, sx, sy, w, h, rotation, alpha);"
replacement = "  const asset = isGate ? GATE_ISOMETRIC_SPRITE : WALL_ISOMETRIC_SPRITE;\n  const assetScale = isGate ? 1.42 : 1.18;\n  if (drawIsometricDefenseAsset(ctx, asset, sx, sy, w, h, rotation, alpha, assetScale)) return;\n\n" + needle
marker = "export function drawProceduralWall("
wall_start = text.index(marker)
head = text[:wall_start]
tail = text[wall_start:]
if tail.count(needle) < 1:
    raise SystemExit("wall strip-frame call not found")
tail = tail.replace(needle, replacement, 1)
path.write_text(head + tail)
print("patched drawProceduralWall")
