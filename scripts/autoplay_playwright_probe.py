"""
Temporary Playwright probe (local-only, gitignored, safe to delete).

WHY: the reported illogic is a *ladder* one — "it researches Advanced Farming but
it is not building a farm", and gold is low at the start. The Node tests pin the
decision function; this drives the real dev build in a real browser with
Playwright (already used by `playtests/*.py` in this repo) and reads back what the
auto-player actually did, in order, from the game's own header tooltip.

USAGE
    node node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1
    python scripts/autoplay_playwright_probe.py
    python scripts/autoplay_playwright_probe.py --url http://127.0.0.1:5173/ --seconds 25

Exits 0 when the farm is built before the research and the status line is visible.
"""

from __future__ import annotations

import argparse
import json
import sys

from playwright.sync_api import sync_playwright

# Everything the header can tell us about the bot and the treasury.
STATE_JS = """
() => {
  const buttons = [...document.querySelectorAll('header button')];
  const toggle = buttons.find((b) => (b.textContent || '').toLowerCase().includes('auto-play'));
  const chip = [...document.querySelectorAll('header div')]
    .find((d) => (d.getAttribute('title') || '').startsWith('Virtual player'));
  const statusEl = chip
    ? [...chip.querySelectorAll('span')]
        .find((s) => (s.textContent || '').trim().startsWith('auto-player:'))
    : null;
  const rect = statusEl ? statusEl.getBoundingClientRect() : null;
  const style = statusEl ? getComputedStyle(statusEl) : null;
  const title = chip ? chip.getAttribute('title') || '' : '';
  const headerText = (document.querySelector('header')?.textContent || '').replace(/\\s+/g, ' ');
  // ResourceBadge renders title="Gold 80 / 1000".
  const goldEl = [...document.querySelectorAll('header *')]
    .find((el) => (el.getAttribute('title') || '').startsWith('Gold '));
  const goldMatch = goldEl ? (goldEl.getAttribute('title') || '').match(/Gold (\\d+)/) : null;
  return {
    pressed: toggle ? toggle.getAttribute('aria-pressed') : null,
    status: statusEl ? (statusEl.textContent || '').trim() : null,
    statusVisible: !!rect && !!style && style.display !== 'none' && rect.width > 0,
    acts: title.split('\\n').filter((line) => /^t\\d+ · /.test(line)),
    gold: goldMatch ? Number(goldMatch[1]) : null,
    headerText,
  };
}
"""


def click_text(page, text: str) -> bool:
    """Click the first <button> whose text contains `text` (case-insensitive)."""
    return bool(
        page.evaluate(
            """(wanted) => {
              const buttons = [...document.querySelectorAll('button')];
              const hit = buttons.find((b) =>
                (b.textContent || '').toLowerCase().includes(wanted));
              if (!hit) return false;
              hit.click();
              return true;
            }""",
            text.lower(),
        )
    )


def wait_for(page, expression: str, label: str, timeout_ms: int = 40000) -> None:
    page.wait_for_function(expression, timeout=timeout_ms, polling=250)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:5173/")
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--speed", default="10x")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful)
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        errors: list[str] = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        page.goto(args.url, wait_until="load")
        wait_for(page, "() => !!document.querySelector('canvas')", "canvas")
        if not click_text(page, "skip intro"):
            click_text(page, "choose your land")
        wait_for(page, "() => document.body.textContent.includes('Settle the valley')", "map setup")
        click_text(page, "settle the valley")
        wait_for(
            page,
            "() => /\\d{1,2}:\\d{2}/.test((document.querySelector('header')||{}).textContent||'')",
            "gameplay HUD",
        )
        if page.evaluate("() => document.body.textContent.includes('Quick start')"):
            click_text(page, "skip")
            wait_for(page, "() => !document.body.textContent.includes('Quick start')", "tutorial closed", 10000)

        click_text(page, args.speed)
        before = page.evaluate(STATE_JS)
        gold_before = before["gold"]
        print(f"before auto-play : pressed={before['pressed']} gold={gold_before}")

        if not click_text(page, "auto-play"):
            print("FAIL: the Auto-play button was not found (dev build only)")
            browser.close()
            return 1

        # Watch the header; the tooltip lists every act as "t<ticks> · <reason>".
        history: list[str] = []
        status_seen: list[str] = []
        state = None
        seen_ticks: set[int] = set()
        import time

        deadline = time.time() + args.seconds
        gold_after = None
        while time.time() < deadline:
            page.wait_for_timeout(500)
            state = page.evaluate(STATE_JS)
            if state["status"] and state["status"] not in status_seen:
                status_seen.append(state["status"])
            for act in state["acts"]:
                # Newest first; keep one entry per act tick.
                tick = int(act.split(" ")[0][1:])
                if tick not in seen_ticks:
                    seen_ticks.add(tick)
                    history.append(act)
            if state["gold"] is not None:
                gold_after = state["gold"]

        # Oldest act first, for the ordering question.
        ordered = sorted(history, key=lambda act: int(act.split(" ")[0][1:]))
        print("")
        print("--- observed ---")
        print(f"viewport            : {args.width}x{args.height}")
        print(f"aria-pressed        : {state['pressed']}")
        print(f"status element      : {state['status']!r} visible={state['statusVisible']}")
        print(f"distinct statuses   : {json.dumps(status_seen, ensure_ascii=False)}")
        print(f"gold (header)       : {gold_before} -> {gold_after}")
        print(f"acts ({len(ordered)}):")
        for act in ordered:
            print(f"   {act}")

        reasons = []
        if state["pressed"] != "true":
            reasons.append("the toggle never turned on")
        if not state["statusVisible"]:
            reasons.append("the status line is not visible")
        if len(ordered) < 3:
            reasons.append(f"only {len(ordered)} act(s) observed")
        farm_index = next((i for i, a in enumerate(ordered) if "build a Farm" in a), None)
        research_index = next((i for i, a in enumerate(ordered) if "research" in a), None)
        if farm_index is None:
            reasons.append("no 'build a Farm' act was reported")
        elif research_index is not None and research_index < farm_index:
            reasons.append("a research act was reported before the farm")

        print("")
        if reasons:
            print(f"VERDICT: FAIL — {'; '.join(reasons)}")
        else:
            print("VERDICT: PASS — the bot built a farm before it researched farm technology")
        if errors:
            print(f"console errors ({len(errors)}):")
            for error in errors[:8]:
                print(f"   ! {error}")
        browser.close()
        return 1 if reasons else 0


if __name__ == "__main__":
    sys.exit(main())
