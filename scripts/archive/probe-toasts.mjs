#!/usr/bin/env node
/**
 * Probe: do notification toasts reach the DOM at all?
 *
 * Boots the production build in a real headless Chrome, walks the real player
 * path (intro -> settle -> dismiss quick start), then samples the notification
 * container (`div[aria-live="polite"] > button`) continuously while the world
 * runs, and reports every toast it ever saw, plus the HUD population so we can
 * tell whether settlers actually joined.
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const DEBUG_PORT = 9341;
const PORT = 4331;
const VIEWPORT = { width: 1600, height: 900 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  on(listener) { this.listeners.push(listener); }
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

async function fetchJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForHttp(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function clickButtonExpression(text) {
  return `(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())};
    const hit = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').toLowerCase().includes(wanted));
    if (!hit) return { clicked: false };
    hit.click();
    return { clicked: true, label: (hit.textContent || '').trim() };
  })()`;
}

/** Every toast currently in the notification container, with its position/size. */
const TOASTS = `(() => {
  const nodes = [...document.querySelectorAll('div[aria-live="polite"] > button')];
  return nodes.map((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      title: (b.querySelector('span')?.textContent || '').trim(),
      text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05,
    };
  });
})()`;

const HUD_STATE = `(() => {
  const header = document.querySelector('header');
  if (!header) return null;
  const text = (header.textContent || '').replace(/\\s+/g, ' ');
  const date = text.match(/Y(\\d+)\\s*D(\\d+)/);
  const people = text.match(/\\u{1F465}\\s*(\\d+)\\/(\\d+)/u);
  const clock = text.match(/(\\d{2}):(\\d{2})/);
  return { text: text.slice(0, 120), year: date ? Number(date[1]) : null, day: date ? Number(date[2]) : null, clock: clock ? clock[0] : null, pop: people ? Number(people[1]) : null };
})()`;

const EVENT_LOG_COUNT = `(() => document.querySelectorAll('[data-event-log-row], .event-log-row, li').length)()`;

async function main() {
  const serverProcess = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'ignore', shell: process.platform === 'win32',
  });
  const chromeProfile = path.join(os.tmpdir(), `wf-toast-probe-${process.pid}`);
  let chromeProcess = null;
  let session = null;
  try {
    const url = `http://127.0.0.1:${PORT}/`;
    await waitForHttp(url);

    const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!chromePath) throw new Error('No Chrome/Edge binary found; set CHROME_PATH');
    chromeProcess = spawn(chromePath, [
      '--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--user-data-dir=${chromeProfile}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--remote-allow-origins=http://127.0.0.1:${DEBUG_PORT}`,
      'about:blank',
    ], { stdio: 'ignore' });

    await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    session = await CdpSession.connect(page.webSocketDebuggerUrl);
    const consoleErrors = [];
    session.on((message) => {
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push((message.params.args || []).map((a) => String(a.value ?? a.description ?? '')).join(' '));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
    });

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression) => {
      const result = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try { if (await evaluate(expression)) return true; } catch { /* retry */ }
        await sleep(200);
      }
      return false;
    };

    await session.send('Page.navigate', { url });
    await waitFor(`document.querySelector('canvas') != null`, 20000);
    await sleep(1200);
    const skip = await evaluate(clickButtonExpression('skip intro'));
    if (!skip.clicked) await evaluate(clickButtonExpression('choose your land'));
    await waitFor(`document.body.textContent.includes('Settle the valley')`, 15000);
    await evaluate(clickButtonExpression('settle the valley'));
    await waitFor(`(() => { const h = document.querySelector('header'); return h && /\\d{1,2}:\\d{2}/.test(h.textContent || ''); })()`, 40000);
    if (await evaluate(`document.body.textContent.includes('Quick start')`)) {
      await evaluate(clickButtonExpression('skip'));
    }
    await sleep(1000);

    // Play fast so several colony days (and therefore several notifications) pass.
    const speed = process.env.PROBE_SPEED ?? '10x';
    const speedClicked = await evaluate(`(() => {
      const hit = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === ${JSON.stringify(speed)});
      if (!hit) return { clicked: false };
      hit.click();
      return { clicked: true };
    })()`);
    console.log('speed click:', JSON.stringify(speedClicked));

    // Sample continuously for N seconds of real play.
    const seconds = Number(process.env.PROBE_SECONDS ?? 150);
    const seen = new Map();
    let samples = 0;
    let samplesWithToasts = 0;
    const started = Date.now();
    let hud = null;
    while (Date.now() - started < seconds * 1000) {
      let toasts = [];
      try { toasts = await evaluate(TOASTS); } catch { /* transient */ }
      samples++;
      if (toasts.length > 0) samplesWithToasts++;
      for (const t of toasts) {
        const key = t.text;
        const entry = seen.get(key) ?? { first: ((Date.now() - started) / 1000).toFixed(1), last: null, count: 0, visible: t.visible, rect: t.rect };
        entry.count++;
        entry.last = ((Date.now() - started) / 1000).toFixed(1);
        entry.visible = entry.visible && t.visible;
        entry.rect = t.rect;
        seen.set(key, entry);
      }
      if (samples % 10 === 0) {
        hud = await evaluate(HUD_STATE).catch(() => null);
      }
      await sleep(150);
    }

    console.log('--- toast probe result ---');
    console.log(`duration: ${((Date.now() - started) / 1000).toFixed(0)}s, samples: ${samples}, samples with toasts: ${samplesWithToasts}`);
    console.log('final HUD:', JSON.stringify(hud));
    console.log(`distinct toasts seen: ${seen.size}`);
    for (const [text, entry] of seen) {
      console.log(`  [${entry.first}s..${entry.last}s] x${entry.count} visible=${entry.visible} rect=${JSON.stringify(entry.rect)} :: ${text}`);
    }
    console.log('console errors:', consoleErrors.length);
    for (const error of consoleErrors.slice(0, 10)) console.log('  ', error);
    return 0;
  } finally {
    session?.close();
    chromeProcess?.kill();
    serverProcess.kill();
    // Chrome's profile for this run is ~90 MB and nothing deleted it, so repeated runs filled the
    // disk. `autoplay-browser-probe.mjs` hit the same leak first and fixed it this way (measured
    // 2026-09-30 at 27 leaked profile dirs / 2.5 GB, which failed a later run with ENOSPC). This
    // script owns its own scratch, so it removes it too.
    await sleep(250); // let Chrome release its file handles before the tree is removed
    rmSync(chromeProfile, { recursive: true, force: true });
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
