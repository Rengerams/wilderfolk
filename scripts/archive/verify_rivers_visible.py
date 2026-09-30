"""Full-game verification: settle, zoom out fully, navigate to the river,
then render the whole main canvas as ASCII to see if water shows."""
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

    def click(label, verify):
        loc = page.get_by_role("button", name=label).first
        loc.wait_for(state="visible", timeout=45000)
        loc.click(timeout=5000, force=True)
        page.locator(verify).first.wait_for(state="visible", timeout=20000)

    click("Choose your land", "text=Settle the valley")
    click("Settle the valley", "canvas")
    page.wait_for_timeout(4000)
    for label in ["Skip", "Got it"]:
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count():
                btn.first.click(timeout=2000, force=True)
                page.wait_for_timeout(500)
        except Exception:
            pass
    page.wait_for_timeout(8000)

    # Zoom out to minimum so the whole map is visible
    try:
        page.select_option("#camera-zoom-preset", "0.5")
    except Exception:
        page.get_by_label("Zoom preset").select_option("0.5")
    page.wait_for_timeout(2000)

    river = page.evaluate(
        """() => {
          const canvas = document.querySelector('.minimap-frame canvas');
          const ctx = canvas.getContext('2d');
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = img.data;
          let sx = 0, sy = 0, n = 0;
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              const r = d[i], g = d[i+1], b = d[i+2];
              if (Math.abs(r - 59) < 25 && Math.abs(g - 130) < 25 && Math.abs(b - 168) < 25) {
                sx += x; sy += y; n++;
              }
            }
          }
          return n ? { cx: sx / n, cy: sy / n, n } : null;
        }"""
    )
    print("river pixels on minimap:", river["n"] if river else 0)

    # Navigate camera to the river
    if river:
        rect = page.locator(".minimap-frame canvas").bounding_box()
        px = rect["x"] + (river["cx"] + 0.5) * rect["width"] / 152
        py = rect["y"] + (river["cy"] + 0.5) * rect["height"] / 110
        page.mouse.click(px, py)
        page.wait_for_timeout(6000)

    # Render the whole main canvas
    out = page.evaluate(
        """() => {
          const canvas = document.querySelector('canvas.map-canvas');
          const ctx = canvas.getContext('2d');
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = img.data;
          let blue = 0, total = 0;
          const cs = 6;
          const rows = [];
          for (let y = 0; y < img.height; y += cs) {
            let row = '';
            for (let x = 0; x < img.width; x += cs) {
              const i = (y * img.width + x) * 4;
              const r = d[i], g = d[i+1], b = d[i+2];
              total++;
              if (b > g + 10 && b > r + 10) {
                blue++;
                row += 'B';
              } else if (g > r && g > b) row += 'g';
              else if (r > 130 && g > 110 && b < r) row += 's';
              else if (r + g + b < 120) row += '.';
              else row += '-';
            }
            rows.push(row);
          }
          return { rows: rows.join('\\n'), blue, total, w: img.width, h: img.height };
        }"""
    )
    print(f"strong-blue pixels (b>g+10): {out['blue']} of {out['total']} (canvas {out['w']}x{out['h']})")
    print(out["rows"])
    print("console errors:", errors)
    browser.close()
