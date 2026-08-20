"""Probe: boot the game, settle, skip tutorial, capture DOM + screenshot of initial state."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    page.goto("http://localhost:5173", wait_until="load", timeout=60000)
    page.wait_for_timeout(2500)
    page.screenshot(path="playtest/probe_intro.png", full_page=True)

    btn = page.get_by_role("button", name="Choose your land")
    btn.first.wait_for(state="visible", timeout=45000)
    btn.first.click(timeout=5000, force=True)
    page.locator("text=Settle the valley").first.wait_for(state="visible", timeout=20000)
    page.screenshot(path="playtest/probe_mapsetup.png", full_page=True)

    settle = page.get_by_role("button", name="Settle the valley")
    settle.first.click(timeout=5000, force=True)
    page.wait_for_timeout(4000)

    for label in ["Skip", "Got it"]:
        try:
            b = page.get_by_role("button", name=label)
            if b.count():
                b.first.click(timeout=2000, force=True)
                page.wait_for_timeout(500)
        except Exception:
            pass
    page.wait_for_timeout(5000)

    page.screenshot(path="playtest/probe_game.png", full_page=True)
    info = page.evaluate(
        "() => ({"
        " buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(t => t.length && t.length < 40).slice(0, 120),"
        " h3: [...document.querySelectorAll('h3')].map(h => h.innerText.trim()).slice(0, 20),"
        " bodyLen: document.body.innerText.length,"
        " })"
    )
    print("BUTTONS:", info["buttons"])
    print("H3:", info["h3"])
    print("bodyLen:", info["bodyLen"])
    print("console errors:", errors)
    browser.close()
