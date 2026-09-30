"""Overflow probe: scan sidebars/panels for horizontally-clipped text after the type bump."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1366, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

    page.goto("http://localhost:5173", wait_until="load", timeout=60000)
    page.wait_for_timeout(2500)
    page.get_by_role("button", name="Choose your land").first.wait_for(state="visible", timeout=45000)
    page.get_by_role("button", name="Choose your land").first.click(timeout=5000, force=True)
    page.get_by_role("button", name="Settle the valley").first.wait_for(state="visible", timeout=20000)
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

    def probe(scope_label):
        """Return elements whose text overflows their box horizontally."""
        return page.evaluate(
            """(label) => {
              const out = [];
              const check = (el) => {
                if (el.children.length === 0) return; // leaf only
                const hasText = (el.textContent || '').trim().length > 0;
                if (!hasText) return;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (cs.overflowX !== 'visible') return; // handled by own clipping
                const sw = el.scrollWidth, cw = el.clientWidth;
                if (sw > cw + 2) {
                  const t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
                  out.push({ label, el: el.tagName + '.' + (el.className || '').toString().split(' ').slice(0,3).join('.'),
                             sw, cw, text: t });
                }
              };
              const walk = (root) => {
                for (const el of root.querySelectorAll('*')) {
                  if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') {
                    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
                    out.push({ label, el: el.tagName + '.' + (el.className || '').toString().split(' ').slice(0,3).join('.'),
                               sw: el.scrollWidth, cw: el.clientWidth, text: t });
                  }
                }
              };
              walk(document.querySelector('aside'));        // right sidebar
              walk(document.querySelector('.build-panel')); // left panel
              return out;
            }""",
            scope_label,
        )

    results = []
    tabs = ["Village", "Frontier", "Nature", "Progress", "Log", "More"]
    for t in tabs:
        page.get_by_role("button", name=t).first.click(timeout=3000, force=True)
        page.wait_for_timeout(900)
        results.extend(probe(f"tab:{t}"))

    page.keyboard.press("b")  # open build panel
    page.wait_for_timeout(700)
    results.extend(probe("build-panel"))

    # dedupe by (label, el, text)
    seen = set()
    unique = []
    for r in results:
        key = (r["label"], r["el"], r["text"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    print(f"== overflow candidates: {len(unique)} ==")
    for r in unique[:40]:
        print(f"  [{r['label']}] {r['el']}  sw={r['sw']} cw={r['cw']}  '{r['text']}'")
    print("== console errors ==")
    for e in errors[:10]:
        print("  ", e)
    browser.close()
