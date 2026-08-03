"""Verify the Pixi canvas actually renders content (not blank)."""
import os, struct, zlib
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "playtest")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    def click(label, verify, step):
        loc = page.get_by_role("button", name=label).first
        loc.wait_for(state="visible", timeout=45000)
        loc.click(timeout=5000, force=True)
        page.locator(verify).first.wait_for(state="visible", timeout=20000)
        print("[" + step + "] ok")

    page.goto("http://localhost:5173", wait_until="load", timeout=60000)
    page.wait_for_timeout(2500)
    click("Choose your land", "text=Settle the valley", "mapsetup")
    click("Settle the valley", "canvas", "settled")
    page.wait_for_timeout(4000)
    for label in ["Skip", "Got it"]:
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=2000, force=True)
                page.wait_for_timeout(500)
        except Exception:
            pass
    page.wait_for_timeout(7000)

    # screenshot the pixi canvas element (index 0) directly
    pixi = page.locator("canvas").nth(0)
    pixi.screenshot(path=os.path.join(OUT, "pixi_layer.png"))
    print("pixi screenshot saved")

    # sample pixels of that PNG (RGB)
    data = open(os.path.join(OUT, "pixi_layer.png"), "rb").read()
    pos = 8; w = h = None; ctype = None; idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8].decode()
        if typ == "IHDR":
            w, h, _, ctype = struct.unpack(">IIBB", data[pos + 8:pos + 18])
        elif typ == "IDAT":
            idat += data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {2: 3, 6: 4}[ctype]
    def px(x, y):
        i = y * (1 + w * ch) + 1 + x * ch
        return raw[i], raw[i + 1], raw[i + 2]
    samples = [px(w // 2, h // 2), px(w // 4, h // 2), px(w // 2, h // 4), px(w // 3, h // 3)]
    print(f"pixi canvas {w}x{h} samples:", samples)
    print("console errors:", errors)
    browser.close()
