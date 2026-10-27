"""
Playwright probe for the running game — the sanctioned browser harness (git-tracked).

WHY: the reported illogic is a *ladder* one — "it researches Advanced Farming but
it is not building a farm", and gold is low at the start. The Node tests pin the
decision function; this drives the real dev build in a real browser with
Playwright (already used by `playtests/*.py` in this repo) and reads back what the
auto-player actually did, in order, from the game's own header tooltip.

USAGE
    node node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1
    python scripts/autoplay_playwright_probe.py
    python scripts/autoplay_playwright_probe.py --url http://127.0.0.1:5173/ --seconds 25
    # Ground look — the pixels the live app painted, one fresh game per preset, at a chosen zoom:
    python scripts/autoplay_playwright_probe.py --ground-presets "Islands,Meadows" --ground-zoom 0.5

Exits 0 when the farm is built before the research and the status line is visible; the
--ground-presets mode exits 0 after printing its table.
"""

from __future__ import annotations

import argparse
import json
import sys

from playwright.sync_api import sync_playwright

INFRASTRUCTURE_VISUAL_ZOOMS = (0.5, 0.75, 1.45)
INFRASTRUCTURE_VISUAL_LOAD_TIMEOUT_MS = 90000
INFRASTRUCTURE_VISUAL_ZOOM_TIMEOUT_MS = 15000
INFRASTRUCTURE_VISUAL_MIN_COLORS = 2

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


# What the live app actually painted on the ground canvas, for the preset the player chose.
# Water on this renderer is blue-dominant (the bathymetric ramp runs [104,182,206] … [13,46,88] and the
# river ramp [86,168,196] … [34,98,148]); no land swatch is (the greenest on the chart is [49,122,34]).
GROUND_STATS_JS = """
() => {
  const canvas = document.querySelector('canvas[aria-label="Valley map"]');
  if (!canvas) return { error: 'no Valley map canvas' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'the Valley map canvas has no 2d context' };
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0, blue = 0, green = 0;
  const seen = new Set();
  for (let i = 0; i < data.length; i += 16) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    r += pr; g += pg; b += pb; n++;
    if (pb > pg) blue++;
    else if (pg > pb + 20) green++;
    seen.add(((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4));
  }
  return {
    width: w, height: h, sampled: n,
    mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    blueShare: blue / n, greenShare: green / n, distinctColors: seen.size,
  };
}
"""


def selected_preset_label(page) -> str:
    """The preset card the setup screen currently marks selected, read from its own markup."""
    return page.evaluate(
        """() => {
          const card = document.querySelector('[aria-label="New settlement"] .ui-selected');
          if (!card) return '';
          const title = card.querySelector('span.block');
          return ((title ? title.textContent : card.textContent) || '').trim();
        }"""
    )


def choose_preset(page, label: str) -> bool:
    """Click a preset card inside the panel its owner headings: <h2>Choose your land</h2>."""
    return bool(
        page.evaluate(
            """(label) => {
              const heading = [...document.querySelectorAll('h2')]
                .find((h) => (h.textContent || '').trim().toLowerCase() === 'choose your land');
              if (!heading) return false;
              const scope = heading.closest('section') || document;
              const wanted = label.toLowerCase();
              const hit = [...scope.querySelectorAll('button')]
                .find((b) => (b.textContent || '').toLowerCase().includes(wanted));
              if (!hit) return false;
              hit.click();
              return true;
            }""",
            label.lower(),
        )
    )


def set_camera_zoom(page, preset: float) -> str:
    """Choose a camera zoom through the stage's own preset select (owner-authored aria-label)."""
    return page.evaluate(
        """(preset) => {
          const select = document.querySelector('select[aria-label="Zoom preset"]');
          if (!select) return 'no zoom preset control';
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(select, String(preset));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          const live = document.querySelector('[title="Live zoom"]');
          return live ? (live.textContent || '').trim() : 'set';
        }""",
        str(preset),
    )


