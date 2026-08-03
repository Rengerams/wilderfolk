"""Probe: does the sim tick + does the entity layer repaint over time?"""
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
    page.wait_for_timeout(3000)

    def snap():
        info = page.evaluate("""() => {
            const body = document.body.innerText;
            const time = (body.match(/D\d+|\d{2}:\d{2}|Y\d/) || ['?'])[0];
            return { key: window.__pixiEntityKey || 'no-hook', time };
        }""")
        return info

    a = snap()
    page.wait_for_timeout(2500)
    b = snap()
    page.wait_for_timeout(2500)
    c = snap()
    print("t0:", a)
    print("t1:", b)
    print("t2:", c)
    print("key changed:", a["key"] != b["key"] or b["key"] != c["key"])
    print("console errors:", errors)
    browser.close()
