"""Pixi Fase B check: init, canvas present, zero console errors, renders."""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "playtest")
os.makedirs(OUT, exist_ok=True)
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    def click(label, verify, step):
        loc = page.get_by_role("button", name=label).first
        loc.wait_for(state="visible", timeout=45000)
        loc.click(timeout=5000, force=True)
        page.locator(verify).first.wait_for(state="visible", timeout=20000)
        print(f"[{step}] ok")

    page.goto("http://localhost:5173", wait_until="load", timeout=60000)
    page.wait_for_timeout(2500)
    click("Choose your land", "text=Settle the valley", "mapsetup")
    click("Settle the valley", "canvas", "settled")
    page.wait_for_timeout(4000)
    for label in ["Skip", "Got it"]:
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=2000, force=True); page.wait_for_timeout(500)
        except Exception:
            pass
    page.wait_for_timeout(6000)

    # how many canvases + which has a pixi marker
    info = page.evaluate("""() => {
        const cs = [...document.querySelectorAll('canvas')].map(c => ({
            w: c.width, h: c.height,
            hasWebgl: !!(c.getContext && (c.getContext('webgl2') || c.getContext('webgl'))),
            id: c.id || '',
        }));
        return cs;
    }""")
    print("canvases:", info)

    # sample the game canvas pixels (the overlay/input canvas, top)
    canvas_info = page.evaluate("""() => {
        const cs = document.querySelectorAll('canvas');
        const c = cs[cs.length - 1]; // topmost = original input canvas
        if (!c) return null;
        const ctx = c.getContext('2d');
        const pts = [[c.width/2, c.height/2],[c.width/4, c.height/2],[c.width/2, c.height/4]];
        return pts.map(([x,y]) => { try { const d = ctx.getImageData(x|0,y|0,1,1).data; return [d[0],d[1],d[2]]; } catch(e) { return 'ERR'; } });
    }""")
    print("top canvas px:", canvas_info)

    page.screenshot(path=os.path.join(OUT, "pixi_map.png"))
    print("console errors:", errors)
    browser.close()
