"""In-browser pixel read of the pixi canvas via toDataURL (bypasses headless artifact)."""
import os, base64, struct, zlib, collections
from playwright.sync_api import sync_playwright

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
    page.wait_for_timeout(6000)

    data = page.evaluate("""() => {
        const c = document.querySelectorAll('canvas')[0]; // pixi canvas
        try { return c.toDataURL('image/png'); } catch(e) { return 'ERR:' + e.message; }
    }""")
    if data.startswith("ERR"):
        print(data)
    else:
        b64 = data.split(",", 1)[1]
        rawpng = base64.b64decode(b64)
        pos = 8; w = h = None; ctype = None; idat = b""
        while pos < len(rawpng):
            ln = struct.unpack(">I", rawpng[pos:pos+4])[0]
            typ = rawpng[pos+4:pos+8].decode()
            if typ == "IHDR": w, h, _, ctype = struct.unpack(">IIBB", rawpng[pos+8:pos+18])
            elif typ == "IDAT": idat += rawpng[pos+8:pos+8+ln]
            pos += 12 + ln
        raw = zlib.decompress(idat)
        ch = {2:3, 6:4}[ctype]
        def px(x, y):
            i = y*(1+w*ch)+1+x*ch
            return raw[i], raw[i+1], raw[i+2]
        counts = collections.Counter()
        ws = wd = 0
        for y in range(0, h, 6):
            for x in range(0, w, 6):
                r,g,b = px(x,y)
                counts[(r//24*24, g//24*24, b//24*24)] += 1
                if 100<=r<=160 and 175<=g<=225 and 195<=b<=245: ws += 1
                elif 45<=r<=100 and 105<=g<=165 and 145<=b<=205: wd += 1
        print(f"pixi canvas {w}x{h} water shallow:{ws} deep:{wd}")
        for c, n in counts.most_common(8): print("  ", c, n)
    print("console errors:", errors)
    browser.close()