def run_ground_look(args) -> int:
    """Measure the ground the live app paints, one fresh game per preset label."""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful)
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        errors: list[str] = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        print(f"ground look: {len(args.ground_presets)} preset(s), one fresh game each at {args.width}x{args.height}")
        print("")
        for label in args.ground_presets:
            page.goto(args.url, wait_until="load")
            wait_for(page, "() => !!document.querySelector('canvas')", "canvas")
            if not click_text(page, "skip intro"):
                click_text(page, "choose your land")
            wait_for(page, "() => document.body.textContent.includes('Settle the valley')", "map setup")
            requested = choose_preset(page, label)
            chosen = selected_preset_label(page)
            click_text(page, "settle the valley")
            wait_for(
                page,
                "() => /\\d{1,2}:\\d{2}/.test((document.querySelector('header')||{}).textContent||'')",
                "gameplay HUD",
                180000,
            )
            if page.evaluate("() => document.body.textContent.includes('Quick start')"):
                click_text(page, "skip")
            if args.ground_zoom:
                set_camera_zoom(page, args.ground_zoom)

            # The ground bakes under a per-frame pixel budget, so wait for the painted mean to settle.
            stats = page.evaluate(GROUND_STATS_JS)
            stable = 0
            for _ in range(30):
                page.wait_for_timeout(700)
                nxt = page.evaluate(GROUND_STATS_JS)
                stable = stable + 1 if nxt.get("mean") == stats.get("mean") else 0
                stats = nxt
                if stable >= 2:
                    break

            if stats.get("error"):
                print(f"{label:<14} ERROR {stats['error']}")
                continue
            print(
                f"{label:<14} requested={requested} chosen={chosen!r} "
                f"mean=rgb({','.join(str(v) for v in stats['mean'])}) "
                f"waterBlue={stats['blueShare'] * 100:5.1f}% landGreen={stats['greenShare'] * 100:5.1f}% "
                f"colours={stats['distinctColors']:5d} canvas={stats['width']}x{stats['height']}"
            )

        print("")
        if errors:
            print(f"console errors ({len(errors)}):")
            for error in errors[:10]:
                print(f"   ! {error}")
        else:
            print("console errors: none")
        browser.close()
    return 0


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


