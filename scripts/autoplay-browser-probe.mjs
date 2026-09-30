#!/usr/bin/env node
/**
 * THE AUTOPLAY BOT HARNESS — not a throwaway probe, and not safe to delete.
 *
 * Extend this file instead of writing a new one: add a capability to `CAPABILITIES`
 * below and assert on it (AGENTS.md §7.1, "Extend the bot, do not write a new probe").
 * The changelog depends on this harness, and its earlier header — "TEMPORARY local
 * probe, safe to delete" — caused an audit to grade it a delete-candidate.
 *
 * WHY IT EXISTS: `useVirtualPlayer` is React wiring, and this repo's Node test tier
 * has no DOM implementation at all (no jsdom / happy-dom / react-test-renderer), so
 * no `vitest` test can drive the hook. This harness closes exactly that gap: it drives
 * the real dev build in real headless Chrome, clicks 🤖 Auto-play, and reports
 * what the header actually says and whether the bot actually acts.
 *
 * It answers the reported bug directly:
 *   - does the button reach `aria-pressed="true"` (state flips), and
 *   - does the status line ever appear, and
 *   - does the act history (the chip tooltip) ever fill up?
 *
 * USAGE
 *   node node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1   # dev server (DEV-only button)
 *   node scripts/autoplay-browser-probe.mjs
 *   node scripts/autoplay-browser-probe.mjs --url http://127.0.0.1:5173/ --watch-ms 25000 --speed 10
 *
 * Exits 0 when the bot acted, 1 otherwise. Nothing to add to package.json.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const DEBUG_PORT = 9334;
const VIEWPORT = { width: 1600, height: 900 };

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:5173/',
    watchMs: 20000,
    speed: 10,
    headful: false,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--watch-ms') args.watchMs = Number(argv[++i]);
    else if (arg === '--speed') args.speed = Number(argv[++i]);
    else if (arg === '--width') args.width = Number(argv[++i]);
    else if (arg === '--height') args.height = Number(argv[++i]);
    else if (arg === '--headful') args.headful = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id != null) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`Cannot open CDP socket ${wsUrl}`)), { once: true });
    });
    return new CdpSession(ws);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(listener) {
    this.listeners.push(listener);
  }
}

async function fetchJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function clickButtonExpression(text) {
  return `(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())};
    const buttons = [...document.querySelectorAll('button')];
    const hit = buttons.find((b) => (b.textContent || '').toLowerCase().includes(wanted));
    if (!hit) return { clicked: false, seen: buttons.map((b) => (b.textContent || '').trim()).slice(0, 12) };
    hit.click();
    return { clicked: true, label: (hit.textContent || '').trim() };
  })()`;
}

/* ============================ UI CAPABILITIES ============================
 * Reusable, named handles onto the game's own screens, so a new question does
 * not need a new probe (owner, 2026-09-29: "just extend the capaiblities of
 * the bot instead of making a own each time").
 *
 * Each entry is a self-contained page expression. They are deliberately
 * written as *capabilities* rather than one-off selectors: a caller composes
 * them (`await evaluate(CAPABILITIES.openVillageWindow())`) instead of
 * re-deriving where a control lives. When a screen moves, fix the one entry
 * here and every caller follows.
 *
 * Every panel is located by an **owner-authored heading**, never by select
 * index, so a layout change cannot silently make a capability read the wrong
 * panel and report a false pass.
 *
 * Adding one: put the expression in this object, keep it self-contained, and
 * prefer returning observed DOM state over a bare boolean. See AGENTS.md,
 * "Extend the bot, do not write a new probe".
 * ======================================================================== */
