"""Live, reproducible terrain-art acceptance screenshots for review of PR #79.

Run against Vite preview after assets are preloaded. This verifies the page
rendered real terrain pixels and all authored albedos are HTTP-decodable.
Screenshots are actual Chromium gameplay, not mocked paintings.
"""
from __future__ import annotations

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
        page = browser.new_page(viewport={"width": 1200, "height": 760},
                                device_scale_factor=1, reduced_motion="reduce")
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))
        assets = inspect_albedos_after_visit = None
        for preset in PRESETS:
            page.goto(BASE_URL, wait_until="load")
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
            slug = preset.lower().replace(" ", "-")
            screenshot = OUT / f"{slug}.jpg"
            page.screenshot(path=str(screenshot), type="jpeg", quality=74)
            report.append({"preset": preset, "selected": chosen, "zoom": zoom,
                           "stats": stats, "screenshot": str(screenshot)})
            print(f"{preset}: {stats['distinctColors']} colors, {stats['mean']} mean, {screenshot}", flush=True)
        (OUT / "REPORT.json").write_text(
            json.dumps({"scenes": report, "assets": assets, "pageErrors": page_errors},
                       indent=2) + "\n", encoding="utf-8"
        )
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