def run_warfare_smoke(args) -> int:
    """Observe saved warfare UI through the normal Load saved game flow."""
    from pathlib import Path
    payload = Path(args.warfare_save).read_text(encoding="utf8")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful,
            executable_path=args.browser_executable or None,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": args.width, "height": args.height}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('ecosim_save', " + json.dumps(payload) + ");")
        page.goto(args.url, wait_until="load")
        if not click_text(page, "skip intro"):
            click_text(page, "choose your land")
        wait_for(page, "() => document.body.textContent.includes('Settle the valley')", "map setup")
        if not click_text(page, "load saved game"):
            raise RuntimeError("Load saved game was not available")
        if args.warfare_mode == "terminal":
            dialog = page.get_by_role("dialog", name="Settlement fallen", exact=True)
            dialog.wait_for(state="visible", timeout=90000)
            for label in ["Export final save", "View / export Chronicle", "Export & start new village", "Return to main menu"]:
                if dialog.get_by_role("button", name=label, exact=True).count() != 1:
                    raise RuntimeError("Missing terminal action: " + label)
            with page.expect_download() as download:
                dialog.get_by_role("button", name="Export final save", exact=True).click()
            observed = {"heading": dialog.get_by_role("heading").inner_text(),
                "export": download.value.suggested_filename, "actions": dialog.get_by_role("button").all_text_contents()}
        elif args.warfare_mode == "raze":
            fate = page.get_by_role("button", name="Decide fate of", exact=False)
            fate.wait_for(state="visible", timeout=90000)
            fate.click()
            dialog = page.get_by_role("dialog", name="Battle report", exact=True)
            dialog.get_by_role("button", name="Raze settlement…", exact=True).click()
            dialog.get_by_role("button", name="Confirm raze", exact=True).wait_for(state="visible")
            dialog.get_by_role("button", name="Cancel", exact=True).click()
            if dialog.get_by_role("button", name="Confirm raze", exact=True).count():
                raise RuntimeError("Cancel did not dismiss raze confirmation")
            dialog.get_by_role("button", name="Raze settlement…", exact=True).click()
            dialog.get_by_role("button", name="Confirm raze", exact=True).click()
            dialog.wait_for(state="hidden")
            fate.wait_for(state="hidden")
            click_text(page, "menu")
            with page.expect_download() as download:
                if not click_text(page, "save game"):
                    raise RuntimeError("Save game action unavailable")
            export_path = Path(args.warfare_save).parent / "raze-result.json"
            download.value.save_as(str(export_path))
            result = json.loads(export_path.read_text(encoding="utf8"))
            rival_id = json.loads(payload)["pendingRaidVictories"][0]["rivalId"]
            if any(rival["id"] == rival_id for rival in result["rivalSettlements"]):
                raise RuntimeError("Confirmed razing did not remove the settlement from the exported save")
            if any(entry["rivalId"] == rival_id for entry in result.get("pendingRaidVictories", [])):
                raise RuntimeError("Confirmed razing left a pending victory decision")
            observed = {"confirmation": "shown, cancelled, then confirmed", "settlement_removed_from_export": True,
                "pending_decision_cleared": True}
        elif args.warfare_mode == "captives":
            page.get_by_role("button", name="Prisoners of war (1)", exact=True).click(timeout=90000)
            dialog = page.get_by_role("dialog", name="Prisoners of war", exact=True)
            dialog.wait_for(state="visible")
            dialog.get_by_role("button", name="Execute", exact=True).click()
            dialog.get_by_role("button", name="Confirm", exact=True).wait_for(state="visible")
            dialog.get_by_role("button", name="Cancel", exact=True).click()
            dialog.get_by_role("button", name="Release · mercy +3 reputation", exact=True).click()
            dialog.get_by_text("No identifiable combatants remain in captivity.", exact=True).wait_for(state="visible")
            observed = {"heading": dialog.get_by_role("heading", level=2).inner_text(), "execution_confirmation": "shown and cancelled",
                "release": dialog.get_by_text("No identifiable combatants remain in captivity.", exact=True).inner_text()}
        else:
            heading = page.get_by_role("heading", name="Village recovery", exact=True)
            heading.wait_for(state="visible", timeout=90000)
            observed = {"heading": heading.inner_text(), "panel": heading.locator("..").inner_text()}
        if args.warfare_screenshot:
            page.screenshot(path=args.warfare_screenshot)
        observed["page_errors"] = errors
        print(json.dumps(observed))
        browser.close()
        return 1 if errors else 0


def run_indoor_smoke(args) -> int:
    """Load an actual indoor-patient save through the normal game UI."""
    from pathlib import Path
    payload = Path(args.indoor_save).read_text(encoding="utf8")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful,
            executable_path=args.browser_executable or None,
            args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('ecosim_save', " + json.dumps(payload) + ");")
        page.goto(args.url + ("&" if "?" in args.url else "?") + "indoorSmoke=1", wait_until="load")
        if not click_text(page, "skip intro"):
            click_text(page, "choose your land")
        wait_for(page, "() => document.body.textContent.includes('Settle the valley')", "map setup")
        if not click_text(page, "load saved game"):
            raise RuntimeError("Load saved game was unavailable")
        page.locator("canvas").first.wait_for(state="visible", timeout=90000)
        page.wait_for_function("() => !!document.querySelector('header')", timeout=90000)
        click_text(page, "got it")
        observation_js = """() => {
          const raw = document.querySelector('header')?.getAttribute('data-indoor-patients');
          return raw ? JSON.parse(raw) : null;
        }"""
        page.wait_for_function("""() => {
          const raw = document.querySelector('header')?.getAttribute('data-indoor-patients');
          if (!raw) return false;
          return JSON.parse(raw).patients.some((patient) => patient.hospitalId !== null
            && patient.indoorBuildingId === patient.hospitalId);
        }""", timeout=15000)
        observation = page.evaluate(observation_js)
        patients = observation.get("patients", []) if observation else []
        admitted = [patient for patient in patients if patient["hospitalId"] is not None
                    and patient["indoorBuildingId"] == patient["hospitalId"]]
        if not admitted:
            browser.close()
            raise RuntimeError("No observed indoor hospital patient: " + json.dumps(observation))
        if args.indoor_screenshot:
            page.screenshot(path=args.indoor_screenshot)
        print(json.dumps({"loaded_saved_patient": bool(admitted), "observation": observation, "canvas_count": page.locator("canvas").count(), "page_errors": errors}))
        browser.close()
        return 1 if errors else 0


