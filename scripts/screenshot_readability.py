"""Readability pass screenshots: capture the main reading surfaces after the type bump."""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "..", "playtest")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1366, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    page.goto("http://localhost:5173", wait_until="load", timeout=60000)
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{OUT}/01-intro.png", full_page=False)

    page.get_by_role("button", name="Choose your land").first.wait_for(state="visible", timeout=45000)
    page.get_by_role("button", name="Choose your land").first.click(timeout=5000, force=True)
    page.get_by_role("button", name="Settle the valley").first.wait_for(state="visible", timeout=20000)
    page.screenshot(path=f"{OUT}/02-mapsetup.png", full_page=False)
    page.get_by_role("button", name="Settle the valley").first.click(timeout=5000, force=True)
    page.locator("canvas").first.wait_for(state="visible", timeout=20000)

    for label in ["Skip", "Got it"]:
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=2000, force=True)
                page.wait_for_timeout(500)
        except Exception:
            pass
    page.wait_for_timeout(6000)

    page.screenshot(path=f"{OUT}/03-game-default.png", full_page=False)

    # Build catalog (left panel) — toggle with B
    page.keyboard.press("b")
    page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/04-build-panel.png", full_page=False)
    page.keyboard.press("b")
    page.wait_for_timeout(400)

    # Log tab → chronicle
    page.get_by_role("button", name="Log").first.click(timeout=3000, force=True)
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/05-log-chronicle.png", full_page=False)

    # More tab → guide (reading-heavy)
    page.get_by_role("button", name="More").first.click(timeout=3000, force=True)
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/06-more-guide.png", full_page=False)

    # Progress tab → research
    page.get_by_role("button", name="Progress").first.click(timeout=3000, force=True)
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/07-progress-research.png", full_page=False)

    print("screenshots ->", OUT)
    print("console errors:", errors)
    browser.close()