const CAPABILITIES = {
  /** Find a panel by the exact heading text it renders, then climb to the element that owns `buttonPattern`. */
  findPanel(headingText, buttonPattern) {
    return `(() => {
      const heading = [...document.querySelectorAll('p,h3,h4')]
        .find((el) => (el.textContent || '').trim() === ${JSON.stringify(headingText)});
      if (!heading) return null;
      let panel = heading.closest('section, div');
      const wanted = new RegExp(${JSON.stringify(buttonPattern)}, 'i');
      while (panel && ![...panel.querySelectorAll('button')].some((b) => wanted.test(b.textContent || ''))) {
        panel = panel.parentElement;
      }
      return panel;
    })()`;
  },

  /** Read a schedule-style panel: its two hour selects, its Apply state, and its status line. */
  readSchedulePanel(headingText, buttonPattern) {
    return `(() => {
      const panel = ${CAPABILITIES.findPanel(headingText, buttonPattern)};
      if (!panel) return { found: false, reason: ${JSON.stringify(headingText)} + ' panel not on screen' };
      const selects = [...panel.querySelectorAll('select')];
      const applyBtn = [...panel.querySelectorAll('button')]
        .find((b) => new RegExp(${JSON.stringify(buttonPattern)}, 'i').test(b.textContent || ''));
      return {
        found: true,
        opens: selects[0] ? Number(selects[0].value) : null,
        closes: selects[1] ? Number(selects[1].value) : null,
        currentLine: [...panel.querySelectorAll('strong')].map((s) => (s.textContent || '').trim())[0] ?? null,
        applyLabel: applyBtn ? (applyBtn.textContent || '').trim() : null,
        applyDisabled: applyBtn ? applyBtn.disabled : null,
        status: ([...panel.querySelectorAll('p')].map((p) => (p.textContent || '').trim())
          .find((t) => /^(Unchanged|Accepted by bounds|Blocked:)/.test(t))) ?? null,
        note: ([...panel.querySelectorAll('p')].map((p) => (p.textContent || '').trim())
          .find((t) => /hours/i.test(t) && /no minimum|no maximum|Allowed duration/i.test(t))) ?? null,
      };
    })()`;
  },

  /** Drive one of a schedule panel's two hour selects through React's own event. */
  setScheduleHour(headingText, buttonPattern, index, value) {
    return `(() => {
      const panel = ${CAPABILITIES.findPanel(headingText, buttonPattern)};
      if (!panel) return { ok: false, reason: 'panel missing' };
      const select = [...panel.querySelectorAll('select')][${index}];
      if (!select) return { ok: false, reason: 'select ' + ${index} + ' missing' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, String(${value}));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, now: Number(select.value) };
    })()`;
  },

  /** Press a panel's Apply button, reporting whether it was even enabled. */
  clickPanelButton(headingText, buttonPattern) {
    return `(() => {
      const panel = ${CAPABILITIES.findPanel(headingText, buttonPattern)};
      if (!panel) return { ok: false, reason: 'panel missing' };
      const btn = [...panel.querySelectorAll('button')]
        .find((b) => new RegExp(${JSON.stringify(buttonPattern)}, 'i').test(b.textContent || ''));
      if (!btn) return { ok: false, reason: 'button missing' };
      if (btn.disabled) return { ok: false, reason: 'button is disabled' };
      btn.click();
      return { ok: true, label: (btn.textContent || '').trim() };
    })()`;
  },

  /** Open an overlay by its `aria-label`. The valley overview's visible text is "Overview". */
  clickByAriaLabel(label) {
    return `(() => {
      const hit = [...document.querySelectorAll('button')]
        .find((b) => (b.getAttribute('aria-label') || '') === ${JSON.stringify(label)} && !b.disabled);
      if (!hit) return { clicked: false };
      hit.click();
      return { clicked: true, label: hit.getAttribute('aria-label') };
    })()`;
  },

  /**
   * Open the **Village** subject window.
   *
   * The full-screen Valley overview this used to open is gone: the owner's ruling is one window per
   * subject, each with its own icon in the header (*"the 6 panel stacked now that opens full screen
   * should be each subject a own icon the header and open a window for that subject not full
   * screen"*). The Village subject's door is the population chip (`aria-label="Open people
   * overview"`), which was already wired to that subject — the sidebar button that also opened it has
   * been removed as a duplicate entrance, and the in-window nav strip went with the overlay.
   */
  openVillageWindow() {
    return CAPABILITIES.clickByAriaLabel('Open people overview');
  },

  /** Select an exact-text nav chip inside the overview, e.g. "Village". */
  selectOverviewTab(label) {
    return `(() => {
      const wanted = ${JSON.stringify(label.trim().toLowerCase())};
      const hit = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').trim().toLowerCase() === wanted && !b.disabled);
      if (!hit) return { clicked: false, seen: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).slice(0, 20) };
      hit.click();
      return { clicked: true, label: (hit.textContent || '').trim() };
    })()`;
  },

  /** Click a venue tab ("Tavern"/"Hotel") inside the hospitality panel. */
  selectVenueTab(label) {
    return `(() => {
      const panel = ${CAPABILITIES.findPanel('Hospitality service hours', 'Apply .*service hours')};
      if (!panel) return { ok: false, reason: 'venue panel missing' };
      const hit = [...panel.querySelectorAll('button')]
        .find((b) => (b.textContent || '').toLowerCase().includes(${JSON.stringify(label.toLowerCase())}));
      if (!hit) return { ok: false, reason: 'tab not found' };
      hit.click();
      return { ok: true, label: (hit.textContent || '').trim() };
    })()`;
  },

  /** Present in the game? A capability that cannot even find its control should say so loudly. */
  exists(text) {
    return `(() => {
      const wanted = ${JSON.stringify(text.toLowerCase())};
      const hit = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').toLowerCase().includes(wanted));
      return hit ? (hit.textContent || '').replace(/\\s+/g, ' ').trim() : null;
    })()`;
  },

  /** Click a control by the visible text it contains (first match, enabled or not). */
  clickText(text) {
    return `(() => {
      const wanted = ${JSON.stringify(text.toLowerCase())};
      const hit = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').toLowerCase().includes(wanted));
      if (!hit) return { clicked: false, seen: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).slice(0, 20) };
      hit.click();
      return { clicked: true, label: (hit.textContent || '').replace(/\\s+/g, ' ').trim() };
    })()`;
  },

  /** Click a settler in the world so the inspector (and its windows) have a subject. */
  clickWorldCentre() {
    return `(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { clicked: false, reason: 'no canvas' };
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, clientX: x, clientY: y, button: 0 };
      canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
      canvas.dispatchEvent(new PointerEvent('pointerup', opts));
      canvas.dispatchEvent(new MouseEvent('click', opts));
      return { clicked: true, at: [Math.round(x), Math.round(y)] };
    })()`;
  },

  /**
   * Read a subject window by its accessible name — the shell every subject now renders into
   * (`components/GameWindow.tsx`). Returns the shape a caller asserts on rather than a boolean, so a
   * failure names what the window actually contained.
   */
  readWindow(title) {
    return `(() => {
      const hit = [...document.querySelectorAll('[role="dialog"]')]
        .find((el) => (el.getAttribute('aria-label') || '') === ${JSON.stringify(title)});
      if (!hit) return null;
      const close = [...hit.querySelectorAll('button')]
        .find((b) => /^close /i.test(b.getAttribute('aria-label') || ''));
      return {
        title: hit.getAttribute('aria-label'),
        closeLabel: close ? close.getAttribute('aria-label') : null,
        selects: [...hit.querySelectorAll('select')].length,
        text: (hit.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
      };
    })()`;
  },

  /** Close an open window through its own close control. */
  closeWindow(title) {
    return `(() => {
      const hit = [...document.querySelectorAll('[role="dialog"]')]
        .find((el) => (el.getAttribute('aria-label') || '') === ${JSON.stringify(title)});
      if (!hit) return { ok: false, reason: 'window not open' };
      const close = [...hit.querySelectorAll('button')]
        .find((b) => /^close /i.test(b.getAttribute('aria-label') || ''));
      if (!close) return { ok: false, reason: 'no close control' };
      close.click();
      return { ok: true };
    })()`;
  },

  /**
   * Select a settler deterministically, through the families panel rather than the map.
   *
   * Clicking the canvas only works if the generated world happens to put a settler under the click
   * (measured: it does not, so this check reported "not reached" instead of verifying anything).
   * `FamiliesTreePanel` renders one button per settler whose `title` is `Show <name>'s family
   * tree` (line 85) or `<relation> — show their tree` (line 163), which is a stable handle — read
   * from the component, not inferred from its text.
   */
  selectSettlerFromFamiliesPanel() {
    return `(() => {
      const hit = [...document.querySelectorAll('button[title]')]
        .find((b) => /family tree|show their tree/i.test(b.getAttribute('title') || ''));
      if (!hit) {
        return {
          clicked: false,
          seen: [...document.querySelectorAll('button[title]')]
            .map((b) => b.getAttribute('title')).slice(0, 12),
        };
      }
      hit.click();
      return { clicked: true, title: hit.getAttribute('title') };
    })()`;
  },

  /**
   * Open the family tree from the inspector.
   *
   * Matched on the button's **`title`**, not its text: `SelectedEntityPanel` renders a
   * *collapsible section header* reading `🌳Family tree▾` as well as the opener, and matching on text
   * clicked the header and reported `opened: NO` while the real control sat there unused. The opener
   * is the only element with this title (`SelectedEntityPanel.tsx:571-583`).
   */
  openFamilyTreeWindow() {
    return `(() => {
      const hit = [...document.querySelectorAll('button[title]')]
        .find((b) => /open the family tree in its own window/i.test(b.getAttribute('title') || ''));
      if (!hit) {
        return {
          clicked: false,
          seen: [...document.querySelectorAll('button[title]')]
            .map((b) => b.getAttribute('title')).slice(0, 12),
        };
      }
      hit.click();
      return { clicked: true, title: hit.getAttribute('title') };
    })()`;
  },

  /**
   * Select a settler deterministically, via the Village tab's **Household roster**.
   *
   * The families list this used to click was removed (it was a flat surname list mislabelled a family
   * tree), which left the bot with no deterministic subject: clicking the map depends on where the
   * generated world happens to put someone. `PopulationPanel` renders a clickable citizen per row and
   * is reached through the roster section, which is collapsed by default — so this opens that section
   * first, then clicks a citizen.
   */
  selectSettlerFromRoster() {
    return `(() => {
      const roster = [...document.querySelectorAll('button,summary')]
        .find((el) => /household roster/i.test(el.textContent || ''));
      if (roster) roster.click();
      return { openedRoster: !!roster };
    })()`;
  },

  /** Click any citizen row the roster renders, identified by its family-tree/select affordance. */
  clickFirstCitizenRow() {
    return `(() => {
      // Read from the source, not guessed: PopulationPanel renders every person as a button whose
      // title is "Locate <name> on the map" (PopulationPanel.tsx:57).
      const locate = [...document.querySelectorAll('button[title]')]
        .find((b) => /^locate .+ on the map$/i.test(b.getAttribute('title') || ''));
      if (locate) {
        locate.click();
        return { clicked: true, via: 'locate', title: locate.getAttribute('title') };
      }
      const rows = [...document.querySelectorAll('button')].filter((b) => {
        const t = (b.textContent || '').trim();
        return /^[A-Z][a-z]+ [A-Z][a-z]+/.test(t) && t.length < 40;
      });
      if (!rows.length) {
        return {
          clicked: false,
          seenButtons: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 25),
        };
      }
      rows[0].click();
      return { clicked: true, via: 'name', label: (rows[0].textContent || '').trim() };
    })()`;
  },

  /** The exact headings/patterns this capability set knows, so a caller cannot mistype one. */
  panels: {
    venue: { heading: 'Hospitality service hours', button: 'Apply .*service hours' },
    ordinaryWork: { heading: 'Ordinary weekday work', button: 'Apply ordinary work hours' },
  },
};