def run_infrastructure_visual(args) -> int:
    """Inspect infrastructure through the existing saved-game UI at several zoom levels."""
    from pathlib import Path
    payload = Path(args.infrastructure_save).read_text(encoding="utf8")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True,
            executable_path=args.browser_executable or None,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"])
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script("localStorage.setItem('ecosim_save', " + json.dumps(payload) + ");")
        page.goto(args.url, wait_until="load")
        if not click_text(page, "skip intro"):
            click_text(page, "choose your land")
        wait_for(page, "() => document.body.textContent.includes('Settle the valley')", "map setup")
        if not click_text(page, "load saved game"):
            raise RuntimeError("Load saved game was unavailable")
        page.locator('canvas[aria-label="Valley map"]').wait_for(state="visible", timeout=INFRASTRUCTURE_VISUAL_LOAD_TIMEOUT_MS)
        page.wait_for_function("() => !!document.querySelector('header')", timeout=INFRASTRUCTURE_VISUAL_LOAD_TIMEOUT_MS)
        click_text(page, "got it")
        click_text(page, "skip")
        observed = []
        for zoom in INFRASTRUCTURE_VISUAL_ZOOMS:
            label = set_camera_zoom(page, zoom)
            page.wait_for_function("""(zoom) => {
                const label = document.querySelector('[title="Live zoom"]');
                return label && Math.abs(parseFloat(label.textContent) - zoom * 100) < 1;
            }""", arg=zoom, timeout=INFRASTRUCTURE_VISUAL_ZOOM_TIMEOUT_MS)
            page.evaluate("() => document.fonts.ready")
            stats = page.evaluate(GROUND_STATS_JS)
            if stats.get("error") or stats.get("distinctColors", 0) < INFRASTRUCTURE_VISUAL_MIN_COLORS:
                raise RuntimeError("Infrastructure canvas did not paint: " + json.dumps(stats))
            page.screenshot(path=f"{args.infrastructure_screenshot_prefix}-{zoom}.png")
            observed.append({"zoom": zoom, "label": label, "canvas": stats})
        print(json.dumps({"infrastructure_visual": observed, "page_errors": errors}))
        browser.close()
        return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:5173/")
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--speed", default="10x")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument(
        "--ground-presets",
        default="",
        help="comma-separated preset labels (e.g. 'Islands,Meadows,Arabia'): start a fresh game on each "
             "and report the ground the live app painted on the Valley map canvas",
    )
    parser.add_argument(
        "--ground-zoom",
        type=float,
        default=0.0,
        help="camera zoom preset to measure the ground at (0 = leave the game's own default)",
    )
    parser.add_argument("--browser-executable", default="", help="Optional installed Chromium executable")
    parser.add_argument("--warfare-save", default="", help="Load a real warfare save and inspect the existing UI")
    parser.add_argument("--warfare-mode", choices=["recovery", "terminal", "captives", "raze"], default="recovery")
    parser.add_argument("--warfare-screenshot", default="", help="Optional screenshot of the observed warfare panel")
    parser.add_argument("--indoor-save", default="")
    parser.add_argument("--indoor-screenshot", default="")
    parser.add_argument("--infrastructure-save", default="")
    parser.add_argument("--infrastructure-screenshot-prefix", default="tmp/infrastructure")
    args = parser.parse_args()
    if args.infrastructure_save:
        return run_infrastructure_visual(args)
    if args.warfare_save:
        return run_warfare_smoke(args)
    if args.indoor_save:
        return run_indoor_smoke(args)
    if args.ground_presets:
        args.ground_presets = [p.strip() for p in args.ground_presets.split(",") if p.strip()]
        return run_ground_look(args)

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
