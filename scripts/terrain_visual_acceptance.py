"""Live, reproducible terrain-art acceptance screenshots for review of PR #79.

Run against Vite preview after assets are preloaded. This verifies the page
rendered real terrain pixels and all authored albedos are HTTP-decodable.
Screenshots are actual Chromium gameplay, not mocked paintings.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright
from autoplay_playwright_probe import (
    GROUND_STATS_JS, choose_preset, selected_preset_label,
    click_text, set_camera_zoom, wait_for,
)

BASE_URL = os.environ.get("WILDERFOLK_BASE_URL", "http://127.0.0.1:4173/")
OUT = Path("docs/terrain-qa")
PRESETS = ("Meadows", "Black Forest", "Arabia", "Highland", "Scandinavia")
ALBEDOS = tuple(
    f"/sprites/terrain/cethiel/Dirt_0{i}.png" for i in (1, 2, 4)
) + tuple(
    f"/sprites/terrain/cethiel/Grass_0{i}.png" for i in (1, 2, 3, 4)
) + (
    "/sprites/terrain/rubberduck/206.jpg",
    "/sprites/terrain/rubberduck/232.jpg",
)


def inspect_albedos(page) -> list[dict]:
    """Check actual browser fetch and image decoding, never just source paths."""
    return page.evaluate("""async (paths) => {
      const results = [];
      for (const path of paths) {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Failed terrain asset: ' + path);
        const bitmap = await createImageBitmap(await response.blob());
        if (bitmap.width < 256 || bitmap.height < 256)
          throw new Error('Tiny or invalid terrain material: ' + path);
        results.push({path, width: bitmap.width, height: bitmap.height});
        bitmap.close();
      }
      return results;
    }""", list(ALBEDOS))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    page_errors: list[str] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader"],
        )
        assets = None
        for preset in PRESETS:
            # A fresh browser context per map avoids the running simulation's
            # unload/network listeners blocking the next map's load event.
            page = browser.new_page(viewport={"width": 1200, "height": 760},
                                    device_scale_factor=1, reduced_motion="reduce")
            page.set_default_navigation_timeout(120000)
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            # Run the real game with its supported "tutorials off" preference.
            # Clicking hidden tutorial controls after startup was unreliable:
            # the contextual card could reappear after terrain finished baking.
            page.add_init_script("""localStorage.setItem('wilderfolk-tutorials-enabled', '0');
localStorage.setItem('wilderfolk-tutorial-choice', '0');""")
            page.goto(BASE_URL, wait_until="domcontentloaded", timeout=120000)
            if assets is None:
                assets = inspect_albedos(page)
            wait_for(page, "() => !!document.querySelector('canvas')", "canvas")
            if not click_text(page, "skip intro"):
                click_text(page, "choose your land")
            wait_for(page, "() => document.body.textContent.includes('Settle the valley')",
                     "map setup", 60000)
            selected = choose_preset(page, preset)
            if not selected:
                raise RuntimeError(f"Preset {preset!r} was not available")
            chosen = selected_preset_label(page)
            if not click_text(page, "settle the valley"):
                raise RuntimeError("Could not settle the valley")
            wait_for(page,
                     "() => /\\d{1,2}:\\d{2}/.test((document.querySelector('header')||{}).textContent||'')",
                     "gameplay HUD", 120000)
            if page.evaluate("() => document.body.textContent.includes('Quick start')"):
                click_text(page, "skip")
            # The first capture had tutorial cards hiding the terrain. Above,
            # browser storage disables tutorials through the same public user
            # preference the options screen uses; no CSS masking or mocked frame.
            for _ in range(3):
                click_text(page, "turn off all tutorials")
                click_text(page, "got it")
                click_text(page, "skip guide")
            # Restrict this to an actually visible contextual tip. The generic
            # click_text helper also finds hidden modal buttons and reported
            # success without dismissing the card in the previous screenshot.
            for _ in range(8):
                disable = page.get_by_role("button", name="Turn off all tutorials", exact=True)
                if disable.count() and disable.first.is_visible():
                    disable.first.click()
                tip = page.locator('button[aria-label="Dismiss tip"]')
                if tip.count() and tip.first.is_visible():
                    tip.first.click()
                page.wait_for_timeout(250)
                if tip.count() == 0:
                    break
            # The default building grid is ON even outside build mode; its
            # orthogonal lines must not be mistaken for a mesh seam. Evaluate
            # natural ground with the grid switched OFF through the real UI.
            grid = page.locator('button[aria-label="Hide building grid"]')
            if grid.count():
                grid.click()
            zoom = 0.75
            set_camera_zoom(page, zoom)
            stats = page.evaluate(GROUND_STATS_JS)
            stable = 0
            for _ in range(25):
                page.wait_for_timeout(700)
                nxt = page.evaluate(GROUND_STATS_JS)
                stable = stable + 1 if nxt.get("mean") == stats.get("mean") else 0
                stats = nxt
                if stable >= 3 and stats.get("distinctColors", 0) >= 60:
                    break
            if stats.get("error") or stats.get("distinctColors", 0) < 60:
                raise RuntimeError(f"{preset}: terrain did not paint: {stats}")
            if page_errors:
                raise RuntimeError(f"Browser exception on {preset}: {page_errors}")
            if page.locator('button[aria-label="Dismiss tip"]').count() > 0:
                raise RuntimeError(f"{preset}: tutorial still obscures the visual acceptance screenshot")
            slug = preset.lower().replace(" ", "-")
            screenshot = OUT / f"{slug}.jpg"
            # Capture the *actual* game canvas without overlapping notification
            # and tutorial DOM panels; no synthetic scene or custom rendering.
            encoded = page.evaluate("""() => {
              const canvas = document.querySelector('canvas[aria-label="Valley map"]');
              if (!canvas) throw new Error('Valley map canvas not found');
              return canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
            }""")
            screenshot.write_bytes(base64.b64decode(encoded))
            report.append({"preset": preset, "selected": chosen, "zoom": zoom,
                           "stats": stats, "screenshot": str(screenshot)})
            print(f"{preset}: {stats['distinctColors']} colors, {stats['mean']} mean, {screenshot}", flush=True)
            page.close()
        (OUT / "REPORT.json").write_text(
            json.dumps({"scenes": report, "assets": assets, "pageErrors": page_errors},
                       indent=2) + "\n", encoding="utf-8"
        )
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
