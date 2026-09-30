"""Full UI/UX menu validation for Wilderfolk.

Part A - walk every sidebar tab, subtab, and game-menu view; verify buttons respond.
Part B - workforce logic: build Leader's House + Church + Farm, then validate
         single workplace, anytime reassignment, Church manual staffing (max 4),
         and leader residency/work status.

Env: SKIP_PART_B=1 skips the long workforce section (quick menu walkthrough).
"""
import os
import sys
import json
from playwright.sync_api import sync_playwright

SKIP_PART_B = os.environ.get("SKIP_PART_B") == "1"
OUT = {}
ERRORS = []


def log(msg):
    print(msg, flush=True)


def save_partial():
    try:
        with open("playtest/validation_result.json", "w", encoding="utf-8") as f:
            json.dump(OUT, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("console", lambda m: ERRORS.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: ERRORS.append(f"PAGEERROR: {e}"))

    def snap(name):
        page.screenshot(path=f"playtest/val_{name}.png")

    def wait(ms):
        page.wait_for_timeout(ms)

    def click_role(label, step, timeout=15000):
        loc = page.get_by_role("button", name=label).first
        loc.wait_for(state="visible", timeout=timeout)
        loc.click(timeout=5000, force=True)
        wait(700)
        log(f"[ok] {step}")

    def try_click_role(label, step, timeout=6000):
        try:
            loc = page.get_by_role("button", name=label)
            if loc.count() == 0:
                log(f"[warn] {step}: no button '{label}'")
                return False
            loc.first.click(timeout=timeout, force=True)
            wait(600)
            log(f"[ok] {step}")
            return True
        except Exception as e:
            log(f"[FAIL] {step}: {e}")
            return False

    def canvas_box():
        return page.evaluate(
            "() => { const c = document.querySelector('canvas'); if (!c) return null;"
            " const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }"
        )

    def click_canvas(dx, dy, step):
        box = canvas_box()
        if not box:
            log(f"[FAIL] {step}: no canvas")
            return False
        page.mouse.click(box.x + box.w / 2 + dx, box.y + box.h / 2 + dy)
        wait(900)
        log(f"[ok] {step} (click canvas +({dx},{dy}))")
        return True

    def body_text():
        return page.evaluate("() => document.body.innerText")

    # ---------------- BOOT ----------------
    def boot():
        for attempt in range(3):
            try:
                page.goto("http://localhost:5173", wait_until="domcontentloaded", timeout=90000)
                page.get_by_role("button", name="Choose your land").first.wait_for(
                    state="visible", timeout=90000
                )
                return True
            except Exception as e:
                log(f"[warn] boot attempt {attempt + 1}: {e}")
                page.wait_for_timeout(4000)
        return False

    if not boot():
        log("[FAIL] could not boot the game (intro screen never appeared)")
        OUT["boot"] = "failed"
        OUT["console_errors"] = ERRORS
        print(json.dumps(OUT, ensure_ascii=False, indent=2))
        browser.close()
        sys.exit(1)

    wait(2500)
    click_role("Choose your land", "intro -> map setup", 45000)
    snap("mapsetup")
    try_click_role("Settle the valley", "map setup -> settle", 20000)
    wait(4000)
    for label in ["Skip", "Got it", "Skip guide"]:
        try_click_role(label, f"dismiss {label}", 2000)
    wait(3000)
    snap("boot")
    OUT["boot"] = "ok"

    # ---------------- PART A: SIDEBAR TABS ----------------
    tabs = ["Village", "Frontier", "Nature", "Progress", "Log", "More"]
    tab_results = {}
    for t in tabs:
        ok = try_click_role(t, f"tab {t}")
        tab_results[t] = "ok" if ok else "missing"
    # Village tab is the landing tab; ensure we end on it before subtabs
    try_click_role("Village", "tab Village (home)")

    # Progress subtabs
    for sub in ["Research", "Trade", "Goals", "Charts"]:
        try_click_role(sub, f"progress subtab {sub}")
    # Log subtabs
    for sub in ["Chronicle", "Combat"]:
        try_click_role(sub, f"log subtab {sub}")
    # More subtabs
    for sub in ["Guide", "Roadmap"]:
        try_click_role(sub, f"more subtab {sub}")
    snap("after_tabs")
    OUT["tabs"] = tab_results

    # ---------------- PART A: GAME MENU ----------------
    click_role("Menu", "open game menu", 15000)
    snap("menu_main")
    menu_results = {}
    for item in ["Settings", "Graphics", "Roadmap", "About"]:
        ok = try_click_role(item, f"menu view {item}")
        menu_results[item] = "ok" if ok else "missing"
        snap(f"menu_{item}")
        # back
        try_click_role("Back to main menu", f"back from {item}", 3000)
    # Settings toggles
    click_role("Settings", "menu Settings", 10000)
    for toggle in ["Auto-save", "Tutorials", "Show sim tick"]:
        # click toggle twice: on then off (or single if unstable)
        try_click_role(toggle, f"settings toggle {toggle} on", 3000)
        try_click_role(toggle, f"settings toggle {toggle} off", 3000)
    # Sound + volume
    for v in ["Soft", "Normal", "Loud"]:
        try_click_role(v, f"volume {v}", 3000)
    try_click_role("Sound on", "sound toggle", 3000)
    try_click_role("Muted", "sound toggle back", 3000)
    # Graphics toggle
    click_role("Graphics", "menu Graphics", 10000)
    try_click_role("Screen effects", "graphics toggle", 3000)
    try_click_role("Screen effects", "graphics toggle back", 3000)
    # About -> Open full guide
    click_role("About", "menu About", 10000)
    try_click_role("Open full guide", "about open guide", 5000)
    wait(1500)
    snap("guide")
    page.keyboard.press("Escape")
    wait(600)
    page.keyboard.press("Escape")
    wait(600)
    snap("menu_closed")
    OUT["menu"] = menu_results

    # ---------------- PART A: INSPECTOR / CITIZEN ----------------
    # Village -> Families -> click first citizen -> inspector panel opens
    try_click_role("Families", "open Families section", 8000)
    wait(1200)
    snap("families")
    fam = page.evaluate(
        "() => { const btns = [...document.querySelectorAll('button')]"
        ".filter(b => /Citizen|👤|👨|👩|👑/.test(b.innerText));"
        " return btns.slice(0, 8).map(b => b.innerText.trim().replace(/\\n+/g, ' | ')); }"
    )
    log("[info] family rows: " + json.dumps(fam, ensure_ascii=False))
    # try clicking the first family row button that looks like a person
    clicked = page.evaluate(
        "() => { const btns = [...document.querySelectorAll('button')]"
        ".filter(b => /👤|👨|👩|👑/.test(b.innerText) && b.innerText.trim().length > 1);"
        " if (btns.length === 0) return false; btns[0].click(); return true; }"
    )
    wait(1200)
    snap("inspector_citizen")
    OUT["citizen_clicked"] = clicked
    txt = body_text()
    # capture any "Works at:" / "Lives in:" / "Village head" lines
    import re
    OUT["citizen_panel_lines"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Village head|Works at|Lives in|No home|No job|💼|🔨|👑", ln)
    ][:20]

    # ---------------- PART B: WORKFORCE ----------------
    save_partial()
    OUT["workforce"] = {}
    if SKIP_PART_B:
        log("[info] SKIP_PART_B=1 — skipping workforce validation")
        OUT["workforce"]["skipped"] = True
        OUT["console_errors"] = ERRORS
        print(json.dumps(OUT, ensure_ascii=False, indent=2))
        save_partial()
        browser.close()
        sys.exit(0)
    try_click_role("10x", "set speed 10x", 5000)

    def pick_building(label, step, exclude=None):
        """Open catalog category and click the building button containing `label`
        (scoped to the build panel; optional exclude regex to disambiguate)."""
        # ensure build panel open
        toggle = page.locator('button[title="Expand build panel (B)"]')
        if toggle.count():
            toggle.first.click(force=True)
            wait(800)
        cats = {
            "Leader's House": "Housing",
            "House": "Housing",
            "Church": "Community",
            "Farm": "Food",
        }
        cat = cats.get(label)
        if cat:
            cat_btn = page.locator(f'button[aria-label="{cat}"]')
            if cat_btn.count():
                cat_btn.first.click(force=True)
                wait(600)
        wait(600)
        excl = exclude or r"(?!x)x"
        clicked = page.evaluate(
            """([label, excl]) => {
                const btns = [...document.querySelectorAll('.build-panel button')];
                const target = btns.find(b => {
                    const t = b.innerText || '';
                    return t.includes(label) && !new RegExp(excl).test(t);
                });
                if (!target) return false;
                target.click();
                return true;
            }""",
            [label, excl],
        )
        if not clicked:
            log(f"[FAIL] {step}: no catalog button '{label}'")
            return False
        wait(800)
        snap(f"placing_{label}")
        return True

    # 1) Leader's House
    if pick_building("Leader's House", "pick Leader's House"):
        click_canvas(0, -190, "place Leader's House")
    # 2) Church
    if pick_building("Church", "pick Church"):
        click_canvas(190, 40, "place Church")
    # 3) Farm
    if pick_building("Farm", "pick Farm"):
        click_canvas(-190, 40, "place Farm")
    # 4) extra Houses x2 for pop cap
    for i, (dx, dy) in enumerate([(0, -300), (190, -190)]):
        if pick_building("House", f"pick House {i}", exclude=r"Leader|Mansion"):
            click_canvas(dx, dy, f"place House {i}")
    # exit build mode
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    wait(1500)
    snap("builds_placed")

    # recruit settlers over a few days
    try_click_role("Village", "tab Village")
    try_click_role("Population", "open Population section", 8000)
    recruits = 0
    for i in range(6):
        btn = page.get_by_role("button", name="Recruit Settler")
        try:
            if btn.count() and btn.first.is_enabled():
                btn.first.click(timeout=3000, force=True)
                recruits += 1
                wait(1500)
        except Exception:
            break
    log(f"[info] recruited {recruits} settlers")
    OUT["workforce"]["recruited"] = recruits

    # fast-forward until construction completes (leader house ~6d, church 4d)
    log("[info] fast-forwarding ~55s at 10x to complete construction...")
    wait(30000)
    # poll buildings via village stats
    snap("mid_build")

    # attempt to read built state from the DOM (village population stats)
    txt = body_text()
    OUT["workforce"]["post_build_lines"] = [
        ln.strip() for ln in txt.splitlines() if re.search(r"working|idle|cap|beds", ln, re.I)
    ][:10]

    # select Leader's House on canvas -> residents panel
    click_canvas(0, -190, "select Leader's House")
    wait(1000)
    snap("leader_house_selected")
    txt = body_text()
    OUT["workforce"]["leader_house_panel"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Leader|Residents|👑|household|moved", ln, re.I)
    ][:12]

    # select the leader citizen -> verify Lives in / Works at
    try_click_role("Families", "open Families", 8000)
    leader_clicked = page.evaluate(
        "() => { const btns = [...document.querySelectorAll('button')]"
        ".filter(b => b.innerText.includes('👑'));"
        " if (btns.length === 0) return false; btns[0].click(); return true; }"
    )
    wait(1500)
    snap("leader_selected")
    txt = body_text()
    OUT["workforce"]["leader_clicked"] = leader_clicked
    OUT["workforce"]["leader_panel"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Village head|Lives in|Works at|No job|No home|👑", ln)
    ][:12]

    # select Church -> manual priest list
    click_canvas(190, 40, "select Church")
    wait(1200)
    snap("church_selected")
    txt = body_text()
    OUT["workforce"]["church_panel"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Workers:|Choose priest|Priest|manual|occupants|/4", ln, re.I)
    ][:15]

    # assign a priest by clicking first "Choose priest" candidate button
    assigned = page.evaluate(
        "() => { const btns = [...document.querySelectorAll('button')]"
        ".filter(b => b.innerText.includes('⛪') || b.className.includes('violet'));"
        " if (btns.length === 0) return false; btns[0].click(); return true; }"
    )
    wait(1500)
    OUT["workforce"]["priest_assigned_click"] = assigned
    snap("church_after_assign")

    txt = body_text()
    OUT["workforce"]["church_after_assign_lines"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Workers:|👷|priest|Priest", ln, re.I)
    ][:12]

    # verify single workplace: select Farm, check workers list for the priest name
    click_canvas(-190, 40, "select Farm")
    wait(1200)
    snap("farm_selected")
    txt = body_text()
    OUT["workforce"]["farm_panel"] = [
        ln.strip() for ln in txt.splitlines()
        if re.search(r"Workers:|👷|Choose worker|Fill workers", ln, re.I)
    ][:12]

    # ---------------- SUMMARY ----------------
    OUT["console_errors"] = ERRORS
    log("=== RESULT ===")
    log(json.dumps(OUT, ensure_ascii=False, indent=2))
    with open("playtest/validation_result.json", "w", encoding="utf-8") as f:
        json.dump(OUT, f, ensure_ascii=False, indent=2)
    browser.close()