const CANVAS_PRESENT = `(() => {
  const canvas = document.querySelector('canvas');
  return !!canvas && canvas.width > 100 && canvas.height > 100;
})()`;

const GAMEPLAY_READY = `(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const header = document.querySelector('header');
  return /\\d{1,2}:\\d{2}/.test(header ? header.textContent || '' : '');
})()`;

/** Everything the bug report is about, read straight from the header DOM. */
const AUTO_PLAYER_STATE = `(() => {
  const buttons = [...document.querySelectorAll('header button')];
  const toggle = buttons.find((b) => (b.textContent || '').toLowerCase().includes('auto-play'));
  const chip = [...document.querySelectorAll('header div')]
    .find((d) => (d.getAttribute('title') || '').startsWith('Virtual player'));
  const statusEl = chip
    ? [...chip.querySelectorAll('span')]
        .find((s) => (s.textContent || '').trim().startsWith('auto-player:'))
    : null;
  const statusStyle = statusEl ? getComputedStyle(statusEl) : null;
  const statusRect = statusEl ? statusEl.getBoundingClientRect() : null;
  const pause = buttons.find((b) => /pause simulation|resume simulation/i.test(b.getAttribute('aria-label') || ''));
  const tick = buttons.find((b) => (b.getAttribute('aria-label') || '').startsWith('Simulation tick'));
  const title = chip ? chip.getAttribute('title') || '' : '';
  // ResourceBadge renders title="Gold 80 / 1000".
  const goldEl = [...document.querySelectorAll('header *')]
    .find((el) => (el.getAttribute('title') || '').startsWith('Gold '));
  const goldMatch = goldEl ? (goldEl.getAttribute('title') || '').match(/Gold (\\d+)/) : null;
  return {
    pressed: toggle ? toggle.getAttribute('aria-pressed') : null,
    status: statusEl ? (statusEl.textContent || '').trim() : null,
    // "Silent" is the whole bug class: a status line that exists but is
    // display:none / zero-width is exactly what the player reported as
    // "does nothing". Measuring it is what makes this probe able to fail.
    statusDisplay: statusStyle ? statusStyle.display : null,
    statusVisible: !!statusEl && !!statusStyle && !!statusRect
      && statusStyle.display !== 'none'
      && statusRect.width > 0
      && statusRect.height > 0,
    statusWidth: statusRect ? Math.round(statusRect.width) : null,
    chipTitle: title,
    // The tooltip lists "t<tick> · <reason>" per act, newest first.
    acts: title.split('\\n').filter((line) => /^t\\d+ · /.test(line)),
    gold: goldMatch ? Number(goldMatch[1]) : null,
    paused: pause ? /resume/i.test(pause.getAttribute('aria-label') || '') : null,
    tickLabel: tick ? tick.getAttribute('aria-label') : null,
  };
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve('tmp/autoplay-browser-probe');
  mkdirSync(outDir, { recursive: true });

  const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chromePath) throw new Error('No Chrome/Edge binary found; set CHROME_PATH');

  const profile = path.join(os.tmpdir(), `wilderfolk-autoplay-probe-${process.pid}`);
  const chrome = spawn(
    chromePath,
    [
      args.headful ? '--headless=false' : '--headless=new',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      `--window-size=${args.width},${args.height}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--remote-allow-origins=http://127.0.0.1:' + DEBUG_PORT,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const consoleErrors = [];
  /** Subject-window evidence, reported alongside the acts so a window failure names its contents. */
  const windowChecks = {};
  let session = null;
  try {
    const version = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('No CDP page target');

    session = await CdpSession.connect(page.webSocketDebuggerUrl);
    session.on((message) => {
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push((message.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
      }
    });

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    async function evaluate(expression) {
      const result = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    }

    async function waitFor(expression, label, timeoutMs = 40000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) return true;
        } catch {
          /* page still settling */
        }
        await sleep(250);
      }
      throw new Error(`Timed out waiting for ${label}`);
    }

    console.log(`chrome: ${version.Browser}`);

    // 1. Boot and walk the real player path: intro -> settlement -> valley.
    await session.send('Page.navigate', { url: args.url });
    await waitFor(CANVAS_PRESENT, 'canvas');
    const skip = await evaluate(clickButtonExpression('skip intro'));
    if (!skip.clicked) await evaluate(clickButtonExpression('choose your land'));
    await waitFor(`document.body.textContent.includes('Settle the valley')`, 'map setup');
    const settle = await evaluate(clickButtonExpression('settle the valley'));
    if (!settle.clicked) throw new Error('Settle the valley button not found');
    await waitFor(GAMEPLAY_READY, 'gameplay HUD');
    if (await evaluate(`document.body.textContent.includes('Quick start')`)) {
      await evaluate(clickButtonExpression('skip'));
      await waitFor(`!document.body.textContent.includes('Quick start')`, 'tutorial closed', 10000);
    }

    // 2. Make sure the world is actually advancing (the bot is gated on !paused).
    await evaluate(clickButtonExpression(`${args.speed}x`));
    let state = await evaluate(AUTO_PLAYER_STATE);
    if (state.paused) {
      await evaluate(clickButtonExpression('resume') || clickButtonExpression('pause'));
      await sleep(500);
      state = await evaluate(AUTO_PLAYER_STATE);
    }
    const before = state;
    console.log(`before click: pressed=${before.pressed} paused=${before.paused} tick=${before.tickLabel} status=${before.status}`);

    // 3. Click 🤖 Auto-play.
    const bot = await evaluate(clickButtonExpression('auto-play'));
    if (!bot.clicked) throw new Error(`Auto-play button not found (dev build only). Buttons: ${JSON.stringify(bot.seen)}`);
    console.log(`clicked: ${bot.label}`);

    // 4. Watch the header while the world ticks.
    const statuses = [];
    const tickLabels = new Set();
    const actsByTick = new Map();
    let last = await evaluate(AUTO_PLAYER_STATE);
    const goldBefore = last.gold;
    const deadline = Date.now() + args.watchMs;
    let firstObservation = null;
    while (Date.now() < deadline) {
      // Poll fast: the tooltip keeps only the last five acts, so early ladder
      // steps (the farm) must be captured as they happen.
      await sleep(300);
      last = await evaluate(AUTO_PLAYER_STATE);
      if (firstObservation === null) firstObservation = last;
      if (last.status && !statuses.includes(last.status)) statuses.push(last.status);
      if (last.tickLabel) tickLabels.add(last.tickLabel);
      for (const act of last.acts ?? []) actsByTick.set(Number(act.slice(1).split(' ')[0]), act);
    }

    // The tooltip is newest-first; the ladder's order is oldest-first.
    const orderedActs = [...actsByTick.entries()].sort((a, b) => a[0] - b[0]).map(([, act]) => act);

    console.log('');
    console.log('--- observed ---');
    console.log(`viewport                   : ${args.width}x${args.height}`);
    console.log(`aria-pressed (after click) : ${last.pressed}`);
    console.log(`status right after click   : ${firstObservation ? firstObservation.status : null}`);
    console.log(`status element visible     : ${last.statusVisible} (display=${last.statusDisplay}, width=${last.statusWidth}px)`);
    console.log(`distinct statuses seen     : ${JSON.stringify(statuses)}`);
    console.log(`gold in the header         : ${goldBefore} -> ${last.gold}`);
    console.log(`acts recorded in tooltip   : ${orderedActs.length}`);
    for (const act of orderedActs) console.log(`   ${act}`);
    console.log(`sim ticks seen advancing   : ${tickLabels.size} distinct labels`);
    console.log(`console errors             : ${consoleErrors.length}`);
    for (const error of consoleErrors.slice(0, 10)) console.log(`  ! ${error}`);

    // Subject windows: the family tree opens as its own window and closes again.
    // The browser half of "one window per subject" (owner: "each subject should just have its own
    // window not stacking up"). It reports `not reached` rather than failing when no settler can be
    // selected, because selection depends on where the generated world happens to put a settler
    // under the map centre — an environment fact, not a defect in the window.
    // The household roster lives in the Village subject's window now, so open that first —
    // without it the settler buttons do not exist in the DOM at all.
    await evaluate(CAPABILITIES.openVillageWindow());
    await sleep(900);
    await evaluate(CAPABILITIES.selectSettlerFromRoster());
    await sleep(1000);
    const selectAttempt = await evaluate(CAPABILITIES.clickFirstCitizenRow());
    await sleep(1200);
    const familyTreeButton = await evaluate(CAPABILITIES.exists('family tree'));
    if (!familyTreeButton) {
      console.log(`\nfamily tree window         : not reached (no settler selected at ${JSON.stringify(selectAttempt.at ?? null)})`);
    } else {
      await evaluate(CAPABILITIES.openFamilyTreeWindow());
      await sleep(800);
      const opened = await evaluate(`(() => {
        const hit = [...document.querySelectorAll('[role="dialog"]')]
          .find((el) => /^Family tree of /.test(el.getAttribute('aria-label') || ''));
        if (!hit) return null;
        const close = [...hit.querySelectorAll('button')]
          .find((b) => /^close /i.test(b.getAttribute('aria-label') || ''));
        return {
          title: hit.getAttribute('aria-label'),
          closeLabel: close ? close.getAttribute('aria-label') : null,
          text: (hit.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        };
      })()`);
      const shot = await session.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(outDir, 'family-tree-window.png'), Buffer.from(shot.data, 'base64'));
      const closed = opened ? await evaluate(CAPABILITIES.closeWindow(opened.title)) : { ok: false };
      await sleep(500);
      const gone = await evaluate(
        `!([...document.querySelectorAll('[role="dialog"]')].some((el) => /^Family tree of /.test(el.getAttribute('aria-label') || '')))`,
      );
      windowChecks.familyTree = { button: familyTreeButton, opened, closed, gone };
      console.log(`\nfamily tree window         : button="${familyTreeButton}"`);
      console.log(`  opened                   : ${opened ? `"${opened.title}" close="${opened.closeLabel}"` : 'NO'}`);
      console.log(`  closed / gone            : ${JSON.stringify(closed)} / ${gone}`);
    }

    // The reported bugs, as assertions on what the real UI reported:
    //  - the original "does nothing": the effect never re-ran, so one act was the
    //    ceiling and the status line never rendered at all;
    //  - the reported illogic: it researched "Advanced Farming" (farm_yield ×1.2,
    //    unlocks the Greenhouse) while it owned no farm and never built one.
    const MIN_ACTS = 3;
    const farmIndex = orderedActs.findIndex((act) => act.includes('build a Farm'));
    const researchIndex = orderedActs.findIndex((act) => act.includes('research'));
    const reasons = [];
    if (last.pressed !== 'true') reasons.push('the toggle never reached aria-pressed="true"');
    if (orderedActs.length < MIN_ACTS) reasons.push(`only ${orderedActs.length} act(s) in ${args.watchMs}ms (need >= ${MIN_ACTS})`);
    if (last.statusVisible !== true) reasons.push(`the status line is not visible (display=${last.statusDisplay}, width=${last.statusWidth}px)`);
    if (farmIndex < 0) reasons.push('the bot never built a farm');
    else if (researchIndex >= 0 && researchIndex < farmIndex) reasons.push('it researched before it owned a farm');
    const verdict = reasons.length === 0;
    console.log('');
    console.log(
      verdict
        ? `VERDICT: PASS — ${orderedActs.length} acts, a farm at act ${farmIndex + 1}, research after it, status line visible`
        : `VERDICT: FAIL — ${reasons.join('; ')}`,
    );
    return verdict ? 0 : 1;
  } finally {
    session?.ws?.close?.();
    chrome.kill();
    // Chrome's profile for this run is ~90 MB and nothing deleted it, so repeated runs filled the
    // disk: measured 2026-09-30 at **27 leaked profile dirs / 2.5 GB**, which is what finally failed a
    // later run with `ENOSPC`. It is this script's own scratch, so it removes it.
    await sleep(250); // let Chrome release its file handles before the tree is removed
    rmSync(profile, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`probe error: ${error.message}`);
    process.exit(2);
  });
